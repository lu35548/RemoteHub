import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import AuditLogsPage from './AuditLogsPage';
import type { UserPublic } from '@remotehub/shared';

// mock 数据层：useMe 受控（两段式守卫的第二段在组件内）
vi.mock('../api/queries', () => ({
  useMe: vi.fn(),
}));
import { useMe } from '../api/queries';

const mockedUseMe = useMe as ReturnType<typeof vi.fn>;

const admin: UserPublic = { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' };
const normalUser: UserPublic = { ...admin, id: 'u2', username: 'wangwu', nickname: '王五', role: 'user' };

/** 测试壳：MemoryRouter + 位置探针 + / 承接路由（断言重定向落点） */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/audit-logs']}>
      <Routes>
        <Route path="/admin/audit-logs" element={<AuditLogsPage />} />
        <Route path="/" element={<div>工作台占位</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

describe('AuditLogsPage 骨架（P0-7）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isPending → 不渲染标题且不重定向', () => {
    mockedUseMe.mockReturnValue({ data: undefined, isPending: true });
    renderPage();
    expect(screen.queryByText('审计日志')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin/audit-logs');
  });

  it('非 admin → Navigate 重定向回工作台', () => {
    mockedUseMe.mockReturnValue({ data: normalUser, isPending: false });
    renderPage();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/');
    expect(screen.getByText('工作台占位')).toBeInTheDocument();
  });

  it('useMe 失败（me=undefined）→ fail-closed 同样重定向', () => {
    mockedUseMe.mockReturnValue({ data: undefined, isPending: false });
    renderPage();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/');
    expect(screen.queryByText('建设中')).not.toBeInTheDocument();
  });

  it('admin → 页标题与建设中占位可见', () => {
    mockedUseMe.mockReturnValue({ data: admin, isPending: false });
    renderPage();
    expect(screen.getByText('审计日志')).toBeInTheDocument();
    expect(screen.getByText('建设中')).toBeInTheDocument();
  });
});
