import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { downloadBackup, useAdminBackups, useMe, useTriggerBackup } from '../api/queries';
import { DataTable } from './DataTable';
import { PageLoading } from './LoadingStates';
import { useUI } from './UIComponents';
import { errMsg, formatTime } from '../utils';

/** 字节数人性化：<1024 直出 B，否则 KB/MB 一位小数（SQLite 备份产物量级场景够用，不上 GB 档） */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 数据备份页（#39，/admin/backups）。
 * 元数据口径（2026-11-04 用户裁决「文件即真相」）：列表仅 filename/sizeBytes/createdAt，
 * 不渲染状态列；备份成败的通知语义由 admin 铃铛承载（BACKUP_COMPLETED/FAILED），本页不轮询——
 * 手动触发成功后 invalidate 列表即刷新（新文件即现于列表顶部）。
 */
const BackupsPage: React.FC = () => {
  const { data: me, isPending } = useMe();
  // hooks 顶层无条件调用（React 规则），守卫只控制渲染分支
  const backups = useAdminBackups();
  const trigger = useTriggerBackup();
  const { toast } = useUI();

  // 数据加载失败 → toast（errMsg 中文兜底，AuditLogsPage 先例）
  useEffect(() => {
    if (backups.isError) toast('error', '加载失败', errMsg(backups.error, '无法加载备份列表'));
  }, [backups.isError, backups.error, toast]);

  if (isPending) return <PageLoading message="加载中..." />;
  // fail-closed：useMe 失败（me=undefined，retry:false）时一并重定向，不留渲染分支
  if (!me || me.role !== 'admin') return <Navigate to="/" replace />;

  const rows = backups.data ?? [];

  /** 手动触发备份：成功 toast 展示时长（POST 响应 durationMs）+ invalidate 已在 hook 层刷新列表 */
  const handleTrigger = () => {
    trigger
      .mutateAsync()
      .then((r) => toast('success', '备份完成', `耗时 ${(r.durationMs / 1000).toFixed(1)} 秒，列表已刷新`))
      .catch((e: unknown) => toast('error', '备份失败', errMsg(e, '备份失败')));
  };

  /** 行内下载：失败 toast 兜底（成功由浏览器保存对话框呈现） */
  const handleDownload = (filename: string) => {
    downloadBackup(filename).catch((e: unknown) => {
      toast('error', '下载失败', errMsg(e, '下载失败'));
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white tracking-tight">数据备份</h1>
        <button
          onClick={handleTrigger}
          disabled={trigger.isPending}
          title="立即执行一次全库备份（每日 02:00 另有定时备份）"
          className="rounded-lg border border-white/10 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-sky-500 hover:text-white transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          {trigger.isPending ? '备份中...' : '立即备份'}
        </button>
      </div>

      {/* 表格：非分页端点（整表单页）——DataTable 受控分页 props 以单页形态消费，翻页按钮恒禁用 */}
      <div className="mt-4">
        <DataTable
          columns={[
            { key: 'filename', label: '文件名', render: (r) => <span className="font-mono text-xs text-slate-300">{r.filename}</span> },
            { key: 'createdAt', label: '时间', render: (r) => <span className="whitespace-nowrap text-slate-400">{formatTime(r.createdAt)}</span> },
            { key: 'sizeBytes', label: '大小', render: (r) => <span className="whitespace-nowrap text-slate-400">{formatBytes(r.sizeBytes)}</span> },
            {
              key: 'actions',
              label: '操作',
              render: (r) => (
                <button
                  onClick={() => handleDownload(r.filename)}
                  aria-label={`下载 ${r.filename}`}
                  className="rounded-lg border border-white/10 bg-slate-900 px-3 py-1.5 text-xs text-slate-300 hover:border-sky-500 hover:text-white transition-colors"
                >
                  下载
                </button>
              ),
            },
          ]}
          rows={rows}
          isLoading={backups.isPending}
          emptyText="暂无备份"
          page={1}
          total={rows.length}
          pageSize={Math.max(rows.length, 1)}
          onPageChange={() => {
            /* 非分页端点：恒单页，无翻页语义 */
          }}
        />
      </div>
    </div>
  );
};

export default BackupsPage;
