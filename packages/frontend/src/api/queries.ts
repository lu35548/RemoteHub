import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { API_BASE, api, ensureRefreshed, getAccessToken, setAccessToken, mfaRequest } from './client.js';
import { downloadBlob } from '../utils';
import type {
  ApiErrorResponse, AuditLog, AuditLogQuery, LoginRequest, LoginResponse, UserPublic,
  Dashboard, DailyActivityStat, ProjectConnectionStat,
  ProjectListItem, ProjectDetail, CreateProjectRequest, UpdateProjectRequest,
  ConnectionListItem, ConnectionDetail, CreateConnectionRequest, UpdateConnectionRequest,
  MemberListItem, AddMemberRequest, UpdateMemberRoleRequest,
  UserListItem, AdminUpdateUserRequest, UserSearchResult, RegisterRequest,
  PaginatedResponse, ForgotPasswordRequest, ResetPasswordRequest, AdminResetLinkResponse,
  MfaPendingLoginResponse, MfaSetupResponse, MfaConfirmRequest, MfaConfirmResponse, MfaVerifyRequest,
  NotificationType,
} from '@remotehub/shared';

// ─── Auth ───

export function useLogin() {
  return useMutation({
    mutationFn: async (data: LoginRequest): Promise<LoginResponse | MfaPendingLoginResponse> => {
      const result = await api.post<LoginResponse | MfaPendingLoginResponse>('/auth/login', data);
      // 登录成功即持有内存 access token（refresh 由 httpOnly cookie 承载）；
      // mfaPending 响应无 accessToken 字段——挑战 token 走 mfaPending 内存态（票 #31）
      if ('accessToken' in result && result.accessToken) setAccessToken(result.accessToken);
      return result;
    },
  });
}

export function useMe() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<UserPublic>('/auth/me'),
    retry: false,
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  // 会话空窗修复（票 #29）：后端改密成功即撤 session + 清 cookie，内存 access token
  // 残留 ≤15 分钟空窗——onSuccess 主动清 token + 清缓存 + 跳登录页
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: { oldPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', data),
    onSuccess: () => {
      setAccessToken(null);
      qc.clear();
      navigate('/login');
    },
  });
}

/** POST /auth/forgot-password（票 #29）：统一成功响应，由页面层渲染固定文案 */
export function useForgotPassword() {
  return useMutation({
    mutationFn: (data: ForgotPasswordRequest) => api.post('/auth/forgot-password', data),
  });
}

/** POST /auth/reset-password（票 #29）：成功后同款会话空窗处理（清 token + 跳 /login） */
export function useResetPassword() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (data: ResetPasswordRequest) => api.post('/auth/reset-password', data),
    onSuccess: () => {
      setAccessToken(null);
      qc.clear();
      navigate('/login');
    },
  });
}

/** POST /admin/users/:id/reset-link（票 #29）：admin 代重置，返回一次性链接 */
export function useAdminResetLink() {
  return useMutation({
    mutationFn: (id: string) => api.post<AdminResetLinkResponse>(`/admin/users/${id}/reset-link`),
  });
}

// ─── 2FA（票 #31）：三端点走 mfaRequest 专用通道（aud:'mfa' 挑战 token）───

/** POST /auth/mfa/setup：发 secret + otpauth:// URI（绑定 phase 挂载时才拉取，retry 关闭——MFA_002 页面级重定向） */
export function useMfaSetup(enabled: boolean) {
  return useQuery({
    queryKey: ['mfa-setup'],
    queryFn: () => mfaRequest<MfaSetupResponse>('POST', '/auth/mfa/setup', {}),
    enabled,
    retry: false,
    // stateless POST（后端每次 new Secret）：窗口回焦/断线重连重取会静默换 secret，
    // 用户按旧 QR 提交动态码必 MFA_001——三闸全关，secret 仅在挂载时拉取一次（review F1）
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    staleTime: Infinity,
  });
}

/** POST /auth/mfa/confirm：校验一次 TOTP 落库 + 恢复码一次性返回 */
export function useMfaConfirm() {
  return useMutation({
    mutationFn: (data: MfaConfirmRequest) =>
      mfaRequest<MfaConfirmResponse>('POST', '/auth/mfa/confirm', data),
  });
}

/** POST /auth/mfa/verify：TOTP 或恢复码 → 换正式 token（成功即持有 access token，同 login 口径） */
export function useMfaVerify() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: MfaVerifyRequest): Promise<LoginResponse> => {
      const result = await mfaRequest<LoginResponse>('POST', '/auth/mfa/verify', data);
      setAccessToken(result.accessToken);
      return result;
    },
    onSuccess: () => {
      // secret 是敏感明文，验证成功即从 QueryClient 缓存移除（不滞留至 gc 5min，review F5）
      queryClient.removeQueries({ queryKey: ['mfa-setup'] });
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { nickname: string }) => api.patch<UserPublic>('/auth/profile', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => qc.clear(),
  });
}

// ─── Projects ───

export function useProjects(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['projects', page, pageSize],
    queryFn: () => api.getRaw<PaginatedResponse<ProjectListItem>>(`/projects?page=${page}&pageSize=${pageSize}`),
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.get<ProjectDetail>(`/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectRequest) => api.post<ProjectDetail>('/projects', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectRequest }) =>
      api.patch<ProjectDetail>(`/projects/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// ─── Connections ───

export function useConnections(projectId?: string, page = 1, pageSize = 100) {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (projectId) params.set('projectId', projectId);
  return useQuery({
    queryKey: ['connections', projectId, page],
    queryFn: () => api.getRaw<PaginatedResponse<ConnectionListItem>>(`/connections?${params}`),
  });
}

export function useConnection(id: string) {
  return useQuery({
    queryKey: ['connections', id],
    queryFn: () => api.get<ConnectionDetail>(`/connections/${id}`),
    enabled: !!id,
  });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateConnectionRequest) => api.post<ConnectionDetail>('/connections', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateConnectionRequest }) =>
      api.patch<ConnectionDetail>(`/connections/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/connections/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useDecryptPassword() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ password: string }>(`/connections/${id}/decrypt-password`),
  });
}

// ─── Members ───

export function useMembers(projectId: string, page = 1) {
  return useQuery({
    queryKey: ['members', projectId, page],
    queryFn: () => api.getRaw<PaginatedResponse<MemberListItem>>(`/projects/${projectId}/members?page=${page}`),
    enabled: !!projectId,
  });
}

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: AddMemberRequest }) =>
      api.post(`/projects/${projectId}/members`, data),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['members', vars.projectId] }),
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, uid, data }: { projectId: string; uid: string; data: UpdateMemberRoleRequest }) =>
      api.patch(`/projects/${projectId}/members/${uid}`, data),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['members', vars.projectId] }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, uid }: { projectId: string; uid: string }) =>
      api.delete(`/projects/${projectId}/members/${uid}`),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['members', vars.projectId] }),
  });
}

// ─── Users (Admin) ───

// pageSize=100 一次拉全（v1 全量列表等价，spec 决策 3）；enabled 供弹窗按需加载（打开且 admin 才请求）
export function useUsers(page = 1, enabled = true) {
  return useQuery({
    queryKey: ['users', page],
    queryFn: () => api.getRaw<PaginatedResponse<UserListItem>>(`/users?page=${page}&pageSize=100`),
    enabled,
  });
}

// v1 createUser 的 v2 等价端点：backend 无 POST /users，admin 建用户走 /auth/register（仅 admin，role 默认 user）
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: RegisterRequest) => api.post('/auth/register', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useSearchUsers(q: string) {
  return useQuery({
    queryKey: ['users', 'search', q],
    queryFn: async () => {
      const data = await api.get<UserSearchResult[]>(`/users/search?q=${encodeURIComponent(q)}`);
      return data;
    },
    enabled: q.length >= 1,
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AdminUpdateUserRequest }) =>
      api.patch(`/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

// ── /admin 监控端点（票 #22）───────────────────────────────────────────
// 监控读端点 staleTime 5 分钟覆盖 QueryClient 默认 30s：仪表盘数据非高频变化，
// 5min 内来回切页/刷新不重取（票面 AC「staleTime 5min 生效」）
export function useDashboard() {
  return useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<Dashboard>('/admin/dashboard'),
    staleTime: 5 * 60_000,
  });
}

export function useUserStats() {
  return useQuery({
    queryKey: ['admin-stats-users'],
    queryFn: () => api.get<DailyActivityStat[]>('/admin/stats/users'),
    staleTime: 5 * 60_000,
  });
}

// ─── Audit Logs（P0-9 审计页）──

/** 筛选参数 → URL query 串：只拼已设置项，键序固定（userId→…→result→page） */
function auditLogParams(filters: Omit<AuditLogQuery, 'page' | 'pageSize'>, page?: number): string {
  const params = new URLSearchParams();
  for (const key of ['userId', 'action', 'resource', 'startDate', 'endDate', 'result'] as const) {
    const v = filters[key];
    if (v) params.set(key, v);
  }
  if (page) params.set('page', String(page));
  return params.toString();
}

/** 审计日志列表（分页端点：响应含 pagination，须走不剥壳的 getRaw） */
export function useAuditLogs(filters: AuditLogQuery, page: number) {
  return useQuery({
    queryKey: ['audit-logs', filters, page],
    queryFn: () => api.getRaw<PaginatedResponse<AuditLog>>(`/audit-logs?${auditLogParams(filters, page)}`),
  });
}

/** CSV 导出：文件流走手动 fetch（api 封装只解 JSON 不返回 blob）→ downloadBlob 触发浏览器保存 */
export async function exportAuditLogsCsv(filters: Omit<AuditLogQuery, 'page' | 'pageSize'>): Promise<void> {
  const qs = auditLogParams(filters);
  const url = `${API_BASE}/audit-logs/export${qs ? `?${qs}` : ''}`;
  const doFetch = (token: string | null) =>
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' });
  // 401 与统一客户端同口径：ensureRefreshed 后重试一次（仍失败落下方错误分支，toast 呈现）
  let res = await doFetch(getAccessToken());
  if (res.status === 401) {
    const newToken = await ensureRefreshed();
    if (newToken) res = await doFetch(newToken);
  }
  if (!res.ok) {
    let message = '导出失败';
    try {
      const body: unknown = await res.json();
      message = (body as ApiErrorResponse)?.error?.message || message;
    } catch {
      // 错误响应非 JSON（如网关 502）→ 中文兜底
    }
    throw new Error(message);
  }
  downloadBlob(await res.blob(), 'audit-logs.csv');
}

export function useProjectStats() {
  return useQuery({
    queryKey: ['admin-stats-projects'],
    queryFn: () => api.get<ProjectConnectionStat[]>('/admin/stats/projects'),
    staleTime: 5 * 60_000,
  });
}

// ─── Notifications（票 #37 通知中心）───────────────────────────────────
// 两个 API 事实（读后端代码定案，非猜测）：
// ① PATCH /notifications/:id/read 无 body——notificationController.markRead 不读 req.body；
// ② GET /notifications 的 payload 是 Prisma String 列直出的 JSON 字符串（WS 推送才是已 parse 对象），
//    故 queryFn 在此归一化为对象，缓存内只有一种形状（WS 插入项同构）。

/** 通知项（缓存内形状：payload 已 parse；userId 为后端私有字段不入 UI 层） */
export interface NotificationItem {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

/** REST 原始行形状（notificationService 直出 Prisma 行） */
interface NotificationRow {
  id: string;
  type: NotificationType;
  payload: string;
  isRead: boolean;
  createdAt: string;
}

/** 通知列表缓存键（WS 派发层与列表 hook 共用，防 key 漂移） */
export const NOTIFICATION_QUERY_KEY = ['notifications'] as const;

/** REST 行 → 缓存项（payload 字符串 parse；脏数据兜底空对象，不让一条坏记录炸整个列表） */
function parseNotificationRow(row: NotificationRow): NotificationItem {
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.payload);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch { /* 脏 payload 兜底空对象 */ }
  return { id: row.id, type: row.type, payload, isRead: row.isRead, createdAt: row.createdAt };
}

/** 未读通知列表（分页端点：响应含 pagination，走不剥壳的 getRaw；total 驱动铃铛角标） */
export function useNotifications() {
  return useQuery({
    queryKey: NOTIFICATION_QUERY_KEY,
    queryFn: async (): Promise<PaginatedResponse<NotificationItem>> => {
      const raw = await api.getRaw<PaginatedResponse<NotificationRow>>('/notifications?page=1&pageSize=50');
      return { ...raw, data: raw.data.map(parseNotificationRow) };
    },
  });
}

/** 标记已读（PATCH 无 body）；成功后 invalidate 重拉未读列表（服务端为准） */
export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY }),
  });
}
