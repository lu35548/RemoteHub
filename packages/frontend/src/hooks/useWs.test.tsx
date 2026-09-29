import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useWs, backoffDelayMs } from './useWs';
import { buildWsUrl } from '../lib/wsProtocol';

// ── MockWebSocket 桩：jsdom 无可控的原生 WS 实现，状态机测试注入桩类 ──
// 只实现 hook 消费的面：构造 / on* 回调 / close / readyState 静态量。
class MockWebSocket {
  static readonly CONNECTING = 0 as const;
  static readonly OPEN = 1 as const;
  static readonly CLOSING = 2 as const;
  static readonly CLOSED = 3 as const;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    if (this.readyState === MockWebSocket.CLOSED) return;
    const code = this.readyState === MockWebSocket.OPEN ? 1000 : 1006;
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code });
  }
}

/** 服务端视角驱动桩：建连成功 / 服务端关闭 / 下发消息 */
const openSocket = (s: MockWebSocket) => {
  s.readyState = MockWebSocket.OPEN;
  s.onopen?.();
};
const serverClose = (s: MockWebSocket, code: number) => {
  s.readyState = MockWebSocket.CLOSED;
  s.onclose?.({ code });
};
const serverMessage = (s: MockWebSocket, msg: unknown) => {
  s.onmessage?.({ data: JSON.stringify(msg) });
};

const latest = () => MockWebSocket.instances[MockWebSocket.instances.length - 1]!;

describe('useWs（#37 自写 WS hook 状态机）', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('同源 URL 拨号：http 页面 → ws://host/api/v1/ws，状态 connecting', () => {
    const { result } = renderHook(() => useWs());
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost:3000/api/v1/ws');
    expect(result.current).toBe('connecting');
  });

  it('enabled=false 不拨号（登出态不起 WS）', () => {
    renderHook(() => useWs({ enabled: false }));
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  // useWs 核心设计契约（useWs.ts「回调走 ref」注释的测试锁）：
  // effect 依赖只有 enabled，回调身份变化不触发重连，且派发永远走最新回调
  it('回调走 ref：rerender 换全新回调身份不重拨，消息派发走最新回调', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useWs({ onMessage: cb }), { initialProps: { cb: first } });
    expect(MockWebSocket.instances).toHaveLength(1);

    rerender({ cb: second }); // 全新回调身份
    expect(MockWebSocket.instances).toHaveLength(1); // 不重拨号

    act(() => openSocket(latest()));
    act(() => serverMessage(latest(), { type: 'MEMBER_ADDED', payload: { projectName: 'P1' } }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1); // ref 已指向最新回调，无过期闭包
  });

  it('onopen → 状态 open + onOpen 回调（invalidate 挂点）+ 退避计数清零', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const onOpen = vi.fn();
    const { result } = renderHook(() => useWs({ onOpen }));
    act(() => openSocket(latest()));
    expect(result.current).toBe('open');
    expect(onOpen).toHaveBeenCalledTimes(1);

    // 失败一次后重连成功：再失败时退避从 500 重新起算（onopen 已重置）
    act(() => serverClose(latest(), 1006));
    act(() => vi.advanceTimersByTime(499));
    expect(MockWebSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(MockWebSocket.instances).toHaveLength(2);
    act(() => openSocket(latest()));
    act(() => serverClose(latest(), 1006));
    act(() => vi.advanceTimersByTime(499));
    expect(MockWebSocket.instances).toHaveLength(2); // 重置后仍是 500ms 档，非 1000ms
    act(() => vi.advanceTimersByTime(1));
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('指数退避序列与 30s 封顶（jitter 固定取下界）：500→1000→…→16000→30000→30000', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderHook(() => useWs());
    const delays = [500, 1000, 2000, 4000, 8000, 16000, 30000, 30000];
    delays.forEach((delay, i) => {
      act(() => serverClose(latest(), 1006));
      act(() => vi.advanceTimersByTime(delay - 1));
      expect(MockWebSocket.instances).toHaveLength(i + 1); // 差 1ms 不拨号
      act(() => vi.advanceTimersByTime(1));
      expect(MockWebSocket.instances).toHaveLength(i + 2);
    });
  });

  it('退避 jitter：random 取上界时延迟为区间上沿（首档恰 1000ms）', () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    renderHook(() => useWs());
    act(() => serverClose(latest(), 1006));
    act(() => vi.advanceTimersByTime(999));
    expect(MockWebSocket.instances).toHaveLength(1);
    act(() => vi.advanceTimersByTime(1));
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('服务端正常 close(1000) 不重连（业务下线）', () => {
    renderHook(() => useWs());
    act(() => openSocket(latest()));
    act(() => serverClose(latest(), 1000));
    act(() => vi.advanceTimersByTime(60_000));
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('卸载即净：close socket + 清退避定时器（迟到定时器不拨号）', () => {
    const { unmount } = renderHook(() => useWs());
    act(() => serverClose(latest(), 1006)); // 退避定时器挂起中
    unmount();
    expect(MockWebSocket.instances[0]!.readyState).toBe(MockWebSocket.CLOSED);
    act(() => vi.advanceTimersByTime(60_000));
    expect(MockWebSocket.instances).toHaveLength(1); // 无新拨号
  });

  it('双挂载幂等（StrictMode 语义）：挂载→卸载→再挂载，首挂 socket 关闭、次挂存活', () => {
    // 本 vitest 栈下 React 以非 dev 语义解析、StrictMode 不双跑 effect（探针实证），
    // 故显式模拟 StrictMode 的 mount→cleanup→mount 序列验证幂等契约
    const first = renderHook(() => useWs());
    expect(MockWebSocket.instances).toHaveLength(1);
    first.unmount();
    const second = renderHook(() => useWs());
    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[0]!.readyState).toBe(MockWebSocket.CLOSED);
    expect(MockWebSocket.instances[1]!.readyState).toBe(MockWebSocket.CONNECTING);
    second.unmount();
  });

  it('reconnect_required → 立即重连（不等退避）且旧 socket 关闭', () => {
    renderHook(() => useWs());
    const first = latest();
    act(() => openSocket(first));
    act(() => serverMessage(first, { type: 'reconnect_required', payload: {} }));
    expect(MockWebSocket.instances).toHaveLength(2); // 同步立即拨号，未推进任何定时器
    expect(first.readyState).toBe(MockWebSocket.CLOSED);
  });

  it('visibilitychange 回前台：跳过退避等待立即重连；连接健康时不重复拨号', () => {
    renderHook(() => useWs());
    act(() => serverClose(latest(), 1006)); // 退避定时器挂起中（500ms）
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(MockWebSocket.instances).toHaveLength(2); // 未 advance 即已重连

    act(() => openSocket(latest()));
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(MockWebSocket.instances).toHaveLength(2); // OPEN 态回前台不重连
  });

  it('online 事件：断线状态下立即重连', () => {
    renderHook(() => useWs());
    act(() => serverClose(latest(), 1006));
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('onmessage：JSON 解析后外派给 onMessage；非 JSON 帧静默丢弃；未知 type 照常外派', () => {
    const onMessage = vi.fn();
    renderHook(() => useWs({ onMessage }));
    const sock = latest();
    act(() => openSocket(sock));

    act(() => serverMessage(sock, { type: 'MEMBER_ADDED', payload: { projectName: 'P1' } }));
    expect(onMessage).toHaveBeenCalledWith({ type: 'MEMBER_ADDED', payload: { projectName: 'P1' } });

    act(() => sock.onmessage?.({ data: '{not-json' }));
    expect(onMessage).toHaveBeenCalledTimes(1); // 脏帧不外派、不抛错

    act(() => serverMessage(sock, { type: 'joined', payload: { room: 'admin' } }));
    expect(onMessage).toHaveBeenCalledTimes(2); // 过滤职责在消费侧（dispatch 层）
  });
});

describe('backoffDelayMs（纯函数）', () => {
  it('区间与封顶：random 0/0.5/1 三档抽样', () => {
    expect(backoffDelayMs(0, () => 0)).toBe(500);
    expect(backoffDelayMs(0, () => 0.5)).toBe(750);
    expect(backoffDelayMs(0, () => 1)).toBe(1000);
    expect(backoffDelayMs(3, () => 0)).toBe(4000);
    expect(backoffDelayMs(6, () => 0.5)).toBe(30_000); // lo=hi=30000，jitter 归零
    expect(backoffDelayMs(9, () => 1)).toBe(30_000);
  });
});

describe('buildWsUrl（协议升级）', () => {
  it('https 页面 → wss；http 页面 → ws；路径固定 /api/v1/ws', () => {
    expect(buildWsUrl({ protocol: 'https:', host: 'rh.example.com' })).toBe('wss://rh.example.com/api/v1/ws');
    expect(buildWsUrl({ protocol: 'http:', host: 'localhost:3000' })).toBe('ws://localhost:3000/api/v1/ws');
  });
});
