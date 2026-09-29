// #37 通知中心：顶栏铃铛 + 未读角标 + 下拉未读列表（消费 #35 通知 API；
// 实时增量由 AppContent 的 useWs → dispatchWsMessage 写入同一缓存键）。
import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, Inbox } from 'lucide-react';
import { useNotifications, useMarkNotificationRead } from '../api/queries';
import { NOTIFICATION_TYPE_LABELS } from '../constants';
import { payloadMessage } from '../lib/notificationDispatch';
import { formatTime } from '../utils';

// 告警/失败类用暖色徽章，其余蓝灰（深色 slate 风格内的小幅语义分色）
const ALERT_TYPES = new Set(['SYSTEM_ALERT', 'BACKUP_FAILED', 'FORCE_LOGOUT']);

const NotificationCenter: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = data?.pagination.total ?? 0;
  const items = data?.data ?? [];

  // 点击面板外关闭（mousedown 在 document 捕获，含 dropdown 兄弟元素）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const handleMarkRead = (id: string) => {
    markRead.mutate(id);
  };

  return (
    <div ref={panelRef} className="relative">
      <button
        aria-label="通知"
        title="未读通知"
        onClick={() => setOpen(v => !v)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            data-testid="unread-badge"
            className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-[10px] font-bold text-white flex items-center justify-center shadow-lg shadow-rose-900/40"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 rounded-xl border border-slate-800 bg-slate-900/95 backdrop-blur-xl shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-white">未读通知</h3>
            <span className="text-xs text-slate-400">{unread > 99 ? '99+' : unread} 条</span>
          </div>

          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-500">
                <Inbox size={28} className="opacity-40 mb-2" />
                <p className="text-sm">暂无未读通知</p>
              </div>
            ) : (
              items.map(n => {
                const alert = ALERT_TYPES.has(n.type);
                const pending = markRead.isPending && markRead.variables === n.id;
                return (
                  <div key={n.id} className="flex items-start gap-3 px-4 py-3 border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40 transition-colors">
                    <span className={`mt-0.5 flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${alert ? 'text-rose-400 bg-rose-500/10 border-rose-500/40' : 'text-blue-400 bg-blue-500/10 border-blue-500/40'}`}>
                      {NOTIFICATION_TYPE_LABELS[n.type]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-300 leading-relaxed break-words">
                        {payloadMessage(n.payload) ?? '暂无详情'}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">{formatTime(n.createdAt)}</p>
                    </div>
                    <button
                      aria-label="标记已读"
                      title="标记已读"
                      disabled={pending}
                      onClick={() => handleMarkRead(n.id)}
                      className="flex-shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition-colors"
                    >
                      <Check size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
