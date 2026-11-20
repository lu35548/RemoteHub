// 票 #50 数据导入导出 integration:导出形状(指纹口径/无 passwordHash/含 status/审计不含)/
// 幂等重导(update 分支不动既有密码;updatedAt/lastActiveAt/totpSecret 恒等恢复——review F6/spec-2)/
// 全链路等价(导出→清库→导入:密文字面+可解密/依赖链/members/users 除 passwordHash 皆恒等——
// review spec-2① 口径收窄:导出物本无 passwordHash,其余字段全部逐字段等价)/
// 指纹不匹配 422 / 形状与悬空引用 422 无落库(含 requiredVpnId 悬空——review F10)/
// >1mb 大 body(parser 预挂锁死)/ 程序化审计行(SYSTEM_BACKUP/RESTORE 成败皆记,detail 不含密文)/
// review 修复批:CL>50mb 预检 413(F1)/ sanitization 豁免 roundtrip 恒等(F3)/
// 环依赖两阶段回填(F2)/ 枚举运行时校验 422(F7)/ 审计 detail 脱敏(F5)/ 2FA 用户 roundtrip(spec-2③)
// 「清库」口径:保留操作者 admin(seed admin 是 authMiddleware 的活凭证,删了 import 本身 401;
// 真机验收同款——操作者不能删自己),文件内 admin 走 update 分支。
process.env.RATE_LIMIT_LOGIN_MAX = '1000';
import request from 'supertest';
import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;
let adminToken = '';
let adminId = '';
let userToken = '';
let userId = '';

let projAId = ''; // active 项目:3 连接(VPN 依赖链 + 2 条带密码)
let projBId = ''; // archived 项目(#47 status 字段导出)

const PLAIN_A = 'Imp0rt@TestA'; // 导出前明文,导入后 decrypt 一致(AC「密码可解密一致」)
const PLAIN_B = 'Imp0rt@TestB';

/** 期望指纹(口径锁死:base64 解码后字节的 SHA-256 前 8 hex) */
function expectedFingerprint(): string {
  const decoded = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');
  return crypto.createHash('sha256').update(decoded).digest('hex').slice(0, 8);
}

async function apiExport(token: string) {
  return request(b.app).post('/api/v1/admin/export').set('Authorization', `Bearer ${token}`).send({});
}

async function apiImport(token: string, body: unknown) {
  return request(b.app).post('/api/v1/admin/import').set('Authorization', `Bearer ${token}`).send(body as object);
}

/** 业务清库(保留操作者 admin);audit_logs 孤儿行由 userId SetNull 语义兜底,不断言 */
async function wipeBusinessData(): Promise<void> {
  await b.prisma.projectMember.deleteMany();
  await b.prisma.connection.deleteMany();
  await b.prisma.project.deleteMany();
  await b.prisma.user.deleteMany({ where: { id: { not: adminId } } });
}

/** 审计计数(action 过滤,勿裸 total——beforeAll 登录落 AUTH_LOGIN 行) */
async function auditCount(action: string, result?: string): Promise<number> {
  return b.prisma.auditLog.count({ where: result ? { action, result } : { action } });
}

beforeAll(async () => {
  b = await setupServerWithDb();
  const admin = await b.prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  adminId = admin.id;
  adminToken = b.adminToken;

  // 普通用户(403 门禁 + member 造数)
  const uniq = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
  const reg = await request(b.app).post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ username: `eximp${uniq}`, password: 'Member123!', nickname: '导入导出用户' });
  expect(reg.status).toBe(201);
  const login = await request(b.app).post('/api/v1/auth/login')
    .send({ username: `eximp${uniq}`, password: 'Member123!' });
  userToken = login.body.data.accessToken as string;
  userId = login.body.data.user.id as string;

  // projA:API 建(active 默认),user1 入组 editor
  const src = await request(b.app).post('/api/v1/projects')
    .set('Authorization', `Bearer ${userToken}`).send({ name: `导入源项目-${uniq}`, description: '导出等价验据', icon: 'server' });
  expect(src.status).toBe(201);
  projAId = src.body.data.id as string;
  // createProject API 事务内自动加创建者为 owner(不再直建 member——复合 unique 撞车)

  // projB:直建 archived(#47 status 导出验据)
  const projB = await b.prisma.project.create({
    data: { name: `导入归档项目-${uniq}`, status: 'archived', createdBy: userId, updatedBy: userId },
  });
  projBId = projB.id;

  // 连接三件套:VPN(依赖锚点)+ A(密码+依赖 VPN+notes/tags)+ B(密码独立)
  const mk = async (body: Record<string, unknown>) => {
    const res = await request(b.app).post('/api/v1/connections')
      .set('Authorization', `Bearer ${userToken}`).send({ projectId: projAId, ...body });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; name: string };
  };
  const vpn = await mk({ name: 'ExVpn', host: 'vpn.example.com', username: 'vpnop', protocol: 'VPN', vpnType: 'SSL_VPN', vpnLoginUrl: 'https://vpn.example.com' });
  await mk({ name: 'ExA', host: 'a.example.com', username: 'opa', password: PLAIN_A, protocol: 'SSH', tags: 'prod,core', notes: '导入备注', requiredVpnId: vpn.id });
  await mk({ name: 'ExB', host: 'b.example.com', username: 'opb', password: PLAIN_B, protocol: 'HTTPS' });
}, 180_000);

afterAll(async () => {
  await teardownServerWithDb(b);
});

describe('门禁:POST /api/v1/admin/export 与 /import', () => {
  it('未认证 → 401(两端点)', async () => {
    expect((await request(b.app).post('/api/v1/admin/export').send({})).status).toBe(401);
    expect((await request(b.app).post('/api/v1/admin/import').send({})).status).toBe(401);
  });

  it('普通用户 → 403(两端点)', async () => {
    expect((await apiExport(userToken)).status).toBe(403);
    expect((await apiImport(userToken, { version: 1 })).status).toBe(403);
  });
});

describe('POST /api/v1/admin/export(导出形状)', () => {
  let data: Record<string, unknown>;

  it('admin → 200,version/exportedAt/fingerprint 口径全中', async () => {
    const res = await apiExport(adminToken);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    data = res.body.data as Record<string, unknown>;
    expect(data.version).toBe(1);
    expect(typeof data.exportedAt).toBe('string');
    expect(Number.isNaN(Date.parse(data.exportedAt as string))).toBe(false);
    expect(data.encryptionKeyFingerprint).toBe(expectedFingerprint());
  });

  it('users 无 passwordHash 键(票面红线),其余字段齐', () => {
    const users = data.users as Array<Record<string, unknown>>;
    expect(users.length).toBeGreaterThanOrEqual(2); // admin + 普通用户
    for (const u of users) {
      expect('passwordHash' in u).toBe(false);
      expect(typeof u.username).toBe('string');
      expect(typeof u.twoFactorEnabled).toBe('boolean');
    }
  });

  it('projects 含 #47 status(projB=archived 在列);connections 密文 v1: 形态+依赖链+审计不含', () => {
    const projects = data.projects as Array<Record<string, unknown>>;
    expect(projects.length).toBe(2);
    const statuses = projects.map((p) => p.status).sort();
    expect(statuses).toEqual(['active', 'archived']);

    const conns = data.connections as Array<Record<string, unknown>>;
    expect(conns.length).toBe(3);
    for (const c of conns) {
      if (typeof c.encryptedPass === 'string') {
        expect((c.encryptedPass as string).startsWith('v1:')).toBe(true); // AES-256-GCM 四段密文
      }
    }
    // VPN 依赖链原 id 保留
    const vpn = conns.find((c) => c.name === 'ExVpn');
    const connA = conns.find((c) => c.name === 'ExA');
    expect(vpn).toBeDefined();
    expect(connA?.requiredVpnId).toBe((vpn as { id: string }).id);

    // 「审计不含」:导出文件无 auditLogs 键
    expect('auditLogs' in data).toBe(false);
    expect('audit' in data).toBe(false);
  });

  it('members 含 user1 的 owner 记录(建项目自动入组)', () => {
    const members = data.members as Array<Record<string, unknown>>;
    const m = members.find((x) => x.userId === userId);
    expect(m).toBeDefined();
    expect(m?.role).toBe('owner');
    expect(m?.projectId).toBe(projAId);
  });
});

describe('POST /api/v1/admin/import(幂等重导:update 分支不动既有密码)', () => {
  it('同库直接重导 → 200,全 update 零 create,counts 稳定;user1 passwordHash 前后一致', async () => {
    const exported = (await apiExport(adminToken)).body.data as Record<string, unknown>;

    const hashBefore = (await b.prisma.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash;
    const r1 = await apiImport(adminToken, exported);
    expect(r1.status).toBe(200);
    const result = r1.body.data as { projects: number; connections: number; members: number; usersCreated: number; usersUpdated: number; usersRequirePasswordReset: string[] };
    expect(result.projects).toBe(2);
    expect(result.connections).toBe(3);
    expect(result.members).toBe(1);
    expect(result.usersCreated).toBe(0);
    expect(result.usersUpdated).toBe((exported.users as unknown[]).length);
    expect(result.usersRequirePasswordReset).toEqual([]);

    // 幂等:再导一次 counts 不变
    const r2 = await apiImport(adminToken, exported);
    expect(r2.status).toBe(200);
    expect(r2.body.data).toEqual(result);

    // update 分支密码保持(安全语义锁死)
    const hashAfter = (await b.prisma.user.findUniqueOrThrow({ where: { id: userId } })).passwordHash;
    expect(hashAfter).toBe(hashBefore);

    // review F6:updatedAt 恒等——重导显式恢复导出时刻的 updatedAt(@updatedAt 不被导入刷新;
    // users/projects/connections 三处,锚点=导出文件值,r1/r2 重导也不漂移)
    const expUser1 = (exported.users as Array<{ id: string; updatedAt: string }>).find((u) => u.id === userId)!;
    const expProjA = (exported.projects as Array<{ id: string; updatedAt: string }>).find((p) => p.id === projAId)!;
    const expConnA = (exported.connections as Array<{ name: string; updatedAt: string }>).find((c) => c.name === 'ExA')!;
    await apiImport(adminToken, exported);
    expect((await b.prisma.user.findUniqueOrThrow({ where: { id: userId } })).updatedAt.toISOString()).toBe(expUser1.updatedAt);
    expect((await b.prisma.project.findUniqueOrThrow({ where: { id: projAId } })).updatedAt.toISOString()).toBe(expProjA.updatedAt);
    expect((await b.prisma.connection.findFirstOrThrow({ where: { name: 'ExA' } })).updatedAt.toISOString()).toBe(expConnA.updatedAt);
  });
});

describe('全链路等价:导出→清库→导入(AC)', () => {
  it('导出→清库(保留 admin)→导入→逐表等价+密码可解密一致', async () => {
    const exported = (await apiExport(adminToken)).body.data as Record<string, unknown>;

    await wipeBusinessData();

    const res = await apiImport(adminToken, exported);
    expect(res.status).toBe(200);
    const result = res.body.data as { usersCreated: number; usersRequirePasswordReset: string[] };
    // admin 保留(操作者)走 update;其余用户全新建 → 占位密码
    expect(result.usersCreated).toBe((exported.users as unknown[]).length - 1);
    const resetList = result.usersRequirePasswordReset as string[];
    const exportedUsernames = (exported.users as Array<{ username: string }>).map((u) => u.username);
    expect([...resetList].sort()).toEqual(exportedUsernames.filter((n) => n !== 'admin').sort());

    // ── projects 等价(status/icon/description)──
    const dbProjects = await b.prisma.project.findMany();
    expect(dbProjects.length).toBe(2);
    const dbProjA = dbProjects.find((p) => p.id === projAId)!;
    const dbProjB = dbProjects.find((p) => p.id === projBId)!;
    expect(dbProjA.status).toBe('active');
    expect(dbProjA.icon).toBe('server');
    expect(dbProjB.status).toBe('archived');

    // ── connections:密文字面等价 + VPN 依赖链等价 + notes/tags ──
    const dbConns = await b.prisma.connection.findMany();
    expect(dbConns.length).toBe(3);
    const expConns = exported.connections as Array<Record<string, unknown>>;
    const expConnA = expConns.find((c) => c.name === 'ExA') as Record<string, unknown>;
    const dbConnA = dbConns.find((c) => c.name === 'ExA')!;
    const expVpn = expConns.find((c) => c.name === 'ExVpn') as Record<string, unknown>;
    const dbVpn = dbConns.find((c) => c.name === 'ExVpn')!;
    expect(dbConnA.encryptedPass).toBe(expConnA.encryptedPass); // 密文字文原样
    expect(dbConnA.notes).toBe(expConnA.notes);
    expect(dbConnA.tags).toBe(expConnA.tags);
    expect(dbVpn.requiredVpnId).toBeNull();
    expect(dbConnA.requiredVpnId).toBe(expVpn.id); // 依赖链两阶段回填

    // ── AC「密码可解密一致」:同代 decrypt(server 代)──
    const encryption = await import('../../utils/encryption.js');
    expect(encryption.decrypt(dbConnA.encryptedPass!)).toBe(PLAIN_A);
    expect(encryption.decrypt(dbConns.find((c) => c.name === 'ExB')!.encryptedPass!)).toBe(PLAIN_B);

    // ── members 等价 ──
    const dbMembers = await b.prisma.projectMember.findMany();
    expect(dbMembers.length).toBe(1);
    expect(dbMembers[0]!.userId).toBe(userId);
    expect(dbMembers[0]!.role).toBe('owner');

    // ── users 等价(除 passwordHash 外逐字段恒等——review spec-2①:豁免清单只剩 passwordHash)──
    const expUsers = exported.users as Array<Record<string, unknown>>;
    const dbUsers = await b.prisma.user.findMany();
    expect(dbUsers.length).toBe(expUsers.length);
    for (const eu of expUsers) {
      const du = dbUsers.find((u) => u.id === eu.id)!;
      expect(du.username).toBe(eu.username);
      expect(du.nickname).toBe(eu.nickname);
      expect(du.role).toBe(eu.role);
      expect(du.isActive).toBe(eu.isActive);
      expect(du.twoFactorEnabled).toBe(eu.twoFactorEnabled);
      // review spec-2②:时间戳与 2FA 密文也恒等搬运(lastActiveAt 此前无断言盲区)
      expect(du.createdAt.toISOString()).toBe(eu.createdAt);
      expect(du.updatedAt.toISOString()).toBe(eu.updatedAt);
      expect(du.lastActiveAt?.toISOString() ?? null).toBe(eu.lastActiveAt);
      expect(du.totpSecret).toBe(eu.totpSecret);
    }
    // 非 admin 用户密码为占位(随机,与导出前 hash 不同——导出文件本无 hash 可还原)
    const dbUser1 = dbUsers.find((u) => u.id === userId)!;
    const expUser1 = expUsers.find((u) => u.id === userId)!;
    expect('passwordHash' in expUser1).toBe(false);
    expect(dbUser1.passwordHash).not.toBe(''); // 占位 hash 已落库
    // admin(操作者,保留)密码保持:清库导入后原密码仍可登录(端到端证据)
    const adminRelogin = await request(b.app).post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'Admin123456!' });
    expect(adminRelogin.status).toBe(200);
  });

  it('占位密码不可登录:导入重建用户旧密码 401(须走 admin 重置流程恢复访问)', async () => {
    // 占位密码语义:用户须走 admin 重置流程恢复访问,占位 hash 不应匹配任何可预测密码
    const uname = (await b.prisma.user.findUniqueOrThrow({ where: { id: userId } })).username;
    const login = await request(b.app).post('/api/v1/auth/login')
      .send({ username: uname, password: 'Member123!' });
    expect(login.status).toBe(401);
  });

  it('2FA 用户 roundtrip(review spec-2③):twoFactorEnabled+totpSecret 密文字面恒等', async () => {
    // Prisma 直造 2FA 绑定(totpSecret=AES-256-GCM 密文)——绑定流程本身由 mfa.integration 覆盖,
    // 此处只验证 #50 的搬运语义:密文字文原样、开关状态不丢
    const encryption = await import('../../utils/encryption.js');
    const secretPlain = 'JBSWY3DPEHPK3PXP';
    await b.prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: true, totpSecret: encryption.encrypt(secretPlain) },
    });

    const exported = (await apiExport(adminToken)).body.data as Record<string, unknown>;
    const expUser = (exported.users as Array<Record<string, unknown>>).find((u) => u.id === userId)!;
    expect(expUser.twoFactorEnabled).toBe(true);
    const expSecret = expUser.totpSecret as string;
    expect(typeof expSecret).toBe('string');
    expect(expSecret.startsWith('v1:')).toBe(true);

    await wipeBusinessData();
    const res = await apiImport(adminToken, exported);
    expect(res.status).toBe(200);

    const dbUser = await b.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(dbUser.twoFactorEnabled).toBe(true);
    expect(dbUser.totpSecret).toBe(expSecret); // 密文字面一致(不重加密)
    expect(encryption.decrypt(dbUser.totpSecret!)).toBe(secretPlain); // 同 KEY 下可解密还原
  });
});

describe('导入校验失败路径(422 VAL_001,无落库)', () => {
  it('指纹不匹配 → 422 VAL_001;事务零落库(projects 仍空)', async () => {
    const exported = (await apiExport(adminToken)).body.data as Record<string, unknown>;
    const tampered = { ...exported, encryptionKeyFingerprint: 'deadbeef' };
    await wipeBusinessData();

    const before = await b.prisma.project.count();
    const res = await apiImport(adminToken, tampered);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VAL_001');
    expect(await b.prisma.project.count()).toBe(before); // 校验先于事务,零写入
  });

  it('形状无效(缺数组/错误 version/非对象)→ 422', async () => {
    expect((await apiImport(adminToken, { foo: 1 })).status).toBe(422);
    expect((await apiImport(adminToken, { version: 2 })).status).toBe(422);
    expect((await apiImport(adminToken, 'not-an-object')).status).toBe(422);
    expect((await apiImport(adminToken, null)).status).toBe(422);
  });

  it('悬空引用(connection.projectId 不在文件 projects 内)→ 422 + 零落库', async () => {
    const exported = (await apiExport(adminToken)).body.data as Record<string, unknown>;
    const dangling = {
      ...exported,
      projects: [],
      connections: [{ ...(exported.connections as Array<Record<string, unknown>>)[0]!, projectId: 'no-such-project' }],
    };
    const before = await b.prisma.project.count();
    const res = await apiImport(adminToken, dangling);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VAL_001');
    expect(await b.prisma.project.count()).toBe(before);

    // review F10:requiredVpnId 悬空(指向文件外 id)同样 422——文件内依赖完整性对依赖键同口径
    const danglingVpn = {
      ...exported,
      connections: [{ ...(exported.connections as Array<Record<string, unknown>>)[0]!, requiredVpnId: 'no-such-conn' }],
    };
    const resVpn = await apiImport(adminToken, danglingVpn);
    expect(resVpn.status).toBe(422);
    expect(resVpn.body.error.code).toBe('VAL_001');
  });
});

describe('大 body:>1mb 导入(parser 预挂锁死)', () => {
  it('notes 2MB 的连接导入 → 200(50mb 专属 parser 生效,全局 1mb 未拦截)', async () => {
    // 自带 mini 数据集(前序用例已清库):引用完整(projectId/userId 指向文件内实体),只依赖 parser 行为
    const exported = (await apiExport(adminToken)).body.data as Record<string, unknown>;
    const big = {
      ...exported,
      users: [{ id: 'big-user-1', username: `biguser${Date.now()}`, nickname: '大文件用户', role: 'user', isActive: true, twoFactorEnabled: false, totpSecret: null, lastActiveAt: null, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      projects: [{ id: 'big-proj-1', name: `大文件项目-${Date.now()}`, description: null, icon: 'folder', status: 'active', createdBy: 'big-user-1', updatedBy: 'big-user-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      connections: [{ id: 'big-conn-1', projectId: 'big-proj-1', name: 'BigConn', host: 'big.example.com', port: null, username: null, encryptedPass: null, protocol: 'SSH', vpnType: null, vpnLoginUrl: null, requiredVpnId: null, notes: 'x'.repeat(2 * 1024 * 1024), tags: null, lastAccessed: null, createdBy: 'big-user-1', updatedBy: 'big-user-1', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }],
      members: [],
    };
    const res = await apiImport(adminToken, big);
    expect(res.status).toBe(200);
    const stored = await b.prisma.connection.findUnique({ where: { id: 'big-conn-1' } });
    expect(stored?.notes?.length).toBe(2 * 1024 * 1024);
  });
});

describe('程序化审计(SYSTEM_BACKUP / SYSTEM_RESTORE,成败皆记)', () => {
  it('export 落 SYSTEM_BACKUP success;import 成功落 SYSTEM_RESTORE success;指纹失败落 failure', async () => {
    const sbBefore = await auditCount('SYSTEM_BACKUP');
    const srBefore = await auditCount('SYSTEM_RESTORE');
    const srFailBefore = await auditCount('SYSTEM_RESTORE', 'failure');

    const exported = (await apiExport(adminToken)).body.data as Record<string, unknown>;
    expect(await auditCount('SYSTEM_BACKUP')).toBe(sbBefore + 1);

    await apiImport(adminToken, exported);
    expect(await auditCount('SYSTEM_RESTORE')).toBe(srBefore + 1);

    await apiImport(adminToken, { ...exported, encryptionKeyFingerprint: 'deadbeef' });
    expect(await auditCount('SYSTEM_RESTORE', 'failure')).toBe(srFailBefore + 1);
  });

  it('export 审计 detail 只含 counts,不含密文本体(审计行不膨胀/密文不入审计库)', async () => {
    await apiExport(adminToken);
    const row = await b.prisma.auditLog.findFirst({ where: { action: 'SYSTEM_BACKUP', result: 'success' }, orderBy: { createdAt: 'desc' } });
    expect(row).not.toBeNull();
    const detail = JSON.parse(row!.detail ?? '{}') as { after?: { counts?: Record<string, number> } };
    expect(detail.after?.counts).toBeDefined();
    expect(typeof detail.after?.counts?.projects).toBe('number');
    // 审计行体积护栏:detail 不携带导出 JSON 本体
    expect((row!.detail ?? '').length).toBeLessThan(1000);
    expect(row!.detail).not.toContain('v1:'); // 密文前缀不入审计
  });
});

describe('大 body 预检(review F1:CL>50mb 在 auth/parser 之前 413)', () => {
  it('CL=60mb → 413 SYS_003,不读 body 不落审计行', async () => {
    const before = await auditCount('SYSTEM_RESTORE');
    const res = await request(b.app)
      .post('/api/v1/admin/import')
      .set('Content-Length', String(60 * 1024 * 1024))
      .send({});
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('SYS_003');
    // 预检先于一切 body 处理与 controller:审计不落行(程序化落行在 controller 层)
    expect(await auditCount('SYSTEM_RESTORE')).toBe(before);
  });

  it('CL 未超限的 import 不受预检影响 → 未认证 401(预检只拦 CL>50mb,不误伤)', async () => {
    const res = await request(b.app).post('/api/v1/admin/import').send({});
    expect(res.status).toBe(401);
  });
});

describe('sanitization 豁免(review F3:导出→导入恒等)', () => {
  it('name 含 --、description 含反引号、tags 含 onXxx= 的存量数据 roundtrip 字面恒等', async () => {
    const uniq = Date.now().toString().slice(-6);
    const proj = await b.prisma.project.create({
      data: {
        name: `csv-${uniq}-db1--primary`,
        description: 'markdown `code` 示例',
        icon: 'folder',
        status: 'active',
        createdBy: adminId,
        updatedBy: adminId,
      },
    });
    await b.prisma.connection.create({
      data: {
        projectId: proj.id,
        name: `conn-${uniq}-db1--primary`,
        host: 'h.example.com',
        protocol: 'SSH',
        tags: 'oncall=x,prod',
        notes: '直造备注',
        createdBy: adminId,
        updatedBy: adminId,
      },
    });

    const exported = (await apiExport(adminToken)).body.data as Record<string, unknown>;
    const expProj = (exported.projects as Array<Record<string, unknown>>).find((p) => p.id === proj.id)!;
    expect(expProj.name).toBe(`csv-${uniq}-db1--primary`); // 导出侧恒等(导出不经净化)

    await wipeBusinessData();
    const res = await apiImport(adminToken, exported);
    expect(res.status).toBe(200); // 无豁免时:净化 422(-- 命中 SQL_COMMENT_RE)→ 红阶段死此处

    const dbProj = await b.prisma.project.findUniqueOrThrow({ where: { id: proj.id } });
    const dbConn = await b.prisma.connection.findFirstOrThrow({ where: { projectId: proj.id } });
    expect(dbProj.name).toBe(`csv-${uniq}-db1--primary`);
    expect(dbProj.description).toBe('markdown `code` 示例');
    expect(dbConn.name).toBe(`conn-${uniq}-db1--primary`);
    expect(dbConn.tags).toBe('oncall=x,prod'); // 无豁免时被 EVENT_ATTR_RE 剥离为 ',prod'
  });
});

describe('环依赖两阶段回填(review F2:AC 环图支持)', () => {
  it('A↔B 互环 + C 自引用:导出→清库→导入后依赖原样', async () => {
    // Prisma 直建(绕过 API 的 CONN_003 环校验;DB FK 仍要两阶段:趟 1 null 建行,趟 2 回填)
    const proj = await b.prisma.project.create({
      data: { name: `ring-proj-${Date.now()}`, status: 'active', createdBy: adminId, updatedBy: adminId },
    });
    const mkNull = (name: string) =>
      b.prisma.connection.create({
        data: { projectId: proj.id, name, host: 'ring.example.com', protocol: 'SSH', createdBy: adminId, updatedBy: adminId },
      });
    const ra = await mkNull('RingA');
    const rb = await mkNull('RingB');
    const rc = await mkNull('RingC');
    await b.prisma.connection.update({ where: { id: ra.id }, data: { requiredVpnId: rb.id } });
    await b.prisma.connection.update({ where: { id: rb.id }, data: { requiredVpnId: ra.id } });
    await b.prisma.connection.update({ where: { id: rc.id }, data: { requiredVpnId: rc.id } });

    const exported = (await apiExport(adminToken)).body.data as Record<string, unknown>;
    await wipeBusinessData();
    const res = await apiImport(adminToken, exported);
    expect(res.status).toBe(200);

    const dbRa = await b.prisma.connection.findUniqueOrThrow({ where: { id: ra.id } });
    const dbRb = await b.prisma.connection.findUniqueOrThrow({ where: { id: rb.id } });
    const dbRc = await b.prisma.connection.findUniqueOrThrow({ where: { id: rc.id } });
    expect(dbRa.requiredVpnId).toBe(rb.id); // A→B
    expect(dbRb.requiredVpnId).toBe(ra.id); // B→A(互环)
    expect(dbRc.requiredVpnId).toBe(rc.id); // C→C(自引用)
  });
});

describe('审计 detail 脱敏(review F5:writeSystemAudit 过 redactDetail)', () => {
  it('SENSITIVE_FIELDS 值落库为 [REDACTED],非敏感字段透传', async () => {
    // 动态 import 同代实例(serverBootstrap resetModules 后,静态 import 是占位代)
    const svc = await import('../../services/adminDataService.js');
    const before = await auditCount('SYSTEM_RESTORE');
    await svc.writeSystemAudit({
      userId: adminId,
      action: 'SYSTEM_RESTORE',
      result: 'success',
      detail: { after: { counts: { x: 1 }, password: 'plaintext-secret', nested: { encryptedPass: 'v1:abc' } } },
      ip: '10.0.0.1',
      userAgent: 'vitest-f5',
    });
    expect(await auditCount('SYSTEM_RESTORE')).toBe(before + 1);
    const row = await b.prisma.auditLog.findFirst({
      where: { action: 'SYSTEM_RESTORE', detail: { contains: '[REDACTED]' } },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    const detail = JSON.parse(row!.detail ?? '{}') as {
      after?: { counts?: Record<string, number>; password?: string; nested?: { encryptedPass?: string } };
    };
    expect(detail.after?.password).toBe('[REDACTED]');
    expect(detail.after?.nested?.encryptedPass).toBe('[REDACTED]');
    expect(detail.after?.counts?.x).toBe(1);
  });
});

describe('枚举运行时校验(review F7:非法值 422 VAL_001)', () => {
  /** 一次性前缀 mini 载荷(引用完整):红阶段无校验时会真写库,前缀隔离不污染其他用例 */
  function miniPayload(): Record<string, unknown> {
    const t = '2026-01-01T00:00:00.000Z';
    return {
      version: 1,
      encryptionKeyFingerprint: expectedFingerprint(),
      users: [{ id: 'enumbad-u1', username: 'enumbadu1', nickname: '', role: 'user', isActive: true, twoFactorEnabled: false, totpSecret: null, lastActiveAt: null, createdAt: t, updatedAt: t }],
      projects: [{ id: 'enumbad-p1', name: 'enumbad-p1', description: null, icon: 'folder', status: 'active', createdBy: 'enumbad-u1', updatedBy: 'enumbad-u1', createdAt: t, updatedAt: t }],
      connections: [{ id: 'enumbad-c1', projectId: 'enumbad-p1', name: 'enumbad-c1', host: 'h', port: null, username: null, encryptedPass: null, protocol: 'SSH', vpnType: null, vpnLoginUrl: null, requiredVpnId: null, notes: null, tags: null, lastAccessed: null, createdBy: 'enumbad-u1', updatedBy: 'enumbad-u1', createdAt: t, updatedAt: t }],
      members: [{ id: 'enumbad-m1', projectId: 'enumbad-p1', userId: 'enumbad-u1', role: 'viewer', addedAt: t }],
    };
  }

  it('role/protocol/vpnType/member.role 非法值 → 422,零落库', async () => {
    const cases: Array<[string, (d: Record<string, unknown>) => void]> = [
      ['user.role', (d) => { ((d.users as Array<Record<string, unknown>>)[0] as Record<string, unknown>).role = 'superadmin'; }],
      ['protocol', (d) => { ((d.connections as Array<Record<string, unknown>>)[0] as Record<string, unknown>).protocol = 'TELNET'; }],
      ['vpnType', (d) => { ((d.connections as Array<Record<string, unknown>>)[0] as Record<string, unknown>).vpnType = 'PPTP'; }],
      ['member.role', (d) => { ((d.members as Array<Record<string, unknown>>)[0] as Record<string, unknown>).role = 'admin'; }],
    ];
    for (const [name, mutate] of cases) {
      const payload = miniPayload();
      mutate(payload);
      const res = await apiImport(adminToken, payload);
      expect(res.status, `枚举非法值应 422:${name}`).toBe(422);
      expect(res.body.error.code).toBe('VAL_001');
    }
    // 零落库(校验先于事务)
    expect(await b.prisma.user.count({ where: { id: { startsWith: 'enumbad-' } } })).toBe(0);
    expect(await b.prisma.project.count({ where: { id: { startsWith: 'enumbad-' } } })).toBe(0);
    expect(await b.prisma.connection.count({ where: { id: { startsWith: 'enumbad-' } } })).toBe(0);
  });
});
