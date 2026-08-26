// 枚举短码 → 中文显示文案（v1 enum 的文案值在 v2 拆为「机器码 + 展示层映射」）。
// 仅含 PROTOCOL：v2 的 vpnType 语义是 VPN 协议类型，与 v1 VpnType（登录方式：网页登录/客户端/L2TP）
// 是两个概念，T5 迁移 ConnectionModal 时按 shared 语义另行处理。
import type { Protocol } from '@remotehub/shared';

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
