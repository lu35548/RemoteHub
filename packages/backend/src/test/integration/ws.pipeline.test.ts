// packages/backend/src/test/integration/ws.pipeline.test.ts
// #34 WS 管道集成：真实 http server（listen(0)）+ ws 客户端全链路。
// 覆盖：cookie 鉴权 401/成功、房间 join/leave 权限、广播路由、心跳踢死链、graceful shutdown。
import '../helpers/env.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import type { WebSocketServer } from 'ws';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

// ─── 状态 ───
let b: ServerBootstrap;
let wss: WebSocketServer;
let wsMod: typeof import('../../ws/wsServer.js');
let port: number;
let user1Id: string;
let user2Id: string;
let projectId: string;
let user1Cookie: string;
let user2Cookie: string;
let adminCookie: string;
let expiredCookie: string;
let disabledCookie: string;

/** 造一条 session，返回可直连 WS 的 cookie 串 */
async function makeSession(userId: string, opts?: { expired?: boolean; disabledUser?: boolean }): Promise<string> {
  const { hashRefreshToken } = await import('../../utils/jwt.js');
  const token = 'ws-test-token-' + Math.random().toString(36).slice(2);
  await b.prisma.session.create({ data: {
    userId,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(Date.now() + 3600_000),
  } });
  if (opts?.disabledUser) {
    await b.prisma.user.update({ where: { id: userId }, data: { isActive: false } });
  }
  if (opts?.expired) {
    await b.prisma.session.updateMany({ where: { tokenHash: hashRefreshToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
  }
  return 'refreshToken=' + token;
}

/** ws 客户端连接 promise 化；reject 带 status（握手失败时 ws 客户端 emit error: unexpected-server-response: NNN） */
function wsConnect(cookie?: string): Promise<{ ws: WebSocket; closeCode: number }> {
  return new Promise((resolve, reject) => {
    const headers = cookie ? { cookie } : {};
    const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/ws`, { headers });
    ws.on('open', () => resolve({ ws, closeCode: 0 }));
    ws.on('error', (err) => reject(Object.assign(err, { wsStatus: String(err.message) })));
  });
}

/** 等下一条消息（超时 2s 返回 null，供「不应收到」断言） */
function nextMessage(ws: WebSocket, timeoutMs = 2000): Promise<Record<string, unknown> | null> {
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

// ─── beforeAll / afterAll ───

beforeAll(async () => {
  b = await setupServerWithDb();
  wsMod = await import('../../ws/wsServer.js');
  wss = wsMod.initWsServer(b.server, { heartbeatIntervalMs: 50 });
  await new Promise<void>((resolve) => b.server.listen(0, () => resolve()));
  port = (b.server.address() as AddressInfo).port;

  const u1 = await b.prisma.user.create({ data: { username: 'wsuser1', nickname: 'ws用户一', passwordHash: 'x' } });
  const u2 = await b.prisma.user.create({ data: { username: 'wsuser2', nickname: 'ws用户二', passwordHash: 'x' } });
  user1Id = u1.id; user2Id = u2.id;
  projectId = (await b.prisma.project.create({ data: { name: 'ws-proj-1', createdBy: user1Id, updatedBy: user1Id } })).id;
  await b.prisma.projectMember.create({ data: { projectId, userId: user1Id, role: 'editor' } });

  const u3 = await b.prisma.user.create({ data: { username: 'wsuser3', nickname: 'ws用户三', passwordHash: 'x' } });
  user1Cookie = await makeSession(user1Id);
  user2Cookie = await makeSession(user2Id);
  adminCookie = await makeSession((await b.prisma.user.findUnique({ where: { username: 'admin' } }))!.id);
  expiredCookie = await makeSession(user2Id, { expired: true });
  disabledCookie = await makeSession(u3.id, { disabledUser: true });
}, 120_000);

afterAll(async () => {
  wsMod.closeWsServer();
  await new Promise<void>((resolve) => b.server.close(() => resolve()));
  await teardownServerWithDb(b);
});


// ─── 鉴权 ───

describe('WS upgrade 鉴权', () => {
  it('有效 session cookie → 连接成功', async () => {
    const { ws } = await wsConnect(user1Cookie);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('无 cookie → 401 拒绝', async () => {
    await expect(wsConnect()).rejects.toThrow(/401/);
  });

  it('伪造 token（无对应 session）→ 401', async () => {
    await expect(wsConnect('refreshToken=deadbeefdeadbeef')).rejects.toThrow(/401/);
  });

  it('过期 session → 401', async () => {
    await expect(wsConnect(expiredCookie)).rejects.toThrow(/401/);
  });

  it('禁用用户 → 401', async () => {
    await expect(wsConnect(disabledCookie)).rejects.toThrow(/401/);
  });

  it('非 WS 路径 upgrade → 直接断开（客户端报错，非 401 语义）', async () => {
    await expect((async () => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/api/v1/other`, { headers: { cookie: user1Cookie } });
      await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
    })()).rejects.toThrow();
  });
});

// ─── 房间 ───

describe('房间 join/leave', () => {
  it('成员 join project 房间 → joined 回执', async () => {
    const { ws } = await wsConnect(user1Cookie);
    ws.send(JSON.stringify({ type: 'join', payload: { room: `project:${projectId}` } }));
    const msg = await nextMessage(ws);
    expect(msg?.type).toBe('joined');
    expect((msg?.payload as { room: string }).room).toBe(`project:${projectId}`);
    ws.close();
  });

  it('非成员 join project 房间 → denied', async () => {
    const { ws } = await wsConnect(user2Cookie);
    ws.send(JSON.stringify({ type: 'join', payload: { room: `project:${projectId}` } }));
    const msg = await nextMessage(ws);
    expect(msg?.type).toBe('denied');
    ws.close();
  });

  it('admin 可 join 任意 project 房间', async () => {
    const { ws } = await wsConnect(adminCookie);
    ws.send(JSON.stringify({ type: 'join', payload: { room: `project:${projectId}` } }));
    const msg = await nextMessage(ws);
    expect(msg?.type).toBe('joined');
    ws.close();
  });

  it('admin join admin 房间 → joined', async () => {
    const { ws } = await wsConnect(adminCookie);
    ws.send(JSON.stringify({ type: 'join', payload: { room: 'admin' } }));
    const msg = await nextMessage(ws);
    expect(msg?.type).toBe('joined');
    ws.close();
  });

  it('普通用户 join admin 房间 → denied', async () => {
    const { ws } = await wsConnect(user1Cookie);
    ws.send(JSON.stringify({ type: 'join', payload: { room: 'admin' } }));
    const msg = await nextMessage(ws);
    expect(msg?.type).toBe('denied');
    ws.close();
  });

  it('未知房间名 → denied', async () => {
    const { ws } = await wsConnect(user1Cookie);
    ws.send(JSON.stringify({ type: 'join', payload: { room: 'garage' } }));
    const msg = await nextMessage(ws);
    expect(msg?.type).toBe('denied');
    ws.close();
  });

  it('leave 房间 → left 回执', async () => {
    const { ws } = await wsConnect(user1Cookie);
    ws.send(JSON.stringify({ type: 'join', payload: { room: `project:${projectId}` } }));
    await nextMessage(ws);
    ws.send(JSON.stringify({ type: 'leave', payload: { room: `project:${projectId}` } }));
    const msg = await nextMessage(ws);
    expect(msg?.type).toBe('left');
    ws.close();
  });
});

// ─── 广播基建（#35/#36 接线点）───

describe('广播路由', () => {
  it('sendToProject 只达房间内成员；sendToUser 精确路由；sendToAdmins 只达 admin', async () => {
    const c1 = await wsConnect(user1Cookie);   // project 房间成员
    c1.ws.send(JSON.stringify({ type: 'join', payload: { room: `project:${projectId}` } }));
    await nextMessage(c1.ws);
    const c2 = await wsConnect(user1Cookie);   // 同用户第二连接（sendToUser 双路验证）
    c2.ws.send(JSON.stringify({ type: 'join', payload: { room: `project:${projectId}` } }));
    await nextMessage(c2.ws);
    const ca = await wsConnect(adminCookie);
    ca.ws.send(JSON.stringify({ type: 'join', payload: { room: 'admin' } }));
    await nextMessage(ca.ws);
    const c3 = await wsConnect(user2Cookie);   // 房间外对照
    const msg3 = nextMessage(c3.ws, 300); // 房间外不应收到任何广播

    wsMod.sendToProject(projectId, { type: 'connection_updated', payload: { projectId } });
    expect((await nextMessage(c1.ws))?.type).toBe('connection_updated');
    expect((await nextMessage(c2.ws))?.type).toBe('connection_updated');
    expect(await msg3).toBeNull();
    expect(await nextMessage(ca.ws, 300)).toBeNull();

    wsMod.sendToUser(user1Id, { type: 'system_alert', payload: {} });
    expect((await nextMessage(c1.ws))?.type).toBe('system_alert');
    expect((await nextMessage(c2.ws))?.type).toBe('system_alert');
    expect(await nextMessage(c3.ws, 300)).toBeNull();

    wsMod.sendToAdmins({ type: 'system_alert', payload: {} });
    expect((await nextMessage(ca.ws))?.type).toBe('system_alert');
    expect(await nextMessage(c1.ws, 300)).toBeNull();

    c1.ws.close(); c2.ws.close(); c3.ws.close(); ca.ws.close();
  });
});

// ─── 心跳与关停 ───

describe('心跳踢死链', () => {
  it('isAlive=false（模拟未回 pong）→ 下一轮 ping 被 terminate', async () => {
    const { ws } = await wsConnect(user1Cookie);
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        for (const c of wss.clients) (c as { isAlive?: boolean }).isAlive = false;  // 注入：错过 pong
        if (ws.readyState === WebSocket.CLOSED) { clearInterval(check); resolve(); }
      }, 30);
    });
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  });
});

describe('graceful shutdown', () => {
  it('shutdown 后 WS 全断 + server 关闭（SIGTERM handler 复用此函数，单测直调不 exit）', async () => {
    const c1 = await wsConnect(user1Cookie);
    const c2 = await wsConnect(adminCookie);
    const closed = new Promise<void>((resolve) => { c1.ws.on('close', () => resolve()); });
    const serverClosed = new Promise<void>((resolve) => { b.server.on('close', () => resolve()); });

    const serverMod = await import('../../server.js');
    await serverMod.gracefulShutdown();

    await closed;
    expect(c1.ws.readyState).toBe(WebSocket.CLOSED);
    expect(c2.ws.readyState).toBe(WebSocket.CLOSED);
    await serverClosed;
    // terminate 后服务端 clients 集合在 ws 'close' 事件轮转才移除，waitFor 等清空
    await vi.waitFor(() => expect(wss.clients.size).toBe(0), { timeout: 2000 });
  });
});
