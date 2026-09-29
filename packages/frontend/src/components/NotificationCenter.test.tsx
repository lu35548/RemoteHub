import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationCenter from './NotificationCenter';
import { useNotifications, useMarkNotificationRead, type NotificationItem } from '../api/queries';
import type { PaginatedResponse } from '@remotehub/shared';

// 数据层 mock：hooks 受控（照 AuditLogsPage 先例）；payloadMessage/标签表/formatTime 用真实现
vi.mock('../api/queries', () => ({
  useNotifications: vi.fn(),
  useMarkNotificationRead: vi.fn(),
}));

const mockedUseNotifications = useNotifications as ReturnType<typeof vi.fn>;
const mockedUseMarkRead = useMarkNotificationRead as ReturnType<typeof vi.fn>;
const mutate = vi.fn();

const item = (overrides: Partial<NotificationItem>): NotificationItem => ({
  id: 'n1', type: 'MEMBER_ADDED', payload: { message: '张三加入了项目「远程桌面」' },
  isRead: false, createdAt: '2026-09-29T01:02:00.000Z', ...overrides,
});

const page = (items: NotificationItem[], total = items.length): PaginatedResponse<NotificationItem> => ({
  success: true, data: items, pagination: { page: 1, pageSize: 50, total },
});

/** hooks 受控注入：角标走 pagination.total（服务端未读总数），列表另给 data */
function mockData(items: NotificationItem[], total = items.length, extra: Record<string, unknown> = {}) {
  mockedUseNotifications.mockReturnValue({ data: page(items, total), isPending: false, ...extra } as never);
}

describe('NotificationCenter（票 #37 铃铛 + 角标 + 下拉）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutate.mockClear();
    mockedUseMarkRead.mockReturnValue({ mutate, isPending: false, variables: undefined } as never);
  });

  it('铃铛按钮渲染；未读 3 → 角标显示 3', () => {
    mockData([item({}), item({ id: 'n2' }), item({ id: 'n3' })], 3);
    render(<NotificationCenter />);

    expect(screen.getByRole('button', { name: '通知' })).toBeInTheDocument();
    expect(screen.getByTestId('unread-badge')).toHaveTextContent('3');
  });

  it('角标走 pagination.total（非列表长度——分页只取前 50 条）', () => {
    mockData([item({})], 120);
    render(<NotificationCenter />);
    expect(screen.getByTestId('unread-badge')).toHaveTextContent('99+');
  });

  it('未读 0 → 不渲染角标', () => {
    mockData([]);
    render(<NotificationCenter />);
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
  });

  it('点击铃铛开下拉：类型中文标签 / payload message / 时间；再点关闭', async () => {
    mockData([
      item({ id: 'a', type: 'SYSTEM_ALERT', payload: { message: '检测到可疑 IP 登录' } }),
      item({ id: 'b', type: 'MEMBER_ROLE_UPDATED', payload: {} }),
    ]);
    const events = userEvent.setup();
    render(<NotificationCenter />);

    await events.click(screen.getByRole('button', { name: '通知' }));

    expect(screen.getByText('未读通知')).toBeInTheDocument();
    expect(screen.getByText('系统告警')).toBeInTheDocument();
    expect(screen.getByText('检测到可疑 IP 登录')).toBeInTheDocument();
    expect(screen.getByText('成员角色变更')).toBeInTheDocument();
    expect(screen.getByText('暂无详情')).toBeInTheDocument(); // payload 无 message 的兜底文案
    expect(screen.getAllByText(/\d{2}-\d{2} \d{2}:\d{2}/).length).toBeGreaterThan(0); // formatTime 格式

    await events.click(screen.getByRole('button', { name: '通知' }));
    expect(screen.queryByText('未读通知')).not.toBeInTheDocument();
  });

  it('空列表 → 暂无未读通知占位', async () => {
    mockData([]);
    const events = userEvent.setup();
    render(<NotificationCenter />);

    await events.click(screen.getByRole('button', { name: '通知' }));
    expect(screen.getByText('暂无未读通知')).toBeInTheDocument();
  });

  it('标记已读：条目按钮 → mutate(id)；pending 中禁用同条按钮', async () => {
    mockData([item({ id: 'n1' }), item({ id: 'n2' })]);
    mockedUseMarkRead.mockReturnValue({ mutate, isPending: true, variables: 'n1' } as never);
    const events = userEvent.setup();
    render(<NotificationCenter />);

    await events.click(screen.getByRole('button', { name: '通知' }));
    const buttons = screen.getAllByRole('button', { name: '标记已读' });
    expect(buttons[0]).toBeDisabled(); // n1 pending
    expect(buttons[1]).not.toBeDisabled();

    await events.click(buttons[1]!);
    expect(mutate).toHaveBeenCalledWith('n2');
  });

  it('点击面板外关闭下拉', () => {
    mockData([item({})]);
    render(<NotificationCenter />);

    fireEvent.click(screen.getByRole('button', { name: '通知' }));
    expect(screen.getByText('未读通知')).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('未读通知')).not.toBeInTheDocument();
  });
});
