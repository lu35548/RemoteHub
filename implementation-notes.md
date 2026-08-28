# Implementation Notes

## 活跃 Open Questions

- [x] **D7** Docker runtime libstdc++ —— ✅ 查证反转：node:20-alpine 自带 libstdc++，spec §1.4 不补；builder build tools 保留作 prebuild fallback；plan 验证项 docker build 后 `require('better-sqlite3')` 坐实
- [x] **D8** B-6 mock helper —— ✅ 抽 `createPrismaMock()`，新增 3 + 现有 2 service test 全迁移（5→1）
- [x] **D9** 集成测试 —— ✅ 把 spec §2 BLOCKER-1 验收做成集成测试（setupTestDb + 临时 SQLite + migrate deploy + 验 5 表/unique/cascade/自引用约束）
- [x] **D10** notes/vpnLoginUrl 长度上限 —— ✅ shared 加 validateNotes(≤2000)+validateVpnLoginUrl(≤500)，connectionService 调用
- [x] ~~spec 修订~~ ✅ 已完成（commit `bf38a82`：D1–D10 + F1–F6 订正进 spec，含 §308 反向标注）
- [ ] **前端迁移悬空（2026-07-18 meta-review）**：→ 已立项（2026-08-25）：grill 7 问 + services 15 文件逐审 + ADR-0001 + spec 定稿（`docs/superpowers/specs/2026-08-25-frontend-migration.md`，issue #1），待用户终审后转 to-tickets。实施完成前本条不关。
- [x] **Plan B CI prisma generate 遗漏**（2026-07-21 首次 CI 暴露）：tsc 步骤 27 错全红，根因 `@prisma/client` postinstall 找不到自定义路径 schema（`packages/backend/prisma/schema.prisma`）→ client 未生成 → 类型全缺。ci.yml install 后加 `pnpm --filter @remotehub/backend exec prisma generate` 修复。见下 [2026-07-21] section。

---

## [2026-08-25] 前端迁移立项（grill-with-docs → spec）

### Design decisions（一行一条）
- 决策：等价迁移（ADR-0001）。理由：反 scope creep + 验收机械可判（v1 运行态基准）。备选：借机改良（拒，归 phase2）。
- 决策：auth 契约以 v2 为准（双 token：内存 access + httpOnly cookie refresh）。理由：后端 145 测试已定契约。备选：照搬 v1 行为（拒，客户端 hash 是 LS 时代遗产）。
- 决策：services 处置用户否了「import 闭包」一刀切、选逐文件评审；结论迁 2（auth/data）→ 参考 1（api.adapter）→ 退役 11（含 remoteConnection.service 标 phase2 金矿）。
- 决策：heartbeat/online backend +2 端点进本项目 scope。理由：v1 活行为 + session lastActivity 数据基础已在。
- 决策：分页适配取大 pageSize（200）拉全。理由：等价 UI 零改动；分页 UI 归 phase2。
- 决策：路由最小骨架 /login + / + 守卫（Data Mode + loader redirect，研究笔记）；UI 基座照搬自绘；compose 加 frontend 服务（nginx 反代；查证：dev/prod 均 /api 同源，cookie 行为一致）。
- [2026-08-25] 决策：拆票 12 张（T1–T12 → GitHub #2–#13，native issue dependencies 建边 14 条，抽验 blocked_by 计数全符）；frontier = T1（lint+test）∥ T2（backend 2 端点）。票体在 issue，spec 为权威正文，#1 为父票。

### Deviations
- to-spec 模板要求 spec 全文发 issue；实际正文落 `docs/superpowers/specs/`（repo 惯例、版本管理），issue #1 只放摘要+指针，防双份漂移。
- 用户补充验收：Chrome DevTools MCP 浏览器五路径全流程 + console/network 清零（超出模板默认）。

### 事实修正（影响后续计划）
- frontend 骨架「仅骨架」说法过时：client.ts（单飞 refresh）+ queries.ts（24 hooks）已约 80% 就位；工作量重心在组件层/接线/backend 2 端点/工程体系。
- v1 UserManagementModal 真实调用集 = 列表/创建/删除/改自己密码（无编辑他人、无 admin 重置）——初稿 story 12 脑补被自审抓出修正。
- ConnectionCard 有显示/复制明文密码行为 → decrypt-password 端点 UI 消费坐实（v2 等价 = 按需解密）。

### Open questions
- 无（grill 7 问 + 决策点①A + 分页 A 全拍板）；spec 待用户终审。

---

## [2026-08-26] 顺序开工 T1–T3（implement 流程：TDD + 双轴 review + commit）

### Design decisions（一行一条）
- T1：frontend lint+test 体系 = eslint flat（defineConfig 新形态，非 backend 旧式手写）+ vitest jsdom + 手动 afterEach(cleanup)（auto-cleanup 在 globals:false 下失效，研究笔记 §4）。shared 同步补齐（AC 必需）。
- T2：在线数据基础实为 User.lastActiveAt（非 Session，spec 已勘误）；10s 节流/5min 窗口/倒序照 v1；isActive 过滤 = authMiddleware 403 之外的禁用后 5min 过渡期防御。
- T3：样式体系构建化——v1 的 CDN tailwind + Google Fonts 在内网系统不可接受，迁移 Tailwind v4 CSS-first（@theme）+ @fontsource 本地字体 + lucide-react + tw-animate-css；UIComponents 因 toast 依赖前置迁移（T4 复用）。
- T3 微偏离 v1：刪 600ms 假网络延迟（真 API 自带）；input name/autocomplete 的 a11y issue 照 v1 原样留 phase2。
- T3 路由：react-router-dom v7 顶层导出（pnpm 严格模式下 'react-router/dom' 子导出需显式依赖 react-router 包，未声明）；loader 对称守卫（requireAuth/requireUnauth）。
- T4：枚举形态断裂——v1 enum 值即中文文案 vs shared 短码（库存短码），建 constants.ts 显示映射层（PROTOCOL_LABELS）；vpnType 语义变化（v1 登录方式 → v2 协议类型）T5 按 shared 语义另行处理。
- T4 教训①【高危】：分页解构 bug——后端 body 扁平 {success, data[], pagination}，queries 旧代码 api.get（剥壳返 data）+ PaginatedResponse 类型断言 = 类型谎言（tsc 绿的假象），App.test mock 伪造形状掩盖真相。修：api.getRaw 返完整 body；真链路 curl 验形状坐实。**教训：mock 必须按真实运行时形状造，不能用「期待中的形状」**。
- T4 教训②：client 401-refresh 按 /auth/ 前缀一刀切排除误伤 me（token 过期恰恰最需 refresh）→ NO_REFRESH_PATHS 精确端点清单 + App isError 兜底 setAccessToken(null)。
- T4 死代码链清除（v1 从未跑过 lint）：导出/导入整链（Sidebar 无按钮死 prop + App 死 handler）、isLoadingData 死状态；LoadingStates 两处 render 期 Math.random 改 useState 惰性初始化（纯度）。
- T4：pageSize 200→100（后端 MAX_PAGE_SIZE=100 静默截断，spec 决策 3 勘误）；useConnections 补 pageSize 参数。
- 端口转机：防火墙是**段拦截**非白名单（实测 5173/5188/5199/7777/8888 被拦，3000/4173/8080/9000 可听），vite.config 5173→3000，日常 dev 欠账闭环无需用户放行。

#### T5 开工准备（已完成的读源分析，新 session 接力）
- **spec 盲区补录**：v1 ConnectionCard 含整套连接动作系统（RDP 一键直连 rh-rdp:// + 注册表文件生成 + 支持检测、SSH 唤起、开网页、VPN 跳转）——grill 时未读卡片全文致 spec story 漏项，已补 story 8a 归 T6。
- **vpnType 语义映射**：v1（登录方式：网页/客户端/OpenVPN/WireGuard/L2TP）vs v2 VPN_TYPES（协议：SSL_VPN/IPSEC/WIREGUARD/OPENVPN/OTHER）。无存量数据，表单选项直接按 v2 枚举展示（文案自拟贴近 v1 风格），WEB 的 vpnLoginUrl 自动补 URL 逻辑保留（v2 字段在）。
- **快速创建 VPN 流程改造**：v1 靠预生成 id 回填 requiredVpnId → v2 改为 onSave 返回 saved detail 后回填（App 层 handleSaveConnection 需返回 ConnectionDetail）。
- **tags 形态**：v1 数组 vs v2 字符串（Create/Update tags: string|null）——表单内保持数组交互，提交 join(',')，编辑回填 split(',')。
- **getProtocolColor**（v1 utils）：case 文案值改短码，拟挪 constants.ts 与 PROTOCOL_LABELS 同层。
- **T5/T6 卡片分工**：T5 卡片渲染完整结构但操作按钮（连接/复制/眼睛）disabled 占位；T6 接 decrypt-password + 连接动作 + 复制系。ConnectionDetail 无 password 字段（加密不返回）。

#### T5 实施（2026-08-26 夜，issue #6）
- **backend 补 list 字段（读源新发现）**：mapToListItem 运行时丢弃 username/requiredVpnId，而 shared ConnectionListItem 类型已声明 requiredVpnId——类型与运行时不一致的又一实例（同 T4 教训）。补 `username`/`requiredVpnId`/`hasPassword`（hasPassword=encryptedPass!=null，PASS 行占位渲染需要）+ 类型补 `username`/`hasPassword`/`createdAt`（mapToListItem 实际返回但类型漏声明，类型诚实化）。findMany 本就无 select 全字段返回，零查询成本。
- **VPN_TYPE_OPTIONS 顺序**：按 v1 VPN_TYPES 顺序重排（OTHER 客户端第一=默认项，对齐 v1 默认 CLIENT 无 URL 魔法；SSL_VPN 第二）。文案自拟：其他客户端/SSL VPN（网页认证）/OpenVPN/WireGuard/IPsec / L2TP。VPN_TYPE_LABELS 进 constants.ts。
- **onSave 双参契约**：`(data: CreateConnectionRequest, editingId?: string) => Promise<ConnectionDetail>`。editingId 让 App 层统一 create/update 分流；返回 detail 供快速建 VPN 回填 id。v1「编辑 host 时 VPN tab 回填已关联 VPN」的联动保留，vpnEditingId 单独记（该分支提交走 update linkedVpn.id）。
- **编辑密码语义（已知偏离 v1）**：v2 无明文可回填，密码留空 = 不提交 password 字段（提交 null 会误清空——backend updateConnection 对 null/'' 都清密码）。placeholder 编辑态改「留空保持不变」。v1「编辑时删光密码再提交=清空密码」能力暂失（清空需 T6/phase2 交互），记 Deviation。
- **savedVpnName 兜底**：快速建 VPN 后「已关联: xx」行优先用 saved.name（v1 依赖父层 refreshData 刷新 connections 才显示，有时序空窗）。行为等价 + 消除时序依赖。
- **VPN 视图过滤归 T5**（读 v1 App 坐实）：T4 注释「vpn/host 分组与 ConnectionCard 渲染在 T5 接线」——relevantConnections 重构为 {hosts, vpns}（v1 过滤逻辑：项目视图显示全部双分组；全局视图 vpn/all 互斥；搜索补 username 命中）。搜索 tags 从数组 some 改字符串 includes（v2 形态）。
- **Card T6 占位**：复制按钮（HOST/USER/PASS）+ 眼睛 + Via 行跳转 + 主操作按钮全部 disabled（title「T6 开放」）；isCopied/copyTarget/剪贴板逻辑不搬（T6 连同动作系统从 v1 源恢复）；RDP Zap 顶栏按钮/launching/setup 弹窗/菜单 RDP 项归 T6。a11y：菜单按钮补 aria-label「更多操作」。
- **eslint 豁免并入**：ConnectionModal 的 set-state-in-effect 豁免并入 ProjectModal 先例条目（v1 表单回填模式，配置文件级）。
- **测试 15 个新增**：backend 1（list 字段）+ Modal 5 + Card 5 + App 4（渲染/Via/VPN 过滤/新建按钮/删除确认流）。mock 全按 mapToListItem 运行时形状造。
- 真实链路（dev 栈 + Chrome DevTools）：登录→卡片渲染→快速建 VPN（URL 补全+id 回填+已关联）→创建 HOST（tags/Via/中文）→编辑（回填+改名 update）→VPN 视图→删除确认；console 无 error/warn（仅 v1 遗留 a11y issue=T3 已定 phase2）；network 全 2xx（唯一 401 为未登录首访 refresh，T3 预期行为）。

#### T5 双轴 review 修复（Standards 2 硬伤 + Spec 3 等价性缺口）
- **Spec-S1（高）编辑换项目静默假成功**：backend updateConnection 白名单不含 projectId（UpdateConnectionRequest 亦无）——v2 项目=权限边界（projectRole 链），跨项目移动是架构敏感操作，backend 有意不支持。修：编辑态锁定项目下拉（disabled + title「v2 暂不支持移动项目（规划中）」）。**Deviation**：v1 可换项目，v2 编辑不可（phase2 需专门权限设计：目标项目写权校验 + requiredVpnId 跨项目依赖处理）。
- **Spec-S2（中）host 联动编辑 VPN 会清空其 notes**：联动回填来自 ConnectionListItem（无 notes），提交 notes:null 直接入库。修：isLinkedVpnEdit（vpnEditingId≠editingConnection.id）时 notes 空=不提交字段保留原值；直接编辑（detail 回填）空=清空语义不变。vpnLoginUrl 同隐患 → 表单字段删除（SSL_VPN 时由 host 推导，无独立输入路径——顺修 Standards 的 Speculative Generality）。
- **Spec-S3（低）VPN 直编密码提示缺失**：placeholder 条件 editingConnection&&HOST → isEditingExisting（editingConnection || vpnEditingId）。
- **Standards-1 注释语言**：v1 逐字复制带入的 11 处英文注释中文化（Card 10 + Modal 1 + App 1）——等价迁移不豁免注释语言规范。
- **Standards-2 内部代号泄漏 UI**：title「T6 开放」→「即将开放」（5 处）。
- **Standards-3/4 smell 修复**：PROPRIETARY/WEB 收拢 constants（PROPRIETARY_PROTOCOLS/WEB_PROTOCOLS）；PROTOCOL_LABELS.split(' ')[0] 脆弱截取 → 显式 PROTOCOL_SHORT_LABELS 表（3 处）。Repeated Switches（协议分叉 4 处）review 建议留 T6 合并（届时接动作系统一并收敛）。
- 修复后质量门：lint 0 / tsc 0 / **test 275**（+1 联动编辑用例）；浏览器复验编辑态锁项目 + 「即将开放」title 生效 + console 清零。

### Deviations / 隐藏债修复（T1-T3 顺带）
- T1：frontend tsconfig 缺 noEmit（tsc 向 src 误 emit .js，骨架从未跑过 build 未暴露）；shared lint script 从未装 eslint 依赖；仓库根误落 numbers.txt（相对路径重定向）。
- T2：真实链路验证采用 dev 栈 curl（无 jq 环境 → node 一行解析 JSON）。
- T3：UIComponents 豁免 react-refresh/only-export-components（聚合文件）与 set-state-in-effect（v1 动画时序）。

### 环境发现（影响后续票）
- **git bash 下 curl -d 中文必坏**（T5 实证）：Windows 终端 codepage GBK，curl.exe 把 argv 转 GBK 字节发 body，backend 按 UTF-8 解析 → 中文入库即 U+FFFD（T5 验证项目乱码案例，API 码点坐实后改名修复）。**中文造数据一律走 node fetch**（进程传参 UTF-16 → node 内部 UTF-8 无损，T5 实证可用）或浏览器。
- **防火墙按端口放行**：3001 通（backend 时代放行），5173/5199/7777 全 EACCES → **日常 `pnpm dev`（vite 5173）会崩，需用户放行**（欠账）；T3 浏览器验证用 vite --port 3001 绕过，但 proxy target 也 3001 会自环（/api 打回 vite 自己）→ 全栈浏览器验证（T11）前必须解决双端口。
- Chrome DevTools MCP：首次 snapshot 可能抓在 bootstrap await 点（显示旧 innerHTML），重拍即真实状态。

### Open questions
- 端口放行方案待用户拍板（5173 或指定段）。
- GitHub 网络欠账：close issue #2/#3 + 限流核实评论 + push（TUN 代理恢复后）。

---

## [2026-08-27] T6 连接动作系统（issue #7，story 8a）

### Design decisions（一行一条）
- **T5 占位全解除**：复制系（HOST/USER/PASS）+ 密码眼睛 + Via 跳转 + 主操作按钮。密码无本地明文（v2 契约），眼睛/复制时 `useDecryptPassword(id)` 按需解密；已解密（showPassword 态）复制复用缓存不重复请求。
- **协议分叉合并**（T5 review 遗留）：constants.ts 新增 `PROTOCOL_ACTION_META`（actionLabel/neutralAction/color 三元组，`Record<Protocol, …>` 全枚举显式），getActionLabel/主按钮样式/ExternalLink 显示条件/getProtocolColor 全部表驱动；`neutralAction` 表化 v1 的 `isProprietary || VPN` 中性底色判断。Modal 的 HOST_PROTOCOLS 不动（表单清单顺序/文案是 UI 数据非逻辑分叉）。
- **v1→v2 映射**（沿用 T5 定型）：`VpnType.WEB` ↔ `vpnType==='SSL_VPN'`；跳转 URL v1 `vpnLoginUrl||host` → v2 恒 host（ConnectionListItem 无 vpnLoginUrl，SSL_VPN 语义 host 即登录 URL）；https 前缀补全保留。
- **RDP utils 等价迁移**：src/utils.ts 四函数 + `RDP_CONFIG_KEY='rh_rdp_configured'`（key 逐字照 v1，升级用户配置保留）；downloadRdpFile 参数 `Pick<ConnectionListItem,'name'|'host'|'port'|'username'>`。
- **isRdpReady 惰性初始化**（`useState(() => isRdpConfigured())`）替代 v1 的 effect 内 setState：行为等价（localStorage 值 mount 前后不变）且消除 react-hooks/set-state-in-effect lint 错——不新增豁免先例。
- **VNC 无动作**：v1 handleConnect 无 VNC case（文案「连接」点击无反应）——等价保留，表内显式注释。

### Deviations
- v1 setup Modal 底部按钮文案「暂不配置，仅下载 .rdp 文件」实际行为仅关闭弹窗（文案与行为不符）——照 v1 运行态迁移，文案怪癖归 phase2。
- v1 getActionLabel 的 RDP isDetecting 分支（'正在呼叫...'）是死代码（按钮渲染层 isDetecting 时走独立分支显示'呼叫中...'）——迁移时未保留死分支。
- 解密失败 toast（'解密失败，无法获取密码明文'）为 v2 新增路径（v1 无网络失败可能），属 spec story 16 API 错误中文提示的落点。

### 测试与环境发现
- **userEvent 对 opacity-0 hover 才显示的按钮 hit-testing 不稳定**（点击静默无 handler 调用，无报错）：复制系按钮用 `fireEvent.click` 直派（T6 实证；最小重现证明点击机制本身正常）。
- **Modal 退出动画 × fake timers**：UIComponents Modal 关闭后 300ms 才卸载 DOM（v1 等价动画），断言「弹窗消失」需两段推进：先 500ms 收起（act flush 让 Modal 注册退出 timer）再 350ms 卸载——一次 advanceTimersByTimeAsync(900) 不够（React scheduler 走 MessageChannel 非 fake timer，单次推进内来不及注册新 timer）。mock-real-runtime-shape 的又一实例。
- **程序化 click 无 user activation**：Chrome 拒绝协议启动（console error "user gesture is required"）→ 无 blur → launching Modal 走 5s 超时；CDP 真实输入事件则 blur 即收起。浏览器验证需区分伪影。
- jsdom 对 `window.location.href='ssh://…'` 与 rh-rdp:// `<a>.click()` 打 not-implemented console 错——测试 spy 压制；dev 栈 3000/3001 存活时 vite HMR 即时生效（T6 全部改动未重启栈）。
- App.test 的 queries mock 需补 `useDecryptPassword`（Card 渲染期调用，vi.mock 缺导出直接报错）。
- 新增 11 测试（Card 10：翻转占位/眼睛/复制系/密码复制/分派/Via/RDP×4；utils 1），质量门 lint 0 / tsc 0 / **test 286**（37+37+212）。

### 双轴 review 修复（2026-08-27 夜）
- **【硬·双轴交叉】reg 文件丢 cmd 命令两侧转义引号**：v1 模板 `C \\"set…!url!\\""`（reg 值含 `\"` 转义引号）被我迁成裸串——字节级非等价，导入后处理器命令行为改变。修：逐字恢复，`diff` 两源码行 IDENTICAL 坐实。**教训：模板字符串迁移不能信「看过去一样」，转义层级（JSON→TS 源码→reg 文本）三层解码极易漏一层。**
- **【Spec】主按钮 disabled 样式缩水**：重写 className 丢 `disabled:opacity-60`（v1 有），补回。
- **【Spec】解密缓存复用**：fetchPlainText 缓存 plainPassword，显/隐/复制多动作只请求一次（浏览器复验 3 动作 1 请求）；卡片以 key=connection.id 挂载，缓存不跨连接。
- **【Standards 采纳】SSL_VPN 开页逻辑抽 openVpnPortal**（handleConnect/handleVpnConnect 两处重复）。
- **不采纳（判断级）**：RDP JSX 条件 4 处聚合进 meta（`protocol==='RDP'` 已是最直白表达，加布尔位过度设计）；PROPRIETARY_PROTOCOLS 从 meta 派生（与 neutralAction 不同义，VPN 交集造成脆弱耦合，双源保留）；copyTarget 魔法串（v1 逐字继承，phase2）。
- 修复后质量门：lint 0 / tsc 0 / test 286 全绿；浏览器复验缓存复用 + 复制 toast 通过。

### Open questions
- ~~gh/git 网络中断~~ ✅ TUN 恢复后已补完：push 双分支（8b89b46..61ebcd6）+ issue #7 关票（Closes #7 随 main push 自动触发，证据评论补发）+ CI 全绿（33045219826 ok；交接遗留的 255e929/8b89b46 两跑亦 ok）。

---

## [2026-08-27] T7 用户管理（issue #8，story 12）

> 交接文档勘误：交接写「T7=归组浏览(#8/story 11)」——实际 #8 是用户管理（story 12）；「归组过滤」在 #7 票面内且 T5 已做掉（relevantConnections 双分组）。gh issue list 核实。

### Design decisions（一行一条）
- **入口与挂载**：v2 Sidebar footer 头像按钮 T4 已迁（onClick=onOpenUserModal），App 层当时是占位 toast——本票换成 isUserModalOpen state + 真实挂载（挂载顺序照 v1：ProjectModal → ConnectionModal → UserManagementModal）。
- **v1 假重置按钮逐字保留**：toast('info','重置密码','请通知该员工：密码已重置为 "123456"') 不发任何请求（v1 无重置 API，文案怪癖归 phase2）；重置/删除按钮仅他人行渲染（u.id!==currentUser.id，v1 同）。
- **createUser 的 v2 端点**：backend 无 POST /users，admin 建用户走 POST /auth/register（仅 admin、role 默认 user）——queries.ts 新增 useCreateUser（RegisterRequest + invalidate ['users']），组件传 role:'user' 对齐 v1 固定 UserRole.USER。
- **useUsers 补 pageSize=100 + enabled**：spec 决策 3 一次拉全（同 useConnections 先例）；第二参 enabled 供弹窗按需加载（isOpen && admin），enabled false→true（staleTime 0）每次打开自动重取，等价 v1「每次 open 都 loadUsers」。
- **错误提示动态化**：errMsg() 提取 ApiErrorResponse.error.message（App 现有惯例是固定文案，但 v1 此组件是 err.message 动态——等价优先），fallback 固定中文。
- **lastActiveAt 显示**：v2 string|null，null →「从未」（v1 number 无 null 态，数据形态适配点，同 savedVpnName 先例）。
- **UserRole 判断**：v1 enum 'ADMIN' → v2 字面 'admin'（shared UserRole 小写 union）；显示仍 role.toUpperCase()（'ADMIN'/'USER' 等价）。

### Deviations
- **【契约修复】旧密码错误 AUTH_001/401 → AUTH_006/400「旧密码错误」**（backend）：浏览器验证暴露——client.ts 对 401 一律 refresh+重放，旧密码错误的业务 401 二次重放后误判会话失效强制登出跳 /login。change-password 端点本票首次有 UI 消费，零破坏窗口内修契约（业务校验失败 ≠ 认证失败，400 语义正确 + v1「旧密码错误」文案等价）。前端零改动（400 不入 refresh 分支，errMsg 直接显示）。
- 改密三输入补 aria-label（当前密码/新密码/确认新密码）——T5 a11y 先例（「更多操作」），v1 无。
- 列表排序 v2 按 updatedAt desc（backend listUsers），v1 是 localStorage 数组顺序——非 v1 显式行为契约，接受。

### 测试与环境发现
- 新增 9 测试（Modal 8：渲染双 tab/非 admin 无 tab/列表渲染含「从未」/创建契约/删除确认流/假重置不改状态/改密不一致/改密成功；App 1：footer 按钮→弹窗打开）。质量门 lint 0 / tsc 0 / **test 295**（frontend 46 + shared 37 + backend 212，T6 基线 286+9）。
- **MCP evaluate 的 textContent 与 a11y 树大小写差异**：Sidebar footer 按钮显示 'ADMIN' 是 CSS text-transform:uppercase 的渲染效果，textContent 是原始 'admin'——按 textContent 匹配按钮时勿信 a11y 树大小写（本次匹配 'ADMIN' 找不到按钮）。
- **CDP click uid 漂移再现**：确认弹窗「取消」按钮 CDP click 返回 success 但未生效，evaluate 程序化 click 稳定（T6 知识第二实例）。
- toast 4s 存续期常在 MCP 调用间隔内错过——wait_for 抓不到不代表没弹；用 evaluate 点击+300ms 后读 DOM 验证 toast 文本。
- 浏览器全链路验证：admin 弹窗结构/改密错误（不登出）/改密成功（新密码 API 登录验证后改回）/创建 wangwu 中文昵称/假重置 toast/删除确认+取消双路径/王五登录无人员管理 tab + 权限边界（无项目无连接）/console 0 错误 + network 全 2xx（唯一 401 未登录首访 refresh，T3 预期）。

### 双轴 review 修复（两 sub-agent 并行）
- **Standards 无硬违规**，4 judgement call：采纳 2——①双导出（named+default）偏离 default-only 范式，删 named export；②errMsg 兜底语义倒挂（instanceof Error 直透英文 message 上 toast），反转为 ApiErrorResponse.error.message 优先、其余一律中文 fallback。不采纳 2——头像首字母三处重复（reviewer 自评留待第四处）；pageSize=100 不入 queryKey（与 useConnections 先例同款，一致性优先，出现可变 pageSize 需求时一并改）。
- **Spec 等价迁移成立**（JSX/文案/表单/假重置/admin 门控逐字对照通过；AUTH_006 修复认可「更贴 v1 行为」）。Finding：pageSize=100 vs v1 无上限——spec 决策 3 既定权衡（同 projects/connections），**backlog：超 100 用户静默截断**（分页 UI 归 phase2 时一并解）。
- 修复后质量门：lint 0 / tsc 0 / frontend 46 全绿（errMsg 对 ApiErrorResponse 取值不变，浏览器不重走）。

### Open questions
- 无

---

## [2026-08-28] T8 在线状态（issue #9，story 13）

### Design decisions（一行一条）
- **手动循环 hook 逐字等价 v1**：`useOnlineStatus`（src/hooks/ 首文件）= useState + 立即执行 + setInterval(5000) + clearInterval，每轮**串行** heartbeat→online→setState。不走 TanStack refetchInterval——首轮 heartbeat/online 并发会导致首帧丢自己（v1 严格 heartbeat 先行），可观察差异不做。
- **queries.ts 不加 hooks**：heartbeat 是发信号（无 invalidation 需求）、online 由循环内串行拉取（顺序契约所在），经 TanStack 反而引入顺序不定性。hook 直用 api client。
- **失败静默 try/catch**：心跳失败跳过本轮（v1「本轮无更新」等价；下一轮自动恢复）+ 消化错误避免 unhandled rejection 污染 console。
- **`data.users ?? []` 契约防御**：backend 契约破坏时兜底空数组，防 `undefined.slice` 白屏（v1 运行态恒数组，兜底更贴 v1）。
- **限流白名单（spec Further Notes 落实）**：generalLimiter 200/min 按 IP 计，NAT 同出口 IP 约 8 人即触 429 → 心跳静默断写 → 5min 后全员误判离线。skip 白名单加 heartbeat/online（authMiddleware 保护 + 客户端 5s 固定节奏，无滥用敞口）。

### Deviations
- **backend server.ts 修改**（票面是前端接线）：spec Further Notes 明文「实施时核实限流白名单」，核实出 NAT 风险票内修（同 T7 AUTH_006 先例）。
- **顺修预存在 bug**：原 `req.path === '/api/v1/health'` 在 `app.use('/api/v1/')` 挂载点内恒 false（express 挂载剥前缀，req.path='/health'）——health skip 从未生效过，白名单改相对路径数组一并修正。实证：白名单 250+230 次零 429；非白名单 /projects 210 次 199×401+11×429（保护仍在）。
- try/catch 静默吞错是 v2 网络层必要适配（v1 localStorage 无失败路径），非 1:1——review 双轴均认可。

### 测试与环境发现
- **unhandledRejection vitest 不报**：无 try/catch 时 rejection 实际发生（process.on('unhandledRejection') 抓到 Error: network）但 vitest 全绿——静默契约需显式监听断言（RED 实证驱动实现，非臆测）。
- **「N 人在线」横跨 span+文本节点**：getByText 精确匹配不到，需容器 textContent 函数匹配（classList 锚定徽章 div）。
- **用例间 mock 计数残留**：beforeEach 必须 vi.clearAllMocks()（首跑 3≠2 的根因是上一用例调用残留非定时器泄漏）。
- **dev 栈冷启动**：`pnpm dev` 的 backend 崩——tsx watch 不加载 .env（DATABASE_URL 缺失 fail-fast）。冷启动须 `npx tsx watch --env-file=.env src/server.ts`（backend 目录）；上会话栈是存活态沿用，冷启动方式此前无记录。
- **TaskStop 杀不干净 concurrently 子进程**：vite 遗孤占 3000 → 新 vite fallback 错位 3001（IPv6 ::1 与 backend IPv4 可共存不冲突报错，更隐蔽）。需按 PID 清遗孤再起。
- 测试 +7：hook 6（挂载首轮+串行顺序/5s 周期/unmount 停/失败静默+无 unhandled/掉线收缩/契约防御）+ App 1（头像堆叠+计数徽章）。质量门 lint 0 / tsc 0 / **test 302**（37+53+212）。
- 浏览器双 tab 真链路：双用户头像+「2 人在线」双端一致（倒序=最近活跃在前）、heartbeat→online 串行成对、退登后零心跳、console 0 错误；UI 创建 testuser 顺带回归 T7 全流程。

### 双轴 review 修复（两 sub-agent 并行）
- **Standards**：`// Initial fetch` 英文注释中文化（T5 先例：等价迁移不豁免注释语言规范）；App.test 三 describe 的 beforeEach 完全相同 → 提升文件顶层。classList 匹配耦合不采纳（横跨节点文本无更优方案）。
- **Spec**：【真发现】NAT 同 IP 限流风险（上述白名单修复）；补掉线收缩用例 + 契约防御用例；`?.` 存量写法（T4 改动非本票）与 try/catch 静默（已记 Deviation）不另行处理。
- 修复后质量门：lint 0 / tsc 0（frontend+backend）/ test 302 全绿；限流白名单 node 连打实证；浏览器回归（5 对串行心跳 + console 清零）。

### Open questions
- 无

---


### 验证结果（全部实测）
- **Step 3 build** ✅ 镜像 595MB（历经 3 修复，见下）
- **Step 4 native（D7 终验）** ✅ adapter 实例化 → `better-sqlite3 native OK`（musl + libstdc++ base 自带坐实；且镜像是 **gyp 源码编译产物**——`prebuild-install socket hang up` → build tools fallback 实战触发，Plan A 预判坐实）
- **Step 5 compose 起栈** ✅ 日志逐项：`SQLite WAL 已启用` / `Seeded admin user` / `Session cleaner scheduled` / `Server running on port 3001`（Task 6 启动序列吻合）+ 容器 `Up (healthy)` + health `{"status":"ok"}`
- **P0 唯一 BLOCKER 清零**，v2 收尾部署链全通。

### Task 8 纸面 Dockerfile 首跑暴露的 3 个修复
1. **apk 换阿里源**：`sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories`——官方 CDN 11/29 包用 793s，阿里源 20.7s（38 倍）。
2. **builder 加 `prisma generate`**（install 后、shared build 前）：CI 同款教训**第二实例**（[[ci-prisma-generate-required]]——不止 CI，**任何全新 install 环境都缺 `.prisma/client`**，tsc 必挂 TS7006/TS2339）。
3. **pnpm v10 `deploy --legacy` + `prisma` 移入 dependencies**：v10 deploy 默认要求 `inject-workspace-packages=true`（`ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE`）；且 `--prod deploy` 不含 devDeps，而 CMD `npx prisma migrate deploy` 运行时需要 CLI → 移 prod deps（语义正确：migrate deploy 是运行时职责）。

### Plan 勘误（Step 4 验证命令）
- plan 字面 `require('better-sqlite3')` 在 pnpm 严格模式下**必失败**：它是 `@prisma/adapter-better-sqlite3` 的传递依赖，不提升到顶层 node_modules（.pnpm 隔离）。修正为 adapter 实例化验证（真触发 native .node 加载 + libstdc++ 链路）。

### 环境适配（本机，不进库）
- `~/.docker/daemon.json` 加 `registry-mirrors: [docker.m.daocloud.io, docker.1ms.run]`（Docker Hub 直连被拒）；DNS 间歇抖动重试即过。
- 根目录 `.env`（从 packages/backend/.env 拷贝，compose `env_file` 需要；`DATABASE_URL` 被 compose override `file:/data/prod.db`；gitignore 已排）。
- Docker Desktop 装在 `AppData\Local\Programs\DockerDesktop`（非 Program Files），daemon 崩过一次重启即恢复。

---

## [2026-07-21] V2 推送远端 + CI 验证闭环

### Design decisions
- **force-push feat/v2-refactor → main**：远端 main（4 commits 旧前端）与 feat/v2-refactor（72 commits V2）`entirely different commit histories`，GitHub PR 表单不出现。核验 V2 的 `RemoteHub/` 子目录（53 文件）是远端 main 前端（24 文件）的**超集演进版**（ConnectionCard diff 1 行、App.tsx 22 行、auth.service.ts 137 行 V2 更全含 heartbeat）→ 零损失覆盖 main（`0777aad → a60119f → eaa69b7`，`--force-with-lease`，TUN 代理绕 GFW 阻断）。
- **不走 merge --allow-unrelated-histories**：会把远端 24 个扁平前端文件塞进 monorepo 根目录，污染结构。force-push 最干净，且 `push: main` 直接触发 CI（无需 PR，绕过 PR 表单缺失）。

### CI 验证结果（Plan B Step5 闭环 ✅）
- **首跑**（run 29811728180 @ a60119f）tsc step **27 错全红** → 诊断 prisma generate 遗漏（详见下 section）→ 修复 `eaa69b7`。
- **重跑**（run 29813066646 @ eaa69b7）**11 步全 success**：prisma generate ✅ / tsc ✅（27 错清零）/ backend test **204 全过**（unit 200 + integration 4，15 files）。Plan A/B/C 首次真实 CI 验证（ubuntu + 全新 install）。
- **本地实测**：lint 0 / tsc exit 0 / test **204 passed**。handoff 写的 200（unit 196）是 a60119f「补测试」前的旧数，现 204。

### 待办闭环状态
- ✅ **Plan B Step5**（push 触发 CI 验证）：本 session 完成。
- ✅ **D7**（musl/libstdc++）：早前查证反转闭环（node:20-alpine 自带，OQ 清单已 [x]）。
- ⏳ **Plan A Task8**（docker build 验证）：唯一遗留 BLOCKER，本环境 `docker: command not found`，需 Docker 环境实测。

### 优先级清单核验（P0–P3，同日 evidence 坐实）
- **P0**：docker build 唯一遗留 BLOCKER（~~Plan B Step5 push CI~~ ✅ 本 session 闭环，run 29813066646 全绿）。
- **P1 OpenSpec 治理债**（3 项坐实）：`openspec/changes/integrate-backend-api`（tasks **49[x]/24[ ]**，已取代但**未 archive**）/ `openspec/TEMPORARY_OPERATIONS.md`（残留）/ `openspec/changes/integrate-backend-api/proposal.updated.md`（废弃副本）。
- **P1 废弃代码**（数字厘清，git tracked 技术债）：`backend/` v1 TypeORM **118 源码文件**（106 .ts / 57 TypeORM / 7 文件含 TODO，**git tracked 非 ignored**）/ `RemoteHub/` v1 前端 **53 tracked**（find 含 node_modules 的 7457 是虚高）。删除前提：RemoteHub/ 待前端迁移完成、backend/ 待 phase2 移植参考完。
- **P2/P3**：准确（前端迁移 spec §5 悬空是 phase2 §19 硬前置 / phase2 被 v2 收尾硬阻塞）。

---

## [2026-07-21] CI prisma generate 遗漏修复（Plan B 实施后首次 CI 暴露）

### 触发
force-push feat/v2-refactor → main 触发首次 CI（run 29811728180），tsc 步骤（step 9）27 错全红，test（step 10）skipped。本地同款 `pnpm --filter @remotehub/backend exec tsc --noEmit` EXIT 0 全绿 → 排除代码问题，锁 CI 环境。

### Design decisions
- **根因**（CI 日志 L184 铁证）：`@prisma/client` postinstall `prisma:warn We could not find your Prisma schema in the default locations`。schema 在 `packages/backend/prisma/schema.prisma`（非默认位置），postinstall 找不到 → client 未生成 → `.prisma/client/default` 空壳 → tsc 找不到 `ConnectionUncheckedCreateInput` / `PrismaClientKnownRequestError` 等 → 27 错（TS7006 回调推断失败 + TS2694/TS2339 命名空间缺失）**同源于此**。
- **修复**：ci.yml install 后加 `pnpm --filter @remotehub/backend exec prisma generate`（在 backend 包目录跑，prisma 找到 `prisma/schema.prisma`）。本地同款命令验证 ✔ 生成 v6.19.3。

### Deviations / 教训
- **Plan B self-review 漏网**：设计 CI 时没考虑 prisma client 生成；pnpm postinstall 找不到非默认路径 schema 是 Prisma 已知行为。**可复用结论：CI 凡含 prisma 项目，install 后必须显式 `prisma generate`，不能依赖 postinstall**（自定义 schema 路径下必失效）。→ 萃取进 memory。
- **evidence-first 自纠**：初疑 `onlyBuiltDependencies` 放错位置（`"pnpm"` 字段外），查证发现配置正确在 `"pnpm": {}` 下，自纠为 postinstall schema 查找根因。见 [[evidence-before-conclusion]]。

### Tradeoffs
- prisma generate 位置：install 后、shared build 前（generate 独立于 shared，tsc/test 依赖它，最早放最稳）。

---

## [2026-07-17] v2 收尾 spec grill review（第二轮 + 第三轮）

对 `2026-07-17-v2-followup-design.md` 做 grill review，逐条核验 spec 断言对照真实代码 + context7/web-search 查证。第二轮产出 D1–D9；第三轮（grill 自己的结论）修正 D1 清单 + 新增 D10。用户要求 plan 前再过两轮——避免地基问题带入 plan。

### Design decisions（已拍板）

- **[D1]** 应用层字段长度校验补全**前移进 Plan A**（顺序：补校验 → 移 `@db.VarChar` → migration → Docker）。原 spec §1.2「归入 B-6」制造裸奔窗口、§1.5「业务代码零改动」矛盾。订正口径「业务逻辑零改动、仅补输入校验」。
  - **[D1 修正·第三轮]** 校验逻辑集中在 `@remotehub/shared/validators.ts`（12 个 validate 函数 + `validators.test.ts` 已测）。Connection（create §103 + update §203 双路径）、Member role、User 注册（authService）、User 改密、Project name **均已接好**。**真实缺口远小于原"12 字段"**：
    1. `userService.updateUser` 补 `validateUsername`+`validateRole`+`validateNickname`（替换手写 §53）
    2. `authService` 注册补 `validateRole`（§58-62 漏了）
    3. shared 新增 `validateDescription`+`validateIcon`+`validateNotes`+`validateVpnLoginUrl`（4 个）
    4. `projectService` create/update 调 `validateDescription`+`validateIcon`
    5. `connectionService.validateConnectionFields` 加 `validateNotes`+`validateVpnLoginUrl`
  - 性质：主要是**接线**（service 调 shared），不是写校验。Plan A 校验子任务 scope 大幅缩小。
- **[D1.1]** 校验**手写 + helper**，不引入 zod。（注：实际校验逻辑已在 shared，helper 指 shared validate 函数；service 层只是调用）
- **[D2]** CI 门**全部 filter 到 backend**（lint/tsc/test）+ shared test + shared build；frontend 不参与。spec §3 `pnpm -r lint`/`pnpm -r test` 字面必崩（shared+frontend 无 eslint 依赖、frontend 0 测试且无 passWithNoTests）。**Open Question 4 关闭**。frontend lint+test 作为 §5 前端迁移子项目前置。
- **[D3]** seed 生产链路修复**纳入 Plan A**（部署 BLOCKER）。删 seedCheck，seed 检测并入 server.ts 启动。原 Open Question 5 升级 BLOCKER 定性纠正。
- **[D3.1]** 抽 `src/utils/seedAdmin.ts`（`seedAdmin(prisma)` 接收外部 prisma）；server.ts `ensureAdminSeed` 传 server 单例（带 adapter+WAL）；`prisma/seed.ts` 补 adapter 调共享函数；Dockerfile 删 esbuild seed 步骤；`seed.js` 出库 + `.gitignore`（**D6**）。
- **[D4]** 维持 driver adapter（与官方 #11789 WAL 路径一致）。Prisma 6.15+ GA，不需 previewFeatures。**Open Question 3 关闭**。WAL pragma 改 `$queryRaw` + 断言 `'wal'`。Plan A 前置核验 lockfile `@prisma/client` ≥ 6.15。
- **[D5]** server.ts 改 `async bootstrap()`：WAL pragma(`$queryRaw` 断言) → `ensureAdminSeed` → `startSessionCleaner` → `app.listen`。WAL/seed 失败 fail-fast（`exit 1`）。`prisma.ts` 补回 `globalForPrisma`。首次 migrate deploy 不走 WAL——接受。
- **[D6]** seed.js 出库 + `.gitignore`（合并 D3）。
- **[D7]** Docker runtime：**不补 libstdc++**（node:20-alpine 自带）。builder build tools 保留作 prebuild fallback。plan 验证项：docker build 后 `require('better-sqlite3')` 坐实 + `--prod deploy` 原生模块拷贝验证。不需 sqlite-libs。
- **[D8]** B-6 抽 `createPrismaMock()` helper，新增 3 + 现有 2 service test 全迁移（5→1）。注：shared validators 已有 test，B-6 测 service 层调用 + 错误聚合，不重测校验逻辑。
- **[D9]** 集成测试：把 spec §2 BLOCKER-1 验收做成 `setupTestDb()`（临时 SQLite + migrate deploy）+ 验 5 表/unique/cascade/自引用 SetNull。vitest.config 加 unit/integration 分离。
- **[D10]** shared 加 `validateNotes`(≤2000)+`validateVpnLoginUrl`(≤500)，connectionService 调用。design §3.1 未列这俩，但移除 @db.VarChar 后 DB 无兜底，补宽松上限防超长滥用。

### Deviations（教训 + 正例）

- **[反面·seed.ts]** D5 第 6 条没读 seed.ts 就编「导出 runSeed()+加守卫」，被用户抓到。读真实文件发现三个没预见的问题（顶层 process.exit 地雷、new PrismaClient 无 adapter、esbuild cjs vs tsc esm interop）。修正为抽 `seedAdmin`。**原则：没看到事实不要妄下定论。** 见 memory [[evidence-before-conclusion]]。
- **[正例·D7]** 原预设「spec §1.4 漏 libstdc++ 要补」，查 better-sqlite3 v12 musl prebuild + node:20-alpine 自带 libstdc++ 后**反转为不补**。先查再下。
- **[正例·第三轮 D1]** grill 自己的结论——复查 D1 清单时发现上一轮只 grep `.min/max/length`、没读 connectionService import + shared validators，误报「Connection 全缺/12 字段」。读 shared validators 发现校验逻辑完整、Connection 双路径已接好。**主动还了 evidence 的债**（没等用户抓）。同时避免了一个误报：第三轮初差点把「migrations 不存在」当新发现，多跑一个 grep 发现审计 §68-72 早记为 BLOCKER-1——**根因是没读审计附录 A**。

### Meta-review（2026-07-18）：前端迁移推锅修正

grill plan 时发现"留给前端迁移子项目"类引用（spec §5、Plan B frontend 前置）挂在**未立项**的子项目上——前端迁移详细 spec/plan 不存在，只有 spec §5 范围规划。是 plan 体系的悬空依赖（前端迁移是 phase2 §19 硬前置）。

**修正**（选项 1，用户拍板）：spec §5 + v2-master + Plan B 三处加显式悬空声明 + 触发条件（phase2 §19 启动前必须立项前端迁移）。不强行现在做前端迁移（避免 scope creep；spec §5 本就声明"实施另立项"），但把推锅暴露成显式 Open Question，不再藏在"留给子项目"话术里。选项 2（补前端迁移 spec）作为触发时的执行路径预留。

### Tradeoffs

- 校验手写(shared) vs zod：手写（已存在，零依赖）。zod 留未来。
- driver adapter vs 原生：adapter（官方 WAL 背书 + SQLCipher 路径）。
- seed 并入 server.ts vs 独立：并入（BLOCKER + 与 WAL 同趟）。
- bootstrap fail-fast vs warn：fail-fast。
- Docker 不补 libstdc++ vs 防御性补：不补（base 已含，注明前提）。
- notes/vpnLoginUrl 补上限 vs 不补：补（DB 兜底没了，防超长）。

### Open questions

D1–D10 全部拍板；剩余见顶部「待办」。

---

## spec 事实核验纠错（spec 断言 vs 仓库现实）

| # | spec 断言 | 仓库现实 | 处理 |
|---|----------|---------|------|
| F1 | §1.2 移除 `@db.VarChar`「约 20 处」 | 实际 **12 处** | 订正 |
| F2 | §1.3/§1.5「移除 connection_limit」 | `env.ts`+`.env` DATABASE_URL **无此参数** | 删空改动 |
| F3 | §1.4「删除 mysql-client」 | Dockerfile **从未安装** | 删空改动 |
| F4 | §1.4「docker-compose.dev.yml」 | 仓库**只有** docker-compose.yml | 删幻觉引用 |
| F5 | §1.3 prisma.ts 示例 | 丢 `globalForPrisma` | 补回（D5） |
| F6 | §1.2「校验归入 B-6 / 12 字段全缺」 | shared validators 完整 + Connection/Member/User注册/Project-name **已接好**，真实缺口见 D1 修正 | 改精确缺口表 |

**第三轮追加核验**：
- `prisma/migrations/` 不存在 = **已知 BLOCKER-1**（审计 §68-72、openspec/project.md:114、engineering-progress.html:362 均记），spec §2 `migrate dev --name init` 正是解法——非新发现。
- VPN 校验代码（connectionService §127-129/§212-226/§351-362）**符合 handoff 实际意图**（非 VPN requiredVpnId 保留），design §308 字面错、代码对。
- `appError.handlePrismaUniqueViolation` 存在且 P2002 映射齐全（§67-78）→ §4 B-6 appError.test 是补测试非写实现。留 B-6 验证项：切 SQLite 后 P2002 `meta.target` 格式是否一致。
- raw SQL 仅 `healthRoutes.ts:8 SELECT 1`（跨 provider 兼容）。

---

## [2026-07-18] Plan A/B/C 实施（TDD，15 Task + 修复提交）

按 executing-plans + TDD 技能执行 `docs/superpowers/plans/2026-07-18-*` 三份 plan。本地 `lint 0 / tsc 0 / test 200`（unit 196 + integration 4）全绿。

### Plan A：SQLite 切换链路（8 Task，commit c21617e…9804dc4）
- Task1 shared 加 4 validator（TDD RED 10 fail → GREEN 28 pass）。
- Task2 4 service 校验接线（connectionService notes/vpnLoginUrl 先 RED 再接线）。
- Task3 schema `provider=mysql→sqlite` + 移 12 处 `@db.VarChar`（prisma validate 需临时 `file:` URL）。
- Task4 prisma.ts driver adapter（`@prisma/adapter-better-sqlite3@6.19.3`，pin 6.x；根 package.json 加 better-sqlite3 到 onlyBuiltDependencies）。
- Task5 seed 链路重组（抽 `seedAdmin`、删 `seedCheck`、`seed.js` 出库）。
- Task6 server.ts async bootstrap（WAL→seed→cleaner→listen，fail-fast）。
- Task7 migration init + 集成测试（D9，vitest unit/integration projects 分离）。
- Task8 Docker 简化（删 mysql 容器、加 build tools、CMD 简化为 migrate deploy + server）。

### Plan B：CI（commit c08a72b、8187665）
- `.github/workflows/ci.yml`（shared build/test + backend lint/tsc/test）+ 根 package.json 补 `packageManager` pin。
- 修预存在 50 个 lint 错：源码 6 处（`(error as any)`→类型收窄、删未用 import、删失效 eslint-disable）；eslint 测试文件范围豁免 `no-explicit-any`（mock 范式所需，生产代码仍严格）。

### Plan C：B-6 service 单测（6 Task，commit 77fd85b…d1be7d8）
- `createPrismaMock` helper（model 方法超集）+ 迁移 auth/connection test。
- 新增 userService(12)/projectService(6)/memberService(13)/connectionService getConnection B-4(5)/appError P2002(10)。

### Deviations（evidence-based，偏离 plan 字面）
- **adapter 导出名是 `PrismaBetterSQLite3`（大写 SQL）**，plan 字面 `PrismaBetterSqlite3` 错；以真实包导出为准。
- **`write_to_file` 偶发写空文件**：seedAdmin.ts 首次写 0 字节（Task5 提交后 Task6 tsc 才暴露，因 tsconfig 仅含 src 不覆盖 prisma/seed.ts）。教训：写入后核验文件 Length。
- **dev.db 分裂**：driver adapter 按进程 CWD 解析 `file:./dev.db`，prisma CLI 按 schema 目录解析 → migrate 写 `prisma/dev.db` 而 server/seed 写 `packages/backend/dev.db`。新增 `src/utils/resolveSqliteUrl`（TDD）锚定 prisma/ 目录统一。**plan 未预见，实施时发现并修复。**
- **.env ENCRYPTION_KEY 原值解码 35 字节**（违反 env.ts 32 字节校验，本地未跟踪文件，pre-existing），改为合法 32 字节 base64。
- **prisma generate 漏跑**：切 provider 后需 `prisma generate` 重生成客户端，否则 runtime 报 adapter/provider 不兼容（tsc 不暴露，types 不变）。
- **集成测试 flaky**：testDb 原用 `execSync(pnpm --filter ... migrate deploy)` 在 vitest projects 并发时偶发「表不存在」。改用本地 prisma 二进制直调（`--schema` + cwd）+ vitest `fileParallelism:false` 串行 projects。
- **tsc 强转**：vi.mock 运行期替换但 TS 按真实 PrismaClient 类型检查，新 test 文件 `const prisma = _prisma as any`（eslint 测试文件已豁免 any），connectionService 块用现有 `as MockFn` 范式。

### 未完成的验证项（待办）
- Plan B Step5 `git push` 触发 CI（待用户在有远端的仓库执行）。
- Plan A Task8 docker build/load 验证（本环境无 Docker 守护进程）—— D7 plan 验证项未实际执行。
- D7 终验依赖 docker build。
