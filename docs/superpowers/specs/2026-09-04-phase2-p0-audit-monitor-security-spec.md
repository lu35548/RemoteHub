# RemoteHub Phase2-P0 Spec：审计日志 + 系统监控 + 安全增强

**版本**: v1.0-draft
**日期**: 2026-09-04
**状态**: 待用户终审
**产生方式**: grill-with-docs 12 决策 + 代码考证（2026-09-04 会话）
**上游文档**: `2026-04-23-remotehub-v2-phase2-design.md`（刷新基底，原文不动）· `plans/2026-04-30-remotehub-v2-phase2.md`（其 P0 章节随本 spec 作废）· `phase2-backlog.md`（12 项已裁决归位）
**下游**: 拆票（父票 #14 + 约 10 子票，spec→tickets 直通——决策 3 于 2026-09-04 拆票前翻案，无独立 plan 层）→ 分支 `feat/phase2-p0`

---

## 问题陈述

RemoteHub v2 前端迁移 12/12 闭环后，系统具备完整的认证、项目、连接凭据管理能力，但作为存放全员远程连接凭据的内网核心系统，存在三类缺口：

1. **无留痕**——用户增删、连接增删、密码解密等敏感操作发生即逝，出问题无法回答「谁在什么时候动了什么」；登录失败、改密失败等攻击前奏完全不可见。
2. **不可观测**——管理员对系统健康（数据库/磁盘/内存）、用户活跃度、操作趋势无任何可见性；健康检查仅测数据库连通。
3. **防御薄弱**——无输入净化层（XSS/注入模式直抵业务层），无异常流量告警（可疑 IP 行为无人知晓）。

## 解决方案

交付 P0 三模块（全栈，管理员浏览器可操作）：

- **审计日志**：敏感操作（**含失败尝试**）自动留痕，脱敏存储，管理员可查询/筛选/导出，90 天自动清理。
- **系统监控**：管理员仪表盘——健康状态、在线人数（与用户顶栏同口径）、活跃趋势、总量统计、最近活动流（含安全事件）。
- **安全增强**：全局输入净化（XSS 剥离 / 注入模式拒绝）+ 可疑 IP 告警（不阻断，入审计）。

配套交付 `/admin` 管理页面（仪表盘页 + 审计日志页）、favicon 清零、index.html no-cache。

## 用户故事

1. 作为管理员，我想查询所有敏感操作的审计记录，以便追溯「谁在什么时候对什么做了什么」
2. 作为管理员，我想按用户、操作类型、资源类型、日期范围、**成败**筛选审计记录，以便快速定位目标事件
3. 作为管理员，我想导出审计日志为 CSV，以便离线分析或合规留档
4. 作为管理员，我想看到登录失败、改密失败等失败尝试的记录（含失败原因码），以便发现账号撞试的攻击前奏
5. 作为管理员，我想在仪表盘看到系统健康状态（数据库/磁盘/内存/运行时长），以便及时发现资源异常
6. 作为管理员，我想在仪表盘看到与用户顶栏**同口径同数字**的在线人数，以便信任这个数字（产品内「在线」只有一个定义）
7. 作为管理员，我想看到每日活跃趋势（仅统计成功操作），以便把握系统使用健康度而不被失败噪音干扰
8. 作为管理员，我想在仪表盘活动流中看到含失败记录与安全事件的**全量**最近活动，以便第一时间察觉异常
9. 作为管理员，我想在审计记录中看到掩码后的 IP 与脱敏的敏感字段，以便审计展示无可泄露凭据
10. 作为管理员，我想从侧栏入口进入管理页面（普通用户**看不到**该入口），以便功能可发现且权限边界清晰
11. 作为管理员，我想在审计日志页用分页表格浏览大量记录，以便处理长期积累的数据
12. 作为管理员，我想让连接密码的解密访问被记录为 CONNECTION_ACCESS 审计，以便凭据访问有留痕
13. 作为管理员，我想看到可疑 IP 的告警记录，以便关注异常流量来源
14. 作为管理员，我想在审计列表中看到每条记录的成败标识，以便快速区分成功操作与失败尝试
15. 作为管理员，我想在仪表盘看到项目/连接/用户的总量统计，以便掌握系统规模
16. 作为管理员，我想让仪表盘数据有 5 分钟客户端缓存，以便反复访问不压垮后端
17. 作为普通用户，我希望我的密码等敏感字段在任何审计记录中都不可见，以便我的凭据不被二次泄露
18. 作为普通用户，我访问管理页面时被拒绝并重定向，以便权限边界对我的会话同样生效
19. 作为普通用户，我提交含 XSS/注入模式的内容时得到明确的中文错误提示，以便知道输入不合法
20. 作为普通用户，我的正常运维内容（如 notes 里的技术命令）不被安全中间件误拦，以便照常保存
21. 作为系统，我需要在每次敏感写操作（含失败尝试）后异步记录审计，且审计写入失败不阻断业务请求
22. 作为系统，我需要每日自动清理超过保留期（90 天）的审计记录，以便表不无限膨胀
23. 作为系统，我需要保证审计记录无任何修改/删除路径，以便留痕不可篡改
24. 作为系统，我需要在用户被删除后仍保留其历史审计记录（操作人置空），以便追溯不断链
25. 作为系统，我需要对已知良性高频端点（心跳/在线/健康检查）豁免 IP 风险计数，以便 NAT 单出口环境不产生全员误报
26. 作为系统，我需要在磁盘/内存超阈值时由健康检查报告 degraded 状态，以便监控手段能捕获降级
27. 作为运维人员，我想让浏览器在部署新版本后立即拿到最新入口页（index.html 不缓存），以便管理页面发布即刻可见
28. 作为运维人员，我想让浏览器控制台不再出现 favicon 404，以便 console 清零的验收标准可达成

## 实施决策

### 范围与边界（grill 决策 1/3/5/7）

- 本 spec 只覆盖 P0 三模块；P1（备份/WebSocket/密码重置/性能监控/通知）与 P2（导入导出/项目增强/2FA/K8s 探针/Swagger）不在内，各自开工前另行 grill 刷新。
- 流程两层：本 spec（需求/行为契约）→ 拆票（实施细节长在票面：文件清单/接口契约/验收标准）。原定三层（中间 plan 层）于 2026-09-04 翻案取消——工单体系可完整承载实施细节，少一份会漂移的中间文档。
- 交付边界为全栈：API + schema + 中间件 + `/admin` 管理页面，管理员浏览器可操作才算完成。
- 性能指标（P50/P95/P99）整体归 P1——修正 4 月 design §4.1/§4.2 将其列入 P0 仪表盘的越界引用；Dashboard DTO 不含 perf 字段。
- P0 不动 server.ts 启动结构（createServer 重构、graceful shutdown、helmet CSP connectSrc 均为 P1 WebSocket 前置）。

### 审计日志

**数据模型**（继承 design §3.1，按项目约定去除全部 `@db.VarChar`）：

```prisma
model AuditLog {
  id         String   @id @default(uuid())
  userId     String?  @map("user_id")
  action     String
  resource   String
  resourceId String?  @map("resource_id")
  result     String   @default("success")  // 'success' | 'failure'（独立列，修正表 #15）
  detail     String?              // JSON 字符串：{ before?, after?, reason? }
  ip         String?
  userAgent  String?  @map("user_agent")
  createdAt  DateTime @default(now()) @map("created_at")

  user User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([userId])
  @@index([action])
  @@index([resource, resourceId])
  @@index([createdAt])
  @@map("audit_logs")
}
```

- `detail` 存 JSON 字符串，读取时解析为结构化对象返回（继承 §26.3）。
- **成败都记**（grill 决策 4，对 design 的新增语义）：每条记录携带**独立 `result` 列**（'success' | 'failure'——拆票时裁决独立列而非藏 detail JSON：result 筛选与趋势 success-only 需走 Prisma where）；失败时 detail 附 `reason`（错误码，如 AUTH_006）。判定依据为响应状态码（2xx = success）。
- action 枚举继承 design §14.2 全集并**移除 AUTH_REGISTER**（共 21 值）：建用户唯一路径 /auth/register 记 **USER_CREATE**（行为语义优先于端点命名——仅 admin 可注册的系统里 AUTH_REGISTER 是永不可达的死值）；resource 枚举 6 值。落 shared 包。

**审计中间件**（继承 design §3.5，含 6 月修订）：

- 路由级挂载（非全局）。**端点清单以 v2 真实路由为准**（2026-09-04 逐一核对，与 design §3.5.1 两处出入见修正表 #13/#14）：
  - auth：login / logout / change-password / profile（PATCH）/ register（记 **USER_CREATE**，见修正表 #13）
  - users：PATCH /:id、DELETE /:id（**无 POST /users**——design 该端点不存在，建用户唯一入口是 /auth/register）
  - projects：POST、PATCH /:id、DELETE /:id
  - members：POST、PATCH /:uid、DELETE /:uid
  - connections：POST、PATCH /:id、DELETE /:id、decrypt-password（POST）
  - **排除**：`/auth/refresh`、**`/auth/heartbeat`**（修正表 #14）与所有 GET。
- `res.json` monkey-patch 模式（Express 5 环境下验证，见 design §26.4）：before 快照由中间件自治获取（`:id` 参数 + resource→model 映射自动 findUnique，无需每路由传回调——6 月修订案）；after 快照取自响应体；`setImmediate` 异步落库，审计失败仅记日志不传播错误。
- **脱敏规则**（继承 §3.4）：`SENSITIVE_FIELDS`（passwordHash/encryptedPass/token/tokenHash，**票 #16 实施追加 `password`**——decrypt-password 端点响应体含明文密码，不脱敏则明文落审计表，违背 §3.4 脱敏初衷）值替换为 `[REDACTED]`（保留字段名标识变更）；IP 掩码末段（IPv4 点分末段置 `*`；IPv6 同理掩码后缀——修正 design 正则仅覆盖 IPv4 的缺口，dev 直连 `::1` 场景）。
- userId 取自认证中间件挂载的 req.user；未认证端点（login）为 null。

**查询 API**（继承 design §3.3 + 决策 4 扩展）：

- `GET /api/v1/audit-logs`——admin 专属；过滤参数 `userId/action/resource/startDate/endDate/result/page/pageSize`；分页 clamp 复用 shared 既有常量（DEFAULT_PAGE_SIZE=20 / MAX_PAGE_SIZE=100）。
- `GET /api/v1/audit-logs/export`——admin 专属；CSV 流式下载；单次导出条数上限 10000（按时间倒序取最近，超出截断；导出按钮 title 注明上限）。
- 响应遵循统一 `{success, data, pagination}` 契约（与既有列表端点一致）。

**清理机制**（继承 §3.5.3 + 6 月修订）：

- node-cron 每日 03:30（与 session 03:00 错开）删除超过 `AUDIT_RETENTION_DAYS`（默认 90）的记录；**启动时不立即执行**（避免首启误删，6 月修订案）；遵循 sessionCleaner 既有模式；挂入 bootstrap 启动序列（sessionCleaner 之后）。
- 审计记录不可篡改：不提供任何 UPDATE/DELETE API。

### 系统监控

**API**（继承 §4.2，perf 除外）：

- `GET /api/v1/admin/dashboard`——admin 专属：健康状态 + 在线数 + 总量统计 + 最近活动流。
- `GET /api/v1/admin/stats/users`——活跃趋势（每日登录/操作次数，日粒度、默认窗口近 30 天，**仅 success**——grill 决策 8b）。
- `GET /api/v1/admin/stats/projects`——项目连接统计。
- `~~GET /admin/stats/performance~~`——归 P1（grill 决策 7）。

**口径**（grill 决策 6/8，对 design §4.1 的修正）：

- **在线数 = `lastActiveAt` 距当前 5 分钟内的用户数**（复用既有 5min 窗口语义常量），与前端顶栏「N 人在线」同源同数；**不用** Session 口径（design 原文的 `consumedAt=null AND expiresAt>now` 语义为「未过期会话数」：refresh token 默认有效期 **7 天**（JWT_REFRESH_EXPIRES_IN，`env.ts:13`），挂机用户的 session 在 7 天内常驻「在线」，数字虚高失真）。仪表盘不另设「活跃会话数」指标。
- 最近活动流：全量审计记录（含 failure 与 SECURITY_SUSPICIOUS_IP 安全事件）——仪表盘的告警价值所在；默认取最近 **20 条**。
- Dashboard DTO 结构继承 design §14.1（health/onlineUsers/stats/recentActivity），无 perf 字段。

**健康检查扩展**（继承 §4.3）：

- 现有 `/api/v1/health` 从 `{status:'ok',timestamp}` 扩展为 `{status:'healthy'|'degraded', database, diskUsage, memoryUsage, uptime}`；保持 `{success, data}` 外层契约；HTTP 200/503 语义不变（Docker healthcheck 只看状态码，向后兼容已验证）。
- 阈值沿用 V1 已验证值：内存 75% 警告 / 90% 故障，CPU 75/90，磁盘 80/95。
- 不引入外部监控系统（Prometheus/Grafana），保持部署简单。

### 安全增强

**输入净化中间件**（继承 §5.1，挂载顺序修正）：

- 全局挂载：JSON 解析之后、**限流器之后**、路由注册之前——修正 design §18 的原排序（净化在限流前）：限流先挡高频流量，净化正则的 CPU 消耗处于限流保护之内。作用对象：`req.body` 与 `req.query`（v1 先例同范围；路由 params 由路径模式限定，无注入面）。
- 防护：XSS 剥离（`<script>` 标签/事件处理器/`javascript:` 协议——剥离而非拒绝）；SQL 注入、NoSQL 注入（`$` 操作符）、路径遍历、命令注入模式 → 拒绝并返回 VAL_001（**422**，`appError.ts` 现值）中文错误。
- 排除字段：`password`、`encryptedPass`、`notes` 不净化（notes 含合法技术命令内容）；实施修正追加 `oldPassword`、`newPassword`（票 #18 review：change-password 端点键名不命中 password 精确匹配，密码合法含注入样字符——不豁免则改密 422 或剥离后入库致改密成功即无法登录）。
- 误杀处理：正则按内网中文场景调优；实施中发现误杀用例时优先收窄模式而非加白。

**IP 风险检测**（继承 §5.2 + grill 决策 9 的 NAT 修正）：

- per-IP 60 秒窗口内存计数，超阈值（1000 req/min）记 `SECURITY_SUSPICIOUS_IP` 审计（无 userId，detail 含请求计数与窗口）；**仅告警不阻断**。挂载于**输入净化之前**（越靠外计数越全）：被净化拒绝的注入尝试仍计入风险计数——注入尝试本身就是可疑信号，拒绝与告警在此形成闭环。
- **计数器豁免限流白名单端点**（heartbeat/online/health）——与限流 skip 共用同一份清单常量（单一真相源，两处消费）；否则 NAT 单出口下全员心跳正常流量即触阈值（30 人 × 12 心跳/min ≈ 400-600），告警通道被误报刷废。
- 内存 Map 带窗口过期淘汰，防长期运行泄漏。

### 前端（/admin 管理后台）

- 路由骨架：`/admin/dashboard` 与 `/admin/audit-logs` 两页 + `requireAdmin` loader 守卫（对称既有 requireAuth/requireUnauth 先例）；非 admin 访问重定向回工作台。
- Sidebar 管理入口仅 admin 角色渲染（入口隐藏而非仅路由拒绝）。
- 仪表盘页：健康状态卡片（数据库/磁盘/内存/uptime，阈值变色）、在线人数、活跃趋势折线、总量统计、最近活动流列表（含安全事件高亮）；TanStack Query staleTime 5 分钟。
- 审计日志页：筛选栏（用户/操作类型/资源类型/日期范围/成败）、分页表格（复用新 DataTable 通用组件：排序/分页/空态）、CSV 导出按钮（下载流）。
- 活动流与趋势的成败口径按决策 8（活动流全显、趋势 success-only）；审计列表默认显示全部成败（result 筛选器默认「全部」）。
- UI 遵循既有体系：深色 slate-950 中文界面、UIComponents/Modal/toast、constants 映射层先例（action/resource 枚举 → 中文标签表）。
- 错误提示沿用 errMsg 动态取 `error.message` 先例；**不引入 shared errorCodes.ts**（前端按 message 消费为既定先例，推迟到出现 code 驱动 UI 的需求）。

### 部署与工程（P0 收编 backlog 项）

- `public/favicon.ico`：消除浏览器 console 404（P0 总验收 console 清零的前置）。
- nginx 对 index.html 下发显式 no-cache 头：P0 新增 admin 页面即新 chunk，防旧入口被启发式缓存延迟可见。
- 顺带修正 `server.ts` trust proxy 处过时注释（注释仍写 Caddy，实际反代为 nginx）。

## 测试决策

**好测试的标准**：只断言外部可观察行为（HTTP 契约、中间件可观察效果、落库结果），不断言实现细节；mock 一律按真实运行时形状构造（本项目两次教训成文）。

**Seam 布局**（P0 唯一新增测试手段：supertest，挂入既有 integration project）：

| 层 | seam | 被测对象 | 先例 |
|---|---|---|---|
| backend unit | 既有（createPrismaMock） | auditService 查询/分页 clamp/CSV 序列化/清理 cutoff、monitoringService 聚合、净化纯函数 sanitizeValue、IP 计数纯逻辑、maskIp/脱敏纯函数 | backend 212 测试基线（Plan C service 单测体系） |
| backend integration | 既有（真实临时 SQLite + migrate deploy）+ **新增 supertest HTTP 层** | 审计中间件横切行为（真实 res.json 拦截、成败记录、脱敏落库、before/after diff）、净化中间件拒绝/剥离（真实 422/200）、admin 门禁（403）、审计查询端到端 | schema.test.ts（约束断言扩展 AuditLog 表） |
| frontend unit | 既有（jsdom） | 仪表盘页/审计页组件、admin 守卫、DataTable、queries hooks | T1 落地的组件测试体系 |
| 验收面 | 既有惯例（Chrome DevTools MCP） | 父票验收：admin 五路径浏览器级验证 + console/network 清零 | T11 五路径总验收 |

- supertest 测中间件横切行为的理由：mock Request/Response 测 res.json patch 属伪造形状；真实 HTTP 层 + 真实 SQLite 是最高可用 seam。
- 集成测试继续受 fileParallelism:false 约束（既有防 flaky 决策）。
- 质量门基线 302（shared 37 + backend 212 + frontend 53）随各票新增测试刷新，票面记录新基线。

## 范围外

- **P1 全部**：数据备份、WebSocket 实时通知、密码重置（含假重置按钮换真、改密 toast 预告——backlog 归位决策）、通知队列、性能监控（P50/P95/P99）、server.ts createServer 重构、graceful shutdown、helmet CSP connectSrc、WebSocket×心跳轮询关系裁决（P1 议题）。
- **P2 全部**：导入导出、项目增强、2FA、K8s 探针、Swagger（含 Express 5 兼容性验证）。
- **backlog 留守 8 项**：编辑换项目、编辑密码清空、用户列表超 100 截断、a11y、setup Modal 文案、copyTarget、proxy_pass DNS resolver、CI actions v5。
- shared errorCodes.ts（推迟，见实施决策）。
- 存量列表（用户/连接）的分页 UI 改造。
- nginx WebSocket 反代配置（P1 WS 前置，本批仅 HTTP）。

## 补充说明

### 对 4 月 design 的修正对照（grill 2026-09-04）

| # | design 原文 | 修正 | 依据 |
|---|---|---|---|
| 1 | §4.1 在线用户数 = Session 口径 | lastActiveAt 5min 窗口 | 决策 6：Session 口径实测为「未过期会话数」，挂机常驻在线；与 T8 顶栏统一 |
| 2 | §4.1/§4.2 P0 仪表盘含 API 响应时间 | perf 整体归 P1 | 决策 7：与 §2 模块表/§14.1 DTO 的 P1 归属对齐 |
| 3 | §3 审计 action 无成败维度 | detail 带 result/reason，成败都记 | 决策 4 |
| 4 | §5.2 IP 计数全量 | 豁免限流白名单端点 | 决策 9：NAT 单出口误报（T8 教训） |
| 5 | §3.1 AuditLog 带 @db.VarChar | 移除 | 项目约定（SQLite 切换后全局去 VarChar） |
| 6 | §3.4 maskIp 仅 IPv4 | 覆盖 IPv4/IPv6 | dev 直连 ::1 场景 |
| 7 | §18 净化挂载在限流之前 | 限流之后、路由之前 | 限流保护净化正则 CPU 面 |
| 8 | §3.5.3 清理 cron（启动行为未明确） | 仅 cron 不启动即清 | 6 月修订案继承 |
| 9 | §1.1/§8.2.2 部署形态写 Caddy | 现实为 nginx（T10）；server.ts:83 注释顺带修 | 仓库现状 |
| 10 | §19 前端设计基于 v1 前端体系 | 按 v2 定型体系（Tailwind v4/UIComponents/TanStack/loader 守卫）实施 | 前端迁移 12 票成果 |
| 11 | §20.2 集成测试 globalSetup（db push 方案） | 复用已落地 testDb 基建（migrate deploy 方案），仅新增 supertest 手段 | D9 实施结果 |
| 12 | plan Task 0.1 dotenv 前置 | 不需要 | dev 启动走 --env-file（T8 实证），compose 走 env_file；dotenv 误判已由 6 月修订自我纠正，此处终裁 |
| 13 | §3.5.1 审计端点含 POST /users | 该端点**不存在**（v2 建用户唯一入口 /auth/register，T7 契约）；USER_CREATE 挂到 register，AUTH_REGISTER 枚举移除（死值） | 2026-09-04 路由逐一核对 |
| 14 | §3.5.1 排除清单仅 refresh + GET | 增补排除 **POST /auth/heartbeat**（T2 新增端点，4 月 design 不可见；不排除则 NAT 下心跳以 ~360 条/min 刷爆审计表） | 路由核对 + T2/T8 事实 |
| 15 | 初稿 result 藏于 detail JSON | result **独立列**，detail 只存 {before?, after?, reason?} | 拆票时票 3（result 筛选）/票 6（趋势 success-only）的 Prisma where 查询需求倒逼——JSON 内字段不可 where |

### 既定事实（已考证，2026-09-04）

- `trust proxy 1` 已配置 + nginx 已转发 X-Forwarded-For——审计记录真实客户端 IP 的链路就位。
- 限流白名单现值 `['/health', '/auth/heartbeat', '/auth/online']`（相对挂载点路径），IP 检测与限流共用抽常量。
- shared 既有 `DEFAULT_PAGE_SIZE=20 / MAX_PAGE_SIZE=100`、5min 活跃窗口常量——分页与在线口径直接复用。
- helmet 现状无 connectSrc（P0 不需要）；中间件栈序与挂载点已核对。
- V1 参照实存：v1 目录下 `middleware/sanitization.ts` 与 `middleware/securityEnhancements.ts`（2026-09-04 核实），迁移期可参考。

### 流程与治理

- 分支 `feat/phase2-p0`；父票（本文摘要+指针）+ 约 10 子票 + native issue dependencies；单推分支、随票关 issue。
- 实施惯例沿用：TDD（红→绿）→ 真实链路验证（dev 栈 --env-file / compose 8080）→ 双轴 code-review → 全量质量门 → `Closes #N`。
- 术语以根 `CONTEXT.md` 为准（在线/活动流/活跃趋势/审计记录/可疑 IP，本会话新增）。
- backlog 处置纪律不变：完成划项注 commit，新悬置入 backlog。
