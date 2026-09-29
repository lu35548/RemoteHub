// #37 自写 WS hook（蓝本 libcheck-ws §2：第三方库停更/未验 React 19，~80 行原生状态机）。
// 只管连接生命周期；消息语义（WS→Query 联动）由消费侧 onMessage 派发（TkDodo 模式）。
import { useEffect, useRef, useState } from 'react';
import { buildWsUrl, type WsServerMessage } from '../lib/wsProtocol';

export type WsStatus = 'connecting' | 'open' | 'closed';

export interface UseWsOptions {
  /** 仅在已认证布局挂载（登出态不起 WS，避免 401 拒绝 → 1006 → 重连死循环） */
  enabled?: boolean;
  /** 收到已解析的服务端消息（通知类/控制类统一外派，消费侧决定取舍） */
  onMessage?: (msg: WsServerMessage) => void;
  /** 每次成功建连触发（含重连）：消费侧 invalidateQueries 补断线增量 */
  onOpen?: () => void;
}

/** 指数退避：第 attempt 次失败后 [500·2^n, 1000·2^n] ms 区间随机（jitter 防惊群），封顶 30s */
export function backoffDelayMs(attempt: number, random: () => number = Math.random): number {
  const lo = Math.min(500 * 2 ** attempt, 30_000);
  const hi = Math.min(1000 * 2 ** attempt, 30_000);
  return lo + random() * (hi - lo);
}

export function useWs(options: UseWsOptions = {}): WsStatus {
  const { enabled = true } = options;
  // 回调走 ref：effect 依赖只有 enabled，回调身份变化不触发重连
  const onMessageRef = useRef(options.onMessage);
  const onOpenRef = useRef(options.onOpen);
  useEffect(() => {
    onMessageRef.current = options.onMessage;
    onOpenRef.current = options.onOpen;
  });

  const [status, setStatus] = useState<WsStatus>('closed');

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;

    const clearTimer = () => {
      if (timer) { clearTimeout(timer); timer = null; }
    };

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');
      const socket = new WebSocket(buildWsUrl());
      ws = socket;
      socket.onopen = () => {
        if (disposed || ws !== socket) return;
        attempts = 0; // 连上即重置退避
        setStatus('open');
        onOpenRef.current?.();
      };
      socket.onmessage = (ev: MessageEvent) => {
        if (disposed || ws !== socket) return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(ev.data));
        } catch {
          return; // 非 JSON 帧静默丢弃
        }
        const msg = parsed as WsServerMessage;
        if (msg?.type === 'reconnect_required') {
          // token 过期等：重置退避并立即重连（当前后端未发送；handler + 单测先行，后端补发免改前端）
          attempts = 0;
          reconnectNow();
          return;
        }
        onMessageRef.current?.(msg); // 未知 type 由消费侧优雅忽略
      };
      socket.onclose = (ev: CloseEvent) => {
        if (disposed || ws !== socket) return;
        setStatus('closed');
        if (ev.code === 1000) return; // 服务端正常下线（业务 close(1000)）：不重连
        scheduleReconnect(); // 1006 等异常断开：退避重连
      };
      socket.onerror = () => { /* close 会跟着来，统一走 onclose */ };
    };

    const scheduleReconnect = () => {
      if (disposed || timer) return;
      const delay = backoffDelayMs(attempts);
      attempts += 1;
      timer = setTimeout(() => {
        timer = null;
        connect();
      }, delay);
    };

    /** 立即重连：作废当前 socket（其 onclose 因 ws !== socket 守卫被忽略）并重新拨号 */
    const reconnectNow = () => {
      clearTimer();
      const current = ws;
      ws = null;
      current?.close();
      connect();
    };

    /** 页面回前台 / 网络恢复：连接不在建即跳过退避等待立刻试连 */
    const onWake = () => {
      if (disposed) return;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      reconnectNow();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') onWake();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onWake);

    connect();

    return () => {
      // StrictMode 双挂载幂等：cleanup 关 socket + 清定时器 + 摘监听，disposed 使迟到的回调全部失效
      disposed = true;
      clearTimer();
      const current = ws;
      ws = null;
      current?.close();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onWake);
    };
  }, [enabled]);

  return status;
}
