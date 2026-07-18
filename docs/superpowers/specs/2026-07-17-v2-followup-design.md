# RemoteHub V2 收尾设计（持久化切换 + BLOCKER + 测试 + 前端迁移）

**日期**: 2026-07-17
**状态**: ✅ review 完成（2026-07-17 grill 两轮：D1–D10 拍板、F1–F6 订正、5 OQ 关闭/保留），待转 writing-plans
**范围**: v2 一期收尾的 5 项 —— ① 持久化 MySQL→SQLite ② BLOCKER-1 migration ③ BLOCKER-2 CI ④ B-6 补测试 ⑤ 前端迁移规划
**前置**: 审计报告 `docs/superpowers/specs/2026-06-24-remotehub-audit.md` + 全修 commits（4af159e..e3a865b）
**方法**: MVP 优先；不确定项已 MCP 查证（context7/web-search）+ 真实代码核验（两轮 grill）

> **修订记录（2026-07-17 grill 两轮）**：本 spec 经 grill review，决策点 D1–D10、事实订正 F1–F6 已落入下文（inline 标 `[Dx]`/`[Fx]`）。完整决策推理见 `implementation-notes.md`。

---

## 1. 持久化切换：MySQL → SQLite + WAL

### 1.1 决策依据（MCP 查证）

| 查证项 | 结论 | 来源 |
|--------|------|------|
| SQLite WAL 并发上限 | 200 并发用户实测；NVMe+WAL 10万读/秒、1万写/秒；WAL 降 p99 30-60% | web-search ref_6/7/8 |
| SQLite WAL 限制 | 并发写仍串行（WAL 不解决多写并发）；无 WAL 时并发写 SQLITE_BUSY→P1008 | web-search ref_9 / adapter errors.ts |
| Prisma SQLite enum | ❌ 不支持（P1012）—— RemoteHub 未用，OK | context7 |
| Prisma SQLite `@db.VarChar` | ❌ 不支持 native types —— 必须移除 | context7 |
| Prisma SQLite 自引用关系 | ✅ 支持（Connection.requiredVpnId） | context7 |
| Prisma SQLite WAL 默认 | ❌ 默认不开，需手动 `PRAGMA journal_mode=WAL` | context7 #11789 |
| Prisma 6 SQLite 驱动 | driver adapter `@prisma/adapter-better-sqlite3`；**6.15+ GA，不需 previewFeatures** `[D4]` | context7 generateClient.ts |
| better-sqlite3 v12 musl prebuild | ✅ 已发布 linuxmusl-x64/arm；但按 Node ABI 发布会 lag（Node 新版本可能缺），需 build tools 兜底 `[D7]` | web-search ref_4/#1384 |

**适配判断**：RemoteHub 几百人、单机 Docker、CRUD 写少 → SQLite WAL 远够；写串行限制不触发。

### 1.2 schema 改动（机械清理 + 校验接线）

`packages/backend/prisma/schema.prisma`：
- `datasource db { provider = "mysql" }` → `provider = "sqlite"`
- **移除所有 `@db.VarChar` —— 实际 12 处** `[F1，原"约 20"订正]`：User(username/role)、Session(userAgent/ip)、Project(icon)、ProjectMember(role)、Connection(host/username/encryptedPass/protocol/vpnType/vpnLoginUrl) → `String`（SQLite TEXT）
- 移除 `@db.Text`（确认无残留）
- 保留 `@unique`/`@map`/`@@index`/`@@map`/`@id`/`@default(uuid())`/`@updatedAt`/关系（均 provider 无关）
- `Int?`(port)/`Boolean`/`DateTime` 不变
- **schema 设计原则统一**：design §2.4 原"MySQL/SQL Server 跨 provider"锁定 SQLite，"可能含中文不指定 VarChar"等规则失效（SQLite 全 TEXT，无长度概念）

**应用层长度校验前提 ⚠️ `[D1 修正·第三轮 grill]`**：

校验逻辑集中在 `@remotehub/shared/validators.ts`（12 个 validate 函数：username/nickname/password/role/memberRole/protocol/vpnType/projectName/connectionName/host/port/tags + `validators.test.ts` 已测）。经核验，**Connection（create §103 + update §203 双路径）、Member role、User 注册（authService §58-62）、User 改密（authService §188）、Project name（create+update）均已接好**。

移除 `@db.VarChar` 前需补的真实缺口（**前移 Plan A，非 B-6**）：
1. `userService.updateUser` 补 `validateUsername` + `validateRole` + `validateNickname`（替换手写 `nickname.length>50` §53）
2. `authService` 注册补 `validateRole`（§58-62 漏了 role）
3. shared 新增 `validateDescription` + `validateIcon` + `validateNotes`(≤2000) + `validateVpnLoginUrl`(≤500) `[D10]`
4. `projectService` create/update 调 `validateDescription` + `validateIcon`
5. `connectionService.validateConnectionFields` 加 `validateNotes` + `validateVpnLoginUrl`

性质：主要是**接线**（service 调 shared），非写校验逻辑。Plan A 校验子任务 scope 因此远小于原估。不引入 SQLite CHECK 约束（Prisma migration 维护复杂，应用层校验更一致）。

> **design §308 反向标注 ⚠️**：design §3.1 §308 字面「非 VPN 时 requiredVpnId 必须为 null」是**错的**（与 SSH→VPN 依赖冲突）。以代码为准（`connectionService` §127-129 create payload、§212-226 update 降级、§351-362 validateVpnConsistency）：非 VPN 时 `vpnType`/`vpnLoginUrl` 置 null，**`requiredVpnId` 保留**。补校验时**不改 VPN 逻辑**，否则引入回归。

### 1.3 Prisma Client（driver adapter + WAL）`[D4/D5/F5]`

`packages/backend/src/utils/prisma.ts`（**补回 `globalForPrisma` dev 单例** `[F5]`，spec 原示例丢了它会导致 `tsx watch` 热重载泄漏 better-sqlite3 文件锁）：
```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { env } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };
function createPrisma(): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}
export const prisma = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```
- 依赖：`pnpm --filter @remotehub/backend add @prisma/adapter-better-sqlite3`
- **driver adapter Prisma 6.15+ GA，不需 `previewFeatures=["driverAdapters"]`** `[D4，OQ3 关闭]`。Plan A 前置：核验 lockfile `@prisma/client` 实际锁定 ≥6.15（否则 `pnpm update` 或退而加 previewFeatures）。
- **WAL pragma 改 `$queryRaw` + 断言**（D4）—— 在 server.ts 启动执行（见 §1.8），不在模块加载（pragma 是 async，模块加载是同步 export）：
  ```typescript
  const [wal] = await prisma.$queryRaw`PRAGMA journal_mode = WAL`;
  if (wal?.journal_mode !== 'wal') throw new Error(`WAL 切换失败: ${JSON.stringify(wal)}`);
  ```
  原 `$executeRawUnsafe` 不返回值、无法确认切换成功，**弃用**（切不成不知道等于裸奔）。与官方 #11789 regression test 路径一致。
- ~~移除 connection_limit~~（`env.ts` 与 `.env` 的 DATABASE_URL 本来就没有该参数 `[F2]`，空改动）

### 1.4 Docker 简化 `[F3/F4/D3/D7]`

`docker-compose.yml`：
- **删除 `db` 服务**（MySQL 容器）+ `db-data` volume
- backend `volumes`：`sqlite-data:/data`
- `DATABASE_URL=file:/data/prod.db`
- 删除 `depends_on: db`
- ~~`docker-compose.dev.yml` 同理删 db~~ —— 仓库**无此文件** `[F4]`，删幻觉引用

`docker/Dockerfile.backend`：
- `prisma migrate deploy` 仍适用（provider 无关）
- ~~删除 mysql-client 安装~~ —— Dockerfile **从未安装** `[F3]`，空改动
- **加 better-sqlite3 build tools**（builder 阶段）：`RUN apk add --no-cache python3 make g++`。保留作 prebuild fallback（better-sqlite3 v12 虽有 musl prebuild，但按 Node ABI 发布会 lag，见 §1.1）
- **runtime 不补 libstdc++** `[D7]`：node:20-alpine 自带（node 二进制运行依赖即证明；better-sqlite3 .node 链接同一 `libstdc++.so.6`）。前提：base 保持 node:20-alpine；若换 distroless/scratch/纯 alpine base 则需 `apk add libstdc++`
- 不需 sqlite-libs（better-sqlite3 静态链 SQLite amalgamation 源码）
- **删 esbuild seed 编译步骤**（builder 第 12 行，D3 后生产由 server.ts 启动自动 seed，不再需要 seed.js 产物）
- **CMD 简化**（D3）：`migrate deploy && node dist/server.js`（删 `node dist/utils/seedCheck.js` 调用）
- **验证项**：docker build 后 `node -e "require('better-sqlite3')"` 坐实 .node 加载 + `pnpm --prod deploy` 对原生模块的拷贝行为验证

### 1.5 兼容性矩阵（已有代码影响）`[D1/F2]`

| 文件/模块 | 改动 | 风险 |
|-----------|------|------|
| `schema.prisma` | provider + 移除 @db.VarChar（**12 处**） | 低（机械）`[F1]` |
| `config/env.ts` | DATABASE_URL 改 file:（无 connection_limit 可删，**本来就没有** `[F2]`） | 低 |
| `utils/prisma.ts` | driver adapter + **补 globalForPrisma** + WAL export | 低 `[F5]` |
| `server.ts` | **async bootstrap**（WAL pragma + seed + cleaner + listen）`[D5]` | 中 |
| `docker-compose.yml` | 删 db 服务 + volume | 低 |
| `Dockerfile.backend` | build tools + **删 esbuild seed** + CMD 简化 | 低 `[D7]` |
| **业务逻辑代码（services/controllers/middleware）** | **零改动** | 无 |
| **应用层校验（接线 shared validators）** | **补 5 处调用 + shared 加 4 validator** `[D1]` | 低 |
| seed 链路 | 抽 `seedAdmin` + 删 seedCheck + seed.js 出库 `[D3/D6]` | 中 |
| 测试 mock | `createPrismaMock` helper `[D8]` | 低 |
| `seed.ts` | 补 adapter + 调 seedAdmin | 低 |
| `ENCRYPTION_KEY` / AES 加密 | 不变（连接密码仍 AES-256-GCM） | 无 |
| `sessionCleaner` / phase2 cron | SQL 不变（Prisma 抽象）；raw SQL 仅 `healthRoutes SELECT 1`（跨 provider 兼容） | 无 |
| 测试 mock（@prisma/client） | 不变（mock prisma，不碰真实 DB） | 无 |

**结论**：**业务逻辑零改动**；切换 + 校验接线 + seed 链路集中在 schema/配置/Docker/service 接线层。

### 1.6 加密策略（MVP）

- **MVP**：SQLite 文件权限（Docker volume 权限 + OS 文件权限）+ 连接密码已 AES-256-GCM 加密
- **后续增强**（phase2 或独立）：SQLCipher 透明加密（driver adapter 路径利于平滑接入 `[D4]`，需验证 `better-sqlite3-sqlcipher` 兼容性 → OQ2）
- **不引入外部依赖**（符合"轻便"原则）

### 1.7 备份策略（phase2 简化）

- 新 SQLite：`VACUUM INTO '/data/backup.db'`（在线备份，不阻塞）或拷贝文件（需 WAL checkpoint）
- phase2 备份模块工作量降低（无 mysqldump 依赖、无 mysql-client）

### 1.8 server.ts 启动序列 `[D5]`（新增）

改 `async bootstrap()`，顺序（**WAL 是第一道、listen 是最后一道**）：
1. **WAL pragma**（`$queryRaw` + 断言 `'wal'`）—— 任何 DB 操作前
2. **ensureAdminSeed**（count admin → 缺则 `seedAdmin(prisma)`，见 §1.9）
3. **startSessionCleaner**（cron，启动不立即写，放 WAL 后保持一致）
4. **app.listen**（DB 就绪后才接请求）

WAL/seed 失败均 **fail-fast**（`process.exit(1)`）。bootstrap 用 async 函数 + `.catch`，不用 ESM top-level await（rejection 不好统一兜底）。`export { app }` 同步构建，测试 import 不触发 bootstrap（现状即如此，145 测试绿）。

首次 `migrate deploy` 不走 WAL（建表在 pragma 前）——接受（WAL 是 db 级持久，server.ts 首次 pragma 后永久 WAL；不值得为一次性建表在 alpine 装 sqlite3 CLI）。

### 1.9 seed 链路修复 `[D3/D6]`（新增，部署 BLOCKER）

**现状 bug（三层叠加）**：
1. `seedCheck.ts` 只 `export async function`、无顶层调用 → Dockerfile CMD `node dist/utils/seedCheck.js` 是 **no-op**
2. 即使被调用，`execSync('npx prisma db seed')` 走 `tsx prisma/seed.ts`，生产 `--prod deploy` 无 tsx → 失败
3. esbuild 编译的 `seed.js`（cjs）是孤儿产物，无人调用；且与 tsc 输出 esm 的 module interop 冲突

**结果**：生产首次部署 migrate 建表后不会自动建 admin → **DB 空、登录页无账号、部署即不可用**（BLOCKER 级，原 OQ5「既存不影响」升级定性）。

**修复**：
- 抽 `src/utils/seedAdmin.ts` 导出 `seedAdmin(prisma: PrismaClient)`（接收外部 prisma，不自己 new）
- `server.ts` `ensureAdminSeed` 传 server 单例（**带 adapter + 已开 WAL**）→ 规避 bug 2/3
- `prisma/seed.ts` 改 `new PrismaClient({ adapter })` + 调 `seedAdmin(prisma)`（保留给开发 `pnpm db:seed` 手动跑；顶层 main 留着无妨，独立进程）
- server.ts **不 import `prisma/seed.ts`**（避 process.exit 地雷 + interop），只 import `src/utils/seedAdmin.ts`
- Dockerfile 删 esbuild seed 编译步骤（builder 第 12 行）+ CMD 简化（见 §1.4）
- `seed.js` 出库 + `.gitignore` `[D6]`（反正不再生成）

---

## 2. BLOCKER-1: Prisma Migration（SQLite）

**前置依赖**：§1 schema 切换 + §1.2 校验接线完成。

**现状**：`packages/backend/prisma/migrations/` **不存在**（审计 §68-72 已列为 BLOCKER-1）—— dev 库疑用 `db push` 手建，生产 `migrate deploy` 无 migration 可部署 → 上线即坏。本步生成首个 init migration 解决。

**步骤**：
1. schema 切 sqlite + 移除 @db.VarChar（§1.2）
2. `DATABASE_URL=file:./dev.db`（本地开发，先切再 migrate）
3. `cd packages/backend && npx prisma migrate dev --name init`（生成 SQLite migration）
4. 提交 `packages/backend/prisma/migrations/`
5. 验证：干净库 `npx prisma migrate deploy` 建出 5 张表
6. `npx prisma migrate status` 无 pending

**验收自动化 `[D9]`**：手动"migrate deploy 建 5 表"→ **集成测试** `setupTestDb()`（临时 SQLite file + migrate deploy）+ 验 5 表存在 + 关键约束（`@@unique([projectId,name])` 抛错、`user→session onDelete Cascade`、`connection 自引用 requiredVpnId onDelete SetNull`）。`vitest.config` 加 unit/integration 分离。不贪多（不加 CRUD 集成，那是 B-6 单元的领域）。

---

## 3. BLOCKER-2: CI（GitHub Actions）`[D2]`

`.github/workflows/ci.yml` —— **原 `pnpm -r lint`/`pnpm -r test` 字面必崩**（shared + frontend 无 eslint 依赖、frontend 0 测试文件且 `vite.config` 无 `passWithNoTests`）。**重写**，filter 到 backend + shared：
```yaml
name: ci
on: { pull_request: {}, push: { branches: [main] } }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4          # pin pnpm 版本（与 lockfile 生成版本一致）
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @remotehub/shared build
      - run: pnpm --filter @remotehub/shared test      # validators.test.ts
      - run: pnpm --filter @remotehub/backend lint     # eslint.config.js 齐全
      - run: pnpm --filter @remotehub/backend exec tsc --noEmit
      - run: pnpm --filter @remotehub/backend test     # 145 → B-6 后 200+
```

**说明**：frontend 本次 0 改动，不参与 CI 门；frontend lint+test 体系作为 §5 前端迁移子项目的**前置任务**。SQLite 让测试无需起 MySQL 服务；不在 CI 跑 migrate（单元测试 mock，集成测试 D9 用临时库）。`lint` / `tsc --noEmit` / `test` 三道门。

**验收**：PR 触发 CI 全绿。

---

## 4. B-6: 补核心 Service 单元测试 `[D8]`

**新建测试文件**（TDD）：
- `userService.test.ts` —— listUsers/searchUsers/getUser/updateUser（last-admin 保护事务）/ deleteUser
- `projectService.test.ts` —— createProject（owner 自动插入事务）/ updateProject（P2025/P2002）/ deleteProject
- `memberService.test.ts` —— addMember（MEMBER_001 + USER_002）/ updateMemberRole（last-owner）/ removeMember（B-3 修复）
- `connectionService.test.ts` 加 getConnection（B-4 修复分支）
- 新建 `utils/appError.test.ts` —— `handlePrismaUniqueViolation` 的 P2002 → 业务码映射（被测对象已存在且映射齐全 §67-78，是补测试非写实现；**留验证项**：切 SQLite 后 P2002 `meta.target` 格式是否与 MySQL 一致）

**抽 `createPrismaMock()` helper `[D8]`**（`packages/backend/src/test/helpers/prismaMock.ts`）：现有 auth/connection 2 个 service test **各自复制了一份 prismaMock**（含 `$transaction` 回调/数组双形式），B-6 新增 3 个会再复制 3 份 → 抽 helper，5→1。helper 含：
```typescript
$transaction: vi.fn(async (arg) => typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg))
```

**注**：`@remotehub/shared/validators.ts` 已有 `validators.test.ts` 覆盖校验逻辑本身，B-6 测的是 **service 层调用 + 错误聚合**（VAL_001 details），不重测校验逻辑。

**验收**：测试数 145 → 200+；关键事务分支（last-admin/last-owner/P2002/P2025/删除保护）全覆盖。

---

## 5. 前端迁移（规划，独立子项目）

**本次 spec 仅规划**，实施走独立 brainstorming → spec → plan。

> ⚠️ **未闭环声明（2026-07-18 grill meta-review）**：前端迁移的**详细 spec/plan 当前不存在**——本 §5 仅为范围规划（组件分级 + 工作量待核实 + 阻塞关系），不是可执行 spec。前端迁移是 **phase2 §19 的硬前置**，属 **v2 收尾后的显式未闭环项**。
> **触发条件**：phase2 §19（管理后台页面）启动前**必须**先立项前端迁移（走独立 brainstorming → spec → plan），否则 phase2 §19 blocked。触发前，任何"留给前端迁移子项目"的引用（如 Plan B 的 frontend lint+test 前置）应视为**未承接**——不要假定它已有方案。

### 5.1 组件分级（审计报告 §6）
- ✅ 可迁移（10）：ConnectionCard, ConnectionModal, LoginPage, ProjectModal, ProjectIcons, Icons, LoadingStates, UIComponents, UserManagementModal, Sidebar
- ❌ 弃用（5）：AIAssistant, DatabaseConfigModal, MigrationControlPanel, MigrationWizard, StorageModeToggle
- 🗑 副本（1）：Sidebar.updated.tsx

### 5.2 迁移工作量（待迁移立项时逐组件核实）
- localStorage 调用 → API client（TanStack Query）
- 路由（main.tsx 当前仅 1 函数，需建路由树）
- 状态管理（auth token + 刷新拦截器）
- 预估独立子项目（10 组件 × 适配 + 路由 + 状态）

### 5.3 阻塞关系
- phase2 §19（管理后台页面）blocked，直到前端迁移完成
- 前端迁移是 phase2 硬前置（design §23）
- **前端迁移子项目立项的第一件事：建 frontend lint+test 体系** `[D2]`（当前 frontend 有 lint script 无 eslint 依赖、0 测试文件）

---

## 6. MVP 决策汇总

| 决策 | 选择 | 理由 |
|------|------|------|
| 持久化 | SQLite + WAL | 轻、几百人够、去掉 db 容器运维 |
| SQLite 加密 | MVP 文件权限 | 不引入依赖，SQLCipher 留后续 |
| schema 兼容 | 移除 @db.VarChar（12 处） | 机械工作，业务逻辑零改动 |
| dev 数据迁移 | 不迁移 | 一期从零，无历史数据 |
| 前端迁移 | 本次只规划 | 独立子项目，避免 scope creep |
| CI 触发 | PR + push main | 标准实践 |
| Docker runtime libstdc++ | 不补 `[D7]` | node:20-alpine 自带 |
| B-6 mock | 抽 createPrismaMock helper `[D8]` | 5 份重复 → 1 |
| schema 验收 | 集成测试 `[D9]` | migrate/schema 约束自动化保障 |
| notes/vpnLoginUrl 长度 | 补上限（≤2000/≤500）`[D10]` | DB 兜底没了，防超长滥用 |

---

## 7. Open Questions（关闭/保留状态）

1. ~~SQLite WAL pragma 执行时机~~ ✅ **关闭 [D5]**：server.ts `async bootstrap` 启动执行，`$queryRaw` + 断言
2. **SQLCipher 可行性**（phase2 后续）：保留。driver adapter 路径利于平滑接入 `[D4]`，phase2 验证 `better-sqlite3-sqlcipher`
3. ~~schema generator previewFeatures~~ ✅ **关闭 [D4]**：Prisma 6.15+ driver adapter GA，不需 previewFeatures
4. ~~CI lint 前置~~ ✅ **关闭 [D2]**：backend 有 eslint.config.js，shared/frontend 都没有 → CI filter 到 backend
5. ~~seedCheck 死代码矛盾~~ ✅ **关闭并升级 [D3]**：定性为部署 BLOCKER（非"既存小坑"），纳入 Plan A §1.9 修复

---

## 8. 实施顺序（修订）

1. **§1 schema 切换 + §1.2 校验接线**（D1，校验前移）→ 测试绿
2. **§1.3 prisma.ts + §1.8 启动序列 + §1.9 seed 链路**（D3/D5）→ 启动验证（WAL 断言 + admin seed）
3. **§2 migration + §D9 集成测试** → 集成测试绿（5 表 + 约束）
4. **§1.4 Docker** → docker build 验证（require better-sqlite3 + migrate deploy）
5. **§3 CI**（Plan B，独立）
6. **§4 B-6 单元测试 + D8 helper**（Plan C，Plan A 后）
7. **§5 前端迁移立项**（独立 brainstorming，不在本 plan）

**Plan 拆分建议**：Plan A = 步骤 1-4（切换+校验+启动+seed+migration+Docker+集成测试，强耦合一条链，不宜横拆，按可验证阶段分 task）；Plan B = 步骤 5（CI）；Plan C = 步骤 6（B-6 测试）。D9 集成测试并入 Plan A（依赖 migration）。
