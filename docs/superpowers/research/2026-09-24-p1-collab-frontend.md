# P1 立项前查证：协作与前端金矿域现状（2026-09-24）

> 性质：只查证不决策。路径均为仓库相对路径（根 `C:\Projects\RemoteHub`），行号取自当前 feat/phase2-p0 工作区。
> 范围：members 后端 / 连接域金矿 / clone / 项目管理增强 / 前端结构 / 响应式 / 迁移 Out of Scope 原文。

## 现状事实

### 1.1 Prisma schema（packages/backend/prisma/schema.prisma）

- **ProjectMember**（L62-75）：`role String @default("viewer")`（L66）——**无 Prisma enum，纯 String**；角色枚举唯一真相源在 shared：`MEMBER_ROLES = ['owner', 'editor', 'viewer']`（packages/shared/src/enums.ts:16-17）；`@@unique([projectId, userId])`（L72）、`@@index([userId])`（L73）、`addedAt`（L67）。
- **Connection**（L77-106）：
  - `tags String?`（L90）——单字符串列；`lastAccessed DateTime? @map("last_accessed")`（L91）；
  - `protocol String`（L86）无 DB enum，枚举在 shared `PROTOCOLS`（packages/shared/src/enums.ts:1-7：RDP/SSH/VNC/HTTP/HTTPS/VPN/TODESK/SUNLOGIN/TEAMVIEWER/ANYDESK）；
  - VPN 元数据：`vpnType`（L87）/ `vpnLoginUrl`（L88）/ `requiredVpnId`（L89）+ VPN 自依赖关系（L97-98，onDelete SetNull）；
  - `@@unique([projectId, name])`（L102）；索引仅 `[projectId]`（L103）/ `[requiredVpnId]`（L104）——**无 lastAccessed / tags 索引**。
- **Project**（L46-60）：name(unique)/description/icon/createdBy/updatedBy/时间戳——**无 status/归档/archivedAt 字段，归档余量为零**。
- tags 存储格式：逗号分隔单字符串。权威出处：design §9.4「tags 字段在数据库中为 `String?`（逗号分隔的单字符串）」（docs/superpowers/specs/2026-04-23-remotehub-v2-phase2-design.md L579）；前端 `split(',') / join(',')`（packages/frontend/src/components/ConnectionModal.tsx:96,218）。校验仅长度 `TAGS_MAX_LENGTH=500`（packages/shared/src/validators.ts:85-88、constants.ts:18），无格式/去重/分隔符转义校验。

### 1.2 members 后端端点全集（已实现 4/4，后端无缺口）

packages/backend/src/routes/memberRoutes.ts（挂载 `app.use('/api/v1/projects/:id/members', memberRoutes)`，packages/backend/src/server.ts:120）：

| 端点 | 行 | 权限门 | 审计 |
|---|---|---|---|
| GET `/`（列表，分页） | L12 | viewer | 无 |
| POST `/`（添加） | L13 | owner | MEMBER_ADD |
| PATCH `/:uid`（改角色） | L14 | owner | MEMBER_UPDATE |
| DELETE `/:uid`（移除/退出） | L15 | **viewer**（刻意低门槛，见下） | MEMBER_REMOVE |

packages/backend/src/services/memberService.ts：
- `listMembers` L7-26（addedAt desc 分页，联查 user.username/nickname）；
- `addMember` L29-56（重复添加 MEMBER_001，事务）；
- `updateMemberRole` L59-84（owner 降级前查 owner count ≤1 → MEMBER_002，事务）；
- `removeMember` L87-116：**路由门 viewer + 服务层自校验**（L88-97）——owner 可移除任意成员，editor/viewer 只能移除自己；移除 owner 前查 owner count（L106-111）。DELETE 门槛设 viewer 而非 owner，正因细粒度校验下沉在服务层。

**members UI 侧余量：前端 hooks 已备但零消费**——`useMembers / useAddMember / useUpdateMemberRole / useRemoveMember` 定义于 packages/frontend/src/api/queries.ts:152-185，全部 .tsx 中 grep 零命中（无任何组件消费）；工作台 Sidebar / UserManagementModal 均无项目成员管理入口（UserManagementModal 是**系统用户**管理，非项目成员）。

### 1.3 projectRole 三层权限链现状

- 第 1 层 `authMiddleware`（JWT，packages/backend/src/middleware/auth.ts）→ 第 2 层 `projectRoleMiddleware`（packages/backend/src/middleware/projectRole.ts）→ 第 3 层 service 自校验。
- `projectRoleMiddleware`（L11-72）：`ROLE_HIERARCHY = { owner: 3, editor: 2, viewer: 1 }`（L5-9）；**admin 全局直通**（L18-21）；projectId 解析顺序：params.id + baseUrl 判路由（projects → 直接用；connections → 反查 `connection.projectId`，L27-40）→ `body.projectId`（L43-45）→ `query.projectId`（L47-49）；**找不到 projectId 时静默放行**（L51-54）。
- 第 3 层 service 自校验实例：`memberService.removeMember` owner/self 判定（L88-97）；`connectionService.getConnection` 的 encryptedPass 可见性按项目角色（owner/editor 可见、viewer 不可，connectionService.ts:152-161）。
- 全局 admin 门禁另有 `roleMiddleware`（packages/backend/src/middleware/role.ts:6-20），用于 auditRoutes / monitoringRoutes / `/auth/register`（auditRoutes.ts:10-11、monitoringRoutes.ts:11-13、authRoutes.ts:16）。
- 注意：connectionRoutes 的 GET `/` 列表**未挂 projectRole 中间件**（connectionRoutes.ts:11），权限在 service 过滤：非 admin 限 `project.members.some.userId`（connectionService.ts:80-82）——与 projectRoutes GET `/` 同模式（projectRoutes.ts:11 + projectService.ts:29-31）。

### 1.4 连接域查询面与 CONNECTION_ACCESS

- `connectionService.listConnections`（packages/backend/src/services/connectionService.ts:69-99）：仅 projectId 过滤（L78）+ `orderBy updatedAt desc`（L87）+ 分页。**后端缺口：无 tag 过滤、无统计、无 lastAccessed 排序、无关键字搜索**（现搜索完全在前端：App.tsx:74-82 对已拉取的 ≤100 条做 name/host/username/tags 客户端 filter）。
- **lastAccessed 双写点均已实现**：`getConnection`（L163-172）与 `decryptPassword`（L297-306）都节流更新 lastAccessed——即「解密显示密码时已更新 lastAccessed」= **是**。节流：进程内存 Map + 5 分钟（L15-16），fire-and-forget（`.catch(() => {})`，L171/305）；Map 按 connectionId 有界（≤连接数）但无清理、重启清零、多实例部署下失效（当前单实例 docker，暂无碍）。
- CONNECTION_ACCESS 审计：connectionRoutes.ts:16 挂 POST `/:id/decrypt-password`；审计中间件 packages/backend/src/middleware/audit.ts——CONNECTION_ACCESS 是 POST 无 before 快照（audit.ts:42 仅 PATCH/DELETE）；detail.after 经 `redactDetail`（audit.ts:85-95），`password` 在 SENSITIVE_FIELDS（packages/shared/src/constants.ts:50）→ 解密响应 `{ password }` 落库为 `[REDACTED]`；resourceId 取 params.id 兜底（audit.ts:202-205 注释明确 decrypt-password 场景）。

### 1.5 clone 连接的复用面

- `createConnection`（controller connectionController.ts:27-32 → service connectionService.ts:102-145）：入参 `ConnectionCreateData`（projectId 必填，L37-50），全字段校验 + VPN 一致性/依赖/循环检测。
- `updateConnection`（L179-269）：白名单 L185 `['name','host','port','username','password','protocol','vpnType','vpnLoginUrl','requiredVpnId','notes','tags']`——**不含 projectId**（跨项目移动被锁，Deviation 记录在 phase2-backlog.md L14）。
- clone = 复用 create 的可行性：detail 返回全字段含 notes/tags/vpnLoginUrl（`toDetail` L460-500）；前端已有「编辑前 fetchQuery detail 补全」惯例（App.tsx:151-163）。**约束：`@@unique([projectId, name])`（schema L102）要求 clone 必须变换 name**；detail 只条件带 ciphertext（connectionService.ts:487），克隆带密码需服务端读原行复制密文。
- 现有 UI 无 clone 入口：ConnectionCard.tsx 卡片菜单仅 编辑/直连配置/下载 RDP/删除（L277-288）。

### 1.6 项目管理增强：现状端点 vs design 新增

- 现有 5 端点（packages/backend/src/routes/projectRoutes.ts:11-15）：GET `/`、POST `/`（无 projectRole，登录即可建）、GET /:id（viewer）、PATCH /:id（editor）、DELETE /:id（owner）。`projectService.createProject` 事务建项目+创建者 owner（projectService.ts:87-103）。
- design §10 新增 6 端点（docs/superpowers/specs/2026-04-23-remotehub-v2-phase2-design.md L587-592）：duplicate / archive / activate / members/batch / leave / transfer-ownership；模型变更 `Project.status String @default("active")` + `@@index([status])`（L600-604）；实现要点（L608-614）：复制=深拷贝项目+所有连接+调用者 owner+不复制成员；归档=可查看不可编辑连接；批量 ≤50 跳过已存在；转让=原 owner→editor 事务；owner 不可 leave 只能转让。
- 权限矩阵 §17（design L923-928）：duplicate/archive/activate/batch/transfer = owner+admin；leave = editor/viewer 亦可。

### 1.7 前端结构与插入点

- **ConnectionCard**（packages/frontend/src/components/ConnectionCard.tsx，434 行）：props L10-15；按需解密 `useDecryptPassword` + 卡内缓存复用（L30、L72-78）；协议动作分派 `handleConnect`（L195-231，含 RDP `rh-rdp://` 自定义协议唤起与失焦探测 L123-130/141-156、SSH 命令复制+唤起、Web 开页、SSL_VPN 跳转）；标签渲染 L241/364-373；脚注 updatedBy + updatedAt 相对时间（L400-403，**未显示 lastAccessed**）。
- **ConnectionModal**（packages/frontend/src/components/ConnectionModal.tsx，434 行）：`TabMode = 'HOST' | 'VPN'`（L22）+ 双表单 state hostFormData/vpnFormData（L118-119）；HOST 协议清单 L39-49、VPN 类型清单 L52-58（v1 登录视角→v2 协议视角映射注释 L51）；快速建 VPN 流（isCreatingVpnForHost L113，保存回填 id L256-264，入口 L280-285）；tags string[] ↔ 逗号串（L96/L218）；SSL_VPN host 推导 vpnLoginUrl（L230-237）；编辑态锁 projectId（L287-289 注释：backend 白名单不含 projectId，跨项目移动归 phase2）。**金矿 UI 插入点**：协议网格（L325-348）、HOST 右侧栏 tags/notes/预览区（L396-419）、字段区 L350-377。
- **useUsers 截断**：queries.ts:190-196 pageSize=100 写死（注释自认「一次拉全（spec 决策 3）」）；消费处 packages/frontend/src/components/UserManagementModal.tsx:22 `useUsers(1, isOpen && isAdmin)` **page 固定 1**，L170-192 渲染无分页 UI；后端 userService.listUsers L8 `Math.min(pageSize, MAX_PAGE_SIZE=100)`（constants.ts:21）。backlog L17：「用户列表超 100 静默截断：与分页 UI 一并解（T7，后端 MAX_PAGE_SIZE=100）」。**同模式还有 App.tsx:47-48** `useProjects(1, 100)` / `useConnections(undefined, 1, 100)`——工作台项目与连接同为 100 截断面。
- **DataTable**（packages/frontend/src/components/DataTable.tsx，120 行）：受控分页 props（page/total/pageSize/onPageChange，L13-17）、通用列定义+render 接管（L5-9）、深色骨架 loading（L44-64）、分页 footer 上一页/下一页（L97-117）。当前唯一消费方为审计页（L21 注释「P0-9 审计页消费」）——分页 UI 的现成复用面。
- 工作台卡片网格：App.tsx:317,339 `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4`；在线用户头像栈（App.tsx:233-273，slice(0,10)+N 徽标）。

### 1.8 响应式现状

- 技术栈：Tailwind v4 CSS-first——vite.config.ts:8 `@tailwindcss/vite` 插件；packages/frontend/src/index.css:4 `@import 'tailwindcss'` + `@theme` 自定义色阶/缓动（无 tailwind.config 文件）。
- 响应式前缀全量统计（*.tsx）：**lg×8、md×8、sm×3、xl×2，共 21 处**。分布：ConnectionModal×7（协议网格 sm:grid-cols-4 md:grid-cols-5 L325、表单 md:grid-cols-2 L350、双栏 lg:col-span-8/4 L319/396）、LoadingStates×3、App×2（即卡片网格）、AdminDashboardPage×2、ProjectModal×1。
- **Sidebar（Sidebar.tsx）零响应式类**：宽度 `w-[280px]/w-[80px]` 手动按钮折叠（L78、L35 isCollapsed），**无小屏自动抽屉/隐藏行为**；App 布局 `flex h-screen`（App.tsx:204）Sidebar 常驻不消失；`body { @apply overflow-hidden }`（index.css base 层）小屏无页面级滚动兜底。结论：断点类存在但仅用于内容网格，**移动端适配实质未开始**。

## Design / Out-of-Scope 原文 vs 现状偏差

### 迁移 spec Out of Scope 原文（docs/superpowers/specs/2026-08-25-frontend-migration.md L95-102，逐条照录）

> - 一切 UI/交互/视觉改良（B 路线，功能完善后另行立项）
> - members 管理 UI（queries hooks 已备，UI 归 phase2 §19 管理后台）
> - v1 未接线的高级连接功能（clone/tag/统计/最近访问/协议元数据——phase2 功能清单来源）
> - backend 新功能（heartbeat/online 2 端点除外）
> - 分页 UI、移动端适配、国际化
> - `backend/`（v1 TypeORM）目录处置（phase2 移植参考完再删）

金矿定义的辅助出处：同 spec L61「`remoteConnection.service` 标注为 **phase2 功能金矿**（clone/tag 过滤/统计/最近访问/协议元数据——v1 设计了但运行态未接线）」；phase2-backlog.md L5 四类粗粒度归档（同指 Out of Scope）。

**4 类原文 vs 现状核对**：

| Out of Scope 条目 | 原文定位 | 现状 | 偏差/张力 |
|---|---|---|---|
| members 管理 UI →「归 phase2 §19 管理后台」 | migration spec L98 | 后端 4/4 端点齐 + hooks 齐（零消费）；design §19.1（design L964-979）管理后台只有 /admin/dashboard、/admin/audit-logs、/admin/backups 三页，§2 模块概览（L56-74）亦无 members UI 模块 | **spec 内部悬空引用：§19 无 members 页，落点实际不存在**，立项须重新定义 |
| 高级连接金矿（clone/tag/统计/最近访问/协议元数据） | migration spec L61/L99 | 后端 lastAccessed 写入已实现（节流）；tag 仅存储+前端 contains 搜索；clone 无任何端点/UI；协议元数据部分存在于前端 constants.ts（PROTOCOL_ACTION_META） | 5 项中 4 项无后端支撑；金矿本体 v1 源码已随目录删除，权威描述仅剩两行 spec 文字 |
| 分页·移动端·国际化 | migration spec L101 | 分页 UI 组件已备（DataTable，审计页已用）；后端全端点分页齐备；移动端 21 处断点类但 Sidebar/布局无小屏行为 | 「分页 UI 归 phase2」措辞与「DataTable 已存在并已消费」有半程偏差——是复用扩展而非从零建 |
| backend 目录处置 | migration spec L102 | 根 `backend/`（v1 TypeORM，npm package-lock）仍在磁盘；`RemoteHub/` v1 前端目录已删（v2-master.md L42，commit 862a3f5；磁盘仅剩未跟踪 `RemoteHub/.env.local` 残留，git 0 tracked） | v1 前端参考物已消失，「行为照 v1」基准不可再现场验证（tech-notes 中 grep「金矿/clone」零命中，无补充描述） |

### phase2 design §10 vs 现状偏差

- design L602 `status String @default("active") @db.VarChar(20)`——与 v2-master.md 一致性约定（L75「`@db.VarChar(N)` → `String`（TEXT）」）冲突，照抄会带入 SQLite 废注解。
- design L609「复制项目：深拷贝项目+所有连接」未处理 `@@unique([projectId, name])`（schema L102）——克隆连接同名必触发 P2025，改名策略 design 未写。
- design L613 转让所有权「当前 owner 变为 editor」与现有 `updateMemberRole` 的 owner-count 保护（memberService.ts:70-75）关系未写（转让是新增专用事务还是复用改造）。
- design L591 leave 端点与现有 `DELETE /projects/:id/members/:uid` 的自退能力（memberService.ts:88-97：editor/viewer 已可自移）功能重叠，差异仅 owner 不可退的报错语义。

## 漂移风险点

1. **members UI 落点悬空**（高）：Out of Scope 声称「归 phase2 §19」，但 §19 无此页——若立项照抄引用链，实施时才发现无宿主。需在 P1 立项显式新定义（工作台项目详情 vs /admin 新页）。
2. **金矿语义无源码锚点**（高）：v1 `remoteConnection.service` 已删，clone/统计/最近访问/协议元数据的原始行为只剩 spec 两行概括。P1 若按字面实现，无「v1 等价」可依归——验收口径必须本立项内自定义，防止实施者脑补（memory: evidence-before-conclusion）。
3. **「分页 UI」修复面易做窄**（中）：三处 100 截断消费（App.tsx:47-48 工作台项目+连接、UserManagementModal.tsx:22 用户列表）共用同一截断模式；backlog L17 仅点名用户列表——只给用户列表加分页而漏工作台两处 = 截断修复不完整。
4. **lastAccessed 数据可信度**（中）：fire-and-forget + 进程内 5min 节流 + 重启清零——若 P1 拿它做「最近访问排序」，存量数据密度不均（老数据可能恒 null/陈旧）；排序实现需容忍 null，且 schema 无 lastAccessed 索引。
5. **tags 后端过滤若做 contains 会子串误命中**（中）：逗号分隔无转义，tag `test` 的 WHERE contains 会命中 `test2`；validateTags 不禁逗号字符入 tag 本体（仅限长 500）。tag 过滤金矿实施时需定分隔符语义或改 schema。
6. **design §10 抄写陷阱**（低）：@db.VarChar(20) 废注解、duplicate 的连接名唯一冲突、`/leave` 与现有自退端点重叠——三处照抄 design 即引入缺陷。
7. **响应式验收无基线**（低）：断点类零散存在（sm: 仅 3 处）易造成「已有响应式」误判；Sidebar + overflow-hidden 的桌面假设是移动端适配的真实工作量所在。

## 未决疑问

1. clone 的密码语义：`encryptedPass` 密文随克隆复制（副本持同等密文）还是置空？两 spec 均未写，v1 语义不可考。
2. 「协议元数据」具体指什么？migration spec L61 列名但无展开；前端 constants.ts 的 PROTOCOL_ACTION_META / PROTOCOL_SHORT_LABELS 已覆盖部分——金矿范围是否仅指 v1 service 中未接线的其余元数据？需用户裁决清单。
3. members 管理 UI 宿主页面：工作台内嵌（按项目查看成员）还是 /admin 全局页？与 §19 现有三页如何共存？
4. 批量添加成员 ≤50（design L611）的选人来源：`/users/search` 上限 `USER_SEARCH_MAX_RESULTS=20`（constants.ts:23），一次搜索最多 20 候选，50 人批量如何选？UI 流未定义。
5. transfer-ownership 实现路径：新增专用事务端点（design L613）还是改造 `updateMemberRole`（现 owner-count 检查 memberService.ts:70-75 会拦「唯一 owner 降级」，转让语义恰好需要成对变更）？
6. 归档项目的「不可编辑连接」拦截点：现三层链无 status 检查——挂 projectRole 中间件、service 层、还是独立中间件？design 未指定；归档是否影响 member 增删与 clone 的目标侧？
7. `/leave` 是否新增端点：现有 `DELETE members/:uid` 已支持 editor/viewer 自退（memberService.ts:94），新增 POST `/leave` 是否纯语义别名？重复面需裁决。
8. 移动端适配的验收设备/断点目标与 Sidebar 小屏交互形态（抽屉/底部栏）无任何 spec 依据。
