# v2 前端迁移技术研究笔记（2026-08-25）

为 v2 前端迁移 spec 提供技术实现细节依据：TanStack Query v5 / fetch 认证客户端 / React Router v7 / Vitest 3 测试栈 / ESLint flat config / Docker+nginx 部署，共 6 节。全部结论来自 primary source（官方文档 / 官方仓库源码），查证工具为 context7（web 搜索在本环境不可用，个别点标注「未单独查证」）。

---

## 1. TanStack Query v5 + React 19

### 决策级要点

1. **queryOptions / mutationOptions 工厂是 v5 官方推荐的组织模式**：为每个 endpoint 写一个返回 `queryOptions({...})` 的工厂函数（如 `issueListOptions(filters)`），产出的对象带 branded queryKey，可在 `useQuery` / `queryClient.prefetchQuery` / `queryClient.setQueryData` 间共享且完整保留 TypeScript 推断。mutation 侧对应 `mutationOptions()`（`mutationKey` + `mutationFn`），供 `useMutation` / `useIsMutating` / `queryClient.isMutating` 复用。官方维护的 `@tanstack/eslint-plugin` 甚至提供 `prefer-query-options` 规则强制此模式。
2. **全局 401 处理放 `QueryCache.onError`（query）+ `MutationCache.onError`（mutation）兜底**：源码证实两者对每个错误**无条件调用**（不依赖 per-query 设置）；`MutationCache.onError` 总是执行且**先于** mutation 局部 `onError`。在这里判断 `error.status === 401` 执行 logout + 跳转 /login，即可覆盖所有 query/mutation，无需在每个组件重复。
3. **推荐分层：API client 层先自救，QueryCache 兜底**。401 应先由 fetch client 层尝试 refresh + 重放（见第 2 节）；只有 refresh 也失败（refresh token 过期）时抛出的错误才落到 `QueryCache.onError` 触发 logout。这样避免「可自动恢复的 401」误踢用户。
4. **写后失效标准模式**：`useMutation` 的 `onSuccess` 中 `await queryClient.invalidateQueries({ queryKey: [...] })`；**return 该 Promise** 可让 mutation 保持 pending 直到 refetch 完成（官方明示）；失效多个 key 用 `Promise.all`。
5. **TypeScript 错误类型统一**：通过 module augmentation 声明 `Register` 接口设定全局 `defaultError` 类型（配合自定义 ApiError 类携带 `status`），让 `QueryCache.onError` 里判 401 时无需到处 narrow。

### 来源

- TanStack Query 官方 docs（GitHub tanstack/query）：
  - `docs/framework/react/guides/query-options.md`（queryOptions 工厂）
  - `docs/framework/react/typescript.md`（mutationOptions、Register/defaultError）
  - `docs/eslint/prefer-query-options.md`（官方 lint 规则）
  - `docs/framework/react/guides/invalidations-from-mutations.md`（onSuccess + invalidateQueries + 返回 Promise 语义）
  - 官网：https://tanstack.com/query/latest/docs/framework/react/guides/query-options
- 源码证据（GitHub tanstack/query）：
  - `packages/query-core/src/query.ts`（`this.#cache.config.onError?.(error, this)` 对每个 query error 无条件调用）
  - `packages/query-core/src/mutation.ts`（MutationCache onError 先于局部 onError、总是执行）

---

## 2. fetch API client：401 → refresh → 重放单飞模式

### 决策级要点

1. **单飞（single-flight）标准结构**（axios 官方文档给出权威形态，可 1:1 移植到 fetch）：模块级 `isRefreshing` 标志 + `refreshPromise`；第一个收到 401 的请求发起 refresh 并持有 promise；并发的其他 401 请求**不重复刷新**，而是等待同一个 promise 完成后重放原请求；refresh 失败时统一 reject 队列、清凭证、`window.location.href = '/login'`。
2. **排队重放**：等待中的请求以 `{ resolve, reject }` 形式收集（failedQueue），refresh 成功后用新 token 逐个重放，失败则逐个 reject。fetch 版本可直接让后续 401 `await refreshPromise` 后重发，语义等价。
3. **防无限循环**：给已重放过的请求打 `_retry` 标记（第二次 401 直接抛错走 logout）；且 refresh 端点自身的 401 绝不能再触发 refresh。
4. **超时控制**：`AbortSignal.timeout(ms)` 一行实现（超时抛 `TimeoutError`）；需要「用户取消 OR 超时」组合时用 `AbortSignal.any([controller.signal, AbortSignal.timeout(ms)])`；catch 中区分 `TimeoutError` / `AbortError` / 网络错误三种 name。
5. **与 axios 拦截器的关键差异**：
   - axios `interceptors.response.use` 的 error handler **只对非 2xx 触发**；原生 fetch **永不 reject 非 2xx**——必须在 wrapper 里手动检查 `res.ok / res.status`，这是两种范式最大的行为差异。
   - axios 的 `error.config` 自带完整重放所需配置；fetch 需自己在 wrapper 里保留 `url + init`。
   - axios 拦截器有注册/注销（eject）生命周期；fetch 没有拦截点，一切逻辑收进自定义 `apiFetch()` 单函数，反而更易测试。
   - 工程注意（无单一官方来源，spec 评审时确认）：Request body 是 stream，POST 重放前应保存**已序列化的 body 字符串**再传给 fetch，避免二次消费。

### 来源

- axios 官方仓库（GitHub axios/axios）：
  - `docs/pages/advanced/authentication.md`（完整单飞实现：isRefreshing + failedQueue + processQueue + `_retry` + 失败跳 /login）
  - `README.md`（interceptors.request/response.use 语义：非 2xx 进 error handler；eject）
- MDN Web Docs（GitHub mdn/content）：
  - `files/en-us/web/api/abortsignal/index.md`、`abortsignal/timeout_static/index.md`、`abortsignal/any_static/index.md`（AbortSignal.timeout / any、TimeoutError vs AbortError）
  - `files/en-us/web/api/fetch_api/using_fetch/index.md`（credentials 默认 same-origin；include 行为）
  - 官网：https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout

---

## 3. React Router v7

### 决策级要点

1. **最小路由（/login + /）选 Data Mode（library mode）而非 Declarative Mode**：Declarative Mode（`<BrowserRouter>` + `<Routes>`）不支持 loader/action；要用 loader 做认证守卫就必须 Data Mode——`createBrowserRouter(routes)` 在 React 树外创建一次，DOM 环境下 `RouterProvider` 从 **`react-router/dom` 子路径导入**（这是 v7 明确要求，直接从 `react-router` 导入的 RouterProvider 不含 flushSync 支持）。
2. **认证守卫推荐 loader + redirect，而非 ProtectedRoute 组件**：受保护路由的 `loader` 中检查会话，未认证 `throw redirect("/login")`（或 `return redirect("/login")`）。loader 在**导航阶段**执行，早于组件渲染——不会闪一帧受保护 UI；ProtectedRoute 组件在渲染阶段才拦截，且无法覆盖 loader 里已发出的数据请求。
3. **需要把守卫复用到多个路由时用 v7 新增的 middleware**：`middleware: [authMiddleware]`，其中检查 session、`throw redirect("/login")`、`context.set(userContext, user)` 供下游 loader 取用。对只有 `/login` + `/` 两个路由的最小场景，单 loader 足够，不必上 middleware。
4. **v7 相对 v6 声明式层面的关键差异**：
   - 所有导入统一自 `react-router` 包（`react-router-dom` 合并进主包，仅作为 re-export shim 存在以平滑迁移）；
   - v6 的全部 future flags 转正为默认行为（`v7_startTransition`、`v7_relativeSplatPath`、`v7_fetcherPersist`、`v7_normalizeFormMethod` 等）；
   - 最低要求 React 18 / Node 18；
   - `json()` / `defer()` 工具函数移除——loader 直接 `return` 普通对象/数据；
   - `RouterProvider` 的 `fallbackElement` 移除，改用路由级 `hydrateFallbackElement` / `HydrateFallback`。
5. **路由对象写法**：data router 下用 `Component: Root` 大写属性形式（与 `element: <Root/>` 等价、官方示例现行风格）。

### 来源

- React Router 官方 docs（GitHub remix-run/react-router）：
  - `docs/api/utils/redirect.md`（`throw redirect("/login")`）
  - `docs/start/framework/navigating.md`（loader 中 `return redirect`）
  - `docs/start/modes.md`（Declarative vs Data vs Framework 三模式取舍）
  - `docs/start/data/installation.md`（createBrowserRouter + `RouterProvider from "react-router/dom"` 最小设置）
  - `docs/how-to/middleware.md` + `docs/start/framework/route-module.md`（authMiddleware + context 模式）
  - `CHANGELOG.md`（包合并、future flags 转正、json/defer 移除、Node/React 最低版本、fallbackElement 迁移）
  - 官网：https://reactrouter.com/how-to/middleware

---

## 4. Vite 6 + Vitest 3 + @testing-library/react 16 + React 19

### 决策级要点

1. **版本兼容（官方硬性要求）**：Vitest 3.2 要求 **Vite >= 5.0.0、Node >= 18** → Vite 6 在支持范围内，组合可用。注意 Vitest 4+（main 分支 package.json）peer range 已变为 `^6.4.0 || ^7.0.0 || ^8.0.0`——未来升级 Vitest 4 时 Vite 需 >= 6.4，且 Node >= 22.12。
2. **vitest 配置形态**（官方 React 示例原文）：`defineConfig` 从 `vitest/config` 导入，`plugins: [react()]`（@vitejs/plugin-react），`test: { environment: 'jsdom', setupFiles: './vitest.setup.ts' }`。也可直接写在 vite.config.ts 的 `test` 字段（vitest 类型需 `/// <reference types="vitest/config" />` 或用 vitest/config 的 defineConfig）。jsdom 环境额外选项（如默认 URL）走 `test.environmentOptions.jsdom`。
3. **React 19 下 RTL 的 act 注意点**：RTL v16 优先使用 React 19 内置的 `React.act`（取代已废弃的 `react-dom/test-utils.act`），且内部 `withGlobalActEnvironment` 包装器**在每次 act 调用前后自动设置/恢复 `IS_REACT_ACT_ENVIRONMENT = true`**——即正常使用 `render` / `fireEvent` / `userEvent` 时**无需**再手动设置 `globalThis.IS_REACT_ACT_ENVIRONMENT`。
4. **cleanup 必须手动挂（关键坑）**：RTL 的 auto-cleanup 依赖全局 `afterEach` 存在；**Vitest 默认 `globals: false` 时检测不到**（源码证实 auto-cleanup 块整体跳过）。必须在 setup 文件写：`import { cleanup } from '@testing-library/react'` + `afterEach(cleanup)`（或开 `globals: true`）。
5. **依赖清单**：RTL v16 起 `@testing-library/dom` 从直接依赖改为 **peer dependency（^10）**，必须显式安装；React peer 范围 `^18 || ^19` 原生支持 React 19。常用搭配 `@testing-library/jest-dom/vitest`（setup 导入）、`@testing-library/user-event`。
6. **全局配置**：`configure({ reactStrictMode: true, testIdAttribute: ... })` 可在 setup 文件统一设置（如需在测试中覆盖 StrictMode 双渲染行为）。

### 来源

- Vitest 官方（GitHub vitest-dev/vitest）：
  - v3.2.4 tag `docs/guide/index.md`（Vite >= v5.0.0、Node >= v18）
  - main `packages/vitest/package.json`（vitest 4+ 的 peer range `^6.4.0 || ^7.0.0 || ^8.0.0`）、`docs/guide/migration.md`（Vitest 5 需 Vite 6.4+/Node 22.12+）
  - `examples/projects/packages/client/vitest.config.ts`（React + jsdom + setupFiles 官方示例）
  - `docs/config/environmentoptions.md`
  - 官网：https://vitest.dev/guide/
- RTL 官方仓库（GitHub testing-library/react-testing-library）：
  - `src/act-compat.js`（React.act 优先 + withGlobalActEnvironment 自动设 IS_REACT_ACT_ENVIRONMENT）
  - `src/index.js`（globals 不可用时 auto-cleanup 跳过）
  - `package.json`（v16 peerDependencies）
  - 官网：https://testing-library.com/docs/react-testing-library/setup

---

## 5. ESLint flat config（frontend React 侧）

### 决策级要点

1. **typescript-eslint 现行 flat config 写法**：`eslint.config.mjs` 中 `import { defineConfig } from 'eslint/config'` + `extends: [js.configs.recommended, tseslint.configs.recommended]`，配 `files: ['**/*.{js,ts,tsx}']` 分层。这是 2025 官方 Quickstart 的标准形态（`defineConfig` / `extends` 是 ESLint 9.x+ flat config 的新语法糖，取代早期 `tseslint.config(...)` 数组拼接）。
2. **type-aware linting**：升级为 `tseslint.configs.recommendedTypeChecked`（或 `recommendedTypeCheckedOnly`）+ `languageOptions.parserOptions.projectService: true`（取代旧 `project: ['tsconfig.json']`）。`.js` 文件（如 eslint.config 本身）追加 `extends: [tseslint.configs.disableTypeChecked]` 关闭类型感知，避免误报。
3. **eslint-plugin-react-hooks flat config**：`import reactHooks from 'eslint-plugin-react-hooks'` 后直接 `reactHooks.configs.flat.recommended`（含 `rules-of-hooks: error` + `exhaustive-deps: warn`）；高级场景可手动挂 `plugins: { 'react-hooks': reactHooks }` 并逐条配规则，`exhaustive-deps` 支持 `additionalHooks` 选项匹配自定义 hook（如 TanStack Query 包装 hook）。
4. **eslint-plugin-react-refresh flat config**：`import { reactRefresh } from 'eslint-plugin-react-refresh'` + `reactRefresh.configs.vite()`——Vite 专用预设，等价 `only-export-components: error` + `allowConstantExport: true`（允许组件文件同时导出 string/number/boolean 常量，因为 Vite 的 fast refresh 实现正确处理了这类 HMR）。
5. **新 JSX transform 下的 react-hooks 设置：无需任何特殊配置**。react-hooks 的两条核心规则只分析 hook 调用与依赖数组结构，不检查 `React` 导入；插件 README 中不存在任何与 JSX transform 相关的开关。新 transform 相关的配置只出现在 eslint-plugin-react 侧（其 flat 预设已默认面向 automatic runtime），本组合不引入该插件则无感。

### 来源

- typescript-eslint 官方：
  - `docs/getting-started/Quickstart.mdx`、`docs/getting-started/Typed_Linting.mdx`（defineConfig + extends + projectService）
  - `docs/troubleshooting/faqs/General.mdx`（recommendedTypeCheckedOnly）、`docs/troubleshooting/typed-linting/index.mdx`（disableTypeChecked for .js）
  - 官网：https://typescript-eslint.io/getting-started
- React 官方仓库（GitHub react/react）：
  - `packages/eslint-plugin-react-hooks/README.md`（`reactHooks.configs.flat.recommended` flat 写法、additionalHooks 选项）
- eslint-plugin-react-refresh 官方（GitHub ArnaudBarre/eslint-plugin-react-refresh）：
  - `README.md`（`reactRefresh.configs.vite()`、allowConstantExport 默认 false / vite 预设中 true）

---

## 6. Docker 多阶段 + nginx SPA

### 决策级要点

1. **Dockerfile 标准形态（Docker 官方教程原文即此结构）**：`FROM node:<lts>-alpine AS build` → `WORKDIR /app` → **先 COPY 清单文件再 install**（pnpm 场景：copy pnpm-lock.yaml + package.json，`corepack enable && pnpm install --frozen-lockfile`，利用层缓存）→ COPY 源码 → `RUN pnpm build`；`FROM nginx:alpine` → `COPY --from=build /app/<frontend>/dist /usr/share/nginx/html` + `COPY <frontend>/nginx.conf /etc/nginx/conf.d/default.conf`。`COPY --from` 从命名 stage 取产物，最终镜像不含 node_modules/build 工具链。
2. **nginx.conf SPA fallback**：`location / { try_files $uri $uri/ /index.html; }`——`try_files` 语法为 nginx 官方文档定义（官方示例 `try_files $uri $uri/index.html $uri.html =404`）；「最终 fallback 到 `/index.html`」是 SPA history 路由的标准应用写法（官方文档未特指 SPA，语法层面等价）。配套：`root /usr/share/nginx/html` + gzip on + 带哈希的静态资源设长缓存。
3. **/api 反代到 backend 容器**：`location /api/ { proxy_pass http://backend:3001; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto $scheme; }`——upstream 直接用 docker compose 服务名（容器 DNS 解析）；四个 proxy_set_header 是 nginx 官方示例的标准集。
4. **dev vs prod 的 cookie/凭据行为**：
   - **dev（vite :5173 proxy → :3001）**：`server.proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } }`。浏览器视角所有请求都是 `localhost:5173` 同源（proxy 是服务端转发），cookie 全程同源写入/携带，**无跨域、无 SameSite 问题**。
   - **prod（nginx 同源托管 + 反代）**：同理，浏览器只看到一个 origin，cookie 同源。
   - **关键差异/坑**：若 dev 绕过 proxy 直连 `http://localhost:3001`（跨端口即跨源），fetch 默认 `credentials: 'same-origin'` **不会带 cookie**；即使设 `credentials: 'include'`，`SameSite=Strict/Lax` 的 cookie 跨站请求也**不会发送**（MDN 明确）。结论：**统一走 /api 代理路径，dev 与 prod 行为完全一致，前端 fetch 不需要 `credentials: 'include'`**；后端 Set-Cookie 的 Domain/Path 无需特殊处理。
   - 细节：vite proxy 的 `changeOrigin: true` 会把 Host 头改写为目标 host（string 简写形式默认即 changeOrigin: true）；后端若依赖 Host 校验需注意。
5. **nginx 镜像的配置注入机制**：官方镜像 entrypoint 支持 envsubst 模板——放 `/etc/nginx/templates/*.template`，启动时渲染到 `/etc/nginx/conf.d/`，可用环境变量注入 API upstream 地址（如 `proxy_pass http://${API_HOST}`）而不必重打镜像。默认 EXPOSE 80、以 root 运行（有非 root 需求再考虑 unprivileged 变体，listen 8080）。

### 来源

- Docker 官方 docs（GitHub docker/docs）：
  - `content/get-started/workshop/09_image_best.md`（node:24-alpine AS build → nginx:alpine + COPY --from=build ... /usr/share/nginx/html 原文）
  - Dockerfile reference（`COPY --from` 语义：从 stage/镜像/命名上下文复制）
  - 官网：https://docs.docker.com/build/building/multi-stage/
- nginx 官方：
  - `ngx_http_core_module` 文档（try_files 语法；proxy_pass + proxy_set_header 标准集）：https://nginx.org/en/docs/http/ngx_http_core_module.html
- nginx Docker 官方镜像（GitHub nginx/docker-nginx）：
  - `entrypoint/20-envsubst-on-templates.sh`（/etc/nginx/templates → /etc/nginx/conf.d 渲染机制、默认端口/运行用户说明）
- Vite 官方（GitHub vitejs/vite）：
  - `docs/config/server-options.md`（server.proxy 规则、changeOrigin、rewrite；ws 注意事项）
  - `packages/vite/src/node/server/middlewares/proxy.ts`（ProxyOptions extends httpProxy.ServerOptions；string 简写默认 changeOrigin: true）
  - `docs/config/shared-options.md`（appType 'spa' 的 HTML fallback 行为）
  - 官网：https://vite.dev/config/server-options
- MDN Web Docs：`files/en-us/web/api/fetch_api/using_fetch/index.md`（credentials 三态 + SameSite 限制）、CORS 指南（include + Access-Control-Allow-Credentials）
