# P1 联网核验：Swagger 文档 / CI actions 升级 / RDP+SSH 直连生成

> 2026-09-24 / 只核验不决策 / 全部版本与格式细节取自当日网络信息（npm registry、GitHub releases、Microsoft Learn），非记忆。
> 票面背景：P1 含 Swagger 文档、CI actions 升级、按协议生成直连指令（RDP mstsc / SSH 命令）。项目实况：backend **express ^5.1.0**（packages/backend/package.json）、frontend React 19、CI 现为 checkout@v4 + pnpm/action-setup@v4 + setup-node@v4 + node 20、packageManager `pnpm@10.33.2`。

---

## 1. swagger-jsdoc + swagger-ui-express（Express 5 兼容性）

**结论**：设计文档 §13 自认的"两库未声明 Express 5 兼容"风险**已解除大半**——swagger-ui-express 官方 peerDependencies 已放行 express 5；swagger-jsdoc 根本不依赖 express。组合可维持，但 swagger-ui-express 已停更两年+、express 5 无回归测试，验收须真机过一遍 UI 页面。

### swagger-jsdoc
- **版本**：latest = **6.3.0**（engines `node>=20.0.0`；以 npm 11.13.0 / node 24.16 构建，属 2026 年仍在维护的版本线）。
- **关键事实**：dependencies 仅 `glob 11.1.0 / yaml 2.0.0-1 / doctrine 3.0.0 / commander 6.2.0 / lodash.mergewith ^4.6.2 / @apidevtools/swagger-parser ^12.1.0`——**express 只出现在 devDependencies**（^4.22.1 用于自身测试），库本身与 Express 4/5 完全无关；OpenAPI 3.x 解析走 swagger-parser v12。
- **实施注意**：`apis` 路径直接指 `.ts` 源文件即可；JSDoc 注解里的 YAML 语义 tsc 不校验，错误只在运行时生成 spec 时暴露——建议配一条冒烟断言（生成 spec 后校验 paths 数 / 关键字段非空）。
- **类型**：包无自带 types（registry manifest 无 `types` 字段）→ 用 DefinitelyTyped 的 **@types/swagger-jsdoc@6.0.4**（2023-11 发布，typeScriptVersion 4.5，零依赖）。类型只覆盖 `swaggerJsdoc({ definition, apis })` 调用面，不校验注释内容；较老但 API 面稳定，够用。

### swagger-ui-express
- **版本**：latest = **5.0.1**（2024-05-31 发布，此后停更；运行时依赖 `swagger-ui-dist >=5.0.0`）。
- **Express 5 现状（老坑 2026 年答案）**：peerDependencies = **`"express": ">=4.0.0 || >=5.0.0-beta"`**——本项目 express ^5.1.0 满足，pnpm 严格 peer 解析不会报错。实现只是挂载 swagger-ui-dist 静态资源 + 无参数路由，不碰 Express 5 破坏面（path-to-regexp v8 收紧、路由语法变化均不涉及）。
- **残留风险**：issue #384（2025-06-04 开，至今 open、零回复）仍在要求"Support express 5"，仓库测试矩阵只跑 express ^4.19.2——即**官方 peer 放行但无 express5 回归测试**。票面验收须含真机打开 `/docs` 断言 assets 200。
- **@types**：**@types/swagger-ui-express@4.1.8**（2025-02 发布，typeScriptVersion 5.0，依赖 `@types/express` + `@types/serve-static`），DT 仍在维护。

### 替代方案现状
- **swagger-ui-react@5.33.0**（官方，活跃发版）：peer `react >=16.8.0 <20` → **React 19 满足**。2023 年底曾于 5.10.x 宣布弃用（社区 fork JamaSoftware/swagger-ui-react 过渡），5.11.x 起恢复官方发布。但本项目是把文档挂后端 express，没有引入 React 组件方案的必要。
- **zod-to-openapi / @elysiajs 类**：均以 zod（或对应框架）为前提，本项目**无 zod**，不适用；tsoa 是装饰器+重构建路线，收益配不上成本。
- **裁决建议**：维持 swagger-jsdoc + swagger-ui-express，配齐两个 @types 包。

**来源**：
- https://registry.npmjs.org/swagger-jsdoc/latest
- https://registry.npmjs.org/swagger-ui-express/latest
- https://registry.npmjs.org/@types/swagger-jsdoc/latest
- https://registry.npmjs.org/@types/swagger-ui-express/latest
- https://github.com/scottie1984/swagger-ui-express/issues/384
- https://registry.npmjs.org/swagger-ui-react/latest

---

## 2. actions/checkout 与 actions/setup-node 升级

**结论**：任务前提"checkout@v5 / setup-node@v5"已落后现状——两者主线均已走到 **v7**。v5 本身可用（都是 node24 化版本，最低 runner v2.327.1），但票面应写明目标 major 并知悉其后的 breaking。

### actions/checkout
- 版本线（2026-09-24 现状）：latest **v7.0.1**（2026-07-20）＞ v6.1.0 ＞ v5.1.0 ＞ v4.4.0。
- **v5.0.0**（node 24 化）：变更仅两条——`Update actions checkout to use node 24`（#2226）+ 发版；**⚠️ 最低兼容 runner v2.327.1**（GitHub 托管 runner 满足；self-hosted 需自查，本项目无 self-hosted）。
- **v6.0.0 头条**：`Persist creds to a separate file`（#2286）——persist-credentials 的凭据从 `.git/config` 改存独立文件。
- **2026-06-18 全线 breaking backport**：v4.4.0 / v5.1.0 / v6.1.0 / v7 均带 `allow-unsafe-pr-checkout`——更安全的 `pull_request_target` / `workflow_run` 默认行为（fork PR 默认不可 checkout），见 github.blog changelog 2026-06-18。**本项目 workflow 只有普通 push/PR checkout，不受影响**。
- 票面建议：`actions/checkout@v5`（满足票面且最小惊讶）或一步到 v6/v7，本项目两种都无风险。

### actions/setup-node
- 版本线：latest **v7.0.0**（2026-07-14，ESM 迁移 + 新 outputs `cache-primary-key` / `cache-matched-key`，顺带删除 dummy NODE_AUTH_TOKEN 导出）＞ v6.x ＞ v5.0.0。
- **v5.0.0**（2025-09-04）：① node 24 化（**最低 runner v2.327.1**）；② **自动包管理器缓存**：检测 package.json 的 `packageManager` 字段自动开缓存，`package-manager-cache: false` 可关闭。
- **v6.0.0（breaking，2025-10-14）**：**自动缓存仅限 npm**——pnpm/yarn 项目必须显式 `cache: 'pnpm'`。本项目现有 workflow 已显式写 `cache: 'pnpm'`，升级 v6/v7 写法不变。
- **配套顺序（issue #1351 实证）**：pnpm 缓存（自动或显式）都要求 **pnpm/action-setup 先于 setup-node**（setup-node 要调 pnpm 探测 store 路径）。本项目顺序已正确。
- **packageManager 字段 vs version 输入**：分工清晰——pnpm 版本由 **pnpm/action-setup 读 `packageManager` 字段**（本项目 `pnpm@10.33.2`）安装；setup-node 的 `node-version: '20'` 只管 Node 运行时，与 pnpm 版本无关。升级 actions 不需动这两个字段。

### pnpm/action-setup
- **任务前提"无 v5"已过时**：版本线 v4.x → **v5.0.0**（"Updated the action to use Node.js 24"，与 v4.4.0 同 commit `fc06bc1`——node24 适配同时 backport 回 v4 线）→ **v6.0.0**（pnpm v11 支持，2026-04-10）→ latest **v6.1.0**（2026-09-05，支持 pnpm v12）。
- **维护状态**：v4 线最后版本 v4.4.0 已含 node24 适配，短期可用；但 **v6.0.10（2026-08-03）起 README 官方指引迁移到后继 action `pnpm/setup`**，pnpm.io CI 文档已主推 `pnpm/setup`（`cache: true` 时一步装 pnpm + Node，无需单独 setup-node）。
- 票面建议：保守 = 保持 `pnpm/action-setup@v4`（node24 已 backport）或升 `@v6`；换 `pnpm/setup` 属结构性调整（合并两步），建议另立票不搭车。

**来源**：
- https://github.com/actions/checkout/releases （版本列表；v7.0.1 / v6.1.0 / v5.1.0 / v4.4.0 的 breaking backport 说明）
- https://github.com/actions/checkout/releases/tag/v5.0.0 （node24 + 最低 runner v2.327.1）
- https://github.com/actions/checkout/releases/tag/v6.0.0 （persist creds 独立文件）
- https://github.com/actions/setup-node/releases （v7.0.0 / v6.0.0 breaking / v5.0.0 全部变更原文）
- https://github.com/pnpm/action-setup/releases （v6.1.0…v4.4.0 全版本线；v6.0.10 README 指向后继）
- https://pnpm.io/continuous-integration （pnpm/setup 主推）

---

## 3. .rdp 文件格式（最小可用集 / 编码 / MIME / 下载衔接）

**结论**：`.rdp` 是 `key:type:value` 逐行纯文本；**官方明文唯一必填字段是 `full address:s:`**。编码官方现行文档未明文规定，实测 mstsc 默认保存 UTF-16 LE；纯 ASCII 内容用 UTF-8/ANSI 也能读。

### 关键字段摘录（Microsoft Learn「Supported RDP properties with RDS」，2024-07-03 版）
- `full address:s:<value>` —— 原文："This is **the only required setting** in an RDP file"，主机名/IPv4/IPv6。**端口写法**：现行页面未列独立端口字段，事实标准是把端口并入该字段 `full address:s:host:3390`（mstsc GUI 保存非 3389 连接即此格式）。
- `username:s:<value>` / `domain:s:<value>` —— 预填登录用户（可选，默认无）。
- `desktopwidth:i:<n>` / `desktopheight:i:<n>` —— 200–8192，默认匹配本机。
- `screen mode id:i:` —— `1` 窗口 / `2` 全屏（默认 2；窗口模式才消费 width/height）。
- 其他常用：`authentication level:i:2`（证书警告可继续，默认 3）、`autoreconnection enabled:i:1`（默认 1）、`enablecredsspsupport:i:1`（默认 1）、`smart sizing:i:1`（窗口内容缩放）。

**最小可用集（票面可直接采用）**：
```
screen mode id:i:1
desktopwidth:i:1280
desktopheight:i:800
full address:s:<host>:<port>
username:s:<user>
```

### 编码
- mstsc「另存」的 .rdp 实际是 **UTF-16 LE（带 BOM）**（社区一致证据：roundcube #9376 "The file is plain text but encoded utf-16le"；serverfault 帖指出解析器在野同时遇过 utf_16_le 与 utf_8 两种样本）。
- 票面策略：内容**限制纯 ASCII** 时 UTF-8（无 BOM）可被 mstsc 读取；若 username/域名可能含非 ASCII（如中文用户名），**必须写 UTF-16 LE + BOM**，否则乱码直接导致登录失败。建议 Node 侧统一 `UTF-16 LE + BOM` 生成，与 mstsc 自产文件同构、零分歧。

### MIME / Content-Type 与下载衔接
- **IANA 权威注册本次未能核实**（IANA media-types 页抓取失败 + 检索无果，如实记录）——事实标准为 **`application/x-rdp`**；下载场景真正起决定作用的是 **`Content-Disposition: attachment; filename="<名称>.rdp"`**，保证浏览器落盘不内联。
- 双击衔接：Windows 上 `.rdp` 默认关联 **mstsc.exe（Remote Desktop Connection）**，下载→双击即弹连接窗口（username 已预填，密码仍需输入）。浏览器下载文件带 Mark-of-the-Web；未签名 .rdp 无额外 mstsc 拦截，签名 .rdp 可展示 publisher（Signotaur 文档佐证 RDP 文件签名机制存在）。前端已有 blob 下载管线，直接复用。

**来源**：
- https://learn.microsoft.com/en-us/windows-server/remote/remote-desktop-services/clients/rdp-files
- https://github.com/roundcube/roundcubemail/issues/9376 （utf-16le 在野证据）
- https://serverfault.com/questions/… （"RDP file with embedded password asks for password"——编码两态证据）
- https://docs.finalbuilder.com/… （RDP File Signing / publisher 展示）

---

## 4. mstsc 命令行（直连指令串）

**结论**：`mstsc /v:host:port` 完全可用；**致命缺口是命令行无 /user 参数——用户名无法进指令串**，要么弹窗手输、要么走 .rdp 的 `username:s:`。这决定 spec 里 RDP「指令串」与「文件」双轨不是冗余而是必需。

### 参数摘录（Microsoft Learn windows-commands/mstsc，updated 2026-02-16）
```
mstsc.exe [<connectionfile>] [/v:<server>[:<port>]] [/g:<gateway>] [/admin] [/f]
          [/w:<width> /h:<height>] [/public] [/multimon] [/l] [/restrictedadmin]
          [/remoteguard] [/prompt] [/shadow:<sessionid>] [/control] [/noconsentprompt]
mstsc.exe /edit <connectionfile>
```
- `/v:<server>[:<port>]` —— 远端主机 + 可选端口（非 3389 直接 `host:3390`）。
- `/admin` 连管理会话；`/f` 全屏；`/w:<width> /h:<height>` 窗口尺寸（官方示例 `mstsc /v:computer1 /w:1920 /h:1080`）；`/public` 公共模式（不缓存密码/位图）；`/prompt` 强制弹凭据；`/edit <file>` 打开 .rdp 编辑。
- **全参数表核对：没有 /user 类参数**——凭据注入唯一文件通道是 .rdp（`username:s:` / `domain:s:`）。

### 网页一键可行路径（对照 spec「生成指令串/文件」）
- 浏览器无法直接拉起 mstsc（Windows 无 RDP 的 URL protocol，见 §5）→ 两条真实路径：
  1. **生成 .rdp 下载**（建议主路径）：可携带 username，双击即连；
  2. **复制指令串** `mstsc /v:<host>:<port> [/w:x /h:y] [/admin]`：用户 Win+R 或终端执行，连接时弹凭据框补用户名。
- 与票面一致：RDP 文件下载优先 + 指令串兜底；SSH 拼命令复制（§5 结论同）。

**来源**：
- https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/mstsc

---

## 5. ssh:// 与 rdp:// URI scheme 深链现状

**结论**：两个 scheme 在目标平台都**没有系统级默认 handler**，深链不可作为主路径；「SSH 拼命令复制剪贴板」是唯一跨机可靠方案，RDP 靠 .rdp 文件落盘。

### ssh://
- Windows 10/11 出厂无 ssh:// protocol handler（内置 OpenSSH 客户端只是命令行 exe，不注册 URL scheme）。
- **Windows Terminal 不支持**：feature request microsoft/terminal#6656「SSH handler」（2020-06-24 开）现状 **Closed，标签 Resolution-Duplicate + Issue-Feature**——请求被归并为重复项且从未实现；terminal 仓库至今无 ssh:// 注册功能。
- 第三方客户端（PuTTY、SecureCRT、Xshell 等）可自注册 handler，但那是个别用户机器的偶然状态，不能作为产品依赖。

### rdp://
- Windows 10+ **无内置 handler**（opennms 论坛 2020-05：「No handler for rdp:// URI scheme found in Windows 10 … no fix yet」；superuser 2011 结论：「There is no URI scheme for RDP that you can expect to "just work" on a modern PC」）。
- macOS 上 Microsoft Remote Desktop / Windows App 会注册 rdp://——平台不对称，跨平台产品不可依赖。
- **ms-rd: / ms-avd:**（2023 preview 起，AVD workspace 订阅/启动流）与 **ms-remotedesktop-launch**（Windows 365 Switch，learn API 文档 `RemoteDesktopConnectionInfo.GetForLaunchUri`）均为 Azure Virtual Desktop / Windows 365 专用，自管 mstsc 直连不适用。

### 票面裁决建议（带证据的取舍）
- SSH：`ssh <user>@<host> -p <port>`（端口 22 省略 -p）拼串复制剪贴板 = 主路径；ssh:// 深链不做（无系统 handler 证据链完整）。
- RDP：.rdp 文件下载 = 主路径（官方文件格式 + mstsc 默认关联背书）；`mstsc /v:` 指令串复制 = 副路径；rdp:// 深链不做。

**来源**：
- https://github.com/microsoft/terminal/issues/6656 （Closed as duplicate，未实现）
- https://opennms.discourse.group/… （rdp:// Windows 10 无 handler，2020）
- https://superuser.com/questions/… （Can you launch Remote Desktop via URL?）
- https://techcommunity.microsoft.com/… （ms-avd / ms-rd URI preview 公告）
- https://learn.microsoft.com/…/RemoteDesktopConnectionInfo.GetForLaunchUri （ms-remotedesktop-launch 仅 W365 Switch）

---

## 汇总：对票面的修正点

1. **Swagger 风险降级**：express 5 peer 已放行（swagger-ui-express@5.0.1 `>=4.0.0 || >=5.0.0-beta`），但须补 express5 真机 UI 验收步骤（issue #384 佐证无回归测试）。
2. **CI 升级票面版本目标需复核**：checkout / setup-node 主线已到 v7；若票面写 v5 可执行但非最新。v6 的「自动缓存仅 npm」（pnpm 必须显式 `cache: 'pnpm'`）是唯一实质 breaking，本项目现有写法已兼容。
3. **pnpm/action-setup 前提"无 v5"过时**：现 latest v6.1.0（支持 pnpm 12），官方 README 已指向后继 pnpm/setup；票面按「留 v4（node24 已 backport）/ 升 v6 / 换 pnpm/setup 另立票」三档写。
4. **RDP 指令串天生缺用户名通道**（mstsc 无 /user 参数），.rdp 文件（`username:s:` 预填 + UTF-16 LE 编码 + `Content-Disposition: attachment`）必须是一等路径而非可选。
5. **深链（ssh:// / rdp://）全平台无系统级默认 handler**，直连动作用「复制命令串 + 文件下载」双轨，深链明确不做。
