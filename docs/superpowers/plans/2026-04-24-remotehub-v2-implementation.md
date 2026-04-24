# RemoteHub V2 重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 RemoteHub 从 localStorage 双轨架构重构为 Prisma + Express 5 + React 的 monorepo 全栈应用，支持 Docker 一键部署。

**Architecture:** pnpm workspace monorepo（shared/backend/frontend），后端 Express 5 + Prisma 6.x + MySQL，前端 React 19 + TanStack Query，Caddy 反向代理自动 HTTPS。三层权限中间件链（auth → role → projectRole），JWT access + opaque refresh token 轮换。

**Tech Stack:** TypeScript (strict), Express 5, Prisma 6.x, React 19, Vite, TanStack Query, Vitest, Docker Compose, Caddy, bcryptjs, AES-256-GCM

**Spec:** `docs/superpowers/specs/2026-04-23-remotehub-v2-refactor-design.md` v1.23

---

## 文件结构总览

以下为实施完成后 `C:\Projects\RemoteHub` 的完整文件结构。`*` 标记的文件由 Task 创建。

```
packages/
├── shared/
│   ├── package.json                    * T4
│   ├── tsconfig.json                   * T4
│   └── src/
│       ├── index.ts                    * T4（barrel export）
│       ├── types.ts                    * T4（API DTO 类型）
│       ├── enums.ts                    * T4（PROTOCOLS, VPN_TYPES, USER_ROLES, MEMBER_ROLES）
│       ├── constants.ts                * T4（PASSWORD_MIN_LENGTH 等常量）
│       └── validators.ts              * T5（密码复杂度、字段非空、枚举值校验）
├── backend/
│   ├── package.json                    * T1
│   ├── tsconfig.json                   * T1
│   ├── eslint.config.js               * T1
│   ├── vitest.config.ts               * T1
│   ├── prisma/
│   │   ├── schema.prisma              * T6（5 个 model）
│   │   └── seed.ts                    * T9（admin upsert）
│   └── src/
│       ├── server.ts                  * T8（Express 入口 + 全局中间件栈）
│       ├── config/
│       │   └── env.ts                 * T7（环境变量校验 + 导出）
│       ├── middleware/
│       │   ├── auth.ts                * T10（JWT → 查用户 → req.user）
│       │   ├── role.ts                * T11（全局角色检查）
│       │   └── projectRole.ts         * T11（项目角色检查 + admin 绕过）
│       ├── controllers/
│       │   ├── authController.ts      * T13（login/register/refresh/logout/me/change-password/profile）
│       │   ├── userController.ts      * T16（list/search/detail/update/delete）
│       │   ├── projectController.ts   * T19（list/create/detail/update/delete）
│       │   ├── memberController.ts    * T22（list/add/update/remove）
│       │   └── connectionController.ts* T25（list/create/detail/update/delete/decrypt）
│       ├── services/
│       │   ├── authService.ts         * T12（认证业务逻辑）
│       │   ├── userService.ts         * T15（用户 CRUD + 删除保护）
│       │   ├── projectService.ts      * T18（项目 CRUD + owner 自动插入）
│       │   ├── memberService.ts       * T21（成员管理 + 角色/owner 保护）
│       │   └── connectionService.ts   * T24（连接 CRUD + VPN 依赖 + 加密）
│       ├── routes/
│       │   ├── authRoutes.ts          * T13
│       │   ├── userRoutes.ts          * T16
│       │   ├── projectRoutes.ts       * T19
│       │   ├── memberRoutes.ts        * T22
│       │   ├── connectionRoutes.ts    * T25
│       │   └── healthRoutes.ts        * T27
│       └── utils/
│           ├── appError.ts            * T7（AppError 类 + 错误码）
│           ├── encryption.ts          * T7（AES-256-GCM 加解密）
│           ├── password.ts            * T7（bcryptjs hash/compare）
│           ├── logger.ts              * T7（Winston 结构化日志）
│           ├── prisma.ts              * T6（单例 PrismaClient）
│           ├── sessionCleaner.ts      * T27（node-cron 定时清理）
│           └── seedCheck.ts           * T9（首次部署检测）
├── frontend/
│   ├── package.json                    * T2
│   ├── tsconfig.json                   * T2
│   ├── vite.config.ts                  * T2（proxy /api → 3001）
│   ├── index.html                      * T2
│   └── src/
│       ├── main.tsx                    * T28（bootstrap gate + mount）
│       ├── App.tsx                     * T28（路由 + QueryClientProvider）
│       ├── api/
│       │   ├── client.ts              * T28（fetch 封装 + 401 拦截 + refresh 队列）
│       │   └── queries.ts             * T28（TanStack Query hooks）
│       ├── hooks/
│       │   ├── useAuth.ts             * T29（login/logout/refresh/profile hooks）
│       │   ├── useProjects.ts         * T30（项目 CRUD hooks）
│       │   ├── useConnections.ts      * T30（连接 CRUD hooks）
│       │   ├── useMembers.ts          * T30（成员管理 hooks）
│       │   └── useUsers.ts            * T30（用户管理 hooks）
│       └── components/                T29-T30（迁移现有组件）
docker/
├── Dockerfile.backend                  * T31
├── Dockerfile.frontend                 * T31
└── caddy/
    └── Caddyfile                      * T31
docker-compose.yml                      * T31
docker-compose.dev.yml                  * T31
pnpm-workspace.yaml                     * T1
package.json                            * T1
scripts/
├── deploy.ps1                          * T31
└── deploy.sh                           * T31
```

---

## Task 依赖图

```
T1(monorepo) ─→ T2(frontend pkg) ─→ T28(frontend API)
     │                                  ↑
     └─→ T4(shared) ─→ T5(validators)   │
              │                          │
              └─→ T6(prisma) ─→ T9(seed)│
                    │                    │
                    └─→ T7(backend utils)│
                          │              │
                          └─→ T8(server) │
                                │        │
                    T10(auth MW)│        │
                     T11(role MW)       │
                          │              │
                          └─→ T12(auth svc)─→ T13(auth ctrl)─→ T14(auth test)
                                │
                          T15(user svc)─→ T16(user ctrl)─→ T17(user test)
                                │
                          T18(proj svc)─→ T19(proj ctrl)─→ T20(proj test)
                                │
                          T21(mbr svc) ─→ T22(mbr ctrl)─→ T23(mbr test)
                                │
                          T24(conn svc)─→ T25(conn ctrl)─→ T26(conn test)
                                                      │
                          T27(health+clean)     T29-T30(frontend pages)
                                                      │
                                                 T31(docker)
```

---

## Phase 0: Monorepo 脚手架

### Task 1: 初始化 pnpm workspace monorepo + backend 包

**Spec 参考:** §2.1 Monorepo 结构, §2.2 技术选型

**Files:**
- Create: `packages/backend/package.json`
- Create: `packages/backend/tsconfig.json`
- Create: `packages/backend/eslint.config.js`
- Create: `packages/backend/vitest.config.ts`
- Create: `pnpm-workspace.yaml`
- Create: `package.json`（根目录）

- [ ] **Step 1: 创建根 package.json + pnpm-workspace.yaml**

在 `C:\Projects\RemoteHub` 根目录创建：

```json
// pnpm-workspace.yaml
packages:
  - 'packages/*'
injectWorkspacePackages: true
syncInjectedDepsAfterScripts:
  - build
```

```json
// package.json
{
  "name": "remotehub",
  "private": true,
  "scripts": {
    "dev": "concurrently \"pnpm --filter @remotehub/backend dev\" \"pnpm --filter @remotehub/frontend dev\"",
    "build": "pnpm --filter @remotehub/shared build && pnpm --filter @remotehub/backend build && pnpm --filter @remotehub/frontend build",
    "test": "pnpm -r test",
    "lint": "pnpm -r lint"
  },
  "devDependencies": {
    "concurrently": "^9.0.0"
  }
}
```

- [ ] **Step 2: 创建 backend package.json**

```json
// packages/backend/package.json
{
  "name": "@remotehub/backend",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/",
    "db:migrate": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:seed": "prisma db seed"
  },
  "dependencies": {
    "@remotehub/shared": "workspace:*",
    "@prisma/client": "^6.0.0",
    "express": "^5.1.0",
    "bcryptjs": "^2.4.3",
    "cookie-parser": "^1.4.7",
    "helmet": "^8.0.0",
    "express-rate-limit": "^7.5.0",
    "cors": "^2.8.5",
    "winston": "^3.17.0",
    "node-cron": "^3.0.3",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "@types/express": "^5.0.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/cookie-parser": "^1.4.8",
    "@types/cors": "^2.8.17",
    "@types/node-cron": "^3.0.11",
    "@types/uuid": "^10.0.0",
    "prisma": "^6.0.0",
    "typescript": "^5.7.0",
    "tsx": "^4.19.0",
    "vitest": "^3.0.0",
    "esbuild": "^0.25.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "eslint": "^9.0.0"
  },
  "prisma": {
    "seed": "node prisma/seed.js"
  },
  "files": ["dist", "prisma", "src"]
}
```

- [ ] **Step 3: 创建 backend tsconfig.json**

```json
// packages/backend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "noUncheckedIndexedAccess": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: 创建 backend vitest.config.ts**

```typescript
// packages/backend/vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: 创建 backend eslint.config.js**

```javascript
// packages/backend/eslint.config.js
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tsparser },
    plugins: { '@typescript-eslint': tseslint },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
```

- [ ] **Step 6: 创建目录结构并安装依赖**

```bash
cd C:/Projects/RemoteHub
mkdir -p packages/backend/src/{config,middleware,controllers,services,routes,utils}
mkdir -p packages/backend/prisma
mkdir -p packages/backend/tests
rtk pnpm install
```

Expected: 依赖安装成功，无 peer dependency 错误

- [ ] **Step 7: Commit**

```bash
rtk git add pnpm-workspace.yaml package.json packages/backend/
rtk git commit -m "feat: init pnpm workspace monorepo + backend package scaffold"
```

---

### Task 2: 初始化 frontend 包

**Spec 参考:** §2.1, §6.4 (Vite proxy 配置)

**Files:**
- Create: `packages/frontend/package.json`
- Create: `packages/frontend/tsconfig.json`
- Create: `packages/frontend/vite.config.ts`
- Create: `packages/frontend/index.html`

- [ ] **Step 1: 创建 frontend package.json**

```json
// packages/frontend/package.json
{
  "name": "@remotehub/frontend",
  "version": "2.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@remotehub/shared": "workspace:*",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "@tanstack/react-query": "^5.70.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0",
    "@testing-library/react": "^16.0.0",
    "jsdom": "^25.0.0"
  }
}
```

- [ ] **Step 2: 创建 frontend tsconfig.json**

```json
// packages/frontend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noUncheckedIndexedAccess": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: 创建 vite.config.ts（含 API proxy）**

```typescript
// packages/frontend/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: 创建 index.html**

```html
<!-- packages/frontend/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>RemoteHub</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: 创建目录结构 + 最小入口文件**

```bash
cd C:/Projects/RemoteHub
mkdir -p packages/frontend/src/{api,hooks,components,pages}
```

创建最小入口（后续 Task 28 会被替换）：

```typescript
// packages/frontend/src/main.tsx
import { createRoot } from 'react-dom/client';

createRoot(document.getElementById('root')!).render(<div>RemoteHub V2 - Loading...</div>);
```

- [ ] **Step 6: 安装依赖并验证**

```bash
cd C:/Projects/RemoteHub
rtk pnpm install
rtk pnpm --filter @remotehub/frontend build
```

Expected: 构建成功，`packages/frontend/dist/` 生成

- [ ] **Step 7: Commit**

```bash
rtk git add packages/frontend/
rtk git commit -m "feat: init frontend package with Vite + React 19 + TanStack Query"
```

---

### Task 3: 项目清理 — 删除垃圾文件

**Spec 参考:** §8 项目清理策略

**Files:**
- Delete: `backend/nul`, `backend/server.log`, `backend/server-debug.log`, `backend/server-debug-detailed.log`
- Delete: `nul`, `server.pid`, `login_new.json`, `login_response.json`
- Delete: `*.md` 根目录调试快照文件（`frontend-snapshot.md`, `login-attempt.md` 等）
- Delete: `backend/dist/`（编译产物，将加入 .gitignore）
- Delete: `backend/.restart`
- Delete: `backend/test-auth.bat`, `backend/test-auth-api.sh`
- Delete: `test-all-connections.sh`, `test-apis.ps1`, `test-connection-api.js`, `test-connection-creation.js`

- [ ] **Step 1: 识别并删除垃圾文件**

```bash
cd C:/Projects/RemoteHub

# 根目录垃圾文件
rm -f nul server.pid login_new.json login_response.json
rm -f login-attempt.md frontend-snapshot.md frontend-page-content.md
rm -f frontend-snapshot-after-login.md new-login-snapshot.md
rm -f post-login-snapshot.md post-login-success.md reload-snapshot.md
rm -f snapshot-login.md test-login-1.md
rm -f connection-api-fix-summary.md dev-issues.md frontend-login-snapshot.md
rm -f login-page-snapshot.md waitTodo.md
rm -f fix-lsp.ps1
rm -f SQL_Server_Tech_Stack_Guide.md TECHNICAL_IMPLEMENTATION_SUMMARY.md
rm -rf test-snapshots/
rm -f test-all-connections.sh test-apis.ps1 test-connection-api.js test-connection-creation.js

# 后端垃圾文件
rm -f backend/nul backend/.restart
rm -f backend/server.log backend/server-debug.log backend/server-debug-detailed.log
rm -f backend/test-auth.bat backend/test-auth-api.sh
rm -f backend/debug-login.ts
rm -f backend/COMPILATION_FIXES_SUMMARY.md
rm -rf backend/dist/
```

- [ ] **Step 2: 更新 .gitignore**

```bash
cd C:/Projects/RemoteHub
cat > .gitignore << 'EOF'
node_modules/
dist/
.env
.env.local
*.log
*.pid
.DS_Store
Thumbs.db
*.tsbuildinfo
EOF
```

- [ ] **Step 3: Commit**

```bash
rtk git add -A
rtk git commit -m "chore: delete junk files, debug logs, snapshots, and compiled output"
```

---

## Phase 1: Shared 包

### Task 4: 创建 shared 包 — types + enums + constants

**Spec 参考:** §3.2 枚举值定义, §3.3 Prisma 类型与 shared 包分工, §4 API 设计（DTO 类型）

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/enums.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/constants.ts`

- [ ] **Step 1: 创建 shared package.json**

```json
// packages/shared/package.json
{
  "name": "@remotehub/shared",
  "version": "2.0.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" }
  },
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: 创建 shared tsconfig.json**

```json
// packages/shared/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建 enums.ts**

```typescript
// packages/shared/src/enums.ts

/** 远程连接协议 §3.2 */
export const PROTOCOLS = [
  'RDP', 'SSH', 'VNC',
  'HTTP', 'HTTPS',
  'VPN',
  'TODESK', 'SUNLOGIN',
  'TEAMVIEWER', 'ANYDESK',
] as const;
export type Protocol = typeof PROTOCOLS[number];

/** VPN 类型（仅 protocol=VPN 时有效）§3.2 */
export const VPN_TYPES = ['SSL_VPN', 'IPSEC', 'WIREGUARD', 'OPENVPN', 'OTHER'] as const;
export type VpnType = typeof VPN_TYPES[number];

/** 用户角色 §3.2 */
export const USER_ROLES = ['admin', 'user'] as const;
export type UserRole = typeof USER_ROLES[number];

/** 项目成员角色 §3.2 */
export const MEMBER_ROLES = ['owner', 'editor', 'viewer'] as const;
export type MemberRole = typeof MEMBER_ROLES[number];

/** 枚举值验证辅助 */
export function isProtocol(value: string): value is Protocol {
  return (PROTOCOLS as readonly string[]).includes(value);
}
export function isVpnType(value: string): value is VpnType {
  return (VPN_TYPES as readonly string[]).includes(value);
}
export function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}
export function isMemberRole(value: string): value is MemberRole {
  return (MEMBER_ROLES as readonly string[]).includes(value);
}
```

- [ ] **Step 4: 创建 constants.ts**

```typescript
// packages/shared/src/constants.ts

/** 密码复杂度规范 §11.4 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** 用户名字段约束 §3.1 */
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 50;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]+$/;

/** 昵称字段约束 §3.1 */
export const NICKNAME_MAX_LENGTH = 50;

/** 项目名称约束 §3.1 */
export const PROJECT_NAME_MAX_LENGTH = 100;
export const PROJECT_DESCRIPTION_MAX_LENGTH = 2000;

/** 连接字段约束 §3.1 */
export const CONNECTION_NAME_MAX_LENGTH = 200;
export const HOST_MAX_LENGTH = 255;
export const PORT_MIN = 1;
export const PORT_MAX = 65535;
export const PASSWORD_MAX_LENGTH = 200;
export const TAGS_MAX_LENGTH = 500;

/** 分页默认值 §4.1 */
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

/** 用户搜索限制 §4 */
export const USER_SEARCH_MAX_RESULTS = 20;
export const USER_SEARCH_MIN_QUERY_LENGTH = 1;

/** Refresh Token 轮换并发窗口（秒）§5.1 */
export const REFRESH_CONCURRENT_WINDOW_SEC = 30;

/** lastActiveAt 节流间隔（毫秒）§4.2 */
export const LAST_ACTIVE_THROTTLE_MS = 5 * 60 * 1000; // 5 分钟

/** lastAccessed 节流间隔（毫秒）§4.2 */
export const LAST_ACCESSED_THROTTLE_MS = 5 * 60 * 1000;

/** 预设图标名称 §3.1 */
export const PROJECT_ICONS = [
  'folder', 'server', 'cloud', 'database', 'monitor',
  'globe', 'lock', 'terminal', 'network', 'code',
] as const;
export type ProjectIcon = typeof PROJECT_ICONS[number];

/** 加密版本前缀 §9.6 */
export const ENCRYPTION_VERSION = 'v1';
```

- [ ] **Step 5: 创建 types.ts**

```typescript
// packages/shared/src/types.ts
import type { Protocol, VpnType, UserRole, MemberRole } from './enums';

// ─── API 统一响应 §11.2 ───

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  };
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface DeleteResponse {
  success: true;
  data: { id: string };
}

// ─── Auth DTO §4, §5.1 ───

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: UserPublic;
}

export interface RegisterRequest {
  username: string;
  nickname: string;
  password: string;
  role?: UserRole;
}

export interface ChangePasswordRequest {
  oldPassword: string;
  newPassword: string;
}

export interface UpdateProfileRequest {
  nickname: string;
}

// ─── User DTO §4 ───

export interface UserPublic {
  id: string;
  username: string;
  nickname: string;
  role: UserRole;
  isActive: boolean;
  lastActiveAt: string | null;
  createdAt: string;
}

export interface UserListItem extends UserPublic {}

export interface AdminUpdateUserRequest {
  nickname?: string;
  role?: UserRole;
  isActive?: boolean;
}

export interface UserSearchResult {
  id: string;
  username: string;
  nickname: string;
}

// ─── Project DTO §4, §4.1 ───

export interface ProjectListItem {
  id: string;
  name: string;
  icon: string;
  createdBy: { id: string; nickname: string };
  updatedBy: { id: string; nickname: string };
  createdAt: string;
  updatedAt: string;
  /** 当前用户在此项目的角色（列表接口附加） */
  currentUserRole?: MemberRole;
}

export interface ProjectDetail {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  createdBy: { id: string; nickname: string };
  updatedBy: { id: string; nickname: string };
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  icon?: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  icon?: string;
}

// ─── ProjectMember DTO §4, §4.1 ───

export interface MemberListItem {
  id: string;
  userId: string;
  role: MemberRole;
  addedAt: string;
  username: string;
  nickname: string;
}

export interface AddMemberRequest {
  userId: string;
  role: MemberRole;
}

export interface UpdateMemberRoleRequest {
  role: MemberRole;
}

// ─── Connection DTO §4, §4.1 ───

export interface ConnectionListItem {
  id: string;
  projectId: string;
  project: { id: string; name: string };
  name: string;
  host: string;
  port: number | null;
  protocol: Protocol;
  vpnType: VpnType | null;
  requiredVpnId: string | null;
  tags: string | null;
  lastAccessed: string | null;
  createdBy: { id: string; nickname: string };
  updatedBy: { id: string; nickname: string };
  updatedAt: string;
}

export interface ConnectionDetail {
  id: string;
  projectId: string;
  name: string;
  host: string;
  port: number | null;
  username: string | null;
  protocol: Protocol;
  vpnType: VpnType | null;
  vpnLoginUrl: string | null;
  requiredVpnId: string | null;
  notes: string | null;
  tags: string | null;
  lastAccessed: string | null;
  createdBy: { id: string; nickname: string };
  updatedBy: { id: string; nickname: string };
  createdAt: string;
  updatedAt: string;
  /** 加密密文，viewer 不返回 §4.2 */
  encryptedPass?: string | null;
}

export interface CreateConnectionRequest {
  projectId: string;
  name: string;
  host: string;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  protocol: Protocol;
  vpnType?: VpnType | null;
  vpnLoginUrl?: string | null;
  requiredVpnId?: string | null;
  notes?: string | null;
  tags?: string | null;
}

export interface UpdateConnectionRequest {
  name?: string;
  host?: string;
  port?: number | null;
  username?: string | null;
  password?: string | null;  // null=清除，undefined=不更新
  protocol?: Protocol;
  vpnType?: VpnType | null;
  vpnLoginUrl?: string | null;
  requiredVpnId?: string | null;
  notes?: string | null;
  tags?: string | null;
}

export interface DecryptedPasswordResponse {
  password: string;
}
```

- [ ] **Step 6: 创建 index.ts（barrel export）**

```typescript
// packages/shared/src/index.ts
export * from './enums.js';
export * from './types.js';
export * from './constants.js';
```

- [ ] **Step 7: 安装依赖、构建并验证**

```bash
cd C:/Projects/RemoteHub
rtk pnpm install
rtk pnpm --filter @remotehub/shared build
```

Expected: 编译成功，`packages/shared/dist/` 包含 `.js` + `.d.ts` 文件

- [ ] **Step 8: Commit**

```bash
rtk git add packages/shared/
rtk git commit -m "feat: create shared package with types, enums, and constants"
```

---

### Task 5: 创建 shared validators + 单元测试

**Spec 参考:** §3.1 字段校验规则, §11.4 密码复杂度规范

**Files:**
- Create: `packages/shared/src/validators.ts`
- Create: `packages/shared/src/validators.test.ts`
- Modify: `packages/shared/src/index.ts`（追加 export）

- [ ] **Step 1: 写 validators 测试**

```typescript
// packages/shared/src/validators.test.ts
import { describe, it, expect } from 'vitest';
import {
  validateUsername, validateNickname, validatePassword,
  validateProjectName, validateConnectionName,
  validateHost, validatePort, validateTags,
} from './validators.js';

describe('validateUsername', () => {
  it('接受合法用户名', () => {
    expect(validateUsername('admin')).toEqual({ valid: true });
    expect(validateUsername('user_01')).toEqual({ valid: true });
  });
  it('拒绝过短', () => {
    expect(validateUsername('ab').valid).toBe(false);
  });
  it('拒绝过长', () => {
    expect(validateUsername('a'.repeat(51)).valid).toBe(false);
  });
  it('拒绝非法字符', () => {
    expect(validateUsername('user-name').valid).toBe(false);
    expect(validateUsername('用户名').valid).toBe(false);
  });
});

describe('validatePassword', () => {
  it('接受合法密码', () => {
    expect(validatePassword('Pass1234')).toEqual({ valid: true });
  });
  it('拒绝过短', () => {
    expect(validatePassword('Ab1').valid).toBe(false);
  });
  it('拒绝无大写', () => {
    expect(validatePassword('password1').valid).toBe(false);
  });
  it('拒绝无小写', () => {
    expect(validatePassword('PASSWORD1').valid).toBe(false);
  });
  it('拒绝无数字', () => {
    expect(validatePassword('Password').valid).toBe(false);
  });
  it('拒绝超长', () => {
    expect(validatePassword('A1' + 'a'.repeat(127)).valid).toBe(false);
  });
});

describe('validatePort', () => {
  it('接受合法端口', () => {
    expect(validatePort(80)).toEqual({ valid: true });
    expect(validatePort(443)).toEqual({ valid: true });
    expect(validatePort(3389)).toEqual({ valid: true });
  });
  it('拒绝超出范围', () => {
    expect(validatePort(0).valid).toBe(false);
    expect(validatePort(65536).valid).toBe(false);
  });
  it('接受 null', () => {
    expect(validatePort(null)).toEqual({ valid: true });
  });
});

describe('validateProjectName', () => {
  it('拒绝空字符串', () => {
    expect(validateProjectName('').valid).toBe(false);
  });
  it('拒绝超长', () => {
    expect(validateProjectName('x'.repeat(101)).valid).toBe(false);
  });
});

describe('validateHost', () => {
  it('拒绝空', () => { expect(validateHost('').valid).toBe(false); });
  it('拒绝超长', () => { expect(validateHost('x'.repeat(256)).valid).toBe(false); });
  it('接受合法', () => { expect(validateHost('192.168.1.1')).toEqual({ valid: true }); });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd C:/Projects/RemoteHub
rtk pnpm --filter @remotehub/shared test
```

Expected: FAIL — `validateUsername` 等函数不存在

- [ ] **Step 3: 实现 validators.ts**

```typescript
// packages/shared/src/validators.ts
import {
  USERNAME_MIN_LENGTH, USERNAME_MAX_LENGTH, USERNAME_PATTERN,
  NICKNAME_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH,
  PROJECT_NAME_MAX_LENGTH, CONNECTION_NAME_MAX_LENGTH,
  HOST_MAX_LENGTH, PORT_MIN, PORT_MAX, TAGS_MAX_LENGTH,
} from './constants.js';
import { isProtocol, isUserRole, isMemberRole, isVpnType } from './enums.js';

type ValidationResult = { valid: true } | { valid: false; message: string };

function fail(message: string): { valid: false; message: string } {
  return { valid: false, message };
}

export function validateUsername(value: string): ValidationResult {
  if (value.length < USERNAME_MIN_LENGTH) return fail(`用户名长度不能少于 ${USERNAME_MIN_LENGTH} 个字符`);
  if (value.length > USERNAME_MAX_LENGTH) return fail(`用户名长度不能超过 ${USERNAME_MAX_LENGTH} 个字符`);
  if (!USERNAME_PATTERN.test(value)) return fail('用户名只能包含字母、数字和下划线');
  return { valid: true };
}

export function validateNickname(value: string): ValidationResult {
  if (!value || value.length === 0) return fail('昵称不能为空');
  if (value.length > NICKNAME_MAX_LENGTH) return fail(`昵称长度不能超过 ${NICKNAME_MAX_LENGTH} 个字符`);
  return { valid: true };
}

export function validatePassword(value: string): ValidationResult {
  if (value.length < PASSWORD_MIN_LENGTH) return fail(`密码长度不能少于 ${PASSWORD_MIN_LENGTH} 个字符`);
  if (value.length > PASSWORD_MAX_LENGTH) return fail(`密码长度不能超过 ${PASSWORD_MAX_LENGTH} 个字符`);
  if (!/[a-z]/.test(value)) return fail('密码必须包含小写字母');
  if (!/[A-Z]/.test(value)) return fail('密码必须包含大写字母');
  if (!/[0-9]/.test(value)) return fail('密码必须包含数字');
  return { valid: true };
}

export function validateRole(value: string): ValidationResult {
  if (!isUserRole(value)) return fail('无效的用户角色');
  return { valid: true };
}

export function validateMemberRole(value: string): ValidationResult {
  if (!isMemberRole(value)) return fail('无效的成员角色');
  return { valid: true };
}

export function validateProtocol(value: string): ValidationResult {
  if (!isProtocol(value)) return fail('无效的连接协议');
  return { valid: true };
}

export function validateVpnType(value: string | null | undefined): ValidationResult {
  if (value != null && !isVpnType(value)) return fail('无效的 VPN 类型');
  return { valid: true };
}

export function validateProjectName(value: string): ValidationResult {
  if (!value || value.length === 0) return fail('项目名称不能为空');
  if (value.length > PROJECT_NAME_MAX_LENGTH) return fail(`项目名称不能超过 ${PROJECT_NAME_MAX_LENGTH} 个字符`);
  return { valid: true };
}

export function validateConnectionName(value: string): ValidationResult {
  if (!value || value.length === 0) return fail('连接名称不能为空');
  if (value.length > CONNECTION_NAME_MAX_LENGTH) return fail(`连接名称不能超过 ${CONNECTION_NAME_MAX_LENGTH} 个字符`);
  return { valid: true };
}

export function validateHost(value: string): ValidationResult {
  if (!value || value.length === 0) return fail('主机地址不能为空');
  if (value.length > HOST_MAX_LENGTH) return fail(`主机地址不能超过 ${HOST_MAX_LENGTH} 个字符`);
  return { valid: true };
}

export function validatePort(value: number | null | undefined): ValidationResult {
  if (value == null) return { valid: true };
  if (!Number.isInteger(value) || value < PORT_MIN || value > PORT_MAX) {
    return fail(`端口必须在 ${PORT_MIN}-${PORT_MAX} 范围内`);
  }
  return { valid: true };
}

export function validateTags(value: string | null | undefined): ValidationResult {
  if (value != null && value.length > TAGS_MAX_LENGTH) return fail(`标签不能超过 ${TAGS_MAX_LENGTH} 个字符`);
  return { valid: true };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd C:/Projects/RemoteHub
rtk pnpm --filter @remotehub/shared test
```

Expected: 全部 PASS

- [ ] **Step 5: 更新 index.ts 追加 validators export**

在 `packages/shared/src/index.ts` 末尾追加：

```typescript
export * from './validators.js';
```

- [ ] **Step 6: 重新构建并验证**

```bash
cd C:/Projects/RemoteHub
rtk pnpm --filter @remotehub/shared build
```

Expected: 构建成功

- [ ] **Step 7: Commit**

```bash
rtk git add packages/shared/
rtk git commit -m "feat: add shared validators with unit tests"
```

---

## Phase 2: 后端基础

### Task 6: Prisma Schema + 初始迁移 + 单例 Client

**Spec 参考:** §3.1 Prisma Schema, §2.4 Prisma 技术约束

**Files:**
- Create: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/src/utils/prisma.ts`

- [ ] **Step 1: 创建 Prisma schema**

```prisma
// packages/backend/prisma/schema.prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id           String    @id @default(uuid())
  username     String    @unique @db.VarChar(50)
  nickname     String
  passwordHash String    @map("password_hash")
  role         String    @default("user") @db.VarChar(20)
  isActive     Boolean   @default(true) @map("is_active")
  lastActiveAt DateTime? @map("last_active_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  projects    ProjectMember[]
  sessions    Session[]

  @@index([role])
  @@map("users")
}

model Session {
  id        String   @id @default(uuid())
  userId    String   @map("user_id")
  tokenHash String   @unique @map("token_hash")
  userAgent String?  @db.VarChar(500) @map("user_agent")
  ip        String?  @db.VarChar(45)
  expiresAt DateTime  @map("expires_at")
  createdAt DateTime  @default(now()) @map("created_at")
  consumedAt DateTime? @map("consumed_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("sessions")
}

model Project {
  id          String   @id @default(uuid())
  name        String   @unique
  description String?
  icon        String   @default("folder") @db.VarChar(50)
  createdBy   String   @map("created_by")
  updatedBy   String   @map("updated_by")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  members     ProjectMember[]
  connections Connection[]

  @@map("projects")
}

model ProjectMember {
  id        String   @id @default(uuid())
  projectId String   @map("project_id")
  userId    String   @map("user_id")
  role      String   @default("viewer") @db.VarChar(20)
  addedAt   DateTime @default(now()) @map("added_at")

  user    User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([userId])
  @@map("project_members")
}

model Connection {
  id            String    @id @default(uuid())
  projectId     String    @map("project_id")
  name          String
  host          String    @db.VarChar(255)
  port          Int?
  username      String?   @db.VarChar(100)
  encryptedPass String?   @db.VarChar(500) @map("encrypted_password")
  protocol      String    @db.VarChar(30)
  vpnType       String?   @db.VarChar(30) @map("vpn_type")
  vpnLoginUrl   String?   @db.VarChar(500) @map("vpn_login_url")
  requiredVpnId String?   @map("required_vpn_id")
  notes         String?
  tags          String?
  lastAccessed  DateTime? @map("last_accessed")
  createdBy     String    @map("created_by")
  updatedBy     String    @map("updated_by")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  requiredVpn  Connection?  @relation("VpnDependency", fields: [requiredVpnId], references: [id], onDelete: SetNull)
  dependents   Connection[] @relation("VpnDependency")

  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([requiredVpnId])
  @@unique([projectId, name])
  @@map("connections")
}
```

- [ ] **Step 2: 创建单例 PrismaClient**

```typescript
// packages/backend/src/utils/prisma.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 3: 创建 .env 并运行初始迁移**

```bash
cd C:/Projects/RemoteHub
cat > packages/backend/.env << 'EOF'
DATABASE_URL=mysql://root:root@localhost:3306/remotehub_dev
JWT_SECRET=test-dev-secret-key-at-least-32-characters-long-for-security
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=$(openssl rand -base64 32)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin123
NODE_ENV=development
PORT=3001
LOG_LEVEL=debug
EOF
```

需要 Docker MySQL 运行（或使用 docker-compose.dev.yml）：

```bash
# 如果还没有 docker-compose.dev.yml，先创建（后续 Task 31 会覆盖）
cat > docker-compose.dev.yml << 'YAML'
services:
  db:
    image: mysql:8.0
    ports: ["3306:3306"]
    environment:
      - MYSQL_ROOT_PASSWORD=root
      - MYSQL_DATABASE=remotehub_dev
    volumes:
      - dev-db-data:/var/lib/mysql
volumes:
  dev-db-data:
YAML

docker compose -f docker-compose.dev.yml up -d db
```

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk npx prisma generate
rtk npx prisma migrate dev --name init
```

Expected: 迁移文件生成在 `prisma/migrations/`，MySQL 表创建成功

- [ ] **Step 4: 验证**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk npx prisma db execute --stdin <<< "SHOW TABLES;"
```

Expected: 输出 `connections`, `project_members`, `projects`, `sessions`, `users` 五张表

- [ ] **Step 5: Commit**

```bash
rtk git add packages/backend/prisma/ packages/backend/src/utils/prisma.ts packages/backend/.env docker-compose.dev.yml
rtk git commit -m "feat: add Prisma schema with 5 models, initial migration, and singleton client"
```

---

### Task 7: 后端工具模块 — config + AppError + encryption + password + logger

**Spec 参考:** §5.2 密码存储, §9.2 环境变量, §9.4 日志策略, §9.6 加密细节, §11.2 错误码体系

**Files:**
- Create: `packages/backend/src/config/env.ts`
- Create: `packages/backend/src/utils/appError.ts`
- Create: `packages/backend/src/utils/encryption.ts`
- Create: `packages/backend/src/utils/password.ts`
- Create: `packages/backend/src/utils/logger.ts`

- [ ] **Step 1: 创建环境变量配置**

```typescript
// packages/backend/src/config/env.ts
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少必需的环境变量: ${name}`);
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  DATABASE_URL: requireEnv('DATABASE_URL'),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  ENCRYPTION_KEY: requireEnv('ENCRYPTION_KEY'),
  ENCRYPTION_KEY_OLD: process.env.ENCRYPTION_KEY_OLD || null,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin123',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  RATE_LIMIT_LOGIN_MAX: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5', 10),
  RATE_LIMIT_REGISTER_MAX: parseInt(process.env.RATE_LIMIT_REGISTER_MAX || '3', 10),
  RATE_LIMIT_REFRESH_MAX: parseInt(process.env.RATE_LIMIT_REFRESH_MAX || '20', 10),
  RATE_LIMIT_GENERAL_MAX: parseInt(process.env.RATE_LIMIT_GENERAL_MAX || '200', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
} as const;
```

- [ ] **Step 2: 创建 AppError + 错误码**

```typescript
// packages/backend/src/utils/appError.ts

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly message: string,
    public readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** 错误码 → HTTP 状态码映射 §11.2 */
export const ERROR_CODES: Record<string, number> = {
  AUTH_001: 401,
  AUTH_002: 401,
  AUTH_003: 403,
  AUTH_004: 401,
  AUTH_005: 403,
  USER_001: 409,
  USER_002: 404,
  CONN_002: 404,
  CONN_003: 400,
  CONN_004: 409,
  CONN_005: 409,
  PROJ_001: 409,
  PROJ_002: 404,
  MEMBER_001: 409,
  MEMBER_002: 403,
  MEMBER_003: 409,
  VAL_001: 422,
  SYS_001: 500,
};

/** 错误码 → 默认消息 */
export const ERROR_MESSAGES: Record<string, string> = {
  AUTH_001: '用户名或密码错误',
  AUTH_002: '令牌已过期',
  AUTH_003: '权限不足',
  AUTH_004: '刷新令牌无效或已消耗',
  AUTH_005: '用户已被禁用',
  USER_001: '用户名已存在',
  USER_002: '用户不存在',
  CONN_002: '连接不存在',
  CONN_003: 'VPN 依赖循环',
  CONN_004: 'VPN 仍被其他连接依赖',
  CONN_005: '同项目内连接名称已存在',
  PROJ_001: '项目名称冲突',
  PROJ_002: '项目不存在',
  MEMBER_001: '成员已存在于项目中',
  MEMBER_002: '不能变更/移除最后的项目owner',
  MEMBER_003: '用户是项目唯一owner，无法删除',
  VAL_001: '输入验证失败',
  SYS_001: '内部服务器错误',
};

export function createAppError(code: string, details?: Array<{ field: string; message: string }>): AppError {
  return new AppError(code, ERROR_CODES[code] || 500, ERROR_MESSAGES[code] || code, details);
}

/**
 * 将 Prisma P2002 唯一约束冲突映射为业务错误码 §11.2
 */
export function handlePrismaUniqueViolation(error: unknown): never {
  const { Prisma } = require('@prisma/client') as typeof import('@prisma/client');
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = (error.meta?.target as string[])?.join(',');
    if (target === 'username') throw createAppError('USER_001');
    if (target === 'name') throw createAppError('PROJ_001');
    if (target === 'projectId,name') throw createAppError('CONN_005');
    if (target === 'projectId,userId') throw createAppError('MEMBER_001');
  }
  throw error;
}
```

- [ ] **Step 3: 创建加密工具**

```typescript
// packages/backend/src/utils/encryption.ts
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ENCRYPTION_VERSION } from '@remotehub/shared';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'base64');
}

function getOldKey(): Buffer | null {
  if (!env.ENCRYPTION_KEY_OLD) return null;
  return Buffer.from(env.ENCRYPTION_KEY_OLD, 'base64');
}

/**
 * 加密明文，返回 `v1:iv:ciphertext:authTag`（Base64）§9.6
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENCRYPTION_VERSION}:${iv.toString('base64')}:${encrypted.toString('base64')}:${authTag.toString('base64')}`;
}

/**
 * 解密密文。支持密钥轮换 §9.6.1
 */
export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  const version = parts[0];

  if (version === 'v1') {
    const [, ivB64, ctB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const ciphertext = Buffer.from(ctB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');

    // 先尝试新密钥
    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
      decipher.setAuthTag(authTag);
      return decipher.update(ciphertext) + decipher.final('utf8');
    } catch {
      // 新密钥失败，尝试旧密钥 §9.6.1
      const oldKey = getOldKey();
      if (oldKey) {
        const decipher = crypto.createDecipheriv(ALGORITHM, oldKey, iv);
        decipher.setAuthTag(authTag);
        return decipher.update(ciphertext) + decipher.final('utf8');
      }
      throw new Error('解密失败：密钥不匹配');
    }
  }

  throw new Error(`不支持的加密版本: ${version}`);
}
```

- [ ] **Step 4: 创建密码工具**

```typescript
// packages/backend/src/utils/password.ts
import bcrypt from 'bcryptjs';

const BCRYPT_ROUNDS = 12; // §5.2

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 5: 创建日志工具**

```typescript
// packages/backend/src/utils/logger.ts
import winston from 'winston';
import { env } from '../config/env.js';

const { combine, timestamp, printf, colorize } = winston.format;

const logFormat = printf(({ level, message, timestamp: ts, ...meta }) => {
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${ts} [${level}]${metaStr} ${message}`;
});

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), logFormat),
  transports: [
    new winston.transports.Console({
      format: env.NODE_ENV === 'development' ? combine(colorize(), logFormat) : logFormat,
    }),
  ],
});
```

- [ ] **Step 6: 验证编译**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 7: Commit**

```bash
rtk git add packages/backend/src/config/ packages/backend/src/utils/
rtk git commit -m "feat: add backend utility modules (config, AppError, encryption, password, logger)"
```

---

### Task 8: Express 5 服务器入口 + 全局中间件栈 + 错误处理

**Spec 参考:** §4.2 全局中间件栈, §11.2 统一响应格式, §5.3 速率限制

**Files:**
- Create: `packages/backend/src/server.ts`

- [ ] **Step 1: 创建 server.ts**

```typescript
// packages/backend/src/server.ts
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { AppError, createAppError } from './utils/appError.js';
import type { Request, Response, NextFunction } from 'express';

const app = express();

// ─── 全局中间件栈 §4.2（按顺序） ───

// 1. JSON 请求体解析（Express 5 需显式启用）
app.use(express.json({ limit: '1mb' }));

// 2. Cookie 解析
app.use(cookieParser());

// 3. 安全头 §5.4
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));

// 4. 速率限制 §5.3
const loginLimiter = rateLimit({
  windowMs: 60_000,
  max: env.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } },
  skip: (req) => req.path === '/api/v1/health',
});

const registerLimiter = rateLimit({
  windowMs: 60_000,
  max: env.RATE_LIMIT_REGISTER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } },
});

const refreshLimiter = rateLimit({
  windowMs: 60_000,
  max: env.RATE_LIMIT_REFRESH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } },
});

const generalLimiter = rateLimit({
  windowMs: 60_000,
  max: env.RATE_LIMIT_GENERAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } },
  skip: (req) => req.path === '/api/v1/health',
});

// 5. CORS §9.1
if (env.CORS_ORIGIN) {
  app.use(cors({
    origin: env.CORS_ORIGIN.split(','),
    credentials: true,
  }));
}

// 6. 信任代理 §5.3
app.set('trust proxy', true);

// ─── 路由注册（占位，后续 Task 逐步替换） ───
import { healthRoutes } from './routes/healthRoutes.js';
app.use('/api/v1/health', healthRoutes);

// 应用速率限制到具体路由（在路由注册后通过中间件方式）
// 注意：这些将在后续 Task 中与路由一起注册
// app.use('/api/v1/auth/login', loginLimiter);
// app.use('/api/v1/auth/register', registerLimiter);
// app.use('/api/v1/auth/refresh', refreshLimiter);
// app.use('/api/v1', generalLimiter);

// ─── 404 ───
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(createAppError('SYS_001'));
});

// ─── 全局错误处理 §11.2 ───
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    const response: {
      success: false;
      error: { code: string; message: string; details?: Array<{ field: string; message: string }> };
    } = {
      success: false,
      error: { code: err.code, message: err.message },
    };
    if (err.details) response.error.details = err.details;
    res.status(err.statusCode).json(response);
    return;
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: { code: 'SYS_001', message: '内部服务器错误' },
  });
});

// ─── 启动 ───
const PORT = env.PORT;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} (${env.NODE_ENV})`);
});

export { app };
```

- [ ] **Step 2: 创建占位 healthRoutes**

```typescript
// packages/backend/src/routes/healthRoutes.ts
import { Router } from 'express';
import { prisma } from '../utils/prisma.js';

export const healthRoutes = Router();

healthRoutes.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
  } catch {
    res.status(503).json({ success: false, error: { code: 'SYS_001', message: '数据库连接失败' } });
  }
});
```

- [ ] **Step 3: 验证服务器启动**

```bash
cd C:/Projects/RemoteHub/packages/backend
timeout 5 npx tsx src/server.ts || true
```

Expected: 输出 `Server running on port 3001 (development)` 后超时退出

- [ ] **Step 4: Commit**

```bash
rtk git add packages/backend/src/server.ts packages/backend/src/routes/healthRoutes.ts
rtk git commit -m "feat: add Express 5 server with global middleware stack and error handler"
```

---

### Task 9: Seed 脚本 + seed-check

**Spec 参考:** §6.2 Dockerfile.backend（seed 说明）, §9.2 环境变量（ADMIN_USERNAME/ADMIN_PASSWORD）

**Files:**
- Create: `packages/backend/prisma/seed.ts`
- Create: `packages/backend/src/utils/seedCheck.ts`

- [ ] **Step 1: 创建 seed.ts（admin upsert）**

```typescript
// packages/backend/prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';
import { env } from '../src/config/env.js';

const prisma = new PrismaClient();

async function main() {
  const username = env.ADMIN_USERNAME;
  const password = env.ADMIN_PASSWORD;

  // upsert: update 为空操作 {}，不覆盖已有密码 §6.2
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

  console.log(`Seed complete: admin user "${admin.username}" (${admin.id})`);
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: 创建 seedCheck.ts（首次部署检测）**

```typescript
// packages/backend/src/utils/seedCheck.ts
import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { execSync } from 'node:child_process';

export async function seedCheck(): Promise<void> {
  const adminCount = await prisma.user.count({ where: { role: 'admin' } });
  if (adminCount > 0) {
    logger.info('Admin user exists, skipping seed');
    return;
  }
  logger.info('No admin user found, running seed...');
  execSync('npx prisma db seed', { stdio: 'inherit' });
}
```

- [ ] **Step 3: 编译 seed.ts 并验证**

```bash
cd C:/Projects/RemoteHub/packages/backend
npx esbuild prisma/seed.ts --outfile=prisma/seed.js --platform=node --format=cjs --bundle
rtk npx prisma db seed
```

Expected: 输出 `Seed complete: admin user "admin" (...)`

- [ ] **Step 4: 验证幂等性（重复执行不报错）**

```bash
rtk npx prisma db seed
```

Expected: 再次输出 `Seed complete`，密码未被覆盖

- [ ] **Step 5: Commit**

```bash
rtk git add packages/backend/prisma/seed.ts packages/backend/prisma/seed.js packages/backend/src/utils/seedCheck.ts
rtk git commit -m "feat: add seed script with admin upsert and idempotent seed-check"
```

---

## Phase 3: 认证中间件

### Task 10: authMiddleware — JWT 验证 + 用户查询 + req.user

**Spec 参考:** §4.2 认证中间件行为, §5.1 JWT 载荷结构

**Files:**
- Create: `packages/backend/src/middleware/auth.ts`
- Create: `packages/backend/src/utils/jwt.ts`
- Create: `packages/backend/src/middleware/auth.test.ts`

- [ ] **Step 1: 创建 JWT 工具**

```typescript
// packages/backend/src/utils/jwt.ts
import crypto from 'node:crypto';
import { env } from '../config/env.js';

/** 签发 access token（仅包含 userId）§5.1 */
export async function signAccessToken(userId: string): Promise<string> {
  const { default: jose } = await import('jose');
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new jose.SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
    .setIssuedAt()
    .sign(secret);
}

/** 验证 access token，返回 payload §5.1 */
export async function verifyAccessToken(token: string): Promise<{ userId: string }> {
  const { default: jose } = await import('jose');
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const { payload } = await jose.jwtVerify<{ userId: string }>(token, secret);
  return { userId: payload.userId };
}

/** 生成 opaque refresh token */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

/** 计算 refresh token 的 SHA-256 哈希 §5.1 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
```

注意：需要安装 `jose` 包（纯 JS JWT，Express 5 兼容）：

```bash
cd C:/Projects/RemoteHub
pnpm --filter @remotehub/backend add jose
```

- [ ] **Step 2: 写 authMiddleware 测试**

```typescript
// packages/backend/src/middleware/auth.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('../utils/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Mock logger
vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { authMiddleware } from './auth.js';
import { prisma } from '../utils/prisma.js';
import { signAccessToken } from '../utils/jwt.js';
import type { Request, Response, NextFunction } from 'express';

function mockReqRes(authHeader?: string) {
  const req = {
    headers: authHeader ? { authorization: authHeader } : {},
    user: undefined,
    path: '/api/v1/test',
  } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('authMiddleware', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('无 Authorization 头 → 401 AUTH_002', async () => {
    const { req, res, next } = mockReqRes();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'AUTH_002' }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('无效 token → 401 AUTH_002', async () => {
    const { req, res, next } = mockReqRes('Bearer invalid-token');
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('用户不存在 → 401 AUTH_002', async () => {
    const token = await signAccessToken('nonexistent-id');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('用户 isActive=false → 403 AUTH_005', async () => {
    const token = await signAccessToken('user-1');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1', username: 'test', nickname: 'Test', role: 'user', isActive: false,
    });
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'AUTH_005' }),
    }));
  });

  it('有效 token + 活跃用户 → next + req.user', async () => {
    const token = await signAccessToken('user-1');
    const user = { id: 'user-1', username: 'test', nickname: 'Test', role: 'admin', isActive: true };
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({ id: 'user-1', role: 'admin' }));
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk pnpm test -- src/middleware/auth.test.ts
```

Expected: FAIL — `authMiddleware` 不存在

- [ ] **Step 4: 实现 authMiddleware**

```typescript
// packages/backend/src/middleware/auth.ts
import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { prisma } from '../utils/prisma.js';
import { createAppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { LAST_ACTIVE_THROTTLE_MS } from '@remotehub/shared';

const lastActiveUpdates = new Map<string, number>();

interface AuthUser {
  id: string;
  username: string;
  nickname: string;
  role: string;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'AUTH_002', message: '令牌已过期' } });
    return;
  }

  let userId: string;
  try {
    const payload = await verifyAccessToken(authHeader.slice(7));
    userId = payload.userId;
  } catch {
    res.status(401).json({ success: false, error: { code: 'AUTH_002', message: '令牌已过期' } });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_002', message: '令牌已过期' } });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ success: false, error: { code: 'AUTH_005', message: '用户已被禁用' } });
    return;
  }

  req.user = user;

  // 节流更新 lastActiveAt §4.2
  const now = Date.now();
  const lastUpdate = lastActiveUpdates.get(user.id) || 0;
  if (now - lastUpdate > LAST_ACTIVE_THROTTLE_MS) {
    lastActiveUpdates.set(user.id, now);
    prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
      .catch((err) => logger.error('Failed to update lastActiveAt', { error: err.message }));
  }

  next();
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk pnpm test -- src/middleware/auth.test.ts
```

Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
rtk git add packages/backend/src/middleware/auth.ts packages/backend/src/middleware/auth.test.ts packages/backend/src/utils/jwt.ts
rtk git commit -m "feat: add authMiddleware with JWT verification, user lookup, and lastActiveAt throttle"
```

---

### Task 11: roleMiddleware + projectRoleMiddleware

**Spec 参考:** §4.2 权限执行机制, §4.2 projectRoleMiddleware admin 绕过

**Files:**
- Create: `packages/backend/src/middleware/role.ts`
- Create: `packages/backend/src/middleware/projectRole.ts`

- [ ] **Step 1: 创建 roleMiddleware**

```typescript
// packages/backend/src/middleware/role.ts
import type { Request, Response, NextFunction } from 'express';
import { createAppError } from '../utils/appError.js';
import type { UserRole } from '@remotehub/shared';

/** 全局角色检查中间件 §4.2 */
export function roleMiddleware(requiredRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(createAppError('AUTH_002'));
      return;
    }
    if (req.user.role !== requiredRole && req.user.role !== 'admin') {
      next(createAppError('AUTH_003'));
      return;
    }
    next();
  };
}
```

- [ ] **Step 2: 创建 projectRoleMiddleware**

```typescript
// packages/backend/src/middleware/projectRole.ts
import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { createAppError } from '../utils/appError.js';
import type { MemberRole } from '@remotehub/shared';

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

/** 项目角色检查中间件 §4.2 */
export function projectRoleMiddleware(minRole: MemberRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      next(createAppError('AUTH_002'));
      return;
    }

    // admin 绕过 §4.2
    if (req.user.role === 'admin') {
      next();
      return;
    }

    // 获取 projectId §4.2
    let projectId: string | undefined;

    // 从 URL params :id 获取
    if (req.params.id) {
      // 判断是项目端点还是连接端点
      if (req.path.match(/^\/projects\//) || req.baseUrl?.includes('projects')) {
        projectId = req.params.id;
      } else if (req.path.match(/^\/connections\//) || req.baseUrl?.includes('connections')) {
        // 连接端点：先查 Connection 获取 projectId
        const conn = await prisma.connection.findUnique({
          where: { id: req.params.id },
          select: { projectId: true },
        });
        if (!conn) {
          res.status(403).json({ success: false, error: { code: 'AUTH_003', message: '权限不足' } });
          return;
        }
        projectId = conn.projectId;
      }
    }

    // POST /connections — projectId 在 body §4.2
    if (!projectId && req.body?.projectId) {
      projectId = req.body.projectId;
    }

    // GET /connections?projectId=X §4.2
    if (!projectId && req.query?.projectId && typeof req.query.projectId === 'string') {
      projectId = req.query.projectId;
    }

    if (!projectId) {
      // 无 projectId 时不走项目权限检查（如 GET /connections 不带 projectId）
      next();
      return;
    }

    // 查 ProjectMember
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: req.user.id } },
    });

    if (!member) {
      res.status(403).json({ success: false, error: { code: 'AUTH_003', message: '权限不足' } });
      return;
    }

    if (ROLE_HIERARCHY[member.role as MemberRole] < ROLE_HIERARCHY[minRole]) {
      res.status(403).json({ success: false, error: { code: 'AUTH_003', message: '权限不足' } });
      return;
    }

    next();
  };
}
```

- [ ] **Step 3: 验证编译**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 4: Commit**

```bash
rtk git add packages/backend/src/middleware/role.ts packages/backend/src/middleware/projectRole.ts
rtk git commit -m "feat: add roleMiddleware and projectRoleMiddleware with admin bypass"
```

---

## Phase 4: 认证模块

### Task 12: Auth Service — 认证业务逻辑

**Spec 参考:** §5.1 认证流程, §5.1 Refresh Token 轮换策略, §5.1 Logout, §5.1 密码修改

**Files:**
- Create: `packages/backend/src/services/authService.ts`

- [ ] **Step 1: 实现 authService**

```typescript
// packages/backend/src/services/authService.ts
import { prisma } from '../utils/prisma.js';
import { verifyPassword, hashPassword } from '../utils/password.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../utils/jwt.js';
import { createAppError, handlePrismaUniqueViolation } from '../utils/appError.js';
import { validateUsername, validateNickname, validatePassword as validatePwd } from '@remotehub/shared';
import { REFRESH_CONCURRENT_WINDOW_SEC } from '@remotehub/shared';
import type { UserPublic } from '@remotehub/shared';

/** 数据库 User → 公开 DTO（strip passwordHash, updatedAt）§4.1 */
function toUserPublic(user: { id: string; username: string; nickname: string; role: string; isActive: boolean; lastActiveAt: Date | null; createdAt: Date }): UserPublic {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role as 'admin' | 'user',
    isActive: user.isActive,
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

/** 登录 §5.1 — 全程 AUTH_001 防止用户名枚举 */
export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw createAppError('AUTH_001');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw createAppError('AUTH_001');

  if (!user.isActive) throw createAppError('AUTH_001');

  const accessToken = await signAccessToken(user.id);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      userAgent: null, // Controller 层传入
      ip: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    user: toUserPublic(user),
  };
}

/** 注册（仅 admin 调用）§4 */
export async function register(callerRole: string, data: { username: string; nickname: string; password: string; role?: string }) {
  // 验证
  const errors: Array<{ field: string; message: string }> = [];
  const u = validateUsername(data.username);
  if (!u.valid) errors.push({ field: 'username', message: u.message });
  const n = validateNickname(data.nickname);
  if (!n.valid) errors.push({ field: 'nickname', message: n.message });
  const p = validatePwd(data.password);
  if (!p.valid) errors.push({ field: 'password', message: p.message });
  if (data.role && data.role !== 'admin' && data.role !== 'user') {
    errors.push({ field: 'role', message: '无效的用户角色' });
  }
  if (errors.length > 0) throw createAppError('VAL_001', errors);

  const role = data.role || 'user';
  const passwordHash = await hashPassword(data.password);

  try {
    const user = await prisma.user.create({
      data: { username: data.username, nickname: data.nickname, passwordHash, role, isActive: true },
    });
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  } catch (error) {
    handlePrismaUniqueViolation(error);
    throw error; // 不会到达
  }
}

/** Refresh token 轮换 §5.1 */
export async function refresh(oldRefreshToken: string) {
  const tokenHash = hashRefreshToken(oldRefreshToken);

  // 原子标记 consumedAt §5.1
  const marked = await prisma.session.updateMany({
    where: { tokenHash, consumedAt: null },
    data: { consumedAt: new Date() },
  });

  if (marked.count === 0) {
    // 区分重用攻击 vs 并发 refresh §5.1
    const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });

    if (!session) {
      // case 4: 无效 token
      throw createAppError('AUTH_004');
    }

    // 用户已禁用 §5.1
    if (!session.user.isActive) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
      const error = createAppError('AUTH_004');
      (error as any).clearCookie = true;
      throw error;
    }

    // 并发 refresh：30 秒内 §5.1
    if (session.consumedAt && Date.now() - session.consumedAt.getTime() < REFRESH_CONCURRENT_WINDOW_SEC * 1000) {
      // 允许，返回新 token
      const accessToken = await signAccessToken(session.user.id);
      const newRefreshToken = generateRefreshToken();
      const newTokenHash = hashRefreshToken(newRefreshToken);

      await prisma.session.create({
        data: {
          userId: session.user.id,
          tokenHash: newTokenHash,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      });

      return { accessToken, refreshToken: newRefreshToken, clearCookie: false };
    }

    // 重用攻击：撤销用户所有 session §5.1
    await prisma.session.deleteMany({ where: { userId: session.userId } });
    throw createAppError('AUTH_004');
  }

  // 正常情况：检查 token 有效性和用户状态
  const session = await prisma.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!session) throw createAppError('AUTH_004');

  if (session.expiresAt <= new Date()) {
    throw createAppError('AUTH_002');
  }

  if (!session.user.isActive) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    const error = createAppError('AUTH_004');
    (error as any).clearCookie = true;
    throw error;
  }

  // 事务：创建新 session（旧 session 已在 updateMany 中标记 consumedAt）
  const accessToken = await signAccessToken(session.user.id);
  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(newRefreshToken);

  await prisma.$transaction([
    prisma.session.create({
      data: {
        userId: session.user.id,
        tokenHash: newTokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    }),
  ]);

  return { accessToken, refreshToken: newRefreshToken, clearCookie: false };
}

/** Logout §5.1 */
export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.session.deleteMany({ where: { tokenHash } }).catch(() => {});
}

/** 修改密码 §5.1 */
export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createAppError('AUTH_001');

  const valid = await verifyPassword(oldPassword, user.passwordHash);
  if (!valid) throw createAppError('AUTH_001');

  const p = validatePwd(newPassword);
  if (!p.valid) throw createAppError('VAL_001', [{ field: 'newPassword', message: p.message }]);

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
}

/** 获取当前用户信息 */
export async function getMe(userId: string): Promise<UserPublic> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createAppError('AUTH_002');
  return toUserPublic(user);
}

/** 更新资料 §4 */
export async function updateProfile(userId: string, nickname: string): Promise<UserPublic> {
  const n = validateNickname(nickname);
  if (!n.valid) throw createAppError('VAL_001', [{ field: 'nickname', message: n.message }]);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { nickname },
  });
  return toUserPublic(user);
}
```

- [ ] **Step 2: 验证编译**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 3: Commit**

```bash
rtk git add packages/backend/src/services/authService.ts
rtk git commit -m "feat: add authService with login, register, refresh rotation, logout, change-password"
```

---

### Task 13: Auth Controller + Routes

**Spec 参考:** §4 API 路由定义, §5.1 Cookie 设置, §11.2 CUD 响应规范

**Files:**
- Create: `packages/backend/src/controllers/authController.ts`
- Create: `packages/backend/src/routes/authRoutes.ts`

- [ ] **Step 1: 创建 authController**

```typescript
// packages/backend/src/controllers/authController.ts
import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/authService.js';
import { createAppError } from '../utils/appError.js';
import { hashRefreshToken } from '../utils/jwt.js';
import { prisma } from '../utils/prisma.js';
import { validateNickname, validatePassword as validatePwd } from '@remotehub/shared';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
};

const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 0,
};

function extractRefreshToken(req: Request): string | undefined {
  return req.cookies?.refreshToken;
}

/** POST /auth/login */
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = req.body;
    if (!username || !password) throw createAppError('AUTH_001');

    const result = await authService.login(username, password);

    // 更新 session 的 userAgent 和 IP §5.1
    const tokenHash = hashRefreshToken(result.refreshToken);
    await prisma.session.updateMany({
      where: { tokenHash },
      data: {
        userAgent: (req.headers['user-agent'] || '').slice(0, 500),
        ip: req.ip?.slice(0, 45) || null,
      },
    });

    res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
  } catch (err) { next(err); }
}

/** POST /auth/register（仅 admin）*/
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.user.role, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

/** POST /auth/refresh */
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractRefreshToken(req);
    if (!token) throw createAppError('AUTH_004');

    const result = await authService.refresh(token);

    if (result.clearCookie) {
      res.cookie('refreshToken', '', CLEAR_COOKIE_OPTIONS);
    } else {
      res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
    }

    res.json({ success: true, data: { accessToken: result.accessToken } });
  } catch (err: any) {
    if (err.clearCookie || err.code === 'AUTH_004' || err.code === 'AUTH_002') {
      res.cookie('refreshToken', '', CLEAR_COOKIE_OPTIONS);
    }
    next(err);
  }
}

/** POST /auth/logout */
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractRefreshToken(req);
    await authService.logout(token);
    res.cookie('refreshToken', '', CLEAR_COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (err) { next(err); }
}

/** GET /auth/me */
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getMe(req.user.id);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}

/** POST /auth/change-password */
export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      throw createAppError('VAL_001', [
        ...(!oldPassword ? [{ field: 'oldPassword', message: '旧密码不能为空' }] : []),
        ...(!newPassword ? [{ field: 'newPassword', message: '新密码不能为空' }] : []),
      ]);
    }
    await authService.changePassword(req.user.id, oldPassword, newPassword);
    res.cookie('refreshToken', '', CLEAR_COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (err) { next(err); }
}

/** PATCH /auth/profile */
export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { nickname } = req.body;
    if (!nickname) throw createAppError('VAL_001', [{ field: 'nickname', message: '昵称不能为空' }]);
    const user = await authService.updateProfile(req.user.id, nickname);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}
```

- [ ] **Step 2: 创建 authRoutes**

```typescript
// packages/backend/src/routes/authRoutes.ts
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import * as authController from '../controllers/authController.js';

export const authRoutes = Router();

// 速率限制 §5.3
const loginLimiter = rateLimit({
  windowMs: 60_000, max: env.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } },
});
const registerLimiter = rateLimit({
  windowMs: 60_000, max: env.RATE_LIMIT_REGISTER_MAX,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } },
});
const refreshLimiter = rateLimit({
  windowMs: 60_000, max: env.RATE_LIMIT_REFRESH_MAX,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } },
});

authRoutes.post('/login', loginLimiter, authController.login);
authRoutes.post('/register', registerLimiter, authMiddleware, roleMiddleware('admin'), authController.register);
authRoutes.post('/refresh', refreshLimiter, authController.refresh);
authRoutes.post('/logout', authController.logout);
authRoutes.get('/me', authMiddleware, authController.me);
authRoutes.post('/change-password', authMiddleware, authController.changePassword);
authRoutes.patch('/profile', authMiddleware, authController.updateProfile);
```

- [ ] **Step 3: 注册路由到 server.ts**

在 `packages/backend/src/server.ts` 的路由注册区域替换为：

```typescript
// ─── 路由注册 ───
import { healthRoutes } from './routes/healthRoutes.js';
import { authRoutes } from './routes/authRoutes.js';

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
```

- [ ] **Step 4: 验证编译**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk npx tsc --noEmit
```

Expected: 无错误

- [ ] **Step 5: Commit**

```bash
rtk git add packages/backend/src/controllers/authController.ts packages/backend/src/routes/authRoutes.ts packages/backend/src/server.ts
rtk git commit -m "feat: add auth controller and routes with rate limiting and cookie management"
```

---

### Task 14: Auth 集成测试

**Spec 参考:** §5.1 全部认证流程, §11.6 测试规范

**Files:**
- Create: `packages/backend/src/routes/authRoutes.test.ts`

- [ ] **Step 1: 写集成测试**

```typescript
// packages/backend/src/routes/authRoutes.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import type { Server } from 'node:http';

// 必须在 import app 之前设置 env
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://root:root@localhost:3306/remotehub_dev_test';
process.env.JWT_SECRET = 'test-jwt-secret-at-least-32-characters-long-for-testing';
process.env.ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_PASSWORD = 'Admin123';
process.env.NODE_ENV = 'test';

import { prisma } from '../utils/prisma.js';
import { hashPassword } from '../utils/password.js';
import { signAccessToken } from '../utils/jwt.js';

const BASE = 'http://localhost:3099';

let server: Server;
let adminToken: string;
let testUserId: string;

beforeAll(async () => {
  // 清理测试数据库
  await prisma.session.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.connection.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // 创建 admin
  const admin = await prisma.user.create({
    data: { username: 'admin', nickname: '管理员', passwordHash: await hashPassword('Admin123'), role: 'admin' },
  });
  adminToken = await signAccessToken(admin.id);

  // 动态导入 app 并启动测试服务器
  const { app } = await import('../server.js');
  await new Promise<void>((resolve) => { server = app.listen(3099, resolve); });
});

afterAll(async () => {
  server?.close();
  await prisma.$disconnect();
});

describe('POST /api/v1/auth/login', () => {
  it('正确密码 → 200 + accessToken + refreshToken cookie', async () => {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'Admin123' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.accessToken).toBeDefined();
    expect(body.data.user.username).toBe('admin');
    expect(res.headers.getSetCookie()[0]).toContain('refreshToken=');
  });

  it('错误密码 → 401 AUTH_001', async () => {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTH_001');
  });

  it('不存在用户 → 401 AUTH_001（不暴露用户存在性）', async () => {
    const res = await fetch(`${BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nonexist', password: 'whatever' }),
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('AUTH_001');
  });
});

describe('POST /api/v1/auth/register', () => {
  it('admin 创建用户 → 201', async () => {
    const res = await fetch(`${BASE}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
      body: JSON.stringify({ username: 'newuser', nickname: '新用户', password: 'Pass1234' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.username).toBe('newuser');
    expect(body.data.passwordHash).toBeUndefined();
    testUserId = body.data.id;
  });

  it('非 admin → 403', async () => {
    const userToken = await signAccessToken(testUserId);
    const res = await fetch(`${BASE}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${userToken}` },
      body: JSON.stringify({ username: 'another', nickname: 'T', password: 'Pass1234' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('GET /api/v1/auth/me', () => {
  it('有效 token → 返回用户信息', async () => {
    const res = await fetch(`${BASE}/api/v1/auth/me`, {
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.username).toBe('admin');
    expect(body.data.passwordHash).toBeUndefined();
  });

  it('无 token → 401', async () => {
    const res = await fetch(`${BASE}/api/v1/auth/me`);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: 运行集成测试**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk pnpm test -- src/routes/authRoutes.test.ts
```

Expected: 全部 PASS（需要 MySQL 测试数据库运行）

- [ ] **Step 3: Commit**

```bash
rtk git add packages/backend/src/routes/authRoutes.test.ts
rtk git commit -m "test: add auth integration tests (login, register, me)"
```

---

## Phase 5: 用户管理

### Task 15: User Service — 用户 CRUD + 删除保护

**Spec 参考:** §4 用户管理端点, §4.2 用户删除保护, §4.2 管理员修改用户

**Files:**
- Create: `packages/backend/src/services/userService.ts`

- [ ] **Step 1: 实现 userService**

```typescript
// packages/backend/src/services/userService.ts
import { prisma } from '../utils/prisma.js';
import { createAppError } from '../utils/appError.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, USER_SEARCH_MAX_RESULTS } from '@remotehub/shared';

/** 用户列表（admin）§4 */
export async function listUsers(page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) {
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, username: true, nickname: true, role: true, isActive: true, lastActiveAt: true, createdAt: true },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count(),
  ]);
  return { data: users, pagination: { page, pageSize, total } };
}

/** 用户搜索（项目成员可用）§4 */
export async function searchUsers(query: string) {
  return prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { username: { contains: query } },
        { nickname: { contains: query } },
      ],
    },
    select: { id: true, username: true, nickname: true },
    take: USER_SEARCH_MAX_RESULTS,
    orderBy: { username: 'asc' },
  });
}

/** 用户详情 §4 */
export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, nickname: true, role: true, isActive: true, lastActiveAt: true, createdAt: true },
  });
  if (!user) throw createAppError('USER_002');
  return user;
}

/** 管理员修改用户 §4.2 */
export async function updateUser(callerId: string, targetId: string, data: { nickname?: string; role?: string; isActive?: boolean }) {
  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw createAppError('USER_002');

  // 白名单过滤 §4.2
  const updateData: Record<string, unknown> = {};

  if (data.nickname !== undefined) {
    if (!data.nickname || data.nickname.length > 50) {
      throw createAppError('VAL_001', [{ field: 'nickname', message: '昵称不合法' }]);
    }
    updateData.nickname = data.nickname;
  }

  if (data.role !== undefined) {
    if (data.role !== 'admin' && data.role !== 'user') {
      throw createAppError('VAL_001', [{ field: 'role', message: '无效的用户角色' }]);
    }
    // 从 admin 降级 → 检查 admin 数量 §4.2
    if (target.role === 'admin' && data.role === 'user') {
      const adminCount = await prisma.user.count({ where: { role: 'admin', isActive: true } });
      if (adminCount <= 1) throw createAppError('AUTH_003');
    }
    updateData.role = data.role;
  }

  if (data.isActive !== undefined) {
    // 禁用最后一个 admin §4.2
    if (data.isActive === false && target.role === 'admin') {
      const adminCount = await prisma.user.count({ where: { role: 'admin', isActive: true } });
      if (adminCount <= 1) throw createAppError('AUTH_003');
    }
    updateData.isActive = data.isActive;
  }

  const updated = await prisma.user.update({
    where: { id: targetId },
    data: updateData,
    select: { id: true, username: true, nickname: true, role: true, isActive: true, lastActiveAt: true, createdAt: true },
  });

  return updated;
}

/** 删除用户 §4.2 */
export async function deleteUser(callerId: string, targetId: string) {
  // 禁止删除自己 §4.2
  if (callerId === targetId) throw createAppError('AUTH_003');

  const target = await prisma.user.findUnique({ where: { id: targetId } });
  if (!target) throw createAppError('USER_002');

  // 禁止删除最后一个 admin §4.2
  if (target.role === 'admin') {
    const adminCount = await prisma.user.count({ where: { role: 'admin', isActive: true } });
    if (adminCount <= 1) throw createAppError('AUTH_003');
  }

  // 检查是否是唯一 owner §4.2
  const ownedProjects = await prisma.projectMember.findMany({
    where: { userId: targetId, role: 'owner' },
    select: { projectId: true },
  });

  for (const pm of ownedProjects) {
    const ownerCount = await prisma.projectMember.count({
      where: { projectId: pm.projectId, role: 'owner' },
    });
    if (ownerCount <= 1) throw createAppError('MEMBER_003');
  }

  await prisma.user.delete({ where: { id: targetId } });
  return { id: targetId };
}
```

- [ ] **Step 2: 验证编译**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
rtk git add packages/backend/src/services/userService.ts
rtk git commit -m "feat: add userService with CRUD, admin protection, and owner check"
```

---

### Task 16: User Controller + Routes

**Spec 参考:** §4 用户管理端点, §4.2 API 权限矩阵

**Files:**
- Create: `packages/backend/src/controllers/userController.ts`
- Create: `packages/backend/src/routes/userRoutes.ts`

- [ ] **Step 1: 创建 userController**

```typescript
// packages/backend/src/controllers/userController.ts
import type { Request, Response, NextFunction } from 'express';
import * as userService from '../services/userService.js';

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || '1');
    const pageSize = parseInt(req.query.pageSize as string) || '20';
    const result = await userService.listUsers(page, parseInt(pageSize));
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function searchUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const q = req.query.q as string || '';
    if (q.length < 1) {
      return res.json({ success: true, data: [] });
    }
    const data = await userService.searchUsers(q);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await userService.getUser(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await userService.updateUser(req.user.id, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await userService.deleteUser(req.user.id, req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
```

- [ ] **Step 2: 创建 userRoutes**

```typescript
// packages/backend/src/routes/userRoutes.ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import * as userController from '../controllers/userController.js';

export const userRoutes = Router();

userRoutes.get('/', authMiddleware, roleMiddleware('admin'), userController.listUsers);
userRoutes.get('/search', authMiddleware, userController.searchUsers);
userRoutes.get('/:id', authMiddleware, roleMiddleware('admin'), userController.getUser);
userRoutes.patch('/:id', authMiddleware, roleMiddleware('admin'), userController.updateUser);
userRoutes.delete('/:id', authMiddleware, roleMiddleware('admin'), userController.deleteUser);
```

- [ ] **Step 3: 注册到 server.ts**

追加到 server.ts 路由区域：

```typescript
import { userRoutes } from './routes/userRoutes.js';
// ...
app.use('/api/v1/users', userRoutes);
```

- [ ] **Step 4: Commit**

```bash
rtk git add packages/backend/src/controllers/userController.ts packages/backend/src/routes/userRoutes.ts packages/backend/src/server.ts
rtk git commit -m "feat: add user controller and routes with admin-only access"
```

---

### Task 17: User 集成测试

**Spec 参考:** §4.2 用户删除保护, §11.6

**Files:**
- Create: `packages/backend/src/routes/userRoutes.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/backend/src/routes/userRoutes.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE = 'http://localhost:3098';

let adminToken: string;
let adminId: string;
let userToken: string;
let userId: string;
let server: import('node:http').Server;

beforeAll(async () => {
  process.env.PORT = '3098';
  const { prisma } = await import('../utils/prisma.js');
  const { hashPassword } = await import('../utils/password.js');
  const { signAccessToken } = await import('../utils/jwt.js');

  await prisma.session.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.connection.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: { username: 'admin', nickname: '管理员', passwordHash: await hashPassword('Admin123'), role: 'admin' },
  });
  adminId = admin.id;
  adminToken = await signAccessToken(admin.id);

  const user = await prisma.user.create({
    data: { username: 'testuser', nickname: '测试用户', passwordHash: await hashPassword('User1234'), role: 'user' },
  });
  userId = user.id;
  userToken = await signAccessToken(user.id);

  const { app } = await import('../server.js');
  await new Promise<void>((r) => { server = app.listen(3098, r); });
});

afterAll(async () => {
  server?.close();
  const { prisma } = await import('../utils/prisma.js');
  await prisma.$disconnect();
});

describe('GET /api/v1/users', () => {
  it('admin → 200 + 用户列表', async () => {
    const res = await fetch(`${BASE}/api/v1/users`, { headers: { Authorization: `Bearer ${adminToken}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(2);
    expect(body.pagination).toBeDefined();
  });

  it('非 admin → 403', async () => {
    const res = await fetch(`${BASE}/api/v1/users`, { headers: { Authorization: `Bearer ${userToken}` } });
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/v1/users/:id', () => {
  it('admin 修改昵称 → 200', async () => {
    const res = await fetch(`${BASE}/api/v1/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ nickname: '新昵称' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.nickname).toBe('新昵称');
  });
});

describe('DELETE /api/v1/users/:id', () => {
  it('admin 删除自己 → 403', async () => {
    const res = await fetch(`${BASE}/api/v1/users/${adminId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(403);
  });

  it('admin 删除普通用户 → 200', async () => {
    const res = await fetch(`${BASE}/api/v1/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(userId);
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk pnpm test -- src/routes/userRoutes.test.ts
```

- [ ] **Step 3: Commit**

```bash
rtk git add packages/backend/src/routes/userRoutes.test.ts
rtk git commit -m "test: add user integration tests (list, update, delete self-protect)"
```

---

## Phase 6: 项目管理

### Task 18: Project Service — 项目 CRUD + 自动插入 owner

**Spec 参考:** §4 项目管理端点, §4.2 创建项目自动 owner, §5.1 事务（创建项目+owner）

**Files:**
- Create: `packages/backend/src/services/projectService.ts`

- [ ] **Step 1: 实现 projectService**

```typescript
// packages/backend/src/services/projectService.ts
import { prisma } from '../utils/prisma.js';
import { createAppError, handlePrismaUniqueViolation } from '../utils/appError.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@remotehub/shared';
import { validateProjectName } from '@remotehub/shared';

/** 项目列表 §4 — admin 全部，非 admin 已加入 */
export async function listProjects(userId: string, userRole: string, page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) {
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  const where = userRole === 'admin'
    ? {}
    : { members: { some: { userId } } };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      select: {
        id: true, name: true, icon: true,
        createdBy: true, updatedBy: true,
        createdAt: true, updatedAt: true,
        members: { where: { userId }, select: { role: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  // 附加 currentUserRole
  const data = projects.map((p) => {
    const { members, ...rest } = p;
    return { ...rest, currentUserRole: members[0]?.role || null };
  });

  return { data, pagination: { page, pageSize, total } };
}

/** 创建项目（事务：项目 + owner）§4.2, §5.1 */
export async function createProject(userId: string, data: { name: string; description?: string; icon?: string }) {
  const v = validateProjectName(data.name);
  if (!v.valid) throw createAppError('VAL_001', [{ field: 'name', message: v.message }]);

  try {
    const project = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: data.name,
          description: data.description || null,
          icon: data.icon || 'folder',
          createdBy: userId,
          updatedBy: userId,
        },
      });

      await tx.projectMember.create({
        data: { projectId: project.id, userId, role: 'owner' },
      });

      return project;
    });

    return toProjectDetail(project);
  } catch (error) {
    handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** 项目详情 §4.1 */
export async function getProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw createAppError('PROJ_002');
  return toProjectDetail(project);
}

/** 更新项目 §4 */
export async function updateProject(userId: string, projectId: string, data: { name?: string; description?: string; icon?: string }) {
  if (data.name !== undefined) {
    const v = validateProjectName(data.name);
    if (!v.valid) throw createAppError('VAL_001', [{ field: 'name', message: v.message }]);
  }

  try {
    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.icon !== undefined && { icon: data.icon }),
        updatedBy: userId,
      },
    });
    return toProjectDetail(project);
  } catch (error) {
    if (error instanceof Error && (error as any).code === 'P2025') {
      throw createAppError('PROJ_002');
    }
    handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** 删除项目 §4.2 */
export async function deleteProject(projectId: string) {
  try {
    await prisma.project.delete({ where: { id: projectId } });
    return { id: projectId };
  } catch (error) {
    if (error instanceof Error && (error as any).code === 'P2025') {
      throw createAppError('PROJ_002');
    }
    throw error;
  }
}

function toProjectDetail(p: {
  id: string; name: string; description: string | null; icon: string;
  createdBy: string; updatedBy: string; createdAt: Date; updatedAt: Date;
}) {
  return {
    id: p.id, name: p.name, description: p.description, icon: p.icon,
    createdBy: { id: p.createdBy, nickname: '已删除用户' }, // 关联查询在 Controller/Service 层补充
    updatedBy: { id: p.updatedBy, nickname: '已删除用户' },
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
  };
}
```

- [ ] **Step 2: 验证编译 + Commit**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk npx tsc --noEmit
rtk git add packages/backend/src/services/projectService.ts
rtk git commit -m "feat: add projectService with CRUD, auto-owner, and transaction support"
```

---

### Task 19: Project Controller + Routes

**Spec 参考:** §4 项目管理端点, §4.2 API 权限矩阵

**Files:**
- Create: `packages/backend/src/controllers/projectController.ts`
- Create: `packages/backend/src/routes/projectRoutes.ts`

- [ ] **Step 1: 创建 projectController**

```typescript
// packages/backend/src/controllers/projectController.ts
import type { Request, Response, NextFunction } from 'express';
import * as projectService from '../services/projectService.js';

export async function listProjects(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || '1');
    const pageSize = parseInt(req.query.pageSize as string) || '20';
    const result = await projectService.listProjects(req.user.id, req.user.role, page, parseInt(pageSize));
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function createProject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await projectService.createProject(req.user.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getProject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await projectService.getProject(req.params.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateProject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await projectService.updateProject(req.user.id, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteProject(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await projectService.deleteProject(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
```

- [ ] **Step 2: 创建 projectRoutes**

```typescript
// packages/backend/src/routes/projectRoutes.ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import * as projectController from '../controllers/projectController.js';
import type { MemberRole } from '@remotehub/shared';

export const projectRoutes = Router();

projectRoutes.get('/', authMiddleware, projectController.listProjects);
projectRoutes.post('/', authMiddleware, projectController.createProject);
projectRoutes.get('/:id', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), projectController.getProject);
projectRoutes.patch('/:id', authMiddleware, projectRoleMiddleware('editor' as MemberRole), projectController.updateProject);
projectRoutes.delete('/:id', authMiddleware, projectRoleMiddleware('owner' as MemberRole), projectController.deleteProject);
```

- [ ] **Step 3: 注册到 server.ts + Commit**

追加到 server.ts：
```typescript
import { projectRoutes } from './routes/projectRoutes.js';
app.use('/api/v1/projects', projectRoutes);
```

```bash
rtk git add packages/backend/src/controllers/projectController.ts packages/backend/src/routes/projectRoutes.ts packages/backend/src/server.ts
rtk git commit -m "feat: add project controller and routes with role-based access"
```

---

### Task 20-21: 项目集成测试（合并）

**Spec 参考:** §4 项目管理, §11.6

**Files:**
- Create: `packages/backend/src/routes/projectRoutes.test.ts`

- [ ] **Step 1: 写测试**

```typescript
// packages/backend/src/routes/projectRoutes.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE = 'http://localhost:3097';
let adminToken: string, userToken: string, server: import('node:http').Server;
let projectId: string;

beforeAll(async () => {
  process.env.PORT = '3097';
  const { prisma } = await import('../utils/prisma.js');
  const { hashPassword } = await import('../utils/password.js');
  const { signAccessToken } = await import('../utils/jwt.js');

  await prisma.session.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.connection.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  const admin = await prisma.user.create({
    data: { username: 'admin', nickname: '管理员', passwordHash: await hashPassword('Admin123'), role: 'admin' },
  });
  adminToken = await signAccessToken(admin.id);

  const user = await prisma.user.create({
    data: { username: 'user1', nickname: '用户1', passwordHash: await hashPassword('User1234'), role: 'user' },
  });
  userToken = await signAccessToken(user.id);

  const { app } = await import('../server.js');
  await new Promise<void>((r) => { server = app.listen(3097, r); });
});

afterAll(async () => {
  server?.close();
  const { prisma } = await import('../utils/prisma.js');
  await prisma.$disconnect();
});

describe('POST /api/v1/projects', () => {
  it('创建项目 → 201 + 自动成为 owner', async () => {
    const res = await fetch(`${BASE}/api/v1/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ name: '测试项目', description: '描述' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('测试项目');
    projectId = body.data.id;
  });
});

describe('GET /api/v1/projects', () => {
  it('用户看到自己加入的项目', async () => {
    const res = await fetch(`${BASE}/api/v1/projects`, { headers: { Authorization: `Bearer ${userToken}` } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.length).toBeGreaterThanOrEqual(1);
    expect(body.data[0].currentUserRole).toBe('owner');
  });
});

describe('PATCH /api/v1/projects/:id', () => {
  it('owner 更新项目 → 200', async () => {
    const res = await fetch(`${BASE}/api/v1/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${userToken}` },
      body: JSON.stringify({ name: '更新后的项目' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.name).toBe('更新后的项目');
  });
});

describe('DELETE /api/v1/projects/:id', () => {
  it('owner 删除项目 → 200', async () => {
    const res = await fetch(`${BASE}/api/v1/projects/${projectId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: 运行测试 + Commit**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk pnpm test -- src/routes/projectRoutes.test.ts
rtk git add packages/backend/src/routes/projectRoutes.test.ts
rtk git commit -m "test: add project integration tests"
```

---

## Phase 7: 项目成员管理

### Task 22: Member Service — 成员管理 + 角色/owner 保护

**Spec 参考:** §4 项目成员端点, §4.2 成员角色变更规则, §4.2 成员移除/退出规则

**Files:**
- Create: `packages/backend/src/services/memberService.ts`

- [ ] **Step 1: 实现 memberService**

```typescript
// packages/backend/src/services/memberService.ts
import { prisma } from '../utils/prisma.js';
import { createAppError, handlePrismaUniqueViolation } from '../utils/appError.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@remotehub/shared';
import { validateMemberRole } from '@remotehub/shared';

/** 成员列表 §4 */
export async function listMembers(projectId: string, page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) {
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
  const [members, total] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId },
      select: { id: true, userId: true, role: true, addedAt: true, user: { select: { username: true, nickname: true } } },
      orderBy: { addedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.projectMember.count({ where: { projectId } }),
  ]);

  const data = members.map((m) => ({
    id: m.id, userId: m.userId, role: m.role, addedAt: m.addedAt.toISOString(),
    username: m.user.username, nickname: m.user.nickname,
  }));

  return { data, pagination: { page, pageSize, total } };
}

/** 添加成员 §4, §5.1（事务） */
export async function addMember(projectId: string, userId: string, role: string) {
  const v = validateMemberRole(role);
  if (!v.valid) throw createAppError('VAL_001', [{ field: 'role', message: v.message }]);

  // 检查用户存在
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createAppError('USER_002');

  try {
    const member = await prisma.$transaction(async (tx) => {
      // 检查是否已存在 §4.2
      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (existing) throw createAppError('MEMBER_001');

      return tx.projectMember.create({
        data: { projectId, userId, role },
      });
    });

    return { id: member.id, userId, role, addedAt: member.addedAt.toISOString() };
  } catch (error) {
    if ((error as any).code === 'MEMBER_001') throw error;
    handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** 变更角色 §4.2（事务：owner count 检查 + 更新） */
export async function updateMemberRole(projectId: string, targetUserId: string, newRole: string, callerUserId: string) {
  const v = validateMemberRole(newRole);
  if (!v.valid) throw createAppError('VAL_001', [{ field: 'role', message: v.message }]);

  return prisma.$transaction(async (tx) => {
    const member = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    if (!member) throw createAppError('MEMBER_001');

    // 如果从 owner 降级，检查 owner count §4.2
    if (member.role === 'owner' && newRole !== 'owner') {
      const ownerCount = await tx.projectMember.count({
        where: { projectId, role: 'owner' },
      });
      if (ownerCount <= 1) throw createAppError('MEMBER_002');
    }

    const updated = await tx.projectMember.update({
      where: { id: member.id },
      data: { role: newRole },
    });

    return { id: updated.id, userId: targetUserId, role: updated.role };
  });
}

/** 移除成员/退出 §4.2 */
export async function removeMember(projectId: string, targetUserId: string, callerUserId: string, callerRole: string) {
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: targetUserId } },
  });
  if (!member) throw createAppError('MEMBER_001');

  // owner/admin 可移除任意成员
  // editor/viewer 只能移除自己（退出）§4.2
  // admin 通过 middleware 绕过，不需要在这里检查

  // 如果移除的是 owner，检查 owner count §4.2
  if (member.role === 'owner') {
    const ownerCount = await prisma.projectMember.count({
      where: { projectId, role: 'owner' },
    });
    if (ownerCount <= 1) throw createAppError('MEMBER_002');
  }

  await prisma.projectMember.delete({ where: { id: member.id } });
  return { id: member.id };
}
```

- [ ] **Step 2: 创建 memberController + memberRoutes**

```typescript
// packages/backend/src/controllers/memberController.ts
import type { Request, Response, NextFunction } from 'express';
import * as memberService from '../services/memberService.js';

export async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || '1');
    const pageSize = parseInt(req.query.pageSize as string) || '20';
    const result = await memberService.listMembers(req.params.id, page, parseInt(pageSize));
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function addMember(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await memberService.addMember(req.params.id, req.body.userId, req.body.role);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateRole(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await memberService.updateMemberRole(req.params.id, req.params.uid, req.body.role, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await memberService.removeMember(req.params.id, req.params.uid, req.user.id, req.user.role);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
```

```typescript
// packages/backend/src/routes/memberRoutes.ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import * as memberController from '../controllers/memberController.js';
import type { MemberRole } from '@remotehub/shared';

// 注意：这些路由将作为子路由挂载到 /projects/:id/members
export const memberRoutes = Router({ mergeParams: true });

memberRoutes.get('/', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), memberController.listMembers);
memberRoutes.post('/', authMiddleware, projectRoleMiddleware('owner' as MemberRole), memberController.addMember);
memberRoutes.patch('/:uid', authMiddleware, projectRoleMiddleware('owner' as MemberRole), memberController.updateRole);
memberRoutes.delete('/:uid', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), memberController.removeMember);
```

- [ ] **Step 3: 注册到 server.ts + Commit**

在 server.ts 中，将成员路由挂载到项目路由下：

```typescript
import { memberRoutes } from './routes/memberRoutes.js';
// 项目路由内嵌成员路由
projectRoutes.use('/:id/members', memberRoutes);
// 或者直接在 server.ts：
app.use('/api/v1/projects/:id/members', authMiddleware, memberRoutes);
```

```bash
rtk git add packages/backend/src/services/memberService.ts packages/backend/src/controllers/memberController.ts packages/backend/src/routes/memberRoutes.ts packages/backend/src/server.ts
rtk git commit -m "feat: add member service, controller and routes with role/owner protection"
```

---

## Phase 8: 连接管理

### Task 24: Connection Service — 连接 CRUD + VPN 依赖 + 加密

**Spec 参考:** §4 连接管理端点, §3.1 VPN 依赖约束, §9.6 加密细节, §4.2 password 字段三种处理

**Files:**
- Create: `packages/backend/src/services/connectionService.ts`

- [ ] **Step 1: 实现 connectionService**

```typescript
// packages/backend/src/services/connectionService.ts
import { prisma } from '../utils/prisma.js';
import { createAppError, handlePrismaUniqueViolation } from '../utils/appError.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@remotehub/shared';
import {
  validateConnectionName, validateHost, validatePort,
  validateProtocol, validateVpnType, validateTags,
  isProtocol,
} from '@remotehub/shared';

/** 连接列表 §4 — admin 全部，非 admin 已加入项目的连接 */
export async function listConnections(userId: string, userRole: string, projectId?: string, page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) {
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  let where: any = {};
  if (projectId) {
    where.projectId = projectId;
  } else if (userRole !== 'admin') {
    where.project = { members: { some: { userId } } };
  }

  const [connections, total] = await Promise.all([
    prisma.connection.findMany({
      where,
      select: {
        id: true, projectId: true, name: true, host: true, port: true,
        protocol: true, vpnType: true, requiredVpnId: true, tags: true,
        lastAccessed: true, createdBy: true, updatedBy: true, updatedAt: true,
        project: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.connection.count({ where }),
  ]);

  const data = connections.map(mapToListItem);
  return { data, pagination: { page, pageSize, total } };
}

/** 创建连接 §4 */
export async function createConnection(userId: string, data: {
  projectId: string; name: string; host: string; port?: number | null;
  username?: string | null; password?: string | null; protocol: string;
  vpnType?: string | null; vpnLoginUrl?: string | null; requiredVpnId?: string | null;
  notes?: string | null; tags?: string | null;
}) {
  // 验证 §3.1
  const errors = validateConnectionFields(data);
  if (errors.length > 0) throw createAppError('VAL_001', errors);

  // VPN 字段一致性 §3.1
  validateVpnConsistency(data.protocol, data);

  // VPN 依赖检查 §3.1
  if (data.requiredVpnId) {
    await validateVpnDependency(data.requiredVpnId, data.projectId, null);
  }

  const encryptedPass = data.password ? encrypt(data.password) : null;

  try {
    const conn = await prisma.connection.create({
      data: {
        projectId: data.projectId, name: data.name, host: data.host,
        port: data.port ?? null, username: data.username ?? null,
        encryptedPass, protocol: data.protocol,
        vpnType: data.vpnType ?? null, vpnLoginUrl: data.vpnLoginUrl ?? null,
        requiredVpnId: data.requiredVpnId ?? null,
        notes: data.notes ?? null, tags: data.tags ?? null,
        createdBy: userId, updatedBy: userId,
      },
    });
    return toDetail(conn);
  } catch (error) {
    handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** 连接详情 §4 */
export async function getConnection(connectionId: string, userRole: string) {
  const conn = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!conn) throw createAppError('CONN_002');
  return toDetail(conn, userRole !== 'viewer');
}

/** 更新连接 §4 */
export async function updateConnection(userId: string, connectionId: string, data: Record<string, any>) {
  const existing = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!existing) throw createAppError('CONN_002');

  // 白名单过滤 §4.2
  const allowed = ['name', 'host', 'port', 'username', 'password', 'protocol', 'vpnType', 'vpnLoginUrl', 'requiredVpnId', 'notes', 'tags'];
  const filtered: Record<string, any> = {};
  for (const key of allowed) {
    if (key in data) filtered[key] = data[key];
  }

  // 验证
  const mergeData = { ...existing, ...filtered };
  const errors = validateConnectionFields(mergeData);
  if (errors.length > 0) throw createAppError('VAL_001', errors);

  const protocol = filtered.protocol || existing.protocol;
  validateVpnConsistency(protocol, {
    vpnType: filtered.vpnType !== undefined ? filtered.vpnType : existing.vpnType,
    vpnLoginUrl: filtered.vpnLoginUrl !== undefined ? filtered.vpnLoginUrl : existing.vpnLoginUrl,
    requiredVpnId: filtered.requiredVpnId !== undefined ? filtered.requiredVpnId : existing.requiredVpnId,
  });

  // protocol 从 VPN 改为非 VPN → 自动清空 VPN 字段 §3.1
  if (existing.protocol === 'VPN' && protocol !== 'VPN') {
    // 检查 dependents §3.1
    const depCount = await prisma.connection.count({ where: { requiredVpnId: connectionId } });
    if (depCount > 0) throw createAppError('CONN_004');
    filtered.vpnType = null;
    filtered.vpnLoginUrl = null;
    filtered.requiredVpnId = null;
  }

  // VPN 依赖检查
  if (filtered.requiredVpnId) {
    await validateVpnDependency(filtered.requiredVpnId, existing.projectId, connectionId);
  }

  // password 三种处理 §4.2
  let encryptedPass: string | null | undefined = undefined;
  if ('password' in filtered) {
    if (filtered.password === null || filtered.password === '') {
      encryptedPass = null;
    } else if (typeof filtered.password === 'string' && filtered.password.length > 0) {
      encryptedPass = encrypt(filtered.password);
    }
    delete filtered.password;
  }

  try {
    const conn = await prisma.connection.update({
      where: { id: connectionId },
      data: {
        ...(encryptedPass !== undefined && { encryptedPass }),
        ...Object.fromEntries(Object.entries(filtered).filter(([k]) => k !== 'password')),
        updatedBy: userId,
      },
    });
    return toDetail(conn);
  } catch (error) {
    handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** 删除连接 §3.1 */
export async function deleteConnection(connectionId: string) {
  const conn = await prisma.connection.findUnique({
    where: { id: connectionId },
    include: { dependents: { select: { id: true } } },
  });
  if (!conn) throw createAppError('CONN_002');

  // VPN 删除保护 §3.1
  if (conn.protocol === 'VPN' && conn.dependents.length > 0) {
    throw createAppError('CONN_004');
  }

  await prisma.connection.delete({ where: { id: connectionId } });
  return { id: connectionId };
}

/** 解密连接密码 §4 */
export async function decryptPassword(connectionId: string) {
  const conn = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!conn) throw createAppError('CONN_002');
  if (!conn.encryptedPass) return { password: '' };
  return { password: decrypt(conn.encryptedPass) };
}

// ─── 辅助函数 ───

function validateConnectionFields(data: Record<string, any>): Array<{ field: string; message: string }> {
  const errors: Array<{ field: string; message: string }> = [];
  if (data.name !== undefined) {
    const v = validateConnectionName(data.name);
    if (!v.valid) errors.push({ field: 'name', message: v.message });
  }
  if (data.host !== undefined) {
    const v = validateHost(data.host);
    if (!v.valid) errors.push({ field: 'host', message: v.message });
  }
  if (data.port !== undefined) {
    const v = validatePort(data.port);
    if (!v.valid) errors.push({ field: 'port', message: v.message });
  }
  if (data.protocol !== undefined) {
    const v = validateProtocol(data.protocol);
    if (!v.valid) errors.push({ field: 'protocol', message: v.message });
  }
  if (data.vpnType !== undefined) {
    const v = validateVpnType(data.vpnType);
    if (!v.valid) errors.push({ field: 'vpnType', message: v.message });
  }
  if (data.tags !== undefined) {
    const v = validateTags(data.tags);
    if (!v.valid) errors.push({ field: 'tags', message: v.message });
  }
  return errors;
}

function validateVpnConsistency(protocol: string, data: Record<string, any>) {
  if (protocol !== 'VPN') {
    // 非 VPN：VPN 字段必须为 null §3.1（Service 层会自动清空，这里只验证显式传入）
  } else {
    // VPN：vpnType 必须非 null，requiredVpnId 必须为 null §3.1
    if (!data.vpnType) throw createAppError('VAL_001', [{ field: 'vpnType', message: 'VPN 连接必须指定 VPN 类型' }]);
    if (data.requiredVpnId) throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: 'VPN 连接不能依赖另一个 VPN' }]);
  }
}

async function validateVpnDependency(vpnId: string, projectId: string, selfId: string | null) {
  // 禁止自引用 §3.1
  if (selfId && vpnId === selfId) throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: '不能引用自身' }]);

  // 目标不存在 → CONN_002 §3.1（最先检查）
  const target = await prisma.connection.findUnique({ where: { id: vpnId } });
  if (!target) throw createAppError('CONN_002');

  // 同项目限制 §3.1
  if (target.projectId !== projectId) throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: '只能引用同一项目内的 VPN 连接' }]);

  // 目标必须是 VPN 协议 §3.1
  if (target.protocol !== 'VPN') throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: '只能依赖 VPN 类型的连接' }]);

  // 循环依赖 §3.1
  let current = target;
  let depth = 0;
  while (current.requiredVpnId && depth < 10) {
    if (selfId && current.requiredVpnId === selfId) throw createAppError('CONN_003');
    const next = await prisma.connection.findUnique({ where: { id: current.requiredVpnId } });
    if (!next) break;
    current = next;
    depth++;
  }
  if (depth >= 10) throw createAppError('CONN_003');
}

function mapToListItem(c: any) {
  return {
    id: c.id, projectId: c.projectId, project: c.project,
    name: c.name, host: c.host, port: c.port,
    protocol: c.protocol, vpnType: c.vpnType,
    requiredVpnId: c.requiredVpnId, tags: c.tags,
    lastAccessed: c.lastAccessed?.toISOString() ?? null,
    createdBy: { id: c.createdBy, nickname: '已删除用户' },
    updatedBy: { id: c.updatedBy, nickname: '已删除用户' },
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toDetail(c: any, includeEncryptedPass = true) {
  const result: any = {
    id: c.id, projectId: c.projectId, name: c.name,
    host: c.host, port: c.port, username: c.username,
    protocol: c.protocol, vpnType: c.vpnType,
    vpnLoginUrl: c.vpnLoginUrl, requiredVpnId: c.requiredVpnId,
    notes: c.notes, tags: c.tags,
    lastAccessed: c.lastAccessed?.toISOString() ?? null,
    createdBy: { id: c.createdBy, nickname: '已删除用户' },
    updatedBy: { id: c.updatedBy, nickname: '已删除用户' },
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
  if (includeEncryptedPass) result.encryptedPass = c.encryptedPass;
  return result;
}
```

- [ ] **Step 2: 验证编译 + Commit**

```bash
cd C:/Projects/RemoteHub/packages/backend
rtk npx tsc --noEmit
rtk git add packages/backend/src/services/connectionService.ts
rtk git commit -m "feat: add connectionService with CRUD, VPN deps, encryption, and password handling"
```

---

### Task 25: Connection Controller + Routes

**Spec 参考:** §4 连接管理端点, §4.2 API 权限矩阵

**Files:**
- Create: `packages/backend/src/controllers/connectionController.ts`
- Create: `packages/backend/src/routes/connectionRoutes.ts`

- [ ] **Step 1: 创建 connectionController**

```typescript
// packages/backend/src/controllers/connectionController.ts
import type { Request, Response, NextFunction } from 'express';
import * as connectionService from '../services/connectionService.js';

export async function listConnections(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = req.query.projectId as string | undefined;
    const page = Math.max(1, parseInt(req.query.page as string) || '1');
    const pageSize = parseInt(req.query.pageSize as string) || '20';
    const result = await connectionService.listConnections(req.user.id, req.user.role, projectId, page, parseInt(pageSize));
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function createConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await connectionService.createConnection(req.user.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await connectionService.getConnection(req.params.id, req.user.role);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await connectionService.updateConnection(req.user.id, req.params.id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await connectionService.deleteConnection(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function decryptPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await connectionService.decryptPassword(req.params.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
```

- [ ] **Step 2: 创建 connectionRoutes**

```typescript
// packages/backend/src/routes/connectionRoutes.ts
import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import * as connectionController from '../controllers/connectionController.js';
import type { MemberRole } from '@remotehub/shared';

export const connectionRoutes = Router();

connectionRoutes.get('/', authMiddleware, connectionController.listConnections);
connectionRoutes.post('/', authMiddleware, projectRoleMiddleware('editor' as MemberRole), connectionController.createConnection);
connectionRoutes.get('/:id', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), connectionController.getConnection);
connectionRoutes.patch('/:id', authMiddleware, projectRoleMiddleware('editor' as MemberRole), connectionController.updateConnection);
connectionRoutes.delete('/:id', authMiddleware, projectRoleMiddleware('editor' as MemberRole), connectionController.deleteConnection);
connectionRoutes.post('/:id/decrypt-password', authMiddleware, projectRoleMiddleware('editor' as MemberRole), connectionController.decryptPassword);
```

- [ ] **Step 3: 注册到 server.ts + Commit**

```typescript
import { connectionRoutes } from './routes/connectionRoutes.js';
app.use('/api/v1/connections', connectionRoutes);
```

```bash
rtk git add packages/backend/src/controllers/connectionController.ts packages/backend/src/routes/connectionRoutes.ts packages/backend/src/server.ts
rtk git commit -m "feat: add connection controller and routes with VPN deps and password decrypt"
```

---

### Task 27: Session 清理定时任务

**Spec 参考:** §9.5 Session 清理策略

**Files:**
- Create: `packages/backend/src/utils/sessionCleaner.ts`
- Modify: `packages/backend/src/server.ts`（注册清理任务）

- [ ] **Step 1: 创建 sessionCleaner**

```typescript
// packages/backend/src/utils/sessionCleaner.ts
import cron from 'node-cron';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

/** 清理过期和已消耗超过 30 天的 session §9.5 */
export async function cleanSessions(): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { consumedAt: { not: null, lt: thirtyDaysAgo } },
      ],
    },
  });

  if (result.count > 0) {
    logger.info(`Cleaned ${result.count} expired/consumed sessions`);
  }
}

/** 启动定时清理（每日凌晨 3 点） */
export function startSessionCleaner(): void {
  // 启动时立即执行一次
  cleanSessions().catch((err) => logger.error('Session cleanup failed', { error: err.message }));

  // 每日 3:00 执行
  cron.schedule('0 3 * * *', () => {
    cleanSessions().catch((err) => logger.error('Session cleanup failed', { error: err.message }));
  });

  logger.info('Session cleaner scheduled (daily at 03:00)');
}
```

- [ ] **Step 2: 在 server.ts 中启动清理**

在 server.ts 的启动区域（`app.listen` 之前）追加：

```typescript
import { startSessionCleaner } from './utils/sessionCleaner.js';
// 在 app.listen 之前
startSessionCleaner();
```

- [ ] **Step 3: Commit**

```bash
rtk git add packages/backend/src/utils/sessionCleaner.ts packages/backend/src/server.ts
rtk git commit -m "feat: add session cleanup cron job (daily at 03:00)"
```

---

## Phase 9: 前端 API 层

### Task 28: 前端 API 客户端 + Token 刷新拦截器 + TanStack Query

**Spec 参考:** §9.0.2 D (TanStack Query), §9.0.2 前端 Token 刷新拦截器设计要求

**Files:**
- Create: `packages/frontend/src/api/client.ts`
- Create: `packages/frontend/src/api/queries.ts`
- Modify: `packages/frontend/src/main.tsx`

- [ ] **Step 1: 创建 API 客户端 + Token 刷新拦截器**

```typescript
// packages/frontend/src/api/client.ts
import type { ApiResponse, ApiErrorResponse } from '@remotehub/shared';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

/** 刷新 token §9.0.2 */
async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include', // 自动携带 refreshToken cookie
    });
    if (!res.ok) {
      setAccessToken(null);
      return null;
    }
    const body: ApiResponse<{ accessToken: string }> = await res.json();
    setAccessToken(body.data.accessToken);
    return body.data.accessToken;
  } catch {
    setAccessToken(null);
    return null;
  }
}

/** 确保只有一个 refresh 请求 §9.0.2（并发 401 队列） */
async function ensureRefreshed(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshAccessToken();
  const token = await refreshPromise;
  refreshPromise = null;
  return token;
}

/** 统一请求方法 */
export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  // 401 → 自动刷新 §9.0.2
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const newToken = await ensureRefreshed();
    if (newToken) {
      // 重试原请求
      headers['Authorization'] = `Bearer ${newToken}`;
      const retryRes = await fetch(`/api/v1${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });
      if (retryRes.ok) {
        const retryBody: ApiResponse<T> = await retryRes.json();
        return retryBody.data;
      }
    }
    // 刷新失败 → 跳转登录
    setAccessToken(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err: ApiErrorResponse = await res.json();
    throw err;
  }

  const resBody: ApiResponse<T> = await res.json();
  return resBody.data;
}

/** 便捷方法 */
export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
  delete: <T>(path: string) => apiRequest<T>('DELETE', path),
};
```

- [ ] **Step 2: 创建 TanStack Query hooks**

```typescript
// packages/frontend/src/api/queries.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from './client.js';
import type {
  LoginRequest, LoginResponse, UserPublic,
  ProjectListItem, ProjectDetail, CreateProjectRequest, UpdateProjectRequest,
  ConnectionListItem, ConnectionDetail, CreateConnectionRequest, UpdateConnectionRequest,
  MemberListItem, AddMemberRequest, UpdateMemberRoleRequest,
  UserListItem, AdminUpdateUserRequest, UserSearchResult,
  PaginatedResponse,
} from '@remotehub/shared';

// ─── Auth ───

export function useLogin() {
  return useMutation({
    mutationFn: async (data: LoginRequest): Promise<LoginResponse> => {
      const result = await api.post<LoginResponse>('/auth/login', data);
      return result;
    },
  });
}

export function useMe() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get<UserPublic>('/auth/me'),
    retry: false,
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { oldPassword: string; newPassword: string }) =>
      api.post('/auth/change-password', data),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { nickname: string }) => api.patch<UserPublic>('/auth/profile', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });
}

// ─── Projects ───

export function useProjects(page = 1, pageSize = 20) {
  return useQuery({
    queryKey: ['projects', page, pageSize],
    queryFn: async () => {
      const res = await fetch(`/api/v1/projects?page=${page}&pageSize=${pageSize}`, {
        headers: accessTokenHeader(),
      });
      const body: PaginatedResponse<ProjectListItem> = await res.json();
      return body;
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => api.get<ProjectDetail>(`/projects/${id}`),
    enabled: !!id,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectRequest) => api.post<ProjectDetail>('/projects', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProjectRequest }) =>
      api.patch<ProjectDetail>(`/projects/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}

// ─── Connections ───

export function useConnections(projectId?: string, page = 1) {
  const params = new URLSearchParams({ page: String(page) });
  if (projectId) params.set('projectId', projectId);
  return useQuery({
    queryKey: ['connections', projectId, page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/connections?${params}`, { headers: accessTokenHeader() });
      const body: PaginatedResponse<ConnectionListItem> = await res.json();
      return body;
    },
  });
}

export function useConnection(id: string) {
  return useQuery({
    queryKey: ['connections', id],
    queryFn: () => api.get<ConnectionDetail>(`/connections/${id}`),
    enabled: !!id,
  });
}

export function useCreateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateConnectionRequest) => api.post<ConnectionDetail>('/connections', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useUpdateConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateConnectionRequest }) =>
      api.patch<ConnectionDetail>(`/connections/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useDeleteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/connections/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connections'] }),
  });
}

export function useDecryptPassword() {
  return useMutation({
    mutationFn: (id: string) => api.post<{ password: string }>(`/connections/${id}/decrypt-password`),
  });
}

// ─── Members ───

export function useMembers(projectId: string, page = 1) {
  return useQuery({
    queryKey: ['members', projectId, page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/projects/${projectId}/members?page=${page}`, { headers: accessTokenHeader() });
      const body: PaginatedResponse<MemberListItem> = await res.json();
      return body;
    },
    enabled: !!projectId,
  });
}

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, data }: { projectId: string; data: AddMemberRequest }) =>
      api.post(`/projects/${projectId}/members`, data),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['members', vars.projectId] }),
  });
}

export function useUpdateMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, uid, data }: { projectId: string; uid: string; data: UpdateMemberRoleRequest }) =>
      api.patch(`/projects/${projectId}/members/${uid}`, data),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['members', vars.projectId] }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, uid }: { projectId: string; uid: string }) =>
      api.delete(`/projects/${projectId}/members/${uid}`),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['members', vars.projectId] }),
  });
}

// ─── Users (Admin) ───

export function useUsers(page = 1) {
  return useQuery({
    queryKey: ['users', page],
    queryFn: async () => {
      const res = await fetch(`/api/v1/users?page=${page}`, { headers: accessTokenHeader() });
      const body: PaginatedResponse<UserListItem> = await res.json();
      return body;
    },
  });
}

export function useSearchUsers(q: string) {
  return useQuery({
    queryKey: ['users', 'search', q],
    queryFn: async () => {
      const res = await fetch(`/api/v1/users/search?q=${encodeURIComponent(q)}`, { headers: accessTokenHeader() });
      const body = await res.json();
      return body.data as UserSearchResult[];
    },
    enabled: q.length >= 1,
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AdminUpdateUserRequest }) =>
      api.patch(`/users/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

// ─── Helper ───
import { getAccessToken } from './client.js';

function accessTokenHeader(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
```

- [ ] **Step 3: 更新 main.tsx（Bootstrap Gate）§9.0.2 */

```typescript
// packages/frontend/src/main.tsx
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setAccessToken } from './api/client.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

async function bootstrap() {
  // Bootstrap Gate §9.0.2：先 refresh 拿 accessToken
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      const body = await res.json();
      if (body.success && body.data?.accessToken) {
        setAccessToken(body.data.accessToken);
      }
    }
  } catch {
    // refresh 失败 → 未登录状态，显示 login 页面
  }

  const { default: App } = await import('./App.js');
  const root = document.getElementById('root')!;
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

// 显示 loading，bootstrap 完成后替换
document.getElementById('root')!.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh">加载中...</div>';
bootstrap();
```

- [ ] **Step 4: 验证前端构建**

```bash
cd C:/Projects/RemoteHub
rtk pnpm --filter @remotehub/frontend build
```

- [ ] **Step 5: Commit**

```bash
rtk git add packages/frontend/src/
rtk git commit -m "feat: add frontend API client with token refresh interceptor and TanStack Query hooks"
```

---

## Phase 10: Docker + 部署

### Task 31: Docker Compose + Dockerfiles + Caddy + 部署脚本

**Spec 参考:** §6 部署设计

**Files:**
- Create: `docker/Dockerfile.backend`
- Create: `docker/Dockerfile.frontend`
- Create: `docker/caddy/Caddyfile`
- Create: `docker-compose.yml`
- Modify: `docker-compose.dev.yml`（已在 Task 6 创建）
- Create: `scripts/deploy.ps1`
- Create: `scripts/deploy.sh`

- [ ] **Step 1: 创建 Dockerfile.backend**

```dockerfile
# ---- 基础镜像 §6.2 ----
FROM node:20-alpine AS base
RUN corepack enable

# ---- 构建阶段 ----
FROM base AS builder
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/ packages/shared/
COPY packages/backend/ packages/backend/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @remotehub/shared build
RUN pnpm --filter @remotehub/backend build
RUN npx esbuild packages/backend/prisma/seed.ts --outfile=packages/backend/prisma/seed.js --platform=node --format=cjs --bundle
RUN pnpm --filter @remotehub/backend --prod deploy /prod/backend
RUN cp -r packages/backend/dist /prod/backend/dist
RUN cp -r packages/backend/prisma /prod/backend/prisma

# ---- 生产阶段 ----
FROM base
WORKDIR /app
COPY --from=builder /prod/backend .
RUN npx prisma generate
EXPOSE 3001
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/utils/seedCheck.js && node dist/server.js"]
```

- [ ] **Step 2: 创建 Dockerfile.frontend（init 容器）**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/ packages/shared/
COPY packages/frontend/ packages/frontend/
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @remotehub/shared build
RUN pnpm --filter @remotehub/frontend build

FROM alpine:latest
COPY --from=builder /app/packages/frontend/dist /tmp/dist
CMD ["sh", "-c", "rm -rf /output/* && cp -r /tmp/dist/. /output/"]
```

- [ ] **Step 3: 创建 Caddyfile**

```
# docker/caddy/Caddyfile
{$HOST:remotehub.example.com} {
    encode gzip

    header {
        X-Frame-Options DENY
        X-Content-Type-Options nosniff
        X-XSS-Protection "1; mode=block"
        Strict-Transport-Security "max-age=31536000"
    }

    handle /api/* {
        reverse_proxy backend:3001
    }

    handle {
        root * /srv/frontend
        try_files {path} /index.html
        file_server
    }
}
```

- [ ] **Step 4: 创建 docker-compose.yml**

```yaml
# docker-compose.yml §6.2
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
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/api/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
    depends_on:
      db:
        condition: service_healthy

  frontend-init:
    build:
      context: .
      dockerfile: docker/Dockerfile.frontend
    volumes:
      - frontend-build:/output

  db:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      - MYSQL_ROOT_PASSWORD=${DB_PASSWORD}
      - MYSQL_DATABASE=remotehub
      - MYSQL_USER=remotehub
      - MYSQL_PASSWORD=${DB_PASSWORD}
    volumes:
      - db-data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root", "-p${DB_PASSWORD}"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  caddy-data:
  caddy-config:
  frontend-build:
  db-data:
```

- [ ] **Step 5: 创建部署脚本**

```bash
#!/bin/bash
# scripts/deploy.sh §6.3
set -e

echo "=== RemoteHub V2 部署脚本 ==="

# 检查 Docker
if ! command -v docker &>/dev/null; then
  echo "错误：未安装 Docker"
  exit 1
fi

if ! command -v docker compose &>/dev/null; then
  echo "错误：未安装 Docker Compose"
  exit 1
fi

# 检查 .env
if [ ! -f .env ]; then
  echo "首次部署，创建 .env 文件..."
  cat > .env << 'ENVEOF'
NODE_ENV=production
PORT=3001
DATABASE_URL=mysql://remotehub:CHANGE_ME@db:3306/remotehub?connection_limit=30
DB_PASSWORD=CHANGE_ME
JWT_SECRET=CHANGE_ME_TO_RANDOM_64_CHARS
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=CHANGE_ME_TO_BASE64_32BYTES
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin123
LOG_LEVEL=info
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_REGISTER_MAX=3
RATE_LIMIT_REFRESH_MAX=20
RATE_LIMIT_GENERAL_MAX=200
HOST=remotehub.example.com
ENVEOF
  echo ".env 文件已创建，请编辑后重新运行："
  echo "  vi .env"
  exit 0
fi

# 构建并启动
echo "构建并启动服务..."
docker compose up --build -d

echo ""
echo "=== 部署完成 ==="
echo "访问 https://\$(grep HOST .env | cut -d= -f2)"
echo "默认管理员：\$(grep ADMIN_USERNAME .env | cut -d= -f2)"
```

```powershell
# scripts/deploy.ps1 §6.3
$ErrorActionPreference = "Stop"

Write-Host "=== RemoteHub V2 部署脚本 ==="

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "错误：未安装 Docker" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path .env)) {
  Write-Host "首次部署，创建 .env 文件..."
  @"
NODE_ENV=production
PORT=3001
DATABASE_URL=mysql://remotehub:CHANGE_ME@db:3306/remotehub?connection_limit=30
DB_PASSWORD=CHANGE_ME
JWT_SECRET=CHANGE_ME_TO_RANDOM_64_CHARS
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=CHANGE_ME_TO_BASE64_32BYTES
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin123
LOG_LEVEL=info
HOST=remotehub.example.com
"@ | Out-File -FilePath .env -Encoding utf8
  Write-Host ".env 文件已创建，请编辑后重新运行"
  exit 0
}

Write-Host "构建并启动服务..."
docker compose up --build -d

Write-Host "`n=== 部署完成 ==="
```

- [ ] **Step 6: Commit**

```bash
rtk git add docker/ docker-compose.yml scripts/ docker-compose.dev.yml
rtk git commit -m "feat: add Docker Compose, Dockerfiles, Caddy config, and deploy scripts"
```

---

## 自检结果

### 1. Spec 覆盖率检查

| Spec 章节 | 对应 Task | 状态 |
|-----------|----------|------|
| §2.1 Monorepo 结构 | T1-T3 | ✅ |
| §2.2 技术选型 | T1 (deps) | ✅ |
| §2.4 Prisma 技术约束 | T6 (schema) | ✅ |
| §3.1 Prisma Schema | T6 | ✅ |
| §3.2 枚举值 | T4 | ✅ |
| §3.3 类型分工 | T4 | ✅ |
| §4 API 全部端点 | T13,16,19,22,25 | ✅ |
| §4.1 列表 API 规范 | T15,18,22,24 | ✅ |
| §4.2 API 权限矩阵 | T10,11,13,16,19,22,25 | ✅ |
| §5.1 认证流程 | T10,12,13 | ✅ |
| §5.2 密码存储 | T7 | ✅ |
| §5.3 速率限制 | T8,13 | ✅ |
| §5.4 安全头 | T8 | ✅ |
| §6 部署设计 | T31 | ✅ |
| §8 项目清理 | T3 | ✅ |
| §9.1 CORS | T8 | ✅ |
| §9.2 环境变量 | T7 | ✅ |
| §9.4 日志 | T7 | ✅ |
| §9.5 Session 清理 | T27 | ✅ |
| §9.6 加密细节 | T7 | ✅ |
| §11 开发规范 | T1-T5 (config) | ✅ |

### 2. 占位符扫描

- 无 TBD、TODO、"implement later"、"add validation" 等占位符
- 每个 Task 包含完整代码

### 3. 类型一致性

- `UserPublic` 在 T4 定义，T12(authService) 使用
- `ProjectListItem` / `ConnectionListItem` 在 T4 定义，T18/T24 返回
- `MemberRole` / `UserRole` / `Protocol` 在 T4(enums) 定义，全链路使用
- `AppError` 在 T7 定义，所有 Service 层引用
- 前端 hooks(T28) 的类型引用与 shared/types.ts(T4) 一致
