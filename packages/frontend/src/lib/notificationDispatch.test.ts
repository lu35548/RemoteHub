import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { InfiniteData } from '@tanstack/react-query';
import type { PaginatedResponse } from '@remotehub/shared';
import { dispatchWsMessage, payloadMessage } from './notificationDispatch';
import { NOTIFICATION_QUERY_KEY, type NotificationItem } from '../api/queries';
import type { ToastFn } from './notificationDispatch';

// 真 QueryClient（非 mock）：setQueryData 的 updater 语义只有真实现才可信
// #54 起 useNotifications 为 useInfiniteQuery：缓存形状 = InfiniteData<PaginatedResponse>（pages/pageParams）
function seedCache(items: NotificationItem[], total = items.length): QueryClient {
  const qc = new QueryClient();
  const page: PaginatedResponse<NotificationItem> = {
    success: true, data: items, pagination: { page: 1, pageSize: 20, total },
  };
  qc.setQueryData(NOTIFICATION_QUERY_KEY, { pages: [page], pageParams: [1] });
  return qc;
}

const item = (overrides: Partial<NotificationItem>): NotificationItem => ({
  id: 'n1', type: 'MEMBER_ADDED', payload: { message: '已有成员加入' }, isRead: false,
  createdAt: '2026-09-29T00:00:00.000Z', ...overrides,
});

describe('dispatchWsMessage（WS→Query 联动，票 #37；#54 起 InfiniteData 形状）', () => {
  let toast: ReturnType<typeof vi.fn>;
  let toastFn: ToastFn;

  beforeEach(() => {
    toast = vi.fn();
    toastFn = toast as unknown as ToastFn;
  });

  it('通知类消息：原子插到首页头部 + 首页 total+1（角标）+ invalidate 重同步', () => {
    const qc = seedCache([item({})]);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    dispatchWsMessage(qc, toastFn, { type: 'SYSTEM_ALERT', payload: { message: '检测到可疑 IP 登录' } });

    const updated = qc.getQueryData<InfiniteData<PaginatedResponse<NotificationItem>>>(NOTIFICATION_QUERY_KEY)!;
    expect(updated.pages).toHaveLength(1);
    expect(updated.pages[0]!.data).toHaveLength(2);
    expect(updated.pages[0]!.data[0]!.type).toBe('SYSTEM_ALERT');
    expect(updated.pages[0]!.data[0]!.payload).toEqual({ message: '检测到可疑 IP 登录' });
    expect(updated.pages[0]!.data[0]!.isRead).toBe(false);
    expect(updated.pages[0]!.data[1]!.id).toBe('n1'); // 既有项不动（不可变更新）
    expect(updated.pages[0]!.pagination.total).toBe(2);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: NOTIFICATION_QUERY_KEY });
  });

  it('WS 插入项用临时 id（WS 消息无 id），invalidate refetch 后由服务端真值替换', () => {
    const qc = seedCache([]);
    dispatchWsMessage(qc, toastFn, { type: 'MEMBER_REMOVED', payload: {} });
    const updated = qc.getQueryData<InfiniteData<PaginatedResponse<NotificationItem>>>(NOTIFICATION_QUERY_KEY)!;
    expect(updated.pages[0]!.data[0]!.id).toMatch(/^ws-/);
  });

  it('多页缓存：WS 插入只动首页，其余页原样保留', () => {
    const qc = new QueryClient();
    const mk = (page: number): PaginatedResponse<NotificationItem> => ({
      success: true,
      data: [item({ id: `p${page}-n1` })],
      pagination: { page, pageSize: 20, total: 21 },
    });
    qc.setQueryData(NOTIFICATION_QUERY_KEY, { pages: [mk(1), mk(2)], pageParams: [1, 2] });

    dispatchWsMessage(qc, toastFn, { type: 'MEMBER_ADDED', payload: {} });

    const updated = qc.getQueryData<InfiniteData<PaginatedResponse<NotificationItem>>>(NOTIFICATION_QUERY_KEY)!;
    expect(updated.pages).toHaveLength(2);
    expect(updated.pages[0]!.data[0]!.id).toMatch(/^ws-/); // 新消息插首页头
    expect(updated.pages[0]!.pagination.total).toBe(22);   // 角标在首页 +1
    expect(updated.pages[1]!.data[0]!.id).toBe('p2-n1');   // 第 2 页原样
    expect(updated.pages[1]!.pagination.total).toBe(21);   // 第 2 页 total 待 invalidate 对齐
  });

  it('缓存未建立：setQueryData 跳过（返回 undefined 不写入），invalidate 照常触发', () => {
    const qc = new QueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    dispatchWsMessage(qc, toastFn, { type: 'BACKUP_COMPLETED', payload: {} });

    expect(qc.getQueryData(NOTIFICATION_QUERY_KEY)).toBeUndefined();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: NOTIFICATION_QUERY_KEY });
  });

  it('SYSTEM_ALERT → 即时 toast（error 级，标题用中文标签，正文取 payload.message）', () => {
    const qc = seedCache([]);
    dispatchWsMessage(qc, toastFn, { type: 'SYSTEM_ALERT', payload: { message: '检测到可疑 IP 登录' } });
    expect(toast).toHaveBeenCalledWith('error', '系统告警', '检测到可疑 IP 登录');
  });

  it('非 SYSTEM_ALERT 通知不弹 toast；payload.message 缺失时 toast 正文为 undefined', () => {
    const qc = seedCache([]);
    dispatchWsMessage(qc, toastFn, { type: 'MEMBER_ADDED', payload: {} });
    expect(toast).not.toHaveBeenCalled();

    dispatchWsMessage(qc, toastFn, { type: 'SYSTEM_ALERT', payload: { ip: '1.2.3.4' } });
    expect(toast).toHaveBeenLastCalledWith('error', '系统告警', undefined);
  });

  it('控制类消息（joined/left/denied/error/reconnect_required）与未知 type：全部忽略', () => {
    const qc = seedCache([item({})]);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    dispatchWsMessage(qc, toastFn, { type: 'joined', payload: { room: 'admin' } });
    dispatchWsMessage(qc, toastFn, { type: 'denied', payload: { room: 'admin' } });
    dispatchWsMessage(qc, toastFn, { type: 'error', payload: { message: '未知消息类型' } });
    dispatchWsMessage(qc, toastFn, { type: 'reconnect_required', payload: {} });
    dispatchWsMessage(qc, toastFn, { type: 'SOMETHING_ELSE', payload: {} } as never);

    expect(qc.getQueryData<InfiniteData<PaginatedResponse<NotificationItem>>>(NOTIFICATION_QUERY_KEY)!.pages[0]!.data).toHaveLength(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('通知消息缺 payload 字段：兜底空对象，不抛错', () => {
    const qc = seedCache([]);
    expect(() => dispatchWsMessage(qc, toastFn, { type: 'FORCE_LOGOUT' } as never)).not.toThrow();
    const updated = qc.getQueryData<InfiniteData<PaginatedResponse<NotificationItem>>>(NOTIFICATION_QUERY_KEY)!;
    expect(updated.pages[0]!.data[0]!.payload).toEqual({});
  });
});

describe('payloadMessage', () => {
  it('message 字符串原样返回；空白/缺失/非字符串 → undefined', () => {
    expect(payloadMessage({ message: '备份完成' })).toBe('备份完成');
    expect(payloadMessage({ message: '  ' })).toBeUndefined();
    expect(payloadMessage({})).toBeUndefined();
    expect(payloadMessage({ message: 42 })).toBeUndefined();
  });
});
