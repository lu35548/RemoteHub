import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { api } from '../api/client';
import { useOnlineStatus } from './useOnlineStatus';

// 数据层 mock：仅拦截 api client，轮询时序走真实 hook 逻辑（fake timers）
vi.mock('../api/client', () => ({
  api: { post: vi.fn(), get: vi.fn() },
  setAccessToken: vi.fn(),
}));

// backend GET /auth/online 剥壳后形状：{ users: UserPublic[], count: number }（authService.getOnlineUsers）
const onlineUsers = [
  { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: '2026-08-28T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'u2', username: 'zhangsan', nickname: '张三', role: 'user', isActive: true, lastActiveAt: '2026-08-28T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
];

describe('useOnlineStatus（v1 心跳轮询等价）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(api.post).mockResolvedValue(null);
    vi.mocked(api.get).mockResolvedValue({ users: onlineUsers, count: onlineUsers.length });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('挂载立即执行一轮：先 heartbeat 再拉在线列表，返回用户数组', async () => {
    const { result } = renderHook(() => useOnlineStatus());

    await act(async () => {}); // flush 初始轮的 microtask 链

    expect(api.post).toHaveBeenCalledWith('/auth/heartbeat');
    expect(api.get).toHaveBeenCalledWith('/auth/online');
    expect(result.current).toEqual(onlineUsers);
    // v1 串行语义：heartbeat 必须先于在线列表请求（保证自己出现在首轮列表里）
    expect(vi.mocked(api.post).mock.invocationCallOrder[0]!)
      .toBeLessThan(vi.mocked(api.get).mock.invocationCallOrder[0]!);
  });

  it('每 5 秒一轮周期轮询（v1 setInterval(5000) 等价）', async () => {
    renderHook(() => useOnlineStatus());
    await act(async () => {});

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(api.post).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(api.post).toHaveBeenCalledTimes(4); // 10s = 两轮
  });

  it('卸载即停（v1 clearInterval 等价，退登后不再发心跳）', async () => {
    const { unmount } = renderHook(() => useOnlineStatus());
    await act(async () => {});

    unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(20000); });

    expect(api.post).toHaveBeenCalledTimes(1); // 仅初始轮
  });

  it('heartbeat 失败：静默跳过本轮（不拉在线列表、无 unhandled rejection），下一轮恢复', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    try {
      vi.mocked(api.post).mockRejectedValueOnce(new Error('network'));
      renderHook(() => useOnlineStatus());
      await act(async () => {});
      await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // 留出 unhandled 检测窗口

      expect(api.get).not.toHaveBeenCalled();
      expect(unhandled).toEqual([]); // 静默契约：hook 消化错误，不污染 console

      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(api.get).toHaveBeenCalledTimes(1);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });

  it('掉线收敛：他人在下轮列表消失时 UI 同步收缩（v1 每 5s 重拉等价）', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ users: onlineUsers, count: 2 })
      .mockResolvedValue({ users: [onlineUsers[0]], count: 1 });
    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => {});
    expect(result.current).toHaveLength(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(result.current).toHaveLength(1);
    expect(result.current[0]?.id).toBe('u1');
  });

  it('契约破坏防御：响应缺 users 字段时空列表兜底，不向渲染层传 undefined', async () => {
    vi.mocked(api.get).mockResolvedValue({ count: 0 } as { users: never[]; count: number });
    const { result } = renderHook(() => useOnlineStatus());
    await act(async () => {});

    expect(result.current).toEqual([]);
  });
});
