# RemoteHub V2 收尾设计（持久化切换 + BLOCKER + 测试 + 前端迁移）

**日期**: 2026-07-17
**状态**: draft（待用户 review）
**范围**: v2 一期收尾的 5 项 —— ① 持久化 MySQL→SQLite ② BLOCKER-1 migration ③ BLOCKER-2 CI ④ B-6 补测试 ⑤ 前端迁移规划
**前置**: 审计报告 `docs/superpowers/specs/2026-06-24-remotehub-audit.md` + 全修 commits（4af159e..e3a865b）
**方法**: MVP 优先；不确定项已 MCP 查证（SQLite WAL 并发、Prisma SQLite 兼容、WAL 开启方式）

---

## 1. 持久化切换：MySQL → SQLite + WAL

### 1.1 决策依据（MCP 查证）

| 查证项 | 结论 | 来源 |
|--------|------|------|
| SQLite WAL 并发上限 | 200 并发用户实测案例；NVMe+WAL 10万读/秒、1万写/秒；WAL 降 p99 30-60% | web-search ref_6/7/8 |
| SQLite WAL 限制 | **并发写仍串行**（WAL 不解决多写并发） | web-search ref_9 |
| Prisma SQLite enum | ❌ 不支持（P1012）—— RemoteHub 未用，OK | context7 |
| Prisma SQLite `@db.VarChar` | ❌ 不支持 native types —— **必须移除** | context7 |
| Prisma SQLite 自引用关系 | ✅ 支持（Connection.requiredVpnId） | context7 |
| Prisma SQLite WAL 默认 | ❌ **默认不开**，需手动 `PRAGMA journal_mode=WAL` | context7 #11789 |
| Prisma 6 SQLite 驱动 | 用 driver adapter `@prisma/adapter-better-sqlite3` | context7 |

**适配判断**：RemoteHub 几百人、单机 Docker、CRUD 写少 → SQLite WAL 远够；写串行限制不触发（非高写场景）。

### 1.2 schema 改动（机械清理）

`packages/backend/prisma/schema.prisma`：
- `datasource db { provider = "mysql" }` → `provider = "sqlite"`
- **移除所有 `@db.VarChar(N)`**（约 20 处：username/host/protocol/role/vpnType/userAgent/ip/tokenHash/name/icon 等）→ `String`（SQLite TEXT）
- 移除 `@db.Text`（design §11.3 已避免，确认无残留）
- 保留 `@unique` / `@map` / `@@index` / `@@map` / `@id` / `@default(uuid())` / `@updatedAt` / 关系（均 provider 无关）
- `Int?`（port）/ `Boolean` / `DateTime` 不变
- **schema 设计原则统一**：design §2.4 原为"MySQL/SQL Server 跨 provider"，现锁定 SQLite，原"可能含中文不指定 VarChar"等规则失效（SQLite 全 TEXT，无长度概念）
- **应用层长度校验前提** ⚠️：移除 @db.VarChar 后 DB 层无长度兜底（SQLite TEXT 无限长）。必须确保应用层覆盖所有字段长度校验（design §3.1 已列 username/name/host/tags/password 等；correctness L5 指出 username/notes/vpnLoginUrl 等未应用层校验 —— **切 SQLite 前补全**，归入 B-6 补测试一并覆盖）。不引入 SQLite CHECK 约束（Prisma migration 维护复杂，应用层校验更一致）

### 1.3 Prisma Client（driver adapter + WAL）

`packages/backend/src/utils/prisma.ts` 改为：
```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({ url: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// SQLite 默认不开 WAL，需手动开启（并发写必需，Prisma #11789）
// 在 server.ts 启动时执行：await prisma.$executeRawUnsafe('PRAGMA journal_mode = WAL');
export { prisma };
```

- 依赖：`pnpm --filter @remotehub/backend add @prisma/adapter-better-sqlite3`
- WAL pragma 在 server.ts 启动时执行（模块加载是同步 export，pragma 是 async，放启动序列）
- 移除 `connection_limit`（SQLite 无连接池概念）

### 1.4 Docker 简化

`docker-compose.yml`：
- **删除 `db` 服务**（MySQL 容器）
- backend `volumes`：`sqlite-data:/data`（挂 SQLite 文件目录）
- `DATABASE_URL=file:/data/prod.db`
- 删除 `depends_on: db`
- `docker-compose.dev.yml` 同理删 db 服务

`docker/Dockerfile.backend`：
- `prisma migrate deploy` 仍适用（provider 无关）
- 删除 mysql-client 安装（phase2 备份改用 VACUUM INTO，不再需 mysqldump）

### 1.5 兼容性矩阵（已有代码影响）

| 文件/模块 | 改动 | 风险 |
|-----------|------|------|
| `schema.prisma` | provider + 移除 @db.VarChar | 低（机械） |
| `config/env.ts` | DATABASE_URL 改 file:；删 connection_limit | 低 |
| `utils/prisma.ts` | driver adapter + WAL pragma export | 低 |
| `server.ts` | 启动时执行 WAL pragma | 低 |
| `docker-compose.yml` / `.dev.yml` | 删 db 服务 + volume | 低 |
| `Dockerfile.backend` | 删 mysql-client | 低 |
| **业务代码（services/controllers/middleware）** | **零改动**（Prisma 抽象） | 无 |
| **测试 mock** | 不变（mock prisma，不碰真实 DB） | 无 |
| `seed.ts` | 不变 | 无 |
| `ENCRYPTION_KEY` / AES 加密 | 不变（连接密码仍 AES-256-GCM） | 无 |
| `sessionCleaner` / phase2 cron | SQL 不变（Prisma 抽象） | 无 |

**结论**：切换影响集中在 schema + 配置 + Docker，**业务逻辑零改动**。

### 1.6 加密策略（MVP）

- **MVP**：SQLite 文件权限（Docker volume 权限 + OS 文件权限）+ 连接密码已 AES-256-GCM 加密
- **后续增强**（phase2 或独立）：SQLCipher 透明加密（需 `better-sqlite3-sqlcipher` 或 driver adapter 支持，Prisma 兼容性需进一步验证 → 列 Open Question）
- **不引入外部依赖**（符合"轻便"原则）

### 1.7 备份策略（phase2 简化）

- 原 MySQL：`mysqldump --single-transaction` + gzip
- 新 SQLite：`VACUUM INTO '/data/backup.db'`（在线备份，不阻塞）或拷贝文件（需 WAL checkpoint）
- phase2 备份模块工作量降低（无 mysqldump 依赖、无 mysql-client）

---

## 2. BLOCKER-1: Prisma Migration（SQLite）

**前置依赖**：§1 schema 切换完成。

**步骤**：
1. schema 切 sqlite + 移除 @db.VarChar（§1.2）
2. `DATABASE_URL=file:./dev.db`（本地开发）
3. `cd packages/backend && npx prisma migrate dev --name init`（生成 SQLite migration）
4. 提交 `packages/backend/prisma/migrations/`
5. 验证：干净库 `npx prisma migrate deploy` 建出 5 张表（users/sessions/projects/project_members/connections）
6. `npx prisma migrate status` 无 pending

**验收**：
- `docker compose up` 后 backend 容器 `migrate deploy` 成功建表
- 现有 145 测试仍绿（mock，不依赖真实 DB）
- seed 正常（admin 创建）

---

## 3. BLOCKER-2: CI（GitHub Actions）

`.github/workflows/ci.yml`：
```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @remotehub/shared build
      - run: pnpm -r lint
      - run: pnpm --filter @remotehub/backend exec tsc --noEmit
      - run: pnpm -r test
```

**说明**：
- SQLite 让测试无需起 MySQL 服务（未来集成测试用临时文件库）
- 不在 CI 跑 migrate（单元测试 mock，集成测试用 db push 临时库，后续 B-6 增强）
- `lint` / `tsc --noEmit` / `test` 三道门

**验收**：PR 触发 CI 全绿。

---

## 4. B-6: 补核心 Service 单元测试

**新建测试文件**（TDD 模式，先写测试再补实现验证）：
- `packages/backend/src/services/userService.test.ts` —— listUsers/searchUsers/getUser/updateUser（last-admin 保护事务）/ deleteUser（admin/owner 保护事务）
- `packages/backend/src/services/projectService.test.ts` —— listProjects/createProject（owner 自动插入事务）/ updateProject（P2025/P2002）/ deleteProject
- `packages/backend/src/services/memberService.test.ts` —— listMembers/addMember（MEMBER_001 + USER_002）/ updateMemberRole（last-owner）/ **removeMember（含 B-3 修复：editor/viewer 只能移除自己）**

**补充**：
- `connectionService.test.ts` 加 `getConnection` 测试（B-4 修复：viewer 拿不到 encryptedPass、editor 拿到、CONN_002）
- 新建 `utils/appError.test.ts` —— `handlePrismaUniqueViolation` 的 P2002 → 业务码映射（username/name/projectId,name/projectId,userId/tokenHash）

**mock 约定**（与 authService.test.ts 对齐）：
- `$transaction` mock 支持回调形式（交互式事务）+ 数组形式
- `$transaction.mockImplementation(async (arg) => typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg))`

**验收**：测试数从 145 → 预估 200+；关键事务分支（last-admin/last-owner/P2002/P2025/删除保护）全覆盖。

---

## 5. 前端迁移（规划，独立子项目）

**本次 spec 仅规划**，实施走独立 brainstorming → spec → plan。

### 5.1 组件分级（审计报告 §6）
- ✅ 可迁移（10）：ConnectionCard, ConnectionModal, LoginPage, ProjectModal, ProjectIcons, Icons, LoadingStates, UIComponents, UserManagementModal, Sidebar
- ❌ 弃用（5）：AIAssistant, DatabaseConfigModal, MigrationControlPanel, MigrationWizard, StorageModeToggle
- 🗑 副本（1）：Sidebar.updated.tsx

### 5.2 迁移工作量（待迁移立项时逐组件核实）
- localStorage 调用 → API client（TanStack Query）
- 路由（main.tsx 当前仅 1 函数，需建路由树）
- 状态管理（auth token + 刷新拦截器，已有 api/client.ts 基础）
- 预估独立子项目（10 组件 × 适配 + 路由 + 状态）

### 5.3 阻塞关系
- phase2 §19（管理后台页面）blocked，直到前端迁移完成
- 前端迁移是 phase2 硬前置（design §23）

---

## 6. MVP 决策汇总

| 决策 | 选择 | 理由 |
|------|------|------|
| 持久化 | SQLite + WAL | 轻、几百人够、去掉 db 容器运维 |
| SQLite 加密 | MVP 文件权限 | 不引入依赖，SQLCipher 留后续 |
| schema 兼容 | 移除 @db.VarChar | 机械工作，代码逻辑零改动 |
| dev 数据迁移 | 不迁移 | 一期从零，无历史数据 |
| 前端迁移 | 本次只规划 | 独立子项目，避免 scope creep |
| CI 触发 | PR + push main | 标准实践 |

---

## 7. Open Questions（实施时验证）

1. **SQLite WAL pragma 执行时机**：server.ts 启动时执行（推荐）vs prisma.ts 模块加载时（需 top-level await）。实施时定。
2. **SQLCipher 可行性**（phase2 后续）：Prisma 6 driver adapter 是否支持加密 SQLite？若需透明加密，验证 `better-sqlite3-sqlcipher` 兼容性。本次 MVP 不做。

## 7.5 已确认决策（user review 2026-07-17）

- ✅ **better-sqlite3 原生编译**：接受权衡，Dockerfile.backend 加 build tools（python3/make/g++），Docker 构建时验证
- ✅ **phase2 备份模块**：本次同步更新 phase2-design §7（mysqldump → VACUUM INTO，删 mysql-client 依赖）
- ✅ **前端迁移**：本次 spec 只规划，实施走独立子项目
- ✅ **dev 数据**：切 provider 后丢弃（一期从零）
- ✅ **schema @db.VarChar 移除**：合适（SQLite 全 TEXT 无长度概念），**前提是补全应用层字段长度校验**（见 §1.2，归入 B-6）

---

## 8. 实施顺序（建议）

1. **§1 持久化切换**（schema + prisma.ts + env + Docker）→ 跑测试确认绿
2. **§2 migration**（migrate dev --name init）
3. **§3 CI**（GitHub Actions）
4. **§4 补测试**（B-6，TDD）
5. **§5 前端迁移立项**（独立 brainstorming）

1-2 是部署链路修复（BLOCKER），3 是质量门，4 是测试覆盖，5 解锁 phase2。
