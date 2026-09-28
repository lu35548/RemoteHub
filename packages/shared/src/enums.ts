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

// 审计动作（design §14.2 全集移除 AUTH_REGISTER——spec 修正表 #13：建用户唯一入口 /auth/register 记 USER_CREATE）
export const AUDIT_ACTIONS = [
  'AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_PASSWORD_CHANGE', 'AUTH_PROFILE_UPDATE',
  'AUTH_PASSWORD_RESET_REQUEST', 'AUTH_PASSWORD_RESET',
  'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
  'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_DELETE',
  'MEMBER_ADD', 'MEMBER_UPDATE', 'MEMBER_REMOVE',
  'CONNECTION_CREATE', 'CONNECTION_UPDATE', 'CONNECTION_DELETE', 'CONNECTION_ACCESS',
  'SYSTEM_BACKUP', 'SYSTEM_RESTORE', 'SYSTEM_CONFIG_CHANGE',
  'SECURITY_SUSPICIOUS_IP',
] as const;
export type AuditAction = typeof AUDIT_ACTIONS[number];

export const AUDIT_RESOURCES = ['user', 'project', 'connection', 'member', 'system', 'security'] as const;
export type AuditResource = typeof AUDIT_RESOURCES[number];

export const AUDIT_RESULTS = ['success', 'failure'] as const;
export type AuditResult = typeof AUDIT_RESULTS[number];

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
export function isAuditAction(value: string): value is AuditAction {
  return (AUDIT_ACTIONS as readonly string[]).includes(value);
}
export function isAuditResource(value: string): value is AuditResource {
  return (AUDIT_RESOURCES as readonly string[]).includes(value);
}
export function isAuditResult(value: string): value is AuditResult {
  return (AUDIT_RESULTS as readonly string[]).includes(value);
}
// 通知类型（票 #35，NotificationQueue.type 值域）。相对 design §8.4 推送事件全集的偏离（裁决记录）：
// ①多 BACKUP_COMPLETED / BACKUP_FAILED——design 折在 SYSTEM_ALERT 说明栏，拆出独立值使 #36 备份事件类型更精确；
// ②无 reconnect_required——属瞬态 WS 控制消息，对离线排队无意义，不落 NotificationQueue。
export const NOTIFICATION_TYPES = [
  'FORCE_LOGOUT',
  'MEMBER_ADDED',
  'MEMBER_REMOVED',
  'MEMBER_ROLE_UPDATED',
  'BACKUP_COMPLETED',
  'BACKUP_FAILED',
  'SYSTEM_ALERT',
  'CONNECTION_UPDATED',
] as const;
export type NotificationType = typeof NOTIFICATION_TYPES[number];
