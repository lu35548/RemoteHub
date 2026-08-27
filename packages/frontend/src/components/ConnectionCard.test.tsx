import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectionListItem } from '@remotehub/shared';
import { UIProvider } from './UIComponents';
import ConnectionCard from './ConnectionCard';

const user = { id: 'u1', nickname: '管理员' };

// mock 按真实运行时形状造（mapToListItem 输出）
const hostItem = (over: Partial<ConnectionListItem> = {}): ConnectionListItem => ({
  id: 'c1', projectId: 'p1', project: { id: 'p1', name: '默认项目' },
  name: '应用服务器', host: '192.168.1.10', port: 3389, username: 'administrator',
  protocol: 'RDP', vpnType: null, requiredVpnId: 'vpn-1', hasPassword: true,
  tags: '生产环境,内网', lastAccessed: null, createdBy: user, updatedBy: user,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const vpnItem = (over: Partial<ConnectionListItem> = {}): ConnectionListItem => ({
  id: 'vpn-1', projectId: 'p1', project: { id: 'p1', name: '默认项目' },
  name: '总部 VPN', host: 'vpn.example.com', port: null, username: null,
  protocol: 'VPN', vpnType: 'SSL_VPN', requiredVpnId: null, hasPassword: false,
  tags: null, lastAccessed: null, createdBy: user, updatedBy: user,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const renderCard = (props: Partial<Parameters<typeof ConnectionCard>[0]> = {}) =>
  render(
    <UIProvider>
      <ConnectionCard
        connection={hostItem()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        {...props}
      />
    </UIProvider>,
  );

describe('ConnectionCard（T5）', () => {
  it('渲染 v1 等价信息集：名称/协议短名/主机/用户名/密码占位/tags/审计 footer', () => {
    renderCard();

    expect(screen.getByText('应用服务器')).toBeInTheDocument();
    expect(screen.getByText('桌面远程')).toBeInTheDocument(); // PROTOCOL_LABELS[RDP].split(' ')[0]
    expect(screen.getByText('192.168.1.10')).toBeInTheDocument();
    expect(screen.getByText('administrator')).toBeInTheDocument();
    expect(screen.getByText('••••••••')).toBeInTheDocument(); // hasPassword=true，T6 前不显示明文
    expect(screen.getByText('#生产环境')).toBeInTheDocument();
    expect(screen.getByText('#内网')).toBeInTheDocument();
    expect(screen.getByText('管理员')).toBeInTheDocument(); // updatedBy.nickname
  });

  it('VPN 依赖：vpnDependency 传入 → Via 行显示依赖名', () => {
    renderCard({ vpnDependency: vpnItem() });

    expect(screen.getByText(/Via: 总部 VPN/)).toBeInTheDocument();
  });

  it('VPN 连接卡片：协议短名 VPN + vpnType 徽标（VPN_TYPE_LABELS 短码）', () => {
    renderCard({ connection: vpnItem() });

    expect(screen.getAllByText('VPN').length).toBeGreaterThan(0); // PROTOCOL_LABELS['VPN']
    expect(screen.getByText('SSL')).toBeInTheDocument(); // VPN_TYPE_LABELS['SSL_VPN'].split(' ')[0] 徽标
  });

  it('动作占位（T6 接管前）：主操作按钮与密码眼睛 disabled', () => {
    renderCard();

    const main = screen.getByRole('button', { name: /一键直连/ });
    expect(main).toBeDisabled();
    const eye = screen.getByTitle('显示');
    expect(eye).toBeDisabled();
  });

  it('菜单：编辑配置回调 connection；删除回调 id', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const events = userEvent.setup();
    renderCard({ onEdit, onDelete });

    await events.click(screen.getByRole('button', { name: /更多/i })); // MoreVertical 触发
    await events.click(screen.getByText('编辑配置'));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));

    await events.click(screen.getByRole('button', { name: /更多/i }));
    await events.click(screen.getByText('删除'));
    expect(onDelete).toHaveBeenCalledWith('c1');
  });
});
