import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import type { AuditLog, DailyActivityStat, SystemHealth } from '@remotehub/shared';
import { useDashboard, useMe, useUserStats } from '../api/queries';
import { AUDIT_ACTION_LABELS } from '../constants';
import { PageLoading } from './LoadingStates';
import { useUI } from './UIComponents';
import { errMsg, formatTime, formatUptime, usageTier } from '../utils';

/** 使用率进度条：pct<0 显示「未知」且不渲染条（diskUsage=-1 约定） */
function UsageBar({ label, pct, testId }: { label: string; pct: number; testId: string }) {
  const unknown = pct < 0;
  return (
    <div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>{label}</span>
        <span>{unknown ? '未知' : `${pct}%`}</span>
      </div>
      {!unknown && (
        <div className="mt-1 h-2 rounded bg-slate-700">
          <div
            data-testid={`${testId}-bar`}
            className={`h-2 rounded ${usageTier(pct)}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
    </div>
  );
}

/** 趋势折线（自绘 SVG，无图表依赖）：logins（sky）/ operations（emerald）双线，UTC 日键直排 */
function TrendChart({ data }: { data: DailyActivityStat[] }) {
  if (data.length === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-slate-500">暂无趋势数据</div>;
  }
  const W = 600;
  const H = 200;
  const PAD = 6;
  const max = Math.max(...data.map((d) => Math.max(d.logins, d.operations)), 1);
  const toPoints = (key: 'logins' | 'operations') =>
    data
      .map((d, i) => {
        const x = data.length === 1 ? W / 2 : PAD + (i * (W - 2 * PAD)) / (data.length - 1);
        const y = H - PAD - (d[key] / max) * (H - 2 * PAD);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');

  return (
    <svg viewBox="0 0 600 200" preserveAspectRatio="none" className="h-40 w-full" role="img" aria-label="近 30 天活跃趋势" data-testid="trend-svg">
      <polyline data-testid="trend-line-logins" points={toPoints('logins')} fill="none" stroke="#38bdf8" strokeWidth="2" />
      <polyline data-testid="trend-line-operations" points={toPoints('operations')} fill="none" stroke="#34d399" strokeWidth="2" />
    </svg>
  );
}

/** 健康卡片：数据库 ✓/✗ + 磁盘/内存进度条（阈值变色）+ uptime 人性化 */
function HealthCard({ health }: { health: SystemHealth }) {
  return (
    <section data-testid="health-card" className="rounded-xl border border-white/10 bg-slate-900 p-5">
      <h2 className="text-sm font-semibold text-slate-200">系统健康</h2>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-slate-400">数据库</span>
        <span className={health.database ? 'text-emerald-400' : 'text-red-500'}>{health.database ? '✓' : '✗'}</span>
      </div>
      <div className="mt-3 space-y-3">
        <UsageBar label="磁盘使用率" pct={health.diskUsage} testId="disk" />
        <UsageBar label="内存使用率" pct={health.memoryUsage} testId="memory" />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-slate-400">运行时长</span>
        <span className="text-slate-200">{formatUptime(health.uptime)}</span>
      </div>
    </section>
  );
}

/** 活动流单行：result 点 + 时间 + action 中文 + 操作人（null→系统）；SECURITY_* 整行橙色高亮 */
function ActivityItem({ item }: { item: AuditLog }) {
  const isSecurity = item.action.startsWith('SECURITY_');
  return (
    <li
      data-testid={`activity-item-${item.id}`}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isSecurity ? 'border-l-2 border-amber-500 bg-amber-500/10' : ''}`}
    >
      <span
        data-testid={`result-dot-${item.id}`}
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${item.result === 'success' ? 'bg-emerald-400' : 'bg-red-500'}`}
      />
      <span className="shrink-0 text-xs text-slate-400">{formatTime(item.createdAt)}</span>
      <span className="text-slate-200">{AUDIT_ACTION_LABELS[item.action] ?? item.action}</span>
      <span className="ml-auto text-xs text-slate-400">{item.username ?? '系统'}</span>
    </li>
  );
}

const AdminDashboardPage: React.FC = () => {
  const { data: me, isPending } = useMe();
  // hooks 顶层无条件调用（React 规则），守卫只控制渲染分支
  const dashboard = useDashboard();
  const trend = useUserStats();
  const { toast } = useUI();

  // 数据加载失败 → toast（errMsg 中文兜底，UserManagementModal 先例）
  useEffect(() => {
    if (dashboard.isError) toast('error', '加载失败', errMsg(dashboard.error, '无法加载仪表盘'));
  }, [dashboard.isError, dashboard.error, toast]);
  useEffect(() => {
    if (trend.isError) toast('error', '加载失败', errMsg(trend.error, '无法加载趋势数据'));
  }, [trend.isError, trend.error, toast]);

  if (isPending) return <PageLoading message="加载中..." />;
  // fail-closed：useMe 失败（me=undefined，retry:false）时一并重定向，不留渲染分支
  if (!me || me.role !== 'admin') return <Navigate to="/" replace />;

  const stats = dashboard.data?.stats;
  const activity = dashboard.data?.recentActivity ?? [];

  return (
    <div className="min-h-screen bg-slate-950 p-8">
      <h1 className="text-xl font-bold text-white tracking-tight">管理仪表盘</h1>

      {/* 在线数大数字 + 统计三格（与顶栏同口径的 onlineUsers，一致性验收留给 P0-10 双 tab） */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div data-testid="online-count" className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <div className="text-3xl font-bold text-white">{dashboard.data?.onlineUsers ?? '—'}</div>
          <div className="mt-1 text-xs text-slate-400">当前在线</div>
        </div>
        <div data-testid="stat-projects" className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <div className="text-3xl font-bold text-white">{stats?.totalProjects ?? '—'}</div>
          <div className="mt-1 text-xs text-slate-400">项目总数</div>
        </div>
        <div data-testid="stat-connections" className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <div className="text-3xl font-bold text-white">{stats?.totalConnections ?? '—'}</div>
          <div className="mt-1 text-xs text-slate-400">连接总数</div>
        </div>
        <div data-testid="stat-users" className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <div className="text-3xl font-bold text-white">{stats?.totalUsers ?? '—'}</div>
          <div className="mt-1 text-xs text-slate-400">用户总数</div>
        </div>
      </div>

      {/* 健康卡片 + 趋势折线 */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {dashboard.data ? (
          <HealthCard health={dashboard.data.health} />
        ) : (
          <section data-testid="health-card" className="rounded-xl border border-white/10 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold text-slate-200">系统健康</h2>
            <p className="mt-3 text-sm text-slate-500">暂无健康数据</p>
          </section>
        )}
        <section className="rounded-xl border border-white/10 bg-slate-900 p-5">
          <h2 className="text-sm font-semibold text-slate-200">活跃趋势（近 30 天）</h2>
          <div className="mt-3">
            <TrendChart data={trend.data ?? []} />
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-sky-400" />登录</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />操作</span>
          </div>
        </section>
      </div>

      {/* 活动流（最近 20 条，全显口径含 failure 与安全事件） */}
      <section className="mt-4 rounded-xl border border-white/10 bg-slate-900 p-5">
        <h2 className="text-sm font-semibold text-slate-200">最近活动</h2>
        {activity.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">暂无活动记录</p>
        ) : (
          <ul className="mt-3 space-y-1">
            {activity.map((item) => (
              <ActivityItem key={item.id} item={item} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default AdminDashboardPage;
