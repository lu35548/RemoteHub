# RemoteHub V2 增强功能设计文档（二期）

**版本**: v2.1-draft
**日期**: 2026-04-29
**状态**: R3 运行时+跨层审查完成
**前置依赖**: 一期基础功能已上线（认证、项目、连接管理、Docker 部署）+ 前端迁移 spec 已完成

---

## 1. 背景与目标

### 1.1 一期基础

一期已完成：用户认证（JWT + refresh token rotation）、项目与成员管理、远程连接 CRUD、MySQL 统一数据库、Docker Compose + Caddy 部署。

### 1.2 二期目标

在一期基础上分三批增强运维可观测性、安全防护、团队协作和系统可靠性：

**P0（核心安全与可观测性）**：
- 审计日志：所有敏感操作记录留痕
- 系统监控仪表盘：健康状态、用户活跃、API 性能
- 安全增强：输入净化（XSS/SQL/命令注入）、IP 风险检测、速率限制强化

**P1（数据保护与实时协作）**：
- 数据备份：定时自动备份 + 手动触发
- WebSocket 实时通知：连接状态变更推送、强制登出
- 密码重置：忘记密码/重置密码流程
- 性能监控中间件：API 响应时间记录

**P2（高级功能）**：
- 数据导入导出：JSON/CSV 格式
- 项目管理增强：复制、归档、批量操作、所有权转让
- 2FA：TOTP 双因素认证
- K8s 探针：liveness/readiness/startup
- Swagger 文档：OpenAPI 自动生成

---

## 2. 功能模块概览

| 模块 | 一期依赖 | 优先级 | 批次 | 说明 |
|------|---------|--------|------|------|
| 审计日志 | 认证、CRUD | P0 | P0 | 所有敏感操作记录留痕 |
| 系统监控 | 健康检查 | P0 | P0 | 仪表盘展示系统状态 |
| 安全增强 | 中间件栈 | P0 | P0 | 输入净化、IP 检测 |
| 密码重置 | 认证 | P1 | P1 | Token 重置流程 |
| 数据备份 | Prisma、MySQL | P1 | P1 | 定时自动备份 + 手动触发 |
| WebSocket 实时通知 | 认证 | P1 | P1 | 连接状态变更推送 |
| 性能监控 | 中间件栈 | P1 | P1 | API 响应时间记录（P50/P95/P99） |
| 数据导入导出 | 项目、连接 | P2 | P2 | JSON/CSV 格式 |
| 项目管理增强 | 项目、成员 | P2 | P2 | 复制/归档/批量/转让 |
| 2FA | 认证 | P2 | P2 | TOTP 双因素认证 |
| Swagger 文档 | 所有 API | P2 | P2 | OpenAPI 文档自动生成 |
| K8s 探针 | 健康检查 | P2 | P2 | liveness/readiness/startup |

---

## 3. 审计日志（P0）

### 3.1 数据模型

新增 `AuditLog` 表：

```prisma
model AuditLog {
  id         String   @id @default(uuid())
  userId     String?  @map("user_id")
  action     String   @db.VarChar(50)
  resource   String   @db.VarChar(50)
  resourceId String?  @db.VarChar(100) @map("resource_id")
  detail     String?
  ip         String?  @db.VarChar(45)
  userAgent  String?  @db.VarChar(500) @map("user_agent")
  createdAt  DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

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
| 认证 | AUTH_LOGIN, AUTH_LOGOUT, AUTH_REGISTER, AUTH_PASSWORD_CHANGE, AUTH_PROFILE_UPDATE | 登录/登出/注册/改密/更新资料 |
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
| 密码（passwordHash、encryptedPass） | 记录 `"passwordHash": "[REDACTED]"` 标记字段存在但值已脱敏 | 区分"密码未变更"和"密码已变更但值不可见" |
| Token（token、tokenHash） | 完全排除，不存入 detail | — |
| IP 地址 | 保留前 3 段，末段用 `*` 替代 | `192.168.1.*` |

实现方式：审计中间件维护 `SENSITIVE_FIELDS` 集合（`passwordHash`, `encryptedPass`, `token`, `tokenHash`），序列化 detail 时将敏感字段值替换为 `"[REDACTED]"` 而非完全排除（保留字段名以标识该字段发生了变更）。

### 3.5 审计中间件设计

#### 3.5.1 挂载方式与作用范围

审计中间件以**路由级中间件**方式挂载，不作为全局中间件。仅作用于以下路由的写操作：

| 路由组 | 审计的端点 |
|--------|-----------|
| 认证 | `/auth/login`, `/auth/register`, `/auth/logout`, `/auth/change-password`, `/auth/profile`（PATCH） |
| 用户 | `/users`（POST）, `/users/:id`（PATCH, DELETE） |
| 项目 | `/projects`（POST）, `/projects/:id`（PATCH, DELETE） |
| 成员 | `/projects/:id/members`（POST）, `/projects/:id/members/:uid`（PATCH, DELETE） |
| 连接 | `/connections`（POST）, `/connections/:id`（PATCH, DELETE）, `/connections/:id/decrypt-password`（POST） |
| 备份（P1） | `/admin/backups`（POST, DELETE）, `/admin/backups/:id/restore`（POST） |
| 导入（P2） | `/admin/import`（POST）, `/projects/:id/import`（POST） |

**排除端点**：`/auth/refresh`（高频，无需审计）、`/health`（只读）、所有 GET 请求。

#### 3.5.2 实现方式

采用 V1 验证过的 `res.json` monkey-patch 模式：

```
1. 路由匹配 → 审计中间件执行
2. 若路由有 :id 参数 → 查询数据库获取当前资源状态作为 before 快照
3. 调用 next() → controller 执行
4. res.json 被包装 → 捕获响应数据作为 after 快照
5. setImmediate → diff before/after → 记录变更字段到 AuditLog
6. 审计失败仅记录日志，不传播错误（不影响主请求）
```

**before 快照获取策略**：
- 有 `:id` 参数的 PATCH/DELETE：在 `next()` 前执行 `prisma.<model>.findUnique({ where: { id } })` 获取当前值
- POST（创建）：before 为 null
- 无需 controller 配合，中间件完全自治

#### 3.5.3 清理机制

审计日志清理通过 `node-cron` 实现，每日 **03:30** 执行（与 session 清理 03:00、备份 02:00、通知清理 04:00 错开），删除 `createdAt < NOW() - AUDIT_RETENTION_DAYS` 的记录。遵循 `sessionCleaner.ts` 的既定模式。

#### 3.5.4 对一期代码的影响

Controllers **无代码改动**——审计中间件在路由级别挂载，通过 `req`/`res` 拦截自动记录。路由文件需在对应端点添加 `auditMiddleware` 挂载。

---

## 4. 系统监控（P0）

### 4.1 监控指标

| 指标 | 来源 | 说明 |
|------|------|------|
| 系统健康 | `/api/v1/health` 扩展 | 数据库连接、磁盘空间、内存使用 |
| 在线用户数 | Session 表 | `consumedAt = null AND expiresAt > now()` |
| 用户活跃趋势 | AuditLog 聚合 | 每日登录/操作次数 |
| 项目/连接统计 | 聚合查询 | 各项目连接数、协议分布 |
| API 响应时间 | 性能监控中间件 | P50/P95/P99 延迟 |

### 4.2 API

```
GET  /api/v1/admin/dashboard          # 仪表盘汇总数据（管理员）
GET  /api/v1/admin/stats/users        # 用户活跃统计
GET  /api/v1/admin/stats/projects     # 项目连接统计
GET  /api/v1/admin/stats/performance  # API 性能统计
```

### 4.3 健康检查端点扩展

一期 `/api/v1/health` 当前仅检查数据库连通性。P0 扩展为结构化响应，同时保持向后兼容：

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "database": true,
    "diskUsage": 45.2,
    "memoryUsage": 62.1,
    "uptime": 86400
  }
}
```

**向后兼容**：响应仍然是 `{ success, data }` 格式。Docker healthcheck 检查 HTTP 状态码 200（不解析响应体），因此扩展不影响现有 healthcheck。

### 4.4 实现要点

- 仪表盘数据通过聚合查询获取，前端使用 TanStack Query 缓存（staleTime: 5min）
- API 响应时间通过 Express 中间件记录（`res.on('finish')`），存内存环形缓冲区（最近 10000 条），服务重启后清零（可接受）
- 健康检查阈值：内存 75% 警告/90% 故障，CPU 75%/90%，磁盘 80%/95%（沿用 V1 已验证的阈值）
- 不引入外部监控系统（Prometheus/Grafana），保持部署简单

### 4.5 API 速率限制

| 端点 | 限制 | 说明 |
|------|------|------|
| /api/v1/admin/backups | 5次/小时/管理员 | 防止频繁触发备份 |
| /api/v1/admin/backups/:id/restore | 2次/小时/管理员 | 恢复操作开销大 |
| /api/v1/admin/export/all | 3次/小时/管理员 | 大数据量导出 |
| /api/v1/projects/:id/import | 5次/小时/用户 | 防止批量导入攻击 |

Phase 2 速率限制使用 `express-rate-limit` 实现，遵循一期 `env.ts` 中 `RATE_LIMIT_*` 环境变量模式。新增对应环境变量：

```env
RATE_LIMIT_BACKUP_MAX=5          # 备份触发（次/小时）
RATE_LIMIT_RESTORE_MAX=2         # 恢复操作（次/小时）
RATE_LIMIT_EXPORT_MAX=3          # 全量导出（次/小时）
RATE_LIMIT_IMPORT_MAX=5          # 数据导入（次/小时）
```

---

## 5. 安全增强（P0）

### 5.1 输入净化中间件

参考 V1 `sanitization.ts` 的工厂函数模式，实现递归深度净化。应用于 `req.body`、`req.query`、`req.params`。

| 防护类型 | 检测内容 | 处理方式 |
|---------|---------|---------|
| XSS | `<script>` 标签、事件处理器（`on*=`）、`javascript:` 协议 | 剥离危险标签 |
| SQL 注入 | SELECT/INSERT/UPDATE/DELETE/DROP/UNION 模式 | 返回 VAL_001（400） |
| NoSQL 注入 | `$where`、`$ne`、`$regex` 等 `$` 操作符 | 返回 VAL_001（400） |
| 路径遍历 | `..`、路径分隔符 | 返回 VAL_001（400） |
| 命令注入 | `&&`、`;`、反引号、`$()`、`rm -rf` | 返回 VAL_001（400） |

**排除字段**：`password`、`encryptedPass`、`notes`（可能含合法技术内容）— 不净化这些字段。

**挂载方式**：全局中间件，插入位置在一期全局中间件栈的 `express.json()` 之后、路由挂载之前。

### 5.2 IP 风险检测

参考 V1 `securityEnhancements.ts` 的 `trafficPatternMonitor`：

- 内存中维护 per-IP 请求计数（1 分钟窗口）
- 阈值：>1000 req/min 标记为可疑，记录到 AuditLog（action: `SECURITY_SUSPICIOUS_IP`）
- 不阻断请求（避免误杀），仅记录告警
- 管理员可在审计日志中筛选 `action=SECURITY_SUSPICIOUS_IP` 查看异常 IP

---

## 6. 密码重置（P1）

### 6.1 数据模型

新增 `PasswordResetToken` 表：

```prisma
model PasswordResetToken {
  id          String    @id @default(uuid())
  userId      String    @map("user_id")
  tokenHash   String    @unique @map("token_hash")   // SHA-256(token)，类似 Session 设计
  expiresAt   DateTime  @map("expires_at")
  usedAt      DateTime? @map("used_at")              // null=有效，非null=已使用
  ip          String?   @db.VarChar(45)
  userAgent   String?   @db.VarChar(500) @map("user_agent")
  createdAt   DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("password_reset_tokens")
}
```

### 6.2 API

```
POST /api/v1/auth/forgot-password     # 请求重置（公开，需验证码或限流）
POST /api/v1/auth/reset-password      # 执行重置（公开，携带 token + 新密码）
```

### 6.3 流程设计

1. 用户提交 `POST /forgot-password { username }` → 服务端生成 256-bit 随机 token → 存 SHA-256 哈希到 `PasswordResetToken` → 返回成功（统一消息，不暴露用户是否存在）
2. 重置链接格式：`${FRONTEND_URL}/reset-password?token=<token>`（前端路由）
3. 用户提交 `POST /reset-password { token, newPassword }` → 验证 token → 更新密码 → 标记 token 已使用 → 删除用户所有 Session（强制重新登录）
4. Token 有效期 1 小时，每用户最多 3 个有效 token

### 6.4 邮件发送

一期不实现邮件发送。替代方案：
- 重置 token 通过**管理员手动告知**（管理后台可查看活跃 token）
- 预留 `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`FROM_EMAIL` 环境变量
- 邮件实现时补充 `emailService.ts`

### 6.5 安全约束

- `/forgot-password` 速率限制：3 次/小时/IP
- 同一用户 24 小时内最多请求 5 次
- Token 使用后立即标记，不物理删除（审计追溯）

---

## 7. 数据备份（P1）

### 7.1 备份策略

| 备份类型 | 触发方式 | 存储位置 | 保留 |
|----------|---------|---------|------|
| 自动备份 | cron 定时（默认每日 02:00） | Docker 卷 `backup-data` | 保留最近 30 天 |
| 手动备份 | API 触发 | 同上 | 不自动清理 |
| 导出下载 | API 触发 | 临时文件，HTTP 下载 | 下载后删除 |

### 7.2 备份内容

- SQLite: `VACUUM INTO '/data/backups/remotehub_backup_YYYYMMDD_HHmmss.db'` 在线备份（WAL 模式下不阻塞读写，见 §7.5）
- 连接密码: 备份文件中保持加密状态，需相同 `ENCRYPTION_KEY` 才能恢复

### 7.3 API

```
GET    /api/v1/admin/backups           # 备份列表（管理员）
POST   /api/v1/admin/backups           # 手动触发备份
GET    /api/v1/admin/backups/:id       # 备份详情
GET    /api/v1/admin/backups/:id/download  # 下载备份文件
DELETE /api/v1/admin/backups/:id       # 删除备份
POST   /api/v1/admin/backups/:id/restore   # 从备份恢复（需二次确认）
```

### 7.4 备份元数据存储

备份文件存储在文件系统，但元数据（文件名、大小、MD5、类型、状态、时间）需要持久化查询。采用 **manifest 文件** 方案：

- 备份目录下维护 `backup_manifest.json`，每次备份/删除/恢复后更新
- 结构为 `Backup[]` 数组，按 `createdAt` 倒序排列
- 不使用数据库表（避免备份数据库时锁表问题）
- 服务启动时读取 manifest，不存在则创建空文件

### 7.5 实现要点

- 备份由后端 cron job 执行（`node-cron`），遵循 `sessionCleaner.ts` 的既定模式
- SQLite 备份使用 `VACUUM INTO`（在线备份，WAL 模式下不阻塞读写；优于拷贝文件，无需停 WAL checkpoint）
- **无需安装 mysql-client**：一期已切 SQLite（见 `2026-07-17-v2-followup-design.md` §1），备份通过 `prisma.$executeRawUnsafe('VACUUM INTO ...')` 执行，无外部命令依赖
- 恢复操作需管理员二次确认（请求体必须包含 `{ "confirm": true }`）
- 恢复前自动创建当前数据库快照（命名为 `pre_restore_YYYYMMDD_HHmmss`）
- 备份文件命名：`remotehub_backup_YYYYMMDD_HHmmss.db`（可选 gzip 压缩为 `.db.gz`）
- 备份前检查磁盘空间（预留 2 倍备份大小）
- 备份完成后记录文件大小和 MD5 校验和

### 7.6 Docker Compose 变更

在现有 `docker-compose.yml` 的 backend 服务中添加：

```yaml
services:
  backend:
    # ... 现有配置 ...
    volumes:
      - backup-data:/data/backups    # 新增：备份文件持久化

volumes:
  # ... 现有卷 ...
  backup-data:                       # 新增：备份数据卷
```

---

## 8. WebSocket 实时通知（P1）

### 8.1 通知场景

| 事件 | 触发时机 | 推送范围 |
|------|---------|---------|
| 连接状态变更 | 连接被创建/修改/删除 | 项目成员 |
| 成员变更 | 成员被添加/移除 | 项目成员 |
| 成员角色变更 | 成员角色被修改 | 项目成员 |
| 系统通知 | 备份完成/失败 | 管理员 |
| 强制登出 | Session 被撤销 | 对应用户 |

### 8.2 技术方案

使用 **WebSocket**（`ws` 库）：

```
客户端 <--WebSocket--> 后端 ws server
                         ↓
                    首条消息认证（JWT 验证）
                         ↓
                    加入项目房间（project:{id}）
                         ↓
                    接收/发送事件
```

#### 8.2.1 server.ts 启动方式重构

当前 `server.ts` 使用 `app.listen()` 直接启动，ws 库需要 HTTP server 实例来挂载 WebSocket upgrade。需改为：

```typescript
import { createServer } from 'http';

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  // 可在此处做 WS 级别的认证/限流
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

startSessionCleaner();
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} (${env.NODE_ENV})`);
});
```

> 注意：此变更影响一期代码，需在 P1 开始时执行。重构后需同时 export `server` 实例供 WS 使用：`export { app, server }`。

#### 8.2.2 helmet CSP 调整

当前 helmet 配置 `defaultSrc: ["'self'"]` 不足以允许 WebSocket 连接。需在 CSP 中显式添加 `connect-src`：

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],  // 同源 WebSocket（ws:// 同 host:port）
    },
  },
}));
```

Docker 部署中 Caddy 反代 WebSocket 时，浏览器连接的是同源 HTTPS，`'self'` 覆盖 `wss:` 协议。

**认证流程**（遵循 `WSMessage` 统一格式）：
1. 客户端建立 WebSocket 连接（无参数）
2. 连接建立后立即发送 `{ "type": "auth", "payload": { "token": "<accessToken>" }, "timestamp": "..." }`
3. 服务端验证 token，成功后加入用户所属项目房间，失败则关闭连接（code: 4001）
4. 10 秒内未收到 auth 消息则强制关闭连接

### 8.3 消息格式

所有 WebSocket 消息（双向）统一使用以下格式：

```typescript
{
  "type": WSMessageType,
  "payload": Record<string, unknown>,
  "timestamp": "ISO 8601"
}
```

### 8.4 消息类型定义

| 类型 | 方向 | 说明 |
|------|------|------|
| `auth` | 客户端→服务端 | 认证消息，payload 含 token |
| `connection_updated` | 服务端→客户端 | 连接创建/修改/删除统一通知 |
| `member_added` | 服务端→客户端 | 成员添加 |
| `member_removed` | 服务端→客户端 | 成员移除 |
| `member_role_updated` | 服务端→客户端 | 成员角色变更 |
| `system_alert` | 服务端→客户端 | 系统通知（备份完成/失败等） |
| `force_logout` | 服务端→客户端 | 强制登出 |
| `reconnect_required` | 服务端→客户端 | Token 过期，需刷新后重连 |

### 8.5 离线消息处理

关键事件（成员变更、强制登出）写入 `NotificationQueue` 表，用户上线后推送。

### 8.6 数据模型

新增 `NotificationQueue` 表：

```prisma
model NotificationQueue {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  type       String   @db.VarChar(50)
  payload    String
  isRead     Boolean  @default(false) @map("is_read")
  createdAt  DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@index([createdAt])
  @@map("notification_queue")
}
```

通知 API：

```
GET    /api/v1/notifications           # 获取未读通知
PATCH  /api/v1/notifications/:id/read  # 标记已读（请求体: { isRead: true }）
```

通知清理：已读通知保留 7 天，由独立的清理 cron 处理（`node-cron` 每日 04:00，与 session 清理 03:00、审计清理 03:30、备份 02:00 错开）。删除条件：`isRead = true AND createdAt < NOW() - 7d`。

### 8.7 实现要点

- 一期单实例（内存管理连接），多实例扩展时引入 Redis Pub/Sub
- 用户被移出项目时自动踢出对应房间
- token 过期时发送 `reconnect_required`，前端自动刷新 token 后重连
- 心跳：每 30s 发送 ping
- 断线重连：指数退避（1s → 2s → 4s → 最大 30s）

---

## 9. 数据导入导出（P2）

### 9.1 导出格式

| 格式 | 内容 | 用途 |
|------|------|------|
| JSON（完整） | 项目 + 成员 + 连接 | 系统迁移、备份 |
| CSV（连接） | 连接列表 | Excel 查看、批量编辑后导入 |

### 9.2 API

```
# 导出
GET  /api/v1/projects/:id/export          # 导出单个项目（JSON，owner/editor/admin）
GET  /api/v1/admin/export/all             # 导出全部数据（管理员，JSON）
GET  /api/v1/connections/export?projectId=&format=csv  # 连接列表导出（返回 text/csv，Content-Disposition: attachment）

# 导入
POST /api/v1/projects/:id/import          # 导入到指定项目（Content-Type: application/json 或 multipart/form-data 含 CSV 文件）
POST /api/v1/admin/import                 # 全量导入（管理员，Content-Type: application/json）
```

### 9.3 权限说明

- `GET /projects/:id/export`：owner、editor、admin 可导出（viewer 不能导出含密码信息的完整数据）
- `POST /projects/:id/import`：owner、editor、admin 可导入
- `GET /connections/export`：所有已认证用户可导出（CSV 格式不含密码，等同于连接列表查看权限）
- 全量导入/导出：仅 admin

### 9.4 实现要点

- 导入时验证数据格式，忽略无效记录，返回导入结果报告 `ImportResult`（`total/success/skipped/failed/errors`）
- 连接密码导出时保持加密，导入时需相同 `ENCRYPTION_KEY`
- CSV 导入/导出仅含连接基本信息（不含密码和加密字段）
- 全量导入支持 `merge`（默认，保留现有数据）和 `overwrite`（清空后导入，需 `{ "confirm": true }`）两种模式
- 文件大小限制：通过路由级中间件 `express.json({ limit: '50mb' })` 覆盖全局 1MB 限制，仅应用于导入端点
- CSV 导出列：`name, host, port, protocol, vpnType, notes, tags, username`
- tags 字段在数据库中为 `String?`（逗号分隔的单字符串），CSV 导入时需将逗号分隔值 join 为单字符串存储

---

## 10. 项目管理增强（P2）

### 10.1 新增端点

```
POST   /api/v1/projects/:id/duplicate           # 复制项目（owner/admin）
PATCH  /api/v1/projects/:id/archive              # 归档项目（owner/admin）
PATCH  /api/v1/projects/:id/activate             # 激活项目（owner/admin）
POST   /api/v1/projects/:id/members/batch        # 批量添加成员（owner/admin）
POST   /api/v1/projects/:id/leave                # 离开项目（editor/viewer 自行退出）
PATCH  /api/v1/projects/:id/transfer-ownership   # 转让所有权（owner → 指定成员）
```

### 10.2 数据模型变更

Project 新增字段：

```prisma
model Project {
  // ... 现有字段 ...
  status    String  @default("active") @db.VarChar(20)  // "active" | "archived"

  @@index([status])
}
```

### 10.3 实现要点

- 复制项目：深拷贝项目 + 所有连接 + 调用者为 owner，源项目成员不复制
- 归档/激活：更新 `status` 字段，归档项目仍可查看但不可编辑连接
- 批量添加成员：最大 50 个，跳过已存在成员，返回结果报告
- 转让所有权：当前 owner 变为 editor，指定成员变为 owner，需事务保证原子性
- 离开项目：editor/viewer 可自行退出（无需 owner 审批），owner 不能离开（只能转让）

---

## 11. 2FA 双因素认证（P2）

### 11.1 技术方案

使用 TOTP（Time-based One-Time Password），基于 `otpauth` 库。

### 11.2 数据模型变更

User 新增字段：

```prisma
model User {
  // ... 现有字段保持不变 ...
  twoFactorSecret String? @map("two_factor_secret")  // TOTP 密钥（加密存储）
  twoFactorEnabled Boolean @default(false) @map("two_factor_enabled")

  // 现有关联字段必须保留
  projects    ProjectMember[]
  sessions    Session[]
  // 二期新增关联
  auditLogs       AuditLog[]
  resetTokens     PasswordResetToken[]
  notifications   NotificationQueue[]
}
```

### 11.3 API

```
POST /api/v1/auth/2fa/enable     # 启用 2FA（验证密码后返回 TOTP URI）
POST /api/v1/auth/2fa/verify     # 验证 TOTP 码（启用流程中验证）
POST /api/v1/auth/2fa/disable    # 禁用 2FA（需验证密码 + TOTP 码）
POST /api/v1/auth/2fa/login      # 2FA 登录第二步（提交 TOTP 码）
```

### 11.4 流程

1. 登录时若用户 `twoFactorEnabled = true`，`/auth/login` 返回 `{ require2FA: true, tempToken: "..." }`
2. 前端展示 TOTP 输入框，调用 `/auth/2fa/login { tempToken, code }`
3. 验证通过后签发正常 accessToken + refreshToken

**tempToken 实现**：
- tempToken 为 256-bit 随机字符串，SHA-256 哈希后存入 `Session` 表（复用现有 session 机制），`consumedAt` 字段标记 2FA 验证完成
- tempToken 有效期 5 分钟（远短于 accessToken 的 15 分钟）
- 2FA 验证成功后，tempToken 对应的 session 被消费，签发正式的 accessToken + refreshToken

---

## 12. K8s 探针（P2）

### 12.1 API

```
GET /api/v1/health/live      # liveness：进程存活
GET /api/v1/health/ready     # readiness：可接受流量（数据库可达）
GET /api/v1/health/startup   # startup：初始化完成
```

### 12.2 实现要点

- `/live`：返回 200（仅检查进程存活）
- `/ready`：检查数据库连接 + 磁盘空间 < 95%（复用 §4.3 健康检查逻辑）
- `/startup`：检查 Prisma migrate 是否完成 + 种子数据是否存在

---

## 13. Swagger 文档（P2）

### 13.1 技术方案

使用 `swagger-jsdoc` + `swagger-ui-express`，从 JSDoc 注释自动生成 OpenAPI 3.0 文档。

> **兼容性风险**：这两个库内部依赖 Express 4 API，尚未正式声明 Express 5 兼容。实施 P2 时需先验证：
> 1. 在 Express 5 环境中安装测试，确认基本功能可用
> 2. 若不兼容，备选方案：(A) 使用 `tsoa`（TypeScript 装饰器路由 + 自动 OpenAPI 生成）；(B) 手写 `openapi.yaml` 静态文件 + `swagger-ui-dist`

### 13.2 API

```
GET /api/v1/docs              # Swagger UI
GET /api/v1/docs/swagger.json # OpenAPI JSON
```

### 13.3 实现要点

- 仅在非生产环境启用（`NODE_ENV !== 'production'`）
- JSDoc 注释添加在各 route 文件中
- 引用 `@remotehub/shared` 的类型定义生成 schema

---

## 14. 共享包扩展

`shared` 包新增内容：

```typescript
shared/src/
  ├── types.ts          # 新增审计日志、备份、监控、密码重置、通知、WS 相关 DTO
  ├── enums.ts          # 新增 AuditAction、AuditResource、BackupStatus、WSMessageType 等
  ├── constants.ts      # 新增默认配置常量
  └── validators.ts     # 新增导入数据格式验证、密码重置验证
```

### 14.1 新增 DTO 类型

```typescript
// === 审计日志 ===
interface AuditLog {
  id: string;
  userId: string | null;
  action: AuditAction;
  resource: AuditResource;
  resourceId: string | null;
  detail: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditLogQuery {
  userId?: string;
  action?: AuditAction;
  resource?: AuditResource;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

// === 备份 ===
interface Backup {
  id: string;
  filename: string;
  size: number;
  md5: string;
  type: 'auto' | 'manual' | 'pre_restore';
  status: BackupStatus;    // 使用完整枚举
  createdAt: string;
}

// === 监控 ===
interface Dashboard {
  health: { status: string; db: boolean; diskUsage: number; memoryUsage: number };
  onlineUsers: number;
  stats: { totalProjects: number; totalConnections: number; totalUsers: number };
  recentActivity: AuditLog[];
}

// === WebSocket 消息 ===
interface WSMessage {
  type: WSMessageType;
  payload: Record<string, unknown>;
  timestamp: string;
}

// === 导入导出 ===
interface ImportResult {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}

// === 通知 ===
interface Notification {
  id: string;
  type: string;
  payload: string;
  isRead: boolean;
  createdAt: string;
}
```

### 14.2 新增枚举

```typescript
const AUDIT_ACTIONS = [
  'AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_REGISTER', 'AUTH_PASSWORD_CHANGE', 'AUTH_PROFILE_UPDATE',
  'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
  'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_DELETE',
  'MEMBER_ADD', 'MEMBER_UPDATE', 'MEMBER_REMOVE',
  'CONNECTION_CREATE', 'CONNECTION_UPDATE', 'CONNECTION_DELETE', 'CONNECTION_ACCESS',
  'SYSTEM_BACKUP', 'SYSTEM_RESTORE', 'SYSTEM_CONFIG_CHANGE',
  'SECURITY_SUSPICIOUS_IP',
] as const;
type AuditAction = typeof AUDIT_ACTIONS[number];

const AUDIT_RESOURCES = ['user', 'project', 'connection', 'member', 'system', 'security'] as const;
type AuditResource = typeof AUDIT_RESOURCES[number];

const BACKUP_STATUSES = ['pending', 'in_progress', 'completed', 'failed'] as const;
type BackupStatus = typeof BACKUP_STATUSES[number];

const WS_MESSAGE_TYPES = [
  'auth', 'connection_updated', 'member_added', 'member_removed', 'member_role_updated',
  'system_alert', 'force_logout', 'reconnect_required',
] as const;
type WSMessageType = typeof WS_MESSAGE_TYPES[number];

const PROJECT_STATUSES = ['active', 'archived'] as const;
type ProjectStatus = typeof PROJECT_STATUSES[number];
```

---

## 15. 新增环境变量

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

# === 密码重置 ===
RATE_LIMIT_FORGOT_PASSWORD_MAX=3           # 忘记密码每小时最大尝试（per-IP）
PASSWORD_RESET_TOKEN_EXPIRES_HOURS=1       # 重置 token 有效期（小时）
PASSWORD_RESET_MAX_PER_USER=3              # 每用户最大有效 token 数

# === 速率限制（Phase 2 新增） ===
RATE_LIMIT_BACKUP_MAX=5                    # 备份触发（次/小时）
RATE_LIMIT_RESTORE_MAX=2                   # 恢复操作（次/小时）
RATE_LIMIT_EXPORT_MAX=3                    # 全量导出（次/小时）
RATE_LIMIT_IMPORT_MAX=5                    # 数据导入（次/小时）

# === 邮件（预留，一期不实现） ===
# SMTP_HOST=
# SMTP_PORT=587
# SMTP_USER=
# SMTP_PASS=
# FROM_EMAIL=noreply@remotehub.local
```

> **env.ts 集成说明**：数值型变量需遵循 `parseInt(process.env.X || 'default', 10)` 模式（与一期 `RATE_LIMIT_*` 一致），字符串型变量用 `process.env.X || 'default'`，cron 表达式用 `process.env.X || '0 2 * * *'`。

---

## 16. 错误码扩展

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
RESET_001  密码重置 token 无效或已过期
RESET_002  密码重置请求过于频繁
RESET_003  重置 token 已达上限（每用户最多 3 个有效 token）
TFA_001    2FA 验证码错误
TFA_002    2FA 未启用
TFA_003    2FA 已启用
```

---

## 17. 权限矩阵扩展

在一期 §4.2 权限矩阵基础上新增：

| 端点 | admin | owner | editor | viewer | 未登录 |
|------|-------|-------|--------|--------|--------|
| **审计日志** | | | | | |
| GET /audit-logs | ✅ | ❌ | ❌ | ❌ | ❌ |
| GET /audit-logs/export | ✅ | ❌ | ❌ | ❌ | ❌ |
| **监控** | | | | | |
| GET /admin/dashboard | ✅ | ❌ | ❌ | ❌ | ❌ |
| GET /admin/stats/* | ✅ | ❌ | ❌ | ❌ | ❌ |
| **备份** | | | | | |
| GET /admin/backups | ✅ | ❌ | ❌ | ❌ | ❌ |
| POST /admin/backups | ✅ | ❌ | ❌ | ❌ | ❌ |
| GET /admin/backups/:id | ✅ | ❌ | ❌ | ❌ | ❌ |
| GET /admin/backups/:id/download | ✅ | ❌ | ❌ | ❌ | ❌ |
| DELETE /admin/backups/:id | ✅ | ❌ | ❌ | ❌ | ❌ |
| POST /admin/backups/:id/restore | ✅ | ❌ | ❌ | ❌ | ❌ |
| **密码重置** | | | | | |
| POST /auth/forgot-password | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST /auth/reset-password | ✅ | ✅ | ✅ | ✅ | ✅ |
| **导入导出** | | | | | |
| GET /projects/:id/export | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET /admin/export/all | ✅ | ❌ | ❌ | ❌ | ❌ |
| GET /connections/export | ✅ | ✅ | ✅ | ✅ | ❌ |
| POST /projects/:id/import | ✅ | ✅ | ✅ | ❌ | ❌ |
| POST /admin/import | ✅ | ❌ | ❌ | ❌ | ❌ |
| **项目增强** | | | | | |
| POST /projects/:id/duplicate | ✅ | ✅ | ❌ | ❌ | ❌ |
| PATCH /projects/:id/archive | ✅ | ✅ | ❌ | ❌ | ❌ |
| PATCH /projects/:id/activate | ✅ | ✅ | ❌ | ❌ | ❌ |
| POST /projects/:id/members/batch | ✅ | ✅ | ❌ | ❌ | ❌ |
| POST /projects/:id/leave | ✅ | ✅ | ✅ | ✅ | ❌ |
| PATCH /projects/:id/transfer-ownership | ✅ | ✅ | ❌ | ❌ | ❌ |
| **2FA** | | | | | |
| POST /auth/2fa/enable | ✅ | ✅ | ✅ | ✅ | ❌ |
| POST /auth/2fa/verify | ✅ | ✅ | ✅ | ✅ | ❌ |
| POST /auth/2fa/disable | ✅ | ✅ | ✅ | ✅ | ❌ |
| POST /auth/2fa/login | ✅ | ✅ | ✅ | ✅ | ✅ |
| **通知** | | | | | |
| GET /notifications | ✅ | ✅ | ✅ | ✅ | ❌ |
| PATCH /notifications/:id/read | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## 18. 中间件栈扩展

在一期全局中间件栈基础上，新增中间件的插入位置：

```
1. express.json({ limit: '1mb' })
2. cookieParser()
3. helmet()
4. 输入净化中间件（P0 新增）← 全局，在 JSON 解析之后
5. rate limiters（一期现有 + Phase 2 新增）
6. cors()
7. trust proxy

路由级中间件（按需挂载）：
- authMiddleware（一期现有）
- roleMiddleware / projectRoleMiddleware（一期现有）
- auditMiddleware（P0 新增）← 仅挂载在需审计的写操作路由上
- 性能监控中间件（P1 新增）← 全局，记录所有 API 请求响应时间
```

---

## 19. 二期前端页面设计

### 19.1 管理后台页面结构

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

### 19.2 新增通用组件

| 组件 | 用途 | 说明 |
|------|------|------|
| `WebSocketProvider` | WebSocket 连接管理 | Context 提供 ws 实例和连接状态，自动重连逻辑 |
| `NotificationToast` | 实时通知弹窗 | 接收 WebSocket 推送，右上角弹出 |
| `DataTable` | 通用数据表格 | 审计日志、备份列表等复用，支持排序、分页、筛选 |
| `ConfirmDialog` | 危险操作确认 | 备份恢复、全量导入等场景，支持输入确认文本 |
| `FileUpload` | 文件上传组件 | 数据导入，支持拖拽，显示上传进度 |

### 19.3 WebSocket 前端集成

```typescript
// hooks/useWebSocket.ts 核心逻辑
- 连接建立 → 发送 auth 消息 → 收到认证成功
- 心跳：每 30s 发送 ping
- 断线重连：指数退避（1s → 2s → 4s → 最大 30s）
- reconnect_required 事件 → 刷新 token → 重连
- 收到消息 → 根据 type 分发到对应 handler
```

---

## 20. 二期测试策略

### 20.1 测试范围

| 模块 | 测试类型 | 批次 | 说明 |
|------|---------|------|------|
| 审计日志中间件 | 单元测试 | P0 | 验证写操作自动记录、敏感字段脱敏 |
| 审计日志查询 API | 集成测试 | P0 | 分页、过滤、CSV 导出 |
| 输入净化中间件 | 单元测试 | P0 | XSS/SQL/NoSQL/路径遍历/命令注入 |
| 监控 API | 集成测试 | P0 | 仪表盘数据聚合 |
| 密码重置流程 | 单元+集成测试 | P1 | token 生成、验证、过期、限流 |
| 备份 Service | 单元测试 | P1 | cron 调度、文件命名、保留策略 |
| 备份 API | 集成测试 | P1 | 创建、下载、恢复 |
| WebSocket 认证 | 单元测试 | P1 | 首条消息认证、超时断开、token 过期 |
| WebSocket 房间管理 | 单元测试 | P1 | 加入/离开房间、离线消息推送 |
| 导入导出 | 集成测试 | P2 | JSON/CSV 格式、merge/overwrite 模式 |
| 项目增强 | 集成测试 | P2 | 复制、归档、批量、转让 |

### 20.2 集成测试基础设施

一期现有测试全部为 mock 单元测试（145 个，全部通过），没有集成测试连接真实数据库。二期新增集成测试前需建立以下基础设施：

#### 20.2.1 测试数据库

- 独立数据库 `remotehub_test`，与开发数据库 `remotehub_dev` 隔离
- `.env.test` 文件（或 vitest `environment` 变量覆盖）指向测试库：
  ```
  DATABASE_URL=mysql://root:<password>@localhost:3306/remotehub_test
  ```

#### 20.2.2 vitest globalSetup

```typescript
// tests/globalSetup.ts
import { execSync } from 'child_process';

export default async function setup() {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL
    || 'mysql://root:root@localhost:3306/remotehub_test';
  execSync('npx prisma db push --force-reset', { stdio: 'inherit' });
  execSync('npx prisma db seed', { stdio: 'inherit' });
}
```

#### 20.2.3 数据清理策略

- 每个集成测试套件的 `beforeEach` 执行 `prisma.$executeRaw` 清空所有表
- 清空顺序需尊重外键约束：Connection → ProjectMember → Project → Session → User
- 或使用 `prisma.$transaction` 按逆序 deleteMany

#### 20.2.4 测试 HTTP 客户端

集成测试使用 `supertest` 库，直接请求 Express app 实例（不启动真实端口）：

```typescript
import request from 'supertest';
import { app } from '../server.js';

const res = await request(app).get('/api/v1/health');
```

需安装：`npm install -D supertest @types/supertest`

#### 20.2.5 新增依赖

```json
{
  "devDependencies": {
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.0"
  }
}
```

#### 20.2.6 本地环境前置条件

开发者在本地运行集成测试前，需确保：

| 前置条件 | 验证命令 | 说明 |
|----------|---------|------|
| MySQL 8.0 运行中 | `mysql -u root -p -e "SELECT 1"` | 服务名 MySQL3306 |
| MySQL CLI 在 PATH | `mysql --version` | `C:\Program Files\MySQL\MySQL Server 8.0\bin` |
| 测试数据库已创建 | `mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS remotehub_test"` | 首次需手动创建 |
| .env 中密码正确 | `npx prisma db execute --schema prisma/schema.prisma --stdin <<< "SELECT 1"` | 验证连通性 |

### 20.3 测试约定（延续一期 §11.6）

- WebSocket 测试使用 `ws` 库测试客户端
- 备份集成测试使用独立测试数据库
- 审计日志测试验证 detail 字段脱敏效果（敏感字段值为 `"[REDACTED]"`）
- 2FA 测试使用已知密钥验证 TOTP 码生成

---

## 21. 一期代码影响评估

| 一期模块 | 变更类型 | 批次 | 说明 |
|---------|---------|------|------|
| Prisma Schema | 新增表 | P0 | AuditLog |
| Prisma Schema | 新增表 | P1 | PasswordResetToken、NotificationQueue |
| Prisma Schema | 新增字段 | P2 | User（2FA）、Project（status） |
| Express server.ts | 新增全局中间件 | P0 | 输入净化中间件 |
| **Express server.ts** | **添加 dotenv 加载** | **P0（前置）** | **当前 `tsx watch` 不自动加载 `.env`，需在 `server.ts` 顶部添加 `import 'dotenv/config'` 或使用 `tsx --env-file=.env` 启动参数** |
| Express server.ts | **启动方式重构** | **P1** | **`app.listen()` → `http.createServer(app)` + `server.listen()`，为 WebSocket 挂载 HTTP server 实例** |
| Express server.ts | helmet CSP 调整 | P1 | 新增 `connectSrc: ["'self'"]` 允许 WebSocket |
| Route 文件 | 新增路由级中间件 | P0 | auditMiddleware 挂载 |
| Route 文件 | 新增路由 | P1-P2 | 备份、WS、密码重置、项目增强等 |
| Controllers | 无改动 | P0 | 审计中间件自治，不需要 controller 配合 |
| Docker Compose | 新增卷 | P1 | backup-data |
| docker-compose.yml backend 服务 | 新增 volume mount | P1 | backup-data:/data/backups |
| Dockerfile.backend | 不再需要 mysql-client | P1 | 切 SQLite 后备份用 VACUUM INTO（见 §7.5），无 mysqldump 依赖 |
| 前端页面 | 新增 | P0-P2 | 管理后台页面 + 通知组件 |
| 前端组件 | 新增 | P1 | WebSocket 连接管理 |
| **env.ts / DATABASE_URL** | **添加连接池配置** | **P0（前置）** | **`?connection_limit=30`，默认连接池不够支撑 WS 并发查询** |
| **logger.ts** | **生产环境 JSON 格式** | **P0（前置）** | **审计/安全日志需结构化，当前 `printf` 格式不便于日志收集** |
| **appError.ts** | **错误码扩展** | **P0** | **新增 AUDIT/BACKUP/IMPORT/WS/RESET/TFA 系列错误码，按注释分组** |
| **server.ts** | **Graceful shutdown** | **P1** | **添加 SIGTERM/SIGINT 处理，WS 连接优雅关闭，Prisma 断连** |

---

## 22. 开发规范（延续一期）

同一期第 11 节所有规范，额外补充：

| 规范 | 级别 | 说明 |
|------|------|------|
| 审计日志不可篡改 | 强制 | 无 UPDATE/DELETE API |
| 备份恢复需二次确认 | 强制 | 前端弹窗 + API confirm 参数 |
| WebSocket 消息统一格式 | 强制 | 必须有 type、payload、timestamp |
| 导入数据必须校验 | 强制 | 逐条验证，返回结果报告 |
| 监控数据不持久化 | 推荐 | 性能指标用内存环形缓冲区 |
| 审计失败不阻断主请求 | 强制 | setImmediate + catch 记录日志 |
| 输入净化排除密码字段 | 强制 | password、encryptedPass 不净化 |

---

## 23. 实施范围

| 阶段 | 内容 | 前置依赖 |
|------|------|---------|
| **前置** | 前端迁移 spec（V1→V2 组件迁移） | 无 |
| **P0** | 审计日志 + 系统监控 + 安全增强（输入净化 + IP 检测） | 前端迁移完成 |
| **P1** | 数据备份 + WebSocket + 密码重置 | P0 完成 |
| **P2** | 导入导出 + 项目增强 + 2FA + K8s 探针 + Swagger | P1 完成 |

---

## 24. 新增依赖清单

### 24.1 生产依赖（dependencies）

| 包名 | 版本 | 批次 | 用途 |
|------|------|------|------|
| `ws` | `^8.18.0` | P1 | WebSocket 服务端 |
| `@types/ws` | `^8.5.0` | P1 | WS 类型定义 |
| `otpauth` | `^9.3.0` | P2 | TOTP 双因素认证 |
| `swagger-jsdoc` | `^6.2.0` | P2 | OpenAPI 文档生成（待验证 Express 5 兼容性） |
| `swagger-ui-express` | `^5.0.0` | P2 | Swagger UI（待验证 Express 5 兼容性） |
| `dotenv` | `^16.0.0` | P0（前置） | 环境变量加载 |

### 24.2 开发依赖（devDependencies）

| 包名 | 版本 | 批次 | 用途 |
|------|------|------|------|
| `supertest` | `^7.0.0` | P0 | 集成测试 HTTP 客户端 |
| `@types/supertest` | `^6.0.0` | P0 | supertest 类型定义 |

---

## 25. 运行时注意事项

### 25.1 进程信号处理（Graceful Shutdown）

当前 `server.ts` 无进程信号处理。二期需在 P1（WebSocket 上线时）添加：

```typescript
// server.ts 末尾追加
function gracefulShutdown() {
  logger.info('SIGTERM received, shutting down gracefully');
  wss?.clients.forEach(ws => ws.close(1001, 'server shutting down'));
  server.close();
  prisma.$disconnect().then(() => process.exit(0));
  // 10s 强制退出兜底
  setTimeout(() => process.exit(1), 10_000);
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
```

**影响范围**：P1 批次，与 `createServer` 重构一起实施。

### 25.2 Cron 任务重叠防护

备份 Service 需维护 `isBackupRunning` 内存标志（或使用 manifest 的 `status: 'in_progress'`）。备份开始时设置为 `true`，完成/失败后重置。若标志已为 `true` 则返回 `BACKUP_001`。

审计清理、通知清理同理——内存标志防重叠。

### 25.3 backup_manifest.json 写入原子性

写入流程：
1. 写入临时文件 `backup_manifest.json.tmp`
2. `fs.renameSync(tmpPath, manifestPath)` — rename 在同文件系统上是原子操作
3. 启动时读取 manifest 失败 → 记录警告日志 → 扫描备份目录重建 manifest（降级恢复）

### 25.4 WebSocket 认证时序

前端在建立 WebSocket 连接前，应先检查 accessToken 有效期。若剩余时间 <30s，先调用 `/auth/refresh` 刷新 token 后再建立连接，避免在 10s 认证窗口内 token 过期。

### 25.5 性能监控环形缓冲区

- 10000 条 FIFO 环形缓冲区，每条记录约 50 字节，总内存约 500KB
- P50/P95/P99 为全局聚合值（一期），按端点分组作为后续优化
- 服务重启后清零（可接受，文档明确说明）

### 25.6 Prisma 连接池

当前 `DATABASE_URL` 未指定 `connection_limit`。二期 P0 前置需在 URL 中添加 `?connection_limit=30`（与 Phase 1 spec §9.2 一致）。WebSocket 上线后数据库并发查询增加，默认连接池（`num_cpus*2+1`）在 Docker 容器中仅 3-5 个连接，不够用。

---

## 26. 跨 Spec 一致性补充

### 26.1 错误码注册策略

二期新增约 20 个错误码，注册到 `appError.ts` 的 `ERROR_CODES` 和 `ERROR_MESSAGES` 对象中，按注释分组（认证、审计、备份、导入、WebSocket、重置、2FA）。不需要拆分文件，保持一期单文件模式。

shared 包需新增 `errorCodes.ts` 导出所有错误码常量和类型定义，供前端引用。

### 26.2 DTO 命名约定

二期 DTO 命名与一期保持一致，不加 `DTO` 后缀：
- `AuditLogDTO` → `AuditLog`
- `BackupDTO` → `Backup`
- `DashboardDTO` → `Dashboard`
- `ImportResultDTO` → `ImportResult`
- `NotificationDTO` → `Notification`
- `AuditLogQueryDTO` → `AuditLogQuery`（请求参数类型）
- `WSMessage` 保持不变

### 26.3 AuditLog.detail 序列化

Prisma 模型中 `detail` 为 `String?`，存储 JSON 字符串。Service 层查询后需 `JSON.parse(detail)` 转为结构化对象再返回 API。写入时使用 `JSON.stringify({ before, after })` 序列化。

### 26.4 审计中间件 res.json 说明

"V1 验证过的 res.json monkey-patch 模式"指在当前 Express 5 环境下验证（项目从一开始使用 Express 5），不是从 Express 4 迁移的遗留验证。

### 26.5 server.ts 导出与测试兼容

P1 重构 `createServer` 时，将启动逻辑抽取为 `startServer()` 函数：

```typescript
export function startServer() {
  startSessionCleaner();
  server.listen(PORT, () => logger.info(...));
}

// 仅非测试环境自动启动
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export { app, server, startServer };
```

集成测试 `import { app }` 无需启动真实端口，WS 测试 `import { server }` 可手动调用 `startServer()`。

### 26.6 生产环境日志格式

P0 前置需完善 `logger.ts`：生产环境（`NODE_ENV === 'production'`）使用 `winston.format.json()` 替代 `printf` 格式，便于日志收集系统解析。开发环境保持 `colorize + printf` 不变。

### 26.7 env.ts 新变量注册方式

| 变量 | 注册方式 | 默认值 |
|------|---------|--------|
| `AUDIT_RETENTION_DAYS` | `parseInt(X \|\| '90', 10)` | 90 |
| `BACKUP_CRON` | `process.env.X \|\| '0 2 * * *'` | — |
| `BACKUP_RETENTION_DAYS` | `parseInt(X \|\| '30', 10)` | 30 |
| `BACKUP_DIR` | `process.env.X \|\| '/data/backups'` | — |
| `WS_HEARTBEAT_INTERVAL` | `parseInt(X \|\| '30000', 10)` | 30000 |
| `WS_AUTH_TIMEOUT` | `parseInt(X \|\| '10000', 10)` | 10000 |
| `IMPORT_MAX_SIZE_JSON` | `parseInt(X \|\| '52428800', 10)` | 50MB |
| `IMPORT_MAX_SIZE_CSV` | `parseInt(X \|\| '20971520', 10)` | 20MB |
| `RATE_LIMIT_BACKUP_MAX` | `parseInt(X \|\| '5', 10)` | 5 |
| `RATE_LIMIT_RESTORE_MAX` | `parseInt(X \|\| '2', 10)` | 2 |
| `RATE_LIMIT_EXPORT_MAX` | `parseInt(X \|\| '3', 10)` | 3 |
| `RATE_LIMIT_IMPORT_MAX` | `parseInt(X \|\| '5', 10)` | 5 |
| `PASSWORD_RESET_TOKEN_EXPIRES_HOURS` | `parseInt(X \|\| '1', 10)` | 1 |
| `PASSWORD_RESET_MAX_PER_USER` | `parseInt(X \|\| '3', 10)` | 3 |

### 26.8 NotificationQueue 字段命名修正

`read` 字段改为 `isRead`，与一期布尔字段命名约定（`isActive`）保持一致：

```prisma
model NotificationQueue {
  // ...
  isRead    Boolean  @default(false) @map("is_read")
  // ...
}
```

### 26.9 PasswordResetToken.tokenHash 唯一约束冲突处理

`tokenHash` 唯一约束冲突时，`handlePrismaUniqueViolation` 中添加映射：返回 `SYS_001`（内部错误），因为 tokenHash 是随机哈希，冲突意味着极端概率事件。与一期 Session 表 tokenHash 处理一致。
