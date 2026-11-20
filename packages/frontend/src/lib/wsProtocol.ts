// #37 前端 WS 协议——已收口：契约的单一真相源在 @remotehub/shared（src/wsProtocol.ts，批 5 开工前置收口），
// 此文件为 re-export 消费门面（useWs / notificationDispatch / useWs.test 的 import 路径不变）。
// buildWsUrl 是浏览器语义（window.location 默认参数），留在前端不进 shared。
export {
  WS_PATH,
  isNotificationType,
  type WsClientMessage,
  type WsNotificationMessage,
  type WsControlMessage,
  type WsServerMessage,
} from '@remotehub/shared';

import { WS_PATH } from '@remotehub/shared';

/** 同源 WS URL：页面 https 用 wss，否则 ws（前后端路径一致，无需 rewrite/跨域处理） */
export function buildWsUrl(loc: { protocol: string; host: string } = window.location): string {
  const proto = loc.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${loc.host}${WS_PATH}`;
}
