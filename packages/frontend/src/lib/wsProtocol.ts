// #37 前端本地 WS 协议定义（单一真相源：与 packages/backend/src/ws/wsServer.ts 头注释对齐；
// shared 常量化由 lead 批后统一收口，收口时仅改此文件的 import 来源）。
// NotificationType / NOTIFICATION_TYPES 是 #35 已合入的 shared 导出，只读复用不属「动 shared」。
import { NOTIFICATION_TYPES, type NotificationType } from '@remotehub/shared';

/** WS 端点路径（同源：dev 走 vite proxy ws:true，生产走 nginx 反代；cookie 自动携带） */
export const WS_PATH = '/api/v1/ws';

/** 客户端→服务端：加入/离开房间（#37 通知走 sendToUser 定向推送，暂不需要 join） */
export interface WsClientMessage {
  type: 'join' | 'leave';
  payload: { room: string };
}

/** 服务端→客户端：事件通知（type 即 NotificationType，payload 为已 parse 的对象） */
export interface WsNotificationMessage {
  type: NotificationType;
  payload: Record<string, unknown>;
}

/** 服务端→客户端：连接控制类（joined/left/denied/error + 预留的 reconnect_required） */
export interface WsControlMessage {
  type: 'joined' | 'left' | 'denied' | 'error' | 'reconnect_required';
  payload?: { room?: string; message?: string };
}

export type WsServerMessage = WsNotificationMessage | WsControlMessage;

/** 通知类型值域集合（运行时判别 incoming WS 消息是通知还是控制码） */
const NOTIFICATION_TYPE_SET: ReadonlySet<string> = new Set(NOTIFICATION_TYPES);

export function isNotificationType(v: unknown): v is NotificationType {
  return typeof v === 'string' && NOTIFICATION_TYPE_SET.has(v);
}

/** 同源 WS URL：页面 https 用 wss，否则 ws（前后端路径一致，无需 rewrite/跨域处理） */
export function buildWsUrl(loc: { protocol: string; host: string } = window.location): string {
  const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${loc.host}${WS_PATH}`;
}
