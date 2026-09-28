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
});
