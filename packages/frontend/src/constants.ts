// 枚举短码 → 中文显示文案（v1 enum 的文案值在 v2 拆为「机器码 + 展示层映射」）。
// 仅含 PROTOCOL：v2 的 vpnType 语义是 VPN 协议类型，与 v1 VpnType（登录方式：网页登录/客户端/L2TP）
// 是两个概念，T5 迁移 ConnectionModal 时按 shared 语义另行处理。
import type { Protocol, VpnType } from '@remotehub/shared';

// 协议族分类（ConnectionModal/ConnectionCard 共用的领域概念）
export const PROPRIETARY_PROTOCOLS: Protocol[] = ['TODESK', 'SUNLOGIN', 'TEAMVIEWER', 'ANYDESK'];
export const WEB_PROTOCOLS: Protocol[] = ['HTTP', 'HTTPS'];

// 卡片/预览用的协议短名（显式表，不依赖 PROTOCOL_LABELS 文案含空格的隐式约定）
export const PROTOCOL_SHORT_LABELS: Record<Protocol, string> = {
  RDP: '桌面远程',
  SSH: 'SSH',
  VNC: 'VNC',
  HTTP: 'HTTP',
  HTTPS: 'HTTPS',
  VPN: 'VPN',
  TODESK: 'ToDesk',
  SUNLOGIN: '向日葵',
  TEAMVIEWER: 'TeamViewer',
  ANYDESK: 'AnyDesk',
};

export const PROTOCOL_LABELS: Record<Protocol, string> = {
  RDP: '桌面远程 (RDP)',
  SSH: 'SSH (Linux)',
  VNC: 'VNC / VDI',
  HTTP: 'Web HTTP',
  HTTPS: 'Web HTTPS',
  VPN: 'VPN',
  TODESK: 'ToDesk',
  SUNLOGIN: '向日葵 (Sunlogin)',
  TEAMVIEWER: 'TeamViewer',
  ANYDESK: 'AnyDesk',
};

// v1 语义（登录方式）→ v2 枚举（协议类型）的展示映射，文案自拟贴近 v1 风格（notes T5 定型）
export const VPN_TYPE_LABELS: Record<VpnType, string> = {
  SSL_VPN: 'SSL VPN（网页认证）',
  IPSEC: 'IPsec / L2TP',
  WIREGUARD: 'WireGuard',
  OPENVPN: 'OpenVPN',
  OTHER: '其他客户端',
};

// v1 getProtocolColor 的 default 分支（无显式 case 的协议共用紫色调）
const DEFAULT_PROTOCOL_COLOR = 'text-purple-400 bg-purple-500/10 border-purple-500/50';

// 协议 → 动作/样式统一描述表（T6：合并散布于 getActionLabel/getProtocolColor/主按钮样式的协议分叉，
// 即 T5 review 的 Repeated Switches 遗留）。actionLabel=null 表示动作随 vpnType 分叉
// （VPN：SSL_VPN 跳转登录 / 其他复制地址）；neutralAction=true 对应 v1 主按钮的
// 「复制类」中性底色判断（isProprietary || VPN 的表化）。
export interface ProtocolActionMeta {
  actionLabel: string | null;
  neutralAction: boolean;
  color: string;
}

export const PROTOCOL_ACTION_META: Record<Protocol, ProtocolActionMeta> = {
  RDP: { actionLabel: '一键直连', neutralAction: false, color: 'text-blue-400 bg-blue-500/10 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]' },
  SSH: { actionLabel: '打开 SSH', neutralAction: false, color: 'text-slate-200 bg-slate-700 border-slate-500 shadow-[0_0_10px_rgba(148,163,184,0.2)]' },
  // VNC：v1 handleConnect 无 VNC 分支（按钮文案「连接」、点击无动作），等价保留
  VNC: { actionLabel: '连接', neutralAction: false, color: DEFAULT_PROTOCOL_COLOR },
  HTTP: { actionLabel: '打开网页', neutralAction: false, color: DEFAULT_PROTOCOL_COLOR },
  HTTPS: { actionLabel: '打开网页', neutralAction: false, color: DEFAULT_PROTOCOL_COLOR },
  VPN: { actionLabel: null, neutralAction: true, color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/50' },
  TODESK: { actionLabel: '复制设备码', neutralAction: true, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]' },
  SUNLOGIN: { actionLabel: '复制设备码', neutralAction: true, color: DEFAULT_PROTOCOL_COLOR },
  TEAMVIEWER: { actionLabel: '复制设备码', neutralAction: true, color: DEFAULT_PROTOCOL_COLOR },
  ANYDESK: { actionLabel: '复制设备码', neutralAction: true, color: DEFAULT_PROTOCOL_COLOR },
};

// v1 utils.getProtocolColor 等价迁移：改查统一描述表
export const getProtocolColor = (protocol: Protocol): string => PROTOCOL_ACTION_META[protocol].color;
