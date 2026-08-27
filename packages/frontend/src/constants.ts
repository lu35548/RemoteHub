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

// v1 utils.getProtocolColor 等价迁移：case 值从中文文案改 v2 短码
export const getProtocolColor = (protocol: Protocol): string => {
  switch (protocol) {
    case 'RDP': return 'text-blue-400 bg-blue-500/10 border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)]';
    case 'SSH': return 'text-slate-200 bg-slate-700 border-slate-500 shadow-[0_0_10px_rgba(148,163,184,0.2)]';
    case 'TODESK': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]';
    case 'VPN': return 'text-indigo-400 bg-indigo-500/10 border-indigo-500/50';
    default: return 'text-purple-400 bg-purple-500/10 border-purple-500/50';
  }
};
