# RemoteHub 项目审计报告

**日期**: 2026-06-24
**范围**: 整个项目（一期 v2 refactor 成果 + phase2 计划 + 遗留代码 + 文档治理）
**方法**: 多维度静态扫描（git 历史、代码结构、文档一致性、构建/部署链路、测试与 CI、依赖）
**结论速览**: 一期主体完成且有测试与部署，但存在 **2 个上线即坏的 BLOCKER**（migration 缺失、无 CI）、**三套并行代码**的遗留堆积，以及 **phase2 硬前置（前端迁移）完全缺失**。phase2 本身 0% 实施。

---

## 1. 执行摘要

| 维度 | 状态 |
|------|------|
| 一期核心（auth/user/project/member/connection） | ✅ 完成，145 个 mock 单元测试通过 |
| 部署（Docker + Caddy） | ⚠️ 配置齐全但 **migration 文件缺失，生产部署会失败** |
| CI | ❌ 不存在（`.github/` 空），测试无自动化兜底 |
| phase2（审计/监控/安全/备份/WS/2FA 等 11 模块） | ❌ **0% 实施**，仅 design + plan 文档 |
| 前端迁移（phase2 硬前置） | ❌ **0%**，仅 API 客户端骨架；16 个 UI 组件仍在根目录 `RemoteHub/` |
| 文档与代码一致性 | ❌ `openspec/project.md` 与 `integrate-backend-api/tasks.md` 严重过时（本次已修正） |
| 遗留代码 | ⚠️ 三套并行代码：`RemoteHub/`(53) + 根 `backend/`(116) + `packages/`(活) |

**两个 BLOCKER 必须在 phase2 开工前解决**：① 生成 Prisma migration；② 建立 CI。

---

## 2. 代码库地图：三套并行代码

v2 refactor 重写了整个后端（TypeORM → Prisma）和前端架构，但**旧代码未删除**，导致三套代码并存：

| 目录 | 角色 | 规模 | 状态 | 处置 |
|------|------|------|------|------|
| `packages/{shared,backend,frontend}/` | **当前活代码** | monorepo | 一期完成、phase2 待建 | 保留，所有后续工作在此 |
| 根 `backend/` | 旧 TypeORM 后端 | 116 git 文件 | 实现了 phase2 全部功能的旧版本（audit/backup/monitoring/websocket/export/security），但基于 TypeORM + 大量 mock | **保留作 phase2 移植参考**（§7），加 README 标注 |
| `RemoteHub/` | 旧前端（localStorage 时代） | 53 git 文件 | 含 16 个 UI 组件（design §10 指定保留迁移）+ AIAssistant/迁移工具/storage adapter（该弃） | 组件迁移后整体清理（§6） |

**关键认知**：`openspec/changes/integrate-backend-api/tasks.md` 的 §6.1–6.6 完成标记指向的是**根 `backend/`**（已废弃），不是 `packages/backend/`。这不是"虚假完成"，而是"旧实现未迁移、change 未 archive"。phase2 要在新架构重做这些功能，旧实现可作业务逻辑参考。

---

## 3. 完成度矩阵

### 一期（v2 refactor）— 主体完成
| 模块 | 实现 | 测试 | 备注 |
|------|------|------|------|
| 认证（JWT + refresh rotation） | ✅ authService + 7 endpoints | ✅ | refresh 轮换 + 重用检测 + 事务 |
| 用户管理 | ✅ userService + 5 endpoints | ✅ | 删除保护（唯一 owner / 最后 admin） |
| 项目管理 | ✅ projectService | ✅ | owner 自动插入（事务） |
| 成员管理 | ✅ memberService | ✅ | 角色/owner 保护 |
| 连接管理 | ✅ connectionService | ✅ | VPN 依赖 + AES-256-GCM 加密 |
| 中间件（auth/role/projectRole） | ✅ | ✅ | admin 绕过 |
| Session 清理 cron | ✅ sessionCleaner | — | 每日 03:00 |
| 部署（Docker + Caddy） | ⚠️ 配置齐全 | — | **migration 缺失，见 BLOCKER-1** |

### phase2 — 0% 实施
| 模块 | 批次 | 设计 | 实施 |
|------|------|------|------|
| 审计日志 / 系统监控 / 安全增强 | P0 | ✅ design 完成 | ❌ |
| 数据备份 / WebSocket / 密码重置 | P1 | ✅ | ❌ |
| 导入导出 / 项目增强 / 2FA / K8s 探针 / Swagger | P2 | ✅ | ❌ |

---

## 4. 问题清单（分级）

### 4.1 🔴 BLOCKER（部署/数据破坏性，phase2 前必修）

#### BLOCKER-1: Prisma migration 文件缺失
- **证据**: `ls packages/backend/prisma/migrations/` → 目录不存在；`git ls-files packages/backend/prisma/migrations/*` → 空；`docker/Dockerfile.backend:22` CMD 为 `npx prisma migrate deploy`；`scripts/deploy.ps1` 无 migration 相关处理；`.gitignore` 未排除 migrations
- **影响**: Docker 生产部署时 `prisma migrate deploy` 无 migration 可应用 → **建不了表，上线即坏**。dev 库大概是用 `prisma db push` 手建的（refactor-design §6.4 明令禁止生产用 `db push`）
- **建议操作**: 本地连开发 MySQL 执行 `npx prisma migrate dev --name init` 生成初始 migration，提交 `packages/backend/prisma/migrations/`，验证 `prisma migrate deploy` 能在干净库建表
- **风险**: 低（生成 migration 是标准操作；需本地 MySQL 运行）
- **验收**: 干净数据库执行 `prisma migrate deploy` 成功建出 5 张表；`prisma migrate status` 无 pending

#### BLOCKER-2: 无 CI
- **证据**: `.github/**` 无任何文件；根 `package.json` 有 `test`/`lint` script 但无自动化触发
- **影响**: 145 个测试 + ESLint + tsc 零自动化兜底；refactor-design §11.7"PR 必须过 CI"是空话；任何回归只能靠人肉发现
- **建议操作**: 建 `.github/workflows/ci.yml`，矩阵跑 `pnpm install` → `pnpm --filter @remotehub/shared build` → `pnpm -r lint` → `pnpm -r test`
- **风险**: 低
- **验收**: PR 触发 CI，lint + typecheck + test 全绿

### 4.2 🟠 HIGH（文档/上下文误导）

#### HIGH-1: `openspec/project.md` 过时 — ✅ 本次已修正
- 原描述"纯前端应用、localStorage、@google/genai、无测试"，现重写为 monorepo 现状

#### HIGH-2: `integrate-backend-api/tasks.md` 与 `proposal.md` 误导 — ✅ 本次已加标注
- 顶部已加"指向已废弃根 backend/"状态说明

#### HIGH-3: `TEMPORARY_OPERATIONS.md` TypeORM 残留
- **证据**: 描述 TypeORM 迁移问题、`migrations-disabled/`，现已是 Prisma
- **建议**: 删除（归入 B4 清理）

#### HIGH-4: `proposal.md` 与 `proposal.updated.md` 副本并存
- **证据**: diff 确认 `.updated` 是扩展版（加 Feature Toggle 渐进迁移方案），但该方案（`VITE_USE_*`、`App.updated.tsx`）已被 v2 直接重写否决
- **建议**: 删除 `proposal.updated.md`（归入 B4）；`proposal.md` 已加取代标注

#### HIGH-5: 前端迁移硬前置缺失
- **证据**: phase2-design §23 列"前端迁移 spec"为硬前置；`docs/superpowers/specs/` 无此 spec；`packages/frontend/src` 仅 4 文件（App/main/api/client/api/queries），App.tsx 仅 1 个函数；16 组件在 `RemoteHub/` 未迁
- **影响**: phase2 §19 管理后台页面全部 blocked
- **建议**: 本次产出前置评估（§6）；前端迁移单独立项（brainstorming → spec → plan）；phase2 plan §19 标 blocked

### 4.3 🟡 MEDIUM（遗留堆积）

#### MEDIUM-1: 根 `backend/` 116 文件 + `RemoteHub/` 53 文件堆积
- 不在 pnpm workspace（孤立），但污染搜索与上下文
- **建议**: 根 `backend/` 保留+加 README（§7）；`RemoteHub/` 随前端迁移逐步清理（§6）

#### MEDIUM-2: `seed.js` 编译产物入库 + `package.json` seed 改动未提交
- **证据**: `git ls-files` 显示 `seed.ts` + `seed.js` 都被跟踪；`seed.js` 是 esbuild 产物（`"use strict"; var __create=...`）；Dockerfile L12 用 esbuild 重编译 → **删 git 里的 seed.js 安全**；当前 `package.json` 未提交改动把 `prisma.seed` 从 `node seed.js` 改为 `tsx seed.ts`
- **建议**: `git rm packages/backend/prisma/seed.js`；`.gitignore` 加 `packages/backend/prisma/seed.js`；提交 `package.json` 改动
- **验收**: `pnpm test` 仍通过；`docker build` 仍成功（esbuild 重编译 seed.js）

#### MEDIUM-3: OpenSpec `specs/` 空，`integrate-backend-api` 未 archive
- **建议**: 该 change 描述的方案已被 v2 取代，archive 时需明确"被 refactor-design 取代"，spec deltas 反映 packages/backend 现状（归入 B4）

### 4.4 🟢 LOW（phase2 plan 实施前优化）

| # | 问题 | 证据 | 建议 |
|---|------|------|------|
| LOW-1 | plan 缺集成测试基建 Task | design §20.2/§24.2 要求 supertest + 测试库 + globalSetup，plan 无对应 Task | 补 P0-TEST Task：装 supertest、建 remotehub_test 库、globalSetup、清理策略 |
| LOW-2 | 审计中间件偏离 design | design §3.5.2 要求中间件自治取 before 快照；plan Task 0.4 改为 `getBeforeSnapshot` 回调，默认不取 | 改回自治模式（中间件内 `prisma.<model>.findUnique`） |
| LOW-3 | dotenv 前提存疑 | plan Task 0.1 断言"tsx watch 不自动加载 .env"，但一期已能跑 | 先核实 `config/env.ts` 现状再决定是否加 dotenv |
| LOW-4 | auditCleaner 启动即删 | plan Task 0.5 Step 7 启动时立即 `cleanAuditLogs()`；design §3.5.3 只要求每日 03:30 | 移除启动时立即执行，仅保留 cron |

---

## 5. phase2 实施进度与前置阻塞

phase2 **0% 实施**（git log 无 phase2 feature commit，`packages/backend/src` 无任何 phase2 文件）。开工前有 **3 个硬前置**必须解决：

1. **BLOCKER-1**（migration）— 否则任何 schema 变更无法部署
2. **BLOCKER-2**（CI）— 否则 phase2 大量新代码无回归保障
3. **HIGH-5**（前端迁移）— 否则 phase2 §19 前端页面无法实施

建议 phase2 plan 新增 `P0-PREREQ` 批次承接这 3 项。

---

## 6. 前端迁移前置评估

`RemoteHub/components/` 16 个组件的可复用性分级（**基于组件命名与项目演进推断，非代码级核实，迁移立项时需逐组件验证**）：

| 分级 | 组件 | 数量 | 说明 |
|------|------|------|------|
| ✅ 可迁移（适配 API/TanStack Query） | ConnectionCard, ConnectionModal, LoginPage, ProjectModal, ProjectIcons, Icons, LoadingStates, UIComponents, UserManagementModal, Sidebar | 10 | 核心业务组件，需把 localStorage 调用改为 API client |
| ❌ 弃用（localStorage/AI 时代产物） | AIAssistant（@google/genai 已移除）, DatabaseConfigModal（v2 统一 MySQL）, MigrationControlPanel, MigrationWizard（v2 不迁历史数据）, StorageModeToggle | 5 | 设计上已被 v2 取代 |
| 🗑 副本删除 | Sidebar.updated.tsx | 1 | `.updated` 坏习惯副本 |

**工作量估算**: 10 个组件迁移 + 适配 TanStack Query + 路由 + 状态管理，预估独立子项目（需单独 spec/plan）。

**建议路径**: 本次不实施迁移；phase2 plan §19 标 blocked；前端迁移作为 phase2 之前的独立子项目立项。

---

## 7. 根 `backend/` 处置建议

**决策**: 保留为"参考代码"，加 `backend/README.md` 标注。

**依据**:
- phase2 的审计/备份/监控/WebSocket/导出/安全功能在此有完整旧实现，业务逻辑可复用（虽然基于 TypeORM + mock，质量需重新评估）
- 不在 pnpm workspace，不参与构建，留着零运行时风险
- 删除会丢失参考，phase2 需完全从零设计

**标注内容**（待 B4 写入 `backend/README.md`）:
- 声明为 v2 refactor 前的旧 TypeORM 实现，**非活代码**
- 不参与构建、不在 workspace
- phase2 移植参考，移植时需重写为 Prisma + 真实实现（去 mock）
- 指向 refactor-design 与 phase2-design

---

## 8. 建议的行动批次

| 批次 | 内容 | 状态 |
|------|------|------|
| B1 文档对齐 | project.md 重写、proposal/tasks 加标注 | ✅ 本次完成 |
| B2 审计报告 | 本文档 | ✅ 本次完成 |
| B3 phase2 plan 修订 | 补集成测试 Task、审计中间件对齐、dotenv 核实、auditCleaner 修正、§19 标 blocked、新增 P0-PREREQ（migration+CI+前端迁移评估） | ⏳ 待报告 review 后 |
| B4 遗留清理 | seed.js 出库、根 backend/ README 标注、RemoteHub/ 无用项清理、删 TEMPORARY_OPERATIONS.md + proposal.updated.md、OpenSpec archive | ⏳ 逐项确认 |
| B5 BLOCKER 紧急修 | 生成 migration、建 CI | ⏳ 审计后单独修（不混入审计纯度） |

---

## 9. 未决事项（需用户决策）

1. **B3/B4 执行节奏**: 报告 review 通过后，B3（plan 修订）与 B4（清理）是否连续执行？
2. **B5 时机**: BLOCKER-1（migration）建议审计完后第一时间单独修（上线即坏级），是否立即安排？
3. **前端迁移立项**: 是否在 phase2 之前启动前端迁移子项目的 brainstorming？
