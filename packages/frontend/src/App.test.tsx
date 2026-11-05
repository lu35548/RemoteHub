import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
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
  stats: undefined as { protocols: Record<string, number>; tags: Record<string, number> } | undefined,
  paginationTotal: undefined as number | undefined,
}));
const connMutations = vi.hoisted(() => ({
  createAsync: vi.fn(),
  updateAsync: vi.fn(),
  deleteAsync: vi.fn(),
  cloneAsync: vi.fn(),
}));

// mock 数据层：useMe 返回 admin，列表 hooks 返回扁平分页 body（真实运行时形状，T4 教训）
vi.mock('./api/queries', () => ({
  useMe: vi.fn(() => ({ data: { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' }, isPending: false, isError: false })),
  useProjects: vi.fn(() => ({ data: { success: true as const, data: state.projects, pagination: { page: 1, pageSize: 200, total: state.projects.length } }, isPending: false })),
  // 空 filters = 底表调用（返回独立底表数组）；带 q/tag/sort/projectId = 展示列表调用（过滤后列表）。
  // 两引用分离——若 mock 对两调用返回同一引用，聚合源错误（用了过滤后列表）在测试下不可检出
  useConnections: vi.fn((filters: Record<string, unknown> = {}) => {
    const isBaseTable = !('q' in filters || 'tag' in filters || 'sort' in filters || 'projectId' in filters);
    const data = isBaseTable ? (state.allConnections ?? state.connections) : state.connections;
    return { data: { success: true as const, data, pagination: { page: 1, pageSize: 100, total: state.paginationTotal ?? data.length } }, isPending: false };
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

// 三个 describe 共用的重置逻辑（原各自 beforeEach 完全相同，提升至此）
beforeEach(() => {
  vi.clearAllMocks();
  state.connections = [];
  state.allConnections = undefined;
  state.onlineUsers = [];
  state.projects = [];
  state.stats = undefined;
  state.paginationTotal = undefined;
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

  it('截断态：total 超单页上限 → 「已显示前 N 条，共 M 条」提示', () => {
    state.connections = [hostConn];
    state.paginationTotal = 150;
    renderApp();

    expect(screen.getByText(/已显示前 1 条，共 150 条/)).toBeInTheDocument();
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
