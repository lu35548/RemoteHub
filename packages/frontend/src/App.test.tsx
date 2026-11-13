import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UIProvider } from './components/UIComponents';
import App from './App';
import { useConnections, useConnectionStats } from './api/queries';

// mock 可变状态（vi.hoisted 供 vi.mock 工厂在提升作用域引用）
const state = vi.hoisted(() => ({
  connections: [] as Array<Record<string, unknown>>,
  // 底表（全局无过滤全量）独立引用：mock 区分底表/展示两调用，「chips 聚合源=底表」才可锁（review 修复 2）
  allConnections: undefined as Array<Record<string, unknown>> | undefined,
  onlineUsers: [] as Array<Record<string, unknown>>,
  projects: [] as Array<Record<string, unknown>>,
  // #48 归档列表（useArchivedProjects 消费）+ 受控 total
  archivedProjects: [] as Array<Record<string, unknown>>,
  archivedTotal: undefined as number | undefined,
  stats: undefined as { protocols: Record<string, number>; tags: Record<string, number> } | undefined,
  paginationTotal: undefined as number | undefined,
  // #49 分页参数捕获：展示/底表两侧 page 独立记录（翻页只动展示查询，底表保持 page=1）
  projectsTotal: undefined as number | undefined,
  lastConnectionsDisplayPage: undefined as number | undefined,
  lastConnectionsBasePage: undefined as number | undefined,
  lastProjectsPages: [] as number[],
}));
const connMutations = vi.hoisted(() => ({
  createAsync: vi.fn(),
  updateAsync: vi.fn(),
  deleteAsync: vi.fn(),
  cloneAsync: vi.fn(),
}));
// #48 项目四操作 mutation（归档/恢复/复制/转让）
const projectMutations = vi.hoisted(() => ({
  archiveAsync: vi.fn(),
  restoreAsync: vi.fn(),
  copyAsync: vi.fn(),
  transferAsync: vi.fn(),
}));

// mock 数据层：useMe 返回 admin，列表 hooks 返回扁平分页 body（真实运行时形状，T4 教训）
vi.mock('./api/queries', () => ({
  useMe: vi.fn(() => ({ data: { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' }, isPending: false, isError: false })),
  // #49 捕获 page 实参（底表恒 page=1；展示受控翻页）；pageSize 对齐真实 clamp 100
  useProjects: vi.fn((page: number = 1) => {
    state.lastProjectsPages.push(page);
    return { data: { success: true as const, data: state.projects, pagination: { page, pageSize: 100, total: state.projectsTotal ?? state.projects.length } }, isPending: false };
  }),
  // 空 filters = 底表调用（返回独立底表数组）；带 q/tag/sort/projectId = 展示列表调用（过滤后列表）。
  // 两引用分离——若 mock 对两调用返回同一引用，聚合源错误（用了初始列表）在测试下不可检出
  useConnections: vi.fn((filters: Record<string, unknown> = {}, page: number = 1) => {
    const isBaseTable = !('q' in filters || 'tag' in filters || 'sort' in filters || 'projectId' in filters);
    if (isBaseTable) state.lastConnectionsBasePage = page; else state.lastConnectionsDisplayPage = page;
    const data = isBaseTable ? (state.allConnections ?? state.connections) : state.connections;
    return { data: { success: true as const, data, pagination: { page, pageSize: 100, total: state.paginationTotal ?? data.length } }, isPending: false };
  }),
  // #42 项目连接统计（仅项目视图消费；全局视图 enabled false → data undefined）
  useConnectionStats: vi.fn(() => ({ data: state.stats })),
  useCreateProject: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useUpdateProject: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useDeleteProject: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useCreateConnection: vi.fn(() => ({ mutateAsync: connMutations.createAsync })),
  useUpdateConnection: vi.fn(() => ({ mutateAsync: connMutations.updateAsync })),
  useDeleteConnection: vi.fn(() => ({ mutateAsync: connMutations.deleteAsync })),
  // 票 #43：克隆 mutation（factory 与 queries.ts 导出同步——缺 key 炸 "No export defined on the mock"）
  useCloneConnection: vi.fn(() => ({ mutateAsync: connMutations.cloneAsync })),
  // 票 #48：项目四操作 mutation + 归档列表查询（factory 与 queries.ts 导出同步——缺 key 炸 "No export defined on the mock"）
  // #48 rev 按页切片（页大小 100，对齐真实分页端点）：翻页返回不同页数据，
  // 「翻页翻走后只读态保持」用例依赖第二页不含当前项目（回归 major 修复）
  useArchivedProjects: vi.fn((page: number = 1) => {
    const data = state.archivedProjects.slice((page - 1) * 100, page * 100);
    return { data: { success: true as const, data, pagination: { page, pageSize: 100, total: state.archivedTotal ?? state.archivedProjects.length } }, isPending: false };
  }),
  useArchiveProject: vi.fn(() => ({ mutateAsync: projectMutations.archiveAsync })),
  useRestoreProject: vi.fn(() => ({ mutateAsync: projectMutations.restoreAsync })),
  useCopyProject: vi.fn(() => ({ mutateAsync: projectMutations.copyAsync })),
  useTransferProject: vi.fn(() => ({ mutateAsync: projectMutations.transferAsync })),
  useLogout: vi.fn(() => ({ mutateAsync: vi.fn(), mutate: vi.fn() })),
  // T6：ConnectionCard 渲染期调用（App 用例不触发解密，给空实现即可）
  useDecryptPassword: vi.fn(() => ({ mutateAsync: vi.fn() })),
  // T7：UserManagementModal 挂载即调用（isOpen false 时组件 hooks 仍执行）
  useUsers: vi.fn(() => ({ data: undefined })),
  useCreateUser: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useDeleteUser: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useChangePassword: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useAdminResetLink: vi.fn(() => ({ mutateAsync: vi.fn() })),
  // 票 #31：UserManagementModal 新增 2FA 开关消费
  useUpdateUser: vi.fn(() => ({ mutateAsync: vi.fn() })),
  // 票 #37：通知中心消费（铃铛真实渲染，数据层受控）
  useNotifications: vi.fn(() => ({ data: undefined, isPending: false })),
  useMarkNotificationRead: vi.fn(() => ({ mutate: vi.fn(), isPending: false, variables: undefined })),
  // 批 13a #54：NotificationCenter 新增一键全读消费(factory 随 import 扩展)
  useMarkAllNotificationsRead: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  // 票 #40：ProjectMembersModal 挂载即调用（isOpen false 时组件 hooks 仍执行；pid 空串停查）
  useMembers: vi.fn(() => ({ data: undefined })),
  useAddMember: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useUpdateMemberRole: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useRemoveMember: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useSearchUsers: vi.fn(() => ({ data: undefined })),
  // App.tsx 值导入 NOTIFICATION_QUERY_KEY（WS 派发写缓存键）：factory 缺 key 会炸 "No export defined on the mock"
  NOTIFICATION_QUERY_KEY: ['notifications'],
}));

// T8：App 挂载即启动心跳轮询（真定时器/真请求会污染测试环境），mock 成可变状态
vi.mock('./hooks/useOnlineStatus', () => ({
  useOnlineStatus: vi.fn(() => state.onlineUsers),
}));

// 票 #37：App 挂载即起 WS 连接（jsdom 无可控 WS），mock 成固定已连接态
vi.mock('./hooks/useWs', () => ({
  useWs: vi.fn(() => 'open'),
}));

const user = { id: 'u1', nickname: '管理员' };
// mapToListItem 运行时形状（含 createdAt 与 T5 补的 username/requiredVpnId/hasPassword）
const hostConn = {
  id: 'c1', projectId: 'p1', project: { id: 'p1', name: '默认项目' },
  name: '应用服务器', host: '192.168.1.10', port: 3389, username: 'administrator',
  protocol: 'RDP', vpnType: null, requiredVpnId: 'vpn-1', hasPassword: true,
  tags: '生产环境', lastAccessed: null, createdBy: user, updatedBy: user,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const vpnConn = {
  id: 'vpn-1', projectId: 'p1', project: { id: 'p1', name: '默认项目' },
  name: '总部 VPN', host: 'vpn.example.com', port: null, username: null,
  protocol: 'VPN', vpnType: 'SSL_VPN', requiredVpnId: null, hasPassword: false,
  tags: null, lastAccessed: null, createdBy: user, updatedBy: user,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};

const renderApp = (initialEntry = '/') =>
  render(
    <UIProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    </UIProvider>,
  );

// 三个 describe 共用的重置逻辑（原各自 beforeEach 用例内重置，提升至此）
beforeEach(() => {
  vi.clearAllMocks();
  state.connections = [];
  state.allConnections = undefined;
  state.onlineUsers = [];
  state.projects = [];
  state.archivedProjects = [];
  state.archivedTotal = undefined;
  state.stats = undefined;
  state.paginationTotal = undefined;
  state.projectsTotal = undefined;
  state.lastConnectionsDisplayPage = undefined;
  state.lastConnectionsBasePage = undefined;
  state.lastProjectsPages = [];
});

describe('App 冒烟（T4）', () => {
  it('渲染主界面壳：侧栏 + 视图切换 + 当前用户', () => {
    renderApp();
    expect(screen.getAllByText('RemoteHub').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /所有资源/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /VPN 网络管理/ })).toBeInTheDocument();
    expect(screen.getByText('管理员')).toBeInTheDocument();
    expect(screen.getByText('暂无资源配置')).toBeInTheDocument();
    // 票 #37：顶栏通知铃铛在已认证布局挂载
    expect(screen.getByRole('button', { name: '通知' })).toBeInTheDocument();
  });
});

describe('连接卡片区接线（T5）', () => {
  it('全局 all 视图渲染 host 卡（v1 行为：VPN 归 vpn 视图/项目视图），host 卡带 Via 依赖行', () => {
    state.connections = [hostConn, vpnConn];
    renderApp();

    expect(screen.getByText('应用服务器')).toBeInTheDocument();
    expect(screen.getByText(/Via: 总部 VPN/)).toBeInTheDocument();
    expect(screen.queryByText('总部 VPN')).not.toBeInTheDocument(); // all 视图不含 VPN 卡
    expect(screen.queryByText('暂无资源配置')).not.toBeInTheDocument();
  });

  it('VPN 视图只显示 VPN 节点（v1 过滤行为）', async () => {
    state.connections = [hostConn, vpnConn];
    const events = userEvent.setup();
    renderApp();

    await events.click(screen.getByRole('button', { name: /VPN 网络管理/ }));

    expect(screen.getByText('总部 VPN')).toBeInTheDocument();
    expect(screen.queryByText('应用服务器')).not.toBeInTheDocument();
  });

  it('新建资源按钮 → 打开 ConnectionModal', async () => {
    const events = userEvent.setup();
    renderApp();

    await events.click(screen.getByRole('button', { name: /新建资源/ }));

    expect(screen.getByText('新建连接')).toBeInTheDocument();
  });

  it('删除连接：菜单 → 确认弹窗（v1 文案）→ 确认后调 delete', async () => {
    state.connections = [hostConn];
    const events = userEvent.setup();
    renderApp();

    await events.click(screen.getByRole('button', { name: '更多操作' }));
    await events.click(screen.getByText('删除'));
    expect(screen.getByText('确定要删除此连接资源吗？此操作不可恢复。')).toBeInTheDocument();

    await events.click(screen.getByRole('button', { name: '删除' }));
    await waitFor(() => expect(connMutations.deleteAsync).toHaveBeenCalledWith('c1'));
  });

  it('克隆连接（#43）：菜单 → 克隆连接 → mutateAsync(id) → 编辑弹窗载入克隆件 detail', async () => {
    state.connections = [hostConn];
    state.allConnections = [hostConn];
    const clonedDetail = {
      id: 'c-clone', projectId: 'p1', name: '应用服务器 (副本)', host: '192.168.1.10',
      port: 3389, username: 'administrator', protocol: 'RDP', vpnType: null, vpnLoginUrl: null,
      requiredVpnId: null, notes: null, tags: '生产环境', lastAccessed: null,
      createdBy: user, updatedBy: user,
      createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', clonedFrom: 'c1',
    };
    connMutations.cloneAsync.mockResolvedValueOnce(clonedDetail);
    const events = userEvent.setup();
    renderApp();

    await events.click(screen.getByRole('button', { name: '更多操作' }));
    await events.click(screen.getByText('克隆连接'));

    expect(connMutations.cloneAsync).toHaveBeenCalledWith('c1');
    // 成功后跳编辑弹窗载入新连接（票面「成功后跳编辑弹窗」）：编辑态标题 + 名称回填克隆件名
    expect(await screen.findByText('编辑连接')).toBeInTheDocument();
    expect(screen.getByDisplayValue('应用服务器 (副本)')).toBeInTheDocument();
    // 成功 toast 锁密文复制语义（rev-43-spec nit：「密码已随连接复制」= 密文服务端复制不过前端）
    expect(await screen.findByText('已创建 "应用服务器 (副本)"，密码已随连接复制')).toBeInTheDocument();
  });

  it('用户管理：侧栏 footer 头像按钮 → 打开账号管理弹窗', async () => {
    const events = userEvent.setup();
    renderApp();

    await events.click(screen.getByText('管理员'));
    expect(screen.getByText('账号管理')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '个人中心' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '人员管理 (Admin)' })).toBeInTheDocument();
  });
});

describe('在线状态显示（T8）', () => {
  it('在线用户头像堆叠 + 计数徽章（v1 形态：首字母/title/(在线)/N 人在线）', () => {
    state.onlineUsers = [
      { id: 'u1', nickname: '管理员' },
      { id: 'u2', nickname: '张三' },
    ];
    renderApp();

    expect(screen.getByTitle('管理员 (在线)')).toBeInTheDocument();
    expect(screen.getByTitle('张三 (在线)')).toBeInTheDocument();
    expect(screen.getByText('张')).toBeInTheDocument(); // 头像首字母（「管」与 Sidebar footer 头像重复，不单独断言）
    // 「{n} 人在线」横跨 span + 文本节点，按徽章容器整体 textContent 匹配
    expect(screen.getByText((_, el) => el?.classList.contains('rounded-full') === true && el.textContent === '2 人在线')).toBeInTheDocument();
  });
});

// ── #42 工作台过滤栏 + URL 联动 ──
// URL（q/tag/sort）是唯一真相源：进入还原 + 交互写入 + 防抖提交均以 mock 的
// useConnections 调用参数为断言面（服务端过滤委托证明，客户端不再自行过滤）
describe('工作台过滤栏与 URL 联动（#42）', () => {
  const useConnectionsMock = useConnections as ReturnType<typeof vi.fn>;
  const useConnectionStatsMock = useConnectionStats as ReturnType<typeof vi.fn>;

  /** 展示列表调用 = filters 对象携带 q/tag/sort/projectId 任一键（底表调用是空对象 {}） */
  const displayFilterCalls = () =>
    useConnectionsMock.mock.calls
      .map((c) => c[0] as Record<string, unknown> | undefined)
      .filter((f) => !!f && ('q' in f || 'tag' in f || 'sort' in f || 'projectId' in f));
  const lastDisplayFilters = () => displayFilterCalls()[displayFilterCalls().length - 1];

  it('URL 携带 q/tag/sort 进入（刷新态还原）：filters 透传服务端 + 搜索框回显 + chip/排序态还原', () => {
    state.connections = [hostConn];
    renderApp('/?q=web&tag=生产环境&sort=lastAccessed');

    expect(displayFilterCalls()[0]).toMatchObject({ tag: '生产环境', q: 'web', sort: 'lastAccessed' });
    // 「搜索」会同时命中 Sidebar 项目搜索框（「搜索客户...」），收窄到连接搜索框专属前缀
    expect(screen.getByPlaceholderText(/搜索名称/)).toHaveValue('web');
    expect(screen.getByRole('button', { name: /#生产环境/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '最近访问' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('全局视图 chips 从底表聚合；点击 chip → 服务端调用携带 tag，再点取消（单选切换）', async () => {
    state.connections = [hostConn, vpnConn];
    const events = userEvent.setup();
    renderApp();

    await events.click(screen.getByRole('button', { name: /#生产环境/ }));
    expect(lastDisplayFilters()).toMatchObject({ tag: '生产环境' });

    await events.click(screen.getByRole('button', { name: /#生产环境/ }));
    expect(lastDisplayFilters()?.tag).toBeUndefined();
  });

  it('排序切换：最近访问 → sort=lastAccessed；切回最近更新 → 移除', async () => {
    state.connections = [hostConn];
    const events = userEvent.setup();
    renderApp();

    await events.click(screen.getByRole('button', { name: '最近访问' }));
    expect(lastDisplayFilters()).toMatchObject({ sort: 'lastAccessed' });

    await events.click(screen.getByRole('button', { name: '最近更新' }));
    expect(lastDisplayFilters()?.sort).toBeUndefined();
  });

  it('搜索框 400ms 防抖：输入不即时提交，静默后 q 进服务端调用', async () => {
    state.connections = [hostConn];
    const events = userEvent.setup();
    renderApp();

    await events.type(screen.getByPlaceholderText(/搜索名称/), 'web');

    // 防抖窗口内不提交（type 返回后同步断言，q 仍是 undefined）
    expect(lastDisplayFilters()?.q).toBeUndefined();

    await waitFor(() => {
      expect(lastDisplayFilters()?.q).toBe('web');
    }, { timeout: 3000 });
  });

  it('项目视图：display 调用叠加 projectId + 统计块消费 stats 端点；全局视图统计隐藏', async () => {
    state.connections = [hostConn];
    state.projects = [{ id: 'p1', name: '默认项目' }];
    state.stats = { protocols: { RDP: 3, SSH: 1 }, tags: { 生产环境: 2 } };
    const events = userEvent.setup();
    renderApp();

    expect(screen.queryByLabelText('协议分布')).not.toBeInTheDocument();

    // 项目按钮 accessible name 以项目名开头（内嵌「项目操作 …」省略号按钮另算），锚定前缀避免双命中
    await events.click(screen.getByRole('button', { name: /^默认项目/ }));
    expect(lastDisplayFilters()).toMatchObject({ projectId: 'p1' });
    expect(useConnectionStatsMock).toHaveBeenCalledWith('p1');
    // 断言收进「协议分布」容器：RDP 徽章渲染中文「桌面远程」，与 RDP 卡片文案同词会双命中
    expect(within(screen.getByLabelText('协议分布')).getByText('桌面远程')).toBeInTheDocument();
  });

  it('#49 分页 footer 取代截断横幅：total 150 → 「共 150 条」翻页可见全量（横幅删除）', () => {
    state.connections = [hostConn];
    state.paginationTotal = 150;
    renderApp();

    expect(screen.getByText('共 150 条')).toBeInTheDocument();
    expect(screen.queryByText(/已显示前/)).not.toBeInTheDocument();
  });

  it('过滤空态：URL q 生效 + 结果为空 → 「未找到匹配的资源」（区别于无资源空态）', () => {
    state.connections = [];
    renderApp('/?q=web');

    expect(screen.getByText('未找到匹配的资源')).toBeInTheDocument();
  });

  it('全局 chips 聚合源 = 底表：展示列表被 q 过滤收缩后，候选集仍含底表全部 tag（review 修复 2）', () => {
    // 展示列表（q=web 过滤后）只剩 hostConn；底表另含带「备份」tag 的 VPN 项
    state.connections = [hostConn];
    state.allConnections = [hostConn, { ...vpnConn, tags: '备份' }];
    renderApp('/?q=web');

    // 候选集来自底表：「生产环境」（hostConn）与「备份」（仅底表有）都在
    expect(screen.getByRole('button', { name: /#生产环境/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /#备份/ })).toBeInTheDocument();
  });
});

describe('#49 分页（连接列表 + Sidebar 项目列表）', () => {
  const projectItem = {
    id: 'p1', name: '默认项目', icon: 'server',
    createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' },
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };

  it('连接 total 105 → footer「共 105 条」；点下一页 → 展示查询 page=2、底表保持 page=1', () => {
    state.connections = [hostConn];
    state.paginationTotal = 105;
    renderApp();
    expect(screen.getByText('共 105 条')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(state.lastConnectionsDisplayPage).toBe(2);
    expect(state.lastConnectionsBasePage).toBe(1);
  });

  it('切项目重置连接分页回第 1 页（页码属于特定过滤结果集）', () => {
    state.connections = [hostConn];
    state.paginationTotal = 105;
    state.projects = [projectItem];
    state.projectsTotal = 0; // Sidebar 分页 footer 不渲染，避免双「下一页」按钮歧义
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(state.lastConnectionsDisplayPage).toBe(2);
    fireEvent.click(screen.getByText('默认项目'));
    expect(state.lastConnectionsDisplayPage).toBe(1);
  });

  it('Sidebar 项目分页：projectsTotal 205 → footer「共 205 条」；下一页 → useProjects 含 page=2 调用', () => {
    state.projects = [projectItem];
    state.projectsTotal = 205;
    renderApp();
    expect(screen.getByText('共 205 条')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(state.lastProjectsPages).toContain(2);
  });
});

describe('#49 rev 修复（M2 越界恢复 + 顺手③ tag 重置 + 汉堡 a11y）', () => {
  const projectItem = {
    id: 'p1', name: '默认项目', icon: 'server',
    createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' },
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };

  it('M2：删末页末条 total 跨页界回退 → 页码钳回有效页', () => {
    state.connections = [hostConn];
    state.paginationTotal = 105;
    const view = renderApp();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(screen.getByText('第 2 / 2 页')).toBeInTheDocument();
    // 模拟删末页末条：total 105→100，重渲染让新 total 到达
    state.paginationTotal = 100;
    view.rerender(
      <UIProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter initialEntries={['/']}>
            <App />
          </MemoryRouter>
        </QueryClientProvider>
      </UIProvider>,
    );
    expect(screen.getByText('第 1 / 1 页')).toBeInTheDocument();
  });

  it('顺手③：tag chip 点击重置连接分页回第 1 页', () => {
    state.connections = [hostConn];
    state.paginationTotal = 200;
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(state.lastConnectionsDisplayPage).toBe(2);
    fireEvent.click(screen.getByRole('button', { name: /#生产环境/ }));
    expect(state.lastConnectionsDisplayPage).toBe(1);
  });

  it('汉堡按钮 aria-controls 配对抽屉 id（M3）', () => {
    state.projects = [projectItem];
    renderApp();
    expect(screen.getByRole('button', { name: '打开导航菜单' })).toHaveAttribute('aria-controls', 'mobile-sidebar');
  });
});

// ── #48 项目管理增强:四操作接线 + 归档视图切换 + 只读失效态 ──
describe('#48 项目管理增强(归档/复制/转让/归档视图)', () => {
  const ownerProject = {
    id: 'p1', name: '默认项目', icon: 'server', currentUserRole: 'owner',
    createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' },
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };
  const archivedProject = {
    id: 'p-arch', name: '已归档项目', icon: 'cloud', status: 'archived', currentUserRole: 'owner',
    createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' },
    createdAt: '2026-01-01', updatedAt: '2026-01-01',
  };

  it('归档菜单 → confirm 确认 → archiveAsync(id) → 成功 toast', async () => {
    state.projects = [ownerProject];
    projectMutations.archiveAsync.mockResolvedValueOnce({ id: 'p1', name: '默认项目', status: 'archived' });
    const events = userEvent.setup();
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: '项目操作 默认项目' }));
    await events.click(screen.getByText('归档项目'));
    // confirm 弹窗(归档可逆,info 变体文案说明后果与恢复路径)
    expect(screen.getByText('归档后「默认项目」将从工作台默认列表隐藏，可随时在侧栏「已归档」区恢复。')).toBeInTheDocument();
    await events.click(screen.getByRole('button', { name: '确认归档' }));
    await waitFor(() => expect(projectMutations.archiveAsync).toHaveBeenCalledWith('p1'));
    expect(await screen.findByText('项目已归档')).toBeInTheDocument();
  });

  it('复制菜单 → copyAsync(id) → toast 消费响应真形状 connectionCount(含 N 个连接)', async () => {
    state.projects = [ownerProject];
    projectMutations.copyAsync.mockResolvedValueOnce({
      id: 'p-copy', name: '默认项目 (副本)', status: 'active', clonedFrom: 'p1', connectionCount: 3,
      createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' },
      createdAt: '2026-01-01', updatedAt: '2026-01-01',
    });
    const events = userEvent.setup();
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: '项目操作 默认项目' }));
    await events.click(screen.getByText('复制项目'));
    // 锁真形状:connectionCount 字段名来自 projectService.copyProject 响应(非票面猜测)
    expect(await screen.findByText('已创建 "默认项目 (副本)"，含 3 个连接')).toBeInTheDocument();
    expect(projectMutations.copyAsync).toHaveBeenCalledWith('p1');
  });

  it('转让入口(owner) → 打开转让弹窗', async () => {
    state.projects = [ownerProject];
    const events = userEvent.setup();
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: '项目操作 默认项目' }));
    await events.click(screen.getByText('转让所有权'));
    expect(await screen.findByText('转让所有权')).toBeInTheDocument();
  });

  it('归档视图切换:归档区展开 → 点归档项目进入只读态(提示条 + 新建资源禁用 + 卡片菜单遮蔽)→ 恢复回正常', async () => {
    state.archivedProjects = [archivedProject];
    state.connections = [hostConn];
    const events = userEvent.setup();
    renderApp();

    // 归档区默认收起;展开后归档项目名可见
    const toggle = screen.getByRole('button', { name: /已归档/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await events.click(toggle);
    await events.click(screen.getByText('已归档项目'));

    // 只读失效态三件套:提示条 + 新建资源禁用 + ConnectionCard 写操作菜单遮蔽
    expect(screen.getByText(/本项目已归档/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新建资源/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '更多操作' })).not.toBeInTheDocument();

    // 提示条内恢复入口 → restoreAsync(恢复后 invalidate,activeArchived 消失,只读态解除——
    // mock 恒返回归档列表故 UI 层不断言提示条消失,数据回路由 queries 层缓存失效语义保证)
    await events.click(screen.getByRole('button', { name: '恢复项目' }));
    await waitFor(() => expect(projectMutations.restoreAsync).toHaveBeenCalledWith('p-arch'));
  });

  it('复制重名 409(PROJ_001) → 错误 toast 透出后端中文消息(errMsg 链路)', async () => {
    state.projects = [ownerProject];
    // ApiErrorResponse 形状(PROJ_001 重名竞态 P2002 → 409),errMsg 取 error.message——对齐 ProjectTransferModal VAL_001 用例写法
    projectMutations.copyAsync.mockRejectedValueOnce({ error: { message: '项目名称已存在' } });
    const events = userEvent.setup();
    renderApp();

    fireEvent.click(screen.getByRole('button', { name: '项目操作 默认项目' }));
    await events.click(screen.getByText('复制项目'));
    expect(await screen.findByText('复制失败')).toBeInTheDocument();
    expect(await screen.findByText('项目名称已存在')).toBeInTheDocument();
  });

  it('归档区翻页后只读态保持:第二页不含当前项目,提示条仍在 + 新建仍禁用(只读事实与归档列表当前页解耦)', async () => {
    // 150 条归档:p-arch 居第 1 页首位,第 2 页(后 50 条)不含它——翻页翻走后只读态不得静默解除
    const manyArchived = [
      archivedProject,
      ...Array.from({ length: 149 }, (_, i) => ({
        id: `p-arch-${i + 1}`, name: `归档项目 ${i + 1}`, icon: 'cloud', status: 'archived', currentUserRole: 'viewer',
        createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' },
        createdAt: '2026-01-01', updatedAt: '2026-01-01',
      })),
    ];
    state.archivedProjects = manyArchived;
    const events = userEvent.setup();
    renderApp();

    await events.click(screen.getByRole('button', { name: /已归档/ }));
    // 跨页 → Pagination 渲染(共 150 条);进入归档项目只读态
    expect(screen.getByText('共 150 条')).toBeInTheDocument();
    await events.click(screen.getByText('已归档项目'));
    expect(screen.getByText(/本项目已归档/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新建资源/ })).toBeDisabled();

    // 翻到第 2 页(mock 按页 slice,第二页不含 p-arch)——只读态必须保持(修复前此处红:提示条消失/新建恢复)
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(await screen.findByText('归档项目 149')).toBeInTheDocument();
    expect(screen.getByText(/本项目已归档/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /新建资源/ })).toBeDisabled();
  });

  it('归档区恢复入口:owner 归档项「恢复 X」→ restoreAsync(id) → 成功 toast', async () => {
    state.archivedProjects = [archivedProject];
    projectMutations.restoreAsync.mockResolvedValueOnce({ id: 'p-arch', name: '已归档项目', status: 'active' });
    const events = userEvent.setup();
    renderApp();

    await events.click(screen.getByRole('button', { name: /已归档/ }));
    // 恢复按钮 opacity-0 hover 才显示 → fireEvent 直点(#40 菜单按钮同坑先例)
    fireEvent.click(screen.getByRole('button', { name: '恢复 已归档项目' }));
    await waitFor(() => expect(projectMutations.restoreAsync).toHaveBeenCalledWith('p-arch'));
    expect(await screen.findByText('项目已恢复')).toBeInTheDocument();
  });
});
