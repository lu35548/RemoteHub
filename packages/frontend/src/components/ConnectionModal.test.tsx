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
  hasPassword: false,
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
    // #44 编辑态开放所属项目下拉（backend updateConnection 已支持显式 projectId 换项目）
    expect(screen.getByDisplayValue('默认项目')).not.toBeDisabled();

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

// ── #46 协议注册表动态表单 ──
// HOST 表单按 PROTOCOL_REGISTRY[protocol].fields 动态渲染：协议切换字段联动（port 预填
// defaultPort / port:none 不渲染 / username:none 隐藏 / hostSemantics 决定 host 文案）。
describe('ConnectionModal 协议注册表动态表单（#46）', () => {
  it('切 SSH → port 预填默认 22，随 payload 提交（defaultPort 联动）', async () => {
    const onSave = vi.fn().mockResolvedValue(detail());
    const events = userEvent.setup();
    renderModal({ onSave });

    await events.click(screen.getByRole('button', { name: /SSH 终端/ }));
    expect((screen.getByPlaceholderText('22') as HTMLInputElement).value).toBe('22');

    await events.type(screen.getByPlaceholderText('例如: 财务部-应用服务器-01'), '跳板机');
    await events.type(screen.getByPlaceholderText('192.168.1.100'), '10.0.0.5');
    await events.click(screen.getByRole('button', { name: '立即创建' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ protocol: 'SSH', port: 22 });
  });

  it('切 ToDesk → 表单变设备 ID：port 字段消失、host 文案「设备 ID / 识别码」、placeholder 882 331 992、密码 label 变「验证码 / 临时密码」', async () => {
    const events = userEvent.setup();
    renderModal({});

    await events.click(screen.getByRole('button', { name: 'ToDesk' }));
    expect(screen.queryByPlaceholderText('3389')).not.toBeInTheDocument(); // fields.port='none' 不渲染
    expect(screen.getByText(/设备 ID \/ 识别码/)).toBeInTheDocument(); // hostSemantics='device_id'
    expect(screen.getByPlaceholderText('例如: 882 331 992')).toBeInTheDocument();
    expect(screen.getByText('验证码 / 临时密码')).toBeInTheDocument(); // 设备 ID+验证码 口径
    expect(screen.queryByText('密码 / Key')).not.toBeInTheDocument();
  });

  it('切 HTTP → username 字段消失（fields.username=none），密码字段保留', async () => {
    const events = userEvent.setup();
    renderModal({});

    await events.click(screen.getByRole('button', { name: 'HTTP' }));
    expect(screen.queryByPlaceholderText('root / administrator')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('••••••••')).toBeInTheDocument();
  });

  it('切 HTTPS → username 消失且 port 保留（fields.port=optional，placeholder 443）', async () => {
    const events = userEvent.setup();
    renderModal({});

    await events.click(screen.getByRole('button', { name: 'HTTPS' }));
    expect(screen.queryByPlaceholderText('root / administrator')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('443')).toBeInTheDocument();
  });

  it('切 VNC → port 预填 5900（registry defaultPort 裁量值）', async () => {
    const events = userEvent.setup();
    renderModal({});

    await events.click(screen.getByRole('button', { name: 'VNC' }));
    expect((screen.getByPlaceholderText('5900') as HTMLInputElement).value).toBe('5900');
  });

  // 回归锁：字段显隐不得被 HOST registry 跨表单驱动（review major——VPN tab 曾冒出 Port 输入框）
  it('VPN tab 表单无 port 字段（显隐 mode 守卫回归）', async () => {
    const events = userEvent.setup();
    renderModal({});

    await events.click(screen.getByRole('button', { name: /VPN 节点 \/ 网关/ }));
    expect(screen.queryByPlaceholderText('3389')).not.toBeInTheDocument();
  });

  it('编辑 TODESK 连接切 VPN tab：username 可见且无 port 字段（跨表单显隐回归）', async () => {
    const events = userEvent.setup();
    renderModal({
      editingConnection: detail({ protocol: 'TODESK', port: null, username: null, host: '882 331 992' }),
    });

    await events.click(screen.getByRole('button', { name: /VPN 节点 \/ 网关/ }));
    expect(screen.getByPlaceholderText('root / administrator')).toBeInTheDocument(); // VPN tab username 恒显示（v1 行为）
    expect(screen.queryByPlaceholderText('3389')).not.toBeInTheDocument();
  });

  it('存量设备码协议行带脏 port 编辑保存 → payload 强制 port=null（port:none 防御，review M1）', async () => {
    // 存量脏数据：TODESK 行带 port=3389（registry 上线前的遗留行）——表单无 port 框可自救，
    // buildPayload 必须强制清 port，否则后端 registry 校验 VAL_001 400 死锁
    const dirty = detail({ protocol: 'TODESK', port: 3389, host: '882 331 992', username: null });
    const onSave = vi.fn().mockResolvedValue(detail({ ...dirty, id: 'c9' }));
    const events = userEvent.setup();
    renderModal({ onSave, editingConnection: dirty });

    await events.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls[0]?.[0]).toMatchObject({ protocol: 'TODESK', port: null, host: '882 331 992' });
  });
});

// ── 批 13b B3：编辑态 username:'none' 协议遗留哨兵清值（OQ 挂账批 8）──
// 存量 HTTPS/TODESK 行历史 username='none' 回填后输入框隐藏（fields.username='none'），
// 用户不可见不可改、静默重提交永不清——提交时按协议 registry 单一真相源判定清成 null。
// 只清 'none' 遗留哨兵：可见 username 协议（RDP 等）用户真输入的 "none" 字符串不受影响。
describe("ConnectionModal username:'none' 遗留哨兵清值（批 13b B3）", () => {
  it('编辑 HTTPS 行存量 username=none（输入框隐藏）→ 提交 payload.username=null', async () => {
    // 存量脏数据形态：HTTPS 行 username='none'（哨兵），表单无 username 框可自救
    const legacy = detail({ protocol: 'HTTPS', port: 443, username: 'none', host: 'intranet.corp' });
    const onSave = vi.fn().mockResolvedValue(detail(legacy));
    const events = userEvent.setup();
    renderModal({ onSave, editingConnection: legacy });

    // username 输入框隐藏——哨兵值用户不可见不可改（回填后静默残留的根源）
    expect(screen.queryByPlaceholderText('root / administrator')).not.toBeInTheDocument();
    await events.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((onSave.mock.calls[0]?.[0] as Record<string, unknown>).username).toBeNull();
  });

  it('编辑 TODESK 行存量 username=none → 同清（port:none 防御先例同构的存量自救）', async () => {
    const legacy = detail({ protocol: 'TODESK', port: null, username: 'none', host: '882 331 992' });
    const onSave = vi.fn().mockResolvedValue(detail(legacy));
    const events = userEvent.setup();
    renderModal({ onSave, editingConnection: legacy });

    await events.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((onSave.mock.calls[0]?.[0] as Record<string, unknown>).username).toBeNull();
  });

  it('可见 username 协议（RDP）用户真输入 none → 原样保留（只清隐藏类哨兵，不碰真实输入）', async () => {
    const onSave = vi.fn().mockResolvedValue(detail());
    const events = userEvent.setup();
    renderModal({ onSave, editingConnection: detail({ protocol: 'RDP', username: 'realuser' }) });

    // RDP 的 username 输入框可见——用户清空后手动输入字面量 "none" 是真实数据
    const usernameInput = screen.getByPlaceholderText('root / administrator');
    await events.clear(usernameInput);
    await events.type(usernameInput, 'none');
    await events.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((onSave.mock.calls[0]?.[0] as Record<string, unknown>).username).toBe('none');
  });
});

// ── #44 编辑换项目 + 密码清空 ──
// 编辑态开放所属项目下拉（换项目 = updateConnection 显式传 projectId，后端校验目标项目写权）；
// 密码「清空密码」显式按钮（clearPassword 标记 → 提交 password:null）与「留空=不变」严格区分。
describe('ConnectionModal 编辑换项目 + 密码清空（#44）', () => {
  const projects2 = [
    { id: 'p1', name: '默认项目', icon: 'folder', createdBy: user, updatedBy: user, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    { id: 'p2', name: '目标项目', icon: 'folder', createdBy: user, updatedBy: user, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
  ] as ProjectListItem[];

  it('编辑态项目下拉解锁：改选 p2 → payload.projectId=p2（换项目提交）', async () => {
    const onSave = vi.fn().mockResolvedValue(detail());
    const events = userEvent.setup();
    renderModal({ onSave, projects: projects2, editingConnection: detail() });

    const select = screen.getByDisplayValue('默认项目');
    expect(select).not.toBeDisabled();
    await events.selectOptions(select, 'p2');

    await events.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((onSave.mock.calls[0]?.[0] as Record<string, unknown>).projectId).toBe('p2');
  });

  it('清空密码按钮：hasPassword 连接点击后提交 password=null（显式清空）', async () => {
    const onSave = vi.fn().mockResolvedValue(detail());
    const events = userEvent.setup();
    renderModal({ onSave, editingConnection: detail({ hasPassword: true }) });

    await events.click(screen.getByRole('button', { name: '清空密码' }));
    expect(screen.getByPlaceholderText('将清空已存密码')).toBeInTheDocument();

    await events.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect((onSave.mock.calls[0]?.[0] as Record<string, unknown>).password).toBeNull();
  });

  it('清空标记后再输入新密码 → password 提交输入值（标记被输入复位）', async () => {
    const onSave = vi.fn().mockResolvedValue(detail());
    const events = userEvent.setup();
    renderModal({ onSave, editingConnection: detail({ hasPassword: true }) });

    await events.click(screen.getByRole('button', { name: '清空密码' }));
    await events.type(screen.getByPlaceholderText('将清空已存密码'), 'newpass');
    await events.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const payload = onSave.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.password).toBe('newpass');
  });

  it('无密码连接不显示清空按钮（hasPassword=false）', () => {
    renderModal({ editingConnection: detail({ hasPassword: false }) });
    expect(screen.queryByRole('button', { name: '清空密码' })).not.toBeInTheDocument();
  });

  it('跨项目 VPN 警示：换项目后选中源项目 VPN → 警示出现，切回消失', async () => {
    const events = userEvent.setup();
    renderModal({ projects: projects2, editingConnection: detail({ requiredVpnId: 'vpn-1' }) });
    const select = screen.getByDisplayValue('默认项目');
    await events.selectOptions(select, 'p2');
    expect(screen.getByText(/所选 VPN 属于其他项目/)).toBeInTheDocument();
    await events.selectOptions(select, 'p1');
    expect(screen.queryByText(/所选 VPN 属于其他项目/)).not.toBeInTheDocument();
  });
});
