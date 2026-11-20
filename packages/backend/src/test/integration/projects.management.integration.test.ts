// 票 #47 项目管理增强 integration：深拷贝完整性（连接数/密文库内串严格等价/成员不复制/VPN 依赖重映射）/
// （副本）递增避 Project.name @unique / 转让先升后降（唯一 owner 转出不落 MEMBER_002）/ 归档过滤与恢复 /
// 批量归档分类与逐项目审计行 / 各端点权限门（owner+admin 直通，design §17 权限矩阵）
// 限流前置（mfa.integration 先例：config/env.ts 是 import 期快照，赋值必须先于第一个 import——
// 本文件 beforeAll 注册 4 用户 + 多次登录，默认 register 3/min、login 5/min 会 429）
process.env.RATE_LIMIT_REGISTER_MAX = '1000';
process.env.RATE_LIMIT_LOGIN_MAX = '1000';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;
let ownerToken = '';
let ownerUserId = '';
let editorToken = '';
let editorUserId = '';
let viewerToken = '';
let viewerUserId = '';
let outsiderToken = '';
let outsiderUserId = '';
let adminId = '';

let srcProjId = '';      // 深拷贝源（owner 建，3 连接含密码/VPN 依赖）
let arcProjId = '';      // 归档/恢复实验田（owner 建）
let outsiderProjId = ''; // 批量归档 skipped 用（局外人自建）
let incrProjId = '';     // 复制递增实验田（自包含，不依赖跨用例状态）

const SRC_NAME = `深拷贝源项目-${Date.now()}`;
const ARC_NAME = `归档实验田-${Date.now()}`;
const INCR_NAME = `复制递增-${Date.now()}`;

async function registerUser(prefix: string, nickname: string): Promise<{ token: string; userId: string }> {
  const uniq = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
  const reg = await request(b.app)
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${b.adminToken}`)
    .send({ username: `${prefix}${uniq}`, password: 'Member123!', nickname });
  expect(reg.status).toBe(201);
  const login = await request(b.app).post('/api/v1/auth/login')
    .send({ username: `${prefix}${uniq}`, password: 'Member123!' });
  const token = login.body.data.accessToken as string;
  const userId = login.body.data.user.id as string;
  return { token, userId };
}

async function join(projectId: string, userId: string, role: 'owner' | 'editor' | 'viewer') {
  await b.prisma.projectMember.create({ data: { projectId, userId, role } });
}

async function apiCopy(token: string, id: string) {
  return request(b.app).post(`/api/v1/projects/${id}/copy`).set('Authorization', `Bearer ${token}`).send({});
}

async function apiTransfer(token: string, id: string, targetUserId?: string) {
  return request(b.app).post(`/api/v1/projects/${id}/transfer-ownership`)
    .set('Authorization', `Bearer ${token}`).send(targetUserId ? { userId: targetUserId } : {});
}

async function apiArchive(token: string, id: string) {
  return request(b.app).post(`/api/v1/projects/${id}/archive`).set('Authorization', `Bearer ${token}`).send({});
}

async function apiRestore(token: string, id: string) {
  return request(b.app).post(`/api/v1/projects/${id}/restore`).set('Authorization', `Bearer ${token}`).send({});
}

async function apiBatchArchive(token: string, ids: unknown) {
  return request(b.app).post('/api/v1/projects/batch-archive')
    .set('Authorization', `Bearer ${token}`).send({ ids });
}

/** 列出 owner 可见项目名集合（archived 参数控制视图）——响应形状扁平 { success, data, pagination } */
async function listNames(token: string, archived?: boolean): Promise<Set<string>> {
  const q = archived === undefined ? '' : `&archived=`;
  const suffix = archived === undefined ? '' : (archived ? 'true' : 'false');
  const url = `/api/v1/projects?page=1&pageSize=100${suffix ? `${q}${suffix}` : ''}`;
  const res = await request(b.app).get(url)
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return new Set((res.body.data as Array<{ name: string }>).map((p) => p.name));
}

async function apiDecrypt(token: string, connectionId: string): Promise<string> {
  const res = await request(b.app)
    .post(`/api/v1/connections/${connectionId}/decrypt-password`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  expect(res.status).toBe(200);
  return res.body.data.password as string;
}

beforeAll(async () => {
  b = await setupServerWithDb();

  const admin = await b.prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  adminId = admin.id;

  const owner = await registerUser('mgown', '项目管理-owner');
  ownerToken = owner.token;
  ownerUserId = owner.userId;
  const editor = await registerUser('mgedit', '项目管理-editor');
  editorToken = editor.token;
  editorUserId = editor.userId;
  const viewer = await registerUser('mgview', '项目管理-viewer');
  viewerToken = viewer.token;
  viewerUserId = viewer.userId;
  const outsider = await registerUser('mgout', '项目管理-局外人');
  outsiderToken = outsider.token;
  outsiderUserId = outsider.userId;

  // 深拷贝源项目：owner 建 + editor/viewer 入组 + 3 连接（VPN + 密码依赖 VPN + 独立密码连接）
  const src = await request(b.app).post('/api/v1/projects')
    .set('Authorization', `Bearer ${ownerToken}`).send({ name: SRC_NAME, description: '源描述', icon: 'server' });
  expect(src.status).toBe(201);
  srcProjId = src.body.data.id as string;
  await join(srcProjId, editorUserId, 'editor');
  await join(srcProjId, viewerUserId, 'viewer');

  const mk = async (body: Record<string, unknown>) => {
    const res = await request(b.app).post('/api/v1/connections')
      .set('Authorization', `Bearer ${ownerToken}`).send({ projectId: srcProjId, ...body });
    expect(res.status).toBe(201);
    return res.body.data as { id: string; name: string };
  };
  const vpn = await mk({ name: 'MgVpn', host: 'vpn.example.com', username: 'vpnop', protocol: 'VPN', vpnType: 'SSL_VPN', vpnLoginUrl: 'https://vpn.example.com' });
  const connA = await mk({ name: 'MgA', host: 'a.example.com', username: 'opa', password: 'S3cretA@1', protocol: 'SSH', tags: 'prod,core', notes: '复制备注', requiredVpnId: vpn.id });
  await mk({ name: 'MgB', host: 'b.example.com', username: 'opb', password: 'S3cretB@2', protocol: 'HTTPS' });
  // 造数直设 lastAccessed（clone 集成先例：断言副本不继承访问时间，避免 API 触发异步 race）
  await b.prisma.connection.update({ where: { id: connA.id }, data: { lastAccessed: new Date('2026-06-01T00:00:00Z') } });

  // 归档实验田 + 局外人项目 + 递增实验田
  const arc = await request(b.app).post('/api/v1/projects')
    .set('Authorization', `Bearer ${ownerToken}`).send({ name: ARC_NAME });
  arcProjId = arc.body.data.id as string;
  await join(arcProjId, editorUserId, 'editor');
  const oproj = await request(b.app).post('/api/v1/projects')
    .set('Authorization', `Bearer ${outsiderToken}`).send({ name: `局外人项目-${Date.now()}` });
  outsiderProjId = oproj.body.data.id as string;
  const incr = await request(b.app).post('/api/v1/projects')
    .set('Authorization', `Bearer ${ownerToken}`).send({ name: INCR_NAME });
  incrProjId = incr.body.data.id as string;
}, 240_000); // 冷启动 migrate deploy 偶发超 120s（集成真库时序先例），放宽到 240s

afterAll(() => teardownServerWithDb(b));

// ─── 深拷贝 ───

describe('POST /projects/:id/copy 深拷贝', () => {
  it('完整性：连接数等 / 密文库内串严格等价 / 明文可解 / 成员不复制 / VPN 依赖重映射副本内 / lastAccessed 不继承', async () => {
    const res = await apiCopy(ownerToken, srcProjId);
    expect(res.status).toBe(201);
    const copy = res.body.data;
    expect(copy.name).toBe(`${SRC_NAME} (副本)`);
    expect(copy.clonedFrom).toBe(srcProjId);
    expect(copy.connectionCount).toBe(3);
    expect(copy.status).toBe('active'); // 源即便归档副本也 active（此处源 active 等价成立）

    const copyId = copy.id as string;

    // 连接数等 + 名称一致
    const srcConns = await b.prisma.connection.findMany({ where: { projectId: srcProjId }, orderBy: { name: 'asc' } });
    const copyConns = await b.prisma.connection.findMany({ where: { projectId: copyId }, orderBy: { name: 'asc' } });
    expect(copyConns.length).toBe(srcConns.length);
    expect(copyConns.map((c) => c.name)).toEqual(srcConns.map((c) => c.name));

    // 密文库内串严格等价（原样复制不重加密——AES-GCM IV 随机，重加密两串必不等）
    const srcA = srcConns.find((c) => c.name === 'MgA')!;
    const copyA = copyConns.find((c) => c.name === 'MgA')!;
    expect(copyA.encryptedPass).toBe(srcA.encryptedPass);
    expect(copyA.encryptedPass).not.toBeNull();

    // 明文等价（真密钥解密端到端）
    const plain = await apiDecrypt(ownerToken, copyA.id);
    expect(plain).toBe('S3cretA@1');

    // tags/notes 等价 + lastAccessed 不继承（新连接从未访问）
    expect(copyA.tags).toBe('prod,core');
    expect(copyA.notes).toBe('复制备注');
    expect(copyA.lastAccessed).toBeNull();

    // VPN 依赖重映射：副本 MgA 指向副本内 MgVpn（深拷贝自包含语义），而非原项目 VPN
    const srcVpn = srcConns.find((c) => c.name === 'MgVpn')!;
    const copyVpn = copyConns.find((c) => c.name === 'MgVpn')!;
    expect(copyA.requiredVpnId).toBe(copyVpn.id);
    expect(copyA.requiredVpnId).not.toBe(srcVpn.id);

    // 成员不复制：副本只有操作者一个 owner
    const members = await b.prisma.projectMember.findMany({ where: { projectId: copyId } });
    expect(members.length).toBe(1);
    expect(members[0]!.userId).toBe(ownerUserId);
    expect(members[0]!.role).toBe('owner');
  });

  it('连续复制三级递增：(副本) → (副本) 2 → (副本) 3（真库 Project.name @unique 避让，自包含实验田）', async () => {
    const c1 = await apiCopy(ownerToken, incrProjId);
    expect(c1.status).toBe(201);
    expect(c1.body.data.name).toBe(`${INCR_NAME} (副本)`);

    const c2 = await apiCopy(ownerToken, incrProjId);
    expect(c2.status).toBe(201);
    expect(c2.body.data.name).toBe(`${INCR_NAME} (副本) 2`);

    const c3 = await apiCopy(ownerToken, incrProjId);
    expect(c3.status).toBe(201);
    expect(c3.body.data.name).toBe(`${INCR_NAME} (副本) 3`);
  });

  it('权限门：editor / viewer / 局外人 → 403（owner+admin，design §17）', async () => {
    expect((await apiCopy(editorToken, srcProjId)).status).toBe(403);
    expect((await apiCopy(viewerToken, srcProjId)).status).toBe(403);
    expect((await apiCopy(outsiderToken, srcProjId)).status).toBe(403);
  });

  it('源不存在 → 404 PROJ_002（admin 直通可达 service 数据边界；owner 路径在 projectRole 中间件即 403）', async () => {
    const res = await apiCopy(b.adminToken, 'no-such-project');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('PROJ_002');
  });

  it('审计：PROJECT_COPY 行 resourceId=副本 id + detail.after.clonedFrom=源 id', async () => {
    const res = await apiCopy(ownerToken, srcProjId);
    expect(res.status).toBe(201);
    const copyId = res.body.data.id as string;
    const logs = await b.prisma.auditLog.findMany({
      where: { action: 'PROJECT_COPY', resource: 'project', resourceId: copyId },
    });
    expect(logs.length).toBe(1);
    expect(logs[0]!.result).toBe('success');
    expect(logs[0]!.userId).toBe(ownerUserId);
    const detail = JSON.parse(logs[0]!.detail ?? '{}') as { after?: Record<string, unknown> };
    expect(detail.after?.clonedFrom).toBe(srcProjId);
  });

  it('rev-47 minor-1:源名顶格(100)copy → 422 VAL_001(「 (副本)」后缀超长)', async () => {
    const proj = await request(b.app).post('/api/v1/projects')
      .set('Authorization', `Bearer ${b.adminToken}`).send({ name: 'X'.repeat(100) });
    expect(proj.status).toBe(201);
    const res = await apiCopy(b.adminToken, proj.body.data.id as string);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('rev-47 minor-2:跨项目 VPN 依赖保留原值(idMap 无键保留分支)', async () => {
    // 独立实验田自包含(不动 srcProj——完整性用例锁 connectionCount=3);
    // crossVpn 在 crossProj 内 API 合法创建;源项目内依赖连接 prisma 直插(API 的
    // validateVpnDependency 拦跨项目依赖,直插等价 #44 时代的合法存量形态)
    const cp = await request(b.app).post('/api/v1/projects')
      .set('Authorization', `Bearer ${b.adminToken}`).send({ name: `跨项目依赖实验田-${Date.now()}` });
    expect(cp.status).toBe(201);
    const crossProjId = cp.body.data.id as string;
    const cv = await request(b.app).post('/api/v1/connections')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ projectId: crossProjId, name: 'CrossVpn', host: 'cv.example.com', username: 'cvop', protocol: 'VPN', vpnType: 'SSL_VPN', vpnLoginUrl: 'https://cv.example.com' });
    expect(cv.status).toBe(201);
    const crossVpnId = cv.body.data.id as string;

    const depName = `CrossDep-${Date.now()}`;
    await b.prisma.connection.create({
      data: { projectId: srcProjId, name: depName, host: 'cd.example.com', username: 'cdop', protocol: 'SSH', requiredVpnId: crossVpnId, createdBy: adminId, updatedBy: adminId },
    });

    const res = await apiCopy(b.adminToken, srcProjId);
    expect(res.status).toBe(201);
    const copyId = res.body.data.id as string;
    const copyConns = await b.prisma.connection.findMany({ where: { projectId: copyId } });
    const dep = copyConns.find((c) => c.name === depName);
    expect(dep).toBeDefined();
    expect(dep!.requiredVpnId).toBe(crossVpnId); // 保留原值不重映射(副本外依赖不劫持)
  });
});

// ─── 转让 ───

describe('POST /projects/:id/transfer-ownership 转让', () => {
  it('owner → editor 成员：唯一 owner 转出成功（先升后降不落 MEMBER_002）+ 角色互变成对', async () => {
    const res = await apiTransfer(ownerToken, srcProjId, editorUserId);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ projectId: srcProjId, fromUserId: ownerUserId, toUserId: editorUserId });

    const mNew = await b.prisma.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId: srcProjId, userId: editorUserId } },
    });
    const mOld = await b.prisma.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId: srcProjId, userId: ownerUserId } },
    });
    expect(mNew.role).toBe('owner');
    expect(mOld.role).toBe('editor');
    // 全项目恰好 1 个 owner（last-owner 不变量在转让后保持）
    expect(await b.prisma.projectMember.count({ where: { projectId: srcProjId, role: 'owner' } })).toBe(1);
  });

  it('admin 直通：全局 admin（非成员）转让给 viewer 成员（viewer 可被交付 owner）', async () => {
    const res = await apiTransfer(b.adminToken, srcProjId, viewerUserId);
    expect(res.status).toBe(200);
    const mNew = await b.prisma.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId: srcProjId, userId: viewerUserId } },
    });
    const mOld = await b.prisma.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId: srcProjId, userId: editorUserId } },
    });
    expect(mNew.role).toBe('owner');
    expect(mOld.role).toBe('editor');
  });

  it('转让给当前 owner → 422 VAL_001（admin 直通调用，不受用例序状态影响）', async () => {
    const res = await apiTransfer(b.adminToken, srcProjId, viewerUserId);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('转让给非成员 → 409 MEMBER_001', async () => {
    const res = await apiTransfer(b.adminToken, srcProjId, outsiderUserId);
    expect(res.status).toBe(409);
    expect({ code: res.body.error.code }).toEqual({ code: 'MEMBER_001' });
  });

  it('body 缺 userId → 422 VAL_001', async () => {
    const res = await apiTransfer(b.adminToken, srcProjId);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('权限门：非 owner 成员（ownerToken 已降 editor）→ 403', async () => {
    const res = await apiTransfer(ownerToken, srcProjId, ownerUserId);
    expect(res.status).toBe(403);
  });

  it('收尾：viewer（现任 owner）转回 ownerUser——状态还原，后续组 owner 门操作恢复可用', async () => {
    const res = await apiTransfer(viewerToken, srcProjId, ownerUserId);
    expect(res.status).toBe(200);
    const m = await b.prisma.projectMember.findUniqueOrThrow({
      where: { projectId_userId: { projectId: srcProjId, userId: ownerUserId } },
    });
    expect(m.role).toBe('owner');
    // srcProj 恰好 1 个 owner（还原后不变量复核）
    expect(await b.prisma.projectMember.count({ where: { projectId: srcProjId, role: 'owner' } })).toBe(1);
  });

  it('审计：PROJECT_TRANSFER 行 detail.after 含 fromUserId/toUserId', async () => {
    const logs = await b.prisma.auditLog.findMany({
      where: { action: 'PROJECT_TRANSFER', resource: 'project', resourceId: srcProjId, userId: adminId },
    });
    expect(logs.length).toBe(1); // 仅 admin 直通用例一行（收尾转回的操作人是 viewer）
    const detail = JSON.parse(logs[0]!.detail ?? '{}') as { after?: Record<string, unknown> };
    expect(detail.after?.fromUserId).toBe(editorUserId);
    expect(detail.after?.toUserId).toBe(viewerUserId);
  });
});

// ─── 归档 / 恢复 ───

describe('POST /projects/:id/archive 与 restore', () => {
  it('归档 → status=archived；默认列表不显；archived=true 只显归档；详情仍可查（只读展示前置）', async () => {
    const res = await apiArchive(ownerToken, arcProjId);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('archived');

    expect((await listNames(ownerToken)).has(ARC_NAME)).toBe(false);
    // 名称含时间戳，直接按 id 查列表成员
    const archivedList = await request(b.app).get('/api/v1/projects?page=1&pageSize=100&archived=true')
      .set('Authorization', `Bearer ${ownerToken}`);
    const ids = (archivedList.body.data as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(arcProjId);

    const detail = await request(b.app).get(`/api/v1/projects/${arcProjId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.status).toBe('archived');
  });

  it('恢复 → status=active；默认列表恢复可见', async () => {
    const res = await apiRestore(ownerToken, arcProjId);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('active');
    const activeList = await request(b.app).get('/api/v1/projects?page=1&pageSize=100')
      .set('Authorization', `Bearer ${ownerToken}`);
    const ids = (activeList.body.data as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(arcProjId);
  });

  it('权限门：editor 归档 → 403（owner+admin，design §17——归档是结构级操作非内容编辑）', async () => {
    expect((await apiArchive(editorToken, arcProjId)).status).toBe(403);
    expect((await apiRestore(editorToken, arcProjId)).status).toBe(403);
  });

  it('不存在 → 404 PROJ_002（admin 直通可达 service 数据边界；owner 路径在 projectRole 中间件即 403）', async () => {
    expect((await apiArchive(b.adminToken, 'no-such-project')).status).toBe(404);
    expect((await apiRestore(b.adminToken, 'no-such-project')).status).toBe(404);
  });

  it('审计：PROJECT_ARCHIVE 与 PROJECT_RESTORE 各落一行', async () => {
    const arc = await b.prisma.auditLog.findMany({
      where: { action: 'PROJECT_ARCHIVE', resource: 'project', resourceId: arcProjId, userId: ownerUserId },
    });
    const res = await b.prisma.auditLog.findMany({
      where: { action: 'PROJECT_RESTORE', resource: 'project', resourceId: arcProjId, userId: ownerUserId },
    });
    expect(arc.length).toBe(1);
    expect(res.length).toBe(1);
  });
});

// ─── 批量归档 ───

describe('POST /projects/batch-archive 批量归档', () => {
  it('混合归属：有权归档 + 无权跳过 → { archived, skipped } 分类 + 库状态对应 + 逐项目审计行', async () => {
    const res = await apiBatchArchive(ownerToken, [arcProjId, outsiderProjId]);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ archived: [arcProjId], skipped: [outsiderProjId] });

    expect((await b.prisma.project.findUniqueOrThrow({ where: { id: arcProjId } })).status).toBe('archived');
    expect((await b.prisma.project.findUniqueOrThrow({ where: { id: outsiderProjId } })).status).toBe('active');

    // 逐项目落行：owner 视角本用例成功 1 行（resourceId=arcProjId）
    const logs = await b.prisma.auditLog.findMany({
      where: { action: 'PROJECT_ARCHIVE', resource: 'project', resourceId: arcProjId, userId: ownerUserId },
    });
    expect(logs.length).toBe(2); // 单项目 archive 用例 1 行 + 批量本行
  });

  it('幂等：已归档项目再批量 → skipped（零重复审计行）', async () => {
    const res = await apiBatchArchive(ownerToken, [arcProjId]);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ archived: [], skipped: [arcProjId] });
    const logs = await b.prisma.auditLog.findMany({
      where: { action: 'PROJECT_ARCHIVE', resource: 'project', resourceId: arcProjId, userId: ownerUserId },
    });
    expect(logs.length).toBe(2); // 不增
  });

  it('admin 直通：归档他人项目', async () => {
    const res = await apiBatchArchive(b.adminToken, [outsiderProjId]);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ archived: [outsiderProjId], skipped: [] });
    expect((await b.prisma.project.findUniqueOrThrow({ where: { id: outsiderProjId } })).status).toBe('archived');
  });

  it.each([
    ['空数组', []],
    ['非数组', 'arcProjId'],
    ['含非 string 项', [arcProjId, 42]],
    ['超 50 上限', Array.from({ length: 51 }, (_, i) => `p${i}`)],
  ])('%s → 422 VAL_001', async (_name, ids) => {
    const res = await apiBatchArchive(ownerToken, ids as unknown);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('不存在的 id → skipped（批量尽力而为，不整体 404）', async () => {
    const res = await apiBatchArchive(ownerToken, [arcProjId, 'ghost-id']);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ archived: [], skipped: [arcProjId, 'ghost-id'] });
  });
});

// ─── 批 13b-A3：批量恢复（batch-archive 全链镜像）───

describe('POST /projects/batch-restore 批量恢复', () => {
  async function apiBatchRestore(token: string, ids: unknown) {
    return request(b.app).post('/api/v1/projects/batch-restore')
      .set('Authorization', `Bearer ${token}`).send({ ids });
  }

  it('混合归属：有权恢复 + 无权跳过 → { restored, skipped } 分类 + 库状态对应 + 逐项目审计行', async () => {
    // 前置状态（batch-archive describe 后）：arcProjId=archived（batch-archive 用例产物）、
    // outsiderProjId=archived（admin 直通用例产物）——owner 对 outsiderProjId 无 owner 权 → skipped
    const res = await apiBatchRestore(ownerToken, [arcProjId, outsiderProjId]);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ restored: [arcProjId], skipped: [outsiderProjId] });

    expect((await b.prisma.project.findUniqueOrThrow({ where: { id: arcProjId } })).status).toBe('active');
    expect((await b.prisma.project.findUniqueOrThrow({ where: { id: outsiderProjId } })).status).toBe('archived');

    // 逐项目落行：PROJECT_RESTORE resourceId=arcProjId（单项目 restore 用例 1 行 + 批量本行 = 2 行）
    const logs = await b.prisma.auditLog.findMany({
      where: { action: 'PROJECT_RESTORE', resource: 'project', resourceId: arcProjId, userId: ownerUserId },
    });
    expect(logs.length).toBe(2);
    // detail.after 批量标记（镜像 batch-archive 的 detail 形状）
    expect((logs.at(-1)!.detail as string)).toContain('"batch":true');
  });

  it('幂等：活跃项目再批量恢复 → skipped（零重复审计行）', async () => {
    const res = await apiBatchRestore(ownerToken, [arcProjId]);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ restored: [], skipped: [arcProjId] });
    const logs = await b.prisma.auditLog.findMany({
      where: { action: 'PROJECT_RESTORE', resource: 'project', resourceId: arcProjId, userId: ownerUserId },
    });
    expect(logs.length).toBe(2); // 不增
  });

  it('admin 直通：恢复他人项目', async () => {
    const res = await apiBatchRestore(b.adminToken, [outsiderProjId]);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ restored: [outsiderProjId], skipped: [] });
    expect((await b.prisma.project.findUniqueOrThrow({ where: { id: outsiderProjId } })).status).toBe('active');
  });

  it.each([
    ['空数组', []],
    ['非数组', 'arcProjId'],
    ['含非 string 项', [arcProjId, 42]],
    ['超 50 上限', Array.from({ length: 51 }, (_, i) => `p${i}`)],
  ])('%s → 422 VAL_001', async (_name, ids) => {
    const res = await apiBatchRestore(ownerToken, ids as unknown);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('活跃项目 + ghost id → 全 skipped（批量尽力而为，不整体 404）', async () => {
    const res = await apiBatchRestore(ownerToken, [arcProjId, 'ghost-id']);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ restored: [], skipped: [arcProjId, 'ghost-id'] });
  });
});

// ─── 批 13b-A5：projects 列表 q 搜索参数（Sidebar 搜索走后端的支撑）───

describe('GET /projects?q=（名称模糊搜索）', () => {
  async function listQ(q: string): Promise<{ data: Array<{ name: string; id: string }>; pagination: { total: number } }> {
    const res = await request(b.app).get(`/api/v1/projects?q=${encodeURIComponent(q)}&pageSize=100`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    return res.body;
  }

  it('q 命中 name：唯一子串 → 源项目 + 其副本各 1 条（contains 语义）', async () => {
    const body = await listQ(SRC_NAME);
    const names = body.data.map((p) => p.name);
    expect(names).toContain(SRC_NAME);
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
    // 命中行 name 全含查询串（contains 语义自洽）
    for (const n of names) expect(n.includes(SRC_NAME)).toBe(true);
  });

  it('q 不命中 → total=0', async () => {
    const body = await listQ('绝不存在的项目名关键词');
    expect(body.pagination.total).toBe(0);
    expect(body.data).toEqual([]);
  });

  it('空 q / 纯空格 q → 忽略该条件（与不带 q 等价）', async () => {
    const withEmpty = await listQ('');
    const noParam = await request(b.app).get('/api/v1/projects?pageSize=100')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(withEmpty.pagination.total).toBe(noParam.body.pagination.total);

    const withBlank = await listQ('   ');
    expect(withBlank.pagination.total).toBe(noParam.body.pagination.total);
  });

  it('翻页 total 一致：q 检索 total 与翻页 total 自洽，页内 data 恰 pageSize 条', async () => {
    // 命中集 = 源 + 其副本们（深拷贝 describe 的 copy 次数不假设——递增用例可能产生 (副本) 2 等）
    const page1 = await request(b.app)
      .get(`/api/v1/projects?q=${encodeURIComponent(SRC_NAME)}&pageSize=1&page=1`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(page1.status).toBe(200);
    const total = page1.body.pagination.total as number;
    expect(total).toBeGreaterThanOrEqual(2); // 源 + 至少一个副本

    const page2 = await request(b.app)
      .get(`/api/v1/projects?q=${encodeURIComponent(SRC_NAME)}&pageSize=1&page=2`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(page2.status).toBe(200);
    expect(page2.body.pagination.total).toBe(total); // 翻页不漂移
    expect(page2.body.data as Array<{ name: string }>).toHaveLength(1);
    expect((page2.body.data as Array<{ name: string }>)[0]!.name.includes(SRC_NAME)).toBe(true);
  });
});
