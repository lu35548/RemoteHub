import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionListItem } from '@remotehub/shared';
import type { LaunchConnectionResult } from '../api/queries';
import { UIProvider } from './UIComponents';
import ConnectionCard from './ConnectionCard';

// useDecryptPassword / launchConnection（#46）边界 mock（按运行时形状：mutateAsync(id) → { password }）
const { decryptMock, launchMock } = vi.hoisted(() => ({ decryptMock: vi.fn(), launchMock: vi.fn() }));
vi.mock('../api/queries', () => ({
  useDecryptPassword: () => ({ mutateAsync: decryptMock }),
  launchConnection: launchMock,
}));

// RDP utils 边界 mock（DOM 下载副作用不在 jsdom 验证，真链路浏览器覆盖；downloadBlob 由 launchConnection 消费）
const { rdpMocks } = vi.hoisted(() => ({
  rdpMocks: {
    isRdpConfigured: vi.fn(),
    markRdpConfigured: vi.fn(),
    downloadRdpFile: vi.fn(),
    generateRdpRegistryFile: vi.fn(),
    downloadBlob: vi.fn(),
  },
}));
vi.mock('../utils', () => rdpMocks);

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
  beforeEach(() => {
    decryptMock.mockReset();
    decryptMock.mockResolvedValue({ password: 'S3cret!' });
    launchMock.mockReset();
  });

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

  it('动作按钮激活（T6）：主操作按钮与密码眼睛可点击', () => {
    renderCard();

    const main = screen.getByRole('button', { name: /一键直连/ });
    expect(main).toBeEnabled();
    const eye = screen.getByTitle('显示');
    expect(eye).toBeEnabled();
  });

  it('密码眼睛：点击按需解密显示明文，再点遮罩', async () => {
    const events = userEvent.setup();
    renderCard();

    await events.click(screen.getByTitle('显示'));
    expect(decryptMock).toHaveBeenCalledWith('c1');
    expect(await screen.findByText('S3cret!')).toBeInTheDocument();

    await events.click(screen.getByTitle('隐藏'));
    expect(screen.getByText('••••••••')).toBeInTheDocument();
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

describe('ConnectionCard lastAccessed 脚注（#42）', () => {
  beforeEach(() => {
    decryptMock.mockReset();
    decryptMock.mockResolvedValue({ password: 'S3cret!' });
    launchMock.mockReset();
  });

  it('lastAccessed 有值 → 脚注含「访问 <相对时间>」与「更新 <相对时间>」', () => {
    const now = Date.now();
    renderCard({
      connection: hostItem({
        lastAccessed: new Date(now - 3 * 3600_000).toISOString(),
        updatedAt: new Date(now - 5 * 24 * 3600_000).toISOString(),
      }),
    });

    expect(screen.getByText(/访问 3小时前/)).toBeInTheDocument();
    expect(screen.getByText(/更新 5天前/)).toBeInTheDocument();
  });

  it('lastAccessed 为 null → 「未访问」中文占位（更新时间仍展示）', () => {
    renderCard({
      connection: hostItem({ lastAccessed: null, updatedAt: new Date(Date.now() - 2 * 3600_000).toISOString() }),
    });

    expect(screen.getByText(/未访问/)).toBeInTheDocument();
    expect(screen.getByText(/更新 2小时前/)).toBeInTheDocument();
  });
});

describe('ConnectionCard 复制/密码系统（T6）', () => {
  beforeEach(() => {
    decryptMock.mockReset();
    decryptMock.mockResolvedValue({ password: 'S3cret!' });
    launchMock.mockReset();
  });

  it('复制系：HOST/USER 复制按钮写入剪贴板并弹 toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderCard();

    // 复制按钮 opacity-0 hover 才显示，userEvent hit-testing 对其不稳定，用 fireEvent 直派（T6 实证）
    fireEvent.click(screen.getByLabelText('复制主机地址'));
    expect(writeText).toHaveBeenCalledWith('192.168.1.10');
    expect(await screen.findByText('地址 已复制到剪贴板')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('复制用户名'));
    expect(writeText).toHaveBeenCalledWith('administrator');
    expect(await screen.findByText('用户名 已复制到剪贴板')).toBeInTheDocument();
  });

  it('密码复制：未显示明文时先经 decrypt-password 解密再写剪贴板', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderCard();

    fireEvent.click(screen.getByLabelText('复制密码'));
    expect(decryptMock).toHaveBeenCalledWith('c1');
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('S3cret!'));
    expect(await screen.findByText('密码 已复制到剪贴板')).toBeInTheDocument();
  });

  it('Via 行：SSL_VPN 依赖跳转登录页，其他依赖复制地址', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      const web = renderCard({ vpnDependency: vpnItem() });
      fireEvent.click(screen.getByText('跳转'));
      expect(openSpy).toHaveBeenCalledWith('https://vpn.example.com', '_blank');
      web.unmount();

      const client = renderCard({ vpnDependency: vpnItem({ vpnType: 'OTHER' }) });
      fireEvent.click(screen.getByText('复制'));
      expect(writeText).toHaveBeenCalledWith('vpn.example.com');
      expect(screen.getByText('请粘贴到客户端进行连接')).toBeInTheDocument();
      client.unmount();
    } finally {
      openSpy.mockRestore();
    }
  });

  it('RDP 卡片：Zap 状态按钮 + 菜单「配置直连/下载 RDP」', async () => {
    const events = userEvent.setup();
    renderCard(); // hostItem 默认 RDP

    expect(screen.getByTitle('未配置直连')).toBeInTheDocument();

    await events.click(screen.getByRole('button', { name: /更多/i }));
    expect(screen.getByText('配置直连')).toBeInTheDocument();
    fireEvent.click(screen.getByText('下载 RDP'));
    expect(rdpMocks.downloadRdpFile).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  it('RDP setup 流：Zap 打开引导 → 下载脚本 → 完成设置标记就绪并关闭', () => {
    renderCard();

    fireEvent.click(screen.getByTitle('未配置直连'));
    expect(screen.getByText('启用一键直连')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /下载配置脚本/ }));
    expect(rdpMocks.generateRdpRegistryFile).toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /我已安装，完成设置/ }));
    expect(rdpMocks.markRdpConfigured).toHaveBeenCalled();
    expect(screen.getByTitle('已配置直连')).toBeInTheDocument();
    expect(screen.queryByText('启用一键直连')).not.toBeInTheDocument();
  });
});

// ── #46 一键直连 launch 分派 ──
// 主按钮统一走 GET /connections/:id/launch（后端 PROTOCOL_REGISTRY 单一真相源），
// 按 launchConnection 解析结果分派 UI 动作；blob 下载副作用在 launchConnection 内部（同 CSV 导出先例）。
describe('ConnectionCard 一键直连 launch 分派（#46）', () => {
  beforeEach(() => {
    decryptMock.mockReset();
    decryptMock.mockResolvedValue({ password: 'S3cret!' });
    launchMock.mockReset();
    Object.values(rdpMocks).forEach((m) => m.mockReset());
    rdpMocks.isRdpConfigured.mockReturnValue(false);
  });

  it('url → window.open 端点返回的 URL（HTTPS）', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    try {
      launchMock.mockResolvedValue({ type: 'url', url: 'https://192.168.1.10' } satisfies LaunchConnectionResult);
      renderCard({ connection: hostItem({ protocol: 'HTTPS', port: null }) });

      fireEvent.click(screen.getByRole('button', { name: /打开网页/ }));
      await waitFor(() => expect(openSpy).toHaveBeenCalledWith('https://192.168.1.10', '_blank'));
      expect(await screen.findByText('正在打开')).toBeInTheDocument();
    } finally {
      openSpy.mockRestore();
    }
  });

  it('command → 复制端点命令串（SSH）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    launchMock.mockResolvedValue({ type: 'command', command: 'ssh root@192.168.1.10 -p 22' } satisfies LaunchConnectionResult);
    renderCard({ connection: hostItem({ protocol: 'SSH', username: 'root', port: 22 }) });

    fireEvent.click(screen.getByRole('button', { name: /打开 SSH/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('ssh root@192.168.1.10 -p 22'));
    expect(await screen.findByText('连接命令已复制到剪贴板')).toBeInTheDocument();
    expect(launchMock).toHaveBeenCalledWith('c1');
  });

  it('command → 复制设备码本体（TODESK，host 即设备 ID）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    launchMock.mockResolvedValue({ type: 'command', command: '882 331 992' } satisfies LaunchConnectionResult);
    renderCard({ connection: hostItem({ protocol: 'TODESK', host: '882 331 992' }) });

    fireEvent.click(screen.getByRole('button', { name: /复制设备码/ }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('882 331 992'));
    expect(await screen.findByText('连接命令已复制到剪贴板')).toBeInTheDocument();
  });

  it('rdp_file → launchConnection 内部完成 Blob 下载，卡片 toast 已下载', async () => {
    launchMock.mockResolvedValue({ type: 'rdp_file', filename: '应用服务器.rdp' } satisfies LaunchConnectionResult);
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /一键直连/ }));
    expect(await screen.findByText(/RDP 文件已下载/)).toBeInTheDocument();
    expect(launchMock).toHaveBeenCalledWith('c1');
    expect(rdpMocks.downloadBlob).not.toHaveBeenCalled(); // 下载在 queries 层，卡片不再触碰 blob
  });

  it('CONN_006 → toast「该协议不支持直连」（VNC）', async () => {
    launchMock.mockRejectedValue(Object.assign(new Error('该协议不支持直连'), { code: 'CONN_006' }));
    renderCard({ connection: hostItem({ protocol: 'VNC', port: null }) });

    fireEvent.click(screen.getByRole('button', { name: /连接/ }));
    expect(await screen.findByText('该协议不支持直连')).toBeInTheDocument();
  });

  it('其他错误 → toast 服务端中文消息', async () => {
    launchMock.mockRejectedValue(new Error('连接不存在'));
    renderCard();

    fireEvent.click(screen.getByRole('button', { name: /一键直连/ }));
    expect(await screen.findByText('连接不存在')).toBeInTheDocument();
  });
});
