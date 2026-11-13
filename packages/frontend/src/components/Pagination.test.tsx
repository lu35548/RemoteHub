import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination';

// #49 分页 footer 通用组件：审计页 DataTable footer 同款交互（总数/页码/上下页/边界禁用），
// 三列表（用户/项目/连接）独立消费——表格态在 DataTable 内部复用，卡片/列表态独立渲染

const renderPagination = (overrides: Partial<Parameters<typeof Pagination>[0]> = {}) => {
  const onPageChange = vi.fn();
  const props = { page: 1, total: 45, pageSize: 20, onPageChange, ...overrides };
  const view = render(<Pagination {...props} />);
  return { onPageChange, unmount: view.unmount };
};

describe('Pagination（#49）', () => {
  it('渲染总数与页码（审计页 DataTable footer 同款文案）', () => {
    renderPagination({ page: 2, total: 45, pageSize: 20 });
    expect(screen.getByText('共 45 条')).toBeInTheDocument();
    expect(screen.getByText('第 2 / 3 页')).toBeInTheDocument();
  });

  it('上一页/下一页回调携带目标页码', async () => {
    const { onPageChange } = renderPagination({ page: 2, total: 45, pageSize: 20 });
    const events = userEvent.setup();
    await events.click(screen.getByRole('button', { name: '上一页' }));
    expect(onPageChange).toHaveBeenCalledWith(1);
    await events.click(screen.getByRole('button', { name: '下一页' }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it('首页上一页 disabled、末页下一页 disabled', () => {
    const { unmount } = renderPagination({ page: 1, total: 45, pageSize: 20 });
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
    unmount();
    renderPagination({ page: 3, total: 45, pageSize: 20 });
    expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  });

  it('total=0 → 单页态，双按钮禁用', () => {
    renderPagination({ page: 2, total: 0, pageSize: 20 });
    expect(screen.getByText('共 0 条')).toBeInTheDocument();
    expect(screen.getByText('第 1 / 1 页')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  });

  it('越界钳制（批 13a）：page > totalPages → 显示钳回末页（防「第 2 / 1 页」），回调带钳制后页码', async () => {
    const { onPageChange } = renderPagination({ page: 2, total: 10, pageSize: 10 });
    expect(screen.getByText('第 1 / 1 页')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();

    const events = userEvent.setup();
    await events.click(screen.getByRole('button', { name: '上一页' }));
    expect(onPageChange).not.toHaveBeenCalled(); // 钳制后已在首页，上一页禁用
  });

  it('className 透传（Sidebar 窄条挂载场景）', () => {
    const { container } = render(<Pagination page={1} total={45} pageSize={20} onPageChange={() => {}} className="mt-3 px-1" />);
    expect(container.firstElementChild).toHaveClass('mt-3', 'px-1');
  });
});
