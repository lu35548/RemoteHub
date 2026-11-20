// packages/shared/src/wsProtocol.ts
// WS 协议契约——单一真相源。#37 批 4 曾前端本地定义（防并行 shared dist 竞争），
// 合流后由 lead 收口至此；前端 lib/wsProtocol.ts 为 re-export 消费门面（import 路径不变），
// backend wsServer.ts 消费类型锚定 sendTo 系列签名。
// 心跳间隔 WS_HEARTBEAT_MS 是 backend 实现细节（30s < nginx proxy_read_timeout 60s），
// 非协议契约，留在 packages/backend/src/ws/wsServer.ts。
import { NOTIFICATION_TYPES, type NotificationType } from './enums.js';

/** WS 端点路径（同源：dev 赂 vite proxy ws:true，生产走 nginx 反代；cookie 自动携带） */
export const WS_PATH = '/api/v1/ws';

/** 客户端→服务端：加入/离开房间（通知走 sendToUser 定向推送，无需 join 即达） */
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
