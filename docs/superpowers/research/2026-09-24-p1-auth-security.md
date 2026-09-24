# P1 认证与安全域现状调研（2026-09-24）

> 调研目的：phase2-P1 全量立项前的现状证据收集，防止 spec/实施漂移。**只查证，不决策。**
> Design 文档：`docs/superpowers/specs/2026-04-23-remotehub-v2-phase2-design.md`（下称 design）
> 所有行号已读文件核实（当日工作区快照，分支 feat/phase2-p0）。

---

## 一、现状事实（每条带 file:line 引用）

### 1.1 认证链路

**JWT access token**
- 签名：HS256，payload 仅 `{ userId }`，过期时间取 `env.JWT_ACCESS_EXPIRES_IN`（默认 `15m`）— `packages/backend/src/utils/jwt.ts:5-12`
- 校验：`jose.jwtVerify` 返回 `{ userId }` — `packages/backend/src/utils/jwt.ts:14-18`
- payload 无 role：前端 admin 页面因此用「loader 验登录 + 页面内验角色」两段式，注释明确「不动 jwt.ts 一期签名契约」— `packages/frontend/src/main.tsx:40-41`
- JWT_SECRET 长度 ≥32 字符启动即校验 — `packages/backend/src/config/env.ts:32-34`

**Refresh token 与 Session**
- 生成：48 字节随机 hex；存储：SHA-256 hex 存 `Session.tokenHash`（unique 列）— `packages/backend/src/utils/jwt.ts:20-26`、`packages/backend/prisma/schema.prisma:32`
- Session 表结构：tokenHash unique、userAgent/ip 可空、expiresAt、consumedAt 可空、userId 索引 + expiresAt 索引 — `packages/backend/prisma/schema.prisma:29-44`
- 轮换语义（`packages/backend/src/services/authService.ts` `refresh()` L92-172）：
  1. 事务内 `updateMany` 原子标记 `consumedAt`（where `consumedAt: null`）— L104-107
  2. 标记数 0 → 区分三种情形：session 不存在（AUTH_004）/ 用户禁用（删该 session + clearCookie）/ 30s 内并发窗口（`REFRESH_CONCURRENT_WINDOW_SEC = 30`，`packages/shared/src/constants.ts:26`）签新 token / 否则判重用攻击，事务外撤销该用户**全部** session — L109-139
  3. 正常路径：验过期、验 isActive、签新 access + 新 refresh、新 Session 入库 — L142-162
  4. 清理动作（删 session）故意放事务外执行（`postAction`），避免事务回滚吞掉清理 — L96-99、L135-138、L167-171
- Login 建_session：expiresAt 固定 7 天 — `packages/backend/src/services/authService.ts:37-45`
- Refresh cookie：httpOnly + secure + sameSite=strict，`path: '/api/v1/auth'`，maxAge 7 天 — `packages/backend/src/controllers/authController.ts:8-14`；refresh 响应/错误时按 `clearCookie` 标志清 cookie — `authController.ts:67-78`
- 过期 session 清理：cron 每日 03:00，删「过期」或「consumedAt 超 30 天」的 session — `packages/backend/src/utils/sessionCleaner.ts:7-19, 25-32`

**改密撤 session（P1 重置密码的参照实现）**
- `changePassword`：事务 `[user.update(passwordHash), session.deleteMany({ userId })]` — `packages/backend/src/services/authService.ts:195-198`
- Controller 成功后清 refresh cookie — `packages/backend/src/controllers/authController.ts:111`
- 旧密码错误抛 AUTH_006（400）而非 401——防 client 对 401 走 refresh+重放导致误踢（注释 L186-188）— `authService.ts:186-189`
- 登录防用户名枚举：三处失败统一 AUTH_001 — `authService.ts:23-31`

### 1.2 假重置按钮（#14 拍板换真）

- 代码位置：`packages/frontend/src/components/UserManagementModal.tsx:187`
  ```tsx
  <button onClick={() => toast('info', '重置密码', '请通知该员工：密码已重置为 "123456"')} ... title="重置密码"><Key size={16} /></button>
  ```
  - 点击行为：仅弹 info toast，**不发任何请求**
  - toast 文案：标题「重置密码」，正文「请通知该员工：密码已重置为 "123456"」（v1 假动作逐字保留，注释 L186「文案怪癖归 phase2」）
  - 按钮出现条件：目标用户 ≠ 当前登录用户（L184）
- 测试锁定假行为：`packages/frontend/src/components/UserManagementModal.test.tsx:143-148` — 用例名「重置密码按钮：仅 toast 提示（v1 假动作逐字），不发任何请求」；另有 L104 断言 `getByTitle('重置密码')` 存在
- 当前不存在任何 reset-password 后端端点 / 前端路由（全仓 grep `reset-password|resetPassword|RESET_PASSWORD` 无业务代码命中）

### 1.3 改密 toast 预告（backlog 项）

- 前端处理位置：`packages/frontend/src/components/UserManagementModal.tsx:61-77`（`handleChangePassword`，位于「profile」tab 的改密表单）
- 成功 toast：`toast('success', '修改成功', '下次登录请使用新密码')` — L72
- mutation 定义：`packages/frontend/src/api/queries.ts:35-40`（`useChangePassword`）— **无 onSuccess 处理**：不清内存 access token、不清 query cache、不跳转
- 实际后端行为（对照）：改密成功即撤全部 session（`authService.ts:197`）+ 清 refresh cookie（`authController.ts:111`）。前端内存 access token 仍有效至过期（≤15 分钟），过期后 refresh 因 cookie 已清必然失败 → 被踢登录页。toast 文案「下次登录请使用新密码」与「当前会话实际已死」不符——即 backlog「改密 toast 预告」项的现状根因。

### 1.4 2FA 落点

- User 表现状字段：id/username/nickname/passwordHash/role/isActive/lastActiveAt/createdAt/updatedAt + 3 个关联（projects/sessions/auditLogs），**无任何 2FA 字段** — `packages/backend/prisma/schema.prisma:10-27`（SQLite，加列余量无约束问题）
- authMiddleware 结构（`packages/backend/src/middleware/auth.ts:25-63`）：
  1. Bearer 头校验（L27-30）
  2. `verifyAccessToken` 取 userId（L32-39）
  3. 查库取 user（L41-45，每请求一查）→ isActive 校验（L47-50）→ 挂 `req.user`（L52）
  4. lastActiveAt 节流更新（内存 Map，`LAST_ACTIVE_THROTTLE_MS = 5min`，`packages/shared/src/constants.ts:28`）— L54-60
- 2FA 校验插入点（现状结构下）：若走「tempToken 换正式 token」模式，插入点在 L32-39 的 token 验证语义处（需要区分 tempToken 与正式 access token）；若走「登录后二段校验」模式，则在各受保护路由前加独立中间件。**现状无任何预留接口。**

### 1.5 性能监控

- server.ts 中间件栈现状（顺序）— `packages/backend/src/server.ts:17-123`：
  1. `express.json({ limit: '1mb' })` L20
  2. `cookieParser()` L23
  3. `helmet`（CSP 配置）L26-35
  4. 四个 rate limiter **定义**（login/register/refresh/general）L38-76
  5. CORS（`env.CORS_ORIGIN` 存在才挂）L79-84
  6. `trust proxy 1` L87
  7. IP 风险检测（`checkIpRisk`，仅告警）L92-95
  8. 限流器**挂载** L98-101：`/api/v1/auth/login`、`/api/v1/auth/register`、`/api/v1/auth/refresh` 各自独立 limiter，`/api/v1/` 挂 generalLimiter
  9. `sanitizationMiddleware` L103-104（注释：净化在限流之后——净化 CPU 处于限流保护之内）
  10. 路由注册 L116-123（health/auth/users/projects/members/connections/audit-logs/**admin**）
- **无响应时间记录中间件**：全栈无 `res.on('finish')` 性能记录（audit 中间件用的是 res.json monkey-patch，属审计非性能）
- 现有 /admin 端点面：`GET /admin/dashboard`、`GET /admin/stats/users`、`GET /admin/stats/projects` — `packages/backend/src/routes/monitoringRoutes.ts:11-13`；三个 handler — `packages/backend/src/controllers/monitoringController.ts:6,14,22`；**无 `/admin/stats/performance`**
- monitoringRoutes 文件头注释明确两个先例：admin 端点 = authMiddleware + roleMiddleware；**读端点不挂审计**（「auditRoutes 先例」）— `monitoringRoutes.ts:2-3`
- 健康检查：`GET /api/v1/health` 已扩展为结构化响应（DB 失败 503 + 200 体带 degraded 矩阵）— `packages/backend/src/routes/healthRoutes.ts:6-16`（P0 已落地，design §4.3 已实现）

### 1.6 §6 相关现状（表 / 限流 / 环境变量）

- **无 PasswordResetToken 表**：schema 全部 model 为 User/Session/Project/ProjectMember/Connection/AuditLog — `packages/backend/prisma/schema.prisma:10-127`
- 限流配置源：`RATE_LIMIT_LOGIN_MAX=5`、`REGISTER=3`、`REFRESH=20`、`GENERAL=200`（/min）— `packages/backend/src/config/env.ts:19-22`
- 限流白名单单一真相源：`RATE_LIMIT_SKIP_PATHS = ['/health', '/auth/heartbeat', '/auth/online']` — `packages/backend/src/utils/ipMonitor.ts:9`；generalLimiter 的 skip 用它（挂载点 `/api/v1/` 下 req.path 已剥前缀）— `server.ts:63-76`；ipMonitor 双形态匹配（`path === p || path === '/api/v1' + p`）— `ipMonitor.ts:34`
- 预存在小 bug（无害）：loginLimiter 的 `skip: req.path === '/api/v1/health'`（`server.ts:44`）在挂载点 `/api/v1/auth/login` 下 req.path 恒为 `/`，该 skip 永不触发
- **FRONTEND_URL 环境变量不存在**：`packages/backend/src/config/env.ts:7-26` 全变量清单无 FRONTEND_URL；同样**无任何 SMTP_* 变量**（无 SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/FROM_EMAIL）
- CORS 现状：`CORS_ORIGIN` 逗号分隔 origin 列表，存在才挂 cors 中间件 — `env.ts:23`、`server.ts:79-84`

### 1.7 净化与审计接口

**净化豁免清单**（`packages/backend/src/middleware/sanitization.ts:14-20`）：
`['password', 'encryptedPass', 'notes', 'oldPassword', 'newPassword']` — 任意层级键名匹配即整棵子树透传（L66）。**`description` 不在豁免清单**（即 Project.description 等字段提交含注入样字符会被 422 拒绝 / XSS 剥离——既存 OQ）。净化中间件挂载：限流后、路由前 — `sanitization.ts:74-99`、`server.ts:103-104`。

**auditMiddleware 挂载端点全集**（grep `auditMiddleware({` 全 routes，共 18 处）：

| 路由文件 | 端点 → action/resource |
|---|---|
| authRoutes.ts:15 | POST /auth/login → AUTH_LOGIN / security（公开端点挂审计的先例，req.user 为 null） |
| authRoutes.ts:16 | POST /auth/register → USER_CREATE / user（authMiddleware 之后、roleMiddleware 之前） |
| authRoutes.ts:18 | POST /auth/logout → AUTH_LOGOUT / security |
| authRoutes.ts:20 | POST /auth/change-password → AUTH_PASSWORD_CHANGE / security |
| authRoutes.ts:21 | PATCH /auth/profile → AUTH_PROFILE_UPDATE / security |
| userRoutes.ts:13-14 | PATCH+DELETE /users/:id → USER_UPDATE / USER_DELETE |
| projectRoutes.ts:12-15 | POST+/PATCH+/DELETE /projects → PROJECT_CREATE/UPDATE/DELETE |
| memberRoutes.ts:13-15 | POST/PATCH/DELETE members → MEMBER_ADD/UPDATE/REMOVE |
| connectionRoutes.ts:12-16 | POST/PATCH/DELETE connections + POST /:id/decrypt-password → CONNECTION_CREATE/UPDATE/DELETE/ACCESS |

- **不挂审计**：refresh、heartbeat、GET 类（authRoutes.ts:11-13 注释明示「spec 排除」）；monitoringRoutes（读端点，monitoringRoutes.ts:2-3）；auditRoutes / healthRoutes（grep 无命中）
- 审计中间件语义要点（`packages/backend/src/middleware/audit.ts`）：
  - 挂载约定：authMiddleware 之后、role/projectRole 之前（403 同记 failure）— L108-111
  - `userId: req.user?.id ?? null`——公开端点（login）userId 落 null 有先例 — L166
  - before 快照仅 PATCH/DELETE 且 resource 有 model 映射（user/project/connection/member）— L26-53
  - detail 脱敏：`SENSITIVE_FIELDS` 命中键值替换 `[REDACTED]`，递归 — L84-103
  - 脱敏清单（`packages/shared/src/constants.ts:50`）：`password, passwordHash, encryptedPass, token, tokenHash, accessToken, refreshToken`（后两个为 #25 追加）
  - IP 掩码落库；失败 reason 记错误码 — L56-82、L155-172

---

## 二、Design 原文 vs 现状偏差（引用 design 行号）

| # | Design 原文 | 现状 | 判定 |
|---|---|---|---|
| D1 | §18 中间件栈顺序：净化（4）在 rate limiters（5）**之前** — design:944-951 | 净化在限流挂载**之后**（server.ts:103-104，注释明示有意为之：「净化正则的 CPU 消耗处于限流保护之内」） | **矛盾**。P1 新增性能监控中间件时照 §18 直排会踩 |
| D2 | §4.2 `GET /api/v1/admin/stats/performance` — design:199 | dashboard/stats/users/stats/projects 已落地，**performance 端点不存在**（monitoringRoutes.ts:11-13） | 预期缺口（P1 实施对象），参照面已齐 |
| D3 | §6.3 重置链接 `${FRONTEND_URL}/reset-password?token=<token>` — design:312 | `FRONTEND_URL` 环境变量不存在（env.ts:7-26）；前端无 `/reset-password` 路由（main.tsx:37-44 仅 `/`、`/login`、`/admin/dashboard`、`/admin/audit-logs`） | **双重缺口**：env + 前端路由都要新增 |
| D4 | §6.4 预留 `SMTP_HOST/PORT/USER/PASS`、`FROM_EMAIL` — design:320 | env.ts 无任何 SMTP 变量 | 未实施（P1 范围裁决点：预留 or 砍） |
| D5 | §6.1 PasswordResetToken 表 — design:283-300 | 表不存在（schema.prisma 仅 6 model） | 预期缺口。字段设计与 Session 表同构（tokenHash unique/expiresAt/ip/userAgent），可直接复制 Session 模式（schema.prisma:29-44） |
| D6 | §11.4 login 返回 `{ require2FA: true, tempToken }` — design:655 | login 返回 `{ accessToken, refreshToken, user }` + 设 refresh cookie（authService.ts:47-51、authController.ts:46-47） | 2FA 分支需要改 login 响应契约 + tempToken 传输通道未定义（design 未说 tempToken 放 cookie 还是响应体） |
| D7 | §11.4 tempToken「SHA-256 哈希后存入 Session 表（复用现有 session 机制），consumedAt 字段标记 2FA 验证完成」— design:660 | consumedAt 现有语义 = **refresh 轮换消费标记**：refresh() 以 `consumedAt: null` 为有效性判据（authService.ts:104-107），非 null 即进入「重用攻击→撤销全部 session」分支（L109-139） | **语义冲突**。tempToken 复用同表同字段会把 2FA 未完成的 session 暴露给 /auth/refresh 的重用检测 |
| D8 | §11.2 User 加 `twoFactorSecret`（注释「加密存储」）+ `twoFactorEnabled` — design:628-641 | User 表无 2FA 字段（schema.prisma:10-27）；项目已有 AES-256-GCM 基建（encryption.ts，ENCRYPTION_KEY 启动强校验 env.ts:29-31） | 预期缺口；加密实现路径已有但 design 未点名用哪个 |
| D9 | §4.4 响应时间经 `res.on('finish')` 存内存环形缓冲区（10000 条）— design:224、design:1217-1221 | 无任何性能记录代码 | 预期缺口（P1 实施对象） |
| D10 | 权限矩阵：forgot/reset-password 未登录列 ✅ — design:913-915；2fa/login 未登录 ✅ — design:933 | 公开端点挂审计有 login 先例（audit.ts:166 支持 userId null；authRoutes.ts:15） | 一致，实施可循 |
| D11 | §6.5 forgot-password 限流 3 次/小时/IP + 每用户 24h 5 次 — design:325-327 | 现有限流全为 **/min 级**（env.ts:19-22），且按 IP（express-rate-limit 默认）；「每用户 24h 5 次」需按用户计数的新机制，现状无对应物 | 半缺口：小时级 limiter 可照抄模式，per-user 计数是新机制 |
| D12 | §6.3 第 3 步「删除用户所有 Session（强制重新登录）」— design:313 | changePassword 已有完全相同的模式（事务 deleteMany + 清 cookie，authService.ts:195-198） | 一致，可循 |

---

## 三、漂移风险点（照 design 直接实施会踩什么）

1. **中间件顺序（D1）**：若按 design §18 把性能监控中间件排在「净化之前」或照抄 §18 序，会与现状「限流→净化」定序矛盾。现状序是 P0 修正过的（server.ts:89-95、103-104 注释链），spec 应以现状为准重述插入点；性能监控的 `req.path` 同样受挂载点剥前缀语义影响（参照 generalLimiter skip 的预存在 bug 教训，server.ts:72-73 注释）。

2. **tempToken × Session.consumedAt 语义冲突（D7）**：design 直接说「复用 Session 表 + consumedAt 标记 2FA 完成」。但现状 consumedAt 非 null 的 session 一旦被 /auth/refresh 触达即判重用攻击并**撤销该用户全部 session**（authService.ts:135-139）。若 tempToken hash 存 Session 表且 cookie/response 双通道都可携带，攻击面与误杀面都会出现。spec 必须裁决：独立列（如 purpose/tokenType）、独立表、或 refresh 侧排除逻辑。

3. **假按钮换真必改测试**：UserManagementModal.test.tsx:143-148 用例断言「不发任何请求」，换真即红。spec 需把「改写该测试 + L104 的 title 断言（如改对话框则 getSupported 变）」列入任务清单，避免实施者临场发挥。toast 文案「密码已重置为 "123456"」是撒谎文案（实际未重置），换真后文案与真实流程（token 告知）需重新定义。

4. **重置密码后的前端会话残留**：design §6.3 只写后端删 session。改密项的教训（见 1.3 节）：内存 access token 在撤 session 后仍有效至 15 分钟上限，且前端无任何主动登出处理。若 admin 重置某用户密码，该用户最长 15 分钟内仍持有可用 access token。「强制重新登录」要成立，需前端配合（401 处理已覆盖 cookie 通道，但 access token 窗口是空档）。spec 应明确接受该窗口还是加 token 版本号/jti 校验。

5. **per-user 限流是新机制（D11）**：design 的「同一用户 24 小时内最多请求 5 次」无法用现有 express-rate-limit 按 IP 模式直接达成（forgot-password 本来就防枚举、可能没有 userId 上下文）。NAT 同 IP 摊薄配额的教训（express-rate-limit 挂载点 memory）在此同样适用：3 次/小时/IP 的 NAT 误杀面要先裁决。

6. **净化豁免与新字段命名**：reset-password 的新密码字段若命名 `newPassword`/`password` 自动豁免（sanitization.ts:14-20）；若引入别的命名（如 `new_password`）会被 XSS 剥离/注入检测扫。2FA 的 `code`、备份的 `confirm` 等新字段无豁免风险（正常值不触发模式），但 spec 写字段名时应对齐豁免清单。`description` 未豁免 OQ 保持现状（无任何处理代码）。

7. **FRONTEND_URL 与 CORS_ORIGIN 的关系未定义（D3）**：两者都是「前端地址」，语义重叠（CORS_ORIGIN 还支持多 origin 逗号分隔）。新增 FRONTEND_URL 时 spec 要说清关系（独立新增 / 从 CORS_ORIGIN 推导 / 合并），否则实施者会自创。

8. **2FA 加密路径（D8）**：design 注释「TOTP 密钥（加密存储）」但未指定机制。项目已有 AES-256-GCM（encryption.ts，Connection.encryptedPass 在用，schema.prisma:84；SENSITIVE_FIELDS 也含 encryptedPass）。若 2FA secret 不走同机制会产生第二套加密口径；若走，审计 detail 脱敏需要把 `twoFactorSecret` 追加进 SENSITIVE_FIELDS（constants.ts:50 现无此键）。

9. **性能监控的挂载点与统计口径**：design 说「全局，记录所有 API 请求响应时间」（design:957）+ 环形缓冲区全局聚合（design:1220）。现状栈里 audit 用 res.json patch、ipMonitor 用 req.path 双形态——性能中间件用 `res.on('finish')` 时挂载位置（express.json 前 / 限流前 / 路由前）决定是否统计被 429/422 拒绝的请求，spec 未写明，实施者会自选。

10. **monitoringRoutes 的审计先例约束**：新 `/admin/stats/performance` 照 monitoringRoutes.ts:2-3 先例不挂审计（读端点）。但 §6.4「管理后台可查看活跃 token」是新 admin 端点——按先例也不挂审计？还是「查看他人重置 token」属敏感操作应挂？先例无直接覆盖，需 spec 裁决。

---

## 四、未决疑问（留给 spec 评审）

1. **tempToken 存储方案**：复用 Session 表 + consumedAt（design:660 原文）与 refresh 重用检测冲突——独立字段 / 独立表 / refresh 排除逻辑，选哪个？（见风险 2）
2. **tempToken 传输通道**：httpOnly cookie（同 refreshToken 模式，path 限定 `/api/v1/auth`）还是响应体由前端持有？design 未写。影响 /auth/2fa/login 的鉴权设计与 cookie path 域。
3. **FRONTEND_URL 与 CORS_ORIGIN 关系**（风险 7）：新增独立变量还是复用？
4. **SMTP 预留是否在 P1**：design:318-321 说一期不发邮件、token 由管理员手动告知——「管理后台可查看活跃 token」端点是否 P1 范围？若在：admin 门禁 + 是否挂审计（风险 10）+ token 明文是否允许在 admin 响应中出现（审计脱敏不覆盖此场景）？
5. **管理面板「重置密码」换真的交互形态**：admin 代发起（按钮 → 生成 token → admin 手动告知）还是触发 forgot-password 流程？#14 拍板「换真」的边界在哪：走 `/auth/forgot-password`（权限矩阵 design:914 标注所有角色含未登录均可调，无 admin 语义）还是新增 admin 端点？
6. **改密 toast 预告 backlog 项**：文案与行为如何改——主动登出（清内存 token + 跳登录页）还是仅改文案声明「当前会话已失效」？重置密码流程是否沿用同一前端行为？
7. **重置后的 access token 空档窗口**（风险 4）：接受 ≤15 分钟残留，还是引入 session 版本号机制？影响是否动 jwt payload（main.tsx:41 注释明确一期契约不动）。
8. **performance 端点统计口径**：是否含被限流/净化拒绝的请求（挂载点定序）；P50/P95/P99 全局聚合是否够（design:1220 说按端点分组是后续优化）。
9. **per-user 24h 限流机制**（风险 5）：新计数器（内存 Map 参照 ipMonitor 模式）还是复用 express-rate-limit 的 keyGenerator？持久化要求（重启清零可接受与否）。
10. **description 净化豁免 OQ**：维持现状（不豁免，用户遇误杀再裁决）还是 P1 顺手加白？与本项目既有 OQ 清单合并处理。
11. **2FA secret 加密口径**（风险 8）：复用 encryption.ts AES-256-GCM？`twoFactorSecret` 是否加入 SENSITIVE_FIELDS？
12. **authRoutes.ts 的审计 action 命名**：现有 AUTH_PASSWORD_CHANGE 与 design §26.1 新增错误码分组「重置」的 action 命名（如 AUTH_PASSWORD_RESET）需在 spec 注册表里一次定齐，避免实施时临时造名。

---

## 附：证据文件清单

| 文件 | 用途 |
|---|---|
| packages/backend/src/services/authService.ts | 登录/刷新轮换/改密撤 session |
| packages/backend/src/utils/jwt.ts | JWT payload、refresh 生成与哈希 |
| packages/backend/src/controllers/authController.ts | cookie 语义、改密清 cookie |
| packages/backend/src/middleware/auth.ts | authMiddleware 结构（2FA 插入点） |
| packages/backend/src/middleware/audit.ts | 审计中间件语义 |
| packages/backend/src/middleware/sanitization.ts | 净化豁免清单 |
| packages/backend/src/server.ts | 中间件栈与限流挂载 |
| packages/backend/src/utils/ipMonitor.ts | 限流白名单单一真相源 |
| packages/backend/src/utils/sessionCleaner.ts | session cron 清理（P1 token 清理参照） |
| packages/backend/src/routes/monitoringRoutes.ts | /admin 端点面 |
| packages/backend/src/routes/healthRoutes.ts | 健康检查现状 |
| packages/backend/prisma/schema.prisma | 全部 model（无 PasswordResetToken / 2FA 字段） |
| packages/backend/src/config/env.ts | 环境变量全集（无 FRONTEND_URL / SMTP_*） |
| packages/shared/src/constants.ts | 并发窗口、脱敏字段清单 |
| packages/frontend/src/components/UserManagementModal.tsx | 假重置按钮 L187、改密 toast L72 |
| packages/frontend/src/components/UserManagementModal.test.tsx | 假行为测试锁定 L143-148 |
| packages/frontend/src/api/queries.ts | useChangePassword 无 onSuccess |
| packages/frontend/src/main.tsx | 前端路由表（无 /reset-password） |
