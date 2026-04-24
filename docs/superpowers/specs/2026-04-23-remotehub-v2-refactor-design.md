# RemoteHub V2 重构设计文档

**版本**: v1.23（R22 技术假设验证修订）
**日期**: 2026-04-24
**状态**: R22 审计通过 + Spec 自检通过

---

## 1. 背景与目标

### 1.1 现状诊断

RemoteHub 是一个团队远程协作平台，用于管理 RDP/SSH/VNC/VPN 等远程连接资源。当前项目存在以下问题：

- **双轨分裂**：前端使用 localStorage 存储，后端有完整 API 但未打通
- **垃圾文件堆积**：约 40+ 个无用文件（调试日志、快照、.updated 副本等）
- **TypeScript 严格模式关闭**：`strict: false`，丧失类型安全
- **零测试**：前后端均无测试
- **部署配置缺失**：无 Docker、CI/CD、HTTPS 配置
- **数据库 Mock 模式**：Redis 和 WebSocket 均为内存 Mock

### 1.2 重构目标

- 支持公司服务器一键部署（Windows + Linux 双平台）
- 支持 MySQL（开发+生产统一）无缝切换
- 外网暴露安全（HTTPS、JWT、密码加密、速率限制）
- 支撑几百人并发使用
- 长期可维护、可扩展

### 1.3 部署场景

- 公司内网服务器部署，开放外网访问
- 远程办公人员通过外网浏览器访问
- 峰值并发：几十至几百人

---

## 2. 整体架构

### 2.1 Monorepo 结构

```
remotehub/
├── packages/
│   ├── shared/                # 共享类型和常量
│   │   ├── src/
│   │   │   ├── types.ts       # User, Project, Connection 等接口
│   │   │   ├── enums.ts       # Protocol, UserRole, VpnType 等
│   │   │   ├── constants.ts   # 共享常量
│   │   │   └── validators.ts  # 共享验证逻辑（密码复杂度、字段非空、枚举值校验）
│   │   ├── dist/              # 编译输出
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   ├── backend/               # Express + Prisma API
│   │   ├── prisma/
│   │   │   ├── schema.prisma  # 数据库模型定义
│   │   │   └── seed.ts        # 种子数据脚本
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── config/
│   │   │   ├── middleware/
│   │   │   ├── controllers/
│   │   │   ├── services/
│   │   │   ├── routes/
│   │   │   └── utils/
│   │   ├── tests/
│   │   └── package.json
│   │
│   └── frontend/              # React + Vite
│       ├── src/
│       │   ├── components/    # 保留现有 UI 组件
│       │   ├── services/      # 统一 API 客户端
│       │   ├── hooks/
│       │   └── App.tsx
│       ├── tests/
│       └── package.json
│
├── docker/
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── caddy/
│       └── Caddyfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── pnpm-workspace.yaml           # packages: ['packages/*'] + injectWorkspacePackages: true + syncInjectedDepsAfterScripts: [build]
├── package.json
└── scripts/
    ├── deploy.ps1             # Windows 一键部署
    └── deploy.sh              # Linux 一键部署
```

### 2.2 技术选型

| 层次 | 技术 | 说明 |
|------|------|------|
| 包管理 | pnpm workspace | Monorepo 管理 |
| 共享类型 | TypeScript 共享包 | 前后端类型统一 |
| 后端框架 | **Express 5** + TypeScript | 从 v4 升级到 v5（v5.2.1 已 GA） |
| ORM | **Prisma 6.x** | 替代 TypeORM；不用 v7（生产稳定性争议） |
| 前端框架 | React 19 + Vite | 保留现有 |
| 前端 API 客户端 | 统一 HTTP 客户端 + **TanStack Query** | 删除 localStorage 模式，TanStack Query 管理服务端状态 |
| 反向代理 | **Caddy** | 替代 Nginx——自动 HTTPS（Let's Encrypt），配置更简单 |
| 容器化 | Docker Compose | 一键部署 |
| 测试 | **Vitest（前后端统一）** | 从零建立，统一测试框架 |

**后端运行时依赖**（补充上表，具体用途见对应章节）：
| 库 | 用途 | 章节 |
|------|------|------|
| bcryptjs | 密码哈希（纯 JS，Alpine 兼容） | §5.2 |
| cookie-parser | Cookie 解析（Express 不内置，refresh token 依赖 `req.cookies`） | §5.1 |
| helmet | HTTP 安全头 | §5.4 |
| express-rate-limit | Per-IP/Per-User 速率限制 | §5.3 |
| winston | 结构化日志（JSON 格式 + 轮转） | §9.4 |
| node-cron | 定时任务（Session 清理） | §9.5 |
| cors | CORS 中间件（仅前后端分离部署时启用） | §9.1 |

### 2.3 技术选型验证记录（2026-04-23）

| 决策 | 验证结果 | 来源 |
|------|---------|------|
| Prisma 6.x 而非 7.x | v7.7.0 有社区报告生产问题（Issue #28845 性能倒退、Reddit 生产不稳定报告） | GitHub/Reddit |
| Express 5 | v5.2.1 GA，2025.3 成为 npm 默认版本，生态已兼容 | npm/expressjs.com |
| Caddy 替代 Nginx | 自动 HTTPS（Let's Encrypt），配置比 Nginx+certbot 简单得多，Docker 集成好 | 社区对比文章 |
| Drizzle ORM 排除 | 不支持 SQL Server，只支持 PostgreSQL/MySQL/SQLite | MikroORM GitHub Discussion #7176 |
| bcryptjs 替代 bcrypt | 2026 共识：Argon2id 理论更优但需原生模块（跨平台风险）。bcryptjs 是 OWASP 推荐 bcrypt 算法的纯 JS 实现，无需 python/make/g++ 编译，Alpine 镜像零依赖 | OWASP/密码哈希指南 |
| Vitest 统一 | 2026 年 Vitest 已完全成熟，前后端统一更简单 | 社区共识 |
| TanStack Query | 服务端状态管理最佳实践，替代手动 fetch+useState | React 社区推荐 |

### 2.4 Prisma 技术约束

**版本锁定：Prisma 6.x**（不用 v7，原因见 2.3 验证记录）

**数据库策略（关键决策）：MySQL 统一，SQLite 仅限快速体验**

Prisma 的迁移系统生成的 SQL 是 provider 特定的，**无法跨数据库类型复用**（如 SQLite 的建表语句无法在 MySQL 上执行）。因此：

| 环境 | 数据库 | provider | 说明 |
|------|--------|----------|------|
| 开发 | MySQL（Docker） | `mysql` | 与生产一致，迁移文件可直接复用 |
| 生产 | MySQL | `mysql` | 默认生产数据库 |
| 生产（可选） | SQL Server | `sqlserver` | 需维护独立的迁移目录，见下方说明 |
| 快速体验 | SQLite | `sqlite` | **仅限零配置演示**，不参与迁移流程 |

**开发环境**：
- `docker-compose.dev.yml` 提供 MySQL 服务（端口 3306，数据卷持久化）
- `schema.prisma` 中 `provider = "mysql"`，`DATABASE_URL=mysql://root:root@localhost:3306/remotehub_dev`
- 使用 `prisma migrate dev` 生成迁移文件，这些文件在生产环境直接通过 `prisma migrate deploy` 应用

**生产环境**：
- `docker-compose.yml` 使用 MySQL 8.0 服务
- Dockerfile.backend 无需 provider 替换，直接使用 MySQL provider
- 迁移文件由开发环境生成，生产通过 `prisma migrate deploy` 安全应用

**SQL Server 支持（非默认，需要额外配置）**：
- 需要独立的 `prisma/sqlserver-migrations/` 迁移目录
- 开发时切换 provider 为 sqlserver，单独生成迁移文件
- 需要独立构建流程（切换 schema provider 后重新 build）
- 建议在确认需要 SQL Server 时再建立此流程

**schema 设计原则**：
- 不用 JSON、Enum 数据库类型（用 String + 应用层验证）
- 不用 `@db.Text`（MySQL/PostgreSQL 专有，SQL Server 不支持）
- 长文本字段不指定 native type，使用 Prisma 默认映射
- `@db.VarChar(N)` 仅用于纯 ASCII 字段（username、host、protocol 等）
- 可能含中文的字段（nickname、name、notes 等）不指定 `@db.VarChar`，确保 SQL Server 使用 NVARCHAR

Prisma 7.x 变更备注（供未来升级参考）：
- 移除 Rust 引擎，纯 TypeScript
- 新增 `prisma.config.ts` 替代 schema.prisma 中的 env()
- 移除自动 .env 加载
- 等待 v7 生产稳定性确认后再评估升级

---

## 3. 数据模型

### 3.1 Prisma Schema（第一期）

共 5 个表：users, sessions, projects, project_members, connections。

```prisma
datasource db {
  provider = "mysql"  // 开发和生产统一使用 MySQL
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id           String    @id @default(uuid())
  username     String    @unique @db.VarChar(50)     // 仅 ASCII
  nickname     String                       // 可能含中文，不指定 @db.VarChar（SQL Server 需 NVARCHAR）
  passwordHash String    @map("password_hash")
  role         String    @default("user") @db.VarChar(20)  // "admin" | "user"（仅 ASCII）
  isActive     Boolean   @default(true) @map("is_active")
  lastActiveAt DateTime? @map("last_active_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  projects    ProjectMember[]
  sessions    Session[]

  @@index([role])
  @@map("users")
}

model Session {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  tokenHash String   @unique @map("token_hash")
  userAgent String?  @db.VarChar(500) @map("user_agent")
  ip        String?  @db.VarChar(45)
  expiresAt  DateTime  @map("expires_at")
  createdAt  DateTime  @default(now()) @map("created_at")
  consumedAt DateTime? @map("consumed_at")  // Refresh token 轮换标记：null=有效，非null=已消耗

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])                // 用于定期清理过期 session
  @@map("sessions")
}

model Project {
  id          String   @id @default(uuid())
  name        String                     // 可能含中文，不指定 @db.VarChar（SQL Server 需 NVARCHAR）
  description String?                   // 不指定 @db.Text（SQL Server 不支持），使用默认映射
  icon        String   @default("folder") @db.VarChar(50)  // 预设图标名称，默认 "folder"
  createdBy   String   @map("created_by")
  updatedBy   String   @map("updated_by")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  members     ProjectMember[]
  connections Connection[]

  @@unique([name])  // 项目名称全局唯一
  @@map("projects")
}

model ProjectMember {
  id        String   @id @default(uuid())
  projectId String   @map("project_id")
  userId    String   @map("user_id")
  role      String   @default("viewer") @db.VarChar(20)  // "owner" | "editor" | "viewer"
  addedAt   DateTime @default(now()) @map("added_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([userId])                    // 高频查询：用户所属项目、连接访问范围、删除 owner 检查
  @@map("project_members")
}

model Connection {
  id            String    @id @default(uuid())
  projectId     String    @map("project_id")
  name          String                       // 可能含中文，不指定 @db.VarChar（SQL Server 需 NVARCHAR）
  host          String    @db.VarChar(255)
  port          Int?
  username      String?   @db.VarChar(100)
  encryptedPass String?   @db.VarChar(500) @map("encrypted_password")  // AES-256-GCM 加密后 Base64 存储（v1:iv:ciphertext:authTag），见 §9.6。需显式指定长度：Prisma String 默认映射 MySQL VARCHAR(191)，加密后可能超限
  protocol      String    @db.VarChar(30)
  vpnType       String?   @db.VarChar(30) @map("vpn_type")
  vpnLoginUrl   String?   @db.VarChar(500) @map("vpn_login_url")
  requiredVpnId String?   @map("required_vpn_id")
  notes         String?                    // 不指定 @db.Text（SQL Server 不支持），使用默认映射
  tags          String?                    // 逗号分隔，不指定 @db.VarChar(500) 保持跨 provider 兼容
  lastAccessed  DateTime? @map("last_accessed")
  createdBy     String    @map("created_by")
  updatedBy     String    @map("updated_by")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  // 自引用：此连接依赖的 VPN 连接（onDelete: SetNull：VPN 被删除时依赖者的 requiredVpnId 置空）
  // 单连接删除由 Service 层检查 dependents → CONN_004 阻止；项目级联删除时 SetNull 安全生效
  requiredVpn  Connection?  @relation("VpnDependency", fields: [requiredVpnId], references: [id], onDelete: SetNull)
  // 反向：依赖此 VPN 的其他连接
  dependents   Connection[] @relation("VpnDependency")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([requiredVpnId])
  @@unique([projectId, name])  // 同一项目内连接名称唯一
  @@map("connections")
}
```

**VPN 依赖约束**：

Connection 的 `requiredVpnId` 实现自引用关联，表示"此连接依赖某 VPN"。约束规则：

1. **同项目限制**：`requiredVpnId` 只能引用**同一项目内**的连接。Service 层在设置依赖时，必须验证目标连接的 `projectId` 与当前连接相同。跨项目依赖会导致权限隔离被绕过（用户 A 的项目连接依赖用户 B 的项目 VPN，用户 B 删除 VPN 影响用户 A）。
2. **循环依赖防护**：Service 层在设置 `requiredVpnId` 时必须检测是否形成环（A→B→A）。实现方式：递归向上查找依赖链（最大深度 10 层，超出返回 `CONN_003`），若遇到自身则拒绝。只有 `protocol = 'VPN'` 的连接才能被引用为依赖目标。
3. **删除保护**：Service 层在删除连接前检查 `dependents` 非空时返回友好错误（`CONN_004: 该VPN仍被其他连接依赖，请先解除依赖`）。数据库层通过 `onDelete: SetNull` 作为兜底（而非 Restrict），确保项目级联删除（`DELETE Project → CASCADE Connection`）不会因自引用关系被阻断。Service 层的 CONN_004 检查是主要防护，SetNull 仅在 Service 检查被绕过时（如竞态条件）或项目整体删除时生效。
4. **Protocol 降级保护**：当 PATCH 将连接的 protocol 从 `VPN` 改为非 VPN 时，Service 层必须先检查 `dependents` 是否非空。若仍有其他连接依赖此 VPN，返回 `CONN_004`（与删除保护同一错误码），要求用户先解除所有依赖后再变更 protocol。此规则确保依赖目标始终是 `protocol = 'VPN'` 的连接。
5. **禁止自引用**：`requiredVpnId` 不能等于自身 `id`，由 Service 层校验。
6. **目标不存在**：Service 层在设置 `requiredVpnId` 时，若目标连接 ID 在数据库中不存在（可能被并发删除或 ID 无效），返回 `CONN_002`（404，连接不存在）。此检查必须在其他约束（同项目、VPN 协议、循环依赖）之前执行

**VPN 相关字段一致性校验**：Service 层在创建/更新 Connection 时，必须验证以下规则：
- 若 `protocol !== 'VPN'`：`vpnType`、`vpnLoginUrl`、`requiredVpnId` 必须为 null。**当 PATCH 将 protocol 从 VPN 改为非 VPN 时，Service 层自动将这三个字段置为 null**（无需客户端显式传入）
- 若 `protocol === 'VPN'`：`vpnType` 必须非 null（VPN 连接必须指定 VPN 类型）；`requiredVpnId` 必须为 null（VPN 连接不能依赖另一个 VPN，防止依赖链过深）
- 违反以上规则返回 `VAL_001` 验证错误

**Connection 字段校验规则**：Service 层在创建/更新 Connection 时，必须验证以下字段：
- `port`：若非 null，必须在 1-65535 范围内（Schema `Int?` 不限制范围，需应用层校验）
- `protocol`：必须为 `PROTOCOLS` 枚举值之一
- `host`：非空且长度 ≤ 255
- `name`：非空且长度 ≤ 200
- `password`（明文连接密码，非 encryptedPass）：若非 null，长度 ≤ 200（加密后 Base64+版本前缀约 500 字符，适配 `@db.VarChar(500)` 存储）
- `tags`：若非 null，长度 ≤ 500
- 违反以上规则返回 `VAL_001` 验证错误

**Project 字段校验规则**：Service 层在创建/更新 Project 时，必须验证以下字段：
- `name`：非空且长度 ≤100（全局唯一，由 `@@unique([name])` 约束）
- `description`：若非 null，长度 ≤2000
- `icon`：若非 null，必须为预设图标名称之一（具体枚举值在 `shared/constants.ts` 定义）
- 违反以上规则返回 `VAL_001` 验证错误

**User 字段校验规则**（适用于注册和管理员修改）：
- `username`：长度 3-50，仅允许字母、数字、下划线（正则 `^[a-zA-Z0-9_]+$`）
- `nickname`：非空且长度 ≤50
- `password`：长度 8-128，必须含大小写字母和数字（见 §11.4 密码复杂度规范）
- `role`：必须是 `USER_ROLES` 枚举值之一
- 违反以上规则返回 `VAL_001` 验证错误

### 3.2 枚举值定义（应用层常量）

以下值存储为 String，在 `shared/enums.ts` 中定义为联合类型的常量数组，应用层验证。

```typescript
// shared/src/enums.ts

/** 远程连接协议 */
export const PROTOCOLS = [
  'RDP', 'SSH', 'VNC',            // 标准远程桌面/终端
  'HTTP', 'HTTPS',                 // Web 连接
  'VPN',                           // VPN 连接
  'TODESK', 'SUNLOGIN',            // 国内远程工具
  'TEAMVIEWER', 'ANYDESK',         // 国际远程工具
] as const;
export type Protocol = typeof PROTOCOLS[number];

/** VPN 类型（仅 protocol=VPN 时有效） */
export const VPN_TYPES = [
  'SSL_VPN', 'IPSEC', 'WIREGUARD', 'OPENVPN', 'OTHER',
] as const;
export type VpnType = typeof VPN_TYPES[number];

/** 用户角色 */
export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = typeof USER_ROLES[number];

/** 项目成员角色 */
export const MEMBER_ROLES = ['owner', 'editor', 'viewer'] as const;
export type MemberRole = typeof MEMBER_ROLES[number];
```

### 3.3 Prisma 类型与 shared 包的类型分工

避免 Prisma 生成类型和 shared 手写类型重复/冲突的策略：

| 类型来源 | 内容 | 用途 |
|---------|------|------|
| Prisma Client（backend 生成） | 数据库模型类型（User, Project, Connection 等） | 后端 Service 层使用 |
| shared/src/types.ts | API 请求/响应 DTO 类型（LoginRequest, CreateUserDTO, ApiResponse 等） | 前后端共享 |
| shared/src/enums.ts | 枚举常量和联合类型（Protocol, UserRole 等） | 前后端共享，后端 Controller 做验证 |

**原则**：Prisma 生成的数据库类型不出现在 shared 包中。后端 Service 层将 Prisma 类型转换为 shared 定义的 DTO 类型后再返回给前端。这样 Prisma schema 变化不会直接暴露给前端。

---

## 4. API 设计

```
# 认证
POST   /api/v1/auth/login          # 登录（请求体: { username, password }）
POST   /api/v1/auth/register       # 创建新用户（仅管理员可调用，请求体: { username, nickname, password, role? }，role 可选，默认 "user"）
POST   /api/v1/auth/refresh        # 刷新令牌
POST   /api/v1/auth/logout         # 登出
GET    /api/v1/auth/me             # 当前用户信息（返回: { id, username, nickname, role, isActive, lastActiveAt, createdAt }，strip passwordHash）
POST   /api/v1/auth/change-password # 修改密码（请求体: { oldPassword: string, newPassword: string }，两者必填；oldPassword 验证失败返回 AUTH_001（401，与登录错误码一致，不暴露失败原因）；newPassword 需满足密码复杂度规范 §11.4，验证失败返回 VAL_001）
PATCH  /api/v1/auth/profile         # 更新当前用户资料（请求体: { nickname }，仅 nickname 可修改；响应同 GET /auth/me 格式：{ id, username, nickname, role, isActive, lastActiveAt, createdAt }）

# 用户管理
GET    /api/v1/users               # 用户列表（管理员，支持分页 ?page=&pageSize=）
GET    /api/v1/users/search?q=     # 用户搜索（项目成员可调用，返回 { id, username, nickname }，用于添加成员；q 参数最少 1 字符，模糊匹配 username/nickname，最多返回 20 条，不分页）
GET    /api/v1/users/:id           # 用户详情
PATCH  /api/v1/users/:id           # 更新用户
DELETE /api/v1/users/:id           # 删除用户（管理员）

# 项目管理
GET    /api/v1/projects            # 项目列表（支持分页 ?page=&pageSize=）
POST   /api/v1/projects            # 创建项目（请求体: { name, description?, icon? }，createdBy/updatedBy 由 Service 层自动设置为当前用户 ID）
GET    /api/v1/projects/:id        # 项目详情
PATCH  /api/v1/projects/:id        # 更新项目
DELETE /api/v1/projects/:id        # 删除项目

# 项目成员
GET    /api/v1/projects/:id/members       # 成员列表（支持分页 ?page=&pageSize=）
POST   /api/v1/projects/:id/members       # 添加成员
PATCH  /api/v1/projects/:id/members/:uid  # 更新角色（请求体: { role: MemberRole }）
DELETE /api/v1/projects/:id/members/:uid  # 移除成员

# 连接管理
GET    /api/v1/connections         # 连接列表（?projectId= 过滤，支持分页 ?page=&pageSize=；不带 projectId 时 admin 返回全部，非 admin 返回用户所有已加入项目的连接）
POST   /api/v1/connections         # 创建连接（请求体: { projectId, name, host, port?, username?, password?, protocol, vpnType?, vpnLoginUrl?, requiredVpnId?, notes?, tags? }，password 由 Service 层加密为 encryptedPass，createdBy/updatedBy 自动设置）
GET    /api/v1/connections/:id     # 连接详情
PATCH  /api/v1/connections/:id     # 更新连接（password 字段三种处理：① 缺席=不更新 ② null=清除加密密码（encryptedPass 置 null） ③ 非空字符串=加密后更新 encryptedPass）
DELETE /api/v1/connections/:id     # 删除连接
POST   /api/v1/connections/:id/decrypt-password # 解密连接密码（owner/editor/admin）

# 健康检查
GET    /api/v1/health              # 健康检查
```

### 4.1 列表 API 规范

**默认排序**：所有列表端点默认按 `updatedAt DESC`（最近更新优先）。**例外**：`GET /projects/:id/members`（ProjectMember 无 `updatedAt` 字段）按 `addedAt DESC`（最近添加优先）。前端可通过 `?sort=createdAt&order=asc` 覆盖（一期可选，不强制实现）。

**返回字段**：
- **列表端点**（`GET /projects`、`GET /connections`、`GET /users`、`GET /projects/:id/members`）：返回**摘要字段**，不返回大文本字段（description、notes 等），减少传输量。具体摘要字段：
  - Project 列表：`id`、`name`、`icon`、`createdBy`（关联为 `{id, nickname}`）、`updatedBy`（关联为 `{id, nickname}`）、`createdAt`、`updatedAt`、当前用户在该项目的 `role`（从 ProjectMember 查询）
  - Connection 列表：`id`、`projectId`、`project`（关联为 `{ id, name }`）、`name`、`host`、`port`、`protocol`、`vpnType`、`requiredVpnId`、`tags`、`lastAccessed`、`createdBy`（关联为 `{id, nickname}`）、`updatedBy`（关联为 `{id, nickname}`）、`updatedAt`。不含 `encryptedPass`、`notes`、`vpnLoginUrl`、`username`。**`project` 关联**：跨项目视图（GET /connections 不带 projectId）时用户需知道连接归属项目，必须关联返回 `{ id, name }`
  - User 列表：`id`、`username`、`nickname`、`role`、`isActive`、`lastActiveAt`、`createdAt`。不含 `passwordHash`
  - ProjectMember 列表：`id`、`userId`、`role`、`addedAt`，关联查询用户的 `username`、`nickname`
- **详情端点**（`GET /projects/:id`、`GET /connections/:id`、`GET /users/:id`）：返回**所有标量字段**（除 passwordHash 和 encryptedPass 视角色而定）。**不包含关联集合**（如 `GET /projects/:id` 不含 members 列表，通过专用 `GET /projects/:id/members` 获取）。详情端点仅返回该资源自身的标量字段 + createdBy/updatedBy 的 `{ id, nickname }` 关联

**验证执行策略**：Controller 层对输入字段做**并行验证**，一次性收集所有错误（VAL_001 details 数组包含所有失败字段），不短路返回。这确保前端能一次展示所有需要修正的字段。

### 4.2 API 权限矩阵

| 端点组 | admin | owner | editor | viewer | 未登录 |
|--------|-------|-------|--------|--------|--------|
| POST /auth/login | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST /auth/register | ✅ | ❌ | ❌ | ❌ | ❌ |
| POST /auth/refresh | ✅ | ✅ | ✅ | ✅ | ✅（Cookie） |
| POST /auth/logout | ✅ | ✅ | ✅ | ✅ | ✅ |
| GET /auth/me | ✅ | ✅ | ✅ | ✅ | ❌ |
| POST /auth/change-password | ✅ | ✅ | ✅ | ✅ | ❌ |
| PATCH /auth/profile | ✅ | ✅（仅自己） | ✅（仅自己） | ✅（仅自己） | ❌ |
| GET /users | ✅ | ❌ | ❌ | ❌ | ❌ |
| GET /users/search | ✅ | ✅ | ✅ | ✅ | ❌ |
| GET /users/:id | ✅（任意用户） | — | — | — | ❌ |
| PATCH /users/:id | ✅（任意用户） | — | — | — | ❌ |
| DELETE /users/:id | ✅（任意用户） | — | — | — | ❌ |
| GET /projects | ✅（全部） | ✅（已加入） | ✅（已加入） | ✅（已加入） | ❌ |
| POST /projects | ✅ | ✅（任何已认证用户可创建） | ✅ | ✅ | ❌ |
| GET /projects/:id | ✅（任意） | ✅ | ✅ | ✅ | ❌ |
| PATCH /projects/:id | ✅（任意） | ✅ | ✅ | ❌ | ❌ |
| DELETE /projects/:id | ✅（任意） | ✅ | ❌ | ❌ | ❌ |
| GET /projects/:id/members | ✅（任意） | ✅ | ✅ | ✅ | ❌ |
| POST /projects/:id/members | ✅ | ✅ | ❌ | ❌ | ❌ |
| PATCH /projects/:id/members/:uid | ✅（任意成员） | ✅（任意成员） | ❌ | ❌ | ❌ |
| DELETE /projects/:id/members/:uid | ✅（任意成员） | ✅（任意成员） | ✅（仅自己退出） | ✅（仅自己退出） | ❌ |
| GET /connections | ✅（全部） | ✅ | ✅ | ✅ | ❌ |
| POST /connections | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET /connections/:id | ✅（任意） | ✅ | ✅ | ✅ | ❌ |
| PATCH /connections/:id | ✅（任意） | ✅ | ✅ | ❌ | ❌ |
| DELETE /connections/:id | ✅（任意） | ✅ | ✅ | ❌ | ❌ |
| POST /connections/:id/decrypt-password | ✅ | ✅ | ✅ | ❌ | ❌ |
| GET /health | ✅ | ✅ | ✅ | ✅ | ✅ |

**说明**：
- `admin` 拥有全局权限，可操作任意资源
- `owner/editor/viewer` 是项目级角色，仅对已加入的项目生效
- 用户只能访问自己所属项目的连接（通过 ProjectMember 关联判断）
- `POST /auth/register` 仅 admin 可调用（通过中间件检查 `req.user.role === 'admin'`）
- `POST /projects` 任何已认证用户均可创建（不依赖项目级角色，因为项目尚不存在）。创建者自动成为该项目的 owner（Service 层自动插入 ProjectMember 记录，role='owner'）
- **`DELETE /projects/:id`**：仅 **owner 和 admin** 可删除项目（级联删除所有连接和成员记录，不可逆）。editor 虽可修改项目信息（name/description/icon），但不可删除项目——删除是级联不可逆操作，权限高于编辑。一期不要求多人确认——项目 owner 对项目有完全控制权，admin 可介入恢复误操作（通过数据库备份）。此设计适用于几百人规模的组织
- **`POST /projects/:id/members` 请求体**：`{ "userId": string, "role": MemberRole }`。`userId` 必须是已存在的用户 ID（否则返回 `USER_002`）。`role` 必须为 `MEMBER_ROLES` 枚举值之一（owner/editor/viewer），否则返回 `VAL_001`
- **认证中间件行为**：所有需要认证的端点，中间件在验证 JWT 有效性后，**必须查询数据库获取用户记录**。若用户不存在（已被物理删除），返回 `AUTH_002`（401，与 token 无效统一处理）；若用户存在但 `isActive = false`，返回 `AUTH_005: 用户已被禁用`（403）。这防止了被删除/禁用用户继续使用有效 token 访问 API。同时，中间件以**节流方式**（每 5 分钟最多一次）更新 `user.lastActiveAt`（避免每次请求都写库）
- **全局中间件栈**（按挂载顺序，在所有路由之前执行）：
  1. `express.json({ limit: '1mb' })` — 解析 JSON 请求体（Express 5 内置但需显式启用），设置 `limit` 防止超大请求体 DoS
  2. `cookie-parser()` — 解析 Cookie（refresh token 依赖 `req.cookies`）
  3. `helmet()` — HTTP 安全头（见 §5.4）
  4. `express-rate-limit` — 速率限制（见 §5.3）
  5. `cors()` — CORS 中间件（仅前后端分离部署时启用，见 §9.1）
  6. `app.set('trust proxy', true)` — 信任 Caddy 反向代理的 `X-Forwarded-For` 头（见 §5.3）
- **权限执行机制**：API 权限通过三层中间件链实现：
  1. **`authMiddleware`**：验证 JWT → 根据 JWT 中的 userId 查询用户 → 附加 `req.user`（全局角色）。查询结果处理：
     - 用户不存在（已被物理删除）→ 返回 `AUTH_002`（401），与 token 无效统一处理，不暴露用户删除状态
     - 用户存在但 `isActive = false` → 返回 `AUTH_005`（403，用户已被禁用）
     - JWT 本身验证失败（无 `Authorization` 头、格式错误、签名无效、过期等）→ 统一返回 `AUTH_002`（401），不区分失败原因，防止攻击者通过不同错误响应探测 token 状态
  2. **`roleMiddleware(role)`**：检查全局角色（如 `POST /auth/register` 要求 admin）
  3. **`projectRoleMiddleware(minRole)`**：**admin 绕过**：若 `req.user.role === 'admin'`，直接 `next()` 不查询 ProjectMember（admin 不需要是项目成员即可操作）。非 admin 用户：从 URL 参数取 `projectId`/`connectionId` → 查询 ProjectMember → 检查项目级角色是否 ≥ minRole。**projectId 获取策略**：
     - URL 中含 `:id`（项目端点，如 `/projects/:id/members`）：直接使用 `req.params.id`
     - URL 中含 `:id`（连接端点，如 `/connections/:id`）：先查询 Connection 获取 `projectId`（`prisma.connection.findUnique({ where: { id } })`），再用 projectId 查 ProjectMember
     - `POST /connections`（projectId 在请求体中）：从 `req.body.projectId` 读取
     - `GET /connections?projectId=X`（projectId 在查询参数中）：从 `req.query.projectId` 读取，验证用户是否为该项目成员（或 admin 跳过检查）
     若 projectId 对应的项目不存在或用户不是该项目成员，统一返回 `AUTH_003`（403，不暴露项目是否存在），防止通过 projectId 枚举探测其他用户的项目
     **`GET /connections` 不带 projectId 时的特殊处理**：不使用 `projectRoleMiddleware`，由 Service 层根据用户角色过滤数据——admin 返回所有连接，非 admin 通过 JOIN `project_members` 返回用户已加入项目的连接。此路径仅需 `authMiddleware`
- **用户删除保护**：`DELETE /users/:id` 执行前，Service 层必须检查：
  1. 该用户是否是任何项目的**唯一 owner**（`ProjectMember` 中 `userId = :id AND role = 'owner'`，且该项目无其他 owner）。如果是唯一 owner，返回错误（`MEMBER_003: 该用户是项目唯一owner，请先转让所有权`）
  2. **禁止 admin 删除自己**（`req.params.id === req.user.id` 时返回 `AUTH_003`，403）。防止系统失去管理员
  3. **禁止删除最后一个 admin**：Service 层在删除前检查 `User` 表中 `role = 'admin' AND isActive = true` 的数量，若目标用户是 admin 且只剩 1 个，返回 `AUTH_003`（403，"系统必须至少保留一个管理员"）
  非唯一 owner 的非 admin 用户可正常删除（其 ProjectMember 记录通过 `onDelete: Cascade` 自动清除）
- **管理员修改用户字段（PATCH /users/:id）**：仅 admin 可调用。可修改字段：`nickname`（非空，长度 ≤50）、`role`（必须为 `USER_ROLES` 枚举值）、`isActive`（Boolean）。不可修改字段遵循不可变字段规范（`id`、`username`、`createdAt`）。`updatedAt` 由 Prisma `@updatedAt` 自动管理。**额外约束**：
  - 若将用户 role 从 `admin` 改为 `user`，Service 层必须检查系统中 admin 数量 ≥ 2，否则返回 `AUTH_003`（403，"系统必须至少保留一个管理员"）
  - 若将用户 `isActive` 设为 `false`，且该用户是最后一个 admin，同样返回 `AUTH_003`
  - **Admin 自我禁用**：Admin 可以通过 `PATCH /users/:id { isActive: false }` 禁用自己（只要系统中仍有其他 admin）。此操作立即生效（authMiddleware 下次查询到 `isActive=false` 返回 AUTH_005）。与 `DELETE /users/:id` 的自保护不同——禁用可逆（其他 admin 可重新启用），删除不可逆
- **项目成员角色变更规则**：
  - 只有 owner 和 admin 可以变更成员角色（admin 通过 projectRoleMiddleware 全局绕过，无需是项目成员）
  - owner 不能将自己降级（如果自己是最后一个 owner）
  - 变更后项目必须始终至少保留一个 owner（Service 层在 PATCH 前校验）
  - 角色可跨级变更：viewer → owner、editor → viewer 均允许
- **成员移除/退出规则**（`DELETE /projects/:id/members/:uid`）：
  - **admin**：可移除任意项目的任意成员
  - **owner**：可移除同项目的任意成员（包括自己退出，但受 MEMBER_002 保护——不能退出自己是最后一个 owner 的项目）
  - **editor/viewer**：只能移除自己（`uid` 必须等于 `req.user.id`，即自行退出项目），不能移除其他人
  - Service 层在删除 ProjectMember 记录前校验 MEMBER_002
- **连接密码字段隔离**：`encryptedPass` 字段在数据库中存储 AES-256-GCM 加密后的密文。API 行为如下：
  - **viewer 角色**：`GET /connections/:id` 返回时 Service 层自动 strip `encryptedPass` 字段，不返回任何密码信息
  - **owner/editor 角色**：`GET /connections/:id` 返回加密密文（前端按需调用解密接口展示）
  - **所有列表 API**（`GET /connections?projectId=`）：均不返回 `encryptedPass`
  - **明文密码不在常规 API 响应中返回**：`GET /connections` 列表和 `GET /connections/:id` 详情均不返回明文密码。前端需要展示密码时，调用专用解密接口（`POST /api/v1/connections/:id/decrypt-password`），该接口返回明文密码（`{ "password": "..." }`），前端仅在内存中使用，**不持久化到 localStorage 或任何存储**
  - **lastAccessed 更新机制**：`GET /connections/:id`（连接详情）和 `POST /connections/:id/decrypt-password`（解密密码）时，Service 层以节流方式更新 `lastAccessed`（同一用户对同一连接，5 分钟内最多更新一次），用于"最近使用"排序展示
  - **不可变字段规范**：以下字段仅在创建时设置，PATCH 端点**必须忽略**（即使客户端传入也不更新）：
    - Connection: `id`, `projectId`（防止跨项目移动绕过权限）, `createdBy`, `createdAt`
    - Project: `id`, `createdBy`, `createdAt`
    - User: `id`, `username`（用户名不可修改，因其作为登录凭证）, `createdAt`
    - `updatedBy` 字段由 Service 层自动设置为当前用户 ID，不接受客户端传入
    - **实现机制**：Service 层使用**白名单过滤**（仅提取允许修改的字段构造 update data），而非黑名单排除。白名单方式确保即使客户端传入未知字段，也不会意外写入数据库。具体白名单见"PATCH 可修改字段"规范
  - **PATCH 可修改字段**（补充上方不可变规范的正面列表）：
    - Project（`PATCH /projects/:id`）：`name`、`description`、`icon`
    - Connection（`PATCH /connections/:id`）：`name`、`host`、`port`、`username`、`password`（可选：字段缺席=不更新、`null`=清除加密密码、非空字符串=加密后更新）、`protocol`、`vpnType`、`vpnLoginUrl`、`requiredVpnId`、`notes`、`tags`
    - User 管理员修改（`PATCH /users/:id`）：见上方管理员修改用户字段说明
    - 用户自修改（`PATCH /auth/profile`）：`nickname`

---

## 5. 安全设计

### 5.1 认证流程

**登录响应**：accessToken 通过 JSON 响应体返回，refreshToken 通过 `Set-Cookie` 头设置（不在响应体中出现）。

**Login 验证**：Service 层按以下顺序验证，**全程返回 AUTH_001**（401，统一错误码防止用户名枚举）：
1. 根据用户名查找用户，若不存在 → AUTH_001
2. 验证密码，若不匹配 → AUTH_001
3. 检查 `user.isActive`，若为 `false` → AUTH_001（不暴露账户禁用状态）

这是 authMiddleware 之外的第二道防线——防止被禁用用户通过登录获取新 token。

登录成功后，Service 层创建 Session 记录，包含 `userId`、`tokenHash`（refreshToken 的 SHA-256 哈希）、`userAgent`（从 `req.headers['user-agent']` 提取，最长 500 字符截断）、`ip`（从 `req.ip` 提取）、`expiresAt`（当前时间 + `JWT_REFRESH_EXPIRES_IN`）。

```
POST /auth/login
→ 响应体: { success: true, data: { accessToken, user } }  // user 对象字段与 GET /auth/me 一致：{ id, username, nickname, role, isActive, lastActiveAt, createdAt }，strip passwordHash 和 updatedAt
→ 响应头: Set-Cookie: refreshToken=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth; Max-Age=604800
```

**Token 存储位置**：

| Token | 存储位置 | 过期时间 | 说明 |
|-------|---------|---------|------|
| accessToken | 前端内存（JS 变量，非 localStorage） | 15 分钟 | 页面刷新后丢失，需通过 refresh 重新获取 |
| refreshToken | HTTP-only Cookie（浏览器自动管理） | 7 天 | 前端 JS 无法读取，防止 XSS 窃取 |

**JWT 载荷结构**：accessToken 的 JWT payload 仅包含 `{ userId: string }`。**不包含 `role`、`username` 等可变字段**——这些信息由 authMiddleware 每次请求时从数据库实时查询（见 §4.2 认证中间件行为），确保角色变更、用户禁用等操作在当前 token 有效期内立即生效，无需等待 token 过期。refreshToken 不使用 JWT，而是随机生成的 opaque token，通过 SHA-256 哈希后存储在 Session 表中。

**请求流程**：
```
API请求 → Authorization: Bearer <accessToken>
Token过期（401）→ POST /auth/refresh → 浏览器自动携带 Cookie
→ 响应体返回新 accessToken + Set-Cookie 设置新 refreshToken
→ 前端用新 accessToken 重试原请求
```

**Refresh Token 轮换策略**：每次调用 `/auth/refresh` 时，从 Cookie 提取 refreshToken，用 **SHA-256** 计算哈希值后在 Session 表中查找（`tokenHash` 字段存储哈希值而非明文 token）。查找结果分四种情况：
1. **正常情况**：找到 Session 且 `consumedAt` 为 null **且 `expiresAt > NOW()`** **且关联用户 `isActive = true`** → 设置 `consumedAt = now()`（标记已消耗），创建新 Session，签发新 refreshToken 通过 Set-Cookie 返回
2. **重用检测**：找到 Session 但 `consumedAt` 不为 null → 说明该 token 已被消耗过又被使用（可能存在窃取），立即撤销该用户所有 Session，返回 AUTH_004，前端跳转登录页
3. **Token 过期**：找到 Session 但 `expiresAt <= NOW()` → 返回 AUTH_002（401，令牌已过期），前端跳转登录页
4. **无效 token**：找不到对应 Session → 返回 AUTH_004（401，刷新令牌无效），前端跳转登录页
5. **用户已禁用**：Session 有效但关联用户 `isActive = false` → 删除该 Session，响应中通过 `Set-Cookie` 清除 Cookie（Max-Age=0），返回 AUTH_004（401，不暴露用户禁用状态），前端跳转登录页。防止被禁用用户的浏览器陷入无限刷新循环

**并发防护**：Refresh 轮换的 `consumedAt` 标记必须使用原子操作，防止并发请求竞态。实现方式：使用 Prisma `updateMany({ where: { tokenHash, consumedAt: null }, data: { consumedAt: new Date() } })` 替代 `findUnique → update` 两步操作。若 `updateMany` 返回 `count = 0`，需进一步区分是"重用攻击"还是"并发 refresh"：
- 先查询该 tokenHash 的 Session 记录（`findUnique`），若存在且 `consumedAt` 在最近 30 秒内 → 判定为并发 refresh（两个标签页同时触发），返回新 token 而非撤销所有 Session
- 若存在且 `consumedAt` 超过 30 秒前 → 判定为真正的重用攻击（token 被窃取），执行撤销该用户所有 Session 的操作
- 若不存在 → case 4（无效 token）

**事务保证**：Refresh 轮换的核心操作（标记旧 Session consumedAt + 创建新 Session）必须使用 Prisma 交互式事务（`prisma.$transaction`）保证原子性。如果事务失败（如数据库连接中断），返回 `SYS_001`（500），不撤销用户的其他 Session。以下关键操作同样必须使用事务：
- **创建项目 + 自动插入 owner**：`prisma.$transaction([create Project, create ProjectMember])`，防止出现无 owner 的孤儿项目
- **添加成员**：先检查 MEMBER_001 + 插入记录，在事务内执行避免竞态
- **删除用户前检查 + 删除**：MEMBER_003 检查 + 实际删除在事务内执行
- **管理员修改用户（PATCH /users/:id）**：admin count 检查 + 实际更新在事务内执行，防止两个 admin 并发禁用/降级对方导致 admin count 降至零
- **成员角色变更（PATCH /projects/:id/members/:uid）**：owner count 检查 + 实际更新在事务内执行，防止两个 owner 并发降级对方导致项目失去 owner

> **事务隔离级别说明**：MySQL 默认隔离级别为 `REPEATABLE READ`。上述 check-then-act 模式（count 检查 + 更新）在极端并发场景下仍有微小竞态窗口（两个事务同时读到相同 count 值，各自更新不同行，都成功提交）。**一期接受此风险**——在几百人规模下，需要两个 admin/owner 在毫秒级窗口内同时修改对方账号，实际概率极低。若未来需严格防范，可在上述事务中添加 `{ isolationLevel: 'Serializable' }` 选项（Prisma 6.x 支持），但 `Serializable` 对并发性能有影响，建议仅在确认必要时启用

**Logout 流程**：`POST /auth/logout` 的行为：
1. 从 Cookie 提取 refreshToken，SHA-256 哈希后查找 Session
2. 若找到 → 删除该 Session 记录
3. 响应中通过 `Set-Cookie` 清除 refreshToken（设置 `Max-Age=0`，空值）
4. 返回 `{ success: true }`；即使 Session 不存在也返回成功（幂等）

**密码修改后的 Session 处理**：调用 `POST /auth/change-password` 成功后，Service 层必须：
1. 删除该用户的**所有** Session 记录（`DELETE FROM sessions WHERE user_id = ?`），强制所有设备重新登录
2. 响应中通过 `Set-Cookie` 清除当前设备的 refreshToken（`Max-Age=0`）
3. 前端收到成功响应后清除内存中的 accessToken，跳转登录页

### 5.2 密码存储

| 数据类型 | 加密方式 | 说明 |
|----------|---------|------|
| 用户密码 | **bcryptjs**（12轮） | 纯 JS 实现的 bcrypt，无需原生编译，Alpine 兼容 |
| 远程连接密码 | AES-256-GCM | 对称加密，密钥从环境变量读取 |
| 传输安全 | TLS 1.2+ | HTTPS 强制 |

### 5.3 速率限制

| 端点 | 限制 | 说明 |
|------|------|------|
| /api/v1/auth/login | 5次/分钟/IP | 防暴力破解 |
| /api/v1/auth/register | 3次/分钟/IP | 防批量注册 |
| /api/v1/auth/refresh | 20次/分钟/IP | 防刷新令牌滥用（轮换机制本身有重用检测，速率限制作为额外防护） |
| /api/v1/health | 不限 | 健康检查端点，供 Docker/Caddy 探测使用，需排除在通用限制外 |
| /api/v1/* | 200次/分钟/用户 | 通用限制（health 端点除外） |

> **速率限制响应格式**：触发速率限制时返回 `429 Too Many Requests`，响应体为 `{ "success": false, "error": { "code": "RATE_LIMIT", "message": "请求过于频繁，请稍后重试" } }`，响应头包含 `Retry-After`（秒数）。此错误码不在主错误码表中，由 `express-rate-limit` 中间件直接返回。

> **反向代理 IP 透传**：Caddy 自动在代理请求中添加 `X-Forwarded-For` 和 `X-Real-IP` 头。Express 必须配置 `app.set('trust proxy', true)`（或指定 Docker 网络 CIDR），使 `req.ip` 返回客户端真实 IP 而非 Caddy 的 Docker 网络 IP。否则所有 per-IP 速率限制会共享同一个桶（Caddy IP），形同虚设。

### 5.4 安全头

- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Strict-Transport-Security: max-age=31536000
- Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:

---

## 6. 部署设计

### 6.1 生产架构

```
互联网用户
    ↓ HTTPS (Caddy 自动管理 Let's Encrypt 证书)
Caddy 反向代理
    ├── /api/*     → 后端 API（含健康检查 /api/v1/health）
    └── /*         → 前端静态文件（SPA fallback）
```

选择 Caddy 替代 Nginx 的原因：
- **自动 HTTPS**：零配置获取和续期 Let's Encrypt 证书
- **配置更简单**：Caddyfile 比 nginx.conf 简洁得多
- **Docker 集成好**：官方 Docker 镜像，支持环境变量配置
- 公司证书场景也可手动指定证书路径

### 6.2 Docker Compose

```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports: ["443:443", "80:80"]
    volumes:
      - ./docker/Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data        # 证书持久化
      - caddy-config:/config
      - frontend-build:/srv/frontend  # 前端构建产物（由 init 容器填充）
    depends_on:
      backend:
        condition: service_healthy
      frontend-init:
        condition: service_completed_successfully

  backend:
    build:
      context: .
      dockerfile: docker/Dockerfile.backend
    restart: unless-stopped
    env_file: .env    # 从 .env 文件加载所有环境变量（含 ADMIN_USERNAME/ADMIN_PASSWORD 供 seed 使用）
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/api/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    depends_on:
      db:
        condition: service_healthy

  # 前端构建 init 容器：构建完成后退出，Caddy 等它完成后再启动
  frontend-init:
    build:
      context: .
      dockerfile: docker/Dockerfile.frontend
    volumes:
      - frontend-build:/output

  db:
    image: mysql:8.0  # 或 mssql
    restart: unless-stopped
    environment:
      - MYSQL_ROOT_PASSWORD=${DB_PASSWORD}
      - MYSQL_DATABASE=remotehub
      - MYSQL_USER=remotehub
      - MYSQL_PASSWORD=${DB_PASSWORD}
    volumes:
      - db-data:/var/lib/mysql  # 数据持久化
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${DB_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  caddy-data:
  caddy-config:
  frontend-build:
  db-data:             # 数据库数据卷
```

**Dockerfile.backend**（两阶段构建，解决 pnpm workspace symlink 和 dist/ 排除问题）：
```dockerfile
# ---- 基础镜像 ----
FROM node:20-alpine AS base
RUN corepack enable

# ---- 构建阶段 ----
FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @remotehub/shared build
RUN pnpm --filter @remotehub/backend build
# 编译 seed.ts → seed.js（生产镜像无 ts-node）
RUN npx esbuild packages/backend/prisma/seed.ts --outfile=packages/backend/prisma/seed.js --platform=node --format=cjs
# 创建生产部署目录（仅含生产依赖，自包含 node_modules）
RUN pnpm --filter @remotehub/backend --prod deploy /prod/backend
# ⚠️ 关键：pnpm deploy 会排除 .gitignore 中列出的 dist/ 和 prisma/migrations/
# 必须手动复制这些构建产物到部署目录
RUN cp -r packages/backend/dist /prod/backend/dist
RUN cp -r packages/backend/prisma /prod/backend/prisma

# ---- 生产阶段 ----
FROM base
WORKDIR /app
COPY --from=builder /prod/backend .
RUN npx prisma generate
EXPOSE 3001
# migrate deploy: 应用迁移文件（非破坏性，安全用于生产）
# seed: 仅在首次部署时创建 admin（使用 upsert 确保幂等，update 为空操作不覆盖已有密码）
# ⚠️ upsert 的 update 必须为空操作（Prisma: update: {}），避免覆盖已修改的 admin 密码
# seed 使用条件执行：检查 admin 用户是否存在，不存在时才执行 seed
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/seed-check.js && node dist/server.js"]
```

> **关键说明**：
> - `pnpm deploy --prod` 生成自包含目录，内含生产依赖的 node_modules（无 symlink，可安全 COPY）。文件包含规则按优先级：① `package.json` 的 `files` 字段（只复制列出的文件）→ ② `.npmignore`（忽略列出的文件）→ ③ `.gitignore`（兜底）。**推荐方案**：在 backend 的 `package.json` 中配置 `"files": ["dist", "prisma", "src"]`，让 pnpm deploy 自动包含所需文件，无需手动 cp。上述 Dockerfile 中的 cp 步骤作为兜底保险保留（防止 `files` 字段遗漏）。
> - 需在 `pnpm-workspace.yaml` 中配置 `injectWorkspacePackages: true` 和 `syncInjectedDepsAfterScripts: [build]`。
> - `prisma` CLI 必须作为生产依赖（非 devDependency）安装在 backend 包中，因为运行时需要执行 `prisma migrate deploy` 和 `prisma db seed`。
> - Seed 脚本通过 `esbuild` 在构建阶段编译为 `seed.js`（CommonJS 格式），`package.json` 的 `prisma.seed` 配置指向 `prisma/seed.js`。`esbuild` 需作为 backend 的 devDependency 显式声明，确保 Docker 构建的可重现性。
> - `seed-check.js` 是一个轻量启动脚本，逻辑：查询数据库中是否存在 `role = 'admin'` 的用户，若不存在则执行 seed（通过 `child_process.execSync('npx prisma db seed')` 或直接调用 seed 函数），若已存在则跳过。这避免了每次容器重启都执行 seed，防止 seed 故障阻塞正常启动。

**Dockerfile.frontend**（init 容器，构建后退出）：
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @remotehub/shared build
RUN pnpm --filter @remotehub/frontend build

# 最终阶段：将构建产物复制到输出卷后退出
FROM alpine:latest
COPY --from=builder /app/packages/frontend/dist /tmp/dist
# 复制到卷并退出（通过 entrypoint 脚本）
CMD ["sh", "-c", "rm -rf /output/* && cp -r /tmp/dist/. /output/"]
```

Caddyfile 示例：
```
remotehub.yourcompany.com {
    # 自动 HTTPS（Let's Encrypt）
    # 也支持手动指定公司证书：
    # tls /etc/caddy/ssl/cert.pem /etc/caddy/ssl/key.pem

    encode gzip

    # 安全头
    header {
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
        X-XSS-Protection "1; mode=block"
        Strict-Transport-Security "max-age=31536000"
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    }

    # API 代理（包含 /api/v1/health 健康检查端点）
    handle /api/* {
        reverse_proxy backend:3001
    }

    # 前端静态资源
    handle {
        root * /srv/frontend
        try_files {path} /index.html
        file_server
    }
}
```

### 6.3 一键部署

- `deploy.ps1`（Windows）：检查 Docker → 填写 .env → docker compose up
- `deploy.sh`（Linux）：同上
- 首次部署自动运行 Prisma 迁移和种子数据（创建默认管理员）

### 6.3.1 版本更新部署

后续版本更新时的部署流程：

```bash
# 1. 拉取最新代码
git pull origin main

# 2. 重新构建并启动（迁移自动执行）
docker compose up --build -d

# 仅重建前端（无需重启后端和数据库）
docker compose up --build frontend-init && docker compose restart caddy

# 仅重建后端（schema 变更时，迁移自动执行）
docker compose up --build backend -d
```

**关键行为**：
- 后端容器启动时自动执行 `prisma migrate deploy`（仅应用新增迁移，不破坏现有数据）
- 前端更新需重建 `frontend-init` 容器并重启 Caddy
- 数据库数据通过 Docker 卷持久化，重建容器不影响数据

### 6.4 开发环境

**方式一：Docker MySQL（推荐，与生产一致）**：

```bash
# 启动 MySQL 开发数据库
docker compose -f docker-compose.dev.yml up -d db

# 初始化项目
pnpm install                              # 安装依赖
pnpm --filter @remotehub/shared build     # 编译共享包（生成 dist/）
cd packages/backend && npx prisma generate # 生成 Prisma Client
cd packages/backend && npx prisma migrate dev --name init  # 首次创建迁移并同步到 MySQL

# 启动开发服务器
pnpm dev                                  # 同时启动前后端
                                          # → backend: 端口 3001（连接 Docker MySQL）
                                          # → frontend: 端口 5173（proxy /api → 3001）
```

**方式二：SQLite 快速体验（不参与迁移流程，仅限演示）**：
- 修改 `schema.prisma` 中 `provider = "sqlite"`，`DATABASE_URL=file:./dev.db`
- 使用 `prisma db push` 快速同步（不生成迁移文件）
- 注意：此方式生成的数据无法迁移到生产环境

**docker-compose.dev.yml**（开发环境 MySQL）：

```yaml
services:
  db:
    image: mysql:8.0
    ports: ["3306:3306"]
    environment:
      - MYSQL_ROOT_PASSWORD=root
      - MYSQL_DATABASE=remotehub_dev
    volumes:
      - dev-db-data:/var/lib/mysql

volumes:
  dev-db-data:
```

**Vite proxy 配置**（`packages/frontend/vite.config.ts`）：

```typescript
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

**Prisma 相关命令时机**：

| 命令 | 执行时机 | 说明 |
|------|---------|------|
| `prisma generate` | 安装依赖后、首次开发前、schema 变更后 | 生成 Prisma Client 类型 |
| `prisma migrate dev` | 开发环境 schema 变更时 | 生成 MySQL 迁移文件（提交到 git），同时同步到开发数据库 |
| `prisma migrate deploy` | **生产环境**容器启动时 | 应用待执行的迁移文件，非破坏性，安全用于生产 |
| `prisma db seed` | 首次部署、需要重置测试数据时 | 执行种子脚本创建默认管理员（必须使用 upsert 确保幂等；**update 子句必须为空操作 `{}`，不得覆盖已有 admin 的密码或昵称**） |
| `prisma db push` | **仅 SQLite 快速体验** | 不生成迁移文件，不适用于正式开发流程 |

> **重要**：开发和生产统一使用 MySQL。开发阶段通过 `prisma migrate dev` 生成迁移文件，这些文件直接用于生产环境的 `prisma migrate deploy`。`db push` 仅用于 SQLite 快速演示场景，不适用于有生产数据的环境。

---

## 7. 实施范围

| 模块 | 内容 |
|------|------|
| 用户认证 | 登录/创建用户/角色/JWT/修改密码 |
| 项目管理 | 项目CRUD/成员权限 |
| 连接管理 | 远程连接CRUD/协议支持/VPN依赖 |
| 数据库 | MySQL（开发+生产统一，Docker 部署） |
| 部署 | Docker Compose + Caddy + HTTPS |
| 安全基础 | HTTPS、密码加密、速率限制、token 轮换 |

> 增强功能（系统监控、审计日志、备份、WebSocket、数据导出等）将在后续版本单独设计。

---

## 8. 项目清理策略

| 清理动作 | 时机 | 文件 |
|----------|------|------|
| 删除垃圾文件 | 重构前 | nul 文件、调试日志、.updated 副本、快照 md、调试 json、根目录测试脚本 |
| 删除编译产物 | 重构前 | dist/ 目录（加入 .gitignore） |
| 删除旧代码 | 重构中 | 旧 mock/repository/adapter 文件（新代码替代后删除） |
| 删除废弃迁移 | 重构中 | migrations-disabled/（新 Prisma 迁移建立后删除） |

---

## 9. 外部信息收集记录

### 9.0.1 已完成验证（选型阶段）

- Prisma 版本选择（6.x vs 7.x）→ 确定 6.x
- Express 版本（4 vs 5）→ 确定 5
- ORM 对比（Prisma vs Drizzle）→ Prisma（Drizzle 不支持 SQL Server）
- 反向代理（Nginx vs Caddy）→ Caddy（自动 HTTPS）
- 密码哈希（bcryptjs vs bcrypt vs Argon2）→ bcryptjs（纯 JS，跨平台稳定性，Alpine 兼容）
- 测试框架（Vitest vs Jest）→ Vitest 统一

### 9.0.2 实施前需收集的技术细节（写实施计划时按需研究）

以下为已知需要收集的技术细节清单。实施过程中可能发现更多需要研究的点，届时补充。

**A. Prisma 6.x + pnpm workspace monorepo**

| 需收集内容 | 目的 |
|-----------|------|
| shared 包的 `package.json` exports 配置写法 | 确保前后端能正确 import 子路径 |
| backend/frontend 用 `workspace:*` 引用 shared 的写法 | pnpm workspace 依赖语法 |
| Prisma Client 位置决策（backend-only vs shared） | 类型生成策略，前后端如何共享 Prisma 类型 |
| 多 provider schema 管理策略 | 单 schema 切换 provider vs 多 schema 目录 |
| TypeScript project references 配置 | pnpm workspace + TS references 配合方式 |
| Prisma schema 与 shared/types 的类型同步方式 | 避免 Prisma 生成的类型和 shared 手写类型不一致 |

**B. Express 5 具体变更**

| 需收集内容 | 目的 |
|-----------|------|
| Express 4→5 breaking changes 完整清单 | 路径匹配（path-to-regexp v8）、参数捕获、错误处理 |
| ~~async 中间件/路由错误处理机制~~ | ✅ **已确认**：Express 5 原生支持 async error，reject 的 Promise 自动传递给错误处理中间件，无需 express-async-errors |
| 已有中间件兼容性验证 | helmet、express-rate-limit、cors 等 Express 5 兼容状态 |
| ~~body-parser 行为变化~~ | ✅ **已确认**：Express 5 仍需显式启用 `express.json()`（内置但非自动），见 §4.2 全局中间件栈 |

**C. Caddy + Docker Compose**

| 需收集内容 | 目的 |
|-----------|------|
| Docker 网络 DNS 解析机制 | Caddy 容器如何通过 service name 解析 backend |
| 证书数据卷备份恢复 | 证书丢失后的恢复流程 |
| Caddy 配置热重载 | 不重启容器的情况下更新 Caddyfile |
| 内网 CA 证书配置 | 公司内网非 Let's Encrypt 场景的具体 tls 配置 |
| Docker Compose service 依赖启动顺序 | depends_on + healthcheck 的实际行为 |

**D. TanStack Query + React 19**

| 需收集内容 | 目的 |
|-----------|------|
| QueryClient 初始化和 Provider 配置 | 应用入口的标准写法 |
| 自定义 hooks 封装模式 | useQuery/useMutation 的项目级封装约定 |
| 401 拦截 + token 自动刷新 | refresh token 失败后的重试/登出流程（见下方设计要求） |
| Mutation 后缓存失效策略 | queryClient.invalidateQueries 的使用模式 |
| 乐观更新（Optimistic Update）模式 | 连接管理场景是否需要 |

**前端 Token 刷新拦截器设计要求**：

统一 HTTP 客户端（基于 `fetch` 或 `axios`）必须实现自动 token 刷新拦截器：

1. 所有 API 请求通过 `Authorization: Bearer <accessToken>` 携带令牌
2. 收到 401 响应时，拦截器自动调用 `POST /auth/refresh`（浏览器自动携带 refreshToken Cookie）
3. 刷新成功：用新 accessToken 重试原请求（对用户透明）
4. 刷新失败：清除内存中的 accessToken，跳转登录页
5. 多请求并发 401 时，只发起一次 refresh 请求，其他请求排队等待结果后重试（使用 Promise 队列，避免多次刷新消耗多个 refresh token）
6. accessToken 存储在全局 JS 模块变量中（非 localStorage），页面刷新后丢失，由应用初始化时直接调用 `POST /auth/refresh`（浏览器自动携带 refreshToken Cookie）恢复。不要先调 `/auth/me` 再靠 401 触发 refresh——那会多一次无意义请求往返
7. **初始化门（Bootstrap Gate）**：应用启动时必须先完成 refresh 请求，成功后才挂载 React 应用（或路由组件）。在 refresh 完成前显示 loading 状态（非白屏）。这确保所有后续 API 请求都携带有效 accessToken，避免初始化阶段的批量 401

**E. 其他可能涉及的领域**

| 需收集内容 | 目的 |
|-----------|------|
| Winston 日志库配置 | 结构化 JSON 日志 + 日志轮转配置 |
| AES-256-GCM Node.js crypto API 用法 | 加密/解密的完整代码模式 |
| bcryptjs 性能验证 | 纯 JS 实现的 bcrypt 性能满足生产需求（OWASP 推荐，已选型确认） |
| Prisma seed 脚本写法 | 初始管理员创建的官方推荐方式 |
| Vitest + Prisma 测试隔离 | 数据库测试的事务回滚或数据库清理策略 |
| React 19 新特性对现有组件的影响 | useRef/useEffect 行为变化、并发模式影响 |

### 9.1 补充：CORS 配置

开发环境：Vite dev server proxy 转发 `/api` 到后端服务（Docker MySQL + Express），不存在跨域问题。
生产环境：Caddy 同源代理，前端和 API 共享同一域名，**不存在跨域问题**。

如果未来需要独立部署前后端到不同域名，在 Express 中配置 CORS：
```typescript
// 仅在前后端分离部署时启用
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || [],
  credentials: true,  // 允许携带 cookie（刷新令牌）
}));
```

### 9.2 补充：完整环境变量清单

```env
# === 应用配置 ===
NODE_ENV=production
PORT=3001

# === 数据库 ===
# 开发环境（Docker MySQL）：
DATABASE_URL=mysql://root:root@localhost:3306/remotehub_dev
# 生产环境（docker-compose.yml 中的 MySQL 服务）：
# DATABASE_URL=mysql://remotehub:${DB_PASSWORD}@db:3306/remotehub?connection_limit=30
# DB_PASSWORD=<数据库密码>                        # 生产 MySQL 密码（docker-compose.yml 引用）
# connection_limit=30：Prisma 连接池大小（默认 num_cpus*2+1 ≈ 3-5，不足以支撑几百并发）

# === JWT ===
JWT_SECRET=<随机64字符字符串>                   # 必填，缺失时启动报错
JWT_ACCESS_EXPIRES_IN=15m                      # 可选，默认 15m（15 分钟），单位支持 s/m/h/d
JWT_REFRESH_EXPIRES_IN=7d                      # 可选，默认 7d（7 天），单位支持 s/m/h/d

# === 加密 ===
ENCRYPTION_KEY=<随机32字节的Base64编码字符串，即Base64解码后为32字节>        # AES-256-GCM 连接密码加密密钥（Base64 编码后约 44 字符）
# ENCRYPTION_KEY_OLD=<旧密钥>                  # 密钥轮换时配置（见 9.6.1）

# === 管理员种子 ===
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<初始管理员密码>

# === 日志 ===
LOG_LEVEL=info                                 # debug | info | warn | error

# === 速率限制 ===
RATE_LIMIT_LOGIN_MAX=5                         # 登录每分钟最大尝试
RATE_LIMIT_REGISTER_MAX=3                      # 注册每分钟最大尝试
RATE_LIMIT_REFRESH_MAX=20                      # 刷新令牌每分钟最大尝试
RATE_LIMIT_GENERAL_MAX=200                     # 通用每分钟最大请求
```

### 9.3 补充：数据迁移策略

**第一期从零开始，不迁移 localStorage 数据。** 原因：

1. 项目尚未上线，没有真实用户数据
2. localStorage 数据结构（前端类型）和 Prisma 数据库结构差异大，迁移成本高于收益
3. 首次部署通过种子脚本创建默认管理员，用户手动录入连接数据

### 9.4 补充：日志策略

| 环境 | 输出目标 | 日志级别 | 说明 |
|------|---------|---------|------|
| 开发 | stdout（控制台） | debug | 彩色格式，便于调试 |
| 生产 | stdout | info | Docker 收集 stdout，结构化 JSON 格式 |
| 生产（可选） | 文件 `logs/app.log` | info | 日志轮转：7天保留，单文件最大 10MB |

使用 Winston 日志库。Docker 环境下推荐 stdout + 外部日志收集（ELK/Loki），不写文件。

### 9.5 补充：Session 清理策略

Session 表会持续增长（每次登录创建，refresh 轮换也创建新记录）。需要定期清理：

| 清理目标 | 条件 | 执行频率 |
|----------|------|---------|
| 已消耗的 refresh token | `consumedAt IS NOT NULL AND consumedAt < NOW() - INTERVAL 30 DAY` | 每日 |
| 已过期的 session | `expiresAt < NOW()` | 每日 |

实现方式：在 backend 启动时和每日定时执行清理（使用 `node-cron` 或 `setInterval`）。

### 9.6 补充：加密细节

连接密码加密使用**单一全局密钥**（`ENCRYPTION_KEY`），每次加密生成随机 IV 以区分：

```
加密：plaintext + ENCRYPTION_KEY + random_iv → v1:iv:ciphertext:authTag（Base64 存储）
解密：Base64 解码 → 检查版本前缀 → 提取 iv → iv + ciphertext + ENCRYPTION_KEY → plaintext
```

**版本前缀 `v1:`**：加密结果以版本前缀开头，为未来算法更换预留（如 `v2:` 表示 XChaCha20-Poly1305）。解密时根据前缀选择对应算法。当前所有加密结果使用 `v1:` 前缀。

IV 不需要保密，和密文一起存储即可。

### 9.6.1 补充：加密密钥轮换

如果 `ENCRYPTION_KEY` 需要轮换（如泄露风险），策略如下：

1. 在环境变量中同时配置 `ENCRYPTION_KEY`（新密钥）和 `ENCRYPTION_KEY_OLD`（旧密钥）
2. 解密时根据版本前缀选择解密逻辑，再按密钥优先级尝试（先新密钥，后旧密钥）
3. 用旧密钥解密成功后，自动用新密钥重新加密并更新数据库（保持当前版本前缀 `v1:`，仅更换密钥）
4. 确认所有记录已迁移后，移除 `ENCRYPTION_KEY_OLD`

此策略为懒迁移模式，无需停机批量重加密。

---

## 10. 现有代码保留/重写决策

| 模块 | 策略 | 原因 |
|------|------|------|
| 前端 UI 组件（16个） | 保留 | 功能可用，重写性价比低 |
| 前端 types.ts | 重写 | 需与 shared 包统一 |
| 前端 storage/api adapter | 重写 | 统一为单一 API 客户端 |
| 后端 Controllers | 重写 | 数据层从 TypeORM Repository 切换到 Prisma Client，所有数据库调用全部重写 |
| 后端 Services | 重写 | 同上，业务逻辑可参考但需用 Prisma API 重写 |
| 后端 Models/Repositories | 重写 | Prisma 替代 |
| 后端 Middleware（安全） | 保留 | rate-limiter、helmet、cors 等与 ORM 无关，兼容 Express 5 即可 |
| 后端 Middleware（认证） | 重写 | JWT 验证逻辑需适配新的 token 策略（refresh token rotation） |
| 测试 | 从零建立 | Vitest 前后端统一 |
| 部署配置 | 从零建立 | Docker Compose + Caddy + 脚本 |

---

## 11. 开发规范与约束

> 规范分为**强制**（工具链/CI 强制执行）和**推荐**（代码审查执行）两级。

### 11.1 TypeScript 规范

| 规范 | 级别 | 强制方式 |
|------|------|---------|
| `strict: true`（后端+前端+shared） | 强制 | tsconfig.json |
| 禁止 `any`，用 `unknown` + 类型收窄 | 强制 | ESLint `@typescript-eslint/no-explicit-any: error` |
| 禁止 `@ts-ignore`，用 `@ts-expect-error` | 强制 | ESLint |
| 共享类型从 `@remotehub/shared` 导入 | 强制 | ESLint no-restricted-imports |
| 后端函数返回类型必须显式声明 | 强制 | 代码审查 |
| 前端事件处理器参数必须声明类型 | 推荐 | 代码审查 |

### 11.2 API 接口规范

**统一响应格式**：

```typescript
// 成功
{ "success": true, "data": T }

// 失败
{ "success": false, "error": { "code": "string", "message": "string", "details"?: [{ "field": "string", "message": "string" }] } }

// 分页列表
{ "success": true, "data": T[], "pagination": { "page": 1, "pageSize": 20, "total": 100 } }
```

**端点规则**：

| 规范 | 级别 | 说明 |
|------|------|------|
| 统一前缀 `/api/v1` | 强制 | 版本管理 |
| 错误必须含 code + message | 强制 | 前端可做国际化 |
| HTTP 状态码语义正确 | 强制 | 200/201/204/400/401/403/404/409/422/500 |
| 列表端点支持分页 `?page=&pageSize=` | 强制 | 防止全量查询；默认 `pageSize=20`，最大 `pageSize=100`，超出自动截断为 100 |
| 删除用 `DELETE` 方法 | 强制 | REST 语义 |
| 创建返回 201 | 推荐 | REST 最佳实践 |
| 更新用 `PATCH` | 强制 | 支持部分更新，只传需要修改的字段 |

**CUD 端点响应规范**（补充上方统一格式中 `data` 字段的具体定义）：

| 操作类型 | HTTP 状态码 | 响应体 | 说明 |
|---------|------------|--------|------|
| POST（创建资源） | 201 | `{ success: true, data: <创建的资源完整对象> }` | 返回与对应 GET 详情端点相同结构的完整资源对象（含 id、createdAt 等服务端生成字段） |
| PATCH（更新资源） | 200 | `{ success: true, data: <更新后的资源完整对象> }` | 返回更新后的完整资源对象，前端无需再发一次 GET |
| DELETE（删除资源） | 200 | `{ success: true, data: { id: "<删除的资源ID>" } }` | 返回被删除资源的 ID，前端据此从本地缓存中移除 |
| POST /auth/register | 201 | `{ success: true, data: { id, username, nickname, role, isActive, createdAt } }` | 返回创建的用户（不含 passwordHash） |
| POST /auth/change-password | 200 | `{ success: true }` | 无额外数据，前端收到后清除 token 跳转登录页 |
| POST /auth/logout | 200 | `{ success: true }` | 幂等，即使 Session 不存在也返回成功 |

**错误码体系**：

```
AUTH_001  用户名或密码错误          → 401 Unauthorized
AUTH_002  令牌已过期                → 401 Unauthorized
AUTH_003  权限不足                  → 403 Forbidden
AUTH_004  刷新令牌无效或已消耗       → 401 Unauthorized
AUTH_005  用户已被禁用              → 403 Forbidden
USER_001  用户名已存在              → 409 Conflict
USER_002  用户不存在                → 404 Not Found
CONN_001  连接测试失败              → 400 Bad Request  # 二期预留，一期无连接测试端点
CONN_002  连接不存在                → 404 Not Found
CONN_003  VPN 依赖循环              → 400 Bad Request
CONN_004  VPN 仍被其他连接依赖       → 409 Conflict
CONN_005  同项目内连接名称已存在       → 409 Conflict
PROJ_001  项目名称冲突              → 409 Conflict
PROJ_002  项目不存在                → 404 Not Found
MEMBER_001 成员已存在于项目中        → 409 Conflict
MEMBER_002 不能变更/移除最后的项目owner → 403 Forbidden
MEMBER_003 用户是项目唯一owner，无法删除 → 409 Conflict
VAL_001   输入验证失败              → 422 Unprocessable Entity
SYS_001   内部服务器错误            → 500 Internal Server Error
```

**Prisma 唯一约束冲突映射**（P2002 → 业务错误码）：

Service 层在创建/更新资源时，Prisma 的 `@@unique` 约束违反会抛出 P2002 错误（`Prisma.PrismaClientKnownRequestError`，code = 'P2002'）。Service 层必须 catch 此错误，根据 `error.meta?.target` 映射到对应业务错误码：

| P2002 meta.target | 对应错误码 | 触发端点 |
|-------------------|-----------|---------|
| `['username']`（User 表） | USER_001 | POST /auth/register |
| `['name']`（Project 表） | PROJ_001 | POST /projects, PATCH /projects/:id |
| `['projectId', 'name']`（Connection 表） | CONN_005 | POST /connections, PATCH /connections/:id |
| `['projectId', 'userId']`（ProjectMember 表） | MEMBER_001 | POST /projects/:id/members |
| `['tokenHash']`（Session 表） | 不暴露给客户端（内部错误，记录日志后返回 SYS_001） | POST /auth/refresh（理论上不会发生，tokenHash 是随机哈希） |

映射实现示例：
```typescript
catch (error) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = (error.meta?.target as string[])?.join(',');
    if (target === 'username') throw new AppError('USER_001', 409);
    if (target === 'name') throw new AppError('PROJ_001', 409);
    if (target === 'projectId,name') throw new AppError('CONN_005', 409);
    if (target === 'projectId,userId') throw new AppError('MEMBER_001', 409);
  }
  throw error;
}
```

> 注意：Prisma P2002 的 `meta.target` 格式为数组（如 `['projectId', 'name']`），不同 Prisma 版本可能有差异，实施时需验证实际输出格式。

**验证错误详情格式**（VAL_001 时附带的字段级错误）：

```typescript
// 请求验证失败时，error.details 包含每个字段的错误
{
  "success": false,
  "error": {
    "code": "VAL_001",
    "message": "输入验证失败",
    "details": [
      { "field": "username", "message": "用户名长度必须在 3-50 之间" },
      { "field": "password", "message": "密码长度至少 8 位" }
    ]
  }
}
```

### 11.3 数据库规范

| 规范 | 级别 | 说明 |
|------|------|------|
| 表名 snake_case 复数 | 强制 | `@@map("users")` |
| 列名 snake_case | 强制 | `@map("created_at")` |
| 每表有 `id`(UUID)、`created_at`、`updated_at` | 强制 | Prisma schema 保证；**关联表豁免**：纯关联表（如 ProjectMember）用语义化时间字段（`added_at`）替代，无需 `updated_at` |
| 级联删除保证数据不孤立 | 强制 | `onDelete: Cascade`（Session→User、ProjectMember→User/Project、Connection→Project）；`onDelete: SetNull`（Connection VPN 自引用，VPN 删除时依赖者 requiredVpnId 置空，由 Service 层 CONN_004 阻止单连接级别的误删） |
| 密码字段永不返回前端 | 强制 | Service 层 strip |
| 生产环境使用 `prisma migrate deploy` 同步 schema | 强制 | 禁止在生产使用 `db push`（可能破坏数据） |
| `createdBy`/`updatedBy` 字段不建外键 | 强制 | 用 String 存储 userId；用户删除后保留原值，前端显示"已删除用户" |
| `createdBy`/`updatedBy` 的 API 返回 | 强制 | Service 层在返回 Project/Connection 详情时，**必须**将 `createdBy`/`updatedBy` 的 userId 关联查询为 `{ id, nickname }` 对象（如 `createdBy: { id, nickname }`）。用户已删除时返回 `{ id: "<原userId>", nickname: "已删除用户" }`。列表 API 同理 |
| 用户删除不级联删除连接和项目 | 强制 | `createdBy` 仅为审计记录，不代表所有权 |

### 11.4 安全规范

| 规范 | 级别 | 说明 |
|------|------|------|
| 用户密码 bcryptjs 12 轮 | 强制 | 注册/修改时；纯 JS 实现，无原生依赖 |
| 密码复杂度：≥8 字符，含大小写+数字 | 强制 | `PasswordValidator` 工具类统一验证；密码长度上限 128 字符（防止 bcrypt 哈希前超长输入导致 DoS，bcrypt 本身截断至 72 字节但不报错，显式验证更安全） |
| 连接密码 AES-256-GCM 加密 | 强制 | 存前加密，读时解密 |
| JWT access token ≤30 分钟 | 强制 | 默认 15 分钟 |
| 刷新令牌 HTTP-only + Secure + SameSite=Strict | 强制 | Cookie 配置 |
| 速率限制必须启用 | 强制 | 登录 5次/分，通用 200次/分 |
| 生产必须 HTTPS | 强制 | Caddy 强制 |
| 输入验证在 Controller 层 | 强制 | 不信任前端数据 |
| SQL 参数化查询 | 强制 | Prisma 默认保证 |

### 11.5 前端规范

| 规范 | 级别 | 说明 |
|------|------|------|
| 禁止直接操作 localStorage | 强制 | 全部走 API |
| 组件 PascalCase，服务 camelCase | 强制 | 现有惯例 |
| API 调用必须通过 TanStack Query | 强制 | 统一缓存和错误处理 |
| 组件 prop 必须有 TS 接口 | 强制 | ESLint |
| useEffect 依赖数组完整 | 强制 | ESLint react-hooks/exhaustive-deps |
| 组件文件不超过 300 行 | 推荐 | 超出则拆分 |
| 统一 Tailwind class，不用内联样式 | 推荐 | 代码审查 |

### 11.6 测试规范

| 规范 | 级别 | 说明 |
|------|------|------|
| 核心业务逻辑必须有单元测试 | 强制 | 覆盖率 ≥70% |
| API 端点必须有集成测试 | 强制 | 每个 CRUD |
| 测试文件 `*.test.ts` 同目录 | 强制 | Vitest 配置 |
| Mock 只用于外部依赖 | 推荐 | 内部逻辑不 mock |

### 11.7 Git 规范

| 规范 | 级别 | 说明 |
|------|------|------|
| 提交格式 `<类型>: <描述>` | 强制 | feat/fix/refactor/test/docs/chore |
| 分支 main/develop/feature/* | 强制 | 保护 main/develop |
| PR 必须通过 CI | 强制 | lint + type check + test |
| 不提交 .env、dist/、node_modules/ | 强制 | .gitignore |

### 11.8 项目配置文件

初始化时必须到位（使用 ESLint 9+ flat config 格式）：

```
packages/backend/
├── eslint.config.js     # ESLint flat config + @typescript-eslint
├── tsconfig.json         # strict: true
└── vitest.config.ts

packages/frontend/
├── eslint.config.js     # ESLint flat config + react-hooks + @typescript-eslint
├── tsconfig.json         # strict: true
└── vitest.config.ts      # jsdom 环境

根目录/
├── eslint.config.js      # 共享基础规则
├── .prettierrc
├── .editorconfig
└── .gitignore
```

