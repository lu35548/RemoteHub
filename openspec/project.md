# Project Context

## Purpose
RemoteHub 是一个团队远程协作平台，为企业和团队提供统一的远程连接资源（RDP/SSH/VNC/VPN 及商业远程工具）集中管理。核心目标：

- 集中管理团队成员的远程连接资源
- 提供基于项目的资源组织和细粒度权限管理（owner/editor/viewer + 全局 admin）
- 支持多种远程协议和 VPN 依赖关系
- 用户认证（JWT + refresh token 轮换）、在线状态跟踪、审计留痕
- 公司服务器一键部署（Docker），支持内网 + 外网访问，支撑几百人并发

## Tech Stack
RemoteHub 是 pnpm workspace monorepo（`packages/{shared,backend,frontend}`）。

### 后端（packages/backend）
- **Express 5** + TypeScript（strict）— REST API
- **Prisma 6.x** + **MySQL 8** — ORM 与数据库（开发/生产统一 MySQL；SQLite 仅限快速演示）
- **jose** — JWT（access token，默认 15min）
- **bcryptjs**（12 轮）— 用户密码哈希
- **AES-256-GCM** — 连接密码对称加密（单一全局 `ENCRYPTION_KEY`，版本前缀 `v1:`，支持密钥轮换）
- **cookie-parser / helmet / express-rate-limit / cors** — 中间件
- **winston** — 结构化日志
- **node-cron** — 定时任务（Session 清理 03:00）

### 前端（packages/frontend）
- **React 19** + **Vite 6** + TypeScript（strict）
- **TanStack Query** — 服务端状态管理
- 统一 HTTP 客户端（401 自动刷新拦截器 + 应用初始化门）
- **Lucide React** — 图标
- Tailwind CSS

### 共享包（packages/shared）
- 前后端共享的类型（API DTO）、枚举（Protocol / VpnType / UserRole / MemberRole）、常量、验证器

### 部署
- **Docker Compose** + **Caddy 2**（反向代理，自动 HTTPS / 内网证书）
- 后端两阶段构建（esbuild 编译 `seed.ts` → `seed.js`）
- 数据库通过 `prisma migrate deploy` 应用迁移

### 测试
- **Vitest** — 前后端统一测试框架
- 后端现有 145 个 mock 单元测试（auth/user/project/member/connection 的 service + controller + middleware）
- 集成测试基础设施待建（phase2 目标）

## Project Conventions

### 架构分层（后端）
- **routes** → **controllers**（输入验证，并行收集错误）→ **services**（业务逻辑 + Prisma）→ **utils**（prisma / encryption / password / logger / appError）
- 三层权限中间件链：`authMiddleware`（JWT → 查用户 → `req.user`）→ `roleMiddleware`（全局角色）→ `projectRoleMiddleware`（项目级角色，admin 绕过）
- 统一响应格式 `{ success, data | error }`；错误码体系（AUTH / USER / PROJ / CONN / MEMBER / AUDIT / VAL / SYS）

### 命名约定
- 表名 snake_case 复数（`@@map`），列名 snake_case（`@map`）
- 组件 PascalCase，服务 camelCase
- 提交格式 `<类型>: <描述>`（feat / fix / refactor / test / docs / chore），描述用中文

### TypeScript 规范
- `strict: true`（后端 + 前端 + shared）
- 禁止 `any`（用 `unknown` + 类型收窄）、禁止 `@ts-ignore`
- 共享类型从 `@remotehub/shared` 导入

### 数据库规范
- 不用 JSON / Enum 数据库类型（String + 应用层验证），保证 MySQL / SQL Server 兼容
- 可能含中文的字段不指定 `@db.VarChar`
- `createdBy` / `updatedBy` 不建外键（String 存 userId，删除用户保留原值）
- 生产用 `prisma migrate deploy`，禁止 `db push`

### 安全规范
- 用户密码 bcryptjs 12 轮；连接密码 AES-256-GCM
- JWT access ≤30min；refresh token HTTP-only + Secure + SameSite=Strict Cookie，轮换 + 重用检测
- 速率限制：登录 5/min、注册 3/min、刷新 20/min、通用 200/min
- 密码字段永不返回前端（Service 层 strip）

## Domain Context

### 远程连接管理
#### 支持的协议
- **标准**：RDP、SSH、VNC、HTTP、HTTPS
- **VPN**：SSL_VPN、IPSEC、WIREGUARD、OPENVPN、OTHER
- **商业远程工具**：TODESK、SUNLOGIN、TEAMVIEWER、ANYDESK

#### 核心业务概念
- **项目（Project）**：连接资源的组织容器，名称全局唯一
- **连接（Connection）**：具体远程连接配置（主机 / 端口 / 协议 / 加密密码 / VPN 依赖等）
- **用户（User）**：全局角色 admin / user
- **项目成员（ProjectMember）**：项目级角色 owner / editor / viewer
- **VPN 依赖**：连接可依赖同项目内的 VPN 连接（自引用关联，含循环检测 / 删除保护 / 同项目约束）
- **审计字段**：createdBy / updatedBy / createdAt / updatedAt 记录变更溯源

#### 权限模型
- admin 全局权限，可操作任意资源
- 项目级角色仅对已加入项目生效；用户只能访问所属项目的连接
- 删除保护：唯一 owner 不可删除 / 降级、最后一个 admin 不可删除 / 禁用、被依赖的 VPN 不可直接删除

### UI/UX 原则
- 深色主题（slate-950），强调对比度
- 响应式布局，状态反馈（加载 / 成功 / 错误）
- 中文界面

## Important Constraints

### 技术约束
- **部署形态**：Docker Compose 单机部署，Caddy 反向代理，目标几百人并发
- **数据库**：MySQL 统一（开发 + 生产）；SQL Server 为可选非默认路径（需独立迁移目录）
- **Prisma 版本锁定 6.x**（不用 v7，生产稳定性争议）
- **密钥管理**：`JWT_SECRET`、`ENCRYPTION_KEY` 从环境变量读取，缺失即启动报错；支持 `ENCRYPTION_KEY_OLD` 懒迁移轮换

### 业务约束
- 多用户共享数据，基于项目的 RBAC 权限隔离
- 连接密码加密存储，解密走专用接口（owner/editor/admin），明文不持久化
- 一期从零开始，不迁移 localStorage 历史数据

### 当前已知缺口（2026-06-24 审计）
- ⚠️ Prisma migration 文件缺失（`packages/backend/prisma/migrations/` 不存在），生产部署 `migrate deploy` 会失败
- ⚠️ 无 CI（`.github/` 空，145 个测试无自动化兜底）
- phase2（审计日志 / 监控 / 安全增强 / 备份 / WebSocket / 密码重置 / 导入导出 / 项目增强 / 2FA / K8s 探针 / Swagger）尚未实施
- 前端仅 API 客户端骨架，16 个 UI 组件仍留在根目录 `RemoteHub/` 未迁移

## External Dependencies

### 运行时
- **MySQL 8.0** — 主数据库
- **Caddy 2** — 反向代理 + 自动 HTTPS
- **Docker** — 容器化部署

### 关键 npm 依赖
- 后端：express、@prisma/client、jose、bcryptjs、helmet、express-rate-limit、cookie-parser、winston、node-cron、cors
- 前端：react、react-dom、@tanstack/react-query、lucide-react
- 共享：typescript

### 外部服务
- 无（一期不依赖任何外部 SaaS；邮件 / SMTP 为 phase2 预留，默认不实现）
