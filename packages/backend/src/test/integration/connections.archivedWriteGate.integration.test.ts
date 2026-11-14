// 批 13b 票 A1（OQ 批 10 挂账 #30 落地）：归档项目连接域端点级写禁制。
// 拦截语义（lead 裁决）：目标项目 status=archived → 连接写入操作一律 409 CONN_007
// 「项目已归档，连接不可变更」（admin 不豁免——「一律」语义）；读端点（list/get/stats/launch）
// 不拦——归档=只读展示+消费语义。换项目双向（源/目标 archived）+ requiredVpnId 依赖侧同拦。
// 审计留痕：gate 抛 409 后由前置 auditMiddleware 自动落 failure 行（detail.reason=CONN_007），
// resourceId 对 id 路由取 params.id（连接实体存在），create 拒绝行 resourceId=null（连接尚不存在）。
// 限流前置（projects.management 先例：config/env.ts import 期快照，须先于第一个 import）
process.env.RATE_LIMIT_REGISTER_MAX = '1000';
process.env.RATE_LIMIT_LOGIN_MAX = '1000';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;
let ownerToken = '';
let ownerUserId = '';
let editorToken = '';
let editorUserId = '';
let activeProjId = '';
let arcProjId = '';
let connArcId = ''; // 归档项目普通 SSH 连接（update/delete/clone/源侧换项目用例的靶）
let vpnArcId = '';  // 归档项目 VPN（依赖侧用例的靶）
let depArcId = '';  // 归档项目内依赖 vpnArc 的连接（既有依赖在读语义下不受影响）
let connActId = ''; // 活跃项目 SSH 连接（目标侧换项目/依赖侧用例的靶）
let vpnActId = '';  // 活跃项目 VPN（活跃回归用例的依赖靶）

async function registerUser(prefix: string, nickname: string): Promise<{ token: string; userId: string }> {
  const uniq = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
  const reg = await request(b.app)
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${b.adminToken}`)
    .send({ username: `${prefix}${uniq}`, password: 'Member123!', nickname });
  expect(reg.status).toBe(201);
  const login = await request(b.app).post('/api/v1/auth/login')
    .send({ username: `${prefix}${uniq}`, password: 'Member123!' });
  return { token: login.body.data.accessToken as string, userId: login.body.data.user.id as string };
}

async function join(projectId: string, userId: string, role: 'owner' | 'editor' | 'viewer') {
  await b.prisma.projectMember.create({ data: { projectId, userId, role } });
}

/** 审计行异步落库（auditMiddleware setImmediate）——轮询等待（批 12 clone 审计行 flaky 先例） */
async function waitForAudit(where: Record<string, unknown>, min = 1): Promise<void> {
  await vi.waitFor(async () => {
    const rows = await b.prisma.auditLog.findMany({ where });
    expect(rows.length).toBeGreaterThanOrEqual(min);
  }, { timeout: 5_000, interval: 100 });
}

const apiCreate = (token: string, body: Record<string, unknown>) =>
  request(b.app).post('/api/v1/connections').set('Authorization', `Bearer ${token}`).send(body);
const apiUpdate = (token: string, id: string, body: Record<string, unknown>) =>
  request(b.app).patch(`/api/v1/connections/${id}`).set('Authorization', `Bearer ${token}`).send(body);
const apiDelete = (token: string, id: string) =>
  request(b.app).delete(`/api/v1/connections/${id}`).set('Authorization', `Bearer ${token}`);
const apiClone = (token: string, id: string) =>
  request(b.app).post(`/api/v1/connections/${id}/clone`).set('Authorization', `Bearer ${token}`).send({});

beforeAll(async () => {
  b = await setupServerWithDb();

  const owner = await registerUser('agown', '写禁制-owner');
  ownerToken = owner.token;
  ownerUserId = owner.userId;
  const editor = await registerUser('aedit', '写禁制-editor');
  editorToken = editor.token;
  editorUserId = editor.userId;

  // 活跃项目：owner 建 + editor 入组（写权角色齐备，拒绝只能来自归档门而非 403 权限门）
  const active = await request(b.app).post('/api/v1/projects')
    .set('Authorization', `Bearer ${ownerToken}`).send({ name: `写禁制活跃项目-${Date.now()}` });
  expect(active.status).toBe(201);
  activeProjId = active.body.data.id as string;
  await join(activeProjId, editorUserId, 'editor');

  // 归档实验田：owner 建 + editor 入组 + 三连接（SSH / VPN / 依赖该 VPN 的 SSH）
  const arc = await request(b.app).post('/api/v1/projects')
    .set('Authorization', `Bearer ${ownerToken}`).send({ name: `写禁制归档项目-${Date.now()}` });
  expect(arc.status).toBe(201);
  arcProjId = arc.body.data.id as string;
  await join(arcProjId, editorUserId, 'editor');

  const mk = async (projectId: string, body: Record<string, unknown>) => {
    const res = await apiCreate(ownerToken, { projectId, ...body });
    expect(res.status).toBe(201);
    return res.body.data as { id: string };
  };
  connActId = (await mk(activeProjId, { name: '活跃连接', host: 'act.example.com', username: 'op', protocol: 'SSH' })).id;
  vpnActId = (await mk(activeProjId, { name: '活跃VPN', host: 'vpn-act.example.com', username: 'op', protocol: 'VPN', vpnType: 'SSL_VPN', vpnLoginUrl: 'https://vpn-act.example.com' })).id;
  connArcId = (await mk(arcProjId, { name: '归档连接', host: 'arc.example.com', username: 'op', protocol: 'SSH', tags: 'frozen' })).id;
  vpnArcId = (await mk(arcProjId, { name: '归档VPN', host: 'vpn-arc.example.com', username: 'op', protocol: 'VPN', vpnType: 'SSL_VPN', vpnLoginUrl: 'https://vpn-arc.example.com' })).id;
  depArcId = (await mk(arcProjId, { name: '归档依赖连接', host: 'dep.example.com', username: 'op', protocol: 'SSH', requiredVpnId: vpnArcId })).id;

  // 归档实验田（写禁制用例全部在该状态下运行；「恢复后可写」describe 内再 restore）
  const archiveRes = await request(b.app).post(`/api/v1/projects/${arcProjId}/archive`)
    .set('Authorization', `Bearer ${ownerToken}`).send({});
  expect(archiveRes.status).toBe(200);
}, 240_000);

afterAll(() => teardownServerWithDb(b));

// ─── 写端点一律 409 CONN_007 ───

describe('归档项目连接写禁制：create/update/delete/clone → 409 CONN_007', () => {
  it('create：owner 与 editor（写权角色齐备）均 409 CONN_007，错误消息口径正确', async () => {
    for (const token of [ownerToken, editorToken]) {
      const res = await apiCreate(token, { projectId: arcProjId, name: '直写尝试', host: 'x.example.com', username: 'op', protocol: 'SSH' });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('CONN_007');
      expect(res.body.error.message).toBe('项目已归档，连接不可变更');
    }
    // 库内零新增（直写确实被拦，非仅响应口径）
    const count = await b.prisma.connection.count({ where: { projectId: arcProjId, name: '直写尝试' } });
    expect(count).toBe(0);
  });

  it('create：admin 亦拦（「一律」语义，权限直通不豁免归档门）', async () => {
    const res = await apiCreate(b.adminToken, { projectId: arcProjId, name: 'admin直写', host: 'x.example.com', username: 'op', protocol: 'SSH' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONN_007');
  });

  it('update：409 CONN_007 + 审计 failure 行（reason=CONN_007，resourceId=连接 id）', async () => {
    const res = await apiUpdate(ownerToken, connArcId, { name: '改名尝试' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONN_007');
    await waitForAudit({ action: 'CONNECTION_UPDATE', resource: 'connection', resourceId: connArcId, result: 'failure' });
    const rows = await b.prisma.auditLog.findMany({
      where: { action: 'CONNECTION_UPDATE', resource: 'connection', resourceId: connArcId, result: 'failure' },
    });
    expect(rows.some((r) => (r.detail as string | null)?.includes('CONN_007'))).toBe(true);
    // 库内未被改动
    expect((await b.prisma.connection.findUniqueOrThrow({ where: { id: connArcId } })).name).toBe('归档连接');
  });

  it('delete：409 CONN_007，连接未被删除', async () => {
    const res = await apiDelete(ownerToken, connArcId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONN_007');
    expect(await b.prisma.connection.findUnique({ where: { id: connArcId } })).not.toBeNull();
  });

  it('clone：409 CONN_007', async () => {
    const res = await apiClone(ownerToken, connArcId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONN_007');
  });

  it('审计：create 拒绝落 failure 行（resourceId=null——连接实体尚不存在，reason 可追溯）', async () => {
    await waitForAudit({ action: 'CONNECTION_CREATE', result: 'failure', userId: ownerUserId });
    const rows = await b.prisma.auditLog.findMany({
      where: { action: 'CONNECTION_CREATE', result: 'failure', userId: ownerUserId },
    });
    expect(rows.some((r) => (r.detail as string | null)?.includes('CONN_007'))).toBe(true);
  });
});

// ─── 换项目双向 + 依赖侧 ───

describe('换项目双向与 requiredVpnId 依赖侧', () => {
  it('目标侧：活跃连接换入归档项目 → 409 CONN_007（目标 archived 拒绝）', async () => {
    const res = await apiUpdate(ownerToken, connActId, { projectId: arcProjId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONN_007');
    // 未被移动
    expect((await b.prisma.connection.findUniqueOrThrow({ where: { id: connActId } })).projectId).toBe(activeProjId);
  });

  it('源侧：归档项目连接换出至活跃项目 → 409 CONN_007（源 archived 拒绝）', async () => {
    const res = await apiUpdate(ownerToken, connArcId, { projectId: activeProjId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONN_007');
  });

  it('依赖侧 update：活跃连接显式挂依赖指向归档项目 VPN → 409 CONN_007（先于 service 同项目 VAL_001）', async () => {
    const res = await apiUpdate(ownerToken, connActId, { requiredVpnId: vpnArcId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONN_007');
    expect((await b.prisma.connection.findUniqueOrThrow({ where: { id: connActId } })).requiredVpnId).toBeNull();
  });

  it('依赖侧 create：活跃项目新建连接依赖归档项目 VPN → 409 CONN_007', async () => {
    const res = await apiCreate(ownerToken, { projectId: activeProjId, name: '跨档依赖', host: 'd.example.com', username: 'op', protocol: 'SSH', requiredVpnId: vpnArcId });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONN_007');
  });
});

// ─── 读端点与消费语义不拦 ───

describe('读端点不拦（归档=只读展示+消费语义）', () => {
  it('list：归档项目连接仍在列表可见', async () => {
    const res = await request(b.app).get(`/api/v1/connections?projectId=${arcProjId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    const names = (res.body.data as Array<{ name: string }>).map((c) => c.name);
    expect(names).toContain('归档连接');
  });

  it('get：归档项目连接详情 200', async () => {
    const res = await request(b.app).get(`/api/v1/connections/${connArcId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(connArcId);
  });

  it('stats：归档项目连接统计 200（per-project 端点语义不变）', async () => {
    const res = await request(b.app).get(`/api/v1/projects/${arcProjId}/connections/stats`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.protocols).toEqual({ SSH: 2, VPN: 1 });
  });

  it('launch：归档项目连接直连 200（消费语义）', async () => {
    const res = await request(b.app).get(`/api/v1/connections/${connArcId}/launch`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('command');
  });

  it('既有依赖不受归档影响：归档项目内依赖 VPN 的连接详情含 requiredVpnId', async () => {
    const res = await request(b.app).get(`/api/v1/connections/${depArcId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.requiredVpnId).toBe(vpnArcId);
  });
});

// ─── 活跃项目回归（写禁制零误伤）───

describe('活跃项目全操作回归', () => {
  it('create → 201（含带依赖与不带依赖两形态）', async () => {
    const plain = await apiCreate(ownerToken, { projectId: activeProjId, name: '回归新增', host: 'r.example.com', username: 'op', protocol: 'SSH' });
    expect(plain.status).toBe(201);
    const withVpn = await apiCreate(ownerToken, { projectId: activeProjId, name: '回归依赖', host: 'r2.example.com', username: 'op', protocol: 'SSH', requiredVpnId: vpnActId });
    expect(withVpn.status).toBe(201);
  });

  it('update / clone / delete 正常', async () => {
    const upd = await apiUpdate(ownerToken, connActId, { notes: '回归备注' });
    expect(upd.status).toBe(200);
    const clone = await apiClone(ownerToken, connActId);
    expect(clone.status).toBe(201);
    const del = await apiDelete(ownerToken, clone.body.data.id as string);
    expect(del.status).toBe(200);
  });
});

// ─── 恢复后可写 ───

describe('恢复项目后写禁制解除', () => {
  it('restore → update 归档期连接恢复 200（且克隆可用）', async () => {
    const restore = await request(b.app).post(`/api/v1/projects/${arcProjId}/restore`)
      .set('Authorization', `Bearer ${ownerToken}`).send({});
    expect(restore.status).toBe(200);

    const upd = await apiUpdate(ownerToken, connArcId, { notes: '恢复后备注' });
    expect(upd.status).toBe(200);
    const clone = await apiClone(ownerToken, connArcId);
    expect(clone.status).toBe(201);
    // 清理克隆件，保持库面整洁（delete 回归活跃语义）
    expect((await apiDelete(ownerToken, clone.body.data.id as string)).status).toBe(200);
  });
});
