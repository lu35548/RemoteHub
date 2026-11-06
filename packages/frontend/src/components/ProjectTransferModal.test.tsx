import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MemberListItem, ProjectListItem, UserPublic } from '@remotehub/shared';
import { UIProvider } from './UIComponents';
import ProjectTransferModal from './ProjectTransferModal';

// queries 边界 mock（形状对齐运行时：useQuery → { data, isPending, isError, error }，mutation → { mutateAsync, isPending }）
const { state } = vi.hoisted(() => ({
  state: {
    members: [] as MemberListItem[],
    membersPending: false,
    membersError: null as unknown,
    transfer: vi.fn(),
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
  useTransferProject: () => ({ mutateAsync: state.transfer, isPending: false }),
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

const renderModal = (props: Partial<Parameters<typeof ProjectTransferModal>[0]> = {}) =>
  render(
    <UIProvider>
      <ProjectTransferModal
        isOpen
        onClose={vi.fn()}
        project={project}
        currentUser={me}
        {...props}
      />
    </UIProvider>,
  );

describe('ProjectTransferModal（#48 转让所有权）', () => {
  beforeEach(() => {
    state.members = baseMembers();
    state.membersPending = false;
    state.membersError = null;
    state.transfer.mockReset();
    state.transfer.mockResolvedValue({ projectId: 'p1', fromUserId: 'u1', toUserId: 'u2' });
  });

  it('候选列表只含非 owner 成员（owner 不可转让给自己——后端 VAL_001 兜底，前端入口即遮蔽）', () => {
    renderModal();
    expect(screen.getByText('转让所有权')).toBeInTheDocument();
    expect(screen.getByText('演示项目')).toBeInTheDocument();
    expect(screen.getByText('张三')).toBeInTheDocument();
    expect(screen.getByText('李四')).toBeInTheDocument();
    // owner 自己不在候选（值来源是 useMembers 的 role 过滤，非展示隐藏）
    expect(screen.queryByText('项目所有者')).not.toBeInTheDocument();
  });

  it('未选中候选 → 确认按钮禁用；选中 → 可用且携带成员', async () => {
    renderModal();
    const confirmBtn = screen.getByRole('button', { name: '确认转让' });
    expect(confirmBtn).toBeDisabled();

    fireEvent.click(screen.getByText('张三'));
    expect(confirmBtn).toBeEnabled();

    fireEvent.click(confirmBtn);
    await waitFor(() => expect(state.transfer).toHaveBeenCalledWith({ projectId: 'p1', userId: 'u2' }));
  });

  it('转让成功 → 成功 toast（含目标成员名）；失败 → 错误 toast 显示后端中文消息', async () => {
    renderModal();
    fireEvent.click(screen.getByText('李四'));
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }));

    expect(await screen.findByText('转让成功')).toBeInTheDocument();

    // 失败路径：后端 VAL_001（转现任 owner）中文消息经 errMsg 透出
    state.transfer.mockRejectedValue({ error: { message: '不能转让给当前 owner' } });
    fireEvent.click(screen.getByText('张三'));
    fireEvent.click(screen.getByRole('button', { name: '确认转让' }));
    expect(await screen.findByText('不能转让给当前 owner')).toBeInTheDocument();
  });

  it('唯一 owner 无候选 → 空态文案 + 确认按钮禁用', () => {
    state.members = [memberItem({ id: 'm1', userId: 'u1', role: 'owner', username: 'owner1', nickname: '项目所有者' })];
    renderModal();
    expect(screen.getByText('暂无可转让的成员，请先在成员管理中添加')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认转让' })).toBeDisabled();
  });

  it('成员加载失败 → 错误态文案（errMsg 透出）', () => {
    state.membersError = { error: { message: '无权访问' } };
    renderModal();
    expect(screen.getByText('无权访问')).toBeInTheDocument();
  });

  it('isOpen=false → 不渲染弹窗内容', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByText('转让所有权')).not.toBeInTheDocument();
  });
});
