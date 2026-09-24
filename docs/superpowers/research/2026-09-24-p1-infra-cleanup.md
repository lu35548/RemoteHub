# P1 立项考古：基建收尾域现状 + v1 backend 目录删前盘点

> 2026-09-24 / 只查证不决策 / 引用行号均实测。基线：分支 `feat/phase2-p0`，HEAD `6930677`（2026-09-24）。
> design = `docs/superpowers/specs/2026-04-23-remotehub-v2-phase2-design.md`（下称 design）。

## 现状事实（每条带 file:line 引用）

### 1. 数据导入导出

- design §9 原文 L541-580：导出格式表 L543-548——「JSON（完整）：项目 + 成员 + 连接」「CSV（连接）：连接列表」；API 面 L550-560（`GET /projects/:id/export`、`GET /admin/export/all`、`GET /connections/export?projectId=&format=csv`、`POST /projects/:id/import`、`POST /admin/import`）；权限 L563-568。
- design 实现要点 L570-579：L572「连接密码导出时保持加密，导入时需相同 `ENCRYPTION_KEY`」；L573「CSV 导入/导出仅含连接基本信息（不含密码和加密字段）」；L574 全量导入 `merge`（默认）/`overwrite`（需 `{"confirm": true}`）；L576 导入端点路由级 `express.json({ limit: '50mb' })` 覆盖全局 1MB；L577 CSV 导出列 `name, host, port, protocol, vpnType, notes, tags, username`；L578 tags 逗号分隔单字符串存储。
- **shared 现状无任何导入导出 DTO**：`packages/shared/src/types.ts` 全文 271 行，接口清单中无 `ImportResult` / `ExportData` / `Backup`（design §14.1 L740-746 的 `ImportResult { total/success/skipped/failed/errors }` 未落地）。现有最近似的导出数据源 DTO：`ConnectionListItem`（types.ts L130-149，含 `hasPassword`/`tags: string|null`/`lastAccessed`，无密码）与 `ConnectionDetail`（L150-170，含可选 `encryptedPass?: string | null` 密文字段）。
- 连接密码加密存储：`packages/backend/src/utils/encryption.ts` L14-22 `encrypt()` 产出四段 base64 `v1:iv:ciphertext:authTag`（AES-256-GCM）；L24-53 `decrypt()` v1 分支失败时回落 `ENCRYPTION_KEY_OLD` 懒迁移（L37-47）。密钥来源 `packages/backend/src/config/env.ts` L14-15（`ENCRYPTION_KEY` 必填、`ENCRYPTION_KEY_OLD` 可选）、L29-30 启动校验必须 base64 解码后 32 字节。版本常量 `ENCRYPTION_VERSION = 'v1'` 在 `packages/shared/src/constants.ts` L45。**单一全局密钥、无 KMS/无按用户密钥——跨实例导入密文可解的充要条件是两实例共享同一 `ENCRYPTION_KEY` 环境变量**。
- v2 已有 CSV 导出先例（审计日志，非连接）：`packages/backend/src/routes/auditRoutes.ts` L11 `auditRoutes.get('/export', authMiddleware, roleMiddleware('admin'), ...)`；`packages/backend/src/services/auditService.ts` L25 `CSV_HEADER = 'id,action,resource,resourceId,userId,ip,userAgent,detail,createdAt'`、L26 `CSV_EXPORT_LIMIT = 10000` 截断、L173-174 RFC 4180 `csvEscape`。
- `packages/backend/src/routes/connectionRoutes.ts` 全文 L1-19 仅 6 端点（list/create/get/patch/delete/decrypt-password），**无 export 端点**——design §9 的连接 CSV 导出未建。
- 全局 body 限制现状：`packages/backend/src/server.ts` L20 `app.use(express.json({ limit: '1mb' }))`。

### 2. Swagger

- design §13 原文 L684-707：技术方案 L686-692「`swagger-jsdoc` + `swagger-ui-express`，从 JSDoc 注释自动生成 OpenAPI 3.0」+ 兼容性风险自认（两库依赖 Express 4 API 未声明 Express 5 兼容；备选 (A) tsoa、(B) 手写 openapi.yaml + swagger-ui-dist）；API L694-697（`GET /api/v1/docs`、`GET /api/v1/docs/swagger.json`）；实现要点 L701-707（仅非生产启用、JSDoc 写在各 route 文件、引用 `@remotehub/shared` 类型生成 schema）。
- v2 路由结构现状：Express 5 单文件 app（`packages/backend/src/server.ts`，无独立 app.ts），路由集中在 server.ts L116-124 挂载（`/api/v1/health|auth|users|projects|projects/:id/members|connections|audit-logs|admin`）；各 routes/*.ts 导出 `RouterType` 工厂、无装饰器、controller 命名空间导入。对 swagger-jsdoc：需以 `apis` glob 扫 routes+server 注释，路径参数如 `app.use('/api/v1/projects/:id/members', ...)` 与文件内相对路径拼接是拼 spec 时的注意点。
- 统一响应格式对 schema 生成的约束：错误壳 `server.ts` L121-145（`{ success: false, error: { code, message, details? } }`）；成功壳 `packages/backend/src/routes/healthRoutes.ts` L14-16（`{ success: true, data }`）；shared 已有 `ApiResponse<T>`（types.ts L3）。生成 OpenAPI 时每端点需 wrapper schema（`success` 恒真 + `data`/`error` 二选一），现有 DTO 不能直接当 response schema 用。
- **v1 考古（Express 4 时代真跑过 swagger-ui）**：`backend/package.json` L38 `express ^4.18.2`、L49-50 `swagger-jsdoc ^6.2.8` + `swagger-ui-express ^5.0.0`、L60-61 types；`backend/src/app.ts` L115 `app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions))`、L120 spec JSON 端点；配置 `backend/src/config/swagger.ts`（openapi 3.0.0、描述里固化了错误格式文档——带 timestamp/path/method，比 v2 现行 error 壳多三个字段）；`backend/src/docs/apiDocumentation.ts` 是第二套 swagger 定义（双配置冗余共存）。全路由文件内嵌 `@swagger` 注解实践：`backend/src/routes/connections.ts` L484-516（clone 端点完整注解）、`backend/src/routes/export.ts`（整文件注解）、`backend/src/routes/health.ts`、`backend/src/routes/auth.ts` L252/L288、`backend/src/routes/index.ts` L11-36。
- v1 是 Express 4——design「Express 4 API 依赖」的兼容性风险论断不受 v1 反证，但**注解写法样板可直接考古**。

### 3. K8s 探针

- design §12 原文 L666-682：三端点 L668-672（`GET /api/v1/health/live` 进程存活、`/health/ready` 可接受流量（数据库可达）、`/health/startup` 初始化完成）；实现要点 L676-681（`/live` 仅 200；`/ready` 检查数据库 + 磁盘空间 < 95%（复用 §4.3 健康检查逻辑）；`/startup` 检查 Prisma migrate 是否完成 + 种子数据是否存在）。
- 现状单端点五字段：`packages/backend/src/routes/healthRoutes.ts` L6-19 `GET /` 调 `getSystemHealth()`，DB 失败 503（L9-12，注释「Docker healthcheck 只看状态码」）；`packages/backend/src/services/monitoringService.ts` L18-36：`SELECT 1` 探 DB（L20-23）+ statfs 磁盘 + os 内存 + uptime；L33 degraded 判定 `!database || memoryUsage > 90 || diskUsage > 95`；L35 返回 `{ status, database, diskUsage, memoryUsage, uptime }`。shared 契约 `packages/shared/src/types.ts` L238-245 `SystemHealth`（`status: 'healthy' | 'degraded'` 字面量联合、`diskUsage -1 = 探测失败`）。
- 方案空间素材：`/live` 现有端点已超配（现含 DB 检查，live 需剥离）；`/ready` 现有 503 仅由 `database` 决定（healthRoutes L9-12），磁盘 >95% 只影响 body 的 `status` 字段不影响状态码——若 K8s 只看状态码会漏磁盘维度；`/startup` 所需的「migrate 完成」现状无直接探针物，但启动 bootstrap 已串行化：`server.ts` L166-171 WAL 切换失败即抛、L173-181 `ensureAdminSeed`（admin count 查种子）。compose 现用健康检查：`docker-compose.yml` backend L30-35（node fetch `localhost:3001/api/v1/health`）、frontend L11-17（wget 显式 `127.0.0.1`，注释说明 localhost→::1 陷阱）。

### 4. backend/ v1 目录考古（删前盘点）

- 规模：git tracked 116 文件（`git ls-files backend`），其中 `backend/src` 105 文件（104 个 .ts）；另有根 `backend/routes/onlineStatus.ts` 1 个、`backend/scripts` 3 个（`dev-setup.bat`/`dev-setup.sh`/`test-migration.ts`）。src 结构：controllers 13 / routes 15 / services 13 / repositories / models（TypeORM Active Record）/ migrations-disabled / middleware / utils / validators / types / enums / config / database / mocks / docs。
- **死代码判定（最重要考古结论）**：`backend/src/routes/index.ts` L60-77 实际只挂载 7 组路由：`auth`/`health`/`users`/`projects`/`connections`/`remote-connections`/`migration`。**`export`/`backup`/`audit`/`monitoring`/`security` 五个路由文件从未挂载**——这些功能（含 530 行 exportService、599 行 backupService）是「写了没接线」的设计稿，不是运行验证过的实现。
- 各专项答案：
  - **连接 clone：v1 做过**。`backend/src/routes/connections.ts` L517 `router.post('/:id/clone', cloneConnection)`（含 L484-516 swagger 注解）；controller `backend/src/controllers/connectionController.ts` L350-365；repo `backend/src/repositories/ConnectionRepository.ts` L501-526（owner 校验 → `model.clone(newName)` → 新 uuid → save）。v2 零对应（`packages/backend/src` grep clone/duplicate 零命中）；design §10.1 L585 计划的是项目级 `POST /projects/:id/duplicate`。
  - **tag 过滤：v1 做过**。`backend/src/routes/remoteConnections.ts` L238-242 `GET /by-tag/:tag`；tags 逗号串↔数组转换 `backend/src/controllers/connectionController.ts` L42-43（split+trim）、L161-162、L272-273（join）。v2 schema 同款存储：`packages/backend/prisma/schema.prisma` L90 `tags String?`。
  - **统计：v1 做过**（remote-connections 维度）。`backend/src/services/remoteConnectionService.ts` L206-213 `getConnectionStats` 返回 `{ total, byProtocol, active, recentlyAccessed }`；repo 实现在 `backend/src/repositories/RemoteConnectionRepository.ts` L200。v2 已有对位物：`monitoringRoutes.ts` L14-16 admin 维度 `stats/users`、`stats/projects`（P0-6）。
  - **最近访问：v1 做过**。`backend/src/repositories/RemoteConnectionRepository.ts` L276 `getRecentlyAccessed(userId, limit=10)`、L269-270 `increment accessCount + update lastAccessed`；model `backend/src/models/RemoteConnection.ts` L114/117 字段、L276-277 `recordAccess()`。v2 schema 有 `lastAccessed`（schema.prisma L91）但**无 accessCount**；v2 无 recent 端点。
  - **密码重置：v1 做过完整链路，但存储是半成品**。`backend/src/routes/auth.ts` L284 `POST /forgot-password`（带 passwordResetRateLimit）、L326 `POST /reset-password`；controller `backend/src/controllers/authController.ts` L371/L428；service `backend/src/services/passwordResetService.ts` 428 行，但 L23-24 `private resetRequests: Map<...> = new Map()` 注释自认「在实际应用中，这应该存储在数据库中」——**内存 Map，重启即失**；依赖 `EmailServiceError`（`backend/src/utils/errors`），邮件从未真接。
  - **数据导入导出：v1 只做了导出侧，且未接线**。`backend/src/services/exportService.ts` 530 行：L13 format `json|csv|xlsx`、L14 entityType `users|projects|connections|audit-logs`、filters/fields/limit(默认 10000)、CSV 流式生成 L411-448、L514 `supportedFormats`。**全文 grep `password` 零命中——导出根本不含密码字段**。`backend/src/controllers/exportController.ts` + `backend/src/routes/export.ts`（4 端点：POST `/`、GET `/config`、GET `/history`、POST `/preview`）均未挂载。`migrationController.ts` L1-3 注释自认是「localStorage 到数据库的迁移 API」——一期历史包袱迁移，与 P2 导入导出无关。
  - **备份：v1 有完整设计稿（未接线）**。`backend/src/services/backupService.ts` 599 行：gzip 压缩 + AES 加密（可选项）+ json/sql 双格式 + BackupMetadata（含分实体计数）+ RestoreOptions（overwriteExisting/validateData/skipEntities）。
- **删前值得读清单（≤10，按 P1 相关度排序）**：
  1. `backend/src/services/exportService.ts` —— 导出实体拆分/字段过滤/CSV 流式的组织方式（未接线设计稿，读结构不读实现细节）
  2. `backend/src/routes/export.ts` —— swagger-jsdoc 注解完整样板（P1 Swagger 任务的注解参考）
  3. `backend/src/services/passwordResetService.ts` —— token 生命周期/过期/防重放设计（内存 Map 部分明确不抄）
  4. `backend/src/repositories/ConnectionRepository.ts` —— cloneConnection 语义（L501-526，改名策略/字段深拷贝口径）
  5. `backend/src/services/remoteConnectionService.ts` —— getConnectionStats/byTag 的统计口径（L206-242）
  6. `backend/src/repositories/RemoteConnectionRepository.ts` —— recentlyAccessed/accessCount 的实现方式（L200-280，v2 若补 accessCount 字段可参照语义）
  7. `backend/src/services/backupService.ts` —— 备份元数据/恢复选项的设计面（P1 备份域若立项）
  8. `backend/src/config/swagger.ts` —— swagger-ui 挂载与 options 组织（连同 `backend/src/docs/apiDocumentation.ts` 看双配置冗余反例）
  9. `backend/src/routes/health.ts` —— v1 四健康端点分层（/、/detailed、/database、/database/config）对照 P1 三探针设计
  10. `backend/src/controllers/connectionController.ts` —— tags split/join 归一化（L42-43/L161-162/L272-273，CSV 导入同款边界）
- **无萃取价值（标记删除）**：`models/*` 全部（TypeORM Active Record，Prisma 下无意义）、其余 repositories 常规 CRUD、`middleware/*`（v2 已有对位实现）、`utils` 常规件（logger/compression/errors 等中 health/db-test 的 mysql+mssql 双测已是死需求）、`redisService.ts`（v2 单实例内存路线，design §8.7 自认一期单实例）、`websocketService.ts`（design §8 另起炉灶）、`monitoringService.ts`/`securityMonitoringService.ts`/`sessionService.ts`/`jwtService.ts`/`passwordService.ts`/`container.ts`（v2 各有对位或属未接线监控壳）、`migrations-disabled/*`、`mocks/*`、`validators/*`、`types/*`、`enums/*`、`config/*` 其余、`scripts/` 3 个、根 `routes/onlineStatus.ts`、`uploads|logs|backups|data` 数据目录。

### 5. 工程项现状

- CI：`.github/workflows/ci.yml` 双 job（backend L8 / frontend L24），actions 全 v4：`actions/checkout@v4`（L10、L26）、`pnpm/action-setup@v4`（L11、L27）、`actions/setup-node@v4`（L12、L28），`node-version: '20'`（L13、L29）。v4→v5 升级面 = checkout、setup-node 两个 action 各两处（pnpm/action-setup 无 v5）；顺带评估 node 20→22。
- nginx：`docker/nginx.conf` L29 `proxy_pass http://backend:3001;`——**无 `resolver` 指令、无变量化 upstream**，启动时解析一次服务名，即 T10 遗留（`implementation-notes.md` L527/L549「backend 容器重建换 IP 需 restart frontend 或 resolver + variable 方案」；`docs/superpowers/specs/phase2-backlog.md` L28 未勾选项）。其余现状：L12-13 安全头不加层注释（helmet 已下发防重复头）、L22-26 `location = /index.html` no-cache（票 #24 验收补）、L32-37 SPA fallback。
- docker-compose healthcheck：frontend L11-17 `wget http://127.0.0.1/`（显式 IPv4 + 注释）；backend L30-35 `node -e fetch('http://localhost:3001/api/v1/health')`——**backend 用 `localhost` 而 frontend 注释口径强调必须显式 IPv4**（node fetch 对 localhost 先试 ::1，未炸是因为 `app.listen(PORT)` 无 host 绑定默认双栈）。`depends_on` L8-9 `condition: service_healthy`；backend `DATABASE_URL=file:/data/prod.db` L23 + `sqlite-data` named volume L38。

### 6. SQLite 方言 OQ 素材

- 约定原文：`openspec/project.md` L104「**数据库**：MySQL 统一（开发 + 生产）；SQL Server 为可选非默认路径（需独立迁移目录）」（技术约束节）；同文档 L17「**Prisma 6.x** + **MySQL 8**——ORM 与数据库（开发/生产统一 MySQL；SQLite 仅限快速演示）」、L63「保证 MySQL / SQL Server 兼容」、L122「**MySQL 8.0** —— 主数据库」、L36/L103/L123 三处「Caddy 2 反向代理」。
- 首个 SQLite migration：`packages/backend/prisma/migrations/20260718074800_init/migration.sql`（`CREATE TABLE "users" (... TEXT NOT NULL PRIMARY KEY ...)` 等 SQLite 方言 + snake_case；目录内另有 `20260904035633_add_audit_log` 与 `migration_lock.toml`）。
- design 自身已自认切换：design L1122（P0 已切 SQLite file: URL）与 L1225「一期已切 SQLite + WAL……WAL 模式支持并发读 + 串行写……若未来高写场景遇瓶颈，再评估切回 MySQL/PostgreSQL」。
- OQ 挂账原文：`implementation-notes.md` L17-18「首个 SQLite 方言 migration vs project.md『MySQL 统一』约定……迁移期结束统一处理或 ADR 明示豁免」。
- **附带发现：project.md 部署栈写 Caddy 2（L36/L103/L123），实际部署是 nginx**（`docker/nginx.conf` + `docker-compose.yml`），同为文档漂移，ADR 豁免书宜一并修。

### 7. 分支与基线

- 分支 `feat/phase2-p0`，HEAD `6930677`（2026-09-24，「docs: backlog 划掉 P0 已消化两项……」）。
- 基线 448 的构成出处：`implementation-notes.md` L44（票 #24 节）「质量门终值 **447** = backend 311 / shared 37 / frontend 99（P1 起点基线）」；L32（票 #25 节）「TDD 红→绿（backend 312 全绿）」——#25 给 backend +1 后合成 **448 = backend 312 + shared 37 + frontend 99**。**「448」这个总数在 implementation-notes.md 及 backlog/spec 中无直接文字出处**（grep 零命中），是 447（L44）与 backend 312（L32）的推导合成值。frontend 99 口径为 @2 线程（`implementation-notes.md` L15、L56；`vite.config.ts` threads 池锁定 commit `6f8a5b5`）。

## Design 原文 vs 现状偏差

1. **Dashboard.health 字段形**：design §14.1 L753-756 `health: { status: string; db: boolean; diskUsage: number; memoryUsage: number }` vs 现状 shared types.ts L238-245 `{ status: 'healthy'|'degraded'; database: boolean; diskUsage; memoryUsage; uptime }`——字段名 `db`→`database`、新增 `uptime`、status 收窄为字面量联合。P1 引 design 时须以现状 DTO 为准。
2. **`/ready` 语义缺口**：design L680 说 ready 含「磁盘空间 < 95%」，现状 503 仅由 `database` 决定（healthRoutes.ts L9-12），磁盘/内存越限只降级 body 的 `status` 字段（monitoringService.ts L33）——探针按状态码判定时 design 语义未达成。
3. **`/startup` 的「Prisma migrate 是否完成」**：design L681 写于 MySQL 假设；现状 SQLite + 启动 bootstrap 串行（server.ts L166-181 WAL→seed→listen），migrate 完成无独立可探物。
4. **project.md 部署栈漂移**：L36/L103/L123 写 Caddy 2，实际 nginx（docker/nginx.conf）。
5. **导入 50MB**：design L576 计划路由级 `express.json({ limit: '50mb' })`；现状全局 1MB（server.ts L20），导入端点未建——实施时勿漏覆盖。
6. **v1 导出先例不可引**：design §9 的导出与 v1 exportService（admin 数据集导出，json/csv/xlsx）**口径完全不同**（v2 是项目级/连接级），且 v1 导出从未挂载运行；v1 全程不导出密码字段，design L572 要求「密码导出时保持加密」是 v1 没有实践过的新口径。
7. **Swagger 兼容性论述**：design L688-691 说 swagger-jsdoc/swagger-ui-express「尚未正式声明 Express 5 兼容需先验证」——论断仍有效，但 v1 已有 Express 4 + swagger-jsdoc 6.2.8 + swagger-ui-express 5.0.0 完整注解实践，注解样板与双配置冗余反例可考古，风险验证范围可收窄。
8. **基线总数 448 无文字出处**（见现状事实 §7）——spec 若写「448（出处 implementation-notes.md）」会标错，需写明是 447（L44）+ #25 后端 +1 的合成。

## 漂移风险点

1. **「v1 已实现过导出/备份/监控/安全」是假象**——五组路由从未挂载（routes/index.ts L60-77）。若 P1 spec 引「参照 v1 先例」会引入未经运行验证的设计稿当依据；clone/tag/统计/最近访问/密码重置才是真跑过的。
2. **ENCRYPTION_KEY 单全局密钥的跨实例语义**：design L572「导入时需相同 ENCRYPTION_KEY」= 密文跨实例可解性完全取决于环境变量一致；v1 exportService 的「永不导出密码」与 design「密码保持加密导出」两种口径并存，spec 需明确 JSON 完整导出里 `encryptedPass`（ConnectionDetail 已含该字段，types.ts L170）原样携带还是脱敏。
3. **tags 逗号分隔单字符串**（schema.prisma L90 + design L578）：tag 值本身含逗号不可表达、导入 split+trim 归一化边界——v1 已有同款限制，P1 CSV 导入照抄时会把边界一并继承。
4. **SystemHealth 五字段已被 dashboard 前端消费**（shared types.ts L238-245 注释「与 dashboard.health 同构」）——P1 三探针若扩字段/改状态码语义，注意 shared DTO 兼容与 503 判定口径（design ready 语义 vs 现状 database-only 503）。
5. **nginx resolver 方案实施细节**（backlog L28）：proxy_pass 变量化后解析时机/兜底 IP 变化，改完必须复测 backend 重建场景（T10 复现路径在 notes L549）。
6. **CI actions v4→v5**：六处 uses 集中在 ci.yml，纯版本号升级但 checkout@v5 默认行为（如 node 版本前提）需跑一次 CI 验证；node 20 EOL 节奏与 setup-node 升级宜一并裁决。
7. **backend/ 删除波及面**：git tracked 116 文件；`scripts/test-migration.ts`、`backend/README.md`、`backend/docs` 是否被其他文档引用删除前需 grep（CI 不涉及 backend/，已核实 ci.yml 双 job 均只操作 packages/*）。
8. **project.md MySQL 表述是复数**（L17/L63/L104/L122）：SQLite ADR 豁免书若只修 L104 一条会留漂移尾巴；Caddy→nginx 漂移同理。

## 未决疑问

1. 基线 448 需不需要在 implementation-notes.md 补一行正式记录（现状只有 447 与 backend 312 两个分项，总数靠推导）？
2. compose backend healthcheck 的 `localhost`（docker-compose.yml L31）是否统一成 `127.0.0.1`（与 frontend L12-13 注释口径一致）——归入 P1 工程项还是维持现状？
3. P1 密码重置若立项：v1 的 token 生命周期设计可考古，但邮件依赖（design §15 L860-865 注释「SMTP 预留，一期不实现」）与持久化存储（v1 内存 Map 反例）需 spec 先裁决，否则无从评估 v1 萃取价值。
4. `/startup` 探针判定物在 SQLite 场景用什么（查 `_prisma_migrations` 表 vs 复用 bootstrap 顺序隐含保证）——design 原文（MySQL 假设）不可直接落地。
5. backend/ 116 个 tracked 文件删除前是否需要 git 层面留档（tag/归档分支），还是删前考古清单 + git 历史已足够？
6. project.md 的 Caddy→nginx 与 MySQL→SQLite 漂移是否随 P1 一并修（属 ADR/文档修正，超出纯基建域，建议单独裁决）。
