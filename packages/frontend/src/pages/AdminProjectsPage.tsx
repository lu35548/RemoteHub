import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useMe, useProjects, useArchivedProjects, useBatchArchive, useBatchRestore } from '../api/queries';
import { PageLoading } from '../components/LoadingStates';
import { Pagination } from '../components/Pagination';
import { useUI } from '../components/UIComponents';
import { errMsg } from '../utils';
import { ARCHIVED_LIST_PAGE_SIZE } from '../constants';

/** 管理页分页大小（=后端 clamp 上限，与工作台主列表同口径） */
const PAGE_SIZE = 100;

/**
 * 管理后台项目页（批 13b C1，/admin/projects）：
 * 双态列表（进行中/已归档）+ 多选 + 批量归档/批量恢复。
 * 门禁两段式对齐三 admin 页先例：loader 只验登录（main.tsx），admin 角色在页面内校验（Navigate fail-closed）。
 * 列表复用工作台既有 hooks——queryKey 与主列表/归档列表同族，mutation invalidate ['projects']
 * 时本页双 tab 与工作台列表同步刷新，无额外失效接线。
 */
const AdminProjectsPage: React.FC = () => {
  const { toast, confirm } = useUI();
  // hooks 顶层无条件调用（React 规则），守卫只控制渲染分支（AdminDashboardPage 先例）
  const { data: me, isPending } = useMe();
  const [statusTab, setStatusTab] = useState<'active' | 'archived'>('active');
  const [page, setPage] = useState(1);
  // 多选集合（选择属于特定页+特定 tab 的结果集：翻页/切 tab 即清空，防止跨结果集误操作）
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  // 双态列表 hooks 顶层无条件调用：非当前 tab 的查询多一次 GET（管理页量级可接受），
  // 换取 invalidate ['projects'] 时双 tab 与工作台既有列表全自动同步（无手工失效接线）
  const activeList = useProjects(page, PAGE_SIZE);
  const archivedList = useArchivedProjects(page, ARCHIVED_LIST_PAGE_SIZE);
  const batchArchiveMutation = useBatchArchive();
  const batchRestoreMutation = useBatchRestore();

  if (isPending) return <PageLoading message="加载中..." />;
  // fail-closed：useMe 失败（me=undefined，retry:false）时一并重定向，不留渲染分支
  if (!me || me.role !== 'admin') return <Navigate to="/" replace />;

  const list = statusTab === 'active' ? activeList : archivedList;
  const items = list.data?.data ?? [];
  const total = list.data?.pagination.total ?? 0;
  const allSelected = items.length > 0 && items.every((p) => selectedIds.includes(p.id));

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  };
  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : items.map((p) => p.id));
  };

  /** 批量结果 → toast：成功集取响应数组长度（archive→archived / restore→restored，后端真形状）；
   * skipped（无权/不存在/状态已一致幂等跳过）>0 时文案明示跳过数，尽力而为语义不整体报错 */
  const toastBatchResult = (action: '归档' | '恢复', ok: string[], skipped: string[]) => {
    if (skipped.length === 0) {
      toast('success', `批量${action}完成`, `已${action} ${ok.length} 个项目`);
    } else {
      toast('success', `批量${action}完成`, `已${action} ${ok.length} 个，跳过 ${skipped.length} 个（无权限或状态不符）`);
    }
  };

  const runBatch = (op: 'archive' | 'restore') => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (op === 'archive') {
      // 归档可逆：confirm 文案说明后果与恢复路径（对齐 App #48 单项归档先例）
      confirm({
        title: '批量归档',
        message: `归档后所选 ${ids.length} 个项目将从工作台默认列表隐藏，可随时恢复。`,
        confirmText: '确认归档',
        onConfirm: async () => {
          try {
            const result = await batchArchiveMutation.mutateAsync(ids);
            toastBatchResult('归档', result.archived, result.skipped);
            // 列表刷新由 mutation onSuccess invalidate ['projects'] 承载；清空选择（行可能已移出当前 tab）
            setSelectedIds([]);
          } catch (err) {
            toast('error', '批量归档失败', errMsg(err, '无法归档所选项目'));
          }
        },
      });
      return;
    }
    // 恢复 = 正向幂等操作，直接执行不 confirm（App handleRestoreProject 先例）
    void (async () => {
      try {
        const result = await batchRestoreMutation.mutateAsync(ids);
        toastBatchResult('恢复', result.restored, result.skipped);
        setSelectedIds([]);
      } catch (err) {
        toast('error', '批量恢复失败', errMsg(err, '无法恢复所选项目'));
      }
    })();
  };

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white tracking-tight">项目管理</h1>
        <Link to="/admin/dashboard" className="text-xs text-slate-400 hover:text-blue-300 transition-colors">
          ← 返回仪表盘
        </Link>
      </div>

      {/* 双态 tab（aria-pressed segmented，对齐 ConnectionFilterBar 排序切换先例）；切 tab 重置分页与选择 */}
      <div className="mt-4 flex items-center gap-1.5" role="group" aria-label="项目状态">
        {(['active', 'archived'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={statusTab === tab}
            onClick={() => { setStatusTab(tab); setPage(1); setSelectedIds([]); }}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              statusTab === tab ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab === 'active' ? '进行中' : '已归档'}
          </button>
        ))}
      </div>

      {/* 批量操作条：选中即显（数量随勾选随动；按当前 tab 出归档/恢复按钮） */}
      {selectedIds.length > 0 && (
        <div role="status" className="mt-3 flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5">
          <span className="text-sm text-blue-200">已选 {selectedIds.length} 个</span>
          {statusTab === 'active' ? (
            <button
              type="button"
              onClick={() => runBatch('archive')}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              批量归档
            </button>
          ) : (
            <button
              type="button"
              onClick={() => runBatch('restore')}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            >
              批量恢复
            </button>
          )}
        </div>
      )}

      {/* 列表卡（表头全选 + 行 checkbox + 状态徽章；空态文案随 tab 区分） */}
      <div className="mt-4 rounded-xl border border-white/10 bg-slate-900">
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5 text-xs text-slate-400">
          <input type="checkbox" aria-label="全选本页" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-blue-600" />
          <span>项目</span>
          <span className="ml-auto">状态</span>
        </div>
        {items.length === 0 ? (
          <p className="px-4 py-8 text-sm text-slate-500">{statusTab === 'active' ? '暂无项目' : '暂无已归档项目'}</p>
        ) : (
          <ul>
            {items.map((p) => {
              // status 仅归档列表项携带（ProjectListItemWithStatus）；主列表项无该键时按 active 兜底
              const archived = 'status' in p ? p.status === 'archived' : false;
              return (
                <li key={p.id} className="flex items-center gap-3 border-b border-white/5 px-4 py-2.5 text-sm last:border-b-0">
                  <input
                    type="checkbox"
                    aria-label={`选择 ${p.name}`}
                    checked={selectedIds.includes(p.id)}
                    onChange={() => toggleRow(p.id)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span className="text-slate-200">{p.name}</span>
                  <span className="ml-auto text-xs">
                    {archived ? (
                      <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-amber-400">已归档</span>
                    ) : (
                      <span className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-400">进行中</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {total > 0 && (
          <Pagination
            page={page}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={(p) => { setPage(p); setSelectedIds([]); }}
            className="px-4 py-3"
          />
        )}
      </div>
    </div>
  );
};

export default AdminProjectsPage;
