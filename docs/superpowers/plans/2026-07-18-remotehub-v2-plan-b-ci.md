# RemoteHub V2 收尾 Plan B：CI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 GitHub Actions CI，在 PR + push main 时自动跑 shared build/test + backend lint/typecheck/test 三道质量门，挡住回归。

**Architecture:** 单 job `test`，pnpm workspace，filter 到 `@remotehub/shared`（build+test）和 `@remotehub/backend`（lint+tsc+test）。frontend 本次 0 改动不参与（lint/test 体系缺失，留给前端迁移子项目）。

**Tech Stack:** GitHub Actions、pnpm、Node 20、vitest、ESLint 9、TypeScript 5。

## Global Constraints

- **以 spec §3 为准**：`2026-07-17-v2-followup-design.md` §3 已定 CI yaml（filter 到 backend + shared test）。本 plan 严格引用，不重新发明。
- **frontend 不参与 CI 门**：frontend 有 `lint`/`test` script 但**无 eslint 依赖、无 config、0 测试文件**（grill D2 查证）。`pnpm -r lint`/`pnpm -r test` 会崩。
- ⚠️ **frontend lint+test 体系悬空**：原写法"作为前端迁移子项目前置"挂在**未立项**的子项目上（spec §5 仅范围规划、无详细 spec/plan——见 v2-master「前端迁移悬空」）。**本 plan 不建 frontend 体系**（避免 scope creep），但显式标注这是未闭环项：phase2 §19 启动前必须由前端迁移子项目（独立 brainstorming→spec→plan）落实。在此之前 frontend 无 CI 覆盖 = 已知风险（frontend 本次 0 改动，无覆盖不引入新风险）。
- **依赖 Plan A**：backend test 在 Plan A 后从 145 → 200+（Plan C）；本 plan 的 CI 在 Plan A/C 完成后才有意义，但 CI 本身可先建（跑现有测试）。
- **pnpm 版本一致性**：CI 的 pnpm 版本必须与 lockfile 生成版本一致（避免 frozen-lockfile 行为异常），用 `packageManager` 字段或 action pin。

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `.github/workflows/ci.yml` | CI 流水线 | 新建 |
| `package.json`（仓库根） | packageManager pin | 确认/补 `packageManager` 字段 |

---

## Task 1: 建 CI workflow + 本地预验证

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: `package.json`（仓库根，补 packageManager 若缺）

- [ ] **Step 1: 确认 packageManager 字段**

Run: `node -e "console.log(require('./package.json').packageManager || 'MISSING')"`
Expected: 输出 pnpm 版本（如 `pnpm@9.x.x`）。若 `MISSING`：在仓库根 `package.json` 加 `"packageManager": "pnpm@<当前版本>"`（跑 `pnpm --version` 取版本）。

- [ ] **Step 2: 新建 ci.yml**

`.github/workflows/ci.yml`：
```yaml
name: ci
on:
  pull_request: {}
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @remotehub/shared build
      - run: pnpm --filter @remotehub/shared test
      - run: pnpm --filter @remotehub/backend lint
      - run: pnpm --filter @remotehub/backend exec tsc --noEmit
      - run: pnpm --filter @remotehub/backend test
```

> 说明：`pnpm/action-setup@v4` 读 `package.json` 的 `packageManager` 自动 pin 版本。`setup-node` 的 `cache: 'pnpm'` 缓存 pnpm store。shared build 必须在 backend lint/tsc/test 前（backend import `@remotehub/shared`）。SQLite 让 backend test 无需起 MySQL 服务。

- [ ] **Step 3: 本地预验证每步（确保 CI 不红）**

Run（依次，模拟 CI 步骤）:
```bash
pnpm install --frozen-lockfile
pnpm --filter @remotehub/shared build
pnpm --filter @remotehub/shared test
pnpm --filter @remotehub/backend lint
pnpm --filter @remotehub/backend exec tsc --noEmit
pnpm --filter @remotehub/backend test
```
Expected: 全部 PASS（shared test 绿、backend lint 无错、tsc 无错、backend 145+/200+ 测试绿）。

> 若 backend lint 报错：修 lint 错误（不降 lint 规则）。若 shared test 因 Plan A 的 validator 变化失败：确认 Plan A 已合并。

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "ci: 加 GitHub Actions（shared build/test + backend lint/tsc/test）

filter 到 backend + shared（frontend 本次不参与，lint/test 体系留给前端迁移子项目）。
pin pnpm 版本（packageManager）。spec §3/D2。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: push 触发 CI 验证（需用户确认推送）**

Run: `git push`
Expected: GitHub Actions `ci` workflow 触发，`test` job 全绿。

> 若 CI 红：看 Actions 日志定位步骤，本地复现修复后补 commit。常见坑：CI 环境 pnpm 版本不匹配（检查 packageManager）、shared build 产物缺失（确认 build 步骤在 test 前）。

---

## Self-Review

**1. Spec 覆盖**：spec §3 CI yaml → Task 1 ✓；D2（filter backend + shared test，frontend 不参与）→ Global Constraints + yaml ✓。
**2. Placeholder 扫描**：无；yaml 完整，每步有命令 + expected。
**3. 类型/配置一致**：`packageManager` pin 与 lockfile 一致（Step 1 验证）；filter 目标包名（`@remotehub/shared`/`@remotehub/backend`）与各 package.json `name` 一致。
**4. 实施顺序**：Plan B 独立，但 backend test 数量依赖 Plan A/C（先有 Plan A/C 的测试，CI 才跑得有意义）。建议 Plan B 在 Plan A 后、Plan C 前后均可。
**5. refactor-design 关系**：refactor-design 无 CI 章节，不冲突。
