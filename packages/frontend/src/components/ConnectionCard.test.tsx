import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionListItem } from '@remotehub/shared';
import { UIProvider } from './UIComponents';
import ConnectionCard from './ConnectionCard';

// useDecryptPassword 边界 mock（按运行时形状：mutateAsync(id) → { password }）
const { decryptMock } = vi.hoisted(() => ({ decryptMock: vi.fn() }));
vi.mock('../api/queries', () => ({
  useDecryptPassword: () => ({ mutateAsync: decryptMock }),
}));

// RDP utils 边界 mock（DOM 下载副作用不在 jsdom 验证，真链路浏览器覆盖）
const { rdpMocks } = vi.hoisted(() => ({
  rdpMocks: {
    isRdpConfigured: vi.fn(),
    markRdpConfigured: vi.fn(),
    downloadRdpFile: vi.fn(),
    generateRdpRegistryFile: vi.fn(),
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

describe('ConnectionCard 动作系统（T6）', () => {
  beforeEach(() => {
    decryptMock.mockReset();
    decryptMock.mockResolvedValue({ password: 'S3cret!' });
    Object.values(rdpMocks).forEach((m) => m.mockReset());
    rdpMocks.isRdpConfigured.mockReturnValue(false); // 默认未配置直连
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

  it('主操作分派：Web 开新页、SSL_VPN 跳转补 https、专有协议/其他 VPN 复制 host、SSH 复制唤起命令', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    // jsdom 对 window.location.href = 'ssh://...' 会打 not-implemented console 错误，压掉
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    try {
      // HTTP：显式端口
      const http = renderCard({ connection: hostItem({ protocol: 'HTTP', port: 8080 }) });
      fireEvent.click(screen.getByRole('button', { name: /打开网页/ }));
      expect(openSpy).toHaveBeenCalledWith('http://192.168.1.10:8080', '_blank');
      http.unmount();

      // HTTPS：端口缺省 443
      const https = renderCard({ connection: hostItem({ protocol: 'HTTPS', port: null }) });
      fireEvent.click(screen.getByRole('button', { name: /打开网页/ }));
      expect(openSpy).toHaveBeenCalledWith('https://192.168.1.10:443', '_blank');
      https.unmount();

      // VPN SSL_VPN：host 补 https 前缀后跳转（v2 语义：host 即登录 URL）
      const sslVpn = renderCard({ connection: vpnItem() });
      fireEvent.click(screen.getByRole('button', { name: /跳转登录/ }));
      expect(openSpy).toHaveBeenCalledWith('https://vpn.example.com', '_blank');
      sslVpn.unmount();

      // VPN 其他类型：复制 host
      const clientVpn = renderCard({ connection: vpnItem({ vpnType: 'OTHER' }) });
      fireEvent.click(screen.getByRole('button', { name: /复制 VPN 地址/ }));
      expect(writeText).toHaveBeenCalledWith('vpn.example.com');
      clientVpn.unmount();

      // 专有协议：主按钮即复制设备码
      const todesk = renderCard({ connection: hostItem({ protocol: 'TODESK' }) });
      fireEvent.click(screen.getByRole('button', { name: /复制设备码/ }));
      expect(writeText).toHaveBeenCalledWith('192.168.1.10');
      todesk.unmount();

      // SSH：复制完整命令（带端口）
      const ssh = renderCard({ connection: hostItem({ protocol: 'SSH', username: 'root', port: 22 }) });
      fireEvent.click(screen.getByRole('button', { name: /打开 SSH/ }));
      expect(writeText).toHaveBeenCalledWith('ssh root@192.168.1.10 -p 22');
      ssh.unmount();
    } finally {
      openSpy.mockRestore();
      errSpy.mockRestore();
    }
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

  it('RDP 检测：未配置点击主按钮呼叫中，窗口失焦视为协议支持 → 标记就绪', async () => {
    vi.useFakeTimers();
    // jsdom 对 rh-rdp:// 的 <a>.click() 导航报 not-implemented，压掉
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: /一键直连/ }));
      expect(screen.getByText('呼叫中...')).toBeInTheDocument();

      fireEvent.blur(window); // rh-rdp:// 处理器接管 → 失焦
      await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
      expect(rdpMocks.markRdpConfigured).toHaveBeenCalled();
      expect(screen.getByTitle('已配置直连')).toBeInTheDocument();
      expect(screen.getByText('一键直连协议已就绪')).toBeInTheDocument();
    } finally {
      errSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('RDP 检测：无失焦（协议未安装）→ 1.5s 后弹配置引导', async () => {
    vi.useFakeTimers();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: /一键直连/ }));
      await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
      expect(screen.getByText('启用一键直连')).toBeInTheDocument();
    } finally {
      errSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it('RDP 直连：已配置点击主按钮弹 launching Modal，失焦后 500ms 收起', async () => {
    vi.useFakeTimers();
    try {
      rdpMocks.isRdpConfigured.mockReturnValue(true);
      renderCard();
      fireEvent.click(screen.getByRole('button', { name: /一键直连/ }));
      expect(screen.getByText('正在建立连接')).toBeInTheDocument();

      act(() => { vi.advanceTimersByTime(300); }); // 300ms 后触发 rh-rdp://
      fireEvent.blur(window);
      // 两段推进：500ms 收起（isOpen=false，act flush 让 Modal 注册退出 timer）
      // → 300ms 退出动画后卸载（UIComponents Modal 行为）
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      await act(async () => { await vi.advanceTimersByTimeAsync(350); });
      expect(screen.queryByText('正在建立连接')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
