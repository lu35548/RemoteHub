import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import AdminDashboardPage from './AdminDashboardPage';
import { formatUptime, usageTier } from '../utils';
import type { AuditLog, DailyActivityStat, Dashboard, UserPublic } from '@remotehub/shared';

// mock 数据层：useMe 受控（两段式守卫的第二段在组件内）+ 监控三 hooks（P0-8）
vi.mock('../api/queries', () => ({
  useMe: vi.fn(),
  useDashboard: vi.fn(),
  useUserStats: vi.fn(),
}));
// UIComponents 仅 mock useUI（toast 受控），PageLoading 等保持真实现
vi.mock('./UIComponents', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useUI: vi.fn(),
}));
import { useDashboard, useMe, useUserStats } from '../api/queries';
import { useUI } from './UIComponents';

const mockedUseMe = useMe as ReturnType<typeof vi.fn>;
const mockedUseDashboard = useDashboard as ReturnType<typeof vi.fn>;
const mockedUseUserStats = useUserStats as ReturnType<typeof vi.fn>;
const mockedUseUI = useUI as ReturnType<typeof vi.fn>;

const admin: UserPublic = { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' };
const normalUser: UserPublic = { ...admin, id: 'u2', username: 'wangwu', nickname: '王五', role: 'user' };

const log = (overrides: Partial<AuditLog>): AuditLog => ({
  id: 'log1', username: 'admin', userId: 'u1', action: 'AUTH_LOGIN', resource: 'user',
  resourceId: null, result: 'success', detail: null, ip: null, userAgent: null,
  createdAt: '2026-09-15T11:59:00.000Z', ...overrides,
});

const dashboardData: Dashboard = {
  health: { status: 'healthy', database: true, diskUsage: 40, memoryUsage: 55, uptime: 90061 },
  onlineUsers: 3,
  stats: { totalProjects: 4, totalConnections: 11, totalUsers: 7 },
  recentActivity: [log({})],
};

const trend3: DailyActivityStat[] = [
  { date: '2026-09-13', logins: 2, operations: 8 },
  { date: '2026-09-14', logins: 5, operations: 3 },
  { date: '2026-09-15', logins: 1, operations: 0 },
];

/** 测试壳：MemoryRouter + 位置探针 + / 承接路由（断言重定向落点） */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <Routes>
        <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
        <Route path="/" element={<div>工作台占位</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

/** 守卫用例共用：hooks 默认返回成功数据（守卫路径不消费内容） */
function mockSuccessData() {
  mockedUseDashboard.mockReturnValue({ data: dashboardData, isPending: false } as never);
  mockedUseUserStats.mockReturnValue({ data: trend3, isPending: false } as never);
}

describe('AdminDashboardPage 守卫（P0-7）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseUI.mockReturnValue({ toast: vi.fn(), confirm: vi.fn() });
    mockSuccessData();
  });

  it('isPending → 不渲染标题且不重定向', () => {
    mockedUseMe.mockReturnValue({ data: undefined, isPending: true });
    renderPage();
    expect(screen.queryByText('管理仪表盘')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin/dashboard');
  });

  it('非 admin → Navigate 重定向回工作台', () => {
    mockedUseMe.mockReturnValue({ data: normalUser, isPending: false });
    renderPage();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/');
    expect(screen.getByText('工作台占位')).toBeInTheDocument();
  });

  it('useMe 失败（me=undefined）→ fail-closed 同样重定向', () => {
    mockedUseMe.mockReturnValue({ data: undefined, isPending: false });
    renderPage();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/');
    expect(screen.queryByText('管理仪表盘')).not.toBeInTheDocument();
  });

  it('admin → 页标题可见，骨架占位移除', () => {
    mockedUseMe.mockReturnValue({ data: admin, isPending: false });
    renderPage();
    expect(screen.getByText('管理仪表盘')).toBeInTheDocument();
    expect(screen.queryByText('建设中')).not.toBeInTheDocument();
  });
});

describe('AdminDashboardPage 仪表盘（P0-8）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseUI.mockReturnValue({ toast: vi.fn(), confirm: vi.fn() });
    mockedUseMe.mockReturnValue({ data: admin, isPending: false });
  });

  it('五块结构：健康卡 / 在线数 / 趋势 / 统计三格 / 活动流', () => {
    mockedUseDashboard.mockReturnValue({ data: dashboardData, isPending: false } as never);
    mockedUseUserStats.mockReturnValue({ data: trend3, isPending: false } as never);
    renderPage();

    expect(screen.getByTestId('health-card')).toBeInTheDocument();
    expect(screen.getByTestId('online-count')).toHaveTextContent('3');
    expect(screen.getByTestId('trend-svg')).toBeInTheDocument();
    expect(screen.getByTestId('stat-projects')).toHaveTextContent('4');
    expect(screen.getByTestId('stat-connections')).toHaveTextContent('11');
    expect(screen.getByTestId('stat-users')).toHaveTextContent('7');
    expect(screen.getByTestId('activity-item-log1')).toBeInTheDocument();
  });

  it('健康色档：disk 40% / memory 55% → 双绿；disk 80% / memory 95% → 黄/红（75/90 两档）', () => {
    mockedUseDashboard.mockReturnValue({
      data: { ...dashboardData, health: { ...dashboardData.health, diskUsage: 40, memoryUsage: 55 } },
      isPending: false,
    } as never);
    mockedUseUserStats.mockReturnValue({ data: trend3, isPending: false } as never);
    const { container } = renderPage();
    expect(container.querySelector('[data-testid="disk-bar"]')).toHaveClass('bg-green-500');
    expect(container.querySelector('[data-testid="memory-bar"]')).toHaveClass('bg-green-500');

    container.remove();
    mockedUseDashboard.mockReturnValue({
      data: { ...dashboardData, health: { ...dashboardData.health, diskUsage: 80, memoryUsage: 95 } },
      isPending: false,
    } as never);
    const second = renderPage();
    expect(second.container.querySelector('[data-testid="disk-bar"]')).toHaveClass('bg-yellow-500');
    expect(second.container.querySelector('[data-testid="memory-bar"]')).toHaveClass('bg-red-500');
  });

  it('usageTier 边界：74 绿 / 75 黄 / 89 黄 / 90 红', () => {
    expect(usageTier(74)).toBe('bg-green-500');
    expect(usageTier(75)).toBe('bg-yellow-500');
    expect(usageTier(89)).toBe('bg-yellow-500');
    expect(usageTier(90)).toBe('bg-red-500');
  });

  it('diskUsage=-1 → 显示「未知」，不渲染进度条', () => {
    mockedUseDashboard.mockReturnValue({
      data: { ...dashboardData, health: { ...dashboardData.health, diskUsage: -1 } },
      isPending: false,
    } as never);
    mockedUseUserStats.mockReturnValue({ data: trend3, isPending: false } as never);
    const { container } = renderPage();

    expect(screen.getByText('未知')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="disk-bar"]')).not.toBeInTheDocument();
    // memory 条不受影响
    expect(container.querySelector('[data-testid="memory-bar"]')).toBeInTheDocument();
  });

  it('formatUptime 人性化：90061→1天1时1分 / 3661→1时1分 / 300→5分', () => {
    expect(formatUptime(90061)).toBe('1天1时1分');
    expect(formatUptime(3661)).toBe('1时1分');
    expect(formatUptime(300)).toBe('5分');
  });

  it('趋势 SVG：双线 polyline 点数 = 数据天数', () => {
    mockedUseDashboard.mockReturnValue({ data: dashboardData, isPending: false } as never);
    mockedUseUserStats.mockReturnValue({ data: trend3, isPending: false } as never);
    renderPage();

    for (const id of ['trend-line-logins', 'trend-line-operations']) {
      const points = screen.getByTestId(id).getAttribute('points') ?? '';
      expect(points.split(' ')).toHaveLength(3);
    }
  });

  it('趋势空数据 → 空态文案「暂无趋势数据」', () => {
    mockedUseDashboard.mockReturnValue({ data: dashboardData, isPending: false } as never);
    mockedUseUserStats.mockReturnValue({ data: [], isPending: false } as never);
    renderPage();

    expect(screen.getByText('暂无趋势数据')).toBeInTheDocument();
  });

  it('活动流：action 中文标签 / username null→「系统」/ failure 红点 / SECURITY_* 整行高亮', () => {
    mockedUseDashboard.mockReturnValue({
      data: {
        ...dashboardData,
        recentActivity: [
          log({ id: 'a1', username: 'admin', action: 'AUTH_LOGIN', result: 'success' }),
          log({ id: 'a2', username: null, action: 'CONNECTION_ACCESS', result: 'success' }),
          log({ id: 'a3', username: null, action: 'SECURITY_SUSPICIOUS_IP', resource: 'security', result: 'failure' }),
          log({ id: 'a4', username: 'wangwu', action: 'PROJECT_CREATE', resource: 'project', result: 'failure' }),
        ],
      },
      isPending: false,
    } as never);
    mockedUseUserStats.mockReturnValue({ data: trend3, isPending: false } as never);
    renderPage();

    // action 中文标签（within 行作用域：避开趋势图例同文案，如「登录」）
    expect(within(screen.getByTestId('activity-item-a1')).getByText('登录')).toBeInTheDocument();
    expect(within(screen.getByTestId('activity-item-a2')).getByText('访问连接')).toBeInTheDocument();
    expect(within(screen.getByTestId('activity-item-a3')).getByText('可疑 IP 告警')).toBeInTheDocument();
    expect(within(screen.getByTestId('activity-item-a4')).getByText('创建项目')).toBeInTheDocument();
    // username null → 系统（两行）
    expect(screen.getAllByText('系统')).toHaveLength(2);
    // success 绿点 / failure 红点
    expect(screen.getByTestId('result-dot-a1')).toHaveClass('bg-emerald-400');
    expect(screen.getByTestId('result-dot-a3')).toHaveClass('bg-red-500');
    expect(screen.getByTestId('result-dot-a4')).toHaveClass('bg-red-500');
    // SECURITY_* 整行橙色高亮（amber），普通行无
    expect(screen.getByTestId('activity-item-a3')).toHaveClass('bg-amber-500/10');
    expect(screen.getByTestId('activity-item-a1')).not.toHaveClass('bg-amber-500/10');
  });

  it('useDashboard 失败 → toast 中文错误（errMsg 兜底）', () => {
    const toast = vi.fn();
    mockedUseUI.mockReturnValue({ toast, confirm: vi.fn() });
    mockedUseDashboard.mockReturnValue({
      data: undefined, isPending: false, isError: true, error: new Error('boom'),
    } as never);
    mockedUseUserStats.mockReturnValue({ data: trend3, isPending: false } as never);
    renderPage();

    expect(toast).toHaveBeenCalledWith('error', '加载失败', '无法加载仪表盘');
  });
});
