export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 50;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

export const NICKNAME_MAX_LENGTH = 50;

export const PROJECT_NAME_MAX_LENGTH = 100;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 2000;

export const CONNECTION_NAME_MAX_LENGTH = 200;
export const HOST_MAX_LENGTH = 255;
export const PORT_MIN = 1;
export const PORT_MAX = 65535;
export const CONNECTION_PASSWORD_MAX_LENGTH = 200;
export const TAGS_MAX_LENGTH = 500;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const USER_SEARCH_MAX_RESULTS = 20;
export const USER_SEARCH_MIN_QUERY_LENGTH = 1;

export const REFRESH_CONCURRENT_WINDOW_SEC = 30;

export const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000;

export const LAST_ACCESSED_THROTTLE_MS = 5 * 60 * 1000;

export const PROJECT_ICONS = [
  'folder', 'server', 'cloud', 'database', 'monitor',
  'globe', 'lock', 'terminal', 'network', 'code',
] as const;
export type ProjectIcon = typeof PROJECT_ICONS[number];

export const NOTES_MAX_LENGTH = 2000;
export const VPN_LOGIN_URL_MAX_LENGTH = 500;

export function isIcon(value: string): value is ProjectIcon {
  return (PROJECT_ICONS as readonly string[]).includes(value);
}

export const ENCRYPTION_VERSION = 'v1';

// 审计脱敏字段：值替换为 [REDACTED]（保留字段名以标识变更）
export const SENSITIVE_FIELDS = new Set<string>(['passwordHash', 'encryptedPass', 'token', 'tokenHash']);
