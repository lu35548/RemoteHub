# P1「WebSocket 通知 + 数据备份」域现状调研

**日期**: 2026-09-24
**性质**: 只查证不决策——为 phase2 P1 立项提供 file:line 级现状证据，防 spec/实施漂移
**Design 基准**: `docs/superpowers/specs/2026-04-23-remotehub-v2-phase2-design.md` v2.1-draft（下称 design，行号以当前工作区文件为准）

---

## 现状事实

### A. 服务入口结构（packages/backend/src/server.ts）

- **无 http server 实例**：`app.listen(PORT)` 直接启动（server.ts:187），全程未 import `http`/`createServer`；ws 库无现成 attach 点，需按 design §8.2.1 重构。
- **无 graceful shutdown**：全 backend/src 搜 `SIGTERM|SIGINT|graceful|shutdown` 零命中。docker stop 时 WS 连接、node-cron 任务、在途请求均为硬杀；design 未提此项。
- **启动序列（async bootstrap，server.ts:167-190，源自 v2-followup design §1.8，`docs/superpowers/specs/2026-07-17-v2-followup-design.md:132-140`）**：WAL pragma（:171-175）→ `ensureAdminSeed`（:178）→ `startSessionCleaner()`（:181）→ `startAuditCleaner()`（:184）→ `app.listen`（:187）。备份 02:00 cron 的既定插入点：:184 之后、:187 之前（与两个 cleaner 并列）。
- **中间件序**：express.json 1mb（:20）→ cookieParser（:23）→ helmet（:26-35）→ 限流定义（:38-76）→ CORS（:79-84）→ trust proxy（:87）→ IP 风险检测中间件（:92-95）→ 限流挂载（:98-101）→ 净化（:104）→ 路由（:116-123）→ 404（:126-128）→ 全局错误处理（:131-150）。
- **helmet 现状**（server.ts:26-35）：CSP 仅 `defaultSrc/scriptSrc/styleSrc/imgSrc` 四项，**无 `connectSrc`**——与 design §8.2.2 要求的五个 directive 相比缺一项。
- **测试守卫**：`NODE_ENV !== 'test'` 才 bootstrap（server.ts:193-198）；`export { app }`（:200）。WS 重构改 export `server` 后，supertest 集成测试的 import 行为是回归敏感点。
- **限流对 WS upgrade 无效**：express 中间件链（含 generalLimiter server.ts:101）不处理 HTTP upgrade 请求——WS 级限流只能做在 `server.on('upgrade')` 里（design :432 注释已预见）。

### B. 定时任务现状（备份 02:00 的挂载模板）

| 任务 | 文件 | cron 表达式 | 启动即清 | 注册点 |
|---|---|---|---|错开关系 |
|---|---|---|---|---|
| session 清理 | `packages/backend/src/utils/sessionCleaner.ts` | `0 3 * * *`（:28） | **是**（:26，启动时先跑一遍） | server.ts:181 |
| 审计清理 | `packages/backend/src/utils/auditCleaner.ts` | `30 3 * * *`（:25） | **否**（「仅定时——不启动即清」，:3 注释、:24） | server.ts:184 |

- 实现：`node-cron`（backend package.json:28 `"node-cron": "^3.0.3"`）+ `prisma.<model>.deleteMany` + catch→logger。备份任务照 auditCleaner 模式（仅定时）比照 sessionCleaner（启动即清）更合理，但属决策不在此展开。
- design §8.6（:529）通知清理 04:00 也是同模板，三新任务（02:00 备份、04:00 通知清理）与既有 03:00/03:30 错开关系已写死在 design :529。

### C. 可疑 IP 告警（W2 场景的高优事件源）

- **检测与审计落点**：`packages/backend/src/utils/ipMonitor.ts`。`checkIpRisk`（:30-63）per-IP 60s 窗口内存计数（阈值 1000，:11-12），超阈且未告警时**直接 `prisma.auditLog.create`**（:50-61），action=`SECURITY_SUSPICIOUS_IP`、resource=`security`、`userId: null`、`ip` 明文（:58 注释「可疑 IP 要精确不要掩码」）。无事件广播机制——审计行落库是唯一的告警表达。
- **中间件挂载**：server.ts:92-95，trust proxy 之后、限流/净化之前（定序理由 :89-91 注释）。**插入 emit 事件的天然位置**：ipMonitor.ts:49-50 `win.alerted = true` 之后（与审计 create 并列 fire-and-forget），即「告警判定点」已收口在这一个函数里，WS 通知插入点唯一。
- **枚举已就位**：`packages/shared/src/enums.ts:27` `SECURITY_SUSPICIOUS_IP` ∈ AUDIT_ACTIONS；resource `security`（:31）。
- **与限流白名单共用单一真相源**：`RATE_LIMIT_SKIP_PATHS`（ipMonitor.ts:9），server.ts:75 与 :34 双形态匹配消费。
- **「W2」全仓库无出处**：所有 .md 搜 `W2` 零命中——该编号只存在于任务描述，design 与 backlog 文档中均未定义。

### D. 改密撤 session / 强制登出插入点

- **changePassword**：`packages/backend/src/services/authService.ts:182-199`。事务 `$transaction([user.update, session.deleteMany({ where: { userId } })])`（:195-198）——**删除该用户全部 session，发起者本人也被踢**（memory: change-password-revokes-sessions）。force_logout 事件的插入点即此事务处；注意 `deleteMany` 不返回被删行，若需对每个被踢 session 推送需先 `findMany` 或按 userId 推送一次。
- **全部 session 删除/撤销点清单**（force_logout 的潜在 emit 源）：
  - authService.ts:197（changePassword 事务内）
  - authService.ts:136-138（refresh token 重用攻击：事务外 postAction 撤销该 userId 全部 session，:135 注释「重用攻击」）
  - authService.ts:116、:149（`user.isActive=false` 后的旧 session 单删）
  - authService.ts:178（logout：仅删自己 tokenHash 对应行，非强踢）
- **无管理员踢人端点**：monitoringRoutes.ts 仅 dashboard/stats 三读端点（:11-13）；无任何 session 撤销管理 API。
- **JWT 工具**：`packages/backend/src/utils/jwt.ts:14` `verifyAccessToken` ——WS 首条消息认证可直接复用（与 authMiddleware auth.ts:34 同一函数）。

### E. 备份可行性

- **无任何既有备份代码**：backend 全包搜 `vacuum|backup` 零命中——VACUUM INTO、备份目录、manifest、备份 API 均为全新增量。
- **Prisma driver adapter 接入**：`packages/backend/src/utils/prisma.ts:8-11`——`new PrismaBetterSQLite3({ url: resolveSqliteUrl(env.DATABASE_URL) })` 传入 `new PrismaClient({ adapter })`。raw SQL 通道：`prisma.$executeRawUnsafe('VACUUM INTO ...')`（design :370 的方案）经此实例可用；WAL pragma 已用 `$queryRaw` 先例（server.ts:171）。
- **DB 文件路径解析**：`packages/backend/src/utils/sqliteUrl.ts:10-15`——相对 `file:` URL 锚定到 prisma/ 目录；compose 环境 `DATABASE_URL=file:/data/prod.db` 是绝对路径原样返回（docker-compose.yml:27）。备份代码若要从 `env.DATABASE_URL` 反推 DB 文件路径（如校验、restore 前），必须走 `resolveSqliteUrl`，否则 dev 下路径分裂。
- **备份文件目录**：现状不存在。生产 DB 在 `sqlite-data` 卷 `/data/prod.db`（docker-compose.yml:27-29）；design §7.2 的 `/data/backups/` 目前无对应目录/卷。
- **docker-compose 现状**（docker-compose.yml）：backend 卷仅 `sqlite-data:/data`（:28-29）；design §7.6 要求加 `backup-data:/data/backups`（:386）——即**嵌套卷挂载**（backup-data 挂在 sqlite-data 卷的子路径上，Docker 语义上可行、子路径遮蔽，但两卷独立生命周期，删 sqlite-data 不会动备份）。design :384 `# ... 现有配置 ...` 的假设与现状一致（无其他卷冲突）。
- **Dockerfile.backend**：`CMD ["sh","-c","npx prisma migrate deploy && node dist/server.js"]`（Dockerfile.backend:23）——备份 cron 在容器主进程内跑，无 sidecar。

### F. 前端通知挂载点

- **顶栏结构**：`packages/frontend/src/App.tsx:220-293` header（h-16，flex justify-between）。左：标题+计数（:221-229）；右 flex 容器 :231-292 依次为：在线用户头像栈（:233-263）→ 在线徽章（:265-272）→ 搜索框（:275-284）→ 新建资源按钮（:285-291）。**通知中心/铃铛 UI 的落点即此右侧 flex 容器**（如搜索框与新建按钮之间）。布局是单页 App 无独立 Layout 组件，Sidebar 是唯一布局组件（:205-217）。
- **轮询现状**：`packages/frontend/src/hooks/useOnlineStatus.ts:22` `setInterval(updateOnlineUsers, 5000)` ——heartbeat+online 是**自建 setInterval 5s 轮询，不经过 TanStack Query**。App.tsx:56 消费；App.tsx:55 注释「每 5s 一轮心跳→在线列表」。
- **TanStack Query**：已装 `@tanstack/react-query@^5.70.0`（frontend package.json:18），用于 projects/connections/dashboard 等查询（App.tsx:7-8 imports）；queries.ts 监控读端点 staleTime 5min（:236-242 注释、:242/:250/:304），**无 refetchInterval**——通知 API 若用 Query 轮询属新模式。
- **vite dev proxy**（vite.config.ts:25-30）：仅 `/api`，无 `ws: true`——dev 模式 WS 需加代理项。
- **前端 WS 客户端**：全 frontend/src 搜 `WebSocket|ws://|wss://` 零命中——**全新增量，无任何现状可对照**。

### G. §8 相关的其他现状

- **schema 无 NotificationQueue**：`packages/backend/prisma/schema.prisma` 全部 6 model：User(:10)/Session(:29)/Project(:46)/ProjectMember(:62)/Connection(:77)/AuditLog(:108-127)——通知表全新。AuditLog.result 列（:114）是 P0 加的（design §3.1 :82-100 无此列，spec 修正表 #15）。
- **CSP 对 ws:// 的影响（比 design 描述更微妙）**：
  - helmet CSP（server.ts:26-35）缺 connectSrc；但 helmet 头只下发在 **backend API 响应**上。
  - SPA 页面由 nginx 托管，**不经 backend**，nginx.conf:12-13 注释明确「安全头不在此层加：backend helmet 已全套下发」——**生产环境页面实际没有 CSP 头**（index.html 亦无 CSP meta，frontend/index.html:1-13）。浏览器对页面内 `new WebSocket()` 的 connect-src 约束目前是空的。
  - 即：design §8.2.2「helmet 加 connect-src」对「页面能否连 ws」在当前架构下**不是决定因素**（页面无 CSP）；加上只是纵深防御。真正卡 WS 的是下一条。
- **nginx 反代无 WS upgrade 配置**：`docker/nginx.conf:28-34` `/api/` location 仅标准四头（Host/X-Real-IP/X-Forwarded-For/X-Forwarded-Proto），**无 `proxy_set_header Upgrade $http_upgrade` / `Connection "upgrade"` / `proxy_http_version 1.1`**——WS upgrade 请求经 nginx 反代到 backend 会失败。P1 必须（a）给 nginx 加 upgrade 头或（b）WS 走独立端口/路径绕开该 location。design 完全未提 nginx 改动。
- **design 说 Caddy，现状是 nginx**：design :30「Docker Compose + Caddy 部署」、:464「Caddy 反代 WebSocket 时 'self' 覆盖 wss:」——docker/ 目录只有 nginx.conf + 两个 Dockerfile，无任何 Caddy 配置。**design 的部署假设已过时**。
- **审计动作枚举就绪**：SYSTEM_BACKUP/SYSTEM_RESTORE/SYSTEM_CONFIG_CHANGE 已在 shared enums.ts:26（design §3.2 :112 定义），备份审计无需扩枚举。
- **env 无备份/WS 变量**：`packages/backend/src/config/env.ts:7-26` 全量变量清单无 BACKUP_*/WS_*/保留期配置（对比 AUDIT_RETENTION_DAYS :25 的下界保护模式——备份保留 30 天若做成 env 需同样的防御）。
- **审计中间件先例**：`packages/backend/src/middleware/audit.ts:113-141`（路由级、res.json patch、setImmediate 落库、IP 掩码 :56-82）；ipMonitor 不走此中间件（无 HTTP 响应语境），直接 create 且 **IP 不掩码**（ipMonitor.ts:58）——两条审计通道形状不同，备份审计（SYSTEM_BACKUP，无 req 语境的 cron 场景）参照哪条需 spec 定夺。

---

## Design 原文 vs 现状偏差

| # | Design 原文（行号） | 现状 | 偏差性质 |
|---|---|---|---|
| 1 | §8.2.1 :423「当前 server.ts 使用 app.listen() 直接启动」 | server.ts:187 确实如此，且无 http server | **无偏差**，design 前提仍成立 |
| 2 | §8.2.1 :438-441 示例把 `startSessionCleaner()` 放 createServer 后 | 现状 cleaner 注册在 bootstrap 内（server.ts:181/:184），重构时 bootstrap 整体需挪进/伴随 server 实例 | 示例为简化片段，实施需保持 WAL→seed→cleaner→listen 顺序（v2-followup §1.8 约束） |
| 3 | §8.2.2 :448「当前 helmet 配置 defaultSrc 不足以允许 WebSocket 连接」 | server.ts:26-35 确无 connectSrc；但**页面实际无 CSP**（nginx 不加安全头 :12-13，index.html 无 meta） | design 对影响面的判断基于「页面有 CSP」的假设，与现状不符——加 connectSrc 是纵深防御而非解锁项 |
| 4 | §8.2.2 :464「Docker 部署中 Caddy 反代 WebSocket」 | 反代是 **nginx**（docker/nginx.conf），且 `/api/` 无 upgrade 头（:28-34） | **部署组件名不符**；且漏了 nginx upgrade 配置这一硬前置 |
| 5 | §7.1 :337 备份存 Docker 卷 `backup-data` | 无备份卷；backend 现有卷仅 sqlite-data:/data（compose :28-29） | 待实施（§7.6 :379-391 已给 diff），注意嵌套卷语义 |
| 6 | §7.2 :343 备份路径 `/data/backups/` | 目录不存在（容器内无 mkdir，Dockerfile.backend 无相关行） | 待实施 |
| 7 | §7.4 :359-364 manifest 方案（backup_manifest.json，不用数据库表） | 无现状实现 | 待实施，无冲突 |
| 8 | §7.5 :368「遵循 sessionCleaner.ts 的既定模式」 | sessionCleaner 是「启动即清」（:26），auditCleaner 是「仅定时」（:3 注释）——**两个先例行为相反** | design 引用的模板本身有分叉，spec 需明确备份（及 04:00 通知清理）取哪个语义 |
| 9 | §8.6 :503-520 NotificationQueue 表 | schema 无此表（6 model 清单见上） | 全新增量，与 design 一致（本就是新增） |
| 10 | §8.5 :499 / §8.1 :405 强制登出/成员变更写通知队列 | force_logout 撤 session 点已收口（authService.ts:197/:136-138）；成员变更在 memberRoutes（member 域） | 待实施；deleteMany 不返回行的细节见现状事实 D |
| 11 | §8.7 :536-537 心跳 30s ping、断线指数退避 1s→30s | 前端无 WS 代码；唯一轮询先例是 5s setInterval（useOnlineStatus.ts:22） | 待实施，无冲突 |
| 12 | §8.6 :529 通知清理 cron 04:00 与「session 03:00、审计 03:30、备份 02:00 错开」 | 03:00/03:30 已存在（sessionCleaner:28/auditCleaner:25），02:00 备份尚不存在 | 时间表自洽；注意 sessionCleaner 启动即清会抢跑 |
| 13 | §1.1 :30「Docker Compose + Caddy 部署」 | nginx | 同 #4，design 背景描述过时 |
| 14 | §3.2 :112 SYSTEM_BACKUP/SYSTEM_RESTORE 审计 | 枚举已在 shared enums.ts:26（P0 交付含 security 系） | **无偏差**，枚举先行就位 |

## 漂移风险点

1. **WS 落地真正的拦路虎是 nginx，不是 CSP**（偏差 #3/#4）。若实施只照 design §8.2.2 改 helmet connectSrc 而漏掉 nginx `Upgrade/Connection/http_version` 三件套，生产 WS 必挂且本地 dev（vite proxy 也要 `ws: true`）表现不一致——两处反代配置都不在 design 范围内，最容易漏。
2. **server.ts 重构波及测试基线**：`export { app }`（:200）+ NODE_ENV guard（:193）+ supertest 集成测试（import app 不触发 listen）——改成 export server 后，integration 套件启动方式、healthcheck（compose :31 用 HTTP health 探测）、`docker healthcheck` 均依赖「app 单独可 import」。改动必须保住「import 不 listen」语义。
3. **无 graceful shutdown 是 WS 前提缺口**：现状硬杀进程（现状事实 A）；WS 长连接 + node-cron 备份任务引入后，「docker stop 时备份写一半 + 连接复位」没有现状保护。design 未提，属 spec 空白而非偏差。
4. **备份 cron 的启动即清分叉**（偏差 #8）：照 sessionCleaner 模式 = 容器一启动就 VACUUM INTO（migrate deploy 刚跑完、seed 刚建 admin 就先备份一次）；照 auditCleaner 模式 = 仅定时。两者可观察行为差异大，spec 不写死必漂移。
5. **通知/备份任务与限流/审计的隐性耦合**：备份手动触发 API 挂 `/api/v1/admin`（design :349-355）会先过 generalLimiter（200/min，server.ts:101）——大备份操作若耗时或 admin 高频操作可能被限流误伤；同时 POST /admin/backups 的审计走 auditMiddleware 还是 service 层直接 create，现状两条通道形状不一（见事实 G 末条）。
6. **嵌套卷语义**：`backup-data:/data/backups` 嵌在 `sqlite-data:/data` 内（compose :28-29 + design :386）——备份卷实际不占 sqlite-data 卷空间，但「删库卷连带备份」的直觉不成立；文档若不写明，运维预期易漂移。restore 场景（§7.3 :354）从 /data/backups 恢复到 /data/prod.db 是跨卷写。
7. **`resolveSqliteUrl` 陷阱**：dev 下 DATABASE_URL 相对路径锚定 prisma/ 目录（sqliteUrl.ts:10-15）——备份/恢复代码凡涉及 DB 路径推导（校验源文件、pre_restore 快照命名 §7.5 :372）都必须复用该函数，绕开会导致 dev 备份「成功」但备了个不存在的库。
8. **ws 库未装**：backend package.json 依赖清单无 `ws`、无 `@types/ws`（现状事实 E/F 搜证）——design :409 说「使用 ws 库」但从未入依赖，P1 新增 dependency 是隐性第一步。
9. **W2 编号无文档出处**：任务语境的「W2 场景重排」在 design、specs、backlog 全部 .md 中无匹配——若立项文档以 W2 指代工作包，需先固化编号定义，否则后续 spec/票面指代漂移。

## 未决疑问

1. **WS 端点路径未定义**：design §8.2 只有 upgrade 处理逻辑（:431-436），未定义 WS 路径（`/ws`？`/api/v1/ws`？）。路径决定 nginx location 匹配（现 `/api/` 只反代该前缀）、generalLimiter 是否覆盖（upgrade 不走 express 链）、vite proxy 条目。需 spec 定夺。
2. **通知推送粒度与 session 的关系**：force_logout 按 userId 推一次还是按被撤 session 各推一次？changePassword 的 deleteMany（authService.ts:197）拿不到被删行，按 session 推需改查询——影响表结构利用（NotificationQueue 按 userId 存）与前端「被踢出哪个设备」语义。
3. **备份/通知清理 cron 的启动语义**（对应偏差 #8）：02:00 备份与 04:00 通知清理各自取「启动即执行」还是「仅定时」？auditCleaner 的「不启动即清」理由（首启误删防线，auditCleaner.ts:3）对备份同样成立（首启就全量备份可能非预期），但备份失败告警（§8.1 :404 system_alert 管理员）依赖运行而非静默。
4. **SYSTEM_BACKUP 审计通道**：cron 触发的备份无 req 语境，auditMiddleware（req/res 绑定）用不上——service 层直接 `prisma.auditLog.create`（ipMonitor 先例）？IP/userAgent 留空还是记 'cron'？需 spec 统一。
5. **SECURITY_SUSPICIOUS_IP 的 WS 事件范围**：推送对象是「全体 admin」还是「仅本机登录的 admin」（单实例内存房间语义，design :533）？design §8.1 :399-405 场景表无此事件（只列系统通知=备份完成/失败），可疑 IP 告警是否入 `system_alert` 需补充定义。
6. **备份保留期可配置性**：design :337「保留最近 30 天」是硬编码还是 env（对照 AUDIT_RETENTION_DAYS :25 的 env+下界模式）？env.ts 现状无对应变量。
7. **restore 的工程边界**：§7.3 :354 restore API 与 §7.5 :372 pre_restore 快照——restore 是覆盖生产 DB 文件（要求 backend 先停写/重启？VACUUM INTO 不能反向恢复）还是清库重导入？现状无任何先例，design 未给机制细节，属最大空白。
8. **nginx/vite 反代变更是否入 P1 范围**：设计文档只字未提（偏差 #4），但为 WS 硬前置。谁出票、验收标准（upgrade 头、`proxy_http_version 1.1`、读超时 `proxy_read_timeout` 长连接调优）需立项时补。
