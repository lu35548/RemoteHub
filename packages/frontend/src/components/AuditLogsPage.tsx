import React from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../api/queries';
import { PageLoading } from './LoadingStates';

/**
 * 管理后台 - 审计日志页（P0-7 骨架，P0-9 填充筛选栏 + DataTable + CSV 导出）。
 * 守卫模式与 AdminDashboardPage 同构（两段式第二段）。
 */
const AuditLogsPage: React.FC = () => {
  const { data: me, isPending } = useMe();

  if (isPending) return <PageLoading message="加载中..." />;
  // fail-closed：useMe 失败（me=undefined，retry:false）时一并重定向，不留渲染分支
  if (!me || me.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <h1 className="text-xl font-bold text-white tracking-tight">审计日志</h1>
      <div className="mt-8 border border-dashed border-white/10 rounded-xl p-10 text-center text-sm text-slate-500">
        建设中
      </div>
    </div>
  );
};

export default AuditLogsPage;
