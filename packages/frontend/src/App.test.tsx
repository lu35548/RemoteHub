import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UIProvider } from './components/UIComponents';
import App from './App';

// mock 数据层：useMe 返回 admin，列表 hooks 返回空分页
vi.mock('./api/queries', () => ({
  useMe: vi.fn(() => ({ data: { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' }, isPending: false, isError: false })),
  useProjects: vi.fn(() => ({ data: { success: true as const, data: [], pagination: { page: 1, pageSize: 200, total: 0 } }, isPending: false })),
  useConnections: vi.fn(() => ({ data: { success: true as const, data: [], pagination: { page: 1, pageSize: 20, total: 0 } }, isPending: false })),
  useCreateProject: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useUpdateProject: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useDeleteProject: vi.fn(() => ({ mutateAsync: vi.fn() })),
  useLogout: vi.fn(() => ({ mutateAsync: vi.fn(), mutate: vi.fn() })),
}));

describe('App 冒烟（T4）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('渲染主界面壳：侧栏 + 视图切换 + 当前用户', () => {
    render(
      <UIProvider>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <App />
          </MemoryRouter>
        </QueryClientProvider>
      </UIProvider>,
    );
    expect(screen.getAllByText('RemoteHub').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /所有资源/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /VPN 网络管理/ })).toBeInTheDocument();
    expect(screen.getByText('管理员')).toBeInTheDocument();
    expect(screen.getByText('暂无资源配置')).toBeInTheDocument();
  });
});
