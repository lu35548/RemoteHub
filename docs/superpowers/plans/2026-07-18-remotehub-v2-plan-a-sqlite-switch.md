# RemoteHub V2 收尾 Plan A：SQLite 切换链路 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 RemoteHub 后端持久化从 MySQL 切到 SQLite+WAL，补全应用层字段校验，修复 seed 生产链路，生成首个 migration，简化 Docker 部署——产出一个可部署、可测试、业务逻辑零改动的收尾结果。

**Architecture:** Prisma schema `provider=mysql→sqlite` + driver adapter（`@prisma/adapter-better-sqlite3`，Prisma 6.15+ GA）+ WAL（`$queryRaw\`PRAGMA journal_mode=WAL\``）；校验逻辑集中在 `@remotehub/shared/validators.ts`，service 层接线调用；seed 检测并入 `server.ts` 的 `async bootstrap()` 启动序列（WAL→seed→cleaner→listen）；migration 首次生成 `init`；Docker 删 MySQL 容器、加 better-sqlite3 build tools。

**Tech Stack:** pnpm workspace（`@remotehub/backend` + `@remotehub/shared` + `@remotehub/frontend`）、Prisma 6、vitest 3、Express 5、TypeScript 5、Docker（node:20-alpine）。

## Global Constraints

- **DB 相关唯一权威**：`docs/superpowers/specs/2026-07-17-v2-followup-design.md`。`2026-04-23-remotehub-v2-refactor-design.md`（一期重构设计）的 DB 章节（§2.4 schema 设计原则、§6 部署/migrate、§9.2 备份）**已被收尾 spec 覆盖**——遇到冲突一律以收尾 spec 为准；refactor-design 的非 DB 章节（认证/权限/CRUD/中间件/错误码）仍有效，本 plan 不触碰。
- **业务逻辑零改动**：services/controllers/middleware 的业务分支不改；本 plan 只做 schema/配置/Docker + 校验接线（service 调 shared validator）+ seed 链路重组。
- **design §308 字面错误**：refactor-design §3.1 §308「非 VPN 时 requiredVpnId 必须为 null」是错的（与 SSH→VPN 依赖冲突）。代码现状（`connectionService` §127-129/§212-226/§351-362）是对的：非 VPN 时 `vpnType`/`vpnLoginUrl` 置 null、`requiredVpnId` 保留。**本 plan 不改 VPN 逻辑。**
- **TDD**：每个有逻辑的改动先写失败测试再实现。校验逻辑测试落 `packages/shared/src/validators.test.ts`；schema 约束测试落集成测试（Task 7）。
- **频繁提交**：每个 Task 结束 commit；commit message 中文，末尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`。
- **平台**：Windows 11，PowerShell 主 + Git Bash 可用；从仓库根用 `pnpm --filter @remotehub/<pkg>` 操作，避免 cd 残留。
- **校验正向覆盖**：service 层"是否调用 validator"在本 plan 靠 typecheck + 现有 145 测试不回归验证；service 的**正向端到端校验测试**在 Plan C（B-6）补——本 plan 不新建 `userService.test.ts`/`projectService.test.ts`（避免与 Plan C 边界冲突）。`connectionService.test.ts` 已存在，其接线点可加测试。

**与 Plan B/C 的边界**：本 plan = 切换链路（Task 1-8）。Plan B = CI（spec §3）。Plan C = B-6 单元测试 + `createPrismaMock` helper（spec §4 + D8）。前端迁移（spec §5）独立子项目，不在任何收尾 plan 内。

---

## File Structure

| 文件 | 责任 | 本 plan 动作 |
|------|------|------------|
| `packages/shared/src/constants.ts` | 校验长度常量 + 图标枚举 | 加 3 常量 + `isIcon` |
| `packages/shared/src/validators.ts` | 字段校验函数 | 加 4 validator |
| `packages/shared/src/validators.test.ts` | 校验函数测试 | 加 4 validator 测试 |
| `packages/backend/prisma/schema.prisma` | 数据模型 | provider + 移 12 处 VarChar |
| `packages/backend/src/utils/prisma.ts` | PrismaClient 单例 | driver adapter + globalForPrisma |
| `packages/backend/src/utils/seedAdmin.ts` | seed 核心逻辑（新建） | 新建，导出 `seedAdmin(prisma)` |
| `packages/backend/prisma/seed.ts` | `pnpm db:seed` 入口 | 补 adapter + 调 seedAdmin |
| `packages/backend/src/utils/seedCheck.ts` | （删除） | 删除 |
| `packages/backend/prisma/seed.js` | esbuild 编译产物 | 出库 + .gitignore |
| `packages/backend/src/server.ts` | Express app + 启动 | async bootstrap |
| `packages/backend/.env` | 本地配置 | DATABASE_URL → file: |
| `packages/backend/package.json` | 依赖 + scripts | 加 adapter 依赖 |
| `packages/backend/src/services/userService.ts` | 用户 CRUD | updateUser 接线 nickname/role |
| `packages/backend/src/services/authService.ts` | 认证 | register 接线 role |
| `packages/backend/src/services/projectService.ts` | 项目 CRUD | create/update 接线 description/icon |
| `packages/backend/src/services/connectionService.ts` | 连接 CRUD | validateConnectionFields 加 notes/vpnLoginUrl |
| `packages/backend/vitest.config.ts` | 测试配置 | unit/integration 分离 |
| `packages/backend/src/test/helpers/testDb.ts` | 集成测试 DB helper（新建） | 新建 `setupTestDb()` |
| `packages/backend/src/test/integration/schema.test.ts` | schema 约束测试（新建） | 新建 |
| `packages/backend/src/services/connectionService.test.ts` | 连接 service 测试 | 加 notes/vpnLoginUrl 校验测试 |
| `docker-compose.yml` | 容器编排 | 删 db 服务 |
| `docker/Dockerfile.backend` | 后端镜像 | build tools + 删 esbuild seed + CMD 简化 |
| `.gitignore` | 忽略规则 | 加 seed.js + sqlite db |

---

## Task 1: shared 加 4 个 validator + 常量

校验逻辑集中在 shared，先补齐缺失的 4 个 validator（description/icon/notes/vpnLoginUrl），这是后续 service 接线的前置依赖。

**Files:**
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/validators.ts`
- Test: `packages/shared/src/validators.test.ts`

**Interfaces:**
- Produces: `validateDescription(value: string): ValidationResult`、`validateIcon(value: string): ValidationResult`、`validateNotes(value: string | null | undefined): ValidationResult`、`validateVpnLoginUrl(value: string | null | undefined): ValidationResult`、`isIcon(value: string): value is ProjectIcon`、常量 `NOTES_MAX_LENGTH`、`VPN_LOGIN_URL_MAX_LENGTH`

- [ ] **Step 1: 加常量 + isIcon helper**

在 `packages/shared/src/constants.ts` 末尾（`ENCRYPTION_VERSION` 前）加：
```typescript
export const NOTES_MAX_LENGTH = 2000;
export const VPN_LOGIN_URL_MAX_LENGTH = 500;

export function isIcon(value: string): value is ProjectIcon {
  return (PROJECT_ICONS as readonly string[]).includes(value);
}
```

- [ ] **Step 2: 写 4 个 validator 的失败测试**

在 `packages/shared/src/validators.test.ts` 末尾加：
```typescript
import { validateDescription, validateIcon, validateNotes, validateVpnLoginUrl } from './validators.js';

describe('validateDescription', () => {
  it('接受空字符串外的合法长度', () => {
    expect(validateDescription('x').valid).toBe(true);
    expect(validateDescription('a'.repeat(2000)).valid).toBe(true);
  });
  it('拒绝超长', () => {
    expect(validateDescription('a'.repeat(2001)).valid).toBe(false);
  });
});

describe('validateIcon', () => {
  it('接受预设图标', () => {
    expect(validateIcon('folder').valid).toBe(true);
    expect(validateIcon('server').valid).toBe(true);
  });
  it('拒绝非预设图标', () => {
    expect(validateIcon('not-exist').valid).toBe(false);
  });
});

describe('validateNotes', () => {
  it('null/undefined 合法', () => {
    expect(validateNotes(null).valid).toBe(true);
    expect(validateNotes(undefined).valid).toBe(true);
  });
  it('拒绝超长', () => {
    expect(validateNotes('a'.repeat(2001)).valid).toBe(false);
  });
  it('接受上限内', () => {
    expect(validateNotes('a'.repeat(2000)).valid).toBe(true);
  });
});

describe('validateVpnLoginUrl', () => {
  it('null/undefined 合法', () => {
    expect(validateVpnLoginUrl(null).valid).toBe(true);
  });
  it('拒绝超长', () => {
    expect(validateVpnLoginUrl('a'.repeat(501)).valid).toBe(false);
  });
  it('接受上限内', () => {
    expect(validateVpnLoginUrl('https://vpn.example.com').valid).toBe(true);
  });
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `pnpm --filter @remotehub/shared test`
Expected: FAIL（4 个 describe 块因 import 不存在的导出报错）

- [ ] **Step 4: 实现 4 个 validator**

在 `packages/shared/src/validators.ts`（先在顶部 import 加 `PROJECT_DESCRIPTION_MAX_LENGTH, NOTES_MAX_LENGTH, VPN_LOGIN_URL_MAX_LENGTH, isIcon`，与现有 constants import 合并；现有已 import `PROJECT_NAME_MAX_LENGTH` 等，照格式补）末尾加：
```typescript
export function validateDescription(value: string): ValidationResult {
  if (value.length > PROJECT_DESCRIPTION_MAX_LENGTH) return fail(`项目描述不能超过 ${PROJECT_DESCRIPTION_MAX_LENGTH} 个字符`);
  return { valid: true };
}

export function validateIcon(value: string): ValidationResult {
  if (!isIcon(value)) return fail('无效的项目图标');
  return { valid: true };
}

export function validateNotes(value: string | null | undefined): ValidationResult {
  if (value != null && value.length > NOTES_MAX_LENGTH) return fail(`备注不能超过 ${NOTES_MAX_LENGTH} 个字符`);
  return { valid: true };
}

export function validateVpnLoginUrl(value: string | null | undefined): ValidationResult {
  if (value != null && value.length > VPN_LOGIN_URL_MAX_LENGTH) return fail(`VPN 登录地址不能超过 ${VPN_LOGIN_URL_MAX_LENGTH} 个字符`);
  return { valid: true };
}
```

- [ ] **Step 5: 跑测试确认通过**

Run: `pnpm --filter @remotehub/shared test`
Expected: PASS（所有 validators 测试绿）

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/constants.ts packages/shared/src/validators.ts packages/shared/src/validators.test.ts
git commit -m "feat(shared): 加 validateDescription/Icon/Notes/VpnLoginUrl 4 个 validator

切 SQLite 移除 @db.VarChar 后补全应用层长度/枚举校验（D1/D10）。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: 应用层校验接线（4 个 service）

把 Task 1 的 validator 接到各 service（替换手写校验 + 补缺失字段）。业务分支不改。

**Files:**
- Modify: `packages/backend/src/services/userService.ts:52-64`
- Modify: `packages/backend/src/services/authService.ts:64-66`
- Modify: `packages/backend/src/services/projectService.ts:67-69,107-111`
- Modify: `packages/backend/src/services/connectionService.ts:43-60,103,184-203,313-348`
- Test: `packages/backend/src/services/connectionService.test.ts`（已存在）

**Interfaces:**
- Consumes: Task 1 的 4 个 validator + 现有 validateNickname/validateRole
- Produces: 各 service 入参校验完整

### 2a. userService.updateUser 接线 nickname + role

- [ ] **Step 1: 改 userService.ts**

`packages/backend/src/services/userService.ts` 第 4 行 import 改为：
```typescript
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, USER_SEARCH_MAX_RESULTS, validateNickname, validateRole } from '@remotehub/shared';
```

第 52-64 行（手写 nickname + role 校验）替换为：
```typescript
  if (data.nickname !== undefined) {
    const v = validateNickname(data.nickname);
    if (!v.valid) throw createAppError('VAL_001', [{ field: 'nickname', message: v.message }]);
    updateData.nickname = data.nickname;
  }

  if (data.role !== undefined) {
    const v = validateRole(data.role);
    if (!v.valid) throw createAppError('VAL_001', [{ field: 'role', message: v.message }]);
    updateData.role = data.role;
  }
```

> 注：`updateUser` 的 data 是 `{ nickname?: string; role?: string; isActive?: boolean }`，**不含 username**（username 不可改），故不接 validateUsername。

### 2b. authService.register 接线 role

- [ ] **Step 2: 改 authService.ts**

`packages/backend/src/services/authService.ts` 第 6 行 import 加 `validateRole`：
```typescript
import { validateUsername, validateNickname, validatePassword as validatePwd, validateRole } from '@remotehub/shared';
```

第 64-66 行（手写 role 校验）替换为：
```typescript
  if (data.role !== undefined) {
    const r = validateRole(data.role);
    if (!r.valid) errors.push({ field: 'role', message: r.message });
  }
```

### 2c. projectService create + update 接线 description + icon

- [ ] **Step 3: 改 projectService.ts**

第 4 行 import 加 `validateDescription, validateIcon`：
```typescript
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, validateProjectName, validateDescription, validateIcon } from '@remotehub/shared';
```

`createProject`（第 68-69 行 validateProjectName 后）加：
```typescript
  const vd = validateDescription(data.description ?? '');
  if (!vd.valid) throw createAppError('VAL_001', [{ field: 'description', message: vd.message }]);
  if (data.icon !== undefined) {
    const vi = validateIcon(data.icon);
    if (!vi.valid) throw createAppError('VAL_001', [{ field: 'icon', message: vi.message }]);
  }
```

`updateProject`（第 108-111 行 validateProjectName 块后）加：
```typescript
  if (data.description !== undefined) {
    const vd = validateDescription(data.description ?? '');
    if (!vd.valid) throw createAppError('VAL_001', [{ field: 'description', message: vd.message }]);
  }
  if (data.icon !== undefined) {
    const vi = validateIcon(data.icon);
    if (!vi.valid) throw createAppError('VAL_001', [{ field: 'icon', message: vi.message }]);
  }
```

### 2d. connectionService validateConnectionFields 加 notes + vpnLoginUrl

- [ ] **Step 4: 改 connectionService.ts 签名 + 校验**

第 6-10 行 import 加 `validateNotes, validateVpnLoginUrl`（与现有 validateConnectionName 等合并到同一 import）：
```typescript
import {
  validateConnectionName, validateHost, validatePort,
  validateProtocol, validateVpnType, validateTags,
  validateNotes, validateVpnLoginUrl,
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
} from '@remotehub/shared';
```

`validateConnectionFields`（第 313-320 行）data 类型加 `notes` + `vpnLoginUrl`：
```typescript
function validateConnectionFields(data: {
  name: string;
  host: string;
  port?: number | null;
  protocol: string;
  vpnType?: string | null;
  vpnLoginUrl?: string | null;
  tags?: string | null;
  notes?: string | null;
}) {
```

在第 343 行（`validateTags` 块后、`if (errors.length > 0)` 前）加：
```typescript
  if (data.notes !== undefined) {
    const vNotes = validateNotes(data.notes);
    if (!vNotes.valid) errors.push({ field: 'notes', message: vNotes.message });
  }
  if (data.vpnLoginUrl !== undefined) {
    const vUrl = validateVpnLoginUrl(data.vpnLoginUrl);
    if (!vUrl.valid) errors.push({ field: 'vpnLoginUrl', message: vUrl.message });
  }
```

- [ ] **Step 5: 确认调用点传 notes/vpnLoginUrl**

`createConnection`（第 103 行 `validateConnectionFields(data)`）：`data` 来自 controller 入参 `CreateConnectionInput`（第 43-60 行含 `vpnLoginUrl?` / `notes?`），已包含，无需改。

`updateConnection`（第 203 行 `validateConnectionFields(merged)`）：检查 `merged`（第 184-202 行构造）是否含 notes/vpnLoginUrl。若 `merged` 类型不含，需在构造 merged 时补 `notes` / `vpnLoginUrl` 字段（从 updatePayload 或 current 取）。实现者需读 §184-203 确认 `merged` 字段完整性，缺则补：
```typescript
    notes: updatePayload.notes !== undefined ? updatePayload.notes : current.notes,
    vpnLoginUrl: updatePayload.vpnLoginUrl !== undefined ? updatePayload.vpnLoginUrl : current.vpnLoginUrl,
```

- [ ] **Step 6: 加 connectionService 校验测试**

在 `packages/backend/src/services/connectionService.test.ts` 加（照现有 mock 范式）：
```typescript
describe('validateConnectionFields - notes/vpnLoginUrl', () => {
  it('超长 notes 返回 VAL_001', async () => {
    await expect(createConnection('user-1', 'proj-1', {
      name: 'c1', host: 'h', protocol: 'SSH',
      notes: 'a'.repeat(2001),
    } as any)).rejects.toMatchObject({ code: 'VAL_001' });
  });
  it('超长 vpnLoginUrl 返回 VAL_001', async () => {
    await expect(createConnection('user-1', 'proj-1', {
      name: 'c1', host: 'h', protocol: 'SSH',
      vpnLoginUrl: 'a'.repeat(501),
    } as any)).rejects.toMatchObject({ code: 'VAL_001' });
  });
});
```

- [ ] **Step 7: 跑测试确认通过 + 不回归**

Run: `pnpm --filter @remotehub/backend test`
Expected: PASS（145 + 新增测试全绿）

Run: `pnpm --filter @remotehub/backend exec tsc --noEmit`
Expected: 无错误

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/services/userService.ts packages/backend/src/services/authService.ts packages/backend/src/services/projectService.ts packages/backend/src/services/connectionService.ts packages/backend/src/services/connectionService.test.ts
git commit -m "feat(backend): 校验接线 userService/authService/projectService/connectionService

service 层调用 shared validators 替换手写校验 + 补 description/icon/notes/vpnLoginUrl（D1）。
业务逻辑零改动，仅校验接线。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: schema 切换 provider + 移除 12 处 @db.VarChar

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`

- [ ] **Step 1: 改 provider**

第 2 行 `provider = "mysql"` → `provider = "sqlite"`

- [ ] **Step 2: 移除 12 处 @db.VarChar**

逐处删除 `@db.VarChar(N)`（保留其余修饰符）：
- `User.username`（§12）：`@unique @db.VarChar(50)` → `@unique`
- `User.role`（§15）：`@default("user") @db.VarChar(20)` → `@default("user")`
- `Session.userAgent`（§32）：`String?  @db.VarChar(500) @map(...)` → `String?  @map(...)`
- `Session.ip`（§33）：`String?  @db.VarChar(45)` → `String?`
- `Project.icon`（§49）：`@default("folder") @db.VarChar(50)` → `@default("folder")`
- `ProjectMember.role`（§65）：`@default("viewer") @db.VarChar(20)` → `@default("viewer")`
- `Connection.host`（§80）：`String    @db.VarChar(255)` → `String`
- `Connection.username`（§82）：`String?   @db.VarChar(100)` → `String?`
- `Connection.encryptedPass`（§83）：`String?   @db.VarChar(500) @map(...)` → `String?   @map(...)`
- `Connection.protocol`（§84）：`String    @db.VarChar(30)` → `String`
- `Connection.vpnType`（§85）：`String?   @db.VarChar(30) @map(...)` → `String?   @map(...)`
- `Connection.vpnLoginUrl`（§86）：`String?   @db.VarChar(500) @map(...)` → `String?   @map(...)`

- [ ] **Step 3: 验证 schema 格式**

Run: `pnpm --filter @remotehub/backend exec prisma format`
Expected: 无错误，schema 格式化成功

Run: `pnpm --filter @remotehub/backend exec prisma validate`
Expected: `The schema at packages/backend/prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: 确认测试不回归（mock 不依赖真实 DB）**

Run: `pnpm --filter @remotehub/backend test`
Expected: PASS（145 测试绿——测试 mock prisma，provider 切换不影响 mock）

- [ ] **Step 5: Commit**

```bash
git add packages/backend/prisma/schema.prisma
git commit -m "feat(backend): schema 切 SQLite provider + 移除 12 处 @db.VarChar

provider mysql→sqlite；移除 VarChar（SQLite 全 TEXT，长度校验由应用层 Task 2 接线）。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: prisma.ts driver adapter + globalForPrisma

**Files:**
- Modify: `packages/backend/src/utils/prisma.ts`
- Modify: `packages/backend/package.json`

**Interfaces:**
- Produces: `prisma: PrismaClient`（带 better-sqlite3 driver adapter，dev 单例缓存）

- [ ] **Step 1: 加 driver adapter 依赖**

Run: `pnpm --filter @remotehub/backend add @prisma/adapter-better-sqlite3`
Expected: 安装成功，package.json dependencies 加 `@prisma/adapter-better-sqlite3`

- [ ] **Step 2: 核验 Prisma 版本 ≥ 6.15（D4 前置）**

Run: `pnpm --filter @remotehub/backend exec -- node -e "console.log(require('@prisma/client/package.json').version)"`
Expected: 版本 ≥ 6.15.0（driver adapter GA，不需 previewFeatures）。若 < 6.15：`pnpm --filter @remotehub/backend up @prisma/client -L`（latest 6.x）。

- [ ] **Step 3: 重写 prisma.ts**

`packages/backend/src/utils/prisma.ts` 完整替换为：
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

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 4: typecheck**

Run: `pnpm --filter @remotehub/backend exec tsc --noEmit`
Expected: 无错误（env.DATABASE_URL 存在；adapter 类型正确）

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/utils/prisma.ts packages/backend/package.json pnpm-lock.yaml
git commit -m "feat(backend): prisma.ts 切 driver adapter + 补 globalForPrisma 单例

@prisma/adapter-better-sqlite3（Prisma 6.15+ GA，不需 previewFeatures）；
保留 dev globalForPrisma 防热重载泄漏文件锁（D4/F5）。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: seed 链路重组（抽 seedAdmin + 删 seedCheck + seed.js 出库）

**Files:**
- Create: `packages/backend/src/utils/seedAdmin.ts`
- Modify: `packages/backend/prisma/seed.ts`
- Delete: `packages/backend/src/utils/seedCheck.ts`
- Delete: `packages/backend/prisma/seed.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `seedAdmin(prisma: PrismaClient): Promise<{ username: string; id: string }>`（接收外部 prisma，建/更新 admin）

- [ ] **Step 1: 新建 seedAdmin.ts**

`packages/backend/src/utils/seedAdmin.ts`：
```typescript
import type { PrismaClient } from '@prisma/client';
import { hashPassword } from './password.js';
import { env } from '../config/env.js';

/**
 * 建/更新 admin 用户（idempotent）。接收外部 prisma（确保在 driver adapter + WAL 之下执行）。
 * 供 server.ts 启动 ensureAdminSeed 与 prisma/seed.ts 复用。§1.9
 */
export async function seedAdmin(prisma: PrismaClient) {
  const username = env.ADMIN_USERNAME;
  const password = env.ADMIN_PASSWORD;

  const admin = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      nickname: '系统管理员',
      passwordHash: await hashPassword(password),
      role: 'admin',
      isActive: true,
    },
  });

  return { username: admin.username, id: admin.id };
}
```

- [ ] **Step 2: 改 prisma/seed.ts（补 adapter + 调 seedAdmin）**

`packages/backend/prisma/seed.ts` 完整替换为：
```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { seedAdmin } from '../src/utils/seedAdmin.js';

async function main() {
  const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    const admin = await seedAdmin(prisma);
    console.log(`Seed complete: admin user "${admin.username}" (${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
```

> 注：seed.ts 保留顶层 main 调用（独立进程跑，process.exit 不影响 server）。server.ts **不 import seed.ts**（避 process.exit 地雷），只 import seedAdmin。

- [ ] **Step 3: 删除 seedCheck.ts**

Run: `rm packages/backend/src/utils/seedCheck.ts`
（Windows Git Bash: `rm` 可用；PowerShell: `Remove-Item`）

- [ ] **Step 4: seed.js 出库 + .gitignore**

Run: `git rm --cached packages/backend/prisma/seed.js`（若已入库）
Run: `rm packages/backend/prisma/seed.js`（删本地编译产物）

在仓库根 `.gitignore` 加：
```
# Prisma seed 编译产物（由 Dockerfile 按需生成，Task 8 删 esbuild 步骤后不再生成）
packages/backend/prisma/seed.js
# SQLite 数据库文件
*.db
*.db-journal
*.db-wal
*.db-shm
```

- [ ] **Step 5: typecheck（seedAdmin 被 server import 前先确认类型）**

Run: `pnpm --filter @remotehub/backend exec tsc --noEmit`
Expected: 无错误（seedCheck 删除后无悬挂 import——server.ts 当前未 import seedCheck，Dockerfile CMD 引用 Task 8 改）

- [ ] **Step 6: 确认测试不回归**

Run: `pnpm --filter @remotehub/backend test`
Expected: PASS（145 绿）

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/utils/seedAdmin.ts packages/backend/prisma/seed.ts .gitignore
git rm packages/backend/src/utils/seedCheck.ts packages/backend/prisma/seed.js
git commit -m "feat(backend): seed 链路重组（抽 seedAdmin + 删 seedCheck + seed.js 出库）

修复部署 BLOCKER：seedCheck no-op + prisma db seed 走 tsx 生产无（D3/D6）。
抽 seedAdmin(prisma) 共享；seed.ts 补 adapter；删 seedCheck；seed.js 出库。
server.ts 接线在 Task 6，Dockerfile CMD 在 Task 8。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: server.ts async bootstrap + .env file

**Files:**
- Modify: `packages/backend/src/server.ts`
- Modify: `packages/backend/.env`

- [ ] **Step 1: .env 切 SQLite**

`packages/backend/.env` 第 1 行：
```
DATABASE_URL=file:./dev.db
```
（原 `mysql://root:123456@localhost:3306/remotehub_dev`）

- [ ] **Step 2: server.ts 改 async bootstrap**

`packages/backend/src/server.ts` 末尾（第 128-136 行「Start server」段）替换为：
```typescript
// ─── Start server（async bootstrap：WAL → seed → cleaner → listen）§1.8 ───
import { prisma } from './utils/prisma.js';
import { seedAdmin } from './utils/seedAdmin.js';

async function ensureAdminSeed() {
  const adminCount = await prisma.user.count({ where: { role: 'admin' } });
  if (adminCount > 0) {
    logger.info('Admin user exists, skipping seed');
    return;
  }
  logger.info('No admin user found, running seed...');
  const admin = await seedAdmin(prisma);
  logger.info(`Seeded admin user "${admin.username}" (${admin.id})`);
}

async function bootstrap() {
  const PORT = env.PORT;

  // 1. WAL（任何 DB 操作前；$queryRaw 带断言，切不成必须知道）§1.3/D4
  const [wal] = await prisma.$queryRaw<Array<{ journal_mode: string }>`PRAGMA journal_mode = WAL`;
  if (wal?.journal_mode !== 'wal') {
    throw new Error(`SQLite WAL 切换失败: ${JSON.stringify(wal)}`);
  }
  logger.info('SQLite WAL 已启用');

  // 2. seed 检测（缺 admin 则建；用已开 WAL 的 prisma 单例）§1.9/D3
  await ensureAdminSeed();

  // 3. session cleaner（cron，启动不立即写，放 WAL 后一致）
  startSessionCleaner();

  // 4. listen（DB 就绪后才接请求）
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} (${env.NODE_ENV})`);
  });
}

bootstrap().catch((err) => {
  logger.error('启动失败', { error: err.message, stack: err.stack });
  process.exit(1);
});

export { app };
```

> 注：原 `const PORT = env.PORT;` + `startSessionCleaner();` + `app.listen(...)` 三行（第 129-133 行）整体被 bootstrap 替换。`import { prisma }` / `import { seedAdmin }` 放在文件末尾的 bootstrap 段（与现有 routes import 风格一致——server.ts 的 import 分散在各段）。若 lint 报 import 位置，移到文件顶部 import 区。

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @remotehub/backend exec tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 启动验证（WAL + seed）**

Run: `pnpm --filter @remotehub/backend dev`
Expected（日志依次出现）：
- `SQLite WAL 已启用`
- `No admin user found, running seed...` → `Seeded admin user "admin" (...)`
- `Server running on port 3001 (development)`
- DB 文件 `packages/backend/dev.db` + `dev.db-wal` 生成

Ctrl+C 退出。

- [ ] **Step 5: 确认测试不回归（测试不 import server.ts，bootstrap 不触发）**

Run: `pnpm --filter @remotehub/backend test`
Expected: PASS（145 绿）

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/server.ts packages/backend/.env
git commit -m "feat(backend): server.ts async bootstrap（WAL + seed + cleaner + listen）

启动序列：WAL pragma(\$queryRaw 断言) → ensureAdminSeed → startSessionCleaner → listen。
WAL/seed 失败 fail-fast exit 1。.env 切 file:./dev.db（D5）。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: migration init + 集成测试（D9）

**Files:**
- Create: `packages/backend/prisma/migrations/`（由 prisma 生成）
- Modify: `packages/backend/vitest.config.ts`
- Create: `packages/backend/src/test/helpers/testDb.ts`
- Create: `packages/backend/src/test/integration/schema.test.ts`

**Interfaces:**
- Produces: `setupTestDb(): Promise<PrismaClient>`（临时 SQLite file + migrate deploy + 返回 prisma）

- [ ] **Step 1: 生成首个 migration**

Run（从仓库根）: `pnpm --filter @remotehub/backend exec prisma migrate dev --name init`
Expected: 生成 `packages/backend/prisma/migrations/<timestamp>_init/migration.sql`（SQLite DDL：5 张表 users/sessions/projects/project_members/connections + 索引）；本地 dev.db 建表。

- [ ] **Step 2: 确认 migration 文件 + 入库**

Run: `ls packages/backend/prisma/migrations/`
Expected: `<timestamp>_init/` 目录存在，内含 `migration.sql`

- [ ] **Step 3: vitest.config 加 unit/integration 分离**

`packages/backend/vitest.config.ts` 完整替换为：
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    projects: [
      {
        // 单元测试：mock prisma，不依赖真实 DB
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/test/integration/**'],
        },
      },
      {
        // 集成测试：真实临时 SQLite + migrate deploy
        test: {
          name: 'integration',
          include: ['src/test/integration/**/*.test.ts'],
        },
      },
    ],
  },
});
```

> 注：vitest projects 模式。`pnpm test` 跑全部；`pnpm test --project unit` / `--project integration` 分别跑。

- [ ] **Step 4: 新建 testDb helper**

`packages/backend/src/test/helpers/testDb.ts`：
```typescript
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let counter = 0;

/**
 * 建临时 SQLite file + migrate deploy，返回带 adapter 的 prisma 实例。
 * 每次调用独立 db 文件，用完由调用方 cleanUp。§2 验收自动化/D9
 */
export async function setupTestDb(): Promise<{ prisma: PrismaClient; cleanUp: () => Promise<void> }> {
  counter += 1;
  const dbPath = path.join(os.tmpdir(), `remotehub-test-${process.pid}-${counter}-${Date.now()}.db`);
  const url = `file:${dbPath}`;

  // migrate deploy 到临时库
  execSync('pnpm --filter @remotehub/backend exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  const adapter = new PrismaBetterSqlite3({ url });
  const prisma = new PrismaClient({ adapter });

  // 开 WAL（与生产一致）
  await prisma.$queryRaw`PRAGMA journal_mode = WAL`;

  return {
    prisma,
    cleanUp: async () => {
      await prisma.$disconnect();
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        const f = dbPath + suffix;
        if (fs.existsSync(f)) fs.rmSync(f);
      }
    },
  };
}
```

- [ ] **Step 5: 写集成测试（验 schema 约束）**

`packages/backend/src/test/integration/schema.test.ts`：
```typescript
import { describe, it, expect, afterEach } from 'vitest';
import { setupTestDb } from '../helpers/testDb.js';

const instances: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (instances.length) await instances.pop()!();
});

describe('schema 约束（真实 SQLite）', () => {
  it('migrate deploy 建出 5 张表', async () => {
    const { prisma, cleanUp } = await setupTestDb();
    instances.push(cleanUp);
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'
    `;
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual(['connections', 'project_members', 'projects', 'sessions', 'users']);
  });

  it('@@unique([projectId, name]) 抛 P2002', async () => {
    const { prisma, cleanUp } = await setupTestDb();
    instances.push(cleanUp);
    await prisma.project.create({ data: { id: 'p1', name: 'dup', createdBy: 'u1', updatedBy: 'u1' } });
    await expect(
      prisma.project.create({ data: { id: 'p2', name: 'dup', createdBy: 'u1', updatedBy: 'u1' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('user→session onDelete Cascade', async () => {
    const { prisma, cleanUp } = await setupTestDb();
    instances.push(cleanUp);
    await prisma.user.create({ data: { id: 'u1', username: 'a', nickname: 'A', passwordHash: 'h', role: 'user' } });
    await prisma.session.create({ data: { id: 's1', userId: 'u1', tokenHash: 't', expiresAt: new Date() } });
    await prisma.user.delete({ where: { id: 'u1' } });
    expect(await prisma.session.count()).toBe(0);
  });

  it('connection 自引用 requiredVpnId onDelete SetNull', async () => {
    const { prisma, cleanUp } = await setupTestDb();
    instances.push(cleanUp);
    await prisma.project.create({ data: { id: 'p1', name: 'proj', createdBy: 'u1', updatedBy: 'u1' } });
    await prisma.connection.create({ data: { id: 'c1', projectId: 'p1', name: 'vpn', host: 'h', protocol: 'VPN', createdBy: 'u1', updatedBy: 'u1' } });
    await prisma.connection.create({ data: { id: 'c2', projectId: 'p1', name: 'ssh', host: 'h', protocol: 'SSH', requiredVpnId: 'c1', createdBy: 'u1', updatedBy: 'u1' } });
    await prisma.connection.delete({ where: { id: 'c1' } });
    const c2 = await prisma.connection.findUnique({ where: { id: 'c2' } });
    expect(c2?.requiredVpnId).toBeNull();
  });
});
```

- [ ] **Step 6: 跑集成测试**

Run: `pnpm --filter @remotehub/backend test -- --project integration`
Expected: PASS（4 个 schema 约束测试绿）

- [ ] **Step 7: 跑全部测试确认不回归**

Run: `pnpm --filter @remotehub/backend test`
Expected: PASS（unit 145+ + integration 4 全绿）

- [ ] **Step 8: Commit**

```bash
git add packages/backend/prisma/migrations packages/backend/vitest.config.ts packages/backend/src/test/helpers/testDb.ts packages/backend/src/test/integration/schema.test.ts
git commit -m "feat(backend): migration init + schema 集成测试（D9）

生成首个 SQLite migration（解决 BLOCKER-1：migrations 不存在）；
vitest unit/integration 分离；setupTestDb 临时库；验 5 表/unique/cascade/自引用 SetNull。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 8: Docker 简化（删 db + build tools + 删 esbuild seed + CMD）

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker/Dockerfile.backend`

- [ ] **Step 1: docker-compose.yml 删 db 服务 + volume**

删除 `db:` 服务段（mysql:8.0，含 healthcheck）+ `db-data:` volume。backend 的 `depends_on: db: condition: service_healthy` 改为挂 SQLite volume。完整改后 `docker-compose.yml`：
```yaml
services:
  caddy:
    image: caddy:2-alpine
    ports: ["443:443", "80:80"]
    volumes:
      - ./docker/caddy/Caddyfile:/etc/caddy/Caddyfile
      - caddy-data:/data
      - caddy-config:/config
      - frontend-build:/srv/frontend
    depends_on:
      backend:
        condition: service_healthy
      frontend-init:
        condition: service_completed_successfully
    restart: unless-stopped

  backend:
    build:
      context: .
      dockerfile: docker/Dockerfile.backend
    restart: unless-stopped
    env_file: .env
    environment:
      - DATABASE_URL=file:/data/prod.db
    volumes:
      - sqlite-data:/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/api/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  frontend-init:
    build:
      context: .
      dockerfile: docker/Dockerfile.frontend
    volumes:
      - frontend-build:/output

volumes:
  caddy-data:
  caddy-config:
  frontend-build:
  sqlite-data:
```

- [ ] **Step 2: Dockerfile.backend 加 build tools + 删 esbuild seed + CMD 简化**

`docker/Dockerfile.backend` 完整改后：
```dockerfile
FROM node:20-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @remotehub/shared build
RUN pnpm --filter @remotehub/backend build
RUN pnpm --filter @remotehub/backend --prod deploy /prod/backend
RUN cp -r packages/backend/dist /prod/backend/dist
RUN cp -r packages/backend/prisma /prod/backend/prisma

FROM base
WORKDIR /app
COPY --from=builder /prod/backend .
RUN npx prisma generate
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
```

改动要点：
- builder 加 `RUN apk add --no-cache python3 make g++`（better-sqlite3 编译；musl prebuild 可能 lag）
- 删 `RUN npx esbuild ... seed.ts ... seed.js`（Task 5 后生产由 server.ts seed）
- CMD 删 `node dist/utils/seedCheck.js`（Task 5 已删 seedCheck）
- runtime **不补 libstdc++**（node:20-alpine 自带，D7）

- [ ] **Step 3: docker build 验证**

Run: `docker build -f docker/Dockerfile.backend -t remotehub-backend-test .`
Expected: 构建成功（better-sqlite3 编译或 prebuild 下载成功）

- [ ] **Step 4: 验证 better-sqlite3 .node 能加载**

Run: `docker run --rm remotehub-backend-test node -e "require('better-sqlite3'); console.log('ok')"`
Expected: 输出 `ok`（libstdc++ 在 base 镜像，.node 加载成功）

> 若报 `Error loading shared library libstdc++.so.6`：说明 base 镜像异常，`FROM base` 段加 `RUN apk add --no-cache libstdc++`（D7 反转的兜底）。

- [ ] **Step 5: docker compose 起栈验证（可选，需 frontend-init）**

Run: `docker compose up -d backend`
Run: `docker compose logs backend | tail -20`
Expected: 日志出现 `SQLite WAL 已启用` + `Seeded admin user` + `Server running on port 3001`

Run: `docker compose down`

- [ ] **Step 6: Commit**

```bash
git add docker-compose.yml docker/Dockerfile.backend
git commit -m "feat(docker): 删 MySQL 容器 + better-sqlite3 build tools + CMD 简化

compose 删 db 服务 + sqlite-data volume；Dockerfile 加 python3/make/g++（builder）、
删 esbuild seed（Task 5）、CMD 简化为 migrate deploy + server。
runtime 不补 libstdc++（node:20-alpine 自带，D7）。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec 覆盖**（对照 `2026-07-17-v2-followup-design.md`）：
- §1.2 schema 改动（移 12 VarChar）→ Task 3 ✓
- §1.2 校验接线（D1 缺口）→ Task 1（validator）+ Task 2（接线）✓
- §1.2 §308 反向标注 → Global Constraints 注明，不改 VPN 代码 ✓
- §1.3 driver adapter + globalForPrisma + WAL $queryRaw → Task 4 + Task 6 ✓
- §1.4 Docker（删 db/mysql-client/dev-compose + build tools + 不补 libstdc++ + 删 esbuild seed + CMD）→ Task 8 ✓
- §1.5 矩阵口径（业务逻辑零改动）→ 全 plan 约束 ✓
- §1.8 启动序列 → Task 6 ✓
- §1.9 seed 链路 → Task 5（重组）+ Task 6（server 接线）+ Task 8（Dockerfile CMD）✓
- §2 migration + D9 集成测试 → Task 7 ✓
- D10 notes/vpnLoginUrl 上限 → Task 1（validator）+ Task 2（connectionService 接线）✓

**2. Placeholder 扫描**：Task 2 Step 5「读 §184-203 确认 merged 字段」——这是给实现者的精确指引（不是"看着办"），因 connectionService update merged 构造需对照源码。其余步骤均含完整代码/命令/期望输出。

**3. 类型一致性**：`seedAdmin(prisma: PrismaClient)` 在 Task 5 定义、Task 6 调用一致；`setupTestDb()` 返回类型在 Task 7 定义+调用一致；4 个 validator 签名在 Task 1 定义、Task 2 调用一致。

**4. 实施顺序**：Task 1（validator）→ Task 2（接线，依赖 validator）→ Task 3（schema，校验已在位防裸奔）→ Task 4（prisma.ts，依赖 sqlite provider）→ Task 5（seed，依赖 adapter）→ Task 6（server，依赖 prisma.ts + seedAdmin）→ Task 7（migration，依赖 schema + 启动）→ Task 8（Docker，依赖全部）。每 Task 以测试绿/启动/docker build 为 gate，中间态均可运行或明确隔离。

**5. 与 refactor-design 一致性**：DB 章节以收尾 spec 为准（Global Constraints 注明）；业务逻辑（认证/权限/CRUD）零改动，与 refactor-design 非 DB 章节不冲突。
