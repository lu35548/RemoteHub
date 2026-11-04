import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberListItem, ProjectListItem, UserPublic, UserSearchResult } from '@remotehub/shared';
import { UIProvider } from './UIComponents';
import ProjectMembersModal from './ProjectMembersModal';

// queries 边界 mock（形状对齐运行时：useQuery → { data, isPending, isError, error }，mutations → { mutateAsync, isPending }）
const { state } = vi.hoisted(() => ({
  state: {
    members: [] as MemberListItem[],
    membersPending: false,
    membersError: null as unknown,
    searchResults: [] as UserSearchResult[],
    addMember: vi.fn(),
    updateRole: vi.fn(),
    removeMember: vi.fn(),
  },
}));
vi.mock('../api/queries', () => ({
  useMembers: () => ({
    data: {
      data: state.members,
      pagination: { page: 1, pageSize: 20, total: state.members.length },
    },
    isPending: state.membersPending,
    isError: !!state.membersError,
    error: state.membersError,
  }),
  useAddMember: () => ({ mutateAsync: state.addMember, isPending: false }),
  useUpdateMemberRole: () => ({ mutateAsync: state.updateRole, isPending: false }),
  useRemoveMember: () => ({ mutateAsync: state.removeMember, isPending: false }),
  useSearchUsers: () => ({ data: state.searchResults }),
}));

// mock 按真实运行时形状造（memberService listMembers select 输出：username/nickname 平铺）
const memberItem = (over: Partial<MemberListItem> = {}): MemberListItem => ({
  id: 'm2', userId: 'u2', role: 'viewer', addedAt: '2026-10-01T00:00:00Z',
  username: 'zhangsan', nickname: '张三', ...over,
});

const me: UserPublic = {
  id: 'u1', username: 'owner1', nickname: '项目所有者', role: 'user',
  isActive: true, lastActiveAt: null, createdAt: '2026-01-01',
};

const project: ProjectListItem = {
  id: 'p1', name: '演示项目', icon: 'server', currentUserRole: 'owner',
  createdBy: { id: 'u1', nickname: '项目所有者' }, updatedBy: { id: 'u1', nickname: '项目所有者' },
  createdAt: '2026-01-01', updatedAt: '2026-01-01',
};

// 基准成员集：我是 owner + 张三 viewer + 李四 editor
const baseMembers = () => [
  memberItem({ id: 'm1', userId: 'u1', role: 'owner', username: 'owner1', nickname: '项目所有者' }),
  memberItem(),
  memberItem({ id: 'm3', userId: 'u3', role: 'editor', username: 'lisi', nickname: '李四' }),
];

const renderModal = (props: Partial<Parameters<typeof ProjectMembersModal>[0]> = {}) =>
  render(
    <UIProvider>
      <ProjectMembersModal
        isOpen
        onClose={vi.fn()}
        project={project}
        currentUser={me}
        {...props}
      />
    </UIProvider>,
  );

describe('ProjectMembersModal（#40 members 管理 UI）', () => {
  beforeEach(() => {
    state.members = baseMembers();
    state.membersPending = false;
    state.membersError = null;
    state.searchResults = [];
    state.addMember.mockReset();
    state.updateRole.mockReset();
    state.removeMember.mockReset();
    state.addMember.mockResolvedValue({ id: 'm9' });
    state.updateRole.mockResolvedValue({});
    state.removeMember.mockResolvedValue({ id: 'mx' });
  });

  it('成员列表渲染：项目名标题 + 成员行（昵称/@用户名/角色徽章中文）+ 自己标记 + 总数', () => {
    renderModal();
    expect(screen.getByText('成员管理')).toBeInTheDocument();
    expect(screen.getByText('演示项目')).toBeInTheDocument();
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('@zhangsan')).toBeInTheDocument();
    // 角色徽章文本与 select option 文本重名，用 getAllByText 断言至少一枚徽章
    expect(screen.getAllByText('所有者').length).toBeGreaterThan(0);
    expect(screen.getAllByText('编辑者').length).toBeGreaterThan(0);
    expect(screen.getAllByText('查看者').length).toBeGreaterThan(0);
    // 自己行有「我」标记
    expect(screen.getByText('(我)')).toBeInTheDocument();
    // 头部总数徽标
    expect(screen.getByText('共 3 人')).toBeInTheDocument();
  });

  it('owner 管理面：添加成员表单可见，他人行有角色下拉与移除按钮', () => {
    renderModal();
    expect(screen.getByPlaceholderText('搜索用户名或昵称...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '添加成员' })).toBeInTheDocument();
    // 他人行（张三）角色下拉 + 移除按钮（title 定位 icon 按钮）
    expect(screen.getByLabelText('角色-张三')).toBeInTheDocument();
    expect(screen.getByTitle('移除成员 张三')).toBeInTheDocument();
    expect(screen.getByTitle('移除成员 李四')).toBeInTheDocument();
  });

  it('viewer 权限遮蔽：无添加表单，他人行只读（无下拉无移除），自己行有「离开项目」', () => {
    renderModal({
      project: { ...project, currentUserRole: 'viewer' },
      currentUser: { ...me, id: 'u2' },
    });
    expect(screen.queryByPlaceholderText('搜索用户名或昵称...')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '添加成员' })).not.toBeInTheDocument();
    // 他人行只读徽章，无任何操作控件
    expect(screen.queryByLabelText('角色-项目所有者')).not.toBeInTheDocument();
    expect(screen.queryByTitle(/移除成员/)).not.toBeInTheDocument();
    // 自己（viewer）行可离开
    expect(screen.getByTitle('离开项目')).toBeInTheDocument();
  });

  it('唯一 owner 自己行无「离开项目」入口（last-owner 遮蔽，后端 MEMBER_002 必拒）', () => {
    state.members = [
      memberItem({ id: 'm1', userId: 'u1', role: 'owner', username: 'owner1', nickname: '项目所有者' }),
      memberItem(),
    ];
    renderModal();
    expect(screen.queryByTitle('离开项目')).not.toBeInTheDocument();
    // 他人行移除不受影响
    expect(screen.getByTitle('移除成员 张三')).toBeInTheDocument();
  });

  it('admin 直通：currentUserRole 为 null 的项目，admin 仍见管理面', () => {
    renderModal({
      project: { ...project, currentUserRole: undefined },
      currentUser: { ...me, id: 'u9', role: 'admin', nickname: '管理员' },
    });
    expect(screen.getByPlaceholderText('搜索用户名或昵称...')).toBeInTheDocument();
    expect(screen.getByTitle('移除成员 张三')).toBeInTheDocument();
    // admin 非成员无自己行 → 无离开入口
    expect(screen.queryByTitle('离开项目')).not.toBeInTheDocument();
  });

  it('添加成员：搜索选人 + 角色选择 → addMember 契约 → 成功 toast + 表单复位', async () => {
    state.searchResults = [
      { id: 'u5', username: 'wangwu', nickname: '王五' },
      { id: 'u2', username: 'zhangsan', nickname: '张三' }, // 已是成员，应标注禁选
    ];
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('搜索用户名或昵称...'), { target: { value: '王' } });
    // 搜索结果：王五可选，张三已是成员禁用
    fireEvent.click(await screen.findByText('王五'));
    fireEvent.change(screen.getByLabelText('新成员角色'), { target: { value: 'editor' } });
    fireEvent.click(screen.getByRole('button', { name: '添加成员' }));
    await waitFor(() =>
      expect(state.addMember).toHaveBeenCalledWith({
        projectId: 'p1',
        data: { userId: 'u5', role: 'editor' },
      }),
    );
    expect(await screen.findByText('成员已添加')).toBeInTheDocument();
    // 表单复位：搜索框清空、已选 chip 消失
    await waitFor(() => expect(screen.getByPlaceholderText('搜索用户名或昵称...')).toHaveValue(''));
    expect(screen.queryByText('王五 ×')).not.toBeInTheDocument();
  });

  it('添加失败（已是成员 MEMBER_001）→ 错误 toast 显示后端中文消息', async () => {
    state.searchResults = [{ id: 'u5', username: 'wangwu', nickname: '王五' }];
    state.addMember.mockRejectedValue({ error: { message: '该用户已是项目成员' } });
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('搜索用户名或昵称...'), { target: { value: '王' } });
    fireEvent.click(await screen.findByText('王五'));
    fireEvent.click(screen.getByRole('button', { name: '添加成员' }));
    expect(await screen.findByText('添加失败')).toBeInTheDocument();
    expect(screen.getByText('该用户已是项目成员')).toBeInTheDocument();
  });

  it('改角色：他人行下拉切换 → updateMemberRole 契约 → 成功 toast', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('角色-张三'), { target: { value: 'editor' } });
    await waitFor(() =>
      expect(state.updateRole).toHaveBeenCalledWith({
        projectId: 'p1',
        uid: 'u2',
        data: { role: 'editor' },
      }),
    );
    expect(await screen.findByText('角色已更新')).toBeInTheDocument();
  });

  it('移除他人：危险确认 → 确认后 removeMember 契约 → 成功 toast', async () => {
    renderModal();
    fireEvent.click(screen.getByTitle('移除成员 张三'));
    // confirm 弹窗（危险文案）
    expect(screen.getByText('移除成员')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认移除' }));
    await waitFor(() =>
      expect(state.removeMember).toHaveBeenCalledWith({ projectId: 'p1', uid: 'u2' }),
    );
    expect(await screen.findByText('成员已移除')).toBeInTheDocument();
  });

  it('离开项目：确认 → removeMember 指向自己 + onLeft 回调（App 侧重置视图/失效缓存）', async () => {
    const onLeft = vi.fn();
    renderModal({
      project: { ...project, currentUserRole: 'editor' },
      currentUser: { ...me, id: 'u3' },
      onLeft,
    });
    fireEvent.click(screen.getByTitle('离开项目'));
    expect(screen.getByText('离开项目')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认离开' }));
    await waitFor(() =>
      expect(state.removeMember).toHaveBeenCalledWith({ projectId: 'p1', uid: 'u3' }),
    );
    expect(await screen.findByText('已离开项目')).toBeInTheDocument();
    await waitFor(() => expect(onLeft).toHaveBeenCalledWith('p1'), { timeout: 1500 });
  });

  it('自己行不提供改角色下拉（自改角色非管理场景，UI 收紧防误操作）', () => {
    renderModal();
    // 自己（owner1）行无下拉；张三/李四行有
    expect(screen.queryByLabelText('角色-项目所有者')).not.toBeInTheDocument();
    expect(screen.getByLabelText('角色-张三')).toBeInTheDocument();
  });

  it('加载失败：渲染错误提示（透传后端中文消息）而非「暂无成员」空态', () => {
    state.members = [];
    state.membersError = { error: { message: '无权查看成员列表' } };
    renderModal();
    expect(screen.getByText('无权查看成员列表')).toBeInTheDocument();
    expect(screen.queryByText('暂无成员')).not.toBeInTheDocument();
  });

  it('首次加载中（isPending 且无缓存数据）：不渲染「暂无成员」空态（防冷缓存闪空态）', () => {
    state.members = [];
    state.membersPending = true;
    renderModal();
    expect(screen.queryByText('暂无成员')).not.toBeInTheDocument();
  });
});
