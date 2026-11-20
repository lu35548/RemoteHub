// 票 #43 克隆连接 integration：密文服务端复制等价（库内密文串严格等价 + decrypt-password 明文一致）/
// 重名递增真库避让（@@unique([projectId,name])）/ 权限 editor 门 / 审计 CONNECTION_CREATE +
// detail.after.clonedFrom（响应体 clonedFrom 经 auditMiddleware envelope.data 自动进 after 快照）
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;
let projectId = '';
let adminId = '';
let viewerToken = '';
let outsiderToken = '';

/** editor 门 API 创建连接（admin 全局角色直过 projectRole 中间件） */
async function apiCreateConnection(token: string, body: Record<string, unknown>) {
  return request(b.app)
    .post('/api/v1/connections')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

/** 克隆端点（POST 无 body——克隆字段全部服务端取自原行） */
async function apiClone(token: string, id: string) {
  return request(b.app)
    .post(`/api/v1/connections/${id}/clone`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
}

/** decrypt-password 端点拿明文（editor 门） */
async function apiDecrypt(token: string, id: string): Promise<string> {
  const res = await request(b.app)
    .post(`/api/v1/connections/${id}/decrypt-password`)
    .set('Authorization', `Bearer ${token}`)
    .send({});
  expect(res.status).toBe(200);
  return res.body.data.password as string;
}

/** 注册 + 登录 + 入项目（role 可变）拿 token（goldmine 先例） */
async function registerAndJoin(prefix: string, role: 'viewer' | 'editor'): Promise<string> {
  const uniq = Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
  const reg = await request(b.app)
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${b.adminToken}`)
    .send({ username: `${prefix}${uniq}`, password: 'Member123!', nickname: '克隆测试员' });
  expect(reg.status).toBe(201);
  const login = await request(b.app).post('/api/v1/auth/login')
    .send({ username: `${prefix}${uniq}`, password: 'Member123!' });
  const token = login.body.data.accessToken as string;
  const userId = login.body.data.user.id as string;
  await b.prisma.projectMember.create({
    data: { projectId, userId, role },
  });
  return token;
}

/** 注册 + 登录但不入项目（outsider 用） */
async function registerOnly(prefix: string): Promise<string> {
  const uniq = Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);
  const reg = await request(b.app)
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${b.adminToken}`)
    .send({ username: `${prefix}${uniq}`, password: 'Member123!', nickname: '局外人' });
  expect(reg.status).toBe(201);
  const login = await request(b.app).post('/api/v1/auth/login')
    .send({ username: `${prefix}${uniq}`, password: 'Member123!' });
  return login.body.data.accessToken as string;
}

beforeAll(async () => {
  b = await setupServerWithDb();

  const admin = await b.prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  adminId = admin.id;
  const project = await b.prisma.project.create({
    data: { name: `克隆项目-${Date.now()}`, icon: 'folder', createdBy: admin.id, updatedBy: admin.id },
  });
  projectId = project.id;

  viewerToken = await registerAndJoin('cloneview', 'viewer');
  outsiderToken = await registerOnly('cloneout');
}, 120_000);

afterAll(() => teardownServerWithDb(b));

// ─── 基础行为 ───

describe('POST /connections/:id/clone 基础行为', () => {
  it('克隆成功 → 201 + 新名「src (副本)」+ clonedFrom=原 id + lastAccessed null（不继承访问时间）', async () => {
    // 造数直设 lastAccessed（避免 API 触发 touchLastAccessed 异步 race——造数层显式覆盖，断言确定性）
    const created = await apiCreateConnection(b.adminToken, {
      projectId, name: 'CloneSrc', host: 'src.example.com', username: 'op', password: 'S3cretP@ss!', protocol: 'SSH',
    });
    expect(created.status).toBe(201);
    const srcId = created.body.data.id as string;
    await b.prisma.connection.update({
      where: { id: srcId },
      data: { lastAccessed: new Date('2026-06-01T00:00:00Z') },
    });

    const res = await apiClone(b.adminToken, srcId);
    expect(res.status).toBe(201);
    const data = res.body.data;
    expect(data.name).toBe('CloneSrc (副本)');
    expect(data.clonedFrom).toBe(srcId);
    expect(data.lastAccessed).toBeNull();
    // 克隆即新建：新 id ≠ 原 id
    expect(data.id).not.toBe(srcId);
    // 字段复制：host/username/protocol/tags/notes 同原件
    expect(data.host).toBe('src.example.com');
    expect(data.username).toBe('op');
    expect(data.protocol).toBe('SSH');
    // detail 形状与既有一致：明文/密文不回传（includeEncryptedPass=false）
    expect(data).not.toHaveProperty('password');
    expect(data).not.toHaveProperty('encryptedPass');
  });

  it('库内密文串严格等价（原样复制不重加密）+ decrypt-password 明文一致（真库真密钥端到端）', async () => {
    const created = await apiCreateConnection(b.adminToken, {
      projectId, name: 'CryptoSrc', host: 'crypto.example.com', username: 'op', password: ' CryptoP@ss2026', protocol: 'SSH',
    });
    expect(created.status).toBe(201);
    const srcId = created.body.data.id as string;

    const res = await apiClone(b.adminToken, srcId);
    expect(res.status).toBe(201);
    const cloneId = res.body.data.id as string;

    const srcRow = await b.prisma.connection.findUniqueOrThrow({ where: { id: srcId } });
    const cloneRow = await b.prisma.connection.findUniqueOrThrow({ where: { id: cloneId } });
    // 密文原样复制（AES-GCM IV 随机——若实现走 decrypt+encrypt 两串必不等；严格等价 ⇔ 复制路径正确）
    expect(cloneRow.encryptedPass).toBe(srcRow.encryptedPass);
    expect(cloneRow.encryptedPass).not.toBeNull();

    // 明文等价（真密钥解密）：两端点各取明文对比
    const srcPlain = await apiDecrypt(b.adminToken, srcId);
    const clonePlain = await apiDecrypt(b.adminToken, cloneId);
    expect(srcPlain).toBe(' CryptoP@ss2026');
    expect(clonePlain).toBe(srcPlain);
  });

  it('连续克隆原件三级递增：(副本) → (副本) 2 → (副本) 3（真库 @@unique 避让）', async () => {
    const created = await apiCreateConnection(b.adminToken, {
      projectId, name: 'RecSrc', host: 'rec.example.com', username: 'op', protocol: 'SSH',
    });
    expect(created.status).toBe(201);
    const srcId = created.body.data.id as string;

    const c1 = await apiClone(b.adminToken, srcId);
    expect(c1.status).toBe(201);
    expect(c1.body.data.name).toBe('RecSrc (副本)');

    const c2 = await apiClone(b.adminToken, srcId);
    expect(c2.status).toBe(201);
    expect(c2.body.data.name).toBe('RecSrc (副本) 2');

    const c3 = await apiClone(b.adminToken, srcId);
    expect(c3.status).toBe(201);
    expect(c3.body.data.name).toBe('RecSrc (副本) 3');
  });
});

// ─── 边界与权限（editor 门）───

describe('clone 权限与边界', () => {
  it('不存在的连接 → admin 404（CONN_002，service 数据边界）', async () => {
    const res = await apiClone(b.adminToken, 'no-such-conn-id');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONN_002');
  });

  it('viewer 克隆 → 403（projectRole editor 门）', async () => {
    const created = await apiCreateConnection(b.adminToken, {
      projectId, name: 'PermSrc', host: 'perm.example.com', username: 'op', protocol: 'SSH',
    });
    expect(created.status).toBe(201);
    const res = await apiClone(viewerToken, created.body.data.id as string);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_003');
  });

  it('非成员 outsider 克隆 → 403', async () => {
    const created = await apiCreateConnection(b.adminToken, {
      projectId, name: 'OutSrc', host: 'out.example.com', username: 'op', protocol: 'SSH',
    });
    expect(created.status).toBe(201);
    const res = await apiClone(outsiderToken, created.body.data.id as string);
    expect(res.status).toBe(403);
  });
});

// ─── 审计（memory integration-audit-side-effect-count：action + resourceId 过滤）───

describe('clone 审计', () => {
  it('克隆成功 → CONNECTION_CREATE 行 resourceId=新 id + detail.after.clonedFrom=原 id + result success', async () => {
    const created = await apiCreateConnection(b.adminToken, {
      projectId, name: 'AuditSrc', host: 'audit.example.com', username: 'op', password: 'AuditP@ss1', protocol: 'SSH',
    });
    expect(created.status).toBe(201);
    const srcId = created.body.data.id as string;
    const res = await apiClone(b.adminToken, srcId);
    expect(res.status).toBe(201);
    const cloneId = res.body.data.id as string;

    const logs = await b.prisma.auditLog.findMany({
      where: { action: 'CONNECTION_CREATE', resource: 'connection', resourceId: cloneId },
    });
    expect(logs.length).toBe(1);
    expect(logs[0]!.result).toBe('success');
    expect(logs[0]!.userId).toBe(adminId); // 操作人 = 发起克隆的 admin
    const detail = JSON.parse(logs[0]!.detail ?? '{}') as { after?: Record<string, unknown> };
    expect(detail.after?.clonedFrom).toBe(srcId);
    expect(detail.after?.name).toBe('AuditSrc (副本)');
  });
});
