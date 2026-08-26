import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  onLogout: noop,
  currentUser: admin,
  onOpenUserModal: noop,
};

describe('Sidebar 冒烟（T4）', () => {
  it('渲染项目列表与视图入口', () => {
    render(<Sidebar {...props} />);
    expect(screen.getByText('某某科技 - 私有云')).toBeInTheDocument();
    expect(screen.getByText('测试项目')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /所有资源/ })).toBeInTheDocument();
  });

  it('项目搜索过滤', async () => {
    const events = userEvent.setup();
    render(<Sidebar {...props} />);
    await events.type(screen.getByPlaceholderText('搜索客户...'), '某某');
    expect(screen.getByText('某某科技 - 私有云')).toBeInTheDocument();
    expect(screen.queryByText('测试项目')).not.toBeInTheDocument();
  });

  it('选中项目回调', async () => {
    const onSelectProject = vi.fn();
    const events = userEvent.setup();
    render(<Sidebar {...props} onSelectProject={onSelectProject} />);
    await events.click(screen.getByText('某某科技 - 私有云'));
    expect(onSelectProject).toHaveBeenCalledWith('p1');
  });
});
