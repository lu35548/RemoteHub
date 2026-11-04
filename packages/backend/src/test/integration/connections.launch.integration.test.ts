// 票 #45 协议注册表 integration：GET /connections/:id/launch 端到端——三类分派真机形状
// （.rdp 字节级经 HTTP 全链 / JSON 统一壳）+ 权限四分支 + registry 写入侧（默认端口 / port:none 拒绝）
// + 存量零破坏（直造行绕过 API，锁「老连接只改 notes 不被拒」）+ 审计 CONNECTION_ACCESS
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;
let projectId = '';
let viewerToken = '';
let outsiderToken = '';
let adminId = '';

/** API 造连接便捷函数（走完整校验链——registry 行为经真链路锁） */
async function apiCreate(token: string, body: Record<string, unknown>) {
  const res = await request(b.app)
    .post('/api/v1/connections')
    .set('Authorization', `Bearer ${token}`)
    .send({ projectId, ...body });
  return res;
}

beforeAll(async () => {
  b = await setupServerWithDb();

  const admin = await b.prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  adminId = admin.id;

  const project = await b.prisma.project.create({
    data: { name: `直连项目-${Date.now()}`, icon: 'folder', createdBy: admin.id, updatedBy: admin.id },
  });
  projectId = project.id;

  // viewer 成员（lead 预裁决 #2：launch 权限门 viewer——可见字段构成，敏感度低于 decrypt-password）
  const viewerReg = await request(b.app)
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${b.adminToken}`)
    .send({ username: `launchview${Date.now().toString().slice(-6)}`, password: 'Member123!', nickname: '直连观察员' });
  expect(viewerReg.status).toBe(201);
  const viewerLogin = await request(b.app).post('/api/v1/auth/login')
    .send({ username: viewerReg.body.data.username, password: 'Member123!' });
  viewerToken = viewerLogin.body.data.accessToken as string;
  const viewerId = viewerLogin.body.data.user.id as string;
  await b.prisma.projectMember.create({ data: { projectId, userId: viewerId, role: 'viewer' } });

  // 非成员
  const outReg = await request(b.app)
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${b.adminToken}`)
    .send({ username: `launchout${Date.now().toString().slice(-6)}`, password: 'Member123!', nickname: '直连局外人' });
  expect(outReg.status).toBe(201);
  const outLogin = await request(b.app).post('/api/v1/auth/login')
    .send({ username: outReg.body.data.username, password: 'Member123!' });
  outsiderToken = outLogin.body.data.accessToken as string;
}, 120_000);

afterAll(() => teardownServerWithDb(b));

// ─── AC：launch 端点三类分派真机形状 ───

describe('GET /api/v1/connections/:id/launch — RDP .rdp 文件流', () => {
  it('admin 200：application/x-rdp + attachment（RFC 5987 中文文件名）+ 字节级 BOM/UTF-16 LE/full address', async () => {
    const created = await apiCreate(b.adminToken, {
      name: '中文跳板机', host: '192.168.1.200', port: 3389, username: 'admin', protocol: 'RDP',
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const res = await request(b.app)
      .get(`/api/v1/connections/${id}/launch`)
      .set('Authorization', `Bearer ${b.adminToken}`)
      // 自定义 parser 直收原始字节（superagent 对未知 MIME 不填 res.body——字节级断言需绕过文本解析）
      .parse((stream, cb) => {
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/x-rdp');
    const disposition = String(res.headers['content-disposition']);
    expect(disposition).toContain('attachment');
    // RFC 5987：filename* UTF-8 编码中文名；filename ASCII 兜底（中文名降级 connection-<id>.rdp）
    expect(disposition).toContain(`filename*=UTF-8''${encodeURIComponent('中文跳板机.rdp')}`);
    expect(disposition).toContain(`filename="connection-${id}.rdp"`); // review 修复 6：非 ASCII 名 ASCII 兜底分支
    // 字节级：BOM FF FE + UTF-16 LE 回读 full address
    const body = res.body as Buffer;
    expect(body[0]).toBe(0xff);
    expect(body[1]).toBe(0xfe);
    const text = body.subarray(2).toString('utf16le');
    expect(text).toContain('full address:s:192.168.1.200:3389\r\n');
    expect(text).toContain('username:s:admin\r\n');
  });
});

describe('GET /api/v1/connections/:id/launch — 命令串 JSON（SSH / 设备码）', () => {
  it('SSH → { type: command, command: ssh user@host }（统一响应壳）', async () => {
    const created = await apiCreate(b.adminToken, {
      name: 'SSH 主机', host: 'srv.example.com', username: 'root', protocol: 'SSH', // 不传 port → create 填默认 22
    });
    const id = created.body.data.id as string;
    expect(created.body.data.port).toBe(22); // registry 默认端口填充经真链路锁

    const res = await request(b.app)
      .get(`/api/v1/connections/${id}/launch`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { type: 'command', command: 'ssh root@srv.example.com' } });
  });

  it('TODESK → command = 设备码（host 列复用）', async () => {
    const created = await apiCreate(b.adminToken, {
      name: '同事的电脑', host: '987 654 321', protocol: 'TODESK', port: null,
    });
    const id = created.body.data.id as string;
    const res = await request(b.app)
      .get(`/api/v1/connections/${id}/launch`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ type: 'command', command: '987 654 321' });
  });
});

describe('GET /api/v1/connections/:id/launch — URL JSON（VPN / HTTP / HTTPS）', () => {
  it('VPN + vpnLoginUrl → url 原样', async () => {
    const created = await apiCreate(b.adminToken, {
      name: '公司 VPN', host: 'vpn.example.com', protocol: 'VPN', vpnType: 'OPENVPN',
      vpnLoginUrl: 'https://portal.example.com/login',
    });
    const id = created.body.data.id as string;
    const res = await request(b.app)
      .get(`/api/v1/connections/${id}/launch`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ type: 'url', url: 'https://portal.example.com/login' });
  });

  it('HTTPS port null → https://host（默认端口省略）', async () => {
    const created = await apiCreate(b.adminToken, {
      name: '管理后台', host: 'console.example.com', protocol: 'HTTPS', port: null, // 显式 null 亦填默认 443（spec 钦定缺省语义）
    });
    expect(created.body.data.port).toBe(443);
    const id = created.body.data.id as string;
    const res = await request(b.app)
      .get(`/api/v1/connections/${id}/launch`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ type: 'url', url: 'https://console.example.com' });
  });
});

describe('GET /api/v1/connections/:id/launch — 权限四分支', () => {
  let sshId = '';

  beforeAll(async () => {
    const created = await apiCreate(b.adminToken, {
      name: '权限验证机', host: 'perm.example.com', username: 'op', protocol: 'SSH',
    });
    sshId = created.body.data.id as string;
  });

  it('项目成员 viewer 200（lead 预裁决 #2）', async () => {
    const res = await request(b.app)
      .get(`/api/v1/connections/${sshId}/launch`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ type: 'command', command: 'ssh op@perm.example.com' });
  });

  it('非项目成员 403（AUTH_003）', async () => {
    const res = await request(b.app)
      .get(`/api/v1/connections/${sshId}/launch`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_003');
  });

  it('未认证 401', async () => {
    const res = await request(b.app)
      .get(`/api/v1/connections/${sshId}/launch`);
    expect(res.status).toBe(401);
  });

  it('连接不存在 → 404 CONN_002（admin 直查，非 admin 由成员门拦 403）', async () => {
    const res = await request(b.app)
      .get('/api/v1/connections/nonexistent/launch')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONN_002');
  });
});

describe('GET /api/v1/connections/:id/launch — VNC unsupported', () => {
  it('VNC → 400 CONN_006（该协议不支持直连）', async () => {
    const created = await apiCreate(b.adminToken, {
      name: '老 VNC', host: '10.0.0.9', port: 5900, protocol: 'VNC',
    });
    const id = created.body.data.id as string;
    const res = await request(b.app)
      .get(`/api/v1/connections/${id}/launch`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CONN_006');
  });
});

// ─── AC：registry 写入侧 + 存量零破坏 ───

describe('registry 写入侧（API 真链路）', () => {
  it('create TODESK 传非 null port → 422 VAL_001（field=port）', async () => {
    const res = await apiCreate(b.adminToken, {
      name: '违规设备码', host: '111222333', protocol: 'TODESK', port: 3389,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VAL_001');
    expect(JSON.stringify(res.body.error.details)).toContain('"port"');
  });

  it('存量零破坏：直造 TODESK 行（v1 形状，无 port）只改 notes → 200', async () => {
    // 直造绕过 API——模拟 v1 迁移存量（TODESK + port null + username null）
    const legacy = await b.prisma.connection.create({
      data: {
        projectId, name: '存量设备码', host: '555666777', port: null, username: null,
        encryptedPass: null, protocol: 'TODESK',
        createdBy: adminId, updatedBy: adminId,
      },
    });
    const res = await request(b.app)
      .patch(`/api/v1/connections/${legacy.id}`)
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ notes: '迁移后的备注' });
    expect(res.status).toBe(200);
    expect(res.body.data.notes).toBe('迁移后的备注');
  });

  it('存量零破坏：直造 SSH port=null 行只改 notes → 200（不因元数据不全被拒，且不被默认值回填）', async () => {
    const legacy = await b.prisma.connection.create({
      data: {
        projectId, name: '存量 SSH', host: 'legacy.example.com', port: null, username: null,
        encryptedPass: null, protocol: 'SSH',
        createdBy: adminId, updatedBy: adminId,
      },
    });
    const res = await request(b.app)
      .patch(`/api/v1/connections/${legacy.id}`)
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ notes: '只改备注' });
    expect(res.status).toBe(200);
    expect(res.body.data.port).toBeNull(); // 存量不回填（lead 预裁决 #4）
    const row = await b.prisma.connection.findUniqueOrThrow({ where: { id: legacy.id } });
    expect(row.port).toBeNull(); // 库内真相同样未回填
  });
});

// ─── 审计（memory integration-audit-side-effect-count：action 过滤，不裸 total）───

describe('launch 审计', () => {
  it('launch 成功后落 CONNECTION_ACCESS 审计行（action 过滤断言）', async () => {
    const created = await apiCreate(b.adminToken, {
      name: '审计验证机', host: 'audit.example.com', username: 'op', protocol: 'SSH',
    });
    const id = created.body.data.id as string;
    const res = await request(b.app)
      .get(`/api/v1/connections/${id}/launch`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);

    const accessLogs = await b.prisma.auditLog.findMany({
      where: { action: 'CONNECTION_ACCESS', resource: 'connection' },
    });
    expect(accessLogs.length).toBeGreaterThan(0);
    expect(accessLogs.some((l) => l.userId === adminId)).toBe(true);
  });

  it('RDP launch（res.send 文件流路径）→ CONNECTION_ACCESS 审计行存在（review 修复 1 回归锚：审计须覆盖 Buffer 直发）', async () => {
    const created = await apiCreate(b.adminToken, {
      name: '审计RDP机', host: 'audit-rdp.example.com', port: 3389, username: 'admin', protocol: 'RDP',
    });
    const id = created.body.data.id as string;
    const res = await request(b.app)
      .get(`/api/v1/connections/${id}/launch`)
      .set('Authorization', `Bearer ${b.adminToken}`)
      .parse((stream, cb) => {
        const chunks: Buffer[] = [];
        stream.on('data', (c: Buffer) => chunks.push(c));
        stream.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect((res.body as Buffer).length).toBeGreaterThan(0);

    // resourceId 精确过滤该连接自己的 CONNECTION_ACCESS 行
    const logs = await b.prisma.auditLog.findMany({
      where: { action: 'CONNECTION_ACCESS', resource: 'connection', resourceId: id },
    });
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]!.result).toBe('success');
  });
});
