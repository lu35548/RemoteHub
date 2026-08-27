import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UIProvider } from './components/UIComponents';
import App from './App';

// mock 可变状态（vi.hoisted 供 vi.mock 工厂在提升作用域引用）
const state = vi.hoisted(() => ({
  connections: [] as Array<Record<string, unknown>>,
}));
const connMutations = vi.hoisted(() => ({
  createAsync: vi.fn(),
  updateAsync: vi.fn(),
  deleteAsync: vi.fn(),
}));

// mock 数据层：useMe 返回 admin，列表 hooks 返回扁平分页 body（真实运行时形状，T4 教训）
vi.mock('./api/queries', () => ({
  useMe: vi.fn(() => ({ data: { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' }, isPending: false, isError: false })),
  useProjects: vi.fn(() => ({ data: { success: true as const, data: [], pagination: { page: 1, pageSize: 200, total: 0 } }, isPending: false })),
  useConnections: vi.fn(() => ({ data: { success: true as const, data: state.connections, pagination: { page: 1, pageSize: 20, total: state.connections.length } }, isPending: false })),
  useCreateProject: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useUpdateProject: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useDeleteProject: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useCreateConnection: vi.fn(() => ({ mutateAsync: connMutations.createAsync })),
  useUpdateConnection: vi.fn(() => ({ mutateAsync: connMutations.updateAsync })),
  useDeleteConnection: vi.fn(() => ({ mutateAsync: connMutations.deleteAsync })),
  useLogout: vi.fn(() => ({ mutateAsync: vi.fn(), mutate: vi.fn() })),
  // T6：ConnectionCard 渲染期调用（App 用例不触发解密，给空实现即可）
  useDecryptPassword: vi.fn(() => ({ mutateAsync: vi.fn() })),
  // T7：UserManagementModal 挂载即调用（isOpen false 时组件 hooks 仍执行）
  useUsers: vi.fn(() => ({ data: undefined })),
  useCreateUser: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useDeleteUser: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useChangePassword: vi.fn(() => ({ mutateAsync: vi.fn() })),
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

const renderApp = () =>
  render(
    <UIProvider>
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <App />
        </MemoryRouter>
      </QueryClientProvider>
    </UIProvider>,
  );

describe('App 冒烟（T4）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.connections = [];
  });

  it('渲染主界面壳：侧栏 + 视图切换 + 当前用户', () => {
    renderApp();
    expect(screen.getAllByText('RemoteHub').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /所有资源/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /VPN 网络管理/ })).toBeInTheDocument();
    expect(screen.getByText('管理员')).toBeInTheDocument();
    expect(screen.getByText('暂无资源配置')).toBeInTheDocument();
  });
});

describe('连接卡片区接线（T5）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.connections = [];
  });

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

  it('用户管理：侧栏 footer 头像按钮 → 打开账号管理弹窗', async () => {
    const events = userEvent.setup();
    renderApp();

    await events.click(screen.getByText('管理员'));
    expect(screen.getByText('账号管理')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '个人中心' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '人员管理 (Admin)' })).toBeInTheDocument();
  });
});
