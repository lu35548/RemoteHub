import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Sidebar from './Sidebar';
import type { ProjectListItem, UserPublic } from '@remotehub/shared';

const admin: UserPublic = { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' };

const projects: ProjectListItem[] = [
  { id: 'p1', name: '某某科技 - 私有云', icon: 'server', createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' }, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'p2', name: '测试项目', icon: 'cloud', createdBy: { id: 'u1', nickname: '管理员' }, updatedBy: { id: 'u1', nickname: '管理员' }, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

const noop = vi.fn();
const props = {
  projects,
  activeProjectId: null,
  viewMode: 'all' as const,
  onSelectProject: noop,
  onSelectViewMode: noop,
  onAddProject: noop,
  onEditProject: noop,
  onDeleteProject: noop,
  onManageMembers: noop,
  onLogout: noop,
  currentUser: admin,
  onOpenUserModal: noop,
};

describe('Sidebar 冒烟（T4）', () => {
  it('渲染项目列表与视图入口', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    expect(screen.getByText('某某科技 - 私有云')).toBeInTheDocument();
    expect(screen.getByText('测试项目')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /所有资源/ })).toBeInTheDocument();
  });

  it('项目搜索过滤', async () => {
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    await events.type(screen.getByPlaceholderText('搜索客户...'), '某某');
    expect(screen.getByText('某某科技 - 私有云')).toBeInTheDocument();
    expect(screen.queryByText('测试项目')).not.toBeInTheDocument();
  });

  it('选中项目回调', async () => {
    const onSelectProject = vi.fn();
    const events = userEvent.setup();
    render(
      <MemoryRouter>
        <Sidebar {...props} onSelectProject={onSelectProject} />
      </MemoryRouter>,
    );
    await events.click(screen.getByText('某某科技 - 私有云'));
    expect(onSelectProject).toHaveBeenCalledWith('p1');
  });
});

describe('成员管理入口（#40）', () => {
  // MoreVertical 按钮 opacity-0 hover 才显示——userEvent 点击会静默失效，用 fireEvent 直点
  const openProjectMenu = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: `项目操作 ${name}` }));
  };

  it('admin：项目菜单含「成员管理」，点击回调带项目', () => {
    const onManageMembers = vi.fn();
    render(
      <MemoryRouter>
        <Sidebar {...props} onManageMembers={onManageMembers} />
      </MemoryRouter>,
    );
    openProjectMenu('某某科技 - 私有云');
    fireEvent.click(screen.getByText('成员管理'));
    expect(onManageMembers).toHaveBeenCalledWith(projects[0]);
  });

  it('入口遮蔽：非 admin 且 currentUserRole 为空 → 菜单无「成员管理」，编辑/删除不受影响', () => {
    const user: UserPublic = { ...admin, id: 'u2', role: 'user' };
    render(
      <MemoryRouter>
        <Sidebar {...props} currentUser={user} />
      </MemoryRouter>,
    );
    openProjectMenu('测试项目');
    expect(screen.queryByText('成员管理')).not.toBeInTheDocument();
    expect(screen.getByText('编辑')).toBeInTheDocument();
    expect(screen.getByText('删除')).toBeInTheDocument();
  });

  it('项目成员（非 admin 但 currentUserRole 存在）→ 入口可见', () => {
    const user: UserPublic = { ...admin, id: 'u2', role: 'user' };
    const memberProjects: ProjectListItem[] = [{ ...projects[0]!, currentUserRole: 'viewer' }];
    render(
      <MemoryRouter>
        <Sidebar {...props} projects={memberProjects} currentUser={user} />
      </MemoryRouter>,
    );
    openProjectMenu('某某科技 - 私有云');
    expect(screen.getByText('成员管理')).toBeInTheDocument();
  });

  it('键盘可达：MoreVertical 触发按钮 Enter 打开项目菜单', () => {
    render(
      <MemoryRouter>
        <Sidebar {...props} />
      </MemoryRouter>,
    );
    fireEvent.keyDown(screen.getByRole('button', { name: '项目操作 某某科技 - 私有云' }), { key: 'Enter' });
    expect(screen.getByText('成员管理')).toBeInTheDocument();
    expect(screen.getByText('编辑')).toBeInTheDocument();
  });
});
