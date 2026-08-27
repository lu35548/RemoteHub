import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectionDetail, ConnectionListItem, ProjectListItem } from '@remotehub/shared';
import { UIProvider } from './UIComponents';
import ConnectionModal from './ConnectionModal';

const user = { id: 'u1', nickname: '管理员' };

const projects: ProjectListItem[] = [
  {
    id: 'p1', name: '默认项目', icon: 'folder',
    createdBy: user, updatedBy: user,
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  },
];

// mock 按真实运行时形状造（mapToListItem 输出，含 createdAt 超集字段）
const vpnItem = (over: Partial<ConnectionListItem> = {}): ConnectionListItem => ({
  id: 'vpn-1', projectId: 'p1', project: { id: 'p1', name: '默认项目' },
  name: '总部 VPN', host: 'vpn.example.com', port: null, username: null,
  protocol: 'VPN', vpnType: 'SSL_VPN', requiredVpnId: null, hasPassword: false,
  tags: null, lastAccessed: null, createdBy: user, updatedBy: user,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const detail = (over: Partial<ConnectionDetail> = {}): ConnectionDetail => ({
  id: 'c1', projectId: 'p1', name: '既有主机', host: '10.0.0.1', port: 22,
  username: 'root', protocol: 'SSH', vpnType: null, vpnLoginUrl: null,
  requiredVpnId: 'vpn-1', notes: '备注', tags: 'a,b', lastAccessed: null,
  createdBy: user, updatedBy: user,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

const renderModal = (props: Partial<Parameters<typeof ConnectionModal>[0]> = {}) =>
  render(
    <UIProvider>
      <ConnectionModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn().mockResolvedValue(detail())}
        projects={projects}
        connections={[vpnItem()]}
        editingConnection={null}
        activeProjectId={null}
        onAddProjectRequest={vi.fn()}
        {...props}
      />
    </UIProvider>,
  );

describe('ConnectionModal（T5）', () => {
  it('新建 HOST：必填 + tags 回车 + 端口 → onSave 收 CreateConnectionRequest（tags join / port number / 空串转 null）', async () => {
    const onSave = vi.fn().mockResolvedValue(detail());
    const events = userEvent.setup();
    renderModal({ onSave });

    await events.type(screen.getByPlaceholderText('例如: 财务部-应用服务器-01'), '应用服务器');
    await events.type(screen.getByPlaceholderText('192.168.1.100'), '192.168.1.10');
    await events.type(screen.getByPlaceholderText('3389'), '3389');
    await events.type(screen.getByPlaceholderText('例如: 生产环境...'), '生产环境');
    await events.keyboard('{Enter}');
    await events.click(screen.getByRole('button', { name: '立即创建' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      projectId: 'p1', name: '应用服务器', host: '192.168.1.10',
      port: 3389, protocol: 'RDP', tags: '生产环境',
    });
    expect(payload.username).toBeNull();
    expect(payload.password).toBeNull();
  });

  it('VPN SSL_VPN：host 自动补 https:// 且 vpnLoginUrl 同步（v1 WEB 逻辑的 v2 语义映射）', async () => {
    const onSave = vi.fn().mockResolvedValue(detail());
    const events = userEvent.setup();
    renderModal({ onSave });

    await events.click(screen.getByRole('button', { name: /VPN 节点 \/ 网关/ }));
    await events.click(screen.getByText('SSL VPN（网页认证）'));
    await events.type(screen.getByPlaceholderText('例如: 总部 OpenVPN'), '网页 VPN');
    await events.type(screen.getByPlaceholderText('https://...'), 'vpn.example.com');
    await events.click(screen.getByRole('button', { name: '立即创建' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({
      protocol: 'VPN', vpnType: 'SSL_VPN',
      host: 'https://vpn.example.com', vpnLoginUrl: 'https://vpn.example.com',
    });
  });

  it('快速建 VPN：保存后按返回的 detail 回填 requiredVpnId 并切回 HOST（v2 后端 id 回填）', async () => {
    const saved = detail({ id: 'vpn-new', name: '新 VPN', host: 'https://vpn.example.com', protocol: 'VPN', vpnType: 'SSL_VPN', vpnLoginUrl: 'https://vpn.example.com', requiredVpnId: null, port: null, username: null, tags: null });
    const onSave = vi.fn().mockResolvedValue(saved);
    const events = userEvent.setup();
    renderModal({ onSave, connections: [] });

    await events.click(screen.getByRole('button', { name: /新建 VPN/ }));
    expect(screen.getByText('正在添加前置 VPN')).toBeInTheDocument();

    await events.click(screen.getByText('SSL VPN（网页认证）'));
    await events.type(screen.getByPlaceholderText('例如: 总部 OpenVPN'), '新 VPN');
    await events.type(screen.getByPlaceholderText('https://...'), 'vpn.example.com');
    await events.click(screen.getByRole('button', { name: /添加 VPN 并返回/ }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/已关联: 新 VPN/)).toBeInTheDocument());
    // 切回 HOST tab：HOST 表单的必填占位符重新出现
    expect(screen.getByPlaceholderText('192.168.1.100')).toBeInTheDocument();
    expect(screen.queryByText('正在添加前置 VPN')).not.toBeInTheDocument();
  });

  it('编辑：detail 回填表单（tags split 成 chips / VPN 依赖提示）+ 密码留空不提交 password 字段', async () => {
    const onSave = vi.fn().mockResolvedValue(detail());
    const events = userEvent.setup();
    renderModal({ onSave, editingConnection: detail() });

    expect((screen.getByPlaceholderText('例如: 财务部-应用服务器-01') as HTMLInputElement).value).toBe('既有主机');
    expect((screen.getByPlaceholderText('192.168.1.100') as HTMLInputElement).value).toBe('10.0.0.1');
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText(/已关联: 总部 VPN/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '保存修改' })).toBeInTheDocument();
    // 编辑态锁定所属项目（backend update 不支持换项目，防静默假成功）
    expect(screen.getByDisplayValue('默认项目')).toBeDisabled();

    await events.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload).toMatchObject({
      name: '既有主机', host: '10.0.0.1', port: 22, username: 'root',
      protocol: 'SSH', tags: 'a,b', requiredVpnId: 'vpn-1',
    });
    // 编辑时密码留空 = 不动原密码（v2 加密模型：无明文可回填，空值提交会误清空）
    expect(payload.password).toBeUndefined();
    // 编辑提交携带 editingId，App 层据此走 update 而非 create
    expect(onSave.mock.calls[0]?.[1]).toBe('c1');
  });

  it('host 联动编辑关联 VPN：VPN tab 提交走 vpnEditingId，notes 未回填不提交（保留原值）', async () => {
    const onSave = vi.fn().mockResolvedValue(detail());
    const events = userEvent.setup();
    renderModal({ onSave, editingConnection: detail() });

    // 切到 VPN tab（联动回填 linkedVpn=vpn-1，来自列表项、无 notes）
    await events.click(screen.getByRole('button', { name: /VPN 节点 \/ 网关/ }));
    expect((screen.getByPlaceholderText('例如: 总部 OpenVPN') as HTMLInputElement).value).toBe('总部 VPN');
    // 联动编辑同样提示「留空保持不变」
    expect(screen.getByPlaceholderText('留空保持不变')).toBeInTheDocument();

    await events.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
    // editingId 指向关联的 VPN 而非 host 本身
    expect(onSave.mock.calls[0]?.[1]).toBe('vpn-1');
    // notes 来自列表项（无该字段），空 = 未回填 → 不提交以免清库（review S2 修复）
    expect(payload.notes).toBeUndefined();
    // SSL_VPN 的 URL 补全在编辑态同样生效（host 无 scheme 时补 https://）
    expect(payload).toMatchObject({ name: '总部 VPN', host: 'https://vpn.example.com', vpnLoginUrl: 'https://vpn.example.com', protocol: 'VPN', vpnType: 'SSL_VPN' });
  });

  it('必填缺失 → toast 校验失败，不提交', async () => {
    const onSave = vi.fn();
    const events = userEvent.setup();
    renderModal({ onSave });

    await events.click(screen.getByRole('button', { name: '立即创建' }));

    await waitFor(() => expect(screen.getByText('校验失败')).toBeInTheDocument());
    expect(onSave).not.toHaveBeenCalled();
  });
});
