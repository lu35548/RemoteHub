import { useQuery, useMutation, useInfiniteQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { API_BASE, api, ensureRefreshed, getAccessToken, setAccessToken, mfaRequest } from './client.js';
import { downloadBlob } from '../utils';
import type {
  ApiErrorResponse, ApiResponse, AuditLog, AuditLogQuery, LaunchCommandResponse, LaunchJsonResponse, LaunchUrlResponse,
  LoginRequest, LoginResponse, UserPublic,
  Dashboard, DailyActivityStat, ProjectConnectionStat,
  ProjectListItem, ProjectDetail, CreateProjectRequest, UpdateProjectRequest,
  ConnectionListItem, ConnectionDetail, CreateConnectionRequest, UpdateConnectionRequest,
  ConnectionListQuery, ConnectionStats,
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

export function useProjects(page = 1, pageSize = 20, q?: string, enabled = true) {
  // B2（批 13b）：q 参数化——Sidebar 搜索走服务端（批 10 OQ「>100 项目搜索只搜当前 100 条静默缩窄」修复）。
  // q trim 归一：空白串与未传同 key 同 URL（条件展开无尾元素，不产生独立缓存条目）；
  // URL 仅在非空时拼 &q=（encodeURIComponent）；enabled 第 4 参是 Sidebar 搜索态门（非搜索态停查，
  // App 层旧调用缺省 true 零影响）。底表调用（App 固定 page=1）不带 q——依赖查找全量口径不变。
  const normalizedQ = q?.trim() ?? '';
  return useQuery({
    queryKey: ['projects', page, pageSize, ...(normalizedQ ? [normalizedQ] : [])],
    queryFn: () => api.getRaw<PaginatedResponse<ProjectListItem>>(
      `/projects?page=${page}&pageSize=${pageSize}${normalizedQ ? `&q=${encodeURIComponent(normalizedQ)}` : ''}`,
    ),
    // M1（#49 rev）：翻页拉新数据期间保持上一页 data 渲染（isPlaceholderData），消除闪空态/footer 闪没；
    // 底表调用（固定 1,100）key 恒同不触发此行为，无害
    placeholderData: keepPreviousData,
    enabled,
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

// ─── #48 项目管理增强（归档/恢复/复制/转让）───
// API 形状两个事实（读 #47 backend projectService 定案，非猜测）：
// ① 列表项/详情均含 status（'active'|'archived' 纯 string）——shared 类型本批被 #50 独占，
//    走本地镜像（BackupListItem 先例），合流后迁 shared；
// ② copy 响应 = detail + clonedFrom + connectionCount（toast「含 N 个连接」消费 connectionCount）。

/** 项目 status 值域（spec §12：active/archived；后端纯 string，SQLite 方言禁 VarChar） */
export type ProjectStatusValue = 'active' | 'archived';

/** 项目列表项 + status（本地镜像 API 形状，#47 后端 select 直出） */
export interface ProjectListItemWithStatus extends ProjectListItem {
  status: ProjectStatusValue;
}

/** 项目详情 + status（archive/restore/copy 响应体） */
export interface ProjectDetailWithStatus extends ProjectDetail {
  status: ProjectStatusValue;
}

/** POST /projects/:id/copy 响应（深拷贝副本：恒 active + clonedFrom + 连接数） */
export interface ProjectCopyResult extends ProjectDetailWithStatus {
  clonedFrom: string;
  connectionCount: number;
}

/** POST /projects/:id/transfer-ownership 响应（fromUserId=原 owner，toUserId=新 owner） */
export interface ProjectTransferResult {
  projectId: string;
  fromUserId: string;
  toUserId: string;
}

/** 归档项目列表（分页端点走 getRaw）。queryKey 挂 ['projects','archived',…] 子族——
 * invalidateQueries(['projects']) 前缀匹配同时刷新主列表与归档列表（归档/恢复后两侧同步）。 */
export function useArchivedProjects(page = 1, pageSize = 100) {
  return useQuery({
    queryKey: ['projects', 'archived', page, pageSize],
    queryFn: () => api.getRaw<PaginatedResponse<ProjectListItemWithStatus>>(`/projects?page=${page}&pageSize=${pageSize}&archived=true`),
    // 翻页拉新数据期间保持上一页 data 渲染（#49 分页 hooks 同口径）
    placeholderData: keepPreviousData,
  });
}

/** 归档（POST /:id/archive）：已归档再归档=幂等成功；成功后主列表/归档列表双刷新 */
export function useArchiveProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ProjectDetailWithStatus>(`/projects/${id}/archive`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

/** 恢复（POST /:id/restore）：已 active 再恢复=幂等成功 */
export function useRestoreProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ProjectDetailWithStatus>(`/projects/${id}/restore`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

/** 复制（POST /:id/copy，201）：副本恒 active、「(副本)」递增避重名；响应含 connectionCount 供 toast */
export function useCopyProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ProjectCopyResult>(`/projects/${id}/copy`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

/** 转让所有权（POST /:id/transfer-ownership，body {userId}）：原 owner 降 editor——
 * 项目列表 currentUserRole 与成员列表角色徽章随之变化，两族缓存都失效 */
export function useTransferProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, userId }: { projectId: string; userId: string }) =>
      api.post<ProjectTransferResult>(`/projects/${projectId}/transfer-ownership`, { userId }),
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['projects'] });
      void qc.invalidateQueries({ queryKey: ['members', vars.projectId] });
    },
  });
}

// ─── 批 13b 项目批量操作（C1 管理后台项目页消费）───
// 响应两个事实（读 backend projectService 定案，非猜测）：
// ① batch-archive → { archived: string[], skipped: string[] }（archived=成功集 id 数组）；
// ② batch-restore → { restored: string[], skipped: string[] }（键名 restored 与 archive 不同——非镜像字段名）。
// skipped=无权/不存在/状态已一致（幂等跳过），尽力而为语义不整体 404；上限 50（BATCH_ARCHIVE_MAX）。

/** 批量归档响应（archived=成功归档的项目 id 数组） */
export interface BatchArchiveResultData {
  archived: string[];
  skipped: string[];
}

/** 批量恢复响应（restored=成功恢复的项目 id 数组；键名与 archive 侧不同） */
export interface BatchRestoreResultData {
  restored: string[];
  skipped: string[];
}

/** 批量归档（POST /projects/batch-archive，body { ids }）：成功后 invalidate ['projects'] 全族
 * （工作台主列表/归档列表/管理页双 tab 同步刷新） */
export function useBatchArchive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post<BatchArchiveResultData>('/projects/batch-archive', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

/** 批量恢复（POST /projects/batch-restore，body { ids }）：失效口径同归档 */
export function useBatchRestore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post<BatchRestoreResultData>('/projects/batch-restore', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// ─── Connections ───

/** #42 连接列表 URL 拼 query：只拼已设置项，键序固定（projectId→tags→q→sort，对齐审计页 auditLogParams 模式）。
 * tags（批 13b C2 多选）：逗号串直传（App 层 join(',')，空数组不拼键），服务端多值 OR 过滤 */
function connectionListParams(
  filters: Omit<ConnectionListQuery, 'page' | 'pageSize'>,
  page: number,
  pageSize: number,
): string {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  for (const key of ['projectId', 'tags', 'q', 'sort'] as const) {
    const v = filters[key];
    if (v) params.set(key, v);
  }
  return params.toString();
}

/** 连接列表（#41 服务端过滤：tags 多值 OR（批 13b C2 替换旧 tag 单值）/ q 三字段模糊 / sort=lastAccessed）。
 * queryKey 用结构化 filters 对象——#49 分页票在此形状上追加 page/pageSize 即可，无破坏性改 key。 */
export function useConnections(filters: Omit<ConnectionListQuery, 'page' | 'pageSize'> = {}, page = 1, pageSize = 100) {
  return useQuery({
    queryKey: ['connections', filters, page, pageSize],
    queryFn: () => api.getRaw<PaginatedResponse<ConnectionListItem>>(`/connections?${connectionListParams(filters, page, pageSize)}`),
    // M1（#49 rev）：同 useProjects——翻页/切过滤期间保持旧 data 渲染；底表调用（{} 固定）不受影响
    placeholderData: keepPreviousData,
  });
}

/** #42 项目连接统计（#41 落地端点）：协议分布 + tag 计数。
 * data 壳端点走 api.get（与分页 getRaw 相反）；projectId 空（全局视图）停查——端点是 per-project。
 * staleTime 5 分钟与 /admin 监控端点同口径；连接 CRUD 后由 mutation onSuccess invalidate。 */
export function useConnectionStats(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['connection-stats', projectId],
    queryFn: () => api.get<ConnectionStats>(`/projects/${projectId}/connections/stats`),
    enabled: !!projectId,
    staleTime: 5 * 60_000,
  });
}

/** 批 13b C3 全局视图协议分布（GET /connections/stats，批 13b-A4 端点）：聚合用户可见活跃项目
 * （admin=全部活跃/非 admin=已加入，可见性口径对齐 listProjects；归档项目不计入）。
 * data 壳端点走 api.get（与 per-project stats 同口径）；响应复用 shared ConnectionStats（双聚合编译期锁契约）。
 * 失效联动零新增：连接 CRUD 的 invalidateConnectionCaches 按 ['connection-stats'] 前缀失效，
 * 全局 key（['connection-stats','global']）与 per-project 同前缀族自动覆盖。 */
export function useGlobalConnectionStats() {
  return useQuery({
    queryKey: ['connection-stats', 'global'],
    queryFn: () => api.get<ConnectionStats>('/connections/stats'),
    staleTime: 5 * 60_000,
  });
}

export function useConnection(id: string) {
  return useQuery({
    queryKey: ['connections', id],
    queryFn: () => api.get<ConnectionDetail>(`/connections/${id}`),
    enabled: !!id,
  });
}

/** 连接 CRUD 成功后统一失效：列表 + 项目统计（协议/tag 计数随增删改变） */
function invalidateConnectionCaches(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ['connections'] });
  void qc.invalidateQueries({ queryKey: ['connection-stats'] });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateConnectionRequest) => api.post<ConnectionDetail>('/connections', data),
    onSuccess: () => invalidateConnectionCaches(qc),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateConnectionRequest }) =>
      api.patch<ConnectionDetail>(`/connections/${id}`, data),
    onSuccess: () => invalidateConnectionCaches(qc),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/connections/${id}`),
    onSuccess: () => invalidateConnectionCaches(qc),
  });
}

export function useDecryptPassword() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ password: string }>(`/connections/${id}/decrypt-password`),
  });
}

/** #43 克隆连接（POST /connections/:id/clone）：密文服务端复制不过前端，返回新连接 detail
 * （clonedFrom 携带来源 id）。克隆即新建——成功后失效连接列表与统计两族缓存（同 CRUD 先例）。 */
export function useCloneConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ConnectionDetail>(`/connections/${id}/clone`),
    onSuccess: () => invalidateConnectionCaches(qc),
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

// pageSize=100 与后端 MAX_PAGE_SIZE 同口径（#49 分页消费：page 受控翻页）；enabled 供弹窗按需加载（打开且 admin 才请求）
export function useUsers(page = 1, enabled = true) {
  return useQuery({
    queryKey: ['users', page],
    queryFn: () => api.getRaw<PaginatedResponse<UserListItem>>(`/users?page=${page}&pageSize=100`),
    enabled,
    // M1（#49 rev）：翻页拉新数据期间保持上一页 data 渲染
    placeholderData: keepPreviousData,
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

/** 直连动作结果 union（#46）：rdp_file 的 Blob 下载已在函数内完成（downloadBlob），调用方只做 toast。
 * JSON 两形态直接消费 shared 契约类型（review M2：删本地重复声明，单一真相源）。 */
export type LaunchConnectionResult =
  | { type: 'rdp_file'; filename: string }
  | LaunchCommandResponse
  | LaunchUrlResponse;

/** #46 一键直连：GET /connections/:id/launch 双形态响应解析。
 * application/x-rdp → Blob 真链路下载（文件流走手动 fetch，api 封装只解 JSON 不返回 blob）；
 * JSON → 剥统一响应壳返回 union。401 与统一客户端同口径（ensureRefreshed 重试一次）；
 * 错误抛 Error 且携带 error.code（组件层判 CONN_006 出「不支持直连」中文 toast）。 */
export async function launchConnection(id: string): Promise<LaunchConnectionResult> {
  const url = `${API_BASE}/connections/${id}/launch`;
  const doFetch = (token: string | null) =>
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' });
  let res = await doFetch(getAccessToken());
  if (res.status === 401) {
    const newToken = await ensureRefreshed();
    if (newToken) res = await doFetch(newToken);
  }
  if (!res.ok) {
    let message = '获取直连指令失败';
    let code: string | undefined;
    try {
      const body: unknown = await res.json();
      message = (body as ApiErrorResponse)?.error?.message || message;
      code = (body as ApiErrorResponse)?.error?.code;
    } catch {
      // 错误响应非 JSON（如网关 502）→ 中文兜底
    }
    throw Object.assign(new Error(message), { code });
  }
  const contentType = res.headers.get('Content-Type') ?? '';
  if (contentType.includes('application/x-rdp')) {
    // RFC 5987 双写文件名：filename* UTF-8 优先（中文原名），退 ASCII filename；都无 → connection-<id>.rdp
    const disposition = res.headers.get('Content-Disposition') ?? '';
    const utf8Name = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const asciiName = disposition.match(/filename="([^"]+)"/)?.[1];
    const filename = utf8Name ? decodeURIComponent(utf8Name) : asciiName || `connection-${id}.rdp`;
    downloadBlob(await res.blob(), filename);
    return { type: 'rdp_file', filename };
  }
  // JSON 分支 cast shared LaunchJsonResponse（契约必填字段，不兜空串——后端缺字段就该暴露，review M2）
  const body = (await res.json()) as ApiResponse<LaunchJsonResponse>;
  return body.data;
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

/** #54 下拉「加载更多」分页大小（= 后端 DEFAULT_PAGE_SIZE；角标走 pagination.total 与页大小无关） */
const NOTIFICATIONS_PAGE_SIZE = 20;

/**
 * 未读通知列表（分页端点：响应含 pagination，走不剥壳的 getRaw——分页双轨惯例，选错两层 mock 测不出）。
 * #54 改 infinite（加载更多 append）；缓存键沿用 NOTIFICATION_QUERY_KEY——WS 派发层（notificationDispatch）
 * 的 setQueryData/invalidateQueries 按 key 前缀命中，InfiniteData 形状由派发层同步适配。
 * 角标取首页 pagination.total（每页响应携带同一未读总数）。
 */
export function useNotifications() {
  return useInfiniteQuery({
    queryKey: NOTIFICATION_QUERY_KEY,
    queryFn: async ({ pageParam }): Promise<PaginatedResponse<NotificationItem>> => {
      const page = typeof pageParam === 'number' && pageParam >= 1 ? pageParam : 1;
      const raw = await api.getRaw<PaginatedResponse<NotificationRow>>(`/notifications?page=${page}&pageSize=${NOTIFICATIONS_PAGE_SIZE}`);
      return { ...raw, data: raw.data.map(parseNotificationRow) };
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, pageSize, total } = lastPage.pagination;
      return page * pageSize < total ? page + 1 : undefined;
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

/** #54 全部已读（POST 无 body）；成功后 invalidate → 角标归零 + 列表清空（服务端为准） */
export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_QUERY_KEY }),
  });
}

// ─── Backups（#39 备份管理页）─────────────────────────────────────────
// 两个 API 事实（读 #38 后端真源定案，非猜测）：
// ① GET /admin/backups 是非分页端点（listBackupsHandler 直出纯数组，无 pagination 包裹）
//   → queryFn 走剥壳的 api.get（与 audit-logs 分页 getRaw 相反）；
// ② 元数据口径（2026-11-04 用户裁决「文件即真相」）：列表只有 filename/sizeBytes/createdAt
//   （stat 实时读），无状态字段——状态语义由通知历史承载（BACKUP_COMPLETED/FAILED），本页不轮询。

/** 备份列表项（本地镜像 API 形状，shared 本批被独占；合流后可迁 shared） */
export interface BackupListItem {
  filename: string;
  sizeBytes: number;
  createdAt: string; // ISO 时间（stat.mtimeMs）
}

/** POST /admin/backups 响应（本地镜像；controller 不外露服务器 path） */
export interface BackupTriggerResult {
  filename: string;
  sizeBytes: number;
  durationMs: number;
}

/** 备份列表缓存键（触发成功后 invalidate 共用，防 key 漂移） */
export const BACKUP_QUERY_KEY = ['admin-backups'] as const;

/** 备份列表（后端已按文件名时间戳倒序返回；staleTime 与 /admin 监控端点同口径 5 分钟） */
export function useAdminBackups() {
  return useQuery({
    queryKey: BACKUP_QUERY_KEY,
    queryFn: () => api.get<BackupListItem[]>('/admin/backups'),
    staleTime: 5 * 60_000,
  });
}

/** 手动触发备份（无 body POST）；成功后 invalidate 列表——新文件即现，文件即真相无需轮询 */
export function useTriggerBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<BackupTriggerResult>('/admin/backups'),
    onSuccess: () => qc.invalidateQueries({ queryKey: BACKUP_QUERY_KEY }),
  });
}

/** 下载备份：文件流走手动 fetch（同 exportAuditLogsCsv 链路）→ downloadBlob 以行内 filename 落盘 */
export async function downloadBackup(filename: string): Promise<void> {
  const url = `${API_BASE}/admin/backups/${encodeURIComponent(filename)}/download`;
  const doFetch = (token: string | null) =>
    fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {}, credentials: 'include' });
  // 401 与统一客户端同口径：ensureRefreshed 后重试一次（仍失败落下方错误分支，toast 呈现）
  let res = await doFetch(getAccessToken());
  if (res.status === 401) {
    const newToken = await ensureRefreshed();
    if (newToken) res = await doFetch(newToken);
  }
  if (!res.ok) {
    let message = '下载失败';
    try {
      const body: unknown = await res.json();
      message = (body as ApiErrorResponse)?.error?.message || message;
    } catch {
      // 错误响应非 JSON（如网关 502）→ 中文兜底
    }
    throw new Error(message);
  }
  downloadBlob(await res.blob(), filename);
}
