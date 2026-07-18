# RemoteHub V2 收尾 Plan C：B-6 Service 单元测试 + Mock Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给核心 service（user/project/member/connection）补单元测试，覆盖关键事务分支（last-admin/last-owner/P2002/P2025/删除保护/B-3/B-4），并抽 `createPrismaMock()` helper 消除 5 份重复 mock。

**Architecture:** vitest + `vi.mock('../utils/prisma.js')` mock prisma；`createPrismaMock()` helper 提供 `$transaction` 双形式（回调/数组）+ 各 model 方法；测试是 **characterization test**（固化一期已实现的正确行为，含 B-3/B-4/B-5 修复），不是 TDD 驱动新实现——service 代码 Plan A 已定稿不改。

**Tech Stack:** vitest 3、`@remotehub/shared` validators（已测，本 plan 不重测校验逻辑）、Prisma 6（mock，不碰真实 DB）。

## Global Constraints

- **以 spec §4 为准**：`2026-07-17-v2-followup-design.md` §4 已定测试文件清单 + mock 约定。本 plan 严格引用。
- **依赖 Plan A**：校验接线（Plan A Task 2）后，service 行为含新校验；本 plan 测试反映接线后的行为。Plan C 在 Plan A 后执行。
- **不重测 shared validators**：`packages/shared/src/validators.test.ts`（Plan A Task 1）已覆盖校验逻辑。本 plan 测 **service 层调用 + 错误聚合**（VAL_001 details）。
- **业务逻辑零改动**：若测试发现 service 行为与预期不符，是**测试预期错了**（应以现有正确实现为准），不改 service——除非确认是未修 bug，单独提 issue。
- **mock 范式统一**：所有 service test 用 `createPrismaMock()` helper（Task 1），`$transaction` 支持回调形式（交互式事务）+ 数组形式。
- **错误码以 `appError.ts` 为准**：VAL_001(422)/USER_001(409)/USER_002(404)/PROJ_001(409)/PROJ_002(404)/MEMBER_001(409)/MEMBER_002(403)/MEMBER_003(409)/AUTH_003(403)/CONN_002(404)/CONN_005(409)。

---

## File Structure

| 文件 | 责任 | 动作 |
|------|------|------|
| `packages/backend/src/test/helpers/prismaMock.ts` | prisma mock 工厂（新建） | 新建 |
| `packages/backend/src/services/authService.test.ts` | auth 测试 | 迁移到 helper |
| `packages/backend/src/services/connectionService.test.ts` | connection 测试 | 迁移到 helper + 加 getConnection（B-4） |
| `packages/backend/src/services/userService.test.ts` | user 测试（新建） | 新建 |
| `packages/backend/src/services/projectService.test.ts` | project 测试（新建） | 新建 |
| `packages/backend/src/services/memberService.test.ts` | member 测试（新建） | 新建 |
| `packages/backend/src/utils/appError.test.ts` | appError 测试（新建） | 新建 |

---

## Task 1: createPrismaMock helper + 迁移现有 test

消除重复：现有 `authService.test.ts` + `connectionService.test.ts` 各自手写了一份 prismaMock（含 `$transaction` 双形式）。抽 helper，B-6 新增 3 个 service test 复用它。

**Files:**
- Create: `packages/backend/src/test/helpers/prismaMock.ts`
- Modify: `packages/backend/src/services/authService.test.ts`
- Modify: `packages/backend/src/services/connectionService.test.ts`

**Interfaces:**
- Produces: `createPrismaMock(): PrismaMock`（含 user/session/project/projectMember/connection 的常用方法 vi.fn + `$transaction` 回调/数组双形式）

- [ ] **Step 1: 新建 prismaMock helper**

`packages/backend/src/test/helpers/prismaMock.ts`：
```typescript
import { vi } from 'vitest';

/**
 * prisma mock 工厂。$transaction 支持交互式事务（回调形式，tx=prismaMock）
 * + 数组形式（Promise.all）。§4 mock 约定。
 */
export function createPrismaMock() {
  const prismaMock: Record<string, any> = {
    user: {
      findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(),
      count: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(), upsert: vi.fn(),
    },
    session: {
      findMany: vi.fn(), deleteMany: vi.fn(), count: vi.fn(),
      create: vi.fn(), delete: vi.fn(),
    },
    project: {
      findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    projectMember: {
      findMany: vi.fn(), findUnique: vi.fn(), count: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    connection: {
      findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn(),
      create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    $transaction: vi.fn(async (arg: any) =>
      typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)),
    $queryRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
  };
  return prismaMock;
}
```

- [ ] **Step 2: 迁移 authService.test.ts（示范模式，其余 test 照此）**

`packages/backend/src/services/authService.test.ts` 顶部的 `vi.mock('../utils/prisma.js', () => { const prismaMock = {...}; return { prisma: prismaMock }; })`（约 §4-22）替换为：
```typescript
import { vi } from 'vitest';
import { prisma } from '../utils/prisma.js';

const { prismaMock } = vi.hoisted(() => {
  // vi.hoisted 让 mock 工厂能引用 createPrismaMock 的实例
  return { prismaMock: null as any };
});
vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  const m = createPrismaMock();
  prismaMockRef.value = m;
  return { prisma: m };
});
const prismaMockRef = { value: null as any };

// 测试里用 prisma（= mock 实例）设返回值：
// beforeEach(() => { prisma.user.findUnique.mockResolvedValue({...}); })
```

> 注：authService.test.ts 现有 145 测试中的 24 个 auth 测试迁移后必须仍绿。迁移是纯重构（mock 来源从内联改 helper），测试逻辑不动。**若现有测试断言直接引用了内联 prismaMock 的具体 mock 实现，逐一改为 `prisma.xxx.mockXxx(...)`。**

- [ ] **Step 3: 迁移 connectionService.test.ts（同模式）**

`packages/backend/src/services/connectionService.test.ts` 顶部 `vi.mock('../utils/prisma.js', ...)`（§5）同样替换为 helper 模式（Step 2）。现有 31 个 connection 测试迁移后仍绿。

- [ ] **Step 4: 跑测试确认迁移不回归**

Run: `pnpm --filter @remotehub/backend test`
Expected: PASS（145 测试全绿——authService 24 + connectionService 31 + 其余不变）

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/test/helpers/prismaMock.ts packages/backend/src/services/authService.test.ts packages/backend/src/services/connectionService.test.ts
git commit -m "refactor(backend): 抽 createPrismaMock helper + 迁移 auth/connection test

消除 5 份 prismaMock 重复（D8）；为 Plan C B-6 新 test 铺路。
现有测试逻辑不动，仅 mock 来源从内联改 helper。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: userService.test.ts

**Files:**
- Create: `packages/backend/src/services/userService.test.ts`

**Interfaces:**
- Consumes: Task 1 的 `createPrismaMock` + `userService`（listUsers/searchUsers/getUser/updateUser/deleteUser）

- [ ] **Step 1: 写测试文件**

`packages/backend/src/services/userService.test.ts`：
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPrismaMock } from '../test/helpers/prismaMock.js';

const { prismaMock } = vi.hoisted(() => ({ prismaMock: null as any }));
vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  const m = createPrismaMock();
  prismaMockRef.value = m;
  return { prisma: m };
});
const prismaMockRef = { value: null as any };
const prisma = prismaMockRef;

import { listUsers, searchUsers, getUser, updateUser, deleteUser } from './userService.js';
import { AppError } from '../utils/appError.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('getUser', () => {
  it('用户不存在抛 USER_002', async () => {
    prisma.value.user.findUnique.mockResolvedValue(null);
    await expect(getUser('u1')).rejects.toMatchObject({ code: 'USER_002' });
  });
  it('存在则返回', async () => {
    prisma.value.user.findUnique.mockResolvedValue({ id: 'u1', username: 'a' });
    await expect(getUser('u1')).resolves.toMatchObject({ id: 'u1' });
  });
});

describe('updateUser - last-admin 保护', () => {
  it('降级最后一个 active admin 抛 AUTH_003', async () => {
    prisma.value.user.findUnique.mockResolvedValue({ id: 'u1', role: 'admin' });
    prisma.value.user.count.mockResolvedValue(1); // 仅剩自己
    await expect(updateUser('admin-1', 'u1', { role: 'user' })).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('禁用最后一个 active admin 抛 AUTH_003', async () => {
    prisma.value.user.findUnique.mockResolvedValue({ id: 'u1', role: 'admin' });
    prisma.value.user.count.mockResolvedValue(1);
    await expect(updateUser('admin-1', 'u1', { isActive: false })).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('正常更新 nickname', async () => {
    prisma.value.user.findUnique.mockResolvedValue({ id: 'u1', role: 'user' });
    prisma.value.user.update.mockResolvedValue({ id: 'u1', nickname: '新昵称' });
    await expect(updateUser('admin-1', 'u1', { nickname: '新昵称' })).resolves.toMatchObject({ nickname: '新昵称' });
  });
  it('超长 nickname 抛 VAL_001（Plan A 校验接线）', async () => {
    await expect(updateUser('admin-1', 'u1', { nickname: 'a'.repeat(51) })).rejects.toMatchObject({ code: 'VAL_001' });
  });
});

describe('deleteUser - 保护事务', () => {
  it('删自己抛 AUTH_003', async () => {
    await expect(deleteUser('u1', 'u1')).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('删最后一个 active admin 抛 AUTH_003', async () => {
    prisma.value.user.findUnique.mockResolvedValue({ id: 'u2', role: 'admin', isActive: true });
    prisma.value.user.count.mockResolvedValue(1);
    await expect(deleteUser('u1', 'u2')).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('删唯一 owner 抛 MEMBER_003', async () => {
    prisma.value.user.findUnique.mockResolvedValue({ id: 'u2', role: 'user', isActive: true });
    prisma.value.projectMember.findMany.mockResolvedValue([{ projectId: 'p1' }]);
    prisma.value.projectMember.count.mockResolvedValue(1); // 唯一 owner
    await expect(deleteUser('u1', 'u2')).rejects.toMatchObject({ code: 'MEMBER_003' });
  });
  it('正常删除', async () => {
    prisma.value.user.findUnique.mockResolvedValue({ id: 'u2', role: 'user', isActive: true });
    prisma.value.projectMember.findMany.mockResolvedValue([]);
    prisma.value.user.delete.mockResolvedValue({ id: 'u2' });
    await expect(deleteUser('u1', 'u2')).resolves.toMatchObject({ id: 'u2' });
  });
});

describe('listUsers / searchUsers', () => {
  it('listUsers 返回分页', async () => {
    prisma.value.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    prisma.value.user.count.mockResolvedValue(1);
    const r = await listUsers(1, 20);
    expect(r.data).toHaveLength(1);
    expect(r.pagination.total).toBe(1);
  });
  it('searchUsers 按查询返回', async () => {
    prisma.value.user.findMany.mockResolvedValue([{ id: 'u1', username: 'a' }]);
    const r = await searchUsers('a');
    expect(r).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `pnpm --filter @remotehub/backend test -- userService`
Expected: PASS（约 10 个测试绿）

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/services/userService.test.ts
git commit -m "test(backend): userService 单元测试（last-admin/delete 保护/list/search）

B-6 §4：覆盖 getUser USER_002、updateUser last-admin AUTH_003、
deleteUser 自己/last-admin/唯一 owner MEMBER_003、校验接线 VAL_001。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: projectService.test.ts

**Files:**
- Create: `packages/backend/src/services/projectService.test.ts`

- [ ] **Step 1: 写测试文件**

`packages/backend/src/services/projectService.test.ts`：
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPrismaMock } from '../test/helpers/prismaMock.js';

const { prismaMock } = vi.hoisted(() => ({ prismaMock: null as any }));
vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  const m = createPrismaMock();
  prismaMockRef.value = m;
  return { prisma: m };
});
const prismaMockRef = { value: null as any };
const prisma = prismaMockRef;

// mock Prisma 已知错误
class PrismaKnownError extends Error {
  code: string; meta: any;
  constructor(code: string, meta: any) { super(code); this.code = code; this.meta = meta; }
}

beforeEach(() => { vi.clearAllMocks(); });

import { createProject, updateProject, deleteProject, listProjects } from './projectService.js';

describe('createProject - owner 自动插入事务', () => {
  it('建项目 + 插 owner 成员', async () => {
    prisma.value.project.create.mockImplementation(async (args: any) => ({ id: 'p1', name: args.data.name, icon: 'folder', createdBy: 'u1', updatedBy: 'u1', createdAt: new Date(), updatedAt: new Date(), description: null }));
    prisma.value.projectMember.create.mockResolvedValue({});
    prisma.value.user.findMany.mockResolvedValue([]); // resolveUserRefs 空集
    const r = await createProject('u1', { name: 'proj' });
    expect(prisma.value.$transaction).toHaveBeenCalled();
    expect(r).toMatchObject({ name: 'proj' });
  });
  it('P2002 name 冲突抛 PROJ_001', async () => {
    prisma.value.project.create.mockRejectedValue(new PrismaKnownError('P2002', { target: ['name'] }));
    prisma.value.projectMember.create.mockResolvedValue({});
    vi.doMock('@prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: PrismaKnownError } }));
    await expect(createProject('u1', { name: 'dup' })).rejects.toMatchObject({ code: 'PROJ_001' });
  });
});

describe('updateProject', () => {
  it('P2025 不存在抛 PROJ_002', async () => {
    prisma.value.project.update.mockRejectedValue(new PrismaKnownError('P2025', {}));
    await expect(updateProject('u1', 'p1', { name: 'new' })).rejects.toMatchObject({ code: 'PROJ_002' });
  });
  it('正常更新', async () => {
    prisma.value.project.update.mockResolvedValue({ id: 'p1', name: 'new', icon: 'folder', description: null, createdBy: 'u1', updatedBy: 'u1', createdAt: new Date(), updatedAt: new Date() });
    prisma.value.user.findMany.mockResolvedValue([]);
    await expect(updateProject('u1', 'p1', { name: 'new' })).resolves.toMatchObject({ name: 'new' });
  });
});

describe('deleteProject', () => {
  it('P2025 不存在抛 PROJ_002', async () => {
    prisma.value.project.delete.mockRejectedValue(new PrismaKnownError('P2025', {}));
    await expect(deleteProject('p1')).rejects.toMatchObject({ code: 'PROJ_002' });
  });
  it('正常删除', async () => {
    prisma.value.project.delete.mockResolvedValue({ id: 'p1' });
    await expect(deleteProject('p1')).resolves.toMatchObject({ id: 'p1' });
  });
});

describe('listProjects', () => {
  it('admin 看全部', async () => {
    prisma.value.project.findMany.mockResolvedValue([]);
    prisma.value.project.count.mockResolvedValue(0);
    prisma.value.user.findMany.mockResolvedValue([]);
    const r = await listProjects('u1', 'admin');
    expect(r.pagination.total).toBe(0);
  });
});
```

> 注：`Prisma.PrismaClientKnownRequestError` 的 mock 方式视 vitest + Prisma 版本调整。若 `vi.doMock('@prisma/client', ...)` 在测试中失效，改为在文件顶 `vi.mock('@prisma/client', () => ({ Prisma: { PrismaClientKnownRequestError: class {...} } }))`。`handlePrismaUniqueViolation` 用 `instanceof Prisma.PrismaClientKnownRequestError` 判断，mock 类需匹配。

- [ ] **Step 2: 跑测试**

Run: `pnpm --filter @remotehub/backend test -- projectService`
Expected: PASS（约 7 个测试绿）。若 P2002/P2025 的 instanceof 判断不匹配，调整 mock 类构造（确保 `error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'` 成立）。

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/services/projectService.test.ts
git commit -m "test(backend): projectService 单元测试（owner 事务/P2002/P2025/delete）

B-6 §4：覆盖 createProject owner 自动插入 + P2002 PROJ_001、
updateProject P2025 PROJ_002、deleteProject P2025、listProjects。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: memberService.test.ts

**Files:**
- Create: `packages/backend/src/services/memberService.test.ts`

- [ ] **Step 1: 写测试文件**

`packages/backend/src/services/memberService.test.ts`：
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPrismaMock } from '../test/helpers/prismaMock.js';

const { prismaMock } = vi.hoisted(() => ({ prismaMock: null as any }));
vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  const m = createPrismaMock();
  prismaMockRef.value = m;
  return { prisma: m };
});
const prismaMockRef = { value: null as any };
const prisma = prismaMockRef;

beforeEach(() => { vi.clearAllMocks(); });

import { addMember, updateMemberRole, removeMember, listMembers } from './memberService.js';

describe('addMember', () => {
  it('用户不存在抛 USER_002', async () => {
    prisma.value.user.findUnique.mockResolvedValue(null);
    await expect(addMember('p1', 'u1', 'editor')).rejects.toMatchObject({ code: 'USER_002' });
  });
  it('已存在抛 MEMBER_001', async () => {
    prisma.value.user.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.value.projectMember.findUnique.mockResolvedValue({ id: 'm1' }); // 已存在
    await expect(addMember('p1', 'u1', 'editor')).rejects.toMatchObject({ code: 'MEMBER_001' });
  });
  it('无效角色抛 VAL_001', async () => {
    await expect(addMember('p1', 'u1', 'invalid')).rejects.toMatchObject({ code: 'VAL_001' });
  });
  it('正常添加', async () => {
    prisma.value.user.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.value.projectMember.findUnique.mockResolvedValue(null);
    prisma.value.projectMember.create.mockResolvedValue({ id: 'm1', addedAt: new Date() });
    await expect(addMember('p1', 'u1', 'editor')).resolves.toMatchObject({ userId: 'u1', role: 'editor' });
  });
});

describe('updateMemberRole - last-owner 保护', () => {
  it('成员不存在抛 MEMBER_001', async () => {
    prisma.value.projectMember.findUnique.mockResolvedValue(null);
    await expect(updateMemberRole('p1', 'u1', 'editor', 'admin-1')).rejects.toMatchObject({ code: 'MEMBER_001' });
  });
  it('降级最后一个 owner 抛 MEMBER_002', async () => {
    prisma.value.projectMember.findUnique.mockResolvedValue({ id: 'm1', role: 'owner' });
    prisma.value.projectMember.count.mockResolvedValue(1);
    await expect(updateMemberRole('p1', 'u1', 'editor', 'admin-1')).rejects.toMatchObject({ code: 'MEMBER_002' });
  });
  it('正常变更', async () => {
    prisma.value.projectMember.findUnique.mockResolvedValue({ id: 'm1', role: 'viewer' });
    prisma.value.projectMember.update.mockResolvedValue({ id: 'm1', role: 'editor' });
    await expect(updateMemberRole('p1', 'u1', 'editor', 'admin-1')).resolves.toMatchObject({ role: 'editor' });
  });
});

describe('removeMember - B-3 权限修复', () => {
  it('editor 移除他人抛 AUTH_003（B-3：editor/viewer 只能移除自己）', async () => {
    prisma.value.projectMember.findUnique.mockResolvedValue({ id: 'caller', role: 'editor' }); // caller
    await expect(removeMember('p1', 'other-user', 'caller-user', 'user')).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('viewer 移除他人抛 AUTH_003', async () => {
    prisma.value.projectMember.findUnique.mockResolvedValue({ id: 'caller', role: 'viewer' });
    await expect(removeMember('p1', 'other-user', 'caller-user', 'user')).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('editor 移除自己成功', async () => {
    prisma.value.projectMember.findUnique.mockResolvedValueOnce({ id: 'caller', role: 'editor' }) // caller 检查
      .mockResolvedValueOnce({ id: 'm1', role: 'editor' }); // target 检查
    prisma.value.projectMember.delete.mockResolvedValue({ id: 'm1' });
    await expect(removeMember('p1', 'caller-user', 'caller-user', 'user')).resolves.toMatchObject({ id: 'm1' });
  });
  it('移除最后一个 owner 抛 MEMBER_002', async () => {
    prisma.value.projectMember.findUnique.mockResolvedValueOnce({ id: 'caller', role: 'owner' }) // caller 是 owner
      .mockResolvedValueOnce({ id: 'm1', role: 'owner' }); // target 是 owner
    prisma.value.projectMember.count.mockResolvedValue(1);
    await expect(removeMember('p1', 'target', 'caller', 'user')).rejects.toMatchObject({ code: 'MEMBER_002' });
  });
  it('owner 移除任意成员成功', async () => {
    prisma.value.projectMember.findUnique.mockResolvedValueOnce({ id: 'caller', role: 'owner' })
      .mockResolvedValueOnce({ id: 'm1', role: 'editor' });
    prisma.value.projectMember.delete.mockResolvedValue({ id: 'm1' });
    await expect(removeMember('p1', 'target', 'caller', 'user')).resolves.toMatchObject({ id: 'm1' });
  });
});

describe('listMembers', () => {
  it('返回分页成员', async () => {
    prisma.value.projectMember.findMany.mockResolvedValue([{ id: 'm1', userId: 'u1', role: 'editor', addedAt: new Date(), user: { username: 'a', nickname: 'A' } }]);
    prisma.value.projectMember.count.mockResolvedValue(1);
    const r = await listMembers('p1');
    expect(r.data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `pnpm --filter @remotehub/backend test -- memberService`
Expected: PASS（约 12 个测试绿——含 B-3 的 editor/viewer 移除他人 AUTH_003）

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/services/memberService.test.ts
git commit -m "test(backend): memberService 单元测试（B-3 removeMember 权限 + last-owner）

B-6 §4：覆盖 addMember USER_002/MEMBER_001、updateMemberRole last-owner MEMBER_002、
removeMember B-3（editor/viewer 移除他人 AUTH_003）、listMembers。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: connectionService.test.ts 加 getConnection（B-4）

**Files:**
- Modify: `packages/backend/src/services/connectionService.test.ts`（Task 1 已迁移到 helper）

**Interfaces:**
- Consumes: `getConnection`（B-4 修复：viewer 拿不到 encryptedPass、editor/owner/admin 拿到、CONN_002 不存在）

- [ ] **Step 1: 读 getConnection 签名确认入参**

Run: `grep -n "export async function getConnection" packages/backend/src/services/connectionService.ts`
Expected: 定位 getConnection 函数，确认其参数（projectId/connectionId/callerRole 等）与 `toDetail(connection, includeEncryptedPass, userMap)` 的 `includeEncryptedPass` 判定逻辑（viewer→false，editor/owner/admin→true）。实现者按真实签名调整下方测试入参。

- [ ] **Step 2: 加 getConnection 测试**

在 `packages/backend/src/services/connectionService.test.ts`（已迁移 helper）加：
```typescript
describe('getConnection - B-4 encryptedPass 权限', () => {
  const fakeConnection = {
    id: 'c1', projectId: 'p1', name: 'c', host: 'h', port: 22, username: 'u',
    encryptedPass: 'enc-secret', protocol: 'SSH', vpnType: null, vpnLoginUrl: null,
    requiredVpnId: null, notes: null, tags: null, lastAccessed: null,
    createdBy: 'u1', updatedBy: 'u1', createdAt: new Date(), updatedAt: new Date(),
  };

  it('viewer 拿不到 encryptedPass（B-4）', async () => {
    prisma.value.connection.findUnique.mockResolvedValue(fakeConnection);
    prisma.value.user.findMany.mockResolvedValue([]);
    const r = await getConnection(/* 按真实签名填：projectId, connectionId, callerRole='viewer' 等 */);
    expect(r).not.toHaveProperty('encryptedPass');
  });

  it('editor 拿到 encryptedPass', async () => {
    prisma.value.connection.findUnique.mockResolvedValue(fakeConnection);
    prisma.value.user.findMany.mockResolvedValue([]);
    const r = await getConnection(/* callerRole='editor' */);
    expect(r.encryptedPass).toBe('enc-secret');
  });

  it('连接不存在抛 CONN_002', async () => {
    prisma.value.connection.findUnique.mockResolvedValue(null);
    await expect(getConnection(/* ... */)).rejects.toMatchObject({ code: 'CONN_002' });
  });
});
```

> 注：`getConnection` 的真实签名（参数顺序/名称）由 Step 1 grep 确认后填入。`includeEncryptedPass` 的 role 判定（viewer→false）在 `getConnection` 内部读 callerRole 决定。

- [ ] **Step 3: 跑测试**

Run: `pnpm --filter @remotehub/backend test -- connectionService`
Expected: PASS（31 + 新增 3 个 getConnection 测试绿）

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/services/connectionService.test.ts
git commit -m "test(backend): connectionService 加 getConnection（B-4 encryptedPass 权限）

B-6 §4：覆盖 viewer 拿不到 encryptedPass、editor 拿到、CONN_002 不存在。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: appError.test.ts（P2002 映射）

**Files:**
- Create: `packages/backend/src/utils/appError.test.ts`

**Interfaces:**
- Consumes: `handlePrismaUniqueViolation`（被测对象已存在，`appError.ts` §67-78）、`createAppError`、`ERROR_CODES`

- [ ] **Step 1: 写测试文件**

`packages/backend/src/utils/appError.test.ts`：
```typescript
import { describe, it, expect, vi } from 'vitest';

// mock @prisma/client 的 Prisma.PrismaClientKnownRequestError
class FakeKnownError extends Error {
  code: string;
  meta: Record<string, unknown> | undefined;
  constructor(code: string, meta?: Record<string, unknown>) {
    super(code);
    this.code = code;
    this.meta = meta;
  }
}
vi.mock('@prisma/client', () => ({
  Prisma: { PrismaClientKnownRequestError: FakeKnownError },
}));

import { handlePrismaUniqueViolation, createAppError, ERROR_CODES } from './appError.js';

describe('handlePrismaUniqueViolation - P2002 映射 §11.2', () => {
  const cases: Array<[string, string]> = [
    ['username', 'USER_001'],
    ['name', 'PROJ_001'],
    ['projectId,name', 'CONN_005'],
    ['projectId,userId', 'MEMBER_001'],
    ['tokenHash', 'SYS_001'],
  ];

  for (const [target, expectedCode] of cases) {
    it(`P2002 target="${target}" → ${expectedCode}`, async () => {
      const err = new FakeKnownError('P2002', { target: target.split(',') });
      await expect(handlePrismaUniqueViolation(err)).rejects.toMatchObject({ code: expectedCode });
    });
  }

  it('非 P2002 错误透传（不映射）', async () => {
    const other = new Error('something else');
    await expect(handlePrismaUniqueViolation(other)).rejects.toBe(other);
  });

  it('P2002 但 target 未识别 → 透传', async () => {
    const err = new FakeKnownError('P2002', { target: ['unknownField'] });
    await expect(handlePrismaUniqueViolation(err)).rejects.toBe(err);
  });
});

describe('createAppError + ERROR_CODES', () => {
  it('VAL_001 状态码 422', () => {
    const e = createAppError('VAL_001', [{ field: 'x', message: '错' }]);
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe('VAL_001');
    expect(e.details).toEqual([{ field: 'x', message: '错' }]);
  });
  it('未知 code 回退 500', () => {
    const e = createAppError('NOPE');
    expect(e.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: 跑测试**

Run: `pnpm --filter @remotehub/backend test -- appError`
Expected: PASS（约 9 个测试绿）

> **验证项（spec §4）**：切 SQLite 后，Prisma 的 P2002 `meta.target` 字段格式（字段名顺序/大小写）是否与 MySQL 一致——若 SQLite 下 `target` 格式不同导致映射失效，更新 `handlePrismaUniqueViolation` 的比对逻辑（appError.ts §70-75）+ 对应测试用例。

- [ ] **Step 3: 跑全部测试确认总数**

Run: `pnpm --filter @remotehub/backend test`
Expected: PASS（unit 总数 145 → **200+**）

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/utils/appError.test.ts
git commit -m "test(backend): appError 单元测试（handlePrismaUniqueViolation P2002 映射）

B-6 §4：覆盖 P2002 → USER_001/PROJ_001/CONN_005/MEMBER_001/SYS_001 映射、
非 P2002 透传、createAppError 错误码状态码。
含 SQLite P2002 target 格式验证项。
Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review

**1. Spec 覆盖**（spec §4 测试文件清单）：
- userService.test.ts（list/search/get/update last-admin/delete 保护）→ Task 2 ✓
- projectService.test.ts（create owner 事务/update P2025 P2002/delete）→ Task 3 ✓
- memberService.test.ts（add MEMBER_001 USER_002/update last-owner/remove B-3）→ Task 4 ✓
- connectionService.test.ts 加 getConnection（B-4 viewer/editor/CONN_002）→ Task 5 ✓
- appError.test.ts（P2002 映射）→ Task 6 ✓
- createPrismaMock helper（D8）→ Task 1 ✓
- mock 约定（$transaction 双形式）→ Task 1 helper ✓

**2. Placeholder 扫描**：Task 5 Step 2 的 getConnection 入参「按真实签名填」——Step 1 明确要求 grep 确认签名后再填，是实现指引（我未读 getConnection 完整签名，不编），非 placeholder。Task 3 的 Prisma 错误 mock 注明了 instanceof 匹配的调整方向。

**3. 类型/签名一致性**：各 service 函数签名对照源码（userService.updateUser(callerId, targetId, data)、projectService.createProject(userId, data)、memberService.addMember(projectId, userId, role) 等）；错误码对照 appError.ts ERROR_CODES。

**4. 实施顺序**：Task 1（helper + 迁移）→ Task 2-6（各 test 复用 helper）。依赖 Plan A（校验接线 + service 定稿）。Task 5 依赖 connectionService.getConnection 真实签名（Step 1 grep）。

**5. refactor-design 一致性**：测试反映一期已实现行为（含 B-3/B-4/B-5 修复），与 refactor-design §4/§5 service 设计一致；不改 service（业务逻辑零改动约束）。

**6. 验收**（spec §4）：测试数 145 → 200+（Task 2 约 10 + Task 3 约 7 + Task 4 约 12 + Task 5 +3 + Task 6 约 9 = +41）；关键事务分支全覆盖。
