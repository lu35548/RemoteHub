import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AdminProjectsPage from './AdminProjectsPage';
import { useMe } from '../api/queries';

// mock 可变状态（vi.hoisted 供 vi.mock 工厂在提升作用域引用）
const state = vi.hoisted(() => ({
  me: undefined as Record<string, unknown> | undefined,
  mePending: false,
  activeProjects: [] as Array<Record<string, unknown>>,
  activeTotal: undefined as number | undefined,
  archivedProjects: [] as Array<Record<string, unknown>>,
  archivedTotal: undefined as number | undefined,
  // 分页实参捕获：active/archived 两查询各自记录（受控翻页断言面）
  lastActivePages: [] as number[],
  lastArchivedPages: [] as number[],
}));
// 批量操作 mutation（批 13b C1：batch-archive/batch-restore 双操作）
const batchMutations = vi.hoisted(() => ({
  archiveAsync: vi.fn(),
  restoreAsync: vi.fn(),
}));
// useUI 受控 spies（beforeEach 注入 mockReturnValue；断言直接引用，TS 面干净且绕开 mock.results 提取）
const uiSpies = vi.hoisted(() => ({
  toast: vi.fn(),
  confirm: vi.fn(),
}));

// mock 数据层：useMe 受控（两段式守卫第二段在组件内）+ 双态列表 hooks 受控（AdminDashboardPage.test 先例）
vi.mock('../api/queries', () => ({
  useMe: vi.fn(() => ({ data: state.me, isPending: state.mePending })),
  // #49 分页 hooks：捕获 page 实参，返回扁平分页 body（真实运行时形状先例）
  useProjects: vi.fn((page: number = 1) => {
    state.lastActivePages.push(page);
    return {
      data: { success: true as const, data: state.activeProjects, pagination: { page, pageSize: 100, total: state.activeTotal ?? state.activeProjects.length } },
      isPending: false,
    };
  }),
  useArchivedProjects: vi.fn((page: number = 1) => {
    state.lastArchivedPages.push(page);
    return {
      data: { success: true as const, data: state.archivedProjects, pagination: { page, pageSize: 100, total: state.archivedTotal ?? state.archivedProjects.length } },
      isPending: false,
    };
  }),
  // 批 13b 新增 mutation（factory 与 queries.ts 导出同步——缺 key 炸 "No export defined on the mock"）
  useBatchArchive: vi.fn(() => ({ mutateAsync: batchMutations.archiveAsync })),
  useBatchRestore: vi.fn(() => ({ mutateAsync: batchMutations.restoreAsync })),
}));

// UIComponents 仅 mock useUI（toast/confirm 受控断言面），PageLoading 等保持真实现（AdminDashboardPage.test 先例）
vi.mock('../components/UIComponents', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useUI: vi.fn(),
}));
import { useUI } from '../components/UIComponents';

const mockedUseMe = useMe as ReturnType<typeof vi.fn>;
const mockedUseUI = useUI as ReturnType<typeof vi.fn>;

const admin = { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' };
const normalUser = { ...admin, id: 'u2', username: 'wangwu', nickname: '王五', role: 'user' };

const project = (overrides: Record<string, unknown>) => ({
  id: 'p1', name: '默认项目', icon: 'server', status: 'active', currentUserRole: 'owner',
  createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' },
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
  ...overrides,
});

/** 测试壳：QueryClientProvider（mutation 上下文）+ MemoryRouter + 位置探针 + / 承接路由（断言重定向落点） */
function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/admin/projects']}>
        <Routes>
          <Route path="/admin/projects" element={<AdminProjectsPage />} />
          <Route path="/" element={<div>工作台占位</div>} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

/** 受控 toast 断言面（uiSpies 注入 mockReturnValue，断言直接引用） */
function lastToast() {
  return uiSpies.toast;
}

/** 提取 confirm 受控参数并执行其 onConfirm（真实 ConfirmDialog 的按钮点击在 mock 世界等价于此） */
async function runConfirm() {
  expect(uiSpies.confirm).toHaveBeenCalledTimes(1);
  const arg = uiSpies.confirm.mock.calls[0]![0] as { onConfirm: () => Promise<void> };
  await arg.onConfirm();
}

describe('AdminProjectsPage 守卫（批 13b C1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.me = undefined;
    state.mePending = false;
    state.activeProjects = [];
    state.activeTotal = undefined;
    state.archivedProjects = [];
    state.archivedTotal = undefined;
    state.lastActivePages = [];
    state.lastArchivedPages = [];
    mockedUseMe.mockReset();
    mockedUseMe.mockReturnValue({ data: state.me, isPending: state.mePending });
    mockedUseUI.mockReturnValue({ toast: uiSpies.toast, confirm: uiSpies.confirm });
  });

  it('isPending → 不渲染标题且不重定向', () => {
    mockedUseMe.mockReturnValue({ data: undefined, isPending: true } as never);
    renderPage();
    expect(screen.queryByText('项目管理')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin/projects');
  });

  it('非 admin → Navigate 重定向回工作台（权限门遮蔽）', () => {
    mockedUseMe.mockReturnValue({ data: normalUser, isPending: false } as never);
    renderPage();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/');
    expect(screen.getByText('工作台占位')).toBeInTheDocument();
    expect(screen.queryByText('项目管理')).not.toBeInTheDocument();
  });

  it('useMe 失败（me=undefined）→ fail-closed 同样重定向', () => {
    mockedUseMe.mockReturnValue({ data: undefined, isPending: false } as never);
    renderPage();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/');
    expect(screen.queryByText('项目管理')).not.toBeInTheDocument();
  });
});

describe('AdminProjectsPage 列表与双态切换（批 13b C1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseMe.mockReset();
    state.me = admin;
    state.mePending = false;
    state.activeProjects = [];
    state.activeTotal = undefined;
    state.archivedProjects = [];
    state.archivedTotal = undefined;
    state.lastActivePages = [];
    state.lastArchivedPages = [];
    mockedUseUI.mockReturnValue({ toast: uiSpies.toast, confirm: uiSpies.confirm });
  });

  it('admin → 列表渲染（进行中 tab 显示 active 项目 + Pagination 总数）', () => {
    state.activeProjects = [project({}), project({ id: 'p2', name: '备份服务' })];
    renderPage();

    expect(screen.getByText('项目管理')).toBeInTheDocument();
    expect(screen.getByText('默认项目')).toBeInTheDocument();
    expect(screen.getByText('备份服务')).toBeInTheDocument();
    expect(screen.getByText('共 2 条')).toBeInTheDocument();
  });

  it('切「已归档」tab → 归档列表渲染 + 行内已归档徽章；翻页打到归档查询 page=2', async () => {
    state.archivedProjects = [project({ id: 'p-arch', name: '已归档项目', status: 'archived' })];
    state.archivedTotal = 150;
    const events = userEvent.setup();
    renderPage();

    await events.click(screen.getByRole('button', { name: '已归档' }));
    expect(screen.getByText('已归档项目')).toBeInTheDocument();
    // 徽章收进行容器断言：与 tab 按钮文本「已归档」区分
    const row = screen.getByText('已归档项目').closest('li');
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText('已归档')).toBeInTheDocument();
    expect(screen.getByText('共 150 条')).toBeInTheDocument();

    // 翻页打到归档查询（active 查询 page 恒 1）
    const archivedCallsBefore = state.lastArchivedPages.length;
    await events.click(screen.getByRole('button', { name: '下一页' }));
    expect(state.lastArchivedPages).toContain(2);
    expect(state.lastArchivedPages.length).toBe(archivedCallsBefore + 1);
  });

  it('切 tab 重置分页与选择：active 第 2 页有选中 → 切已归档 → 批量操作条消失', async () => {
    state.activeProjects = [project({}), project({ id: 'p2', name: '备份服务' })];
    state.activeTotal = 150;
    const events = userEvent.setup();
    renderPage();

    await events.click(screen.getByRole('button', { name: '下一页' }));
    await events.click(screen.getByRole('checkbox', { name: '选择 默认项目' }));
    expect(screen.getByText('已选 1 个')).toBeInTheDocument();

    await events.click(screen.getByRole('button', { name: '已归档' }));
    expect(screen.queryByText('已选 1 个')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '批量归档' })).not.toBeInTheDocument();
  });
});

describe('AdminProjectsPage 多选与批量操作（批 13b C1）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // once 队列跨用例泄漏防范：clearAllMocks 只清调用记录，mockResolvedValueOnce 队列须 mockReset 清
    batchMutations.archiveAsync.mockReset();
    batchMutations.restoreAsync.mockReset();
    mockedUseMe.mockReset();
    state.me = admin;
    state.me = admin;
    state.mePending = false;
    state.activeProjects = [];
    state.activeTotal = undefined;
    state.archivedProjects = [];
    state.archivedTotal = undefined;
    state.lastActivePages = [];
    state.lastArchivedPages = [];
    mockedUseUI.mockReturnValue({ toast: uiSpies.toast, confirm: uiSpies.confirm });
  });

  it('行 checkbox 勾选/取消 → 批量操作条计数随动；全选本页补齐未勾行', async () => {
    state.activeProjects = [project({}), project({ id: 'p2', name: '备份服务' })];
    const events = userEvent.setup();
    renderPage();

    // 无选中时不渲染批量操作条
    expect(screen.queryByRole('button', { name: '批量归档' })).not.toBeInTheDocument();

    await events.click(screen.getByRole('checkbox', { name: '选择 默认项目' }));
    expect(screen.getByText('已选 1 个')).toBeInTheDocument();
    await events.click(screen.getByRole('checkbox', { name: '选择 备份服务' }));
    expect(screen.getByText('已选 2 个')).toBeInTheDocument();

    // 再点取消
    await events.click(screen.getByRole('checkbox', { name: '选择 备份服务' }));
    expect(screen.getByText('已选 1 个')).toBeInTheDocument();

    // 全选本页（已勾 1 个仍补齐两行）
    await events.click(screen.getByRole('checkbox', { name: '全选本页' }));
    expect(screen.getByText('已选 2 个')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: '选择 默认项目' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '选择 备份服务' })).toBeChecked();
  });

  it('批量归档：勾 2 个 → confirm 文案说明后果 → 确认 → mutateAsync(ids) 调用参数锁', async () => {
    state.activeProjects = [project({}), project({ id: 'p2', name: '备份服务' })];
    batchMutations.archiveAsync.mockResolvedValueOnce({ archived: ['p1', 'p2'], skipped: [] });
    const events = userEvent.setup();
    renderPage();

    await events.click(screen.getByRole('checkbox', { name: '选择 默认项目' }));
    await events.click(screen.getByRole('checkbox', { name: '选择 备份服务' }));
    await events.click(screen.getByRole('button', { name: '批量归档' }));

    // confirm（归档可逆，文案说明后果与恢复路径——对齐 App #48 单项归档先例）
    expect(uiSpies.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '批量归档',
        message: '归档后所选 2 个项目将从工作台默认列表隐藏，可随时恢复。',
        confirmText: '确认归档',
      }),
    );

    await runConfirm();
    // 调用参数锁：mutateAsync 直接收 id 数组，body { ids } 由 mutationFn 内组装
    expect(batchMutations.archiveAsync).toHaveBeenCalledWith(['p1', 'p2']);
    expect(lastToast()).toHaveBeenCalledWith('success', '批量归档完成', '已归档 2 个项目');
  });

  it('批量归档部分 skipped → toast 反馈跳过数（尽力而为语义，不整体报错）', async () => {
    state.activeProjects = [project({}), project({ id: 'p2', name: '备份服务' })];
    batchMutations.archiveAsync.mockResolvedValueOnce({ archived: ['p1'], skipped: ['p2'] });
    const events = userEvent.setup();
    renderPage();

    await events.click(screen.getByRole('checkbox', { name: '选择 默认项目' }));
    await events.click(screen.getByRole('checkbox', { name: '选择 备份服务' }));
    await events.click(screen.getByRole('button', { name: '批量归档' }));
    await runConfirm();

    expect(batchMutations.archiveAsync).toHaveBeenCalledWith(['p1', 'p2']);
    expect(lastToast()).toHaveBeenCalledWith('success', '批量归档完成', '已归档 1 个，跳过 1 个（无权限或状态不符）');
  });

  it('批量恢复（已归档 tab）：勾 1 个 → 直接执行无 confirm（正向幂等操作先例）→ 调用参数锁', async () => {
    state.archivedProjects = [project({ id: 'p-arch', name: '已归档项目', status: 'archived' })];
    batchMutations.restoreAsync.mockResolvedValueOnce({ restored: ['p-arch'], skipped: [] });
    const events = userEvent.setup();
    renderPage();

    await events.click(screen.getByRole('button', { name: '已归档' }));
    await events.click(screen.getByRole('checkbox', { name: '选择 已归档项目' }));
    await events.click(screen.getByRole('button', { name: '批量恢复' }));

    // 恢复 = 正向幂等操作，无 confirm（对齐 App handleRestoreProject 先例）
    expect(uiSpies.confirm).not.toHaveBeenCalled();
    expect(batchMutations.restoreAsync).toHaveBeenCalledWith(['p-arch']);
    expect(lastToast()).toHaveBeenCalledWith('success', '批量恢复完成', '已恢复 1 个项目');
  });

  it('批量恢复部分 skipped → toast 反馈跳过数', async () => {
    state.archivedProjects = [project({ id: 'p-arch', name: '已归档项目', status: 'archived' })];
    batchMutations.restoreAsync.mockResolvedValueOnce({ restored: [], skipped: ['p-arch'] });
    const events = userEvent.setup();
    renderPage();

    await events.click(screen.getByRole('button', { name: '已归档' }));
    await events.click(screen.getByRole('checkbox', { name: '选择 已归档项目' }));
    await events.click(screen.getByRole('button', { name: '批量恢复' }));

    expect(lastToast()).toHaveBeenCalledWith('success', '批量恢复完成', '已恢复 0 个，跳过 1 个（无权限或状态不符）');
  });

  it('批量归档整体失败 → error toast（errMsg 中文兜底）', async () => {
    state.activeProjects = [project({})];
    batchMutations.archiveAsync.mockRejectedValueOnce(new Error('网络错误'));
    const events = userEvent.setup();
    renderPage();

    await events.click(screen.getByRole('checkbox', { name: '选择 默认项目' }));
    await events.click(screen.getByRole('button', { name: '批量归档' }));
    await runConfirm();

    expect(lastToast()).toHaveBeenCalledWith('error', '批量归档失败', '无法归档所选项目');
  });
});
