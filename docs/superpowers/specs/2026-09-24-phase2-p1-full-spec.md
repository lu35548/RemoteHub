# RemoteHub Phase2-P1 Spec：全量收官批

**版本**: v1.0-draft
**日期**: 2026-09-24
**状态**: 待用户终审
**产生方式**: grill-with-docs 7 决策（2026-09-24）+ 四域现状证据调研（并行 agent，落 `docs/superpowers/research/2026-09-24-p1-*.md` 四份，全部 file:line 引用）
**上游文档**: `2026-04-23-remotehub-v2-phase2-design.md`（§6-§13，原文不动，本 spec 为刷新基底）· `phase2-backlog.md`（清账后 11 项全收编）· `2026-08-25-frontend-migration.md`（Out of Scope 4 大类收编）
**下游**: 拆票（父票 + 约 23 子票，spec→tickets 直通）→ 分支 `feat/phase2-p1`
**基线**: 448 = 447（#24 记录）+ #25 新增 1（backend 312 / shared 37 / frontend 99 @threads 池 2 线程口径）

---

## 问题陈述

P0 交付审计/监控/安全三模块后，系统仍存三类缺口：

1. **功能缺口**——design §6-§13 十二模块未落地：密码无自助重置（admin 面板是假按钮，UserManagementModal.tsx:187 仅弹假 toast）、无备份、无实时告警（可疑 IP 只落审计表须主动刷）、members 四端点+四 hooks 全备但零 UI 消费、连接金矿五项中四项无后端支撑。
2. **一致性缺口**——文档与代码漂移三处（project.md 写 MySQL 统一/Caddy 2，实际 SQLite/nginx；design Dashboard.health 四字段 vs 现状五字段）；v1 废弃代码 `backend/` 122 文件残留。
3. **体验缺口**——用户/连接列表 >100 静默截断（三处消费面）、零响应式（全前端 21 处断点类，Sidebar 无小屏行为）、改密后被踢体验突兀（内存 token 残留 ≤15 分钟空窗）。

## 解决方案

一批全量收官：四波次（W1 认证安全 → W2 通知备份 → W3 协作金矿 → W4 数据收尾）滚动推进，波次间仅依赖驱动（W3 可与 W2 交错）。每票 TDD + 双轴 review，收尾浏览器级总验收。

## 用户故事

- 员工忘密码：自己在登录页发起重置，admin 在面板生成重置链接转交（无邮件依赖）
- admin 看到可疑 IP 告警**弹出**而非事后翻审计页；改密/撤 session 即时踢下线
- admin 手动触发备份、备份完成收到通知；数据库损坏时按备份恢复
- 项目管理员在工作台管理成员角色；用户按 tag 过滤/搜索连接、一键 clone、看最近访问
- 运维拿 Swagger 文档对接；K8s 部署时有现成三探针
- 手机打开工作台能用（关键页响应式）

## 实施决策

### 范围与边界（grill 2026-09-24）

- **D1 全量**：design P1 四模块 + P2 五模块 + backlog 11 项 + 迁移 4 大类，一次立项收官（~23 票，波次管理）
- **D2 WebSocket 场景重排**：骨架照 §8，事件优先级改为 可疑 IP 告警 > 强制登出 > 备份通知 > 连接/成员/角色变更（管道固定，事件源边际成本极低）
- **D3 i18n 砍**：纯中文内网工具，无多语言用户，抽 i18n 层是 Speculative Generality
- **D4 2FA 开关制**：admin 后台按用户开关，默认关，不强推
- **D5 `backend/` 删除**：git 历史即档不留额外归档（T12 先例）；时点 W4 末（金矿票先消费 v1 参照）
- **D6 OQ 处置**：SQLite 方言写 ADR 豁免（连同 Caddy→nginx、health 口径一并订正 project.md）；description 净化误杀接受现状并明示边界
- **D7 波次**：依赖驱动非硬排期，成员变更/分页等独立票可提前交错

### spec 内推荐决策（用户 2026-09-24 确认）

- **members UI 落点**：工作台项目上下文弹窗（members 是项目维度，对齐 v1 形态），非 /admin 全局页
- **导入导出口径**：限定同 ENCRYPTION_KEY 实例间（备份/迁移场景）；跨密钥明文中转留后续
- **clone 密文服务端复制**：密码不经前端明文中转

### W1 认证与安全

**1. 密码重置域**（design §6，修正后）
- `PasswordResetToken` 表照 §6.1（tokenHash/usedAt 语义与 Session 同族，无冲突）
- 自助流：`POST /auth/forgot-password`（公开+限流 3 次/h/IP）+ 前端 `/reset-password?token=` 路由（**新建**——FRONTEND_URL 环境变量与该路由现状双缺，见证据 auth-security.md）
- **admin 代重置**：人员管理面板假按钮换真——调 `POST /admin/users/:id/reset-link` 生成一次性链接，面板弹窗展示供 admin 复制转交（与自助流共用 token 表；**换真必改锁定假行为的测试** UserManagementModal.test.tsx:143-148）
- **会话空窗修复**（auth 证据 #4）：改密/重置成功 → 后端已撤 session 清 cookie，但前端内存 access token 残留 ≤15 分钟——`useChangePassword` 与新重置流 onSuccess 必须清 token + 跳 /login；顺带落 backlog「改密 toast 请重新登录」
- 安全约束照 §6.5（token 1h、每用户 ≤3 有效、用后标记不物理删）

**2. 2FA TOTP**（design §11，**方案修正**）
- **§11.4 tempToken 复用 Session 表 + consumedAt 的方案作废**——现状 consumedAt 是 refresh 轮换语义，非空 session 被再触达判重用攻击撤全部 session（authService.ts:104-139）。改用：登录二段挑战发短时 JWT（新 claim `mfaPending: true`，15 分钟），验证 TOTP 后换发正式 token——不碰 Session 表
- 开关：admin 按用户启用；启用时用户首登进入绑定流（二维码+恢复码）
- User 表加 `totpSecret String?`（加密存储复用 ENCRYPTION_KEY 通道）

**3. 性能监控**
- 中间件记 API 响应时间（内存环形缓冲，按路由聚合 P50/P95/P99），`GET /admin/stats/performance`（挂 roleMiddleware('admin')，参照 monitoringRoutes.ts:11-13 现有三端点）

**4. K8s 探针**（design §12 映射现状）
- `/healthz`（liveness=进程活）/ `/readyz`（readiness=database:true 且磁盘 < 阈值——**注意现状 /api/v1/health 的 diskUsage 503 不覆盖**，readyz 自行判定）/ startup 复用 readyz；不挂认证、不进审计、进限流白名单

### W2 通知与备份

**5. WebSocket 通知管道**（design §8，偏差修正后）
- **nginx WS 三件套为硬前置**（证据 notify-backup.md #1）：`/api/` location 补 `proxy_http_version 1.1` + `proxy_set_header Upgrade $http_upgrade` + `proxy_set_header Connection "upgrade"`；design 写 Caddy 处订正为 nginx
- CSP 假设作废：生产页由 nginx 托管且不加安全头（nginx.conf:12-13），helmet connect-src 仅 dev 生效——spec 不依赖 CSP 改动
- `ws` 库 attach 到 http server 实例（**server.ts 现无实例引用，顺手补 graceful shutdown：SIGTERM → 关 ws 连接 → 关 server**，证据 #2）
- 房间模型照 §8.2（project 房间 + admin 房间）；心跳 30s；前端指数退避重连 + token 过期 `reconnect_required` 处理
- **事件源六类**（D2 优先级序）：可疑 IP 告警（ipMonitor.ts:48-61 唯一判定处 emit，admin 房间）/ 强制登出（改密撤 session 处；deleteMany 拿不到被删行——改为删前先查 userId 列表再删，保推送粒度）/ 备份完成/失败（W2-11 接线）/ 连接/成员/角色变更（service 层 emit，项目房间）
- NotificationQueue 表照 §8.6；通知 API 两端点 + 已读清理 cron 04:00（与 session 03:00/审计 03:30 错峰）；**cleaner 模式分叉裁决：通知清理仅定时不启动即清**（对齐 auditCleaner 先例，启动即清是 sessionCleaner 特例）
- 前端通知中心：顶栏铃铛 + 未读角标 + 下拉列表（TanStack Query 消费 WS 推送刷新通知列表）

**6. 数据备份**（design §7，修正后）
- `VACUUM INTO` 走 `$queryRaw`（server.ts:171 先例）；**dev 路径必须过 `resolveSqliteUrl` 锚定**（否则备到空库，证据 #4）
- **compose 卷重设计**：`backup-data` 卷从 `sqlite-data` 嵌套中拆出为顶层独立卷（§7.6 的嵌套结构废弃）；备份目录挂载 + retention 清理（保留 N 份）
- cron 02:00 定时 + admin 手动触发端点；备份完成/失败走通知管道（依赖票 5）；恢复流程 = 文档化 runbook（停止栈 → 替换 db 文件 → 起栈），不做在线恢复
- /admin/backups 页（§19 预留的第三页落位）：列表 + 手动触发 + 下载

### W3 协作与金矿

**7. members 管理 UI**（后端零改动——4 端点 + 4 hooks 已备）
- 工作台项目上下文弹窗（项目卡/项目详情进入）：成员列表 + 添加/改角色/移除；移除自己=离开项目（已有 leave 语义）
**8. 连接金矿后端**（tag 过滤/统计/最近访问排序/搜索，四项全缺；**v1 真实现参照 `backend/src/repositories/RemoteConnectionRepository.ts:269-280`**，验收口径以此锚定）
- `GET /connections` 扩展 query：`tag`/`q`（name/host/username 模糊）/`sort=lastAccessed`；`GET /projects/:id/connections/stats`（按协议/标签聚合计数）
- tags 存储现状为字符串（逗号 join），过滤用 LIKE 或加载后过滤——**SQLite JSON 弱查询约定下保持字符串列 + LIKE，不迁移 JSON**（queryable-fields 教训）
**9. clone 连接**
- 服务端端点 `POST /connections/:id/clone`：读原文（含密文）→ 改名（`原名 (副本)` 递增避 `@@unique([projectId,name])`）→ 复制密文不过前端；跳转编辑弹窗
**10. 项目管理增强**（design §10，三处修正）
- 归档：Project 加 `status` 字段（active/archived，**不用 design 的 @db.VarChar(20)——与 SQLite 约定冲突**）；归档项目只读展示+可恢复
- 复制（浅复制项目+成员关系，连接不复制）/ 转让（owner 变更+原 owner 降 admin，**与 leave 端点语义重叠处：转让后原 owner 若非成员自动保留为 admin**）/ 批量归档
**11. 分页 UI + 响应式**
- 分页三处消费面（**backlog 只点名用户列表，实际工作台 projects/connections 两处同截断**，证据 collab-frontend.md #4）：DataTable 受控分页组件已备，接入 + 后端三列表端点补 page/pageSize 参数透传
- 响应式关键页：Sidebar 小屏抽屉化、工作台卡片网格 `grid-cols-1 md:grid-cols-*`、登录/表格横向滚动；不做专属移动交互

### W4 数据与收尾

**12. 数据导入导出**（design §9，同 ENCRYPTION_KEY 口径）
- JSON 全量导出（projects/connections/members/users-不含密码哈希/审计不含）；导入 = 事务 upsert + 密文字文原样搬运（同 key 前提）；导出文件含 `encryptionKeyFingerprint`（key 的 SHA-256 前 8 位）供导入前校验——**key 不匹配 422 拒绝**
- v1 export 路由从未挂载（证据 infra-cleanup.md），无参照，从零按本节
**13. Swagger**（design §13）
- swagger-jsdoc + Express 5 兼容性验证（v1 有全套 Express 4 注解实践可抄结构）；统一响应 `{success,data|error}` 包一层生成 schema；/api-docs 仅非生产环境暴露
**14. 清理与订正票**
- 删 `backend/`（~122 文件，删前金矿票已消费参照）；删前最后一次核对 `.gitignore` 覆盖
- ADR：SQLite 豁免（project.md「MySQL 统一」订正为 SQLite 现实+方言成本自担声明）+ Caddy→nginx 订正 + health 五字段口径固化
- 工程填缝：CI 六处 actions v4→v5；nginx `resolver` 指令（docker DNS 127.0.0.11，backend 重建不 restart frontend）；compose backend healthcheck `localhost`→`127.0.0.1`（对齐 frontend，避 IPv6 ::1 坑）
**15. 浏览器级总验收**（P0-10 同款模式）：双栈验收含 2FA 挑战流/重置流/通知即时性（WS）/备份下载恢复 runbook 演练/金矿操作/移动视口抽检/console 卫生/质量门终值

## 测试决策

- 每票 TDD（红→绿先行）+ 双轴 review（Standards/Spec 并行子代理）——P0 验证过的节奏
- 集成测试沿用 supertest+真库（setupTestDb + migrate deploy 大 hookTimeout 先例）；WS 票补 `ws` 客户端集成测试（起真 server 实例断言推送）；备份票补「resolveSqliteUrl 锚定」回归用例（防相对路径空库复发）
- 质量门递增记录；frontend 恒 threads 池 2 线程口径（#26）
- 会话空窗修复必须有前端测试：改密 onSuccess 后 `getAccessToken()` 为空 + 路由跳 /login

## 范围外

- i18n 国际化（D3）· 邮件发送（§6.4 维持不做，SMTP 变量预留）· 跨 ENCRYPTION_KEY 明文导入导出 · Redis Pub/Sub 多实例 WS（§8.7 一期单实例）· 在线恢复（备份恢复走 runbook）· 专属移动端交互（手势/离线）· 性能监控的历史持久化（环形缓冲即可）

## 补充说明

### 对 4 月 design 的修正对照（证据文件 file:line 支撑）

| # | design 原文 | 现状事实 | 本 spec 裁决 |
|---|---|---|---|
| 1 | §11.4 tempToken 复用 Session.consumedAt | consumedAt=refresh 轮换语义，再触达判攻击撤全部 session（authService.ts:104-139） | 独立 mfaPending JWT，不碰 Session 表 |
| 2 | §18 净化在限流前 | 现状有意反序（server.ts:103-104） | 以现状为准，design 反向订正 |
| 3 | §8.2 helmet 加 connect-src 即可 | 生产页无 CSP（nginx 不加安全头，nginx.conf:12-13） | CSP 假设作废；nginx WS 三件套为真实前置 |
| 4 | §7.6 backup-data 嵌套卷 | 嵌套在 sqlite-data 内 | 拆顶层独立卷 |
| 5 | §10 @db.VarChar(20) status | SQLite 方言约定禁 VarChar | 纯 string |
| 6 | L30/L464 Caddy | 实际 nginx | ADR 订正 |
| 7 | Dashboard.health 四字段 | 现状五字段（+uptime，db→database） | 以现状为准固化 |
| 8 | §6.3 重置链接 FRONTEND_URL | env.ts 无此变量、前端无 /reset-password 路由 | 双新建 |

### 既定事实（2026-09-24 考证）

四份证据文件为权威：`research/2026-09-24-p1-auth-security.md`（12 偏差/10 风险/12 疑问）、`-notify-backup.md`、`-collab-frontend.md`、`-infra-cleanup.md`（含 v1 考古：真跑过的 clone/tag/统计/最近访问在 RemoteConnectionRepository.ts:269-280，export/backup 五组路由从未挂载无参照价值）。

### 流程与治理

- 分支 `feat/phase2-p1`；提交格式 `<类型>: <中文描述>`；UI 深色 slate-950 中文
- 拆票：父票 + ~23 子票按 W1-W4 波次建依赖边（W3 独立票可交错）；每票 implement 前重读本 spec 对应节 + 证据文件对应段
- 父票验收：全子票关闭 + 总验收票过 + 质量门终值记录 + notes/memory/跨工具同步
