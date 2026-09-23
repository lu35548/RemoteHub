import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { DEFAULT_PAGE_SIZE } from '@remotehub/shared';
import type { AuditAction, AuditLog, AuditLogQuery, AuditResult, AuditResource } from '@remotehub/shared';
import { exportAuditLogsCsv, useAuditLogs, useMe, useUsers } from '../api/queries';
import { AUDIT_ACTION_LABELS, AUDIT_RESOURCE_LABELS } from '../constants';
import { DataTable } from './DataTable';
import { PageLoading } from './LoadingStates';
import { useUI } from './UIComponents';
import { errMsg, formatTime } from '../utils';

/** result 徽章（成功绿 / 失败红）与文本 */
const resultBadge = (result: AuditResult): { className: string; text: string } =>
  result === 'success'
    ? { className: 'inline-flex rounded border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-400', text: '成功' }
    : { className: 'inline-flex rounded border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-xs text-red-400', text: '失败' };

/** result segmented 选项（空串 = 全部，不设 result 参数） */
const RESULT_OPTIONS: Array<{ value: '' | AuditResult; label: string }> = [
  { value: '', label: '全部' },
  { value: 'success', label: '成功' },
  { value: 'failure', label: '失败' },
];

const selectClass =
  'rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500';

const AuditLogsPage: React.FC = () => {
  const { data: me, isPending } = useMe();
  // hooks 顶层无条件调用（React 规则），守卫只控制渲染分支
  const [filters, setFilters] = useState<AuditLogQuery>({});
  const [page, setPage] = useState(1);
  const users = useUsers(1);
  const audit = useAuditLogs(filters, page);
  const { toast } = useUI();

  // 数据加载失败 → toast（errMsg 中文兜底，AdminDashboardPage 先例）
  useEffect(() => {
    if (audit.isError) toast('error', '加载失败', errMsg(audit.error, '无法加载审计日志'));
  }, [audit.isError, audit.error, toast]);

  if (isPending) return <PageLoading message="加载中..." />;
  // fail-closed：useMe 失败（me=undefined，retry:false）时一并重定向，不留渲染分支
  if (!me || me.role !== 'admin') return <Navigate to="/" replace />;

  /** 筛选变更：合并 patch 并回第 1 页 */
  const updateFilter = (patch: Partial<AuditLogQuery>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const rows = audit.data?.data ?? [];
  const total = audit.data?.pagination.total ?? 0;

  const handleExport = () => {
    exportAuditLogsCsv(filters).catch((e: unknown) => {
      toast('error', '导出失败', errMsg(e, '导出失败'));
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white tracking-tight">审计日志</h1>
        <button
          onClick={handleExport}
          title="最多导出最近 10000 条"
          className="rounded-lg border border-white/10 bg-slate-900 px-4 py-2 text-sm text-slate-200 hover:border-sky-500 hover:text-white transition-colors"
        >
          导出 CSV
        </button>
      </div>

      {/* 筛选栏：用户 / 操作 / 资源 / 日期起止 / result segmented（默认全部） */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <select
          aria-label="操作用户"
          className={selectClass}
          value={filters.userId ?? ''}
          onChange={(e) => updateFilter({ userId: e.target.value || undefined })}
        >
          <option value="">全部用户</option>
          {(users.data?.data ?? []).map((u) => (
            <option key={u.id} value={u.id}>{u.nickname || u.username}</option>
          ))}
        </select>
        <select
          aria-label="操作类型"
          className={selectClass}
          value={filters.action ?? ''}
          onChange={(e) => updateFilter({ action: (e.target.value || undefined) as AuditAction | undefined })}
        >
          <option value="">全部操作</option>
          {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          aria-label="资源类型"
          className={selectClass}
          value={filters.resource ?? ''}
          onChange={(e) => updateFilter({ resource: (e.target.value || undefined) as AuditResource | undefined })}
        >
          <option value="">全部资源</option>
          {Object.entries(AUDIT_RESOURCE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <input
          type="date"
          aria-label="开始日期"
          className={selectClass}
          value={filters.startDate ?? ''}
          onChange={(e) => updateFilter({ startDate: e.target.value || undefined })}
        />
        <input
          type="date"
          aria-label="结束日期"
          className={selectClass}
          value={filters.endDate ?? ''}
          onChange={(e) => updateFilter({ endDate: e.target.value || undefined })}
        />
        <div className="flex rounded-lg border border-white/10 bg-slate-900 p-0.5" role="group" aria-label="执行结果">
          {RESULT_OPTIONS.map(({ value, label }) => {
            const active = (filters.result ?? '') === value;
            return (
              <button
                key={label}
                onClick={() => updateFilter({ result: (value || undefined) as AuditResult | undefined })}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${active ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 表格：detail 折叠展开显脱敏后 JSON，无需前端处理 */}
      <div className="mt-4">
        <DataTable<AuditLog>
          columns={[
            { key: 'createdAt', label: '时间', render: (r) => <span className="whitespace-nowrap text-slate-400">{formatTime(r.createdAt)}</span> },
            { key: 'username', label: '操作人', render: (r) => r.username ?? '系统' },
            { key: 'action', label: '操作', render: (r) => AUDIT_ACTION_LABELS[r.action] ?? r.action },
            { key: 'resource', label: '资源', render: (r) => AUDIT_RESOURCE_LABELS[r.resource] ?? r.resource },
            { key: 'resourceId', label: '资源 ID', render: (r) => <span className="font-mono text-xs text-slate-400">{r.resourceId ?? '—'}</span> },
            { key: 'ip', label: 'IP', render: (r) => r.ip ?? '—' },
            {
              key: 'result',
              label: '结果',
              render: (r) => {
                const badge = resultBadge(r.result);
                return (
                  <span data-testid={`result-badge-${r.id}`} className={badge.className}>
                    {badge.text}
                  </span>
                );
              },
            },
            {
              key: 'detail',
              label: '详情',
              render: (r) =>
                r.detail ? (
                  <details className="max-w-md">
                    <summary className="cursor-pointer text-xs text-sky-400 hover:text-sky-300">详情</summary>
                    <pre className="mt-2 overflow-x-auto rounded-lg border border-white/10 bg-slate-900 p-3 text-xs leading-relaxed text-slate-300">
                      {JSON.stringify(r.detail, null, 2)}
                    </pre>
                  </details>
                ) : (
                  <span className="text-slate-500">—</span>
                ),
            },
          ]}
          rows={rows}
          isLoading={audit.isPending}
          emptyText="暂无审计日志"
          page={page}
          total={total}
          pageSize={DEFAULT_PAGE_SIZE}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
};

export default AuditLogsPage;
