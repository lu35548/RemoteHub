import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import ConnectionFilterBar from './ConnectionFilterBar';

// #42 工作台过滤栏纯展示组件：chips 单选切换 / 排序 segmented / 项目视图协议分布。
// 数据流（URL 联动、chips 来源聚合）在 App.test.tsx 接线层锁，此处只锁交互契约
describe('ConnectionFilterBar（#42）', () => {
  const baseProps = {
    tagOptions: [
      { tag: '生产环境', count: 5 },
      { tag: '测试', count: 2 },
    ],
    activeTag: '',
    onToggleTag: vi.fn(),
    sortByLastAccessed: false,
    onSortChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tag chips 按候选渲染（含计数）：点击回调 onToggleTag，active chip aria-pressed', () => {
    render(<ConnectionFilterBar {...baseProps} activeTag="生产环境" />);

    const chip = screen.getByRole('button', { name: /#生产环境/ });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /#测试/ })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: /#测试/ }));
    expect(baseProps.onToggleTag).toHaveBeenCalledWith('测试');
    // 未点过的 chip 不触发
    expect(baseProps.onToggleTag).toHaveBeenCalledTimes(1);
  });

  it('排序 segmented：默认「最近更新」按下；点「最近访问」回调 lastAccessed，再点「最近更新」回调 default', () => {
    render(<ConnectionFilterBar {...baseProps} />);

    expect(screen.getByRole('button', { name: '最近更新' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '最近访问' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '最近访问' }));
    expect(baseProps.onSortChange).toHaveBeenCalledWith('lastAccessed');

    fireEvent.click(screen.getByRole('button', { name: '最近更新' }));
    expect(baseProps.onSortChange).toHaveBeenCalledWith('default');
  });

  it('protocolStats 传入 → 协议分布徽章（PROTOCOL_SHORT_LABELS 中文短标签 + 计数）；未传 → 不渲染', () => {
    const { rerender } = render(
      <ConnectionFilterBar {...baseProps} protocolStats={{ RDP: 3, SSH: 1 }} />,
    );

    // RDP 映射「桌面远程」（与卡片协议名同口径）；SSH 无中文名原样
    expect(screen.getByText('桌面远程')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('SSH')).toBeInTheDocument();

    rerender(<ConnectionFilterBar {...baseProps} />);
    expect(screen.queryByText('桌面远程')).not.toBeInTheDocument();
  });

  it('协议分布未知协议键 → 原样兜底显示（stats 键来自后端原始值，不因映射缺失丢统计）', () => {
    render(<ConnectionFilterBar {...baseProps} protocolStats={{ LEGACY_PROTO: 2 }} />);

    // 断言收进「协议分布」容器：chip「测试」的计数同为 2，裸 getByText 会双命中
    const statsBar = within(screen.getByLabelText('协议分布'));
    expect(statsBar.getByText('LEGACY_PROTO')).toBeInTheDocument();
    expect(statsBar.getByText('2')).toBeInTheDocument();
  });

  it('tagOptions 空 → chips 组不渲染（排序切换仍在）', () => {
    render(<ConnectionFilterBar {...baseProps} tagOptions={[]} />);

    expect(screen.queryByRole('group', { name: '标签过滤' })).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: '排序方式' })).toBeInTheDocument();
  });
});
