# RemoteHub V2 Phase 2 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在一期基础上分三批实现审计日志、系统监控、安全增强、数据备份、WebSocket、密码重置、导入导出、项目增强、2FA、K8s 探针和 Swagger 文档。

**Architecture:** 沿用一期 Express 5 + Prisma 6 + MySQL 架构。新增模块以独立 service/controller/middleware 文件组织，通过路由级中间件挂载，最小化对一期代码的侵入。WebSocket 使用 `ws` 库挂载在 HTTP server 上，不引入外部消息队列。

**Tech Stack:** Express 5, Prisma 6, MySQL 8, ws 8.x, otpauth 9.x, vitest, supertest, node-cron

**Spec:** `docs/superpowers/specs/2026-04-23-remotehub-v2-phase2-design.md`

---

## 文件结构变更总览

### P0 新增/修改文件

```
packages/backend/
├── src/
│   ├── server.ts                          # MODIFY: 添加 dotenv + 输入净化中间件
│   ├── config/env.ts                      # MODIFY: 添加 P0 新环境变量
│   ├── middleware/
│   │   ├── sanitization.ts                # CREATE: 输入净化中间件
│   │   ├── sanitization.test.ts           # CREATE: 净化中间件测试
│   │   ├── audit.ts                       # CREATE: 审计中间件
│   │   └── audit.test.ts                  # CREATE: 审计中间件测试
│   ├── services/
│   │   ├── auditService.ts                # CREATE: 审计日志查询/导出
│   │   ├── auditService.test.ts           # CREATE: 审计 Service 测试
│   │   ├── monitoringService.ts           # CREATE: 系统监控数据聚合
│   │   ├── monitoringService.test.ts      # CREATE: 监控 Service 测试
│   │   └── performanceMonitor.ts          # CREATE: 性能监控中间件+环形缓冲区
│   ├── controllers/
│   │   ├── auditController.ts             # CREATE: 审计日志 API
│   │   └── monitoringController.ts        # CREATE: 监控 API
│   ├── routes/
│   │   ├── auditRoutes.ts                 # CREATE: 审计路由
│   │   ├── monitoringRoutes.ts            # CREATE: 监控路由
│   │   └── healthRoutes.ts               # MODIFY: 扩展健康检查
│   ├── utils/
│   │   ├── logger.ts                      # MODIFY: 生产环境 JSON 格式
│   │   └── appError.ts                    # MODIFY: 新增错误码
│   └── utils/auditCleaner.ts              # CREATE: 审计日志定时清理
├── prisma/
│   └── schema.prisma                      # MODIFY: 添加 AuditLog 模型
packages/shared/src/
├── types.ts                               # MODIFY: 添加 AuditLog, AuditLogQuery, Dashboard
├── enums.ts                               # MODIFY: 添加 AUDIT_ACTIONS, AUDIT_RESOURCES
├── constants.ts                           # MODIFY: 添加审计相关常量
```

### P1 新增/修改文件

```
packages/backend/
├── src/
│   ├── server.ts                          # MODIFY: createServer 重构 + helmet CSP + graceful shutdown
│   ├── config/env.ts                      # MODIFY: 添加 P1 新环境变量
│   ├── middleware/
│   │   └── performanceMonitor.ts          # MODIFY: 全局挂载（P0 创建文件，P1 挂载到 server.ts）
│   ├── services/
│   │   ├── backupService.ts               # CREATE: 备份 CRUD + mysqldump
│   │   ├── backupService.test.ts          # CREATE: 备份 Service 测试
│   │   ├── passwordResetService.ts        # CREATE: 密码重置流程
│   │   ├── passwordResetService.test.ts   # CREATE: 密码重置测试
│   │   ├── wsService.ts                   # CREATE: WebSocket 管理（房间、认证、推送）
│   │   ├── wsService.test.ts              # CREATE: WS Service 测试
│   │   └── notificationService.ts         # CREATE: 通知队列查询/标记已读
│   ├── controllers/
│   │   ├── backupController.ts            # CREATE: 备份 API
│   │   ├── passwordResetController.ts     # CREATE: 密码重置 API
│   │   └── notificationController.ts      # CREATE: 通知 API
│   ├── routes/
│   │   ├── backupRoutes.ts                # CREATE: 备份路由
│   │   ├── passwordResetRoutes.ts         # CREATE: 密码重置路由
│   │   └── notificationRoutes.ts          # CREATE: 通知路由
│   └── utils/
│       └── notificationCleaner.ts         # CREATE: 通知定时清理
├── prisma/
│   └── schema.prisma                      # MODIFY: 添加 PasswordResetToken, NotificationQueue
packages/shared/src/
├── types.ts                               # MODIFY: 添加 Backup, PasswordReset, Notification, WSMessage
├── enums.ts                               # MODIFY: 添加 BACKUP_STATUSES, WS_MESSAGE_TYPES
├── constants.ts                           # MODIFY: 添加备份/WS/重置相关常量
├── validators.ts                          # MODIFY: 添加密码重置验证
docker-compose.yml                         # MODIFY: 添加 backup-data 卷
```

### P2 新增/修改文件

```
packages/backend/
├── src/
│   ├── config/env.ts                      # MODIFY: 添加 P2 新环境变量
│   ├── services/
│   │   ├── importExportService.ts          # CREATE: 导入导出逻辑
│   │   ├── importExportService.test.ts     # CREATE: 导入导出测试
│   │   ├── projectEnhanceService.ts        # CREATE: 复制/归档/批量/转让
│   │   ├── projectEnhanceService.test.ts   # CREATE: 项目增强测试
│   │   ├── twoFactorService.ts             # CREATE: TOTP 2FA
│   │   └── twoFactorService.test.ts        # CREATE: 2FA 测试
│   ├── controllers/
│   │   ├── importExportController.ts       # CREATE
│   │   ├── projectEnhanceController.ts     # CREATE
│   │   └── twoFactorController.ts          # CREATE
│   ├── routes/
│   │   ├── importExportRoutes.ts            # CREATE
│   │   ├── projectEnhanceRoutes.ts          # CREATE
│   │   └── twoFactorRoutes.ts               # CREATE
│   └── routes/healthRoutes.ts              # MODIFY: 添加 K8s 探针端点
├── prisma/
│   └── schema.prisma                       # MODIFY: User 添加 2FA 字段, Project 添加 status
packages/shared/src/
├── types.ts                                # MODIFY: 添加 ImportResult, ProjectStatus
├── enums.ts                                # MODIFY: 添加 PROJECT_STATUSES
├── validators.ts                           # MODIFY: 添加导入数据验证
```

---

## P0-BLOCKER: 上线阻塞项（phase2 开工前必修）

> **权威以收尾 spec 为准**：phase2 开工前的所有前置（持久化切换、migration、CI、补测试、前端迁移）以 `docs/superpowers/specs/2026-07-17-v2-followup-design.md` 为准；本批次 Task 细节若与之冲突，以收尾 spec 为准（避免双轨）。已修：B-3/B-4（4af159e）、B-5 refresh 事务（33b9dfd）、13+ HIGH/MEDIUM（4af159e..e3a865b）。待办：持久化切换 + migration + CI + B-6 补测试 + 前端迁移。

### Task 0.0.1: 生成 Prisma migration（BLOCKER-1）

**Files:** `packages/backend/prisma/migrations/`（新建）

- [ ] 切 SQLite 后（收尾 spec §1），`DATABASE_URL=file:./dev.db`，执行 `npx prisma migrate dev --name init` 生成初始 migration
- [ ] 提交 `migrations/` 目录
- [ ] 验证干净库 `prisma migrate deploy` 能建出 5 张表
- [ ] `prisma migrate status` 无 pending

### Task 0.0.2: 建 CI（BLOCKER-2）

**Files:** `.github/workflows/ci.yml`（新建）

- [ ] workflow: `pnpm install` → `shared build` → `lint` → `test`，Node 20
- [ ] PR 触发，main 分支保护

### Task 0.0.3: 修复 refresh 事务（B-5） ✅ 已修（commit 33b9dfd，全修阶段；下方步骤为已完成记录）

**Files:** `packages/backend/src/services/authService.ts`

- [ ] 把 `updateMany`（标记 consumedAt）+ `session.create` 放入同一 `prisma.$transaction(async (tx) => ...)` 交互式事务
- [ ] 重用攻击 / 禁用路径的 `delete` / `deleteMany` 在事务外执行（确保生效，不被 throw 回滚）—— 用 pendingDelete 模式或事务后单独执行
- [ ] 更新 `authService.test.ts` 的 `$transaction` mock 支持回调形式：`prisma.$transaction.mockImplementation(async (cb) => cb(txMock))`
- [ ] 验证 24 个 authService 测试通过

### Task 0.0.4: 补 3 核心 service 单元测试（B-6）

**Files:** `packages/backend/src/services/{userService,projectService,memberService}.test.ts`（新建）

- [ ] 覆盖：last-admin / last-owner 保护、P2002 → 业务码映射、P2025、事务分支
- [ ] `$transaction` mock 用回调形式
- [ ] 补 `getConnection` 测试（viewer 拿不到 encryptedPass、editor 拿到、CONN_002）

### Task 0.0.5: 前端迁移前置评估（HIGH-5）

- [ ] 产出前端迁移子项目的 spec / plan（独立 brainstorming → spec → plan）
- [ ] phase2 §19 前端章节标 blocked，直到前端迁移完成

---

## P0-PREREQ: 前置准备（约 30 分钟）

### Task 0.1: 添加 dotenv 加载 + 连接池配置 + 日志格式

**Files:**
- Modify: `packages/backend/src/server.ts:1`
- Modify: `packages/backend/.env`
- Modify: `packages/backend/src/utils/logger.ts`
- Modify: `packages/backend/src/config/env.ts`
- Modify: `packages/backend/package.json`

- [ ] **Step 1: 安装 dotenv**

```bash
cd packages/backend && pnpm add dotenv
```

Run: `pnpm list dotenv`
Expected: `dotenv 16.x.x`

- [ ] **Step 2: server.ts 顶部添加 dotenv 导入**

在 `server.ts` 第一行（所有 import 之前）添加：

```typescript
import 'dotenv/config';
```

Run: `cd packages/backend && npx tsx src/server.ts &` 然后 `curl http://localhost:3001/api/v1/health`，确认服务正常启动。kill 掉进程。

- [ ] **Step 3: .env 添加连接池参数**

修改 `DATABASE_URL`:

```
DATABASE_URL=mysql://root:123456@localhost:3306/remotehub_dev?connection_limit=30
```

- [ ] **Step 4: logger.ts 生产环境 JSON 格式**

修改 `packages/backend/src/utils/logger.ts`，将 transports 配置改为：

```typescript
import winston from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, printf, colorize, json } = winston.format;

const devFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}]${metaStr} ${message}`;
});

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' })),
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === 'production'
        ? json()
        : combine(colorize(), devFormat),
    }),
  ],
});
```

- [ ] **Step 5: 验证现有测试仍通过**

Run: `cd packages/backend && pnpm test`
Expected: 145 tests passed

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/server.ts packages/backend/src/utils/logger.ts packages/backend/.env packages/backend/package.json
git commit -m "feat: add dotenv loading, connection pool config, production JSON logging"
```

---

## P0-AUDIT: 审计日志（约 60 分钟）

### Task 0.2: Prisma Schema 添加 AuditLog 模型

**Files:**
- Modify: `packages/backend/prisma/schema.prisma` — 在末尾添加 AuditLog 模型，在 User 模型中添加 `auditLogs` 关联

- [ ] **Step 1: 在 schema.prisma 的 User 模型中添加关联**

在 User 模型的 `sessions Session[]` 之后添加：

```prisma
  auditLogs       AuditLog[]
```

- [ ] **Step 2: 在 schema.prisma 末尾添加 AuditLog 模型**

```prisma
model AuditLog {
  id         String   @id @default(uuid())
  userId     String?  @map("user_id")
  action     String   @db.VarChar(50)
  resource   String   @db.VarChar(50)
  resourceId String?  @db.VarChar(100) @map("resource_id")
  detail     String?
  ip         String?  @db.VarChar(45)
  userAgent  String?  @db.VarChar(500) @map("user_agent")
  createdAt  DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([action])
  @@index([resource, resourceId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

- [ ] **Step 3: 生成迁移**

```bash
cd packages/backend && npx prisma migrate dev --name add_audit_log
```

Run: `npx prisma db execute --stdin <<< "DESCRIBE audit_logs"`
Expected: 表结构输出，含 id/user_id/action/resource/resource_id/detail/ip/user_agent/created_at 列

- [ ] **Step 4: 生成 Prisma Client**

```bash
cd packages/backend && npx prisma generate
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/prisma/
git commit -m "feat: add AuditLog model to Prisma schema"
```

---

### Task 0.3: shared 包添加审计相关类型和枚举

**Files:**
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/enums.ts`
- Modify: `packages/shared/src/constants.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: enums.ts 添加审计枚举**

在 `packages/shared/src/enums.ts` 末尾添加：

```typescript
/** 审计操作类型 */
export const AUDIT_ACTIONS = [
  'AUTH_LOGIN', 'AUTH_LOGOUT', 'AUTH_REGISTER', 'AUTH_PASSWORD_CHANGE', 'AUTH_PROFILE_UPDATE',
  'USER_CREATE', 'USER_UPDATE', 'USER_DELETE',
  'PROJECT_CREATE', 'PROJECT_UPDATE', 'PROJECT_DELETE',
  'MEMBER_ADD', 'MEMBER_UPDATE', 'MEMBER_REMOVE',
  'CONNECTION_CREATE', 'CONNECTION_UPDATE', 'CONNECTION_DELETE', 'CONNECTION_ACCESS',
  'SYSTEM_BACKUP', 'SYSTEM_RESTORE', 'SYSTEM_CONFIG_CHANGE',
  'SECURITY_SUSPICIOUS_IP',
] as const;
export type AuditAction = typeof AUDIT_ACTIONS[number];

/** 审计资源类型 */
export const AUDIT_RESOURCES = ['user', 'project', 'connection', 'member', 'system', 'security'] as const;
export type AuditResource = typeof AUDIT_RESOURCES[number];
```

- [ ] **Step 2: constants.ts 添加审计常量**

在 `packages/shared/src/constants.ts` 末尾添加：

```typescript
export const AUDIT_RETENTION_DAYS = 90;

/** 审计中间件敏感字段集合 */
export const SENSITIVE_FIELDS = new Set([
  'passwordHash', 'encryptedPass', 'token', 'tokenHash',
]);
```

- [ ] **Step 3: types.ts 添加审计 DTO**

在 `packages/shared/src/types.ts` 末尾添加（import AuditAction/AuditResource 从 enums）：

```typescript
// === 审计日志 ===
export interface AuditLog {
  id: string;
  userId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  detail: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogQuery {
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}
```

- [ ] **Step 4: index.ts 导出新增内容**

确认 `packages/shared/src/index.ts` 导出了新增的类型和枚举（如有 barrel export 即自动导出，否则手动添加 re-export）。

- [ ] **Step 5: 构建验证**

```bash
cd packages/shared && pnpm build
```

Expected: 构建成功，无类型错误

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/
git commit -m "feat: add audit log types, enums, and constants to shared package"
```

---

### Task 0.4: 审计中间件实现

**Files:**
- Create: `packages/backend/src/middleware/audit.ts`
- Create: `packages/backend/src/middleware/audit.test.ts`

- [ ] **Step 1: 写审计中间件测试**

创建 `packages/backend/src/middleware/audit.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { SENSITIVE_FIELDS } from '@remotehub/shared';

// Mock prisma
vi.mock('../utils/prisma.js', () => ({
  prisma: {
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: 'test-id' }),
    },
    user: { findUnique: vi.fn() },
    project: { findUnique: vi.fn() },
    connection: { findUnique: vi.fn() },
  },
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: { error: vi.fn(), info: vi.fn() },
}));

describe('auditMiddleware', () => {
  it('should redact sensitive fields in detail', () => {
    const detail = { passwordHash: 'secret', name: 'test', token: 'abc' };
    const redacted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(detail)) {
      redacted[key] = SENSITIVE_FIELDS.has(key) ? '[REDACTED]' : value;
    }
    expect(redacted.passwordHash).toBe('[REDACTED]');
    expect(redacted.name).toBe('test');
    expect(redacted.token).toBe('[REDACTED]');
  });

  it('should mask IP address (last octet)', () => {
    const maskIp = (ip: string) => ip.replace(/\.\d+$/, '.*');
    expect(maskIp('192.168.1.100')).toBe('192.168.1.*');
    expect(maskIp('10.0.0.1')).toBe('10.0.0.*');
  });

  it('should exclude password and encryptedPass from excluded fields list', () => {
    // These fields should NOT be sanitized by the sanitization middleware
    const SANITIZATION_EXCLUSIONS = ['password', 'encryptedPass', 'notes'];
    expect(SANITIZATION_EXCLUSIONS).toContain('password');
    expect(SANITIZATION_EXCLUSIONS).toContain('encryptedPass');
  });
});
```

Run: `cd packages/backend && pnpm vitest run src/middleware/audit.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 2: 实现审计中间件**

创建 `packages/backend/src/middleware/audit.ts`：

```typescript
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { SENSITIVE_FIELDS } from '@remotehub/shared';

function redactDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(detail)) {
    result[key] = SENSITIVE_FIELDS.has(key) ? '[REDACTED]' : value;
  }
  return result;
}

function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return ip.replace(/\.\d+$/, '.*');
}

interface AuditConfig {
  action: string;
  resource: string;
  getResourceId?: (req: Request) => string | undefined;
  getBeforeSnapshot?: (req: Request) => Promise<Record<string, unknown> | null>;
}

export function auditMiddleware(config: AuditConfig) {
  return (req: Request, res: Response, next: NextFunction): void => {
    let beforeSnapshot: Record<string, unknown> | null = null;

    // Capture before state for PATCH/DELETE
    const captureBefore = async () => {
      if (config.getBeforeSnapshot && (req.method === 'PATCH' || req.method === 'DELETE')) {
        try {
          beforeSnapshot = await config.getBeforeSnapshot(req);
        } catch {
          beforeSnapshot = null;
        }
      }
    };

    // Monkey-patch res.json to capture after state
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      setImmediate(async () => {
        try {
          let detail: Record<string, unknown> | null = null;
          if (beforeSnapshot && body && typeof body === 'object' && 'data' in (body as object)) {
            const after = (body as { data?: unknown }).data;
            if (after && typeof after === 'object') {
              const beforeRedacted = redactDetail(beforeSnapshot as Record<string, unknown>);
              const afterRedacted = redactDetail(after as Record<string, unknown>);
              detail = { before: beforeRedacted, after: afterRedacted };
            }
          } else if (!beforeSnapshot && body && typeof body === 'object' && 'data' in (body as object)) {
            const after = (body as { data?: unknown }).data;
            if (after && typeof after === 'object') {
              detail = { after: redactDetail(after as Record<string, unknown>) };
            }
          }

          await prisma.auditLog.create({
            data: {
              userId: req.user?.id ?? null,
              action: config.action,
              resource: config.resource,
              resourceId: config.getResourceId?.(req) ?? null,
              detail: detail ? JSON.stringify(detail) : null,
              ip: maskIp(req.ip),
              userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
            },
          });
        } catch (err) {
          logger.error('Audit log failed', { error: (err as Error).message });
        }
      });
      return originalJson(body);
    };

    captureBefore().then(() => next()).catch(() => next());
  };
}
```

- [ ] **Step 3: 运行测试确认通过**

Run: `cd packages/backend && pnpm vitest run src/middleware/audit.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/middleware/audit.ts packages/backend/src/middleware/audit.test.ts
git commit -m "feat: implement audit middleware with sensitive field redaction"
```

---

### Task 0.5: 审计日志 Service + Controller + Route

**Files:**
- Create: `packages/backend/src/services/auditService.ts`
- Create: `packages/backend/src/services/auditService.test.ts`
- Create: `packages/backend/src/controllers/auditController.ts`
- Create: `packages/backend/src/routes/auditRoutes.ts`
- Modify: `packages/backend/src/utils/appError.ts` — 添加 AUDIT_001/AUDIT_002
- Modify: `packages/backend/src/server.ts` — 注册路由

- [ ] **Step 1: appError.ts 添加审计错误码**

在 `ERROR_CODES` 和 `ERROR_MESSAGES` 中添加：

```typescript
// ERROR_CODES:
AUDIT_001: 400,
AUDIT_002: 500,

// ERROR_MESSAGES:
AUDIT_001: '审计日志查询参数无效',
AUDIT_002: '审计日志导出失败',
```

- [ ] **Step 2: 写 auditService 测试**

创建 `packages/backend/src/services/auditService.test.ts`：

```typescript
import { describe, it, expect, vi } from 'vitest';

vi.mock('../utils/prisma.js', () => ({
  prisma: {
    auditLog: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));

vi.mock('../config/env.js', () => ({
  env: { AUDIT_RETENTION_DAYS: 90 },
}));

import { prisma } from '../utils/prisma.js';
import { queryAuditLogs, exportAuditLogsCsv } from './auditService.js';

describe('auditService', () => {
  it('queryAuditLogs should apply pagination defaults', async () => {
    await queryAuditLogs({});
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 0,
        take: 20,
        orderBy: { createdAt: 'desc' },
      }),
    );
  });

  it('queryAuditLogs should clamp pageSize to 100', async () => {
    await queryAuditLogs({ page: 1, pageSize: 500 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it('exportAuditLogsCsv should return CSV string with header', async () => {
    (prisma.auditLog.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: '1', action: 'AUTH_LOGIN', resource: 'user', resourceId: null, userId: 'u1', ip: '10.0.0.*', userAgent: null, detail: null, createdAt: new Date('2026-01-01') },
    ]);
    const csv = await exportAuditLogsCsv({});
    expect(csv).toContain('id,action,resource');
    expect(csv).toContain('AUTH_LOGIN');
  });
});
```

Run: `cd packages/backend && pnpm vitest run src/services/auditService.test.ts`
Expected: FAIL (module not found)

- [ ] **Step 3: 实现 auditService**

创建 `packages/backend/src/services/auditService.ts`：

```typescript
import { prisma } from '../utils/prisma.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@remotehub/shared';
import type { AuditLogQuery } from '@remotehub/shared';
import { env } from '../config/env.js';

interface AuditLogRow {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  userId: string | null;
  ip: string | null;
  userAgent: string | null;
  detail: string | null;
  createdAt: Date;
}

function buildWhere(query: AuditLogQuery) {
  const where: Record<string, unknown> = {};
  if (query.userId) where.userId = query.userId;
  if (query.action) where.action = query.action;
  if (query.resource) where.resource = query.resource;
  if (query.startDate || query.endDate) {
    where.createdAt = {
      ...(query.startDate && { gte: new Date(query.startDate) }),
      ...(query.endDate && { lte: new Date(query.endDate) }),
    };
  }
  return where;
}

export async function queryAuditLogs(query: AuditLogQuery): Promise<{ data: AuditLogRow[]; total: number }> {
  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE));
  const where = buildWhere(query);

  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { data, total };
}

export async function exportAuditLogsCsv(query: AuditLogQuery): Promise<string> {
  const where = buildWhere(query);
  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 10000,
  });

  const header = 'id,action,resource,resourceId,userId,ip,userAgent,detail,createdAt';
  const lines = rows.map(r =>
    `${r.id},${r.action},${r.resource},${r.resourceId ?? ''},${r.userId ?? ''},${r.ip ?? ''},"${(r.userAgent ?? '').replace(/"/g, '""')}","${(r.detail ?? '').replace(/"/g, '""')}",${r.createdAt.toISOString()}`
  );
  return [header, ...lines].join('\n');
}

export async function cleanAuditLogs(): Promise<number> {
  const retentionDays = env.AUDIT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}
```

- [ ] **Step 4: 运行 auditService 测试**

Run: `cd packages/backend && pnpm vitest run src/services/auditService.test.ts`
Expected: PASS

- [ ] **Step 5: 实现 auditController**

创建 `packages/backend/src/controllers/auditController.ts`：

```typescript
import type { Request, Response } from 'express';
import { queryAuditLogs, exportAuditLogsCsv } from '../services/auditService.js';
import { createAppError } from '../utils/appError.js';

export async function getAuditLogs(req: Request, res: Response): Promise<void> {
  const { userId, action, resource, startDate, endDate, page, pageSize } = req.query as Record<string, string>;
  const { data, total } = await queryAuditLogs({
    userId, action, resource, startDate, endDate,
    page: page ? parseInt(page, 10) : undefined,
    pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
  });

  const parsedData = data.map(d => ({
    ...d,
    detail: d.detail ? JSON.parse(d.detail) : null,
    createdAt: d.createdAt.toISOString(),
  }));

  res.json({
    success: true,
    data: parsedData,
    pagination: {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 20,
      total,
    },
  });
}

export async function exportAuditLogs(req: Request, res: Response): Promise<void> {
  const { userId, action, resource, startDate, endDate } = req.query as Record<string, string>;
  const csv = await exportAuditLogsCsv({ userId, action, resource, startDate, endDate });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=audit_logs.csv');
  res.send(csv);
}
```

- [ ] **Step 6: 创建 auditRoutes**

创建 `packages/backend/src/routes/auditRoutes.ts`：

```typescript
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import * as auditController from '../controllers/auditController.js';

export const auditRoutes: RouterType = Router();

auditRoutes.get('/', authMiddleware, roleMiddleware('admin'), auditController.getAuditLogs);
auditRoutes.get('/export', authMiddleware, roleMiddleware('admin'), auditController.exportAuditLogs);
```

- [ ] **Step 7: server.ts 注册路由 + 添加 auditCleaner**

在 `server.ts` 的路由注册区域添加：

```typescript
import { auditRoutes } from './routes/auditRoutes.js';
// ...
app.use('/api/v1/audit-logs', auditRoutes);
```

创建 `packages/backend/src/utils/auditCleaner.ts`：

```typescript
import cron from 'node-cron';
import { cleanAuditLogs } from '../services/auditService.js';
import { logger } from './logger.js';

export function startAuditCleaner(): void {
  cleanAuditLogs().catch(err => logger.error('Audit cleanup failed', { error: err.message }));

  cron.schedule('30 3 * * *', () => {
    cleanAuditLogs().catch(err => logger.error('Audit cleanup failed', { error: err.message }));
  });

  logger.info('Audit cleaner scheduled (daily at 03:30)');
}
```

在 `server.ts` 启动部分添加 `startAuditCleaner()`：

```typescript
import { startAuditCleaner } from './utils/auditCleaner.js';
// ...
startAuditCleaner();
```

- [ ] **Step 8: 验证所有测试通过**

Run: `cd packages/backend && pnpm test`
Expected: 所有测试通过（含新测试）

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src/services/auditService.ts packages/backend/src/services/auditService.test.ts packages/backend/src/controllers/auditController.ts packages/backend/src/routes/auditRoutes.ts packages/backend/src/utils/appError.ts packages/backend/src/utils/auditCleaner.ts packages/backend/src/server.ts
git commit -m "feat: add audit log query/export API, service, and cleaner cron"
```

---

### Task 0.6: 审计中间件挂载到路由

**Files:**
- Modify: `packages/backend/src/routes/authRoutes.ts`
- Modify: `packages/backend/src/routes/userRoutes.ts`
- Modify: `packages/backend/src/routes/projectRoutes.ts`
- Modify: `packages/backend/src/routes/memberRoutes.ts`
- Modify: `packages/backend/src/routes/connectionRoutes.ts`

- [ ] **Step 1: authRoutes.ts 挂载审计**

在 `authRoutes.ts` 中导入并挂载：

```typescript
import { auditMiddleware } from '../middleware/audit.js';

// 在现有路由上添加 auditMiddleware
authRoutes.post('/login', auditMiddleware({ action: 'AUTH_LOGIN', resource: 'user' }), authController.login);
authRoutes.post('/register', authMiddleware, roleMiddleware('admin'), auditMiddleware({ action: 'AUTH_REGISTER', resource: 'user' }), authController.register);
authRoutes.post('/logout', authMiddleware, auditMiddleware({ action: 'AUTH_LOGOUT', resource: 'user' }), authController.logout);
authRoutes.post('/change-password', authMiddleware, auditMiddleware({ action: 'AUTH_PASSWORD_CHANGE', resource: 'user' }), authController.changePassword);
authRoutes.patch('/profile', authMiddleware, auditMiddleware({ action: 'AUTH_PROFILE_UPDATE', resource: 'user' }), authController.updateProfile);
```

- [ ] **Step 2: 类似地在 userRoutes/projectRoutes/memberRoutes/connectionRoutes 上挂载审计中间件**

每个路由文件遵循相同模式：在对应写操作上添加 `auditMiddleware({ action: '...', resource: '...' })`。参考 spec §3.5.1 的审计端点列表。

action 映射：`POST /users` → `USER_CREATE`，`PATCH /users/:id` → `USER_UPDATE`，`DELETE /users/:id` → `USER_DELETE`，以此类推。

- [ ] **Step 3: 验证所有测试通过**

Run: `cd packages/backend && pnpm test`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/routes/
git commit -m "feat: mount audit middleware on all write operation routes"
```

---

## P0-SECURITY: 安全增强（约 45 分钟）

### Task 0.7: 输入净化中间件

**Files:**
- Create: `packages/backend/src/middleware/sanitization.ts`
- Create: `packages/backend/src/middleware/sanitization.test.ts`
- Modify: `packages/backend/src/server.ts` — 全局挂载

- [ ] **Step 1: 写输入净化测试**

创建 `packages/backend/src/middleware/sanitization.test.ts`：

```typescript
import { describe, it, expect } from 'vitest';
import { sanitizeValue } from './sanitization.js';

describe('sanitizeValue', () => {
  it('should strip <script> tags', () => {
    expect(sanitizeValue('<script>alert(1)</script>hello')).toBe('hello');
  });

  it('should strip event handlers', () => {
    expect(sanitizeValue('<img onerror="alert(1)" src=x>')).toBe('<img src="x">');
  });

  it('should detect SQL injection patterns', () => {
    expect(() => sanitizeValue("'; DROP TABLE users;--")).toThrow();
  });

  it('should detect path traversal', () => {
    expect(() => sanitizeValue('../../../etc/passwd')).toThrow();
  });

  it('should detect command injection', () => {
    expect(() => sanitizeValue('hello && rm -rf /')).toThrow();
  });

  it('should not sanitize excluded fields', () => {
    // password, encryptedPass, notes are excluded
    const dangerous = "<script>alert('xss')</script>";
    expect(sanitizeValue(dangerous, true)).toBe(dangerous);
  });

  it('should pass through safe strings', () => {
    expect(sanitizeValue('Hello World 123')).toBe('Hello World 123');
  });
});
```

Run: `cd packages/backend && pnpm vitest run src/middleware/sanitization.test.ts`
Expected: FAIL

- [ ] **Step 2: 实现输入净化中间件**

创建 `packages/backend/src/middleware/sanitization.ts`：

```typescript
import type { Request, Response, NextFunction } from 'express';
import { createAppError } from '../utils/appError.js';

const XSS_PATTERN = /<script[\s\S]*?<\/script>/gi;
const EVENT_HANDLER_PATTERN = /\s+on\w+\s*=\s*["'][^"']*["']/gi;
const JAVASCRIPT_PROTOCOL = /javascript\s*:/gi;
const SQL_INJECTION = /(?:'\s*(?:OR|AND|UNION|SELECT|INSERT|UPDATE|DELETE|DROP)\b|--|\/\*|\*\*)/i;
const PATH_TRAVERSAL = /\.\.(?:\/|\\)/;
const COMMAND_INJECTION = /(?:&&|;;|`|\$\(|\b(?:rm|wget|curl)\s+-)/;

export function sanitizeValue(value: unknown, isExcluded = false): unknown {
  if (isExcluded || typeof value !== 'string') return value;

  // SQL injection check
  if (SQL_INJECTION.test(value)) {
    throw createAppError('VAL_001', [{ field: 'input', message: '输入包含不允许的字符' }]);
  }

  // Path traversal check
  if (PATH_TRAVERSAL.test(value)) {
    throw createAppError('VAL_001', [{ field: 'input', message: '输入包含不允许的字符' }]);
  }

  // Command injection check
  if (COMMAND_INJECTION.test(value)) {
    throw createAppError('VAL_001', [{ field: 'input', message: '输入包含不允许的字符' }]);
  }

  // XSS sanitization (strip, not reject)
  let result = value;
  result = result.replace(XSS_PATTERN, '');
  result = result.replace(EVENT_HANDLER_PATTERN, '');
  result = result.replace(JAVASCRIPT_PROTOCOL, '');

  return result;
}

const EXCLUDED_FIELDS = new Set(['password', 'encryptedPass', 'notes']);

function sanitizeObject(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeValue(obj);
  if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item));
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const isExcluded = EXCLUDED_FIELDS.has(key);
      if (typeof value === 'string') {
        result[key] = sanitizeValue(value, isExcluded);
      } else {
        result[key] = sanitizeObject(value);
      }
    }
    return result;
  }
  return obj;
}

export function sanitizationMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    req.body = sanitizeObject(req.body);
    req.query = sanitizeObject(req.query) as Record<string, unknown>;
    next();
  } catch (err) {
    next(err);
  }
}
```

- [ ] **Step 3: 运行测试**

Run: `cd packages/backend && pnpm vitest run src/middleware/sanitization.test.ts`
Expected: PASS

- [ ] **Step 4: server.ts 全局挂载**

在 `server.ts` 的 `cookieParser()` 之后、`helmet()` 之前添加：

```typescript
import { sanitizationMiddleware } from './middleware/sanitization.js';
// ...
app.use(sanitizationMiddleware);
```

- [ ] **Step 5: 验证所有测试通过**

Run: `cd packages/backend && pnpm test`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/middleware/sanitization.ts packages/backend/src/middleware/sanitization.test.ts packages/backend/src/server.ts
git commit -m "feat: add input sanitization middleware (XSS/SQL/path/command injection)"
```

---

### Task 0.8: IP 风险检测 + env.ts 新变量

**Files:**
- Create: `packages/backend/src/utils/ipMonitor.ts`
- Create: `packages/backend/src/utils/ipMonitor.test.ts`
- Modify: `packages/backend/src/config/env.ts`

- [ ] **Step 1: env.ts 添加 AUDIT_RETENTION_DAYS**

在 `packages/backend/src/config/env.ts` 中添加：

```typescript
AUDIT_RETENTION_DAYS: parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10),
```

- [ ] **Step 2: 实现 IP 风险检测**

创建 `packages/backend/src/utils/ipMonitor.ts`：

```typescript
import { prisma } from './prisma.js';
import { logger } from './logger.js';

const IP_WINDOW_MS = 60_000;
const IP_THRESHOLD = 1000;
const ipCounts = new Map<string, { count: number; resetAt: number }>();

export function checkIpRisk(ip: string | undefined): void {
  if (!ip) return;

  const now = Date.now();
  const record = ipCounts.get(ip);

  if (!record || now > record.resetAt) {
    ipCounts.set(ip, { count: 1, resetAt: now + IP_WINDOW_MS });
    return;
  }

  record.count++;
  if (record.count > IP_THRESHOLD) {
    logger.warn('Suspicious IP detected', { ip, requestCount: record.count });
    prisma.auditLog.create({
      data: {
        action: 'SECURITY_SUSPICIOUS_IP',
        resource: 'security',
        detail: JSON.stringify({ requestCount: record.count, window: '1min' }),
        ip,
      },
    }).catch(err => logger.error('Failed to log suspicious IP', { error: err.message }));
  }
}
```

- [ ] **Step 3: server.ts 集成 IP 检测**

在 server.ts 的路由注册之前添加中间件：

```typescript
import { checkIpRisk } from './utils/ipMonitor.js';
// ...
app.use((req, _res, next) => { checkIpRisk(req.ip); next(); });
```

- [ ] **Step 4: 验证所有测试通过**

Run: `cd packages/backend && pnpm test`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/utils/ipMonitor.ts packages/backend/src/config/env.ts packages/backend/src/server.ts
git commit -m "feat: add IP risk detection with per-IP request counting"
```

---

## P0-MONITOR: 系统监控（约 45 分钟）

### Task 0.9: 健康检查扩展 + 性能监控中间件

**Files:**
- Modify: `packages/backend/src/routes/healthRoutes.ts`
- Create: `packages/backend/src/services/performanceMonitor.ts`
- Create: `packages/backend/src/services/monitoringService.ts`
- Create: `packages/backend/src/services/monitoringService.test.ts`
- Create: `packages/backend/src/controllers/monitoringController.ts`
- Create: `packages/backend/src/routes/monitoringRoutes.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: 扩展健康检查**

修改 `healthRoutes.ts`，将现有的简单响应扩展为结构化格式：

```typescript
import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import os from 'node:os';

export const healthRoutes = Router();

healthRoutes.get('/', async (_req, res) => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const memoryUsage = Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10;

  let dbStatus = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = false;
  }

  res.json({
    success: true,
    data: {
      status: dbStatus ? 'healthy' : 'degraded',
      database: dbStatus,
      memoryUsage,
      uptime: process.uptime(),
    },
  });
});
```

- [ ] **Step 2: 实现性能监控环形缓冲区**

创建 `packages/backend/src/services/performanceMonitor.ts`：

```typescript
import type { Request, Response, NextFunction } from 'express';

interface PerfEntry {
  method: string;
  path: string;
  duration: number;
  status: number;
  timestamp: number;
}

const BUFFER_SIZE = 10000;
const buffer: PerfEntry[] = [];

function addEntry(entry: PerfEntry): void {
  if (buffer.length >= BUFFER_SIZE) {
    buffer.shift();
  }
  buffer.push(entry);
}

export function performanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    addEntry({
      method: req.method,
      path: req.path,
      duration: Date.now() - start,
      status: res.statusCode,
      timestamp: start,
    });
  });
  next();
}

export function getPerformanceStats(): {
  p50: number; p95: number; p99: number; totalRequests: number;
} {
  if (buffer.length === 0) return { p50: 0, p95: 0, p99: 0, totalRequests: 0 };
  const durations = buffer.map(e => e.duration).sort((a, b) => a - b);
  return {
    p50: durations[Math.floor(durations.length * 0.5)] ?? 0,
    p95: durations[Math.floor(durations.length * 0.95)] ?? 0,
    p99: durations[Math.floor(durations.length * 0.99)] ?? 0,
    totalRequests: buffer.length,
  };
}
```

- [ ] **Step 3: 实现 monitoringService + monitoringController + monitoringRoutes**

创建 `packages/backend/src/services/monitoringService.ts`：

```typescript
import { prisma } from '../utils/prisma.js';
import os from 'node:os';

export async function getDashboardData() {
  const [totalUsers, totalProjects, totalConnections, onlineSessions] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.connection.count(),
    prisma.session.count({
      where: { consumedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);

  const totalMem = os.totalmem();
  const freeMem = os.freemem();

  return {
    health: {
      status: 'healthy',
      database: true,
      diskUsage: 0,
      memoryUsage: Math.round(((totalMem - freeMem) / totalMem) * 1000) / 10,
    },
    onlineUsers: onlineSessions,
    stats: { totalProjects, totalConnections, totalUsers },
  };
}
```

创建 `packages/backend/src/controllers/monitoringController.ts` 和 `packages/backend/src/routes/monitoringRoutes.ts`（遵循一期 controller/route 模式）。

- [ ] **Step 4: server.ts 注册监控路由 + 挂载性能中间件**

在路由注册前添加全局性能中间件，注册 `/api/v1/admin/dashboard`、`/api/v1/admin/stats/*` 路由。

- [ ] **Step 5: 验证所有测试通过**

Run: `cd packages/backend && pnpm test`
Expected: 所有测试通过

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/
git commit -m "feat: add system monitoring dashboard, health check extension, performance middleware"
```

---

### Task 0.10: P0 收尾 — 端到端验证

- [ ] **Step 1: 全量测试**

Run: `cd packages/backend && pnpm test`
Expected: 所有测试通过

- [ ] **Step 2: 启动服务验证 API**

```bash
cd packages/backend && npx tsx src/server.ts &
# 健康检查
curl http://localhost:3001/api/v1/health
# 审计日志（需登录获取 token 后）
# 登录
curl -X POST http://localhost:3001/api/v1/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"Admin123"}'
# 用返回的 accessToken 查询审计日志
curl http://localhost:3001/api/v1/audit-logs -H "Authorization: Bearer <token>"
# 监控仪表盘
curl http://localhost:3001/api/v1/admin/dashboard -H "Authorization: Bearer <token>"
```

Expected: 所有 API 返回 `{ success: true }` 格式

- [ ] **Step 3: 最终 P0 Commit**

```bash
git add -A
git commit -m "feat: complete P0 — audit logging, security enhancement, system monitoring"
```

---

> **P0 实施计划完成。** 包含 10 个 Task，预估总时长约 3.5 小时。

---

## P1-SERVER: server.ts 重构（约 30 分钟）

### Task 1.1: createServer 重构 + helmet CSP + graceful shutdown

**Files:**
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: 重构 server.ts 启动方式**

将 `app.listen()` 替换为 `http.createServer` + `server.listen`：

```typescript
import { createServer } from 'http';

// 替换末尾的 app.listen
const server = createServer(app);

startSessionCleaner();
startAuditCleaner();

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} (${env.NODE_ENV})`);
  });
}

// Graceful shutdown
function gracefulShutdown() {
  logger.info('Shutting down gracefully');
  server.close();
  prisma.$disconnect().then(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000);
}
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export { app, server };
```

- [ ] **Step 2: helmet CSP 添加 connectSrc**

修改 helmet 配置，在 directives 中添加：

```typescript
connectSrc: ["'self'"],
```

- [ ] **Step 3: 安装 ws 依赖**

```bash
cd packages/backend && pnpm add ws && pnpm add -D @types/ws
```

- [ ] **Step 4: 验证测试通过**

Run: `cd packages/backend && pnpm test`
Expected: 所有测试通过

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/server.ts packages/backend/package.json pnpm-lock.yaml
git commit -m "refactor: createServer pattern, helmet CSP for WebSocket, graceful shutdown"
```

---

## P1-BACKUP: 数据备份（约 60 分钟）

### Task 1.2: Prisma Schema 添加 PasswordResetToken + env 配置

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Modify: `packages/backend/src/config/env.ts`
- Modify: `packages/backend/.env`

- [ ] **Step 1: schema.prisma 添加 PasswordResetToken**

在 User 模型中添加 `resetTokens PasswordResetToken[]`，末尾添加：

```prisma
model PasswordResetToken {
  id          String    @id @default(uuid())
  userId      String    @map("user_id")
  tokenHash   String    @unique @map("token_hash")
  expiresAt   DateTime  @map("expires_at")
  usedAt      DateTime? @map("used_at")
  ip          String?   @db.VarChar(45)
  userAgent   String?   @db.VarChar(500) @map("user_agent")
  createdAt   DateTime  @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("password_reset_tokens")
}
```

- [ ] **Step 2: env.ts 添加 P1 环境变量**

```typescript
BACKUP_CRON: process.env.BACKUP_CRON || '0 2 * * *',
BACKUP_RETENTION_DAYS: parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10),
BACKUP_DIR: process.env.BACKUP_DIR || '/data/backups',
PASSWORD_RESET_TOKEN_EXPIRES_HOURS: parseInt(process.env.PASSWORD_RESET_TOKEN_EXPIRES_HOURS || '1', 10),
PASSWORD_RESET_MAX_PER_USER: parseInt(process.env.PASSWORD_RESET_MAX_PER_USER || '3', 10),
RATE_LIMIT_BACKUP_MAX: parseInt(process.env.RATE_LIMIT_BACKUP_MAX || '5', 10),
RATE_LIMIT_RESTORE_MAX: parseInt(process.env.RATE_LIMIT_RESTORE_MAX || '2', 10),
RATE_LIMIT_FORGOT_PASSWORD_MAX: parseInt(process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX || '3', 10),
```

- [ ] **Step 3: 生成迁移**

```bash
cd packages/backend && npx prisma migrate dev --name add_password_reset_token
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/prisma/ packages/backend/src/config/env.ts
git commit -m "feat: add PasswordResetToken model, P1 env vars"
```

---

### Task 1.3: 备份 Service + Controller + Route

**Files:**
- Create: `packages/backend/src/services/backupService.ts`
- Create: `packages/backend/src/services/backupService.test.ts`
- Create: `packages/backend/src/controllers/backupController.ts`
- Create: `packages/backend/src/routes/backupRoutes.ts`
- Create: `packages/backend/src/utils/backupCleaner.ts`
- Modify: `packages/backend/src/utils/appError.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: appError.ts 添加备份错误码**

```typescript
BACKUP_001: 409, BACKUP_002: 404, BACKUP_003: 400,
BACKUP_004: 507, BACKUP_005: 400, BACKUP_006: 500,

BACKUP_001: '备份正在进行中，请勿重复触发',
BACKUP_002: '备份文件不存在',
BACKUP_003: '备份文件校验失败（MD5 不匹配）',
BACKUP_004: '磁盘空间不足，无法执行备份',
BACKUP_005: '恢复操作需要二次确认',
BACKUP_006: '恢复前快照创建失败',
```

- [ ] **Step 2: 实现 backupService**

核心逻辑：
- `listBackups()`: 读取 `backup_manifest.json`，不存在则创建空文件
- `createBackup(type)`: 检查 isBackupRunning 标志 → 执行 `mysqldump --single-transaction` → gzip → 计算 MD5 → 写入 manifest（原子写入：先写 `.tmp` 再 `rename`）
- `downloadBackup(id)`: 从 manifest 找到文件路径 → 流式返回
- `deleteBackup(id)`: 从 manifest 移除 → 删除文件
- `restoreBackup(id, confirm)`: 验证 confirm → 创建 pre_restore 快照 → 执行 `mysql < backup.sql`
- `cleanOldBackups()`: 删除超过 BACKUP_RETENTION_DAYS 的自动备份

测试使用 mock `child_process.execSync` 和 `fs` 模块。

- [ ] **Step 3: 创建 backupController + backupRoutes**

路由使用 `authMiddleware + roleMiddleware('admin')` 保护。手动备份添加速率限制中间件。

- [ ] **Step 4: 创建 backupCleaner + server.ts 集成**

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/services/backupService.ts packages/backend/src/services/backupService.test.ts packages/backend/src/controllers/backupController.ts packages/backend/src/routes/backupRoutes.ts packages/backend/src/utils/backupCleaner.ts packages/backend/src/utils/appError.ts packages/backend/src/server.ts
git commit -m "feat: add backup service with mysqldump, manifest, cleaner"
```

---

## P1-WS: WebSocket 实时通知（约 75 分钟）

### Task 1.4: Prisma Schema 添加 NotificationQueue + shared 类型

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Modify: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/enums.ts`

- [ ] **Step 1: schema.prisma 添加 NotificationQueue**

在 User 模型添加 `notifications NotificationQueue[]`，末尾添加：

```prisma
model NotificationQueue {
  id         String   @id @default(uuid())
  userId     String   @map("user_id")
  type       String   @db.VarChar(50)
  payload    String
  isRead     Boolean  @default(false) @map("is_read")
  createdAt  DateTime @default(now()) @map("created_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@index([createdAt])
  @@map("notification_queue")
}
```

- [ ] **Step 2: shared 包添加 WS 和 Notification 类型**

`enums.ts`:

```typescript
export const WS_MESSAGE_TYPES = [
  'auth', 'connection_updated', 'member_added', 'member_removed',
  'member_role_updated', 'system_alert', 'force_logout', 'reconnect_required',
] as const;
export type WSMessageType = typeof WS_MESSAGE_TYPES[number];
```

`types.ts`:

```typescript
export interface WSMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

export interface Notification {
  id: string;
  type: string;
  payload: string;
  isRead: boolean;
  createdAt: string;
}
```

- [ ] **Step 3: 生成迁移 + 构建 shared**

```bash
cd packages/backend && npx prisma migrate dev --name add_notification_queue
cd packages/shared && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add packages/backend/prisma/ packages/shared/src/
git commit -m "feat: add NotificationQueue model, WS/Notification shared types"
```

---

### Task 1.5: WebSocket Service + 通知 Service

**Files:**
- Create: `packages/backend/src/services/wsService.ts`
- Create: `packages/backend/src/services/wsService.test.ts`
- Create: `packages/backend/src/services/notificationService.ts`
- Create: `packages/backend/src/utils/notificationCleaner.ts`

- [ ] **Step 1: 实现 wsService**

核心类 `WebSocketManager`：
- `init(server)`: 在 `server.on('upgrade')` 中处理 WS 升级
- `handleConnection(ws, req)`: 设置 10s 认证超时
- `handleAuth(ws, token)`: JWT 验证 → 加入用户房间
- `broadcastToProject(projectId, message)`: 向项目房间所有成员推送
- `sendToUser(userId, message)`: 向特定用户推送
- `handleForceLogout(userId)`: 推送 force_logout 并关闭连接

测试：mock WebSocket、JWT 验证，验证房间加入/离开/广播逻辑。

- [ ] **Step 2: 实现 notificationService**

- `getUnreadNotifications(userId)`: 查询 `isRead = false`
- `markAsRead(notificationId, userId)`: 设置 `isRead = true`
- `createNotification(userId, type, payload)`: 插入记录 + 实时推送

- [ ] **Step 3: 实现 notificationCleaner**

每日 04:00 清理已读超过 7 天的通知。

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/services/wsService.ts packages/backend/src/services/wsService.test.ts packages/backend/src/services/notificationService.ts packages/backend/src/utils/notificationCleaner.ts
git commit -m "feat: add WebSocket manager, notification service, cleaner"
```

---

### Task 1.6: WS + 通知 Controller/Route + server.ts 集成

**Files:**
- Create: `packages/backend/src/controllers/notificationController.ts`
- Create: `packages/backend/src/routes/notificationRoutes.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: 创建通知 Controller + Route**

`GET /api/v1/notifications` + `PATCH /api/v1/notifications/:id/read`

- [ ] **Step 2: server.ts 初始化 WebSocketManager**

在 `createServer` 之后：

```typescript
import { wsManager } from './services/wsService.js';
wsManager.init(server);
```

- [ ] **Step 3: 验证所有测试通过**

Run: `cd packages/backend && pnpm test`
Expected: 所有测试通过

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/controllers/notificationController.ts packages/backend/src/routes/notificationRoutes.ts packages/backend/src/server.ts
git commit -m "feat: add notification API, integrate WebSocket into server"
```

---

## P1-RESET: 密码重置（约 30 分钟）

### Task 1.7: 密码重置 Service + Controller + Route

**Files:**
- Create: `packages/backend/src/services/passwordResetService.ts`
- Create: `packages/backend/src/services/passwordResetService.test.ts`
- Create: `packages/backend/src/controllers/passwordResetController.ts`
- Create: `packages/backend/src/routes/passwordResetRoutes.ts`
- Modify: `packages/backend/src/utils/appError.ts`
- Modify: `packages/backend/src/server.ts`

- [ ] **Step 1: appError.ts 添加重置错误码**

```typescript
RESET_001: 400, RESET_002: 429, RESET_003: 409,

RESET_001: '密码重置 token 无效或已过期',
RESET_002: '密码重置请求过于频繁',
RESET_003: '重置 token 已达上限',
```

- [ ] **Step 2: 实现 passwordResetService**

- `requestReset(username, ip, userAgent)`: 查找用户 → 检查 24h 内请求次数 → 检查有效 token 数 → 生成 256-bit token → SHA-256 哈希存储
- `resetPassword(token, newPassword)`: 查找 token → 验证过期 → 更新密码 → 删除用户所有 Session

测试：覆盖正常流程、token 过期、已达上限、用户不存在（统一成功响应）。

- [ ] **Step 3: 创建 Controller + Route**

`POST /api/v1/auth/forgot-password` + `POST /api/v1/auth/reset-password`

forgot-password 添加速率限制 `rateLimit({ windowMs: 3600000, limit: env.RATE_LIMIT_FORGOT_PASSWORD_MAX })`

- [ ] **Step 4: server.ts 注册路由**

- [ ] **Step 5: 验证所有测试通过**

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/services/passwordResetService.ts packages/backend/src/services/passwordResetService.test.ts packages/backend/src/controllers/passwordResetController.ts packages/backend/src/routes/passwordResetRoutes.ts packages/backend/src/utils/appError.ts packages/backend/src/server.ts
git commit -m "feat: add password reset flow with rate limiting"
```

---

### Task 1.8: P1 收尾 — 端到端验证

- [ ] **Step 1: 全量测试**

Run: `cd packages/backend && pnpm test`

- [ ] **Step 2: Docker Compose 更新（如需）**

修改 `docker-compose.yml` 添加 `backup-data` 卷。

- [ ] **Step 3: 最终 P1 Commit**

```bash
git add -A
git commit -m "feat: complete P1 — backup, WebSocket, password reset, notifications"
```

---

> **P0 + P1 实施计划完成。** P0: 10 Tasks ~3.5h, P1: 8 Tasks ~3.5h。

---

## P2-SCHEMA: Schema 扩展（约 15 分钟）

### Task 2.1: User 添加 2FA 字段 + Project 添加 status 字段

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Modify: `packages/backend/src/config/env.ts`
- Modify: `packages/shared/src/enums.ts`
- Modify: `packages/shared/src/types.ts`

- [ ] **Step 1: schema.prisma User 添加 2FA 字段**

```prisma
  twoFactorSecret String? @map("two_factor_secret")
  twoFactorEnabled Boolean @default(false) @map("two_factor_enabled")
```

- [ ] **Step 2: schema.prisma Project 添加 status 字段**

```prisma
  status    String  @default("active") @db.VarChar(20)

  @@index([status])
```

- [ ] **Step 3: shared 添加枚举和类型**

`enums.ts`:
```typescript
export const PROJECT_STATUSES = ['active', 'archived'] as const;
export type ProjectStatus = typeof PROJECT_STATUSES[number];
```

`types.ts`:
```typescript
export interface ImportResult {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; reason: string }>;
}
```

- [ ] **Step 4: env.ts 添加 P2 环境变量**

```typescript
IMPORT_MAX_SIZE_JSON: parseInt(process.env.IMPORT_MAX_SIZE_JSON || '52428800', 10),
IMPORT_MAX_SIZE_CSV: parseInt(process.env.IMPORT_MAX_SIZE_CSV || '20971520', 10),
RATE_LIMIT_EXPORT_MAX: parseInt(process.env.RATE_LIMIT_EXPORT_MAX || '3', 10),
RATE_LIMIT_IMPORT_MAX: parseInt(process.env.RATE_LIMIT_IMPORT_MAX || '5', 10),
```

- [ ] **Step 5: 生成迁移 + 构建**

```bash
cd packages/backend && npx prisma migrate dev --name add_2fa_and_project_status
cd packages/shared && pnpm build
```

- [ ] **Step 6: Commit**

```bash
git add packages/backend/prisma/ packages/backend/src/config/env.ts packages/shared/src/
git commit -m "feat: add 2FA fields, project status, P2 env vars"
```

---

## P2-IMPORT: 数据导入导出（约 45 分钟）

### Task 2.2: 导入导出 Service + Controller + Route

**Files:**
- Create: `packages/backend/src/services/importExportService.ts`
- Create: `packages/backend/src/services/importExportService.test.ts`
- Create: `packages/backend/src/controllers/importExportController.ts`
- Create: `packages/backend/src/routes/importExportRoutes.ts`
- Modify: `packages/backend/src/utils/appError.ts`

- [ ] **Step 1: appError.ts 添加导入错误码**

```typescript
IMPORT_001: 400, IMPORT_002: 413, IMPORT_003: 422,

IMPORT_001: '导入文件格式无效',
IMPORT_002: '导入文件超过大小限制',
IMPORT_003: '导入数据验证失败',
```

- [ ] **Step 2: 实现 importExportService**

核心逻辑：
- `exportProject(projectId)`: 查询项目+成员+连接 → 构建完整 JSON 对象（加密密码保留）
- `exportAll()`: 全部项目+连接导出
- `exportConnectionsCsv(projectId)`: 连接列表 → CSV 字符串（列: name,host,port,protocol,vpnType,notes,tags,username）
- `importToProject(projectId, data, mode)`: 验证数据格式 → 逐条创建连接（验证+去重）→ 返回 ImportResult
- `importAll(data, mode, confirm)`: merge 模式追加，overwrite 模式先清空再导入

测试：覆盖 JSON 导出、CSV 导出（tags 逗号处理）、导入验证、merge/overwrite 模式。

- [ ] **Step 3: 创建 Controller + Route**

路由：
- `GET /api/v1/projects/:id/export` (owner/editor/admin)
- `GET /api/v1/admin/export/all` (admin)
- `GET /api/v1/connections/export` (认证用户)
- `POST /api/v1/projects/:id/import` (owner/editor/admin, 路由级 `express.json({ limit: '50mb' })`)
- `POST /api/v1/admin/import` (admin)

导入端点使用路由级 body size 限制覆盖全局 1MB。

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/services/importExportService.ts packages/backend/src/services/importExportService.test.ts packages/backend/src/controllers/importExportController.ts packages/backend/src/routes/importExportRoutes.ts packages/backend/src/utils/appError.ts
git commit -m "feat: add data import/export service (JSON + CSV)"
```

---

## P2-PROJECT: 项目管理增强（约 45 分钟）

### Task 2.3: 项目增强 Service + Controller + Route

**Files:**
- Create: `packages/backend/src/services/projectEnhanceService.ts`
- Create: `packages/backend/src/services/projectEnhanceService.test.ts`
- Create: `packages/backend/src/controllers/projectEnhanceController.ts`
- Create: `packages/backend/src/routes/projectEnhanceRoutes.ts`

- [ ] **Step 1: 实现 projectEnhanceService**

核心逻辑：
- `duplicateProject(projectId, userId)`: 事务内深拷贝项目+所有连接，调用者为 owner
- `archiveProject(projectId)`: 设置 status = 'archived'
- `activateProject(projectId)`: 设置 status = 'active'
- `batchAddMembers(projectId, members[])`: 事务内批量添加（跳过已存在），max 50
- `leaveProject(projectId, userId)`: editor/viewer 自行退出，检查 owner 不能离开
- `transferOwnership(projectId, currentOwnerId, newOwnerId)`: 事务内角色交换

测试：覆盖复制（连接深拷贝验证）、归档/激活、批量添加上限、转让事务原子性。

- [ ] **Step 2: 创建 Controller + Route**

路由注册在 `projects/:id/` 下：
- `POST /duplicate`, `PATCH /archive`, `PATCH /activate`
- `POST /members/batch`, `POST /leave`, `PATCH /transfer-ownership`

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/services/projectEnhanceService.ts packages/backend/src/services/projectEnhanceService.test.ts packages/backend/src/controllers/projectEnhanceController.ts packages/backend/src/routes/projectEnhanceRoutes.ts
git commit -m "feat: add project management enhancement (duplicate, archive, batch, transfer)"
```

---

## P2-2FA: 双因素认证（约 45 分钟）

### Task 2.4: 2FA Service + Controller + Route

**Files:**
- Create: `packages/backend/src/services/twoFactorService.ts`
- Create: `packages/backend/src/services/twoFactorService.test.ts`
- Create: `packages/backend/src/controllers/twoFactorController.ts`
- Create: `packages/backend/src/routes/twoFactorRoutes.ts`
- Modify: `packages/backend/src/utils/appError.ts`
- Modify: `packages/backend/src/services/authService.ts` — 登录返回 require2FA

- [ ] **Step 1: 安装 otpauth**

```bash
cd packages/backend && pnpm add otpauth
```

- [ ] **Step 2: appError.ts 添加 2FA 错误码**

```typescript
TFA_001: 400, TFA_002: 403, TFA_003: 409,

TFA_001: '2FA 验证码错误',
TFA_002: '2FA 未启用',
TFA_003: '2FA 已启用',
```

- [ ] **Step 3: 实现 twoFactorService**

核心逻辑：
- `enable2FA(userId, password)`: 验证密码 → 生成 TOTP secret（加密存储）→ 返回 otpauth:// URI
- `verify2FASetup(userId, code)`: 验证 TOTP 码 → 设置 twoFactorEnabled = true
- `disable2FA(userId, password, code)`: 验证密码+码 → 清除 secret + twoFactorEnabled = false
- `verify2FALogin(tempToken, code)`: 验证 tempToken（Session 表）→ 验证 TOTP 码 → 签发正式 token

tempToken 实现：复用 Session 表，SHA-256 哈希存储，5 分钟过期，consumedAt 标记验证完成。

- [ ] **Step 4: 修改 authService.login**

登录时若 `user.twoFactorEnabled`：
1. 创建 tempToken session（5 分钟过期）
2. 返回 `{ require2FA: true, tempToken }` 而非正式 token

- [ ] **Step 5: 创建 Controller + Route**

```
POST /api/v1/auth/2fa/enable    (authMiddleware)
POST /api/v1/auth/2fa/verify    (authMiddleware)
POST /api/v1/auth/2fa/disable   (authMiddleware)
POST /api/v1/auth/2fa/login     (公开, 携带 tempToken)
```

- [ ] **Step 6: 验证所有测试通过**

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/services/twoFactorService.ts packages/backend/src/services/twoFactorService.test.ts packages/backend/src/controllers/twoFactorController.ts packages/backend/src/routes/twoFactorRoutes.ts packages/backend/src/utils/appError.ts packages/backend/src/services/authService.ts packages/backend/package.json
git commit -m "feat: add TOTP 2FA with tempToken session reuse"
```

---

## P2-K8S: K8s 探针（约 15 分钟）

### Task 2.5: K8s 健康探针

**Files:**
- Modify: `packages/backend/src/routes/healthRoutes.ts`

- [ ] **Step 1: 添加三个探针端点**

```typescript
// Liveness: 进程存活
healthRoutes.get('/live', (_req, res) => {
  res.json({ success: true, data: { status: 'alive' } });
});

// Readiness: 可接受流量
healthRoutes.get('/ready', async (_req, res) => {
  let dbOk = true;
  try { await prisma.$queryRaw`SELECT 1`; } catch { dbOk = false; }
  res.json({ success: true, data: { status: dbOk ? 'ready' : 'not_ready', database: dbOk } });
});

// Startup: 初始化完成
healthRoutes.get('/startup', async (_req, res) => {
  const adminExists = await prisma.user.findFirst({ where: { role: 'admin' } });
  res.json({ success: true, data: { status: adminExists ? 'started' : 'initializing' } });
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/backend/src/routes/healthRoutes.ts
git commit -m "feat: add K8s liveness/readiness/startup probes"
```

---

## P2-SWAGGER: Swagger 文档（约 20 分钟）

### Task 2.6: Swagger 集成（待验证 Express 5 兼容性）

**Files:**
- Create: `packages/backend/src/routes/docsRoutes.ts`
- Modify: `packages/backend/src/server.ts`
- Modify: `packages/backend/package.json`

- [ ] **Step 1: 安装依赖**

```bash
cd packages/backend && pnpm add swagger-jsdoc swagger-ui-express
```

- [ ] **Step 2: 验证 Express 5 兼容性**

在测试环境启动后访问 `/api/v1/docs`，确认 UI 正常渲染。若不兼容，改用静态 `openapi.yaml` + `swagger-ui-dist`。

- [ ] **Step 3: 创建 docsRoutes（仅非生产）**

```typescript
import { Router } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

export const docsRoutes = Router();

if (process.env.NODE_ENV !== 'production') {
  const specs = swaggerJsdoc({
    definition: { openapi: '3.0.0', info: { title: 'RemoteHub API', version: '2.0.0' } },
    apis: ['src/routes/*.ts'],
  });
  docsRoutes.use('/', swaggerUi.serve, swaggerUi.setup(specs));
  docsRoutes.get('/swagger.json', (_req, res) => res.json(specs));
}
```

- [ ] **Step 4: server.ts 注册（仅非生产）**

```typescript
if (env.NODE_ENV !== 'production') {
  import('./routes/docsRoutes.js').then(({ docsRoutes }) => {
    app.use('/api/v1/docs', docsRoutes);
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/routes/docsRoutes.ts packages/backend/src/server.ts packages/backend/package.json
git commit -m "feat: add Swagger/OpenAPI docs (dev only)"
```

---

### Task 2.7: P2 收尾 — 全量验证

- [ ] **Step 1: 全量测试**

Run: `cd packages/backend && pnpm test`
Expected: 所有测试通过

- [ ] **Step 2: 启动服务端到端验证**

手动测试关键 API：导入导出、项目复制/归档、2FA 启用/验证/登录、K8s 探针、Swagger UI。

- [ ] **Step 3: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete P2 — import/export, project enhancement, 2FA, K8s probes, Swagger"
```

---

## 实施计划总览

| 阶段 | Task 数 | 预估时长 | 核心内容 |
|------|---------|---------|---------|
| P0-PREREQ | 1 | 30min | dotenv + 连接池 + 日志格式 |
| P0-AUDIT | 5 | ~2.5h | Schema + shared + 中间件 + Service/Route + 挂载 |
| P0-SECURITY | 2 | ~45min | 输入净化 + IP 检测 |
| P0-MONITOR | 2 | ~45min | 健康检查扩展 + 性能监控 + 仪表盘 |
| P1-SERVER | 1 | 30min | createServer 重构 + graceful shutdown |
| P1-BACKUP | 2 | ~60min | Schema + 备份 Service/Route/Cleaner |
| P1-WS | 3 | ~75min | Schema + WS Service + 通知 API |
| P1-RESET | 2 | ~30min | 密码重置 Service + Route |
| P2-SCHEMA | 1 | 15min | 2FA + status 字段 |
| P2-IMPORT | 1 | 45min | 导入导出 |
| P2-PROJECT | 1 | 45min | 项目增强 |
| P2-2FA | 1 | 45min | TOTP 双因素 |
| P2-K8S | 1 | 15min | 探针 |
| P2-SWAGGER | 1 | 20min | Swagger |
| **Total** | **25** | **~10h** | |

每个 Task 可独立测试、可回滚到上一个 Commit、可追踪进度。

---

## 修订说明（2026-06-24 审计）

基于代码审查发现（详见 `docs/superpowers/specs/2026-06-24-remotehub-audit.md` 附录 A），对原 plan 的以下 Task 做修正：

### Task 0.1 dotenv 前置核实
原 plan 断言"tsx watch 不自动加载 .env"。**先核实 `config/env.ts` 现状**：env.ts 用 `process.env.X || 'default'` 读取，一期已能跑（145 测试 + Docker 部署），说明 env 加载已 work（dev 脚本可能用 `--env-file` 或 tsx 内置）。**修改**：Task 0.1 先核实 env.ts，若已 work 则不加 dotenv（避免冗余/冲突）；只在确认 env 未加载时加 `import 'dotenv/config'`。

### Task 0.4 审计中间件对齐 design
原 plan 用 `getBeforeSnapshot` 回调注入 before 快照（默认不传则不取）。**修改**：对齐 design §3.5.2 自治模式——中间件内根据 `req.params.id` + resource 类型自动 `prisma.<model>.findUnique` 取 before 快照，无需每个路由传回调。减少挂载点遗漏风险。

### Task 0.5 auditCleaner 启动行为
原 plan Task 0.5 Step 7 的 auditCleaner 在启动时立即 `cleanAuditLogs()`。**修改**：移除启动时立即执行，仅保留每日 03:30 cron（design §3.5.3 只要求定时）。启动即删日志不符合预期，且首次启动可能误删。

### §19 前端章节 blocked
phase2-design §19（二期前端页面设计）标注为 **blocked**，直到前端迁移子项目（Task 0.0.5）完成。前端迁移是 phase2 硬前置（design §23），当前 0% 且无 spec。§19 相关前端工作不得在迁移完成前启动。

### 新增 P0-TEST：集成测试基建
原 plan 缺集成测试基建 Task（design §20.2/§24.2 要求 supertest + 测试库 + globalSetup，plan 无对应 Task）。**新增 P0-TEST Task**：装 `supertest` + `@types/supertest`、用临时 SQLite 测试库 `file:./test.db`（切 SQLite 后无需独立 DB 服务，见收尾 spec §1 + phase2 design §20.2）、`tests/globalSetup.ts`（prisma db push --force-reset + seed）、清理策略（逆序 deleteMany）。与 Task 0.0.4（补 service 单测）协同——单元测试先补，集成测试基建在 P0 收尾建。

### 代码审查发现纳入
phase2 实施时一并修代码审查 HIGH 项（见附录 A.2）：默认 admin 密码改 requireEnv、trust proxy 改单跳/ CIDR、VPN 循环深度≥10 抛 CONN_003、protocol≠VPN 强制 vpn 字段 null、并发 refresh 校验 expiresAt、VPN 目标不存在返回 CONN_002、404 兜底加 SYS_002、controller 输入验证+白名单、内存 Map 加淘汰、server.ts 拆 app.ts 消除副作用。
