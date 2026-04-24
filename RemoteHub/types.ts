
export enum Protocol {
  RDP = '桌面远程 (RDP)',
  SSH = 'SSH (Linux)',
  VNC = 'VNC / VDI',
  HTTPS = 'Web HTTPS',
  HTTP = 'Web HTTP',
  TODESK = 'ToDesk',
  SUNLOGIN = '向日葵 (Sunlogin)',
  TEAMVIEWER = 'TeamViewer',
  ANYDESK = 'AnyDesk',
  VPN = 'VPN'
}

export enum VpnType {
  WEB = '网页登录 (Web Login)',
  CLIENT = '客户端软件 (Client App)',
  OPENVPN = 'OpenVPN 配置文件',
  L2TP = 'L2TP/IPsec',
  WIREGUARD = 'WireGuard'
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user'
}

export interface User {
  id: string;
  username: string; 
  nickname: string;
  role: UserRole;
  passwordHash: string;
  lastActiveAt: number;
  createdAt: number;
}

export interface AuditMetadata {
  createdBy: string;
  createdById: string;
  createdAt: string;
  updatedBy: string;
  updatedById: string;
  updatedAt: string;
}

export interface Project extends AuditMetadata {
  id: string;
  name: string;
  description?: string;
  icon: string;
}

export interface RemoteConnection extends AuditMetadata {
  id: string;
  projectId: string;
  name: string;
  host: string;
  port?: number;
  username?: string;
  password?: string;
  protocol: Protocol;
  vpnType?: VpnType;
  vpnLoginUrl?: string;
  requiredVpnId?: string;
  notes?: string;
  tags?: string[];
  lastAccessed?: string;
}

// DTOs for Input (Forms) - Exclude server-managed audit fields
export type ProjectInput = Omit<Project, keyof AuditMetadata>;
export type ConnectionInput = Omit<RemoteConnection, keyof AuditMetadata>;

export type ToastType = 'success' | 'error' | 'info' | 'loading';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'info';
  onConfirm: () => void;
}

export interface UIContextType {
  toast: (type: ToastType, title: string, message?: string, duration?: number) => void;
  confirm: (options: ConfirmOptions) => void;
}
