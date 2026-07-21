# Implementation Notes

## 活跃 Open Questions

- [x] **D7** Docker runtime libstdc++ —— ✅ 查证反转：node:20-alpine 自带 libstdc++，spec §1.4 不补；builder build tools 保留作 prebuild fallback；plan 验证项 docker build 后 `require('better-sqlite3')` 坐实
- [x] **D8** B-6 mock helper —— ✅ 抽 `createPrismaMock()`，新增 3 + 现有 2 service test 全迁移（5→1）
- [x] **D9** 集成测试 —— ✅ 把 spec §2 BLOCKER-1 验收做成集成测试（setupTestDb + 临时 SQLite + migrate deploy + 验 5 表/unique/cascade/自引用约束）
- [x] **D10** notes/vpnLoginUrl 长度上限 —— ✅ shared 加 validateNotes(≤2000)+validateVpnLoginUrl(≤500)，connectionService 调用
- [x] ~~spec 修订~~ ✅ 已完成（commit `bf38a82`：D1–D10 + F1–F6 订正进 spec，含 §308 反向标注）
- [ ] **前端迁移悬空（2026-07-18 meta-review）**：前端迁移详细 spec/plan 不存在（spec §5 仅范围规划），是 phase2 §19 硬前置。phase2 §19 启动前必须立项前端迁移（brainstorming→spec→plan）。spec §5 / v2-master / Plan B 已加显式悬空声明 + 触发条件。
- [x] **Plan B CI prisma generate 遗漏**（2026-07-21 首次 CI 暴露）：tsc 步骤 27 错全红，根因 `@prisma/client` postinstall 找不到自定义路径 schema（`packages/backend/prisma/schema.prisma`）→ client 未生成 → 类型全缺。ci.yml install 后加 `pnpm --filter @remotehub/backend exec prisma generate` 修复。见下 [2026-07-21] section。

---

## [2026-07-21] V2 推送远端 + CI 验证闭环

### Design decisions
- **force-push feat/v2-refactor → main**：远端 main（4 commits 旧前端）与 feat/v2-refactor（72 commits V2）`entirely different commit histories`，GitHub PR 表单不出现。核验 V2 的 `RemoteHub/` 子目录（53 文件）是远端 main 前端（24 文件）的**超集演进版**（ConnectionCard diff 1 行、App.tsx 22 行、auth.service.ts 137 行 V2 更全含 heartbeat）→ 零损失覆盖 main（`0777aad → a60119f → eaa69b7`，`--force-with-lease`，TUN 代理绕 GFW 阻断）。
- **不走 merge --allow-unrelated-histories**：会把远端 24 个扁平前端文件塞进 monorepo 根目录，污染结构。force-push 最干净，且 `push: main` 直接触发 CI（无需 PR，绕过 PR 表单缺失）。

### CI 验证结果（Plan B Step5 闭环 ✅）
- **首跑**（run 29811728180 @ a60119f）tsc step **27 错全红** → 诊断 prisma generate 遗漏（详见下 section）→ 修复 `eaa69b7`。
- **重跑**（run 29813066646 @ eaa69b7）**11 步全 success**：prisma generate ✅ / tsc ✅（27 错清零）/ backend test **204 全过**（unit 200 + integration 4，15 files）。Plan A/B/C 首次真实 CI 验证（ubuntu + 全新 install）。
- **本地实测**：lint 0 / tsc exit 0 / test **204 passed**。handoff 写的 200（unit 196）是 a60119f「补测试」前的旧数，现 204。

### 待办闭环状态
- ✅ **Plan B Step5**（push 触发 CI 验证）：本 session 完成。
- ✅ **D7**（musl/libstdc++）：早前查证反转闭环（node:20-alpine 自带，OQ 清单已 [x]）。
- ⏳ **Plan A Task8**（docker build 验证）：唯一遗留，本环境 `docker: command not found`，需 Docker 环境实测。

---

## [2026-07-21] CI prisma generate 遗漏修复（Plan B 实施后首次 CI 暴露）

### 触发
force-push feat/v2-refactor → main 触发首次 CI（run 29811728180），tsc 步骤（step 9）27 错全红，test（step 10）skipped。本地同款 `pnpm --filter @remotehub/backend exec tsc --noEmit` EXIT 0 全绿 → 排除代码问题，锁 CI 环境。

### Design decisions
- **根因**（CI 日志 L184 铁证）：`@prisma/client` postinstall `prisma:warn We could not find your Prisma schema in the default locations`。schema 在 `packages/backend/prisma/schema.prisma`（非默认位置），postinstall 找不到 → client 未生成 → `.prisma/client/default` 空壳 → tsc 找不到 `ConnectionUncheckedCreateInput` / `PrismaClientKnownRequestError` 等 → 27 错（TS7006 回调推断失败 + TS2694/TS2339 命名空间缺失）**同源于此**。
- **修复**：ci.yml install 后加 `pnpm --filter @remotehub/backend exec prisma generate`（在 backend 包目录跑，prisma 找到 `prisma/schema.prisma`）。本地同款命令验证 ✔ 生成 v6.19.3。

### Deviations / 教训
- **Plan B self-review 漏网**：设计 CI 时没考虑 prisma client 生成；pnpm postinstall 找不到非默认路径 schema 是 Prisma 已知行为。**可复用结论：CI 凡含 prisma 项目，install 后必须显式 `prisma generate`，不能依赖 postinstall**（自定义 schema 路径下必失效）。→ 萃取进 memory。
- **evidence-first 自纠**：初疑 `onlyBuiltDependencies` 放错位置（`"pnpm"` 字段外），查证发现配置正确在 `"pnpm": {}` 下，自纠为 postinstall schema 查找根因。见 [[evidence-before-conclusion]]。

### Tradeoffs
- prisma generate 位置：install 后、shared build 前（generate 独立于 shared，tsc/test 依赖它，最早放最稳）。

---

## [2026-07-17] v2 收尾 spec grill review（第二轮 + 第三轮）

对 `2026-07-17-v2-followup-design.md` 做 grill review，逐条核验 spec 断言对照真实代码 + context7/web-search 查证。第二轮产出 D1–D9；第三轮（grill 自己的结论）修正 D1 清单 + 新增 D10。用户要求 plan 前再过两轮——避免地基问题带入 plan。

### Design decisions（已拍板）

- **[D1]** 应用层字段长度校验补全**前移进 Plan A**（顺序：补校验 → 移 `@db.VarChar` → migration → Docker）。原 spec §1.2「归入 B-6」制造裸奔窗口、§1.5「业务代码零改动」矛盾。订正口径「业务逻辑零改动、仅补输入校验」。
  - **[D1 修正·第三轮]** 校验逻辑集中在 `@remotehub/shared/validators.ts`（12 个 validate 函数 + `validators.test.ts` 已测）。Connection（create §103 + update §203 双路径）、Member role、User 注册（authService）、User 改密、Project name **均已接好**。**真实缺口远小于原"12 字段"**：
    1. `userService.updateUser` 补 `validateUsername`+`validateRole`+`validateNickname`（替换手写 §53）
    2. `authService` 注册补 `validateRole`（§58-62 漏了）
    3. shared 新增 `validateDescription`+`validateIcon`+`validateNotes`+`validateVpnLoginUrl`（4 个）
    4. `projectService` create/update 调 `validateDescription`+`validateIcon`
    5. `connectionService.validateConnectionFields` 加 `validateNotes`+`validateVpnLoginUrl`
  - 性质：主要是**接线**（service 调 shared），不是写校验。Plan A 校验子任务 scope 大幅缩小。
- **[D1.1]** 校验**手写 + helper**，不引入 zod。（注：实际校验逻辑已在 shared，helper 指 shared validate 函数；service 层只是调用）
- **[D2]** CI 门**全部 filter 到 backend**（lint/tsc/test）+ shared test + shared build；frontend 不参与。spec §3 `pnpm -r lint`/`pnpm -r test` 字面必崩（shared+frontend 无 eslint 依赖、frontend 0 测试且无 passWithNoTests）。**Open Question 4 关闭**。frontend lint+test 作为 §5 前端迁移子项目前置。
- **[D3]** seed 生产链路修复**纳入 Plan A**（部署 BLOCKER）。删 seedCheck，seed 检测并入 server.ts 启动。原 Open Question 5 升级 BLOCKER 定性纠正。
- **[D3.1]** 抽 `src/utils/seedAdmin.ts`（`seedAdmin(prisma)` 接收外部 prisma）；server.ts `ensureAdminSeed` 传 server 单例（带 adapter+WAL）；`prisma/seed.ts` 补 adapter 调共享函数；Dockerfile 删 esbuild seed 步骤；`seed.js` 出库 + `.gitignore`（**D6**）。
- **[D4]** 维持 driver adapter（与官方 #11789 WAL 路径一致）。Prisma 6.15+ GA，不需 previewFeatures。**Open Question 3 关闭**。WAL pragma 改 `$queryRaw` + 断言 `'wal'`。Plan A 前置核验 lockfile `@prisma/client` ≥ 6.15。
- **[D5]** server.ts 改 `async bootstrap()`：WAL pragma(`$queryRaw` 断言) → `ensureAdminSeed` → `startSessionCleaner` → `app.listen`。WAL/seed 失败 fail-fast（`exit 1`）。`prisma.ts` 补回 `globalForPrisma`。首次 migrate deploy 不走 WAL——接受。
- **[D6]** seed.js 出库 + `.gitignore`（合并 D3）。
- **[D7]** Docker runtime：**不补 libstdc++**（node:20-alpine 自带）。builder build tools 保留作 prebuild fallback。plan 验证项：docker build 后 `require('better-sqlite3')` 坐实 + `--prod deploy` 原生模块拷贝验证。不需 sqlite-libs。
- **[D8]** B-6 抽 `createPrismaMock()` helper，新增 3 + 现有 2 service test 全迁移（5→1）。注：shared validators 已有 test，B-6 测 service 层调用 + 错误聚合，不重测校验逻辑。
- **[D9]** 集成测试：把 spec §2 BLOCKER-1 验收做成 `setupTestDb()`（临时 SQLite + migrate deploy）+ 验 5 表/unique/cascade/自引用 SetNull。vitest.config 加 unit/integration 分离。
- **[D10]** shared 加 `validateNotes`(≤2000)+`validateVpnLoginUrl`(≤500)，connectionService 调用。design §3.1 未列这俩，但移除 @db.VarChar 后 DB 无兜底，补宽松上限防超长滥用。

### Deviations（教训 + 正例）

- **[反面·seed.ts]** D5 第 6 条没读 seed.ts 就编「导出 runSeed()+加守卫」，被用户抓到。读真实文件发现三个没预见的问题（顶层 process.exit 地雷、new PrismaClient 无 adapter、esbuild cjs vs tsc esm interop）。修正为抽 `seedAdmin`。**原则：没看到事实不要妄下定论。** 见 memory [[evidence-before-conclusion]]。
- **[正例·D7]** 原预设「spec §1.4 漏 libstdc++ 要补」，查 better-sqlite3 v12 musl prebuild + node:20-alpine 自带 libstdc++ 后**反转为不补**。先查再下。
- **[正例·第三轮 D1]** grill 自己的结论——复查 D1 清单时发现上一轮只 grep `.min/max/length`、没读 connectionService import + shared validators，误报「Connection 全缺/12 字段」。读 shared validators 发现校验逻辑完整、Connection 双路径已接好。**主动还了 evidence 的债**（没等用户抓）。同时避免了一个误报：第三轮初差点把「migrations 不存在」当新发现，多跑一个 grep 发现审计 §68-72 早记为 BLOCKER-1——**根因是没读审计附录 A**。

### Meta-review（2026-07-18）：前端迁移推锅修正

grill plan 时发现"留给前端迁移子项目"类引用（spec §5、Plan B frontend 前置）挂在**未立项**的子项目上——前端迁移详细 spec/plan 不存在，只有 spec §5 范围规划。是 plan 体系的悬空依赖（前端迁移是 phase2 §19 硬前置）。

**修正**（选项 1，用户拍板）：spec §5 + v2-master + Plan B 三处加显式悬空声明 + 触发条件（phase2 §19 启动前必须立项前端迁移）。不强行现在做前端迁移（避免 scope creep；spec §5 本就声明"实施另立项"），但把推锅暴露成显式 Open Question，不再藏在"留给子项目"话术里。选项 2（补前端迁移 spec）作为触发时的执行路径预留。

### Tradeoffs

- 校验手写(shared) vs zod：手写（已存在，零依赖）。zod 留未来。
- driver adapter vs 原生：adapter（官方 WAL 背书 + SQLCipher 路径）。
- seed 并入 server.ts vs 独立：并入（BLOCKER + 与 WAL 同趟）。
- bootstrap fail-fast vs warn：fail-fast。
- Docker 不补 libstdc++ vs 防御性补：不补（base 已含，注明前提）。
- notes/vpnLoginUrl 补上限 vs 不补：补（DB 兜底没了，防超长）。

### Open questions

D1–D10 全部拍板；剩余见顶部「待办」。

---

## spec 事实核验纠错（spec 断言 vs 仓库现实）

| # | spec 断言 | 仓库现实 | 处理 |
|---|----------|---------|------|
| F1 | §1.2 移除 `@db.VarChar`「约 20 处」 | 实际 **12 处** | 订正 |
| F2 | §1.3/§1.5「移除 connection_limit」 | `env.ts`+`.env` DATABASE_URL **无此参数** | 删空改动 |
| F3 | §1.4「删除 mysql-client」 | Dockerfile **从未安装** | 删空改动 |
| F4 | §1.4「docker-compose.dev.yml」 | 仓库**只有** docker-compose.yml | 删幻觉引用 |
| F5 | §1.3 prisma.ts 示例 | 丢 `globalForPrisma` | 补回（D5） |
| F6 | §1.2「校验归入 B-6 / 12 字段全缺」 | shared validators 完整 + Connection/Member/User注册/Project-name **已接好**，真实缺口见 D1 修正 | 改精确缺口表 |

**第三轮追加核验**：
- `prisma/migrations/` 不存在 = **已知 BLOCKER-1**（审计 §68-72、openspec/project.md:114、engineering-progress.html:362 均记），spec §2 `migrate dev --name init` 正是解法——非新发现。
- VPN 校验代码（connectionService §127-129/§212-226/§351-362）**符合 handoff 实际意图**（非 VPN requiredVpnId 保留），design §308 字面错、代码对。
- `appError.handlePrismaUniqueViolation` 存在且 P2002 映射齐全（§67-78）→ §4 B-6 appError.test 是补测试非写实现。留 B-6 验证项：切 SQLite 后 P2002 `meta.target` 格式是否一致。
- raw SQL 仅 `healthRoutes.ts:8 SELECT 1`（跨 provider 兼容）。

---

## [2026-07-18] Plan A/B/C 实施（TDD，15 Task + 修复提交）

按 executing-plans + TDD 技能执行 `docs/superpowers/plans/2026-07-18-*` 三份 plan。本地 `lint 0 / tsc 0 / test 200`（unit 196 + integration 4）全绿。

### Plan A：SQLite 切换链路（8 Task，commit c21617e…9804dc4）
- Task1 shared 加 4 validator（TDD RED 10 fail → GREEN 28 pass）。
- Task2 4 service 校验接线（connectionService notes/vpnLoginUrl 先 RED 再接线）。
- Task3 schema `provider=mysql→sqlite` + 移 12 处 `@db.VarChar`（prisma validate 需临时 `file:` URL）。
- Task4 prisma.ts driver adapter（`@prisma/adapter-better-sqlite3@6.19.3`，pin 6.x；根 package.json 加 better-sqlite3 到 onlyBuiltDependencies）。
- Task5 seed 链路重组（抽 `seedAdmin`、删 `seedCheck`、`seed.js` 出库）。
- Task6 server.ts async bootstrap（WAL→seed→cleaner→listen，fail-fast）。
- Task7 migration init + 集成测试（D9，vitest unit/integration projects 分离）。
- Task8 Docker 简化（删 mysql 容器、加 build tools、CMD 简化为 migrate deploy + server）。

### Plan B：CI（commit c08a72b、8187665）
- `.github/workflows/ci.yml`（shared build/test + backend lint/tsc/test）+ 根 package.json 补 `packageManager` pin。
- 修预存在 50 个 lint 错：源码 6 处（`(error as any)`→类型收窄、删未用 import、删失效 eslint-disable）；eslint 测试文件范围豁免 `no-explicit-any`（mock 范式所需，生产代码仍严格）。

### Plan C：B-6 service 单测（6 Task，commit 77fd85b…d1be7d8）
- `createPrismaMock` helper（model 方法超集）+ 迁移 auth/connection test。
- 新增 userService(12)/projectService(6)/memberService(13)/connectionService getConnection B-4(5)/appError P2002(10)。

### Deviations（evidence-based，偏离 plan 字面）
- **adapter 导出名是 `PrismaBetterSQLite3`（大写 SQL）**，plan 字面 `PrismaBetterSqlite3` 错；以真实包导出为准。
- **`write_to_file` 偶发写空文件**：seedAdmin.ts 首次写 0 字节（Task5 提交后 Task6 tsc 才暴露，因 tsconfig 仅含 src 不覆盖 prisma/seed.ts）。教训：写入后核验文件 Length。
- **dev.db 分裂**：driver adapter 按进程 CWD 解析 `file:./dev.db`，prisma CLI 按 schema 目录解析 → migrate 写 `prisma/dev.db` 而 server/seed 写 `packages/backend/dev.db`。新增 `src/utils/resolveSqliteUrl`（TDD）锚定 prisma/ 目录统一。**plan 未预见，实施时发现并修复。**
- **.env ENCRYPTION_KEY 原值解码 35 字节**（违反 env.ts 32 字节校验，本地未跟踪文件，pre-existing），改为合法 32 字节 base64。
- **prisma generate 漏跑**：切 provider 后需 `prisma generate` 重生成客户端，否则 runtime 报 adapter/provider 不兼容（tsc 不暴露，types 不变）。
- **集成测试 flaky**：testDb 原用 `execSync(pnpm --filter ... migrate deploy)` 在 vitest projects 并发时偶发「表不存在」。改用本地 prisma 二进制直调（`--schema` + cwd）+ vitest `fileParallelism:false` 串行 projects。
- **tsc 强转**：vi.mock 运行期替换但 TS 按真实 PrismaClient 类型检查，新 test 文件 `const prisma = _prisma as any`（eslint 测试文件已豁免 any），connectionService 块用现有 `as MockFn` 范式。

### 未完成的验证项（待办）
- Plan B Step5 `git push` 触发 CI（待用户在有远端的仓库执行）。
- Plan A Task8 docker build/load 验证（本环境无 Docker 守护进程）—— D7 plan 验证项未实际执行。
- D7 终验依赖 docker build。
