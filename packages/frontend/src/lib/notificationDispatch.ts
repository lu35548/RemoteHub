// #37 WS→Query 联动（TkDodo《Using WebSockets with React Query》官方模式）：
// setQueryData 做立即原子更新（角标/列表即时 +1）+ invalidateQueries 做服务端重同步
// （WS 消息无 id，插入项用临时 id，refetch 后被服务端真值替换）。
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { isNotificationType, type WsServerMessage } from './wsProtocol';
import { NOTIFICATION_QUERY_KEY, type NotificationItem } from '../api/queries';
import { NOTIFICATION_TYPE_LABELS } from '../constants';
import type { PaginatedResponse } from '@remotehub/shared';
import type { ToastType } from '../types';

/** 与 UIContextType.toast 同签名（依赖倒置：dispatch 不绑 UI 层） */
export type ToastFn = (type: ToastType, title: string, message?: string, duration?: number) => void;

/** payload 摘要：优先 message 字段（#36 事件源约定俗成），无则 undefined */
export function payloadMessage(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.message === 'string' && payload.message.trim() !== '') return payload.message;
  return undefined;
}

/**
 * WS 消息派发：通知类 → 缓存原子插入 + invalidate 重同步；SYSTEM_ALERT 额外即时 toast
 * （admin 可疑 IP 告警验收点）。控制类消息（joined/left/denied/error）优雅忽略。
 */
export function dispatchWsMessage(queryClient: QueryClient, toast: ToastFn, msg: WsServerMessage): void {
  const { type } = msg;
  if (!isNotificationType(type)) return; // 控制类/未知 type：通知中心不消费
  const payload = msg.payload ?? {};

  // #54 列表改 infinite（加载更多 append）：WS 原子插入落到首页头部 + 首页 total +1
  // （角标读首页 pagination.total，其余页由随后的 invalidate refetch 对齐服务端真值）
  queryClient.setQueryData<InfiniteData<PaginatedResponse<NotificationItem>>>(NOTIFICATION_QUERY_KEY, (old) => {
    if (!old) return old; // 缓存未建立：交给 invalidate / 首次挂载拉取
    const [first, ...rest] = old.pages;
    if (!first) return old;
    const incoming: NotificationItem = {
      // WS 消息无 id：临时 id 仅撑住即时渲染，invalidate refetch 后替换为服务端真值
      id: `ws-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    return {
      ...old,
      pages: [
        {
          ...first,
          data: [incoming, ...first.data],
          pagination: { ...first.pagination, total: first.pagination.total + 1 },
        },
        ...rest,
      ],
    };
  });

  void queryClient.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY });

  if (type === 'SYSTEM_ALERT') {
    toast('error', NOTIFICATION_TYPE_LABELS.SYSTEM_ALERT, payloadMessage(payload));
  }
}
