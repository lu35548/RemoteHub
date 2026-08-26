# RemoteHub V2 前端迁移 spec

> 状态：已终审通过（2026-08-25）。已拆票 T1–T12（GitHub Issues #2–#13，native blocking edges，父票 #1）；frontier：T1、T2。
> 行为基准的精确定义：**v1 运行态 = `RemoteHub/App.tsx` 的活性调用面 + 10 个迁移组件的用户可见行为**。本文所有"行为照 v1"均指此基准。

## Problem Statement

v2 后端已全闭环（SQLite + WAL、CI 11 步、docker 部署验证、145+ 测试），多用户认证、项目/连接/成员/权限体系齐备——但前端仍是 v1 的 localStorage 单机版（`RemoteHub/`），数据存在浏览器里，双模式（LS/API）演进未完成就被冻结。用户无法使用 v2 后端的多用户与权限能力，产品停在单机形态。

## Solution

把 v1 前端的用户可见行为 **1:1 等价迁移**到 `packages/frontend`（React 19 + Vite 6 + TanStack Query）：UI 与交互原样照搬 v1，只把数据层从 localStorage 换成 v2 API（`/api/v1`）。配套：backend 补 2 个在线状态端点、frontend lint+test 体系从零建起、CI 纳入 frontend、docker compose 增加 frontend 服务。验收通过后删除 `RemoteHub/` 目录，phase2（§19）解锁。

迁移哲学与 auth 契约的例外见 **ADR-0001**（`docs/adr/0001-frontend-migration-equivalence.md`）。

## User Stories

**认证与会话**
1. 作为用户，我想用账号密码登录，以便访问我名下的项目与远程连接数据
2. 作为用户，我想在刷新页面后保持登录状态，以便不打断工作流
3. 作为用户，我想 access token 过期时自动无感续期（单飞 refresh + 请求重放），以便长会话不掉线
4. 作为用户，我想主动登出，以便在共用设备上保护数据
5. 作为管理员，我想修改自己的密码，以便定期轮换凭据

**项目管理**
6. 作为用户，我想查看我的项目列表，以便组织远程连接
7. 作为用户，我想创建/编辑/删除项目，以便维护项目结构（危险操作有确认弹窗）

**连接管理**
8. 作为用户，我想在连接卡片上看到连接的关键信息（协议/主机/端口/VPN 等，以 v1 ConnectionCard 展示为准），并复制用户名/密码/地址，以便快速识别与使用目标
8a. 作为用户，我想在卡片上执行协议对应的连接动作（RDP 一键直连含首次配置引导、SSH 唤起+命令复制、Web 开新页、VPN 按类型跳转或复制地址），以便从卡片直达目标（T6 交付；v1 ConnectionCard 的 rh-rdp:// 自定义协议、注册表配置文件等 utils 一并迁移）
9. 作为用户，我想创建/编辑连接（表单字段以 v1 ConnectionModal 为准：协议、主机、端口、凭据、VPN 类型/登录 URL、notes 等），以便记录远程资源
10. 作为用户，我想删除连接（带确认），以便清理失效条目
11. 作为用户，我想按项目归组浏览连接（归组/过滤行为以 v1 Sidebar + App 为准）

**用户管理（admin）**
12. 作为管理员，我想查看用户列表、创建用户、删除用户（带确认）、修改自己的密码，以便管理团队成员（操作集以 v1 UserManagementModal 真实调用集为准：getAllUsers/createUser/deleteUser/changeMyPassword；**不含**编辑他人资料与 admin 重置他人密码——v1 无此行为，v2 updateUser 亦不收 password）

**在线状态**
13. 作为用户，我想看到当前在线的用户（心跳驱动），以便知道谁在工作

**界面与反馈**
14. 作为用户，我想要深色 slate-950 中文界面，与 v1 视觉一致
15. 作为用户，我想要操作成功/失败的 Toast 提示与危险操作的确认弹窗（v1 UIContext 行为）
16. 作为用户，我想要加载态与错误态的清晰反馈（v1 LoadingStates 行为；API 错误以中文提示）

**工程质量（开发者视角）**
17. 作为开发者，我想要 frontend lint/tsc/test 全绿且纳入 CI，以便与 backend 同标准把守质量门
18. 作为开发者/运维，我想要 `docker compose up` 一键起全栈（frontend nginx + backend），以便部署形态与 v2 收尾同标准闭环

## Implementation Decisions

**迁移哲学与契约**
1. **等价迁移**：用户可见行为 1:1 照 v1 运行态；一切改良（交互/视觉/结构）推迟 phase2（ADR-0001）。
2. **auth 契约以 v2 为准**：双 token——内存 access token（Bearer header）+ httpOnly cookie refresh；页面刷新经 bootstrap refresh 恢复会话。v1 的客户端 `hashPassword`/`initialize` 职责已在后端（bcrypt + seedAdmin），不复刻。
3. **分页适配取 A**：v2 API 分页设计（`PaginatedResponse`），前端以大 pageSize 一次拉全（后端 MAX_PAGE_SIZE=100 上限，初稿「200」勘误），UI 保持 v1 无分页形态；分页 UI 归 phase2。

**services 层处置（15 文件逐行评审结论）**
4. **迁移 2**：`auth.service` → auth client 交互（登录态/心跳接线）；`data.service` → `queries.ts` hooks（**已基本就位**）。
5. **参考退役 1**：`api.adapter`（519 行）——代码退役，作为 client.ts 的头号参考样本。
6. **退役 11**：storage 三件套（manager/adapter/patched）、migration 全家（migration.service/progressiveMigrationManager）、`config.service`、`featureFlags.service`、`adapters/serviceAdapter`、`utils/storage.integration`、`pages/MigrationManagementPage`。其中 `remoteConnection.service` 标注为 **phase2 功能金矿**（clone/tag 过滤/统计/最近访问/协议元数据——v1 设计了但运行态未接线）。
7. **types 分界**：域类型（Protocol/VpnType/UserRole/Project/RemoteConnection 等）由 `@remotehub/shared` 取代；UI 类型（Toast/Confirm/UIContext）留前端。

**数据层现状（工作量基线修正）**
8. `client.ts`（单飞 refresh + 401 重放 + Bearer 注入）与 `queries.ts`（24 hooks：auth 5 / projects 5 / connections 6 / members 4 / users 4，含 invalidateQueries 失效模式）**已约 80% 就位**；工作量重心在组件层与接线。

**结构与 UI**
9. **路由最小骨架**：`/login` + `/` 两路由 + auth 守卫（延续 v2 收尾 spec §5.2 立场）；其余结构不动。
10. **UI 基座照搬自绘**：UIComponents/Icons/ProjectIcons/LoadingStates 原样迁移（10 组件清单），不引组件库；客户端状态照搬 v1 的 Context + useState（UIProvider/useUI），服务端状态归 TanStack Query。

**backend 扩展（本项目 scope 内）**
11. **+2 端点**：`POST /api/v1/auth/heartbeat`（刷新活跃时间）+ 在线查询端点（按活跃阈值返回在线用户），支撑 story 13。数据基础实为 `User.lastActiveAt`（非 Session 表，spec 初稿措辞勘误），无需 migration；行为规格照 v1：10 秒节流写、5 分钟在线阈值、最近活跃倒序。

**工程体系**
12. **lint+test 体系是第一张票**：eslint flat config 极简对齐 backend 哲学（`@typescript-eslint` 严格规则 + react-hooks 必要规则）；vitest + @testing-library/react 已装、0 测试文件。
13. **CI**：ci.yml 增加 frontend job（lint + tsc + test，ubuntu 全新 install 环境）。
14. **部署**：compose 加 frontend 服务——多阶段构建（`tsc -b && vite build` → nginx:alpine 托管静态产物 + `/api` 反代 backend）；cookie 行为经查证：dev（vite proxy）与 prod（nginx 同源反代）浏览器视角均为同源，统一走 `/api` 路径则行为一致（研究笔记 §6），由 compose 栈验证坐实。

**收尾**
15. **`RemoteHub/` 删除**：验收 1–3 全过 + 用户确认后，单独 commit 整目录删除；验收前它是行为参照物，不得改动。

**技术实现细节**：TanStack Query v5 模式（queryOptions 工厂 + QueryCache/MutationCache 全局 401 兜底与 client 层 refresh 分层）、React Router v7（Data Mode + loader redirect 守卫）、fetch 单飞重放（POST body 序列化注意点）、Vitest 3 auto-cleanup 坑、ESLint flat config 标准组合、nginx SPA/反代标准写法，见研究笔记 `docs/superpowers/research/2026-08-25-frontend-migration-tech-notes.md`（已查证定稿，全部 primary source）。

## Testing Decisions

- **只测外部行为**：hooks 与 API 的交互协议、组件的渲染与用户可见行为；不测实现细节。
- **三层测试**：
  1. 数据层单测：`client.ts`（refresh 单飞/401 重放/错误映射，mock fetch）+ `queries.ts` 每个 hook
  2. 组件 smoke：10 个迁移组件 RTL 渲染不炸
  3. 关键交互流：登录流 + 项目/连接 CRUD 流（等价迁移的行为锚点）
- **测试 seam（最高点）**：`apiRequest` 边界（mock fetch 一处拦截全部数据层）+ 组件 props。不为覆盖率刷数字。
- **浏览器级验收**：Chrome DevTools MCP 驱动五条用户路径（登录/项目/连接/用户管理/在线显示）全流程模拟 + console 错误与 network 失败清零筛查（阻塞项当场修、非阻塞记账）。
- **Prior art**：backend 的 service 测试范式（`createPrismaMock` 工厂，D8）与真 SQLite 集成测试（D9）。

## Out of Scope

- 一切 UI/交互/视觉改良（B 路线，功能完善后另行立项）
- members 管理 UI（queries hooks 已备，UI 归 phase2 §19 管理后台）
- v1 未接线的高级连接功能（clone/tag/统计/最近访问/协议元数据——phase2 功能清单来源）
- backend 新功能（heartbeat/online 2 端点除外）
- 分页 UI、移动端适配、国际化
- `backend/`（v1 TypeORM）目录处置（phase2 移植参考完再删）

## Further Notes

- v1 存在 5 对双版本死副本（`App.updated.tsx` 等，正式版均为活性路径）与 3 个无引用死文件——**不迁移**，随目录删除消失。
- v2 独有端点中：refresh 已被 client 消费；**decrypt-password 已确认有 UI 消费**（v1 ConnectionCard 的显示/复制明文密码行为，v2 等价实现 = 经端点按需解密）；register/profile/members/search 不在本次行为面内。
- heartbeat 高频调用注意与 backend 限流策略的关系（loginLimiter 同源风险），实施时核实限流白名单。

## 验收定义（全部通过 = 前端迁移完成）

1. **质量门**：frontend lint 0 / tsc 0 / test 全绿；root `pnpm -r lint && pnpm -r test` 全绿（从"会崩"变全绿即前置任务完成标志）。
2. **CI**：ci.yml frontend job（ubuntu + 全新 install）全绿。
3. **浏览器级验证**（Chrome DevTools MCP）：五条用户路径（登录/项目/连接/用户管理/在线显示）全流程模拟走通 + console 错误与 network 失败清零筛查（阻塞项当场修、非阻塞记账）。
4. **收尾**：1–3 全过 + 用户确认 → `RemoteHub/` 单独 commit 删除；phase2 §19 解锁，v2-master 悬空声明关闭。
- 本 spec 落地后，v2-master.md 的"前端迁移悬空"声明与 implementation-notes 顶部 OQ 应同步关闭。
