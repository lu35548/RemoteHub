# RemoteHub V2 增强功能设计文档（二期）

**版本**: v1-draft
**日期**: 2026-04-23
**状态**: 定稿评审中
**前置依赖**: 一期基础功能已上线（认证、项目、连接管理、Docker 部署）

---

## 1. 背景与目标

### 1.1 一期基础

一期已完成：用户认证（JWT + refresh token rotation）、项目与成员管理、远程连接 CRUD、SQLite/MySQL 多 provider、Docker Compose + Caddy 部署。

### 1.2 二期目标

在一期基础上增加运维可观测性和团队协作增强功能：
- 管理员可监控系统健康和用户活动
- 所有敏感操作留痕可追溯
- 数据定期自动备份防丢失
- 实时推送连接状态变更
- 支持数据导入导出

---

## 2. 功能模块概览

| 模块 | 一期依赖 | 优先级 | 说明 |
|------|---------|--------|------|
| 审计日志 | 认证、CRUD | P0 | 所有敏感操作记录留痕 |
| 系统监控 | 健康检查 | P0 | 仪表盘展示系统状态 |
| 数据备份 | Prisma、MySQL | P1 | 定时自动备份 + 手动触发 |
| WebSocket 实时通知 | 认证 | P1 | 连接状态变更推送 |
| 数据导入导出 | 项目、连接 | P2 | JSON/CSV 格式 |

---

## 3. 审计日志

### 3.1 数据模型

新增 `AuditLog` 表：

```prisma
model AuditLog {
  id        String   @id @default(uuid())
  userId    String?  @map("user_id")        // 操作者（系统操作为 null）
  action    String   @db.VarChar(50)        // 操作类型枚举
  resource  String   @db.VarChar(50)        // 资源类型：user/project/connection/member
  resourceId String? @db.VarChar(100) @map("resource_id")
  detail    String?                          // JSON 格式变更详情（before/after），不指定 @db.Text（SQL Server 不支持）
  ip        String?  @db.VarChar(45)
  userAgent String?  @db.VarChar(500) @map("user_agent")
  createdAt DateTime @default(now()) @map("created_at")

  @@index([userId])
  @@index([action])
  @@index([resource, resourceId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

### 3.2 记录的操作类型

| 分类 | action 值 | 说明 |
|------|-----------|------|
| 认证 | AUTH_LOGIN, AUTH_LOGOUT, AUTH_REGISTER, AUTH_PASSWORD_CHANGE | 登录/登出/注册/改密 |
| 用户 | USER_CREATE, USER_UPDATE, USER_DELETE | 用户管理 |
| 项目 | PROJECT_CREATE, PROJECT_UPDATE, PROJECT_DELETE | 项目 CRUD |
| 成员 | MEMBER_ADD, MEMBER_UPDATE, MEMBER_REMOVE | 成员变更 |
| 连接 | CONNECTION_CREATE, CONNECTION_UPDATE, CONNECTION_DELETE, CONNECTION_ACCESS | 连接 CRUD + 访问 |
| 系统 | SYSTEM_BACKUP, SYSTEM_RESTORE, SYSTEM_CONFIG_CHANGE | 系统操作 |

### 3.3 API

```
GET  /api/v1/audit-logs              # 查询审计日志（管理员，支持分页和过滤）
GET  /api/v1/audit-logs/export       # 导出审计日志（CSV）
```

过滤参数：`?userId=&action=&resource=&startDate=&endDate=&page=&pageSize=`

### 3.4 敏感字段脱敏规则

`detail` 字段中的敏感数据必须脱敏后再存储：

| 字段类型 | 脱敏方式 | 示例 |
|----------|---------|------|
| 密码（passwordHash、encryptedPass） | 完全排除，不记录 | 不存入 detail |
| Token | 完全排除 | 不存入 detail |
| IP 地址 | 保留前 3 段，末段用 `*` 替代 | `192.168.1.*` |
| 其他敏感字段（如连接主机） | 保留原值（审计需要） | — |

实现方式：在审计中间件中维护一个 `SENSITIVE_FIELDS` 集合（`passwordHash`, `encryptedPass`, `token`, `tokenHash`），序列化 detail 时自动过滤这些字段。

### 3.5 实现要点

- 通过中间件自动拦截所有写操作（POST/PATCH/DELETE），提取操作信息写入 AuditLog
- `detail` 字段存 JSON：`{ "before": {...}, "after": {...} }`，仅记录变更字段，敏感字段按 3.4 脱敏
- 日志只增不改，无 UPDATE/DELETE 接口
- 日志保留策略：默认 90 天，可配置（`AUDIT_RETENTION_DAYS` 环境变量）
- 查询接口支持导出 CSV，大结果集使用流式响应避免内存溢出

---

## 4. 系统监控

### 4.1 监控指标

| 指标 | 来源 | 说明 |
|------|------|------|
| 系统健康 | /api/v1/health 扩展 | 数据库连接、磁盘空间、内存使用 |
| 在线用户数 | Session 表 | `consumedAt = null AND expiresAt > now()` |
| 用户活跃趋势 | AuditLog 聚合 | 每日登录/操作次数 |
| 项目/连接统计 | 聚合查询 | 各项目连接数、协议分布 |
| API 响应时间 | 中间件记录 | P50/P95/P99 延迟 |

### 4.2 API

```
GET  /api/v1/admin/dashboard          # 仪表盘汇总数据（管理员）
GET  /api/v1/admin/stats/users        # 用户活跃统计
GET  /api/v1/admin/stats/projects     # 项目连接统计
GET  /api/v1/admin/stats/performance  # API 性能统计
```

### 4.3 实现要点

- 仪表盘数据通过聚合查询获取，使用 TanStack Query 缓存（staleTime: 5min）
- API 响应时间通过 Express 中间件记录（`res.on('finish')`），存内存环形缓冲区（最近 10000 条），服务重启后清零（可接受）
- 不引入外部监控系统（Prometheus/Grafana），保持部署简单

### 4.4 新增 API 速率限制

| 端点 | 限制 | 说明 |
|------|------|------|
| /api/v1/admin/backups | 5次/小时/管理员 | 防止频繁触发备份 |
| /api/v1/admin/backups/:id/restore | 2次/小时/管理员 | 恢复操作开销大 |
| /api/v1/admin/export/all | 3次/小时/管理员 | 大数据量导出 |
| /api/v1/projects/:id/import | 5次/小时/用户 | 防止批量导入攻击 |

---

## 5. 数据备份

### 5.1 备份策略

| 备份类型 | 触发方式 | 存储位置 | 保留 |
|----------|---------|---------|------|
| 自动备份 | cron 定时（默认每日 02:00） | Docker 卷 `backup-data` | 保留最近 30 天 |
| 手动备份 | API 触发 | 同上 | 不自动清理 |
| 导出下载 | API 触发 | 临时文件，HTTP 下载 | 下载后删除 |

### 5.2 备份内容

- MySQL: `mysqldump` 全库导出（SQL 文件，gzip 压缩）
- SQLite: 文件拷贝（仅开发环境验证用）
- 连接密码: 备份文件中保持加密状态（AES-256-GCM），需相同 `ENCRYPTION_KEY` 才能恢复

### 5.3 API

```
GET    /api/v1/admin/backups           # 备份列表（管理员）
POST   /api/v1/admin/backups           # 手动触发备份
GET    /api/v1/admin/backups/:id       # 备份详情
GET    /api/v1/admin/backups/:id/download  # 下载备份文件
DELETE /api/v1/admin/backups/:id       # 删除备份
POST   /api/v1/admin/backups/:id/restore   # 从备份恢复（危险操作，需二次确认）
```

### 5.4 实现要点

- 备份由后端 cron job 执行（`node-cron`），不依赖外部调度器
- MySQL 备份使用 `mysqldump --single-transaction` 确保备份期间数据一致性（不锁表，适用于 InnoDB）
- 恢复操作需管理员二次确认（前端弹窗确认 + API 要求 `confirm: true`）
- **恢复前自动创建当前数据库快照**：恢复前先执行一次备份（命名为 `pre_restore_YYYYMMDD_HHmmss`），恢复失败时可回滚到此快照
- 备份文件命名：`remotehub_backup_YYYYMMDD_HHmmss.sql.gz`
- 备份前检查磁盘空间（预留 2 倍备份大小）
- 备份文件校验：备份完成后记录文件大小和 MD5 校验和，下载和恢复时验证完整性

### 5.5 Docker Compose 变更

```yaml
# 新增备份卷
volumes:
  backup-data:

# backend 新增环境变量
# BACKUP_CRON=0 2 * * *        # cron 表达式
# BACKUP_RETENTION_DAYS=30      # 保留天数
```

---

## 6. WebSocket 实时通知

### 6.1 通知场景

| 事件 | 触发时机 | 推送范围 |
|------|---------|---------|
| 连接状态变更 | 连接被创建/修改/删除 | 项目成员 |
| 成员变更 | 成员被添加/移除/角色变更 | 项目成员 |
| 系统通知 | 备份完成/失败、系统异常 | 管理员 |
| 强制登出 | Session 被撤销 | 对应用户 |

### 6.2 技术方案

使用 **WebSocket**（`ws` 库）+ Redis Pub/Sub（可选，单实例不需要）：

```
客户端 <--WebSocket--> 后端 ws server
                         ↓
                    首条消息认证（JWT 验证，不通过 URL query 传参）
                         ↓
                    加入项目房间（project:{id}）
                         ↓
                    接收/发送事件
```

**认证流程**（避免 JWT 暴露在 URL 日志中）：
1. 客户端建立 WebSocket 连接（无参数）
2. 连接建立后立即发送 `{ "type": "auth", "token": "<accessToken>" }`
3. 服务端验证 token，成功后加入用户所属项目房间，失败则关闭连接（code: 4001）
4. 10 秒内未收到 auth 消息则强制关闭连接

### 6.3 消息格式

```typescript
{
  "type": "connection_updated" | "member_added" | "system_alert" | "force_logout",
  "payload": { ... },
  "timestamp": "ISO 8601"
}
```

### 6.4 实现要点

- WebSocket 连接建立后通过首条消息认证（见 6.2），不使用 URL query 参数传 JWT（避免服务器日志泄露）
- token 过期时发送 `reconnect_required` 事件，前端自动刷新 token 后重连
- 按项目划分"房间"，避免全量广播
- 一期先实现单实例（内存管理连接），多实例扩展时引入 Redis Pub/Sub
- **离线消息处理**：关键事件（成员变更、强制登出）写入 `NotificationQueue` 表，用户上线后通过 WebSocket 推送未读消息；非关键事件（连接状态变更）仅在线推送，离线用户刷新页面后从 API 获取最新数据
- **房间管理**：用户被移出项目时自动踢出对应房间；WebSocket 断开时自动清理房间连接

---

## 7. 数据导入导出

### 7.1 导出格式

| 格式 | 内容 | 用途 |
|------|------|------|
| JSON（完整） | 项目 + 成员 + 连接 | 系统迁移、备份 |
| CSV（连接） | 连接列表 | Excel 查看、批量编辑后导入 |

### 7.2 API

```
# 导出
GET  /api/v1/projects/:id/export          # 导出单个项目（JSON）
GET  /api/v1/admin/export/all             # 导出全部数据（管理员，JSON）
GET  /api/v1/connections/export?projectId=&format=csv  # 连接列表导出

# 导入
POST /api/v1/projects/:id/import          # 导入到指定项目（JSON/CSV）
POST /api/v1/admin/import                 # 全量导入（管理员，JSON）
```

### 7.3 实现要点

- 导入时验证数据格式，忽略无效记录，返回导入结果报告（成功/跳过/失败数量）
- 连接密码在导出时保持加密，导入时需相同 `ENCRYPTION_KEY`
- CSV 导入/导出仅包含连接基本信息（不含密码）
- **全量导入支持两种模式**：`overwrite`（清空后导入，需管理员二次确认）和 `merge`（保留现有数据，仅新增/更新，默认模式）
- **文件大小限制**：JSON 导入最大 50MB，CSV 导入最大 20MB（通过 Express `express.raw({ limit })` 限制）
- CSV 导出列：`name, host, port, protocol, vpnType, notes, tags, username`（不含密码和加密字段）

---

## 8. 共享包扩展

`shared` 包新增内容：

```typescript
shared/src/
  ├── types.ts          # 新增审计日志、备份、监控相关 DTO
  ├── enums.ts          # 新增 AuditAction、BackupStatus 等枚举
  ├── constants.ts      # 新增默认配置常量
  └── validators.ts     # 新增导入数据格式验证
```

### 8.1 新增 DTO 类型

```typescript
// === 审计日志 ===
interface AuditLogDTO {
  id: string;
  userId: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  detail: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  ip: string | null;
  createdAt: string;
}

interface AuditLogQueryDTO {
  userId?: string;
  action?: AuditAction;
  resource?: AuditResource;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

// === 备份 ===
interface BackupDTO {
  id: string;
  filename: string;
  size: number;
  md5: string;
  type: 'auto' | 'manual' | 'pre_restore';
  status: 'completed' | 'failed';
  createdAt: string;
}

// === 监控 ===
interface DashboardDTO {
  health: { db: boolean; diskUsage: number; memoryUsage: number };
  onlineUsers: number;
  stats: { totalProjects: number; totalConnections: number; totalUsers: number };
  recentActivity: AuditLogDTO[];
}

// === WebSocket 消息 ===
interface WSMessage {
  type: WSMessageType;
  payload: Record<string, unknown>;
  timestamp: string;
}

// === 导入导出 ===
interface ImportResultDTO {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}
```

### 8.2 新增枚举

```typescript
const AUDIT_ACTIONS = [
  'AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_REGISTER', 'AUTH_PASSWORD_CHANGE',
  'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
  'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_DELETE',
  'MEMBER_ADD', 'MEMBER_UPDATE', 'MEMBER_REMOVE',
  'CONNECTION_CREATE', 'CONNECTION_UPDATE', 'CONNECTION_DELETE', 'CONNECTION_ACCESS',
  'SYSTEM_BACKUP', 'SYSTEM_RESTORE', 'SYSTEM_CONFIG_CHANGE',
] as const;
type AuditAction = typeof AUDIT_ACTIONS[number];

const AUDIT_RESOURCES = ['user', 'project', 'connection', 'member', 'system'] as const;
type AuditResource = typeof AUDIT_RESOURCES[number];

const BACKUP_STATUSES = ['pending', 'in_progress', 'completed', 'failed'] as const;
type BackupStatus = typeof BACKUP_STATUSES[number];

const WS_MESSAGE_TYPES = [
  'connection_updated', 'member_added', 'member_removed',
  'system_alert', 'force_logout', 'reconnect_required', 'auth',
] as const;
type WSMessageType = typeof WS_MESSAGE_TYPES[number];
```

---

## 9. 二期新增环境变量

```env
# === 审计日志 ===
AUDIT_RETENTION_DAYS=90                    # 日志保留天数

# === 数据备份 ===
BACKUP_CRON=0 2 * * *                      # cron 表达式（默认每日 02:00）
BACKUP_RETENTION_DAYS=30                   # 自动备份保留天数
BACKUP_DIR=/data/backups                   # 备份文件存储路径

# === WebSocket ===
WS_HEARTBEAT_INTERVAL=30000                # 心跳间隔（毫秒）
WS_AUTH_TIMEOUT=10000                      # 认证超时（毫秒）

# === 导入导出 ===
IMPORT_MAX_SIZE_JSON=52428800              # JSON 导入最大 50MB
IMPORT_MAX_SIZE_CSV=20971520               # CSV 导入最大 20MB
```

---

## 10. 二期错误码扩展

在一期错误码体系基础上新增：

```
AUDIT_001  审计日志查询参数无效
AUDIT_002  审计日志导出失败
BACKUP_001 备份正在进行中，请勿重复触发
BACKUP_002 备份文件不存在
BACKUP_003 备份文件校验失败（MD5 不匹配）
BACKUP_004 磁盘空间不足，无法执行备份
BACKUP_005 恢复操作需要二次确认
BACKUP_006 恢复前快照创建失败
IMPORT_001 导入文件格式无效
IMPORT_002 导入文件超过大小限制
IMPORT_003 导入数据验证失败
WS_001     WebSocket 认证超时
WS_002     无效的 WebSocket 消息格式
```

---

## 11. 二期前端页面设计

### 11.1 管理后台页面结构

```
/admin
├── /admin/dashboard           # 系统仪表盘
│   ├── 系统健康状态卡片（数据库、磁盘、内存）
│   ├── 在线用户数 + 活跃趋势折线图
│   ├── 项目/连接统计饼图
│   └── 最近操作活动列表
│
├── /admin/audit-logs          # 审计日志
│   ├── 筛选栏（用户、操作类型、资源类型、日期范围）
│   ├── 日志列表（分页表格）
│   └── 导出 CSV 按钮
│
└── /admin/backups             # 备份管理
    ├── 备份列表（文件名、大小、类型、状态、时间）
    ├── 手动触发备份按钮
    ├── 下载/删除/恢复操作
    └── 恢复确认弹窗（含警告信息）
```

### 11.2 新增通用组件

| 组件 | 用途 | 说明 |
|------|------|------|
| `WebSocketProvider` | WebSocket 连接管理 | Context 提供 ws 实例和连接状态，自动重连逻辑 |
| `NotificationToast` | 实时通知弹窗 | 接收 WebSocket 推送，右上角弹出 |
| `DataTable` | 通用数据表格 | 审计日志、备份列表等复用，支持排序、分页、筛选 |
| `ConfirmDialog` | 危险操作确认 | 备份恢复、全量导入等场景，支持输入确认文本 |
| `FileUpload` | 文件上传组件 | 数据导入，支持拖拽，显示上传进度 |

### 11.3 WebSocket 前端集成

```typescript
// hooks/useWebSocket.ts 核心逻辑
- 连接建立 → 发送 auth 消息 → 收到认证成功
- 心跳：每 30s 发送 ping
- 断线重连：指数退避（1s → 2s → 4s → 最大 30s）
- reconnect_required 事件 → 刷新 token → 重连
- 收到消息 → 根据 type 分发到对应 handler
```

---

## 12. 二期测试策略

### 12.1 测试范围

| 模块 | 测试类型 | 说明 |
|------|---------|------|
| 审计日志中间件 | 单元测试 | 验证写操作自动记录、敏感字段脱敏 |
| 审计日志查询 API | 集成测试 | 分页、过滤、CSV 导出 |
| 备份 Service | 单元测试 | cron 调度、文件命名、保留策略 |
| 备份 API | 集成测试 | 创建、下载、恢复（使用测试数据库） |
| WebSocket 认证 | 单元测试 | 首条消息认证、超时断开、token 过期 |
| WebSocket 房间管理 | 单元测试 | 加入/离开房间、离线消息推送 |
| 导入导出 | 集成测试 | JSON/CSV 格式、文件大小限制、merge/overwrite 模式 |
| 监控 API | 集成测试 | 仪表盘数据聚合、性能指标统计 |

### 12.2 测试约定（延续一期 11.6）

- WebSocket 测试使用 `ws` 库的测试客户端模拟连接
- 备份集成测试使用独立的测试数据库，测试后清理
- 导入测试准备标准测试数据文件（JSON/CSV）
- 审计日志测试验证 detail 字段的脱敏效果

---

## 13. 一期代码影响评估

| 一期模块 | 变更类型 | 说明 |
|---------|---------|------|
| Prisma Schema | 新增表 | AuditLog（审计日志） |
| Express 中间件 | 新增 | 审计日志中间件、性能监控中间件 |
| Controllers | 小幅修改 | 写操作需记录审计日志 |
| Services | 小幅修改 | 新增备份/监控/导入导出 service |
| Docker Compose | 新增卷/变量 | backup-data 卷、cron 配置 |
| 前端页面 | 新增 | 管理后台页面（仪表盘、审计日志、备份管理） |
| 前端组件 | 新增 | WebSocket 连接管理、实时通知组件 |

---

## 14. 开发规范（延续一期）

同一期第 11 节所有规范，额外补充：

| 规范 | 级别 | 说明 |
|------|------|------|
| 审计日志不可篡改 | 强制 | 无 UPDATE/DELETE API |
| 备份恢复需二次确认 | 强制 | 前端弹窗 + API confirm 参数 |
| WebSocket 消息必须有 type 和 timestamp | 强制 | 统一消息格式 |
| 导入数据必须校验 | 强制 | 逐条验证，返回结果报告 |
| 监控数据不持久化 | 推荐 | 性能指标用内存环形缓冲区 |

---

## 15. 实施范围

| 阶段 | 内容 | 预计工期 |
|------|------|---------|
| 阶段一 | 审计日志 + 系统监控（P0） | — |
| 阶段二 | 数据备份（P1） | — |
| 阶段三 | WebSocket 实时通知（P1） | — |
| 阶段四 | 数据导入导出（P2） | — |

> 预计工期在实施计划阶段根据团队资源确定。
