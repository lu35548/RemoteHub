import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import type { PaginatedResponse } from '@remotehub/shared';
import { dispatchWsMessage, payloadMessage } from './notificationDispatch';
import { NOTIFICATION_QUERY_KEY, type NotificationItem } from '../api/queries';
import type { ToastFn } from './notificationDispatch';

// 真 QueryClient（非 mock）：setQueryData 的 updater 语义只有真实现才可信
function seedCache(items: NotificationItem[], total = items.length): QueryClient {
  const qc = new QueryClient();
  const page: PaginatedResponse<NotificationItem> = {
    success: true, data: items, pagination: { page: 1, pageSize: 50, total },
  };
  qc.setQueryData(NOTIFICATION_QUERY_KEY, page);
  return qc;
}

const item = (overrides: Partial<NotificationItem>): NotificationItem => ({
  id: 'n1', type: 'MEMBER_ADDED', payload: { message: '已有成员加入' }, isRead: false,
  createdAt: '2026-09-29T00:00:00.000Z', ...overrides,
});

describe('dispatchWsMessage（WS→Query 联动，票 #37）', () => {
  let toast: ReturnType<typeof vi.fn>;
  let toastFn: ToastFn;

  beforeEach(() => {
    toast = vi.fn();
    toastFn = toast as unknown as ToastFn;
  });

  it('通知类消息：setQueryData 原子插到列表头 + 角标 total+1 + invalidate 重同步', () => {
    const qc = seedCache([item({})]);
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    dispatchWsMessage(qc, toastFn, { type: 'SYSTEM_ALERT', payload: { message: '检测到可疑 IP 登录' } });

    const updated = qc.getQueryData<PaginatedResponse<NotificationItem>>(NOTIFICATION_QUERY_KEY)!;
    expect(updated.data).toHaveLength(2);
    expect(updated.data[0]!.type).toBe('SYSTEM_ALERT');
    expect(updated.data[0]!.payload).toEqual({ message: '检测到可疑 IP 登录' });
    expect(updated.data[0]!.isRead).toBe(false);
    expect(updated.data[1]!.id).toBe('n1'); // 既有项不动（不可变更新）
    expect(updated.pagination.total).toBe(2);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: NOTIFICATION_QUERY_KEY });
  });

  it('WS 插入项用临时 id（WS 消息无 id），invalidate refetch 后由服务端真值替换', () => {
    const qc = seedCache([]);
    dispatchWsMessage(qc, toastFn, { type: 'MEMBER_REMOVED', payload: {} });
    const updated = qc.getQueryData<PaginatedResponse<NotificationItem>>(NOTIFICATION_QUERY_KEY)!;
    expect(updated.data[0]!.id).toMatch(/^ws-/);
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

    expect(qc.getQueryData<PaginatedResponse<NotificationItem>>(NOTIFICATION_QUERY_KEY)!.data).toHaveLength(1);
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it('通知消息缺 payload 字段：兜底空对象，不抛错', () => {
    const qc = seedCache([]);
    expect(() => dispatchWsMessage(qc, toastFn, { type: 'FORCE_LOGOUT' } as never)).not.toThrow();
    const updated = qc.getQueryData<PaginatedResponse<NotificationItem>>(NOTIFICATION_QUERY_KEY)!;
    expect(updated.data[0]!.payload).toEqual({});
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
