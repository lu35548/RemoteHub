// packages/backend/src/test/integration/notify.emit.test.ts
// #36 事件源接线集成：六类事件源触发真实动作（service/检测器真实调用 + 真库 + 真 WS 管道）
// → 在线目标连接收到对应 WS 消息 + NotificationQueue 落行（断言 type/payload 字段值）。
// 可疑 IP 优先送达 = 直推断言：admin 在线连接在触发后即时收到（sendToUser 直推，无排队延迟依赖）。
// 消息形状 {type, payload} 无 timestamp（design §8.3 偏离已在 #35 裁决记录）。
//
// 时序要点：emit 是 fire-and-forget——WS 消息可能先于 HTTP 响应到达客户端，而 'ws' 的
// message 事件零监听器时即丢（不缓冲回放）。所有用例必须**先挂 nextMessage 监听、再触发动作**
// （探针实证：消息在触发后 ~1ms 内直达，晚挂监听 = 稳定性竞态）。
import '../helpers/env.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

// ─── 状态 ───
let b: ServerBootstrap;
let wsMod: typeof import('../../ws/wsServer.js');
let port: number;

let adminId: string;
let ownerId: string;
let viewerId: string;
let joinerId: string;
let projectId: string;
let ownerToken: string;
let ownerCookie: string;
let viewerCookie: string;
let joinerCookie: string;

const PASSWORD = 'Emit123456!';

/** 造一条 session，返回可直连 WS 的 cookie 串（ws.pipeline 先例） */
async function makeSession(userId: string): Promise<string> {
  const { hashRefreshToken } = await import('../../utils/jwt.js');
  const token = 'emit-test-' + Math.random().toString(36).slice(2);
  await b.prisma.session.create({ data: {
    userId,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + 3600_000),
  } });
  return 'refreshToken=' + token;
}

function wsConnect(cookie?: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/ws`, { headers: cookie ? { cookie } : {} });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** 等下一条消息（超时返回 null，供「不应收到」断言）。务必在触发动作前调用挂上监听。 */
function nextMessage(ws: WebSocket, timeoutMs = 3000): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { ws.removeListener('message', onMsg); resolve(null); }, timeoutMs);
    function onMsg(data: unknown): void {
      clearTimeout(timer);
      ws.removeListener('message', onMsg);
      resolve(JSON.parse((data as Buffer).toString()));
    }
    ws.on('message', onMsg);
  });
}

async function login(username: string, password: string): Promise<string> {
  const res = await request(b.app).post('/api/v1/auth/login').send({ username, password });
  expect(res.status).toBe(200);
  return res.body.data.accessToken as string;
}

// ─── beforeAll / afterAll ───

beforeAll(async () => {
  b = await setupServerWithDb();
  wsMod = await import('../../ws/wsServer.js');
  wsMod.initWsServer(b.server, { heartbeatIntervalMs: 120_000 }); // 长心跳：本文件不测踢死链，避免噪声
  await new Promise<void>((resolve) => b.server.listen(0, () => resolve()));
  port = (b.server.address() as AddressInfo).port;

  adminId = (await b.prisma.user.findUnique({ where: { username: 'admin' } }))!.id;
  const hash = bcrypt.hashSync(PASSWORD, 10);
  const owner = await b.prisma.user.create({ data: { username: 'emitowner', nickname: '接线所有者', passwordHash: hash } });
  const viewer = await b.prisma.user.create({ data: { username: 'emitviewer', nickname: '接线观察者', passwordHash: hash } });
  const joiner = await b.prisma.user.create({ data: { username: 'emitjoiner', nickname: '接线新成员', passwordHash: hash } });
  ownerId = owner.id; viewerId = viewer.id; joinerId = joiner.id;

  projectId = (await b.prisma.project.create({ data: { name: 'emit-接线项目', createdBy: ownerId, updatedBy: ownerId } })).id;
  await b.prisma.projectMember.create({ data: { projectId, userId: ownerId, role: 'owner' } });
  await b.prisma.projectMember.create({ data: { projectId, userId: viewerId, role: 'viewer' } });

  ownerToken = await login('emitowner', PASSWORD);
  ownerCookie = await makeSession(ownerId);
  viewerCookie = await makeSession(viewerId);
  joinerCookie = await makeSession(joinerId);
}, 120_000);

afterAll(async () => {
  wsMod.closeWsServer();
  await new Promise<void>((resolve) => b.server.close(() => resolve()));
  await teardownServerWithDb(b);
});

// ─── 六类事件源（文件内顺序即生命周期：连接创建 → 成员添加 → 角色变更 → 成员移除）───

describe('#36 事件源接线（触发真实动作 → WS 收到 + Queue 落行）', () => {
  it('可疑 IP 告警：checkIpRisk 阈值触发 → admin 在线连接即时收到 SYSTEM_ALERT + Queue 落行（直推优先送达）', async () => {
    const wsAdmin = await wsConnect(await makeSession(adminId));
    const msgP = nextMessage(wsAdmin); // 先挂监听再触发（时序要点）

    // 直调真实检测器（server 链同代模块实例）：1001 次打满阈值，alerted 一窗一次
    const ipMod = await import('../../utils/ipMonitor.js');
    for (let i = 0; i < 1001; i++) ipMod.checkIpRisk('203.0.113.77', '/api/v1/projects');

    // 优先送达：触发后 admin 在线连接直推即时收到（sendToUser，无排队/轮询依赖）
    const msg = await msgP;
    expect(msg?.type).toBe('SYSTEM_ALERT');
    expect(msg?.payload).toMatchObject({ ip: '203.0.113.77', requestCount: 1001, window: '60s' });

    // Queue 落行（payload 字段值断言）
    const rows = await b.prisma.notificationQueue.findMany({ where: { userId: adminId, type: 'SYSTEM_ALERT' } });
    expect(rows).toHaveLength(1);
    const [alertRow] = rows;
    if (!alertRow) throw new Error('SYSTEM_ALERT Queue 行缺失');
    expect(JSON.parse(alertRow.payload)).toMatchObject({ ip: '203.0.113.77', requestCount: 1001, window: '60s' });
    // 既有审计行为不回归（同一触发点双写）
    expect(await b.prisma.auditLog.count({ where: { action: 'SECURITY_SUSPICIOUS_IP', ip: '203.0.113.77' } })).toBe(1);
    wsAdmin.close();
  });

  it('强制登出：改密撤 session → 本人在线连接收到 FORCE_LOGOUT + Queue 落行', async () => {
    const hash = bcrypt.hashSync(PASSWORD, 10);
    const victim = await b.prisma.user.create({ data: { username: 'emitvictim', nickname: '接线受害者', passwordHash: hash } });
    const token = await login('emitvictim', PASSWORD); // login 建 session（改密将全撤）
    const wsVictim = await wsConnect(await makeSession(victim.id)); // 第二条 session 供 WS upgrade
    expect(await b.prisma.session.count({ where: { userId: victim.id } })).toBe(2);
    const msgP = nextMessage(wsVictim); // 先挂监听再触发

    const res = await request(b.app).post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ oldPassword: PASSWORD, newPassword: 'NewEmit123456!' });
    expect(res.status).toBe(200);

    // session 全撤（既有安全契约）；WS 连接 upgrade 时已鉴权不受影响 → FORCE_LOGOUT 直达
    expect(await b.prisma.session.count({ where: { userId: victim.id } })).toBe(0);
    const msg = await msgP;
    expect(msg?.type).toBe('FORCE_LOGOUT');
    expect(msg?.payload).toMatchObject({ reason: 'password_changed' });

    const rows = await b.prisma.notificationQueue.findMany({ where: { userId: victim.id, type: 'FORCE_LOGOUT' } });
    expect(rows).toHaveLength(1);
    const [logoutRow] = rows;
    if (!logoutRow) throw new Error('FORCE_LOGOUT Queue 行缺失');
    expect(JSON.parse(logoutRow.payload)).toMatchObject({ reason: 'password_changed' });
    wsVictim.close();
  });

  it('连接创建 → 项目全体成员收到 CONNECTION_UPDATED + 每成员 Queue 落行；非成员零打扰', async () => {
    const wsOwner = await wsConnect(ownerCookie);
    const wsViewer = await wsConnect(viewerCookie);
    const wsOutsider = await wsConnect(joinerCookie); // joiner 此刻尚非成员（成员添加用例在其后）
    const ownerMsgP = nextMessage(wsOwner);   // 先挂监听再触发
    const viewerMsgP = nextMessage(wsViewer);
    const outsiderSilence = nextMessage(wsOutsider, 400);

    const res = await request(b.app).post('/api/v1/connections')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ projectId, name: 'emit连接一', host: '10.1.1.1', port: 3389, protocol: 'RDP' });
    expect(res.status).toBe(201);
    const connectionId = res.body.data.id as string;

    for (const msg of [await ownerMsgP, await viewerMsgP]) {
      expect(msg?.type).toBe('CONNECTION_UPDATED');
      expect(msg?.payload).toMatchObject({ projectId, connectionId, action: 'created', name: 'emit连接一' });
    }
    expect(await outsiderSilence).toBeNull();

    const rows = await b.prisma.notificationQueue.findMany({ where: { type: 'CONNECTION_UPDATED', userId: { in: [ownerId, viewerId] } } });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(JSON.parse(r.payload)).toMatchObject({ projectId, connectionId, action: 'created', name: 'emit连接一' });
    }
    wsOwner.close(); wsViewer.close(); wsOutsider.close();
  });

  it('成员添加 → MEMBER_ADDED 达全体成员（含新成员本人）+ 每成员 Queue 落行', async () => {
    const wsOwner = await wsConnect(ownerCookie);
    const wsViewer = await wsConnect(viewerCookie);
    const wsJoiner = await wsConnect(joinerCookie); // 新成员本人在线（快照后置：添加后查询含本人）
    const msgsP = [nextMessage(wsOwner), nextMessage(wsViewer), nextMessage(wsJoiner)]; // 先挂监听再触发

    const res = await request(b.app).post(`/api/v1/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ userId: joinerId, role: 'editor' });
    expect(res.status).toBe(201);

    for (const msg of await Promise.all(msgsP)) {
      expect(msg?.type).toBe('MEMBER_ADDED');
      expect(msg?.payload).toMatchObject({ projectId, userId: joinerId, username: 'emitjoiner', role: 'editor' });
    }
    const rows = await b.prisma.notificationQueue.findMany({ where: { type: 'MEMBER_ADDED', userId: { in: [ownerId, viewerId, joinerId] } } });
    expect(rows).toHaveLength(3);
    wsOwner.close(); wsViewer.close(); wsJoiner.close();
  });

  it('角色变更 → MEMBER_ROLE_UPDATED 达全体成员 + Queue 落行', async () => {
    const wsOwner = await wsConnect(ownerCookie);
    const msgP = nextMessage(wsOwner); // 先挂监听再触发

    const res = await request(b.app).patch(`/api/v1/projects/${projectId}/members/${joinerId}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ role: 'viewer' });
    expect(res.status).toBe(200);

    const msg = await msgP;
    expect(msg?.type).toBe('MEMBER_ROLE_UPDATED');
    expect(msg?.payload).toMatchObject({ projectId, userId: joinerId, role: 'viewer' });

    const rows = await b.prisma.notificationQueue.findMany({ where: { type: 'MEMBER_ROLE_UPDATED' } });
    expect(rows).toHaveLength(3); // owner + viewer + joiner 三名成员各一行
    for (const r of rows) {
      expect(JSON.parse(r.payload)).toMatchObject({ projectId, userId: joinerId, role: 'viewer' });
    }
    wsOwner.close();
  });

  it('成员移除 → MEMBER_REMOVED 达剩余成员；被移除者零打扰（快照后置）', async () => {
    const wsOwner = await wsConnect(ownerCookie);
    const wsJoiner = await wsConnect(joinerCookie); // 被移除者在线：不应收到
    const ownerMsgP = nextMessage(wsOwner);          // 先挂监听再触发
    const joinerSilence = nextMessage(wsJoiner, 400);

    const res = await request(b.app).delete(`/api/v1/projects/${projectId}/members/${joinerId}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(res.status).toBe(200);

    const msg = await ownerMsgP;
    expect(msg?.type).toBe('MEMBER_REMOVED');
    expect(msg?.payload).toMatchObject({ projectId, userId: joinerId });
    expect(await joinerSilence).toBeNull();

    const rows = await b.prisma.notificationQueue.findMany({ where: { type: 'MEMBER_REMOVED', userId: { in: [ownerId, viewerId] } } });
    expect(rows).toHaveLength(2);
    // 被移除者无 Queue 行（成员快照查询发生在删除之后）
    expect(await b.prisma.notificationQueue.count({ where: { type: 'MEMBER_REMOVED', userId: joinerId } })).toBe(0);
    wsOwner.close(); wsJoiner.close();
  });
});
