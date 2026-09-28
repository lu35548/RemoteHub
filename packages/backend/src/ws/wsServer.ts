// packages/backend/src/ws/wsServer.ts
// #34 WS 管道基建：连接鉴权 / 房间模型 / 心跳 / 广播辅助 / 生命周期管理。
//
// ─── 消息协议（#34 定版，前端 #37 票消费）───
// 客户端→服务端：{ type: 'join' | 'leave', payload: { room: string } }
// 服务端→客户端：{ type: 'joined' | 'left' | 'denied' | 'error', payload: { room?, message? } }
//
// ─── 房间模型（design §8.2）───
// project:{projectId}  项目房间——成员可入；admin 全局可入（管理员全局可见）
// admin                系统房间——仅 role === 'admin'
//
// ─── 升级鉴权（协议硬约束：浏览器 WS 无法带 Authorization header）───
// upgrade 时手解 cookie 头取 refreshToken → authService.validateRefreshSession
// （tokenHash + consumedAt + expiresAt + isActive，与 REST 通道同源，不旁路重用检测语义）。
// upgrade 请求不经过 express 中间件栈（cookie-parser 不会跑），必须在此手动解析。
// 失败写 HTTP 401 后 destroy（官方形态）；noServer 模式独占 upgrade 监听器，
// 避免 { server, path } 模式 ws 内部监听器的双监听器竞态（libcheck-ws §1 注意 #2）。
import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { validateRefreshSession } from '../services/authService.js';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

/** WS 端点路径（ws path 精确匹配；nginx/vite 两路反代同路径） */
export const WS_PATH = '/api/v1/ws';

/** 心跳间隔：30s < nginx proxy_read_timeout 60s 默认（libcheck-ws §4 定量） */
export const WS_HEARTBEAT_MS = 30_000;

/** 鉴权后的连接上下文（挂 ws 对象，供房间权限判定与定向广播） */
interface AuthedWs extends WebSocket {
  isAlive?: boolean;
  userId?: string;
  role?: string;
  rooms?: Set<string>;
}

// ─── 模块级状态（单实例语义，design §8.7：一期单实例内存管理）───

let wss: WebSocketServer | null = null;
let boundServer: HttpServer | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

/** 房间表：房间名 → 连接集合 */
const rooms = new Map<string, Set<AuthedWs>>();

/** 手解 cookie 头（cookie-parser 未导出 parse；refreshToken 是 hex 无特殊字符，手解足够） */
export function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    // decode 失败原样保留；同名键后值覆盖（与 cookie-parser 的 last-value-wins 一致，测试锁死）
    try {
      out[key] = decodeURIComponent(part.slice(eq + 1).trim());
    } catch {
      out[key] = part.slice(eq + 1).trim();
    }
  }
  return out;
}

/** upgrade 前置鉴权 + 分派（noServer 模式独占监听器）。
 * session 校验统一走 authService.validateRefreshSession（含 consumedAt 检查），
 * 不在 WS 层复制校验逻辑。 */
async function handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> {
  socket.on('error', () => { /* 客户端提前断开等：destroy 后的杂散错误不进 unhandled */ });
  const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (pathname !== WS_PATH) {
    socket.destroy();
    return;
  }
  const token = parseCookieHeader(req.headers.cookie).refreshToken;
  if (!token) {
    rejectUpgrade(socket);
    return;
  }
  let user: { userId: string; role: string } | null = null;
  try {
    user = await validateRefreshSession(token);
  } catch (err) {
    logger.error('WS 鉴权查询失败', { error: (err as Error).message });
  }
  if (!user) {
    rejectUpgrade(socket);
    return;
  }
  if (wss) {
    const server = wss; // 局部捕获：回调闭包内模块级 let 的 narrowing 失效
    server.handleUpgrade(req, socket, head, (ws) => {
      const aw = ws as AuthedWs;
      aw.userId = user.userId;
      aw.role = user.role;
      aw.rooms = new Set();
      server.emit('connection', aw, req);
    });
  } else {
    // closeWsServer 已置 wss=null 的窄竞态：在途 socket 不能静默挂起——
    // 不销毁会让 server.close 回调挂起，SIGTERM 退化为依赖容器 SIGKILL 兜底
    socket.destroy();
  }
}

/** 401 拒绝：升级请求无法走 res 管道，只能裸写 socket（官方形态） */
function rejectUpgrade(socket: Duplex): void {
  socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
  socket.destroy();
}

/** 房间权限判定 */
async function canJoinRoom(aw: AuthedWs, room: string): Promise<boolean> {
  if (room === 'admin') return aw.role === 'admin';
  if (room.startsWith('project:')) {
    const projectId = room.slice('project:'.length);
    if (!projectId) return false;
    if (aw.role === 'admin') return true;
    if (!aw.userId) return false;
    const member = await prisma.projectMember.findFirst({ where: { projectId, userId: aw.userId } });
    return member !== null;
  }
  return false;
}

/** 单播一条 JSON 消息（readyState 守卫） */
function sendTo(ws: WebSocket, message: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/** 连接生命周期：心跳标记 + 消息派发 + 清理 */
function onConnection(ws: WebSocket): void {
  const aw = ws as AuthedWs;
  aw.isAlive = true;
  aw.on('pong', () => { aw.isAlive = true; });

  aw.on('message', (data) => {
    let parsed: { type?: string; payload?: { room?: string } };
    try {
      parsed = JSON.parse((data as Buffer).toString());
    } catch {
      sendTo(aw, { type: 'error', payload: { message: '消息不是合法 JSON' } });
      return;
    }
    const room = parsed.payload?.room;
    if (parsed.type === 'join' && room) {
      void joinRoom(aw, room);
    } else if (parsed.type === 'leave' && room) {
      leaveRoom(aw, room);
      sendTo(aw, { type: 'left', payload: { room } });
    } else {
      sendTo(aw, { type: 'error', payload: { message: '未知的消息类型' } });
    }
  });

  aw.on('close', () => {
    if (aw.rooms) {
      for (const room of aw.rooms) {
        const set = rooms.get(room);
        if (set?.delete(aw) && set.size === 0) rooms.delete(room); // 空集回收，防房间表无限增长
      }
    }
  });

  aw.on('error', () => { /* close 会跟着来，房间清理走 close */ });
}

async function joinRoom(aw: AuthedWs, room: string): Promise<void> {
  let allowed = false;
  try {
    allowed = await canJoinRoom(aw, room);
  } catch (err) {
    logger.error('WS 房间权限查询失败', { error: (err as Error).message });
  }
  if (!allowed) {
    sendTo(aw, { type: 'denied', payload: { room } });
    return;
  }
  if (!rooms.has(room)) rooms.set(room, new Set());
  rooms.get(room)!.add(aw);
  aw.rooms?.add(room);
  sendTo(aw, { type: 'joined', payload: { room } });
}

function leaveRoom(aw: AuthedWs, room: string): void {
  const set = rooms.get(room);
  if (set?.delete(aw) && set.size === 0) rooms.delete(room); // 空集回收，防房间表无限增长
  aw.rooms?.delete(room);
}

// ─── 广播辅助（#35/#36 事件源接线点）───

/** 定向用户（其全部在线连接） */
export function sendToUser(userId: string, message: unknown): void {
  if (!wss) return;
  for (const client of wss.clients) {
    if ((client as AuthedWs).userId === userId) sendTo(client, message);
  }
}

/** 定向全体在线 admin */
export function sendToAdmins(message: unknown): void {
  if (!wss) return;
  for (const client of wss.clients) {
    if ((client as AuthedWs).role === 'admin') sendTo(client, message);
  }
}

/** 定向项目房间（仅房间内成员） */
export function sendToProject(projectId: string, message: unknown): void {
  const set = rooms.get(`project:${projectId}`);
  if (!set) return;
  for (const aw of set) sendTo(aw, message);
}

// ─── 生命周期 ───

/**
 * 初始化 WS 管道（幂等：重复调用返回同一实例）。
 * @param opts.heartbeatIntervalMs 心跳间隔注入点——生产 30s（WS_HEARTBEAT_MS），
 *   测试注入短间隔验证踢死链（票面 AC），无需 fake timers。
 */
export function initWsServer(
  server: HttpServer,
  opts: { heartbeatIntervalMs?: number } = {},
): WebSocketServer {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true });
  wss.on('connection', onConnection);
  boundServer = server;
  server.on('upgrade', handleUpgrade);

  // 心跳（README 惯例：ping + isAlive + terminate；浏览器/客户端协议栈自动回 pong）
  const intervalMs = opts.heartbeatIntervalMs ?? WS_HEARTBEAT_MS;
  heartbeatTimer = setInterval(() => {
    if (!wss) return;
    for (const client of wss.clients) {
      const aw = client as AuthedWs;
      if (aw.isAlive === false) {
        aw.terminate();
        continue;
      }
      aw.isAlive = false;
      aw.ping();
    }
  }, intervalMs);

  wss.on('close', () => {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  });

  logger.info(`WS server initialized (path=${WS_PATH}, heartbeat=${intervalMs}ms)`);
  return wss;
}

/**
 * 关停 WS 管道（幂等）：断开全部连接 → 停心跳 → 关 wss → 摘 upgrade 监听器。
 * 供 server.ts 的 gracefulShutdown 与集成测试 afterAll 复用。
 */
export function closeWsServer(): void {
  if (!wss) return;
  for (const client of wss.clients) client.terminate();
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  wss.close();
  if (boundServer) boundServer.removeListener('upgrade', handleUpgrade);
  wss = null;
  boundServer = null;
  rooms.clear();
}
