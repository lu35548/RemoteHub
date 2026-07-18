# Implementation Notes

## 活跃 Open Questions

- [x] **D7** Docker runtime libstdc++ —— ✅ 查证反转：node:20-alpine 自带 libstdc++，spec §1.4 不补；builder build tools 保留作 prebuild fallback；plan 验证项 docker build 后 `require('better-sqlite3')` 坐实
- [x] **D8** B-6 mock helper —— ✅ 抽 `createPrismaMock()`，新增 3 + 现有 2 service test 全迁移（5→1）
- [x] **D9** 集成测试 —— ✅ 把 spec §2 BLOCKER-1 验收做成集成测试（setupTestDb + 临时 SQLite + migrate deploy + 验 5 表/unique/cascade/自引用约束）
- [x] **D10** notes/vpnLoginUrl 长度上限 —— ✅ shared 加 validateNotes(≤2000)+validateVpnLoginUrl(≤500)，connectionService 调用
- [ ] **待办（spec 修订阶段）**：把 D1–D10 + F1–F5 + 第三轮修正订正进 `2026-07-17-v2-followup-design.md`（见下方「spec 修订清单」）
- [ ] **待办**：design §308 字面矛盾在 spec 加反向标注（以代码为准，SSH→VPN 依赖需 requiredVpnId 非 null）

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
