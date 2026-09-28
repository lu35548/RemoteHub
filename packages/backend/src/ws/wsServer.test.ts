// packages/backend/src/ws/wsServer.test.ts
// #34 WS 管道基建 unit：cookie 手解 / init·close 幂等 / upgrade 鉴权 401 路径（mock socket）。
// 真实连接、房间、心跳、shutdown 走 ws.pipeline 集成（真 http server + 真库）。
import '../test/helpers/env.js';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../utils/prisma.js', () => ({
  prisma: {
    session: { findUnique: vi.fn() },
    projectMember: { findFirst: vi.fn() },
  },
}));

import type { Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { WS_PATH, initWsServer, closeWsServer, parseCookieHeader } from './wsServer.js';

// ─── 假件 ───

/** 假 http server：捕获 upgrade 监听器 */
function createFakeHttpServer(): { server: HttpServer; listeners: Map<string, (...args: unknown[]) => unknown> } {
  const listeners = new Map<string, (...args: unknown[]) => unknown>();
  const server = {
    on: vi.fn((ev: string, fn: (...args: unknown[]) => unknown) => { listeners.set(ev, fn); }),
    removeListener: vi.fn(),
    listening: false,
  } as unknown as HttpServer;
  return { server, listeners };
}

function createFakeSocket(): Duplex {
  return { write: vi.fn(), destroy: vi.fn(), on: vi.fn() } as unknown as Duplex;
}

function fakeUpgradeReq(url: string, cookie?: string): IncomingMessage {
  return { url, headers: cookie === undefined ? {} : { cookie } } as unknown as IncomingMessage;
}

/** async upgrade handler 的微任务排空（session mock 即刻 resolve） */
async function flushAsync(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

// ─── parseCookieHeader ───

describe('parseCookieHeader', () => {
  it('多条 cookie 解析', () => {
    expect(parseCookieHeader('a=1; refreshToken=abc; b=2')).toEqual({ a: '1', refreshToken: 'abc', b: '2' });
  });

  it('undefined / 空串 → 空对象', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader('')).toEqual({});
  });

  it('无值段（无=）跳过', () => {
    expect(parseCookieHeader('foo; a=1')).toEqual({ a: '1' });
  });

  it('值 URL decode（%xx）', () => {
    expect(parseCookieHeader('k=%40%3B')).toEqual({ k: '@;' });
  });

  it('空格归一化', () => {
    expect(parseCookieHeader('  a = 1  ;  b=2  ')).toEqual({ a: '1', b: '2' });
  });

  it('decodeURIComponent 失败（%ZZ 非法序列）→ 值原样返回不抛', () => {
    expect(parseCookieHeader('k=%ZZ')).toEqual({ k: '%ZZ' });
  });

  it('多个同名 cookie → 后值覆盖（与 cookie-parser 的 last-value-wins 同契约）', () => {
    expect(parseCookieHeader('refreshToken=first; refreshToken=second')).toEqual({ refreshToken: 'second' });
  });
});

// ─── init/close 生命周期 ───

describe('initWsServer / closeWsServer', () => {
  beforeEach(() => closeWsServer());

  it('init 幂等：重复 init 返回同一实例且只注册一次 upgrade 监听器', () => {
    const { server } = createFakeHttpServer();
    const a = initWsServer(server);
    const b = initWsServer(server);
    expect(a).toBe(b);
    expect(server.on).toHaveBeenCalledTimes(1);
    closeWsServer();
    expect(server.removeListener).toHaveBeenCalledWith('upgrade', expect.any(Function));
  });

  it('未 init 直接 closeWsServer 不炸（幂等）', () => {
    expect(() => closeWsServer()).not.toThrow();
  });
});

// ─── upgrade 前置鉴权（401 路径，mock socket）───

describe('upgrade 前置鉴权', () => {
  beforeEach(() => closeWsServer());

  function getUpgradeHandler(server: HttpServer): (...args: unknown[]) => unknown {
    const on = (server as unknown as { on: ReturnType<typeof vi.fn> }).on;
    const call = on.mock.calls.find((c) => c[0] === 'upgrade');
    if (!call) throw new Error('upgrade 监听器未注册');
    return call[1] as (...args: unknown[]) => unknown;
  }

  it('非 WS 路径：直接 destroy，不写 401', async () => {
    const { server } = createFakeHttpServer();
    initWsServer(server);
    const handler = getUpgradeHandler(server);
    const socket = createFakeSocket();
    await handler(fakeUpgradeReq('/api/v1/other', 'refreshToken=x'), socket, Buffer.alloc(0));
    await flushAsync();
    expect(socket.destroy).toHaveBeenCalled();
    expect(socket.write).not.toHaveBeenCalled();
  });

  it('无 cookie：socket.write 401 + destroy（官方 401 形态）', async () => {
    const { server } = createFakeHttpServer();
    initWsServer(server);
    const handler = getUpgradeHandler(server);
    const socket = createFakeSocket();
    await handler(fakeUpgradeReq(WS_PATH, undefined), socket, Buffer.alloc(0));
    await flushAsync();
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('401'));
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('Connection: close'));
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('有 cookie 无 session（findUnique → null）→ 401', async () => {
    const { server } = createFakeHttpServer();
    initWsServer(server);
    const handler = getUpgradeHandler(server);
    const socket = createFakeSocket();
    const { prisma } = await import('../utils/prisma.js');
    vi.mocked(prisma.session.findUnique).mockResolvedValue(null);
    await handler(fakeUpgradeReq(WS_PATH, 'refreshToken=deadbeef'), socket, Buffer.alloc(0));
    await flushAsync();
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('401'));
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('session 已轮换（consumedAt 非空、expiresAt 未过期）→ 401（REST 重用检测语义不被 WS 通道旁路）', async () => {
    const { server } = createFakeHttpServer();
    initWsServer(server);
    const handler = getUpgradeHandler(server);
    const socket = createFakeSocket();
    const { prisma } = await import('../utils/prisma.js');
    vi.mocked(prisma.session.findUnique).mockResolvedValue({
      id: 'sess-1', tokenHash: 'hash:x', userId: 'u1', consumedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', role: 'user', isActive: true },
    } as never);
    await handler(fakeUpgradeReq(WS_PATH, 'refreshToken=rotated'), socket, Buffer.alloc(0));
    await flushAsync();
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('401'));
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('validateRefreshSession DB 抛错 → 401 fail-closed（鉴权查询失败不放行）', async () => {
    const { server } = createFakeHttpServer();
    initWsServer(server);
    const handler = getUpgradeHandler(server);
    const socket = createFakeSocket();
    const { prisma } = await import('../utils/prisma.js');
    vi.mocked(prisma.session.findUnique).mockRejectedValue(new Error('db down'));
    await handler(fakeUpgradeReq(WS_PATH, 'refreshToken=whatever'), socket, Buffer.alloc(0));
    await flushAsync();
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining('401'));
    expect(socket.destroy).toHaveBeenCalled();
  });

  it('closeWsServer 后在途 upgrade → socket.destroy（不静默挂起，server.close 可回调）', async () => {
    const { server, listeners } = createFakeHttpServer();
    initWsServer(server);
    const handler = listeners.get('upgrade')!;
    const socket = createFakeSocket();
    const { prisma } = await import('../utils/prisma.js');
    let resolveQuery!: (v: unknown) => void;
    vi.mocked(prisma.session.findUnique).mockImplementation(
      (() => new Promise((resolve) => { resolveQuery = resolve; })) as unknown as
        (...args: Parameters<typeof prisma.session.findUnique>) => ReturnType<typeof prisma.session.findUnique>,
    );
    const upgrade = handler(fakeUpgradeReq(WS_PATH, 'refreshToken=tok'), socket, Buffer.alloc(0));
    closeWsServer(); // 竞态点：鉴权查询在途时关停，wss 已置 null
    resolveQuery({
      id: 'sess-1', tokenHash: 'hash:tok', userId: 'u1', consumedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', role: 'user', isActive: true },
    });
    await upgrade;
    expect(socket.destroy).toHaveBeenCalled();
  });
});
