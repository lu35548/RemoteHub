import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import AuditLogsPage from './AuditLogsPage';
import type { AuditLog, PaginatedResponse, UserPublic } from '@remotehub/shared';

// mock 数据层：useMe 受控（两段式守卫的第二段在组件内）+ 审计三件（P0-9）
vi.mock('../api/queries', () => ({
  useMe: vi.fn(),
  useAuditLogs: vi.fn(),
  useUsers: vi.fn(),
  exportAuditLogsCsv: vi.fn(),
}));
// UIComponents 仅 mock useUI（toast 受控），PageLoading 等保持真实现
vi.mock('./UIComponents', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useUI: vi.fn(),
}));
import { useAuditLogs, exportAuditLogsCsv, useMe, useUsers } from '../api/queries';
import { useUI } from './UIComponents';

const mockedUseMe = useMe as ReturnType<typeof vi.fn>;
const mockedUseAuditLogs = useAuditLogs as ReturnType<typeof vi.fn>;
const mockedUseUsers = useUsers as ReturnType<typeof vi.fn>;
const mockedExportCsv = exportAuditLogsCsv as ReturnType<typeof vi.fn>;
const mockedUseUI = useUI as ReturnType<typeof vi.fn>;

const admin: UserPublic = { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' };
const normalUser: UserPublic = { ...admin, id: 'u2', username: 'wangwu', nickname: '王五', role: 'user' };

const log = (overrides: Partial<AuditLog>): AuditLog => ({
  id: 'log1', username: 'admin', userId: 'u1', action: 'AUTH_LOGIN', resource: 'user',
  resourceId: 'u1', result: 'success', detail: null, ip: '192.168.1.10', userAgent: null,
  createdAt: '2026-09-23T03:59:00.000Z', ...overrides,
});

const logsPage = (rows: AuditLog[], total = rows.length): PaginatedResponse<AuditLog> => ({
  success: true, data: rows, pagination: { page: 1, pageSize: 20, total },
});

const usersPage: PaginatedResponse<UserPublic> = {
  success: true, data: [admin, normalUser], pagination: { page: 1, pageSize: 100, total: 2 },
};

/** 测试壳：MemoryRouter + 位置探针 + / 承接路由（断言重定向落点） */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/audit-logs']}>
      <Routes>
        <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
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

/** 守卫用例共用：hooks 默认返回成功数据（守卫路径不消费内容）；导出 mock 对齐真实形状（Promise<void>） */
function mockSuccessData(rows: AuditLog[] = []) {
  mockedUseUsers.mockReturnValue({ data: usersPage, isPending: false } as never);
  mockedUseAuditLogs.mockReturnValue({ data: logsPage(rows), isPending: false } as never);
  mockedExportCsv.mockResolvedValue(undefined);
}

describe('AuditLogsPage 守卫（P0-7）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseUI.mockReturnValue({ toast: vi.fn(), confirm: vi.fn() });
    mockSuccessData();
  });

  it('isPending → 不渲染标题且不重定向', () => {
    mockedUseMe.mockReturnValue({ data: undefined, isPending: true });
    renderPage();
    expect(screen.queryByText('审计日志')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin/audit-logs');
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
    expect(screen.queryByText('建设中')).not.toBeInTheDocument();
  });

  it('admin → 页标题可见，建设中占位移除', () => {
    mockedUseMe.mockReturnValue({ data: admin, isPending: false });
    renderPage();
    expect(screen.getByText('审计日志')).toBeInTheDocument();
    expect(screen.queryByText('建设中')).not.toBeInTheDocument();
  });
});

describe('AuditLogsPage 审计查询（P0-9）', () => {
  const rows = [
    log({ id: 'a1', username: 'admin', action: 'AUTH_LOGIN', resource: 'user', resourceId: 'u1', ip: '192.168.1.10', result: 'success', detail: null }),
    log({ id: 'a2', username: null, userId: null, action: 'PROJECT_DELETE', resource: 'project', resourceId: 'p1', ip: null, result: 'failure', detail: { before: { name: '旧项目' }, after: { name: '新项目' }, reason: '重命名' } }),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseUI.mockReturnValue({ toast: vi.fn(), confirm: vi.fn() });
    mockedUseMe.mockReturnValue({ data: admin, isPending: false });
    mockSuccessData(rows);
  });

  it('表格行：中文标签 / 操作人 null→系统 / IP 与资源 ID 占位 / result 徽章配色 / detail 折叠', () => {
    renderPage();

    // 行定位：result 徽章 testid → closest('tr')（within 作用域避开筛选下拉 option 同文案）
    const row1 = screen.getByTestId('result-badge-a1').closest('tr')!;
    const row2 = screen.getByTestId('result-badge-a2').closest('tr')!;
    // 操作 / 资源中文标签
    expect(within(row1).getByText('登录')).toBeInTheDocument();
    expect(within(row1).getByText('用户')).toBeInTheDocument();
    expect(within(row2).getByText('删除项目')).toBeInTheDocument();
    expect(within(row2).getByText('项目')).toBeInTheDocument();
    // 操作人：有值直出，null → 系统
    expect(within(row1).getByText('admin')).toBeInTheDocument();
    expect(within(row2).getByText('系统')).toBeInTheDocument();
    // IP / 资源 ID：null → —
    expect(within(row1).getByText('192.168.1.10')).toBeInTheDocument();
    expect(within(row2).getByText('—')).toBeInTheDocument();
    // result 徽章：成功绿 / 失败红
    expect(screen.getByTestId('result-badge-a1')).toHaveTextContent('成功');
    expect(screen.getByTestId('result-badge-a1')).toHaveClass('text-emerald-400');
    expect(screen.getByTestId('result-badge-a2')).toHaveTextContent('失败');
    expect(screen.getByTestId('result-badge-a2')).toHaveClass('text-red-400');
    // detail：有值折叠展开（before/after/reason JSON），null → —
    expect(row2.textContent).toContain('旧项目');
    expect(row2.textContent).toContain('重命名');
    expect(row2.querySelector('details')).toBeInTheDocument();
    expect(row1.querySelector('details')).not.toBeInTheDocument();
  });

  it('空结果 → 空态文案「暂无审计日志」', () => {
    mockedUseAuditLogs.mockReturnValue({ data: logsPage([]), isPending: false } as never);
    renderPage();
    expect(screen.getByText('暂无审计日志')).toBeInTheDocument();
  });

  it('action 下拉变更 → useAuditLogs 收到新 filters 且 page 重置 1', () => {
    // total=45 → 3 页，「下一页」可点（mock 须在渲染前置，DataTable 受控 total 渲染时取值）
    mockedUseAuditLogs.mockReturnValue({ data: logsPage(rows, 45), isPending: false } as never);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(mockedUseAuditLogs.mock.lastCall?.[1]).toBe(2);

    fireEvent.change(screen.getByLabelText('操作类型'), { target: { value: 'AUTH_LOGIN' } });
    expect(mockedUseAuditLogs.mock.lastCall?.[0]).toMatchObject({ action: 'AUTH_LOGIN' });
    expect(mockedUseAuditLogs.mock.lastCall?.[1]).toBe(1);
  });

  it('用户下拉与开始日期变更 → filters 同步（多筛选叠加不丢已选）', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('操作用户'), { target: { value: 'u2' } });
    expect(mockedUseAuditLogs.mock.lastCall?.[0]).toMatchObject({ userId: 'u2' });

    fireEvent.change(screen.getByLabelText('开始日期'), { target: { value: '2026-09-01' } });
    expect(mockedUseAuditLogs.mock.lastCall?.[0]).toMatchObject({ userId: 'u2', startDate: '2026-09-01' });
  });

  it('result segmented「失败」→ filters.result=failure；「全部」→ 移除', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '失败' }));
    expect(mockedUseAuditLogs.mock.lastCall?.[0]).toMatchObject({ result: 'failure' });

    fireEvent.click(screen.getByRole('button', { name: '全部' }));
    // result: undefined 与缺键在 queryKey hash 与 URL 拼装上等价（TanStack 丢 undefined 键、auditLogParams 跳过）
    expect(mockedUseAuditLogs.mock.lastCall?.[0].result).toBeUndefined();
  });

  it('翻页回调：下一页 → useAuditLogs page=2', () => {
    mockedUseAuditLogs.mockReturnValue({ data: logsPage(rows, 45), isPending: false } as never);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(mockedUseAuditLogs.mock.lastCall?.[1]).toBe(2);
  });

  it('导出按钮 → exportAuditLogsCsv 收到当前筛选', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('资源类型'), { target: { value: 'project' } });
    fireEvent.click(screen.getByTitle('最多导出最近 10000 条'));
    expect(mockedExportCsv).toHaveBeenCalledWith({ resource: 'project' });
  });

  it('useAuditLogs 失败 → toast 中文错误（errMsg 兜底）', async () => {
    const toast = vi.fn();
    mockedUseUI.mockReturnValue({ toast, confirm: vi.fn() });
    mockedUseAuditLogs.mockReturnValue({
      data: undefined, isPending: false, isError: true, error: new Error('boom'),
    } as never);
    renderPage();

    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', '加载失败', '无法加载审计日志'));
  });

  it('导出失败 → toast 中文错误', async () => {
    const toast = vi.fn();
    mockedUseUI.mockReturnValue({ toast, confirm: vi.fn() });
    mockedExportCsv.mockRejectedValue(new Error('network'));
    renderPage();

    fireEvent.click(screen.getByTitle('最多导出最近 10000 条'));
    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', '导出失败', '导出失败'));
  });
});
