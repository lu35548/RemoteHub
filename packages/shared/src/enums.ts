export const PROTOCOLS = [
  'RDP', 'SSH', 'VNC',
  'HTTP', 'HTTPS',
  'VPN',
  'TODESK', 'SUNLOGIN',
  'TEAMVIEWER', 'ANYDESK',
] as const;
export type Protocol = typeof PROTOCOLS[number];

export const VPN_TYPES = ['SSL_VPN', 'IPSEC', 'WIREGUARD', 'OPENVPN', 'OTHER'] as const;
export type VpnType = typeof VPN_TYPES[number];

export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = typeof USER_ROLES[number];

export const MEMBER_ROLES = ['owner', 'editor', 'viewer'] as const;
export type MemberRole = typeof MEMBER_ROLES[number];

export function isProtocol(value: string): value is Protocol {
  return (PROTOCOLS as readonly string[]).includes(value);
}
export function isVpnType(value: string): value is VpnType {
  return (VPN_TYPES as readonly string[]).includes(value);
}
export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}
export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}
