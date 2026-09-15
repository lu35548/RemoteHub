import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from './DataTable';
import type { DataTableProps } from './DataTable';

interface Row {
  id: string;
  name: string;
  role: string;
}

// role 列走 render 自定义单元格（中文标签映射，模拟 P0-9 审计页消费形态）
const columns: DataTableProps<Row>['columns'] = [
  { key: 'name', label: '用户名' },
  {
    key: 'role',
    label: '角色',
    render: (row) => <span data-testid={`role-${row.id}`}>{row.role === 'admin' ? '管理员' : '成员'}</span>,
  },
];

const rows: Row[] = [
  { id: '1', name: 'alice', role: 'admin' },
  { id: '2', name: 'bob', role: 'user' },
];

function renderTable(overrides: Partial<Parameters<typeof DataTable<Row>>[0]> = {}) {
  const onPageChange = vi.fn();
  const props = { columns, rows, page: 1, total: 2, pageSize: 20, onPageChange, ...overrides };
  render(<DataTable {...props} />);
  return { onPageChange };
}

describe('DataTable（P0-7）', () => {
  it('渲染列头与数据行', () => {
    renderTable();
    expect(screen.getByRole('columnheader', { name: '用户名' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '角色' })).toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('render 自定义单元格优先于字段直出', () => {
    renderTable();
    expect(screen.getByTestId('role-1')).toHaveTextContent('管理员');
    expect(screen.getByTestId('role-2')).toHaveTextContent('成员');
  });

  it('空 rows 渲染 emptyText 文案', () => {
    renderTable({ rows: [], emptyText: '暂无审计记录' });
    expect(screen.getByText('暂无审计记录')).toBeInTheDocument();
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
  });

  it('isLoading 时不渲染数据行（骨架态）', () => {
    renderTable({ isLoading: true });
    expect(screen.queryByText('alice')).not.toBeInTheDocument();
    expect(screen.queryByText('bob')).not.toBeInTheDocument();
  });

  it('分页 footer：总数与页码展示、上下页回调', async () => {
    const { onPageChange } = renderTable({ page: 2, total: 45, pageSize: 20 });
    expect(screen.getByText('共 45 条')).toBeInTheDocument();
    expect(screen.getByText('第 2 / 3 页')).toBeInTheDocument();
    const prev = screen.getByRole('button', { name: '上一页' });
    expect(prev).toBeEnabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
    await userEvent.setup().click(prev);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it('分页边界：首页上一页 disabled', () => {
    renderTable({ page: 1, total: 45, pageSize: 20 });
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeEnabled();
  });

  it('分页边界：末页下一页 disabled', () => {
    renderTable({ page: 3, total: 45, pageSize: 20 });
    expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  });
});
