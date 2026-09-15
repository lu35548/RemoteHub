import React from 'react';
import { Navigate } from 'react-router-dom';
import { useMe } from '../api/queries';
import { PageLoading } from './LoadingStates';

/**
 * 管理后台 - 仪表盘页（P0-7 骨架，P0-8 填充数据面板）。
 * 两段式守卫的第二段：loader 只验登录（requireAuth），admin 角色在此校验——
 * access token payload 仅 { userId } 无 role，不动 jwt.ts 一期签名契约。
 */
const AdminDashboardPage: React.FC = () => {
  const { data: me, isPending } = useMe();

  if (isPending) return <PageLoading message="加载中..." />;
  // fail-closed：useMe 失败（me=undefined，retry:false）时一并重定向，不留渲染分支
  if (!me || me.role !== 'admin') return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <h1 className="text-xl font-bold text-white tracking-tight">管理仪表盘</h1>
      <div className="mt-8 border border-dashed border-white/10 rounded-xl p-10 text-center text-sm text-slate-500">
        建设中
      </div>
    </div>
  );
};

export default AdminDashboardPage;
