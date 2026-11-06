import type { Protocol, VpnType, UserRole, MemberRole, AuditAction, AuditResource, AuditResult } from './enums.js';

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

// ─── 2FA（票 #30 后端契约，票 #31 前端消费）───

/** 登录二段挑战：2FA enabled 用户密码通过后的响应 data（不签 access token、不建 session）。
 * mfaStage='setup'：admin 已开启但用户未绑定（首登强制绑定页）；'verify'：已完成绑定，直接挑战。 */
export interface MfaPendingLoginResponse {
  mfaPending: true;
  mfaStage: 'setup' | 'verify';
  /** aud:'mfa' 的短时挑战 token（15 分钟），仅用于 /auth/mfa/* 三端点 */
  mfaToken: string;
}

/** POST /auth/mfa/setup 响应 data：secret 供手输，otpauthUri 供前端渲染二维码 */
export interface MfaSetupResponse {
  secret: string;
  otpauthUri: string;
}

/** POST /auth/mfa/confirm 请求体：secret 来自 setup 响应（confirm 校验一次 TOTP 后才落库） */
export interface MfaConfirmRequest {
  secret: string;
  token: string;
}

/** POST /auth/mfa/confirm 响应 data：恢复码一次性返回，后端只存 hash */
export interface MfaConfirmResponse {
  recoveryCodes: string[];
}

/** POST /auth/mfa/verify 请求体：TOTP 6 位码或恢复码，二选一（都传时 TOTP 优先、恢复码兜底） */
export interface MfaVerifyRequest {
  token?: string;
  recoveryCode?: string;
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

// ─── 密码重置（票 #29 消费，端点契约见票 #28）───

/** POST /auth/forgot-password */
export interface ForgotPasswordRequest {
  username: string;
}

/** POST /auth/reset-password */
export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

/** POST /admin/users/:id/reset-link 响应 data */
export interface AdminResetLinkResponse {
  resetLink: string;
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
  /** 2FA 状态（票 #30 新增，可选字段向后兼容旧 mock/消费方） */
  twoFactorEnabled?: boolean;
}

export type UserListItem = UserPublic;

export interface AdminUpdateUserRequest {
  nickname?: string;
  role?: UserRole;
  isActive?: boolean;
  /** 2FA 开关（票 #30）：置 false 时后端清 totpSecret 并作废全部恢复码 */
  twoFactorEnabled?: boolean;
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
  /** #44 密码存在性（encryptedPass != null 派生）：编辑弹窗据此显示「清空密码」动作；
   * 克隆响应同样携带（克隆件编辑态密码存在性判断不依赖条件脱敏的 encryptedPass 字段） */
  hasPassword: boolean;
  /** #43 克隆来源连接 id（仅 POST /connections/:id/clone 响应携带；审计 detail.after 经响应体自动留痕） */
  clonedFrom?: string;
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
  /** #44 跨项目移动：显式传且 ≠ 当前值时后端校验目标项目写权（editor+）；不传/同值 = 不移动 */
  projectId?: string;
  name?: string;
  host?: string;
  port?: number | null;
  /** #44 显式清空信号：键存在且为 null/'' = 清空密文列（hasPassword 变 false）；键缺省 = 保持不变 */
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

// ─── 连接金矿（票 #41：tag 过滤 / 搜索 / 最近访问排序 / 统计）───

/** GET /connections 查询参数。
 * tag：精确匹配 tags 串中单个片段（包夹法，防 test 命中 test2；SQLite LIKE 家族对 ASCII 大小写不敏感）；
 * q：name/host/username 三字段模糊匹配（contains，同为 ASCII 大小写不敏感）；
 * sort：'lastAccessed' = 最近访问优先（NULL 殿后），缺省或其他值 = updatedAt desc。 */
export interface ConnectionListQuery {
  projectId?: string;
  tag?: string;
  q?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

/** GET /projects/:id/connections/stats 响应 data：按协议/标签聚合计数。
 * tags 为逗号分隔单串的 JS 侧拆分计数（空片段剔除、NULL 跳过、片段字面值不 trim）。 */
export interface ConnectionStats {
  protocols: Record<string, number>;
  tags: Record<string, number>;
}

// ─── 协议注册表直连（票 #45 后端 launch 分派，#46 前端消费）───

/** GET /connections/:id/launch 的 JSON 响应 data：命令串形态（SSH / 设备码协议）。
 * 设备码协议的 command 即设备码本身（host 列复用存设备 ID）；验证码不入本响应
 * （密码域，走 decrypt-password 独立通道）。 */
export interface LaunchCommandResponse {
  type: 'command';
  command: string;
}

/** GET /connections/:id/launch 的 JSON 响应 data：URL 形态（VPN/HTTP/HTTPS）。
 * VPN 取 vpnLoginUrl（无 scheme 时补 https://），缺省回退 https://host[:port]。 */
export interface LaunchUrlResponse {
  type: 'url';
  url: string;
}

/** launch JSON 两形态联合（RDP 为 .rdp 文件流，不在此类型内——响应无统一壳） */
export type LaunchJsonResponse = LaunchCommandResponse | LaunchUrlResponse;

export interface AuditLogDetail {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reason?: string;
}

export interface AuditLog {
  id: string;
  username: string | null; // 操作人显示名（服务端 join user 表；userId null（系统/SECURITY_*）→ null，前端显示「系统」）
  userId: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  result: AuditResult;
  detail: AuditLogDetail | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogQuery {
  userId?: string;
  action?: AuditAction;
  resource?: AuditResource;
  startDate?: string;
  endDate?: string;
  result?: AuditResult;
  page?: number;
  pageSize?: number;
}

// ─── 系统监控（P0-6，票 #20）───

/** 健康快照（/health 与 dashboard.health 同构）。百分比字段一位小数；diskUsage -1 = 探测失败（前端显示「未知」）。 */
export interface SystemHealth {
  status: 'healthy' | 'degraded';
  database: boolean;
  diskUsage: number;
  memoryUsage: number;
  uptime: number;
}

export interface DashboardStats {
  totalProjects: number;
  totalConnections: number;
  totalUsers: number;
}

/** 仪表盘聚合（recentActivity 全量含 failure 与安全事件——活动流口径）。 */
export interface Dashboard {
  health: SystemHealth;
  onlineUsers: number;
  stats: DashboardStats;
  recentActivity: AuditLog[];
}

/** 活跃趋势单日桶（result='success' 仅成功——趋势口径）。 */
export interface DailyActivityStat {
  date: string; // 'YYYY-MM-DD'（UTC 日界）
  logins: number;
  operations: number;
}

export interface ProjectConnectionStat {
  projectId: string;
  projectName: string;
  connectionCount: number;
}

// ─── 性能监控（P1，票 #32）───

/** 单路由模板延迟统计（窗口 = 环形缓冲容量内最近样本；count 为进程生命周期累计请求数）。
 *  route 为路由模板（如 /api/v1/projects/:id）防高基数；unmatched = 未匹配路由的请求（404 等）。 */
export interface RoutePerformanceStat {
  route: string;
  count: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
}

/** API 性能统计（/admin/stats/performance）。routes 顺序为路由首次记录序；bufferSize 暴露窗口容量语义。 */
export interface PerformanceStats {
  routes: RoutePerformanceStat[];
  bufferSize: number;
  uptimeSeconds: number;
}

// ─── 数据导入导出（票 #50，admin 门禁；spec §14）───

/** 导出文件内单条用户。passwordHash 永不入导出文件（票面红线）；totpSecret 为 AES-256-GCM
 * 密文（#30 encrypt 存储），同 KEY 前提下原样搬运导入后可直接解密验证。 */
export interface ExportUser {
  id: string;
  username: string;
  nickname: string;
  role: UserRole;
  isActive: boolean;
  twoFactorEnabled: boolean;
  totpSecret: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 导出文件内单条项目（含 #47 status 字段）。createdBy/updatedBy 为用户 id 原值（导入按 id 恢复引用）。 */
export interface ExportProject {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  status: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 导出文件内单条连接。encryptedPass 密文字文原样搬运（同 KEY 前提，不重加密）；
 * requiredVpnId 保留原 id，导入两阶段回填（自引用依赖）。 */
export interface ExportConnection {
  id: string;
  projectId: string;
  name: string;
  host: string;
  port: number | null;
  username: string | null;
  encryptedPass: string | null;
  protocol: Protocol;
  vpnType: VpnType | null;
  vpnLoginUrl: string | null;
  requiredVpnId: string | null;
  notes: string | null;
  tags: string | null;
  lastAccessed: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 导出文件内单条项目成员。 */
export interface ExportMember {
  id: string;
  projectId: string;
  userId: string;
  role: MemberRole;
  addedAt: string;
}

/** POST /admin/export 响应 data = 导出文件全文（前端自行落盘为 .json）。
 * 审计日志表不含（AuditLog 不导出）；encryptionKeyFingerprint 供导入端校验（不匹配 422 拒绝）。 */
export interface ExportData {
  version: 1;
  exportedAt: string;
  /** ENCRYPTION_KEY 的 SHA-256 前 8 hex（base64 解码后字节口径） */
  encryptionKeyFingerprint: string;
  users: ExportUser[];
  projects: ExportProject[];
  connections: ExportConnection[];
  members: ExportMember[];
}

/** POST /admin/import 响应 data：事务 upsert 计数。 */
export interface ImportResult {
  projects: number;
  connections: number;
  members: number;
  usersCreated: number;
  usersUpdated: number;
  /** 导入时新建的用户 username（库中无此 id，密码为随机占位）——admin 据此走重置流程恢复其访问 */
  usersRequirePasswordReset: string[];
}
