import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserListItem } from '@remotehub/shared';
import { UIProvider } from './UIComponents';
import UserManagementModal from './UserManagementModal';

// queries 边界 mock（按运行时形状：useUsers → useQuery 结果，mutations → { mutateAsync }）
const { state } = vi.hoisted(() => ({
  state: {
    users: [] as UserListItem[],
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    changePassword: vi.fn(),
  },
}));
vi.mock('../api/queries', () => ({
  useUsers: () => ({
    data: {
      data: state.users,
      pagination: { page: 1, pageSize: 100, total: state.users.length },
    },
  }),
  useCreateUser: () => ({ mutateAsync: state.createUser }),
  useDeleteUser: () => ({ mutateAsync: state.deleteUser }),
  useChangePassword: () => ({ mutateAsync: state.changePassword }),
}));

// mock 按真实运行时形状造（backend listUsers select 输出：lastActiveAt string|null）
const userItem = (over: Partial<UserListItem> = {}): UserListItem => ({
  id: 'u2', username: 'zhangsan', nickname: '张三', role: 'user',
  isActive: true, lastActiveAt: null, createdAt: '2026-01-01T00:00:00Z',
  ...over,
});

const adminUser = userItem({
  id: 'u1', username: 'admin', nickname: '管理员', role: 'admin',
  lastActiveAt: '2026-08-27T10:00:00Z',
});

const renderModal = (props: Partial<Parameters<typeof UserManagementModal>[0]> = {}) =>
  render(
    <UIProvider>
      <UserManagementModal
        isOpen
        onClose={vi.fn()}
        currentUser={adminUser}
        {...props}
      />
    </UIProvider>,
  );

// v1 行为：admin 打开弹窗默认「个人中心」tab，切「人员管理 (Admin)」见列表
const openUsersTab = () => {
  fireEvent.click(screen.getByRole('button', { name: '人员管理 (Admin)' }));
};

describe('UserManagementModal（T7）', () => {
  beforeEach(() => {
    state.users = [];
    state.createUser.mockReset();
    state.deleteUser.mockReset();
    state.changePassword.mockReset();
  });

  it('admin 渲染：双 tab + 个人资料卡（昵称/@用户名/角色徽章）+ 修改密码表单', () => {
    renderModal();

    expect(screen.getByText('账号管理')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '个人中心' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '人员管理 (Admin)' })).toBeInTheDocument();
    // 个人资料（v1：头像首字母/昵称/@username/role 徽章）
    expect(screen.getByText('管理员')).toBeInTheDocument();
    expect(screen.getByText('@admin')).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    // 修改密码表单三输入 + 提交按钮
    expect(screen.getByLabelText('当前密码')).toBeInTheDocument();
    expect(screen.getByLabelText('新密码')).toBeInTheDocument();
    expect(screen.getByLabelText('确认新密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更新密码' })).toBeInTheDocument();
  });

  it('非 admin：仅个人中心 tab，无人员管理入口', () => {
    renderModal({ currentUser: userItem() });

    expect(screen.getByRole('button', { name: '个人中心' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '人员管理 (Admin)' })).not.toBeInTheDocument();
    expect(screen.getByText('个人资料')).toBeInTheDocument();
  });

  it('人员管理 tab：新增员工表单 + 列表渲染（昵称/ID/从未活跃/admin 徽章）+ 自己行无操作按钮', () => {
    state.users = [adminUser, userItem()];
    renderModal();

    openUsersTab();
    expect(screen.getByText('员工账号管理')).toBeInTheDocument();
    expect(screen.getByText('新增员工')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('login_id')).toBeInTheDocument();
    // 列表项：张三（lastActiveAt null → 从未）+ admin 行徽章
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText(/ID: zhangsan/)).toBeInTheDocument();
    expect(screen.getByText(/最后活跃: 从未/)).toBeInTheDocument();
    expect(screen.getByText('ADMIN')).toBeInTheDocument();
    // v1：仅他人行渲染操作按钮（自己行 u.id !== currentUser.id 才显示）
    expect(screen.getByTitle('重置密码')).toBeInTheDocument();
    expect(screen.getByTitle('删除用户')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加' })).toBeInTheDocument();
  });

  it('创建用户：三项提交 → register 契约（role 固定 user）→ toast + 表单清空', async () => {
    state.createUser.mockResolvedValue(undefined);
    state.users = [adminUser];
    renderModal();

    openUsersTab();
    fireEvent.change(screen.getByPlaceholderText('login_id'), { target: { value: 'lisi' } });
    fireEvent.change(screen.getByPlaceholderText('张三'), { target: { value: '李四' } });
    fireEvent.change(screen.getByPlaceholderText('123456'), { target: { value: 'Passw0rd!' } });
    fireEvent.click(screen.getByRole('button', { name: '添加' }));

    await waitFor(() =>
      expect(state.createUser).toHaveBeenCalledWith({
        username: 'lisi', nickname: '李四', password: 'Passw0rd!', role: 'user',
      }));
    expect(await screen.findByText('用户创建成功')).toBeInTheDocument();
    await waitFor(() =>
      expect((screen.getByPlaceholderText('login_id') as HTMLInputElement).value).toBe(''));
  });

  it('删除用户：确认弹窗（v1 文案）→ 确认后调 delete → toast', async () => {
    state.deleteUser.mockResolvedValue(undefined);
    state.users = [adminUser, userItem()];
    renderModal();

    openUsersTab();
    fireEvent.click(screen.getByTitle('删除用户'));
    expect(screen.getByText('确定要删除该用户吗？此操作不可撤销。')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    await waitFor(() => expect(state.deleteUser).toHaveBeenCalledWith('u2'));
    expect(await screen.findByText('用户已删除')).toBeInTheDocument();
  });

  it('重置密码按钮：仅 toast 提示（v1 假动作逐字），不发任何请求', () => {
    state.users = [adminUser, userItem()];
    renderModal();

    openUsersTab();
    fireEvent.click(screen.getByTitle('重置密码'));
    expect(screen.getByText('请通知该员工：密码已重置为 "123456"')).toBeInTheDocument();
    expect(state.createUser).not.toHaveBeenCalled();
    expect(state.deleteUser).not.toHaveBeenCalled();
    expect(state.changePassword).not.toHaveBeenCalled();
  });

  it('改密校验：两次新密码不一致 → toast 错误，不调 API', async () => {
    renderModal();

    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'Old123!' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'New123!' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'Different!' } });
    fireEvent.click(screen.getByRole('button', { name: '更新密码' }));

    expect(await screen.findByText('两次输入的新密码不一致')).toBeInTheDocument();
    expect(state.changePassword).not.toHaveBeenCalled();
  });

  it('改密成功：change-password 契约 + toast + 表单清空', async () => {
    state.changePassword.mockResolvedValue(undefined);
    renderModal();

    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'Old123!' } });
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'New123!' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'New123!' } });
    fireEvent.click(screen.getByRole('button', { name: '更新密码' }));

    await waitFor(() =>
      expect(state.changePassword).toHaveBeenCalledWith({
        oldPassword: 'Old123!', newPassword: 'New123!',
      }));
    expect(await screen.findByText('下次登录请使用新密码')).toBeInTheDocument();
    await waitFor(() =>
      expect((screen.getByLabelText('当前密码') as HTMLInputElement).value).toBe(''));
  });
});
