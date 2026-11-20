# P1 库核验：2FA TOTP 相关库（版本与 API 联网核验）

> 核验日期：2026-09-24。所有版本号取自 npm registry 实时数据（`npm view` / registry.npmjs.org），API 摘录取自官方 README、文档站或仓库源码（context7 索引 + 原文抓取），非凭记忆。
> 关联调研：`2026-09-24-p1-auth-security.md`（四域现状证据）。

## 项目现状基线（本地 pnpm 实测）

`pnpm --filter @remotehub/backend list` / `--filter @remotehub/frontend list` 实测安装版本（2026-09-24）：

| 包 | package.json 声明 | 实装版本 | registry 最新（联网实测） |
| --- | --- | --- | --- |
| jose | ^6.2.2 | **6.2.2** | 6.2.12（patch，范围内可升） |
| express-rate-limit | ^7.5.0 | **7.5.1** | 8.7.0（**跨 major**） |
| express | ^5.1.0 | 5.2.1 | — |
| bcryptjs | ^2.4.3 | 2.4.3 | — |
| react / react-dom | ^19.0.0 | **19.2.5** | — |

Node 20 + TypeScript strict，pnpm monorepo，Windows 11 开发机（禁止原生编译依赖）。

---

## 1. otpauth@9.5.2（TOTP 核心）

**版本**：`9.5.2`（dist-tags.latest，registry 元数据 2026-09-06）。来源：`npm view otpauth version dist-tags.latest time.modified`。

**依赖证据**：`npm view otpauth dependencies` → 唯一运行时依赖 `@noble/hashes@2.4.0`（纯 TypeScript 实现的哈希库）。官方 README 定位"One Time Password library for **Node.js, Deno, Bun and browsers**"，提供三种构建：

```
import * as OTPAuth from "otpauth";       // 默认构建（打包依赖）
import * as OTPAuth from "otpauth/slim";  // 精简构建（不打包依赖）
import * as OTPAuth from "otpauth/bare";  // 裸构建（需自带 HMAC 函数）
```

**关键 API 摘录**（README 原文）：

```javascript
// 生成密码学安全随机 secret（建议 ≥128 bit，即 ≥16 字节）
let secret = new OTPAuth.Secret({ size: 20 });

new OTPAuth.TOTP({
  issuer: "ACME",          // 服务名
  label: "Alice",          // 账号标识
  algorithm: "SHA1",       // 兼容性首选，README 建议保持默认
  digits: 6,               // 默认
  period: 30,              // 秒，默认
  secret: "US3WHSG7X5KAPV27VANWKQHF3SH3HULL", // base32 字符串或 Secret 实例
});

let token = totp.generate();                          // 当前 token（字符串）
let delta = totp.validate({ token, window: 1 });      // 返回 delta 或 null
let uri = totp.toString();                            // 或 OTPAuth.URI.stringify(totp)
// → "otpauth://totp/ACME:Alice?issuer=ACME&secret=...&algorithm=SHA1&digits=6&period=30"
totp = OTPAuth.URI.parse(uri);                        // URI 反解为 TOTP 实例
```

README 对 window 的原文（安全语义）："A search window is useful to account for clock drift between the client and server; however, it should be kept as small as possible to prevent brute force attacks. **In most cases, a value of 1 is sufficient. Furthermore, it is essential to implement a throttling mechanism on the server.**" 并引用 RFC 4226 §7 与 RFC 6238 §5。

`validate({ timestamp?, token, window? })` 返回 `number | null`：匹配成功返回 delta（0 = 当前窗口，±1 = 相邻窗口），失败 null。另有时区相关配套方法：`totp.counter()`（自 Unix epoch 的区间数，防窗口内重放用）、`totp.remaining()`（距 token 轮换的毫秒数）。

**兼容性结论**：纯 JS 零原生依赖，Windows 开发机无编译风险；Node 20 完全支持；MIT 协议。TOTP 基于 Unix 时间戳计算时间步，**无时区参数**——时钟问题只有"服务器系统时间要准（NTP）"这一条，与代码无关。测试可控时间：`generate()` / `validate()` 均接受 `timestamp`（毫秒）参数，vitest 冻结时间或显式传参均可。

**票面级实施注意**：
- `window: 1` 即接受 t-1/t/t+1 三个 30 秒窗口，是业界默认；配合后端限流（见第 5 节）与"每窗口 token 一次有效"防重放（用 `delta` 返回值算出实际 counter，记录已用 counter 拒绝同窗口复用）。
- secret 存库用 `secret.base32`；TOTP secret 验证时必须取原文参与 HMAC，**不能像密码一样单向哈希**（业界通行做法是 DB 明文列或应用层对称加密，启用完成后不再回显给前端）。
- 生成 URI 时 label 含 `@` 会被 URL 编码（`user%40myapp.com`），QR 内容直接用 `totp.toString()` 全串即可，前端不要自己拼。
- 启用流程防误绑：先存 secret + `pending` 状态，用户提交一次有效 `validate()` 后才置 `enabled`。

**来源**：https://github.com/hectorm/otpauth （README 全文抓取）；https://github.com/hectorm/otpauth/blob/master/docs/classes/TOTP.html

---

## 2. 恢复码（otpauth 不内建，需自实现）

**核验结论**：otpauth 官方 README 与文档只覆盖 HOTP/TOTP 生成与验证，**无任何恢复码（recovery codes / backup codes）功能**，需自行实现。

**业界标准做法**（OWASP MFA Cheat Sheet，全文核验）：
- 启用 MFA 时提供用户一组**单次使用**的恢复码："Providing the user with a number of **single-use recovery codes** when they first setup MFA"（Resetting MFA 节）。
- OTP/恢复码按"密码级卫生"处理（OTP Handling and Storage 节）：强制单次使用、严格限次、验证成功即作废、**不记日志**、**不长期明文存储**。OWASP 明确说明哈希 OTP 的价值在于防日志/调试泄露与缩小 DB 短暂暴露的爆炸半径，而非抵抗离线爆破（短码 keyspace 太小）；恢复码长度够（≥10 字符）时可再叠加慢哈希。
- GitHub 实例（GitHub Docs「Configuring two-factor authentication」，全文核验）：TOTP 启用向导最后一步强制"Save your recovery codes → Download"，用户确认"I have saved my recovery codes"后才真正开启 2FA——即**恢复码展示是启用流程的验收关卡**。
- GitHub Docs 同页确认 TOTP 参数业界默认：Type TOTP / Algorithm SHA1 / Digits 6 / Period 30。

**票面级实施注意**：
- 生成：`crypto.randomBytes` 出 N 组（业界常见 8–10 组）随机码，格式如 `xxxxx-xxxxx`（hex 或 base32 字符集，去除易混淆字符），只在启用/重新生成响应中返回**一次**。
- 存储：逐条存 SHA-256 哈希（或 bcrypt/argon2），明文不落库；使用时对提交值做同样哈希后比对。
- 使用：命中即作废该条（标记 used），一次登录只消费一条；可提供"重新生成"（作废全部旧码）。剩余恢复码数量在安全设置页展示条数但不展示内容。

**来源**：https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html ；https://docs.github.com/en/authentication/securing-your-account-with-two-factor-authentication-2fa/configuring-two-factor-authentication

---

## 3. 前端二维码：qrcode.react@4.2.0（首选）

**版本**：`4.2.0`（dist-tags.latest，registry 元数据 2024-12）。来源：`npm view qrcode.react version`。

**React 19 兼容证据**（`npm view qrcode.react peerDependencies` 实抓）：

```json
"peerDependencies": { "react": "^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0" }
```

React 19 在官方 peer 范围内，与本项目 react@19.2.5 兼容，无 --legacy-peer-deps 需求。库本身零运行时依赖、自带 TypeScript 类型（`./lib/index.d.ts`）。

**关键 API 摘录**（官方文档）：

```tsx
import { QRCodeSVG } from 'qrcode.react';

<QRCodeSVG
  value={totpUri}      // 必填：otpauth://totp/... 全串
  size={200}           // 像素，默认 128
  level="M"            // 纠错 L/M/Q/H，默认 L
  marginSize={2}       // 留白模块数（includeMargin 已废弃，用这个）
  title="扫描绑定 TOTP" // SVG <title>，无障碍
/>
```

另有 `QRCodeCanvas`（canvas 渲染，props 相同）。MFA 场景推荐 SVG（无 canvas 内存管理问题、可缩放）。`value` 支持 `string | string[]`。

**备选方案 qrcode@1.5.4**（后端直出 dataURL）：`npm view qrcode` → 1.5.4，engines `node>=10.13.0`，API（README 原文）：

```javascript
import QRCode from 'qrcode';
const url = await QRCode.toDataURL(totpUri); // Promise<string>，默认纠错 M
```

**兼容性结论**：主方案 qrcode.react@4.2.0 与 React 19 正式兼容；备选 qrcode@1.5.4 纯 Node 通用（同时支持前后端），无版本冲突。

**票面级实施注意**：
- 选型建议：前端组件方案（qrcode.react）胜在后端不传 secret 图片、直接把 `otpauth://` URI 作为 JSON 字段下发，前端本地渲染 QR；**注意这意味着 secret 会经过前端内存**——TOTP 启用流程本就如此（ authenticator app 同样扫描明文 secret），无额外风险，但不要把已启用用户的 secret 再次下发。
- 备选 dataURL 方案适合"后端直出 `<img src>`"的老式流程，本项目 React 19 架构无必要。
- 二维码白底黑字即可；深色主题下确认 `bgColor`/`fgColor` 显式设置，避免扫码器对低对比度解析失败。

**来源**：https://github.com/zpao/qrcode.react ；https://github.com/soldair/node-qrcode

---

## 4. jose：本地 6.2.2（^6.2.2），registry 最新 6.2.12

**版本**：`npm view jose` → 6.2.12（registry 元数据 2026-09-05）。本地实装 6.2.2，`^6.2.2` 范围覆盖 6.2.12，属 patch 流水，无破坏性变更担忧。

**关键 API 摘录**（官方 docs）：

```javascript
// 签发：setAudience 接受 string | string[]，返回 this（链式）
const jwt = await new jose.SignJWT({ sub: userId })
  .setProtectedHeader({ alg: 'HS256' })
  .setIssuedAt()
  .setAudience('mfa')            // 设置 aud claim（RFC 7519 §4.1.3）
  .setExpirationTime('5m')
  .sign(secret);

// 校验：jwtVerify 第三参 options.audience?: string | string[]
const { payload } = await jose.jwtVerify(token, secret, { audience: 'mfa' });
```

**audience 校验语义**（源码级证据，`src/lib/jwt_claims_set.ts`，原文摘录）：

```typescript
// 选项归一化：字符串选项包装成数组后进入匹配
if (
  audience !== undefined &&
  !checkAudiencePresence(claimsSet.aud, typeof audience === 'string' ? [audience] : audience)
) {
  unexpectedClaim(claimsSet, 'aud')
}

// 匹配逻辑：aud 是 string → 精确 includes；aud 是数组 → 任一重叠即通过
const checkAudiencePresence = (audPayload: unknown, audOption: unknown[]) => {
  if (typeof audPayload === 'string') return audOption.includes(audPayload)
  if (Array.isArray(audPayload)) return audOption.some((aud) => audPayload.includes(aud))
  return false
}

// 必填 presence：audience 选项存在时 'aud' 进入必查清单，缺失即抛错
if (audience !== undefined) presenceCheck.push('aud')
// 缺失 → JWTClaimValidationFailed: `missing required "aud" claim`
```

**语义总结（票面关键）**：
1. **传了 `audience` 选项** → token 必须带 `aud`（缺失抛 `JWTClaimValidationFailed`），且 aud 值必须与期望"有交集"（string 精确相等；数组 some-overlap）。
2. **没传 `audience` 选项** → `aud` claim **完全不校验**：token 带 `aud: 'mfa'` 也照常通过。

**兼容性结论**：jose 6.2.2 现状可用，audience 语义如上；升级 6.2.12 无障碍。express 5 / Node 20 环境无冲突（现有登录链路已在用）。

**票面级实施注意（安全核心，直接影响 mfa aud 三件套方案）**：
- 方案"mfa token 带 `aud:'mfa'`、access token 校验拒收该 aud"**不能只靠签发侧打标实现**——若现有 access token 校验的 `jwtVerify` 调用没传 `audience` 选项，则 mfa token 会被原样放行（语义 2），等于提权漏洞。必须在 access token 的 `jwtVerify` **显式加 `audience: 'access'`**，且签发 access token 时 `setAudience('access')`。
- mfa token 校验端点（TOTP 提交处）同理显式 `audience: 'mfa'`——这样普通 access token 拿来冒充 mfa 验证也会被拒。
- **绝不要签发 `aud: ['access','mfa']` 多值 token**：any-overlap 语义下它会同时通过两类校验，双发全家桶等于没隔离。
- mfa 短时效 token 与 access token 若共用签名密钥，aud 区分是唯一防线；若希望纵深更强，可换独立密钥（票面可选加分项）。

**来源**：https://github.com/panva/jose （docs/jwt/sign/classes/SignJWT.md、docs/types/interfaces/JWTClaimVerificationOptions.md、src/lib/jwt_claims_set.ts 经 context7 原文摘录）

---

## 5. express-rate-limit：本地 7.5.1（^7.5.0），registry 最新 8.7.0

**版本**：`npm view express-rate-limit` → 8.7.0（2026-08-29，engines `node>=16`，peer `express>=4.11`，兼容本项目 express 5.2.1）。本地实装 7.5.1，`^7.5.0` 锁在 7.x——**升级 8.x 需显式改 semver 且过 breaking**。

**v7.5.1 关键配置语义**（v7.5.1 tag 文档原文）：

```
windowMs: number —— 不能是函数；每个用户的时间窗从其首次请求起算，窗口结束后计数归零
limit: number | function —— v7.x 由 max 改名（max 仍向后兼容）
keyGenerator: (req, res) => string —— 同步/异步皆可，返回用户标识字符串
```

文档注意原文："If a `keyGenerator` returns the same value for every user, it becomes a **global rate limiter**"（可用第二个 limiter 实例组合全局 + 每用户双限）。

**每用户 24h 5 次写法（v7.5.1 现状版）**：

```typescript
import { rateLimit } from 'express-rate-limit';

export const totpAttemptLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24h（从该用户首次请求起算，非自然日重置）
  limit: 5,                       // v7 起 max 的改名
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    const username = typeof req.body?.username === 'string'
      ? req.body.username.trim().toLowerCase()
      : '';
    return username || req.ip || 'unknown'; // v7 直接回退 req.ip 合法
  },
});
```

**v8（8.7.0）breaking 要点**（官方 changelog 原文，升级时必读）：
- IPv6 默认按 `/56` 子网掩码聚合（防"同一 ISP 子网换 IP 绕限流"漏洞修复）。
- 新增导出 helper `ipKeyGenerator(ip, ipv6Subnet?)`（IPv4 原样返回）；新增 `ipv6Subnet` 配置项（默认 56）。
- 新增 `keyGeneratorIpFallback` validation：**自定义 keyGenerator 代码里引用了 `req.ip` 却没包 `ipKeyGenerator` 会直接报 validation 错误**。上述 v7 写法升 v8 时回退分支须改为 `ipKeyGenerator(req.ip)`。

**`req.body.username` 的票面级注意**：
1. **挂载顺序**：`req.body` 依赖 `express.json()` 先挂载；limiter 若挂在 body 解析之前，`req.body` 为 undefined，keyGenerator 静默退化为全请求共享 `'unknown'` key——等于全局 5 次/24h，事故级。必须防御性判型（如上代码），且 limiter 挂在路由级（与该端点同处）而非 app 全局。
2. **用户可控 key 的归一化**：username 不 trim/lower 会导致 `Alice` / `alice ` / `alice\t` 各自独立计数，绕过限流；但过度归一化（如去全部非字母）又可能误伤。trim + toLowerCase 是与注册口径一致的最小集。
3. **undefined 回退**：body 缺 username 时回退 IP（防无 key 全局共享）；升 v8 后回退必须包 `ipKeyGenerator`，否则 validation 报红。
4. **per-username 限流的 DoS 面**：以 username 为 key 意味着攻击者可故意消耗任意用户名的 5 次配额，把受害者锁在门外 24h。缓解口径（与端点性质相关）：TOTP 验证端点在密码验证通过后才到达，username 已被密码关筛过一遍，DoS 面显著小于纯登录端点；登录端点建议 IP 限流 + 账号维度延迟/锁定分开设计，不要简单共用"username 5 次"。
5. **存储语义**：默认 MemoryStore——单进程可用，但**重启即清零**（爆破者可诱发重启重置计数）、多进程/集群不共享。本项目 dev/生产单实例可接受，票面注明即可；如需持久化换外部 store。
6. 与项目已知坑的边界：既往踩过"app.use 挂载内 req.path 剥前缀"的坑（memory：express-rate-limit-mount-path），本方案 keyGenerator 不读 path，不受该坑影响；但 limiter 仍建议挂路由级而非全局挂载点。

**兼容性结论**：维持 7.5.1 完全可实现需求；升级 8.7.0 非必需，若升需按上节改 keyGenerator 回退分支并全量回归（validation 新增会让 v7 合法写法报错）。

**来源**：https://github.com/express-rate-limit/express-rate-limit （v7.5.1 tag docs/reference/configuration.mdx、官方 changelog https://express-rate-limit.mintlify.app/reference/changelog 、release v8.0.0）

---

## 汇总：拆票直接可引用的定版

| 项 | 定版 | 一句话结论 |
| --- | --- | --- |
| TOTP 库 | `otpauth@9.5.2` | 纯 JS 零原生；`Secret({size:20})` + `TOTP` + `validate({window:1})` + `toString()` 出 URI |
| 恢复码 | 自实现 | otpauth 不内建；N 组单次随机码，存 hash，展示一次，OWASP 口径 |
| 前端 QR | `qrcode.react@4.2.0` | peer 明确含 `^19.0.0`，`QRCodeSVG` 渲染 otpauth URI；备选 `qrcode@1.5.4` toDataURL |
| JWT aud | `jose@6.2.2`（可升 6.2.12） | audience 选项传了才校验（缺失抛错+交集匹配）；**不传则 aud 完全不校验**——access 校验必须显式 `audience:'access'` |
| 限流 | `express-rate-limit@7.5.1`（最新 8.7.0 跨 major） | `keyGenerator` 返回归一化 username、回退 IP；v8 起回退必须包 `ipKeyGenerator` |
