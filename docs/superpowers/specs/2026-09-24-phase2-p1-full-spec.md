# RemoteHub Phase2-P1 Spec：全量收官批

**版本**: v1.2-draft（v1.1 双轴审查修订 + v1.2 库核验增补：新依赖版本定版与 5 处方案精确化，2026-09-24）
**日期**: 2026-09-24
**状态**: 待用户终审
**产生方式**: grill-with-docs 8 决策（2026-09-24）+ 四域现状证据调研（`docs/superpowers/research/2026-09-24-p1-*.md` 四份，file:line 引用）+ 双轴 spec 审查（引用抽查命中率 ~85%，发现全处置）+ 四组库核验（`research/2026-09-24-p1-libcheck-*.md` 四份，版本与 API 均取自 npm registry 实查/官方文档/本地实测）
**上游文档**: `2026-04-23-remotehub-v2-phase2-design.md`（§6-§13 八模块，原文不动，本 spec 为刷新基底）· `phase2-backlog.md`（开放 10 项全落位）· `2026-08-25-frontend-migration.md`（Out of Scope 4 大类收编）
**下游**: 拆票（父票 + 约 26 子票，spec→tickets 直通）→ 分支 `feat/phase2-p1`
**基线**: 448 = 447（#24 记录）+ #25 新增 1（backend 312 / shared 37 / frontend 99 @threads 池 2 线程口径）

---

## 问题陈述

P0 交付审计/监控/安全三模块后，系统仍存三类缺口：

1. **功能缺口**——design §6-§13 八模块未落地：密码无自助重置（admin 面板是假按钮，UserManagementModal.tsx:187 仅弹假 toast）、无备份、无实时告警（可疑 IP 只落审计表须主动刷）、members 四端点+四 hooks 全备但零 UI 消费、连接金矿五项（clone/tag 过滤/统计/最近访问/协议元数据）后端全缺。
2. **一致性缺口**——文档与代码漂移（project.md 四处写 MySQL/Caddy，实际 SQLite/nginx；design Dashboard.health 四字段 vs 现状五字段）；v1 废弃代码 `backend/` 116 文件（git tracked 口径）残留。
3. **体验缺口**——用户/连接列表 >100 静默截断（三处消费面）、零响应式（全前端 21 处断点类，Sidebar 无小屏行为）、改密后被踢体验突兀（内存 token 残留 ≤15 分钟空窗）、协议无感知（九种协议共用 RDP 模板表单，SSH 提示 3389、ToDesk 硬凑 host/port）。

## 解决方案

一批全量收官：四波次（W1 认证安全 → W2 通知备份 → W3 协作金矿 → W4 数据收尾）滚动推进，波次间仅依赖驱动（W3 独立票可与 W2 交错）。每票 TDD + 双轴 review，收尾浏览器级总验收。

## 用户故事

- 员工忘密码：自己在登录页发起重置，admin 在面板生成重置链接转交（无邮件依赖）
- admin 看到可疑 IP 告警**弹出**而非事后翻审计页；改密/撤 session 即时踢下线
- admin 手动触发备份、备份完成收到通知；数据库损坏时按备份恢复
- 项目管理员在工作台管理成员角色；用户按 tag 过滤/搜索连接、一键 clone、看最近访问
- 选 SSH 端口自动填 22、选 ToDesk 表单变「设备 ID+验证码」、一键直连对 RDP 生成 mstsc 指令——系统懂协议
- 运维拿 Swagger 文档对接；K8s 部署时有现成三探针
- 手机打开工作台能用（关键页响应式）

## 实施决策

### 范围与边界（grill 2026-09-24）

- **D1 全量**：design P1 四模块 + P2 五模块 + backlog 开放 10 项 + 迁移 4 大类，一次立项收官（~26 票，波次管理）
- **D2 WebSocket 场景重排**：骨架照 §8，事件优先级改为 可疑 IP 告警 > 强制登出 > 备份通知 > 连接/成员/角色变更（管道固定，事件源边际成本极低）
- **D3 i18n 砍**：纯中文内网工具，无多语言用户，抽 i18n 层是 Speculative Generality
- **D4 2FA 开关制**：admin 后台按用户开关，默认关，不强推
- **D5 `backend/` 删除**：git 历史即档不留额外归档（T12 先例）；时点 W4 末（金矿票先消费 v1 参照）
- **D6 OQ 处置**：SQLite 方言写 ADR 豁免（连同 Caddy→nginx、health 口径一并订正 project.md 四处）；description 净化误杀接受现状并明示边界（受影响字段：Project.description 自由文本含 `--`/`&&` 技术串将被 VAL_001 422，属可接受误杀面）
- **D7 波次**：依赖驱动非硬排期，独立票可提前交错（同文件冲突票除外，见拆票蓝图串行标注）
- **D8 协议元数据完整版**：后端协议注册表（每协议 schema/默认值/校验/直连动作类型）+ 前端动态表单 + 按协议直连动作（mstsc 指令/ssh 命令/打开 URL），独立 3 票

### spec 内推荐决策（用户 2026-09-24 确认）

- **members UI 落点**：工作台项目上下文弹窗（members 是项目维度，对齐 v1 形态），非 /admin 全局页
- **导入导出口径**：限定同 ENCRYPTION_KEY 实例间（备份/迁移场景）；跨密钥明文中转留后续
- **clone 密文服务端复制**：密码不经前端明文中转
- **复制项目照 design 深拷贝**：项目+全部连接（密文服务端复制），**成员关系不复制**（人不同）；改名 `（副本）` 递增避 `Project.name @unique`
- **backlog 5 项落位**：编辑换项目 + 编辑密码清空 → W3 连接域；a11y autocomplete → W3-11 响应式票；setup Modal 文案 + copyTarget 重构 → W4-14 清理票

### W1 认证与安全

**1. 密码重置域**（design §6，修正后）
- `PasswordResetToken` 表照 §6.1（tokenHash/usedAt 语义与 Session 同族，无冲突）
- 自助流：`POST /auth/forgot-password`（公开+限流 **3 次/h/IP + 每用户 24h 5 次**双轨，§6.5 全量；用户轨 keyGenerator 用 `req.body.username` **须判型防 undefined 退化成全局共享配额** + trim/lowercase 防变体绕过，v7 的 windowMs 自首次请求起算非自然日——libcheck-auth.md）+ 前端 `/reset-password?token=` 路由（**新建**——FRONTEND_URL 环境变量与该路由现状双缺，见证据 auth-security.md）
- **admin 代重置**：人员管理面板假按钮换真——调 `POST /admin/users/:id/reset-link` 生成一次性链接，面板弹窗展示供 admin 复制转交（与自助流共用 token 表；**换真必改锁定假行为的测试** UserManagementModal.test.tsx:143-153，且该测试现无 Router 包裹，onSuccess 加 navigate 须补 MemoryRouter）
- **会话空窗修复**（auth 证据 #4）：改密/重置成功 → 后端已撤 session 清 cookie，但前端内存 access token 残留 ≤15 分钟——`useChangePassword` 与新重置流 onSuccess 必须清 token + 跳 /login；顺带落 backlog「改密 toast 请重新登录」
- 安全约束照 §6.5（token 1h、每用户 ≤3 有效、用后标记不物理删）

**2. 2FA TOTP**（design §11，**方案修正**）
- **§11.4 tempToken 复用 Session 表 + consumedAt 的方案作废**——现状 consumedAt 是 refresh 轮换语义，非空 session 被再触达判重用攻击撤全部 session（authService.ts:104-139）。改用：登录二段挑战发短时 JWT（**`aud:'mfa'` 独立声明**，15 分钟）
- **安全三件套（审查发现 + jose 源码核验精确化，必做）**：① mfa JWT 用 `aud:'mfa'` 签发 ② **access token 签发端显式 `setAudience('access')`、校验端 `jwtVerify` 显式传 `audience:'access'`**（jose 实测：不传 audience 选项时 aud claim 完全不校验——「只拒收 mfa」的反向逻辑不够）③ **绝不签发多值 `aud:['access','mfa']` token**（any-overlap 语义下双校验皆过等于没防）。authMiddleware 拒收 aud='mfa'。测试锁死「mfa token 访问任意业务 API 必 401」+「access token 无 aud/多值 aud 必被拒」
- User 表加 `twoFactorEnabled Boolean @default(false)` + `totpSecret String?`（加密复用通用通道 utils/encryption.ts:17-51，已核非 connection 专用）
- 开关：admin 按用户启用；启用时用户首登进入绑定流（**qrcode.react@4.2.0** 渲染 otpauth:// URI，peer 明确支持 React 19）；TOTP 用 **otpauth@9.5.2**（纯 JS 零原生依赖，window=1 官方建议）；**恢复码自实现**（otpauth 无内建，OWASP 口径：N 组单次码 + hash 存储 + 启用流程强制确认）

**3. 性能监控**
- 中间件记 API 响应时间（内存环形缓冲，按路由聚合 P50/P95/P99），`GET /admin/stats/performance`（挂 roleMiddleware('admin')，参照 monitoringRoutes.ts:11-13 现有三端点）

**4. K8s 探针**（design §12 映射现状）
- `/healthz`（liveness=进程活）/ `/readyz`（readiness=database:true 且磁盘 < 阈值——**注意现状 /api/v1/health 的 diskUsage 503 不覆盖**，readyz 自行判定）/ startup 复用 readyz；不挂认证、不进审计、进限流白名单（ipMonitor 白名单双形态匹配已核可容纳）

### W2 通知与备份

**5. WebSocket 通知管道**（design §8，偏差修正后）
- **nginx WS 三件套为硬前置**（证据 notify-backup.md #1）：`/api/` location 补 `proxy_http_version 1.1` + `proxy_set_header Upgrade $http_upgrade` + `proxy_set_header Connection "upgrade"`；design 写 Caddy 处订正为 nginx
- **dev 栈前置**：vite proxy 补 `ws: true`（vite.config.ts:25-30 现无；官方确认 rewrite 对 upgrade 同样生效）——WS 路径定为 **`/api/v1/ws`**（复用 /api 前缀走两条代理通道，不另开端口）
- **连接鉴权通道（协议硬约束，libcheck-ws.md）**：浏览器 WebSocket **无法设置 Authorization header**——鉴权改走 upgrade 时验 httpOnly cookie（refresh token 对应 session 有效性）或首消息 token；库定版 **ws@8.21.3**，`WebSocketServer({ server, path: '/api/v1/ws' })` 官方支持路径过滤，心跳 30s ping + isAlive + terminate 为 README 原文惯例（30s < nginx 60s read_timeout 默认，安全）；**前端自写 ~60 行 WS hook**（react-use-websocket 停更 2025-02 仅验 React 18、reconnecting-websocket 停更 2023，均不采用），WS→Query 联动用官方 setQueryData/invalidateQueries 模式
- CSP 假设作废：生产页由 nginx 托管且不加安全头（nginx.conf:12-13），helmet connect-src 仅 dev 生效——spec 不依赖 CSP 改动
- `ws` 库 attach 到 http server 实例（**server.ts 现无实例引用，顺手补 graceful shutdown：SIGTERM → 关 ws 连接 → 关 server**；**重构红线：保持「import 不 listen」语义**——NODE_ENV=test guard 跳过 bootstrap 依赖此，证据 #2）
- 房间模型照 §8.2（project 房间 + admin 房间）；心跳 30s；前端指数退避重连 + token 过期 `reconnect_required` 处理
- **事件源六类**（D2 优先级序）：可疑 IP 告警（ipMonitor.ts:48-61 唯一判定处 emit，admin 房间）/ 强制登出（改密撤 session 处 authService.ts:195-198，**userId 已知——按该 userId 直接推，无需查列表**）/ 备份完成/失败（W2-6 接线）/ 连接/成员/角色变更（service 层 emit，项目房间）
- NotificationQueue 表照 §8.6；通知 API 两端点 + 已读清理 cron 04:00（与 session 03:00/审计 03:30 错峰）；**cleaner 模式裁决：通知清理与备份 cron 均仅定时不启动即清**（对齐 auditCleaner 先例，sessionCleaner 启动即清是特例）
- 前端通知中心：顶栏铃铛 + 未读角标 + 下拉列表（最小依赖 = NotificationQueue + 通知 API + WS 客户端，不依赖事件源接线票）；**拆票时管道票必须拆开**（后端管道/通知 API/事件源接线/前端中心四票，审查确认巨票风险）
- WS 集成测试：beforeAll 手动 `app.listen(0)` 拿真实端口（serverBootstrap 只返回 app）；jsdom 无 WebSocket 须桩客户端

**6. 数据备份**（design §7，修正后）
- `VACUUM INTO` 走 **`$executeRaw` 模板参数化**（libcheck-backup.md 实测：文件名是标量表达式**可绑定参数**，Prisma 6.19.3 + better-sqlite3@11.10.0（捆绑 SQLite 3.49.2 ≥ 3.27 达标）三链路验证通过——零 SQL 注入面，文件系统层校验仍需）；**目标已存在时报错**——写临时名成功后 rename，防中断损坏留半档；**dev 路径必须过 `resolveSqliteUrl` 锚定**（否则备到空库，证据 #4）。**测试红线：回归用例用相对 URL + 变 CWD 断言锚定分支**（setupTestDb 造绝对 URL 走不到该分支，集成挂上去只会空转绿；sqliteUrl.test.ts 已有底子）
- 定时任务复用 **node-cron@3.0.3（项目已在）**，照 auditCleaner.ts:24-30 同款模式挂 02:00（.backup() 通道对比已核：Prisma adapter 下拿不到裸 Database 句柄，维持 VACUUM INTO 有据）
- **compose 卷**：现状无 backup 卷（docker-compose.yml:37-38 已核），**新建顶层独立卷** `backup-data`（§7.6 的嵌套结构废弃，无旧卷迁移负担）；retention 清理保留 N 份
- cron 02:00 定时（仅定时，见 W2-5 cleaner 裁决）+ admin 手动触发端点；备份完成/失败走通知管道；恢复流程 = 文档化 runbook（停栈 → 替换 db 文件 → 起栈），不做在线恢复
- /admin/backups 页（§19 预留第三页落位）：列表 + 手动触发 + 下载

### W3 协作与金矿

**7. members 管理 UI**（后端零改动——4 端点 + 4 hooks 已备）
- 工作台项目上下文弹窗（项目卡/项目详情进入）：成员列表 + 添加/改角色/移除；移除自己=离开项目（已有 leave 语义）
**8. 连接金矿后端**（五项，**v1 真实现参照按项锚定**：tag 过滤 `RemoteConnectionRepository.ts:253-263`、统计 `:268-271`、最近访问 `:276-283`、clone `ConnectionRepository.ts:501-526`；协议元数据见 D8 独立票）
- `GET /connections` 扩展 query：`tag`/`q`（name/host/username 模糊）/`sort=lastAccessed`（**null 容忍排序**——存量多 null 无索引）；`GET /projects/:id/connections/stats`（按协议/标签聚合计数）
- tags 存储保持字符串列，**过滤用精确匹配包夹法**（`',' || tags || ',' LIKE '%,tag,%'` 或加载后 filter，防 `test` 命中 `test2`）——SQLite JSON 弱查询约定下不迁移 JSON（queryable-fields 教训）
**9. clone 连接**
- 服务端端点 `POST /connections/:id/clone`：读原文（含密文）→ 改名（`原名 (副本)` 递增避 `@@unique([projectId,name])`）→ 复制密文不过前端；跳转编辑弹窗
**10. 连接编辑域增强**（backlog 落位项）
- **编辑换项目**：连接编辑弹窗开放项目下拉（需目标项目写权校验 + requiredVpnId 跨项目依赖提示）
- **编辑密码清空**：编辑时密码框支持「清空」显式动作（区别于「留空=保持不变」）
**11. 协议注册表（完整版，D8）**
- shared：`PROTOCOL_REGISTRY`——每协议 schema（字段定义/类型/默认值：SSH port=22、HTTPS=443；ToDesk/向日葵=设备 ID+验证码形态无 host/port；RDP=host+port+域前缀可选）
- 后端：连接 create/update 按 registry 校验（协议专属必填/默认值填充）；**直连分派三类**（libcheck-docs-ci-rdp.md 核验：mstsc 命令行无 /user 参数、ssh:///rdp:// 全平台无系统级 handler，深链方案砍）——① **.rdp 文件下载**（UTF-16 LE+BOM、`application/x-rdp`、唯一必填 `full address:s: host:port`）② **命令串复制**（RDP `mstsc /v:host:port`、SSH `ssh user@host`、ToDesk 设备码）③ **URL 打开**（VPN/HTTPS）
- 前端：新建/编辑表单按 registry 动态渲染（协议切换字段联动）；「一键直连」按协议分派上述三类动作
**12. 项目管理增强**（design §10，修正后）
- 归档：Project 加 `status` 字段（active/archived，**纯 string 不用 design 的 @db.VarChar(20)**——SQLite 方言冲突）；归档项目只读展示+可恢复
- 复制（**照 design 深拷贝**：项目+全部连接密文服务端复制，成员不复制；`（副本）` 递增改名）/ 转让（owner 变更、原 owner 降 **editor**——design 原文，MEMBER_ROLES 无 admin；**事务内先升新 owner 后降原 owner**，避 memberService.ts:70-75 的 last-owner 保护 MEMBER_002）/ 批量归档
**13. 分页 UI + 响应式**（**纯前端接线**——后端三列表端点分页参数与 MAX_PAGE_SIZE clamp 已齐备：userController.ts:16-17 / projectController.ts:14-15 / connectionController.ts:15，审查确认「补透传」为幻觉缺口）
- 分页三处消费面（用户列表 + 工作台 projects/connections 两处，证据 collab-frontend.md #4）：DataTable 受控分页接入
- 响应式关键页：Sidebar 小屏抽屉化、工作台卡片网格 `grid-cols-1 md:grid-cols-*`、登录/表格横向滚动、**input name/autocomplete a11y 顺手修**（backlog 落位）；不做专属移动交互

### W4 数据与收尾

**14. 数据导入导出**（design §9，同 ENCRYPTION_KEY 口径；**后于 status 字段票**——导出含 Project.status）
- JSON 全量导出（projects/connections/members/users-不含密码哈希/审计不含）；导入 = 事务 upsert + 密文字文原样搬运（同 key 前提）；导出文件含 `encryptionKeyFingerprint`（key 的 SHA-256 前 8 位）供导入前校验——**key 不匹配 422 拒绝**
- v1 export 路由从未挂载（证据 infra-cleanup.md），无参照，从零按本节
**15. Swagger**（design §13）
- **swagger-jsdoc@6.3.0 + swagger-ui-express@5.0.1**（libcheck 核验：peer 已放行 express >=5.0.0-beta，项目 ^5.1.0 满足；配 @types 双包；遗留风险为上游无 express5 回归测试——本票集成测试自兜底）；统一响应 `{success,data|error}` 包一层生成 schema；/api-docs 仅非生产环境暴露；**依赖边：后于全部新增端点票**（W1/W2/W3 后端票），先做会漏注解
**16. 清理与订正票**
- 删 `backend/`（git tracked 116 文件，删前金矿票已消费参照）；删前核对 `.gitignore` 覆盖与磁盘残留（git-rm-ignored-residue 教训）
- ADR：SQLite 豁免（project.md **四处** MySQL 表述一并订正）+ Caddy→nginx 订正 + health 五字段口径固化
- 工程填缝：**CI actions 升至当前主线（checkout/setup-node 已到 v7——v5 为旧情报；setup-node v6+ 自动缓存仅 npm，本项目显式 `cache:'pnpm'` 兼容；pnpm/action-setup 升 v6.1.0）**；**Node 22 LTS 升级**（Node 20 已于 2026-04-30 EOL，与 CI 升级同票顺手：Dockerfile 基镜像 + engines + CI matrix）；nginx `resolver` 指令（docker DNS 127.0.0.11，backend 重建不 restart frontend）；compose backend healthcheck `localhost`→`127.0.0.1`（对齐 frontend，避 IPv6 ::1 坑）；setup Modal「暂不配置」文案 + copyTarget 魔法串重构（backlog 落位）
**17. 浏览器级总验收**（P0-10 同款模式）：双栈验收含 2FA 挑战流/重置流/**mfa token 越权 401**/通知即时性（WS）/备份下载恢复 runbook 演练/金矿操作/协议表单切换/移动视口抽检/console 卫生/质量门终值

## 测试决策

- 每票 TDD（红→绿先行）+ 双轴 review（Standards/Spec 并行子代理）——P0 验证过的节奏
- 集成测试沿用 supertest+真库（setupTestDb + migrate deploy 大 hookTimeout 先例）；WS 票补真 server 实例客户端断言（listen(0)）；备份票补「相对 URL+变 CWD」回归（防空转绿）
- 安全锁死用例：mfa token 访问任意业务 API 401；2FA enabled 用户单密码登录拿不到 access token；重置 token 用后复用 401
- 前端：改密 onSuccess 后 `getAccessToken()` 为空 + 路由跳 /login（UserManagementModal.test 补 MemoryRouter）；jsdom 桩 WebSocket；TOTP 测试新增 otpauth 类 devDep（连同 ws、swagger-jsdoc 均为本批新依赖）
- 质量门递增记录；frontend 恒 threads 池 2 线程口径（#26）

## 范围外

- i18n 国际化（D3）· 邮件发送（§6.4 维持不做，SMTP 变量预留）· 跨 ENCRYPTION_KEY 明文导入导出 · Redis Pub/Sub 多实例 WS（§8.7 一期单实例）· 在线恢复（备份恢复走 runbook）· 专属移动端交互（手势/离线）· 性能监控的历史持久化（环形缓冲即可）· 协议第三方直连客户端集成（只生成指令/深链，不内嵌客户端）

## 补充说明

### 对 4 月 design 的修正对照（证据 file:line 支撑）

| # | design 原文 | 现状事实 | 本 spec 裁决 |
|---|---|---|---|
| 1 | §11.4 tempToken 复用 Session.consumedAt | consumedAt=refresh 轮换语义，再触达判攻击撤全部 session（authService.ts:104-139） | 独立 mfaPending JWT（aud:'mfa'），不碰 Session 表 |
| 2 | §18 净化在限流前 | 现状有意反序（server.ts:103-104） | 以现状为准，design 反向订正 |
| 3 | §8.2 helmet 加 connect-src 即可 | 生产页无 CSP（nginx 不加安全头，nginx.conf:12-13） | CSP 假设作废；nginx WS 三件套 + vite ws:true 为真实前置 |
| 4 | §7.6 backup-data 嵌套卷 | 现状无任何 backup 卷（compose:37-38） | 新建顶层独立卷 |
| 5 | §10 @db.VarChar(20) status | SQLite 方言约定禁 VarChar | 纯 string |
| 6 | L30/L464 Caddy | 实际 nginx | ADR 订正 |
| 7 | Dashboard.health 四字段 | 现状五字段（+uptime，db→database） | 以现状为准固化 |
| 8 | §6.3 重置链接 FRONTEND_URL | env.ts 无此变量、前端无 /reset-password 路由 | 双新建 |
| 9 | §10.2 复制=深拷贝（项目+连接，成员不复制） | —（审查发现 v1.0 曾擅自反转为浅复制+成员） | **照 design 深拷贝**，此条为回正登记 |
| 10 | §2 概览 12 模块 | §6-§13 实为 8 个模块节 | 计数订正，P0 三模块已落地 |

### 既定事实（2026-09-24 考证 + 双轴审查复核）

四份证据文件为权威：`research/2026-09-24-p1-auth-security.md`（12 偏差/10 风险/12 疑问）、`-notify-backup.md`、`-collab-frontend.md`、`-infra-cleanup.md`。审查增量：分页后端已齐备（非缺口）；ENCRYPTION_KEY 通道为通用 crypto util（utils/encryption.ts:17-51，含 ENCRYPTION_KEY_OLD 轮换兜底）；WS upgrade 不经 express 链限流拦不到；v1 金矿参照按项锚定行号。

### 库核验定版（2026-09-24，`research/2026-09-24-p1-libcheck-*.md` 四份）

新依赖版本定版：**otpauth@9.5.2**（纯 JS）/ **qrcode.react@4.2.0**（React 19 peer）/ **ws@8.21.3** / swagger-jsdoc@6.3.0 + swagger-ui-express@5.0.1；已在项目复用：node-cron@3.0.3、express-rate-limit 7.5.1（不跨 major）、jose 6.2.2（aud 语义已源码级核验）。核验级方案修订：jose 双向显式 aud（W1-2）、WS cookie 鉴权 + 自写 hook（W2-5）、VACUUM INTO 参数化 + 临时名 rename（W2-6）、直连三类分派砍深链（W3-11）、CI 主线 v7 + Node 22 LTS（W4-16）。

### 流程与治理

- 分支 `feat/phase2-p1`；提交格式 `<类型>: <中文描述>`；UI 深色 slate-950 中文
- 拆票：父票 + ~26 子票按 W1-W4 波次建依赖边；**显式串行对**：金矿后端票 × 分页票（同改 connectionService/queries.ts）；**显式后置**：Swagger（端点票后）、导出（status 字段票后）、backend/ 删除（金矿票后）
- 每票 implement 前重读本 spec 对应节 + 证据文件对应段
- 父票验收：全子票关闭 + 总验收票过 + 质量门终值记录 + notes/memory/跨工具同步
