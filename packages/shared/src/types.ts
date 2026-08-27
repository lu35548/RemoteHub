import type { Protocol, VpnType, UserRole, MemberRole } from './enums.js';

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface DeleteResponse {
  success: true;
  data: { id: string };
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: UserPublic;
}

export interface RegisterRequest {
  username: string;
  nickname: string;
  password: string;
  role?: UserRole;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  nickname: string;
}

export interface UserPublic {
  id: string;
  username: string;
  nickname: string;
  role: UserRole;
  isActive: boolean;
  lastActiveAt: string | null;
  createdAt: string;
}

export type UserListItem = UserPublic;

export interface AdminUpdateUserRequest {
  nickname?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UserSearchResult {
  id: string;
  username: string;
  nickname: string;
}

export interface ProjectListItem {
  id: string;
  name: string;
  icon: string;
  createdBy: { id: string; nickname: string };
  updatedBy: { id: string; nickname: string };
  createdAt: string;
  updatedAt: string;
  currentUserRole?: MemberRole;
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  createdBy: { id: string; nickname: string };
  updatedBy: { id: string; nickname: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  icon?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  icon?: string;
}

export interface MemberListItem {
  id: string;
  userId: string;
  role: MemberRole;
  addedAt: string;
  username: string;
  nickname: string;
}

export interface AddMemberRequest {
  userId: string;
  role: MemberRole;
}

export interface UpdateMemberRoleRequest {
  role: MemberRole;
}

export interface ConnectionListItem {
  id: string;
  projectId: string;
  project: { id: string; name: string };
  name: string;
  host: string;
  port: number | null;
  username: string | null;
  protocol: Protocol;
  vpnType: VpnType | null;
  requiredVpnId: string | null;
  hasPassword: boolean;
  tags: string | null;
  lastAccessed: string | null;
  createdBy: { id: string; nickname: string };
  updatedBy: { id: string; nickname: string };
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionDetail {
  id: string;
  projectId: string;
  name: string;
  host: string;
  port: number | null;
  username: string | null;
  protocol: Protocol;
  vpnType: VpnType | null;
  vpnLoginUrl: string | null;
  requiredVpnId: string | null;
  notes: string | null;
  tags: string | null;
  lastAccessed: string | null;
  createdBy: { id: string; nickname: string };
  updatedBy: { id: string; nickname: string };
  createdAt: string;
  updatedAt: string;
  encryptedPass?: string | null;
}

export interface CreateConnectionRequest {
  projectId: string;
  name: string;
  host: string;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  protocol: Protocol;
  vpnType?: VpnType | null;
  vpnLoginUrl?: string | null;
  requiredVpnId?: string | null;
  notes?: string | null;
  tags?: string | null;
}

export interface UpdateConnectionRequest {
  name?: string;
  host?: string;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  protocol?: Protocol;
  vpnType?: VpnType | null;
  vpnLoginUrl?: string | null;
  requiredVpnId?: string | null;
  notes?: string | null;
  tags?: string | null;
}

export interface DecryptedPasswordResponse {
  password: string;
}
