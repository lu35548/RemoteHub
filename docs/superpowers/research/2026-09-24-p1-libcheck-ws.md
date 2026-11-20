# P1 技术面核验：WebSocket 实时通知（ws / 前端客户端 / Vite 6 proxy / nginx 反代 / Node 20）

> 核验日期：2026-09-24。方法：npm registry 实查（`npm view`）+ context7 拉取 ws/TanStack Query/Vite 6 官方文档 + nginx.org / nodejs.org 官方文档 WebFetch + Vite 6.4.3 源码直读。所有配置片段均摘自当前官方文档，非记忆。
> 项目基线（`packages/backend/package.json`、`packages/frontend/package.json` 实查）：Express `^5.1.0` + tsx watch + Node 20；Vite `^6.0.0` + React `^19.0.0` + @tanstack/react-query `^5.70.0` + react-router-dom `^7.0.0`；**尚无任何 ws 依赖**。

---

## TL;DR 结论速览

| 技术面 | 结论 |
|---|---|
| ws 版本 | **8.21.3**（2026-08-07），engines ≥10，Node 20 无障碍 |
| path 过滤 | `WebSocketServer({ server, path })` 官方支持，**精确 pathname 匹配** |
| 心跳 | README 官方 30s ping + isAlive + terminate 惯例；浏览器自动回 pong |
| 前端客户端 | **推荐自写 hook**（原生 WebSocket + 指数退避 ≈60 行）；两个现成库均停更/未验 React 19 |
| WS→Query 联动 | TanStack Query 官方模式：外部 `queryClient.setQueryData` / `invalidateQueries` |
| Vite 6 proxy | `ws: true` 官方语法确认；**rewrite 对 upgrade 请求同样生效**（6.4.3 源码证实） |
| nginx | `Upgrade`/`Connection` 头必须显式传；**1.29.7 起 `proxy_http_version` 默认已 1.1**；`proxy_read_timeout` 默认 60s，30s 心跳可保活 |
| Node 20 | `server.on('upgrade')` 官方确认；**Node 20 已于 2026-04-30 EOL**（警示项） |

---

## 1. ws 库

**技术/版本**：`ws` 最新稳定 **8.21.3**（发布 2026-08-07）。版本时间线实查：8.20.0（2026-03-21）→ 8.21.0（2026-05-22）→ 8.21.1（2026-07-14）→ 8.21.2（2026-08-03）→ 8.21.3（2026-08-07）。维护极活跃，且同时在回灌 5.2.x / 6.2.x / 7.5.x 旧线补丁。`engines: node >= 10.0.0` → Node 20 兼容无障碍。

> ⚠️ 核验过程中的坑：用网页抓取 `registry.npmjs.org/ws/latest` 拿到的是**缓存的 8.20.0**；`npm view ws version` 实查为 8.21.3。版本仲裁以 `npm view` 为准。

**关键 API：attach 到既有 http server**

构造选项 `port` / `server` / `noServer` **三者必须恰好设一个**，否则抛 `TypeError`（官方 configuration 文档）。`server` 传预先创建的 http/https server，ws 自动挂 upgrade 监听：

```js
import http from 'http';
import { WebSocketServer } from 'ws';
const server = http.createServer(app); // Express 5 app
const wss = new WebSocketServer({ server, path: '/api/v1/ws' });
```

**path 过滤：支持。** 官方 configuration 文档原文：`path` (String) — *"Accept only connections whose request pathname matches exactly"*。即 `new WebSocketServer({ server, path: '/api/v1/ws' })` 直接可行，升级请求带 query string（如 `?token=`）不影响 pathname 匹配。注意是**精确匹配**而非前缀——路由要整个 `/api/v1/ws` 全等。

**心跳 ping/pong 服务端惯例**（ws README「How to detect and close broken connections?」原文，30s 间隔 + isAlive 标记 + terminate）：

```js
function heartbeat() { this.isAlive = true; }

wss.on('connection', function connection(ws) {
  ws.isAlive = true;
  ws.on('error', console.error);
  ws.on('pong', heartbeat);
});

const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', function close() { clearInterval(interval); });
```

README 同页确认："Pong messages are automatically sent in response to ping messages as required by the spec"——**浏览器客户端协议栈自动回 pong，无需前端写任何心跳 JS**。8.x 构造选项另有 `autoPong`（默认 `true`，指 ws 服务端自动回 pong）。

**鉴权在 upgrade 事件**（ws README 官方范例，noServer 模式；`{ server }` 模式同理可先挂 `server.on('upgrade')` 前置校验——但同一事件多监听器的执行顺序与 handleUpgrade 的交互见下方「实施注意」）：

```js
server.on('upgrade', function upgrade(request, socket, head) {
  socket.on('error', onSocketError);
  authenticate(request, function next(err, client) {
    if (err || !client) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    socket.removeListener('error', onSocketError);
    wss.handleUpgrade(request, socket, head, function done(ws) {
      wss.emit('connection', ws, request, client);
    });
  });
});
```

cookie 鉴权即在 `authenticate` 里解析 `request.headers.cookie`（升级请求是原始 http.IncomingMessage，不经过 Express 中间件链）。官方亦提供 `examples/express-session-parse` 同款模式。

**兼容性结论**：与 Express 5 共存无冲突——`http.createServer(app)` 后把 server 交给 ws；Express 的路由/中间件不感知 upgrade 请求（Connect/Express 链对 upgrade 方法请求不处理）。`verifyClient` 选项官方已标注 discouraged，勿用。

**票面级实施注意**：
1. **浏览器原生 WebSocket API 无法设置自定义 header**（`new WebSocket(url[, protocols])` 只有 url 和子协议两个参数）→ 票面上若写「upgrade 时验证 Authorization: Bearer」在浏览器端**不可行**；鉴权载体应为 **cookie**（与本项目 cookie 会话栈一致，升级请求自动携带）或「连接后首条消息带 token」。用 `Sec-WebSocket-Protocol` 塞 token 属 hack（需服务端回显选定协议），不推荐。来源：websocket.org 握手头参考（2026-03）、ably.com WebSocket 鉴权指南——均明确 "the WebSocket browser API doesn't allow you to set arbitrary headers with the HTTP handshake like Authorization"。
2. `{ server }` 模式下 ws **自己也注册了一个 `server.on('upgrade')` 监听器**；若额外再挂自己的 upgrade 监听器做鉴权，监听器执行顺序按注册先后，且 ws 内部 handleUpgrade 已消费 socket——**推荐直接用 `{ server, path }` + 在 `wss.on('connection')` 后首条消息鉴权，或用 noServer 模式独占 upgrade 事件做前置鉴权**（二选一，票面定死，避免双监听器竞态）。
3. upgrade 请求绕过全部 Express 中间件 → express-rate-limit、CORS、body 解析均不生效，鉴权与防滥用逻辑必须自含。
4. 优雅关停注意：见第 5 节 `closeAllConnections` 不会断 WS。

**来源**：
- https://github.com/websockets/ws （README：多 server 共享/鉴权/心跳范例）
- https://github.com/websockets/ws/blob/master/doc/ws.md （API 参考）
- https://registry.npmjs.org/ws/latest （engines、exports）
- `npm view ws version` / `npm view ws time --json`（2026-09-24 实查）

---

## 2. 前端 WS 客户端（原生 WebSocket + TanStack Query 5）

**技术/版本**：@tanstack/react-query 最新 **5.91.3**（registry 实查；项目 `^5.70.0` 满足）。

**TanStack Query 官方 API（联动惯例，v5 官方文档确认）**：

```ts
// 同步写缓存（不可变更新；updater 返回 undefined 则跳过写入）
queryClient.setQueryData(['notifications'], (old) =>
  old ? { ...old, items: [incoming, ...old.items] } : old,
);
// 标 stale + 对正被 useQuery 渲染的 query 触发后台 refetch
await queryClient.invalidateQueries({ queryKey: ['notifications'] });
```

官方文档明确推荐「setQueryData 做立即原子更新 + invalidateQueries 做服务端重同步」组合。WS 集成的社区标准参考即 TkDodo 的《Using WebSockets with React Query》（TanStack 官方文档/issue 多处引用）：WS 连接在 React 树外建立，`onmessage` 按 payload 类型派发到 `queryClient.setQueryData` / `invalidateQueries`。

**成熟库评估（registry 实查）→ 推荐自写**：

| 库 | 最新版 | 最后发布 | 状态 |
|---|---|---|---|
| react-use-websocket | 4.13.0 | **2025-02-04** | dev/test 栈停在 React 18（devDeps 实查 react 18.3.1），未声明 peerDeps → **React 19 兼容性未经验证**；重连/心跳内置但黑盒 |
| reconnecting-websocket | 4.4.0 | **2023-07-28** | 三年未更新 |
| TanStack 官方 WS 集成包 | — | — | **不存在**（官方路线就是 queryClient 手动派发） |

**推荐：原生 WebSocket + 自写 ~60-80 行状态机 hook**（单例 queryClient 在 React 外持有，hook 只管连接生命周期）。理由：项目消息协议是自有 JSON 契约、需精确接入 queryClient；第三方库不能提供 queryClient 集成且 React 19 适配存疑；自写代码量小、vitest 可 mock WebSocket 全覆盖。

**重连指数退避参考实现要点**（惯例综合，无官方规范）：
- 初始延迟 0.5–1s，每次 ×2，封顶 30s，加随机抖动（jitter）防止服务端恢复时惊群；
- `onopen` 重置计数器；`onclose` code 1006（异常断开）/非正常码才重连，服务端主动 `close(1000)` 不重连（业务下线）；
- `visibilitychange`（页面回前台）/`online` 事件立即尝试重连（浏览器在后台会掐长连接）；
- 重连成功后 `invalidateQueries` 关键 query，补齐断线期间的增量（WS 只做「提示」，数据以 refetch 为准可大幅简化协议）。

**票面级实施注意**：
1. 浏览器 WS 不能带 Authorization header（同第 1 节）→ dev 下 Vite proxy 与生产 nginx 反代**同源路径**连接（`/api/v1/ws`），cookie 自动携带，无需处理跨域；
2. 开发环境 ws URL 用相对路径走 Vite proxy（见第 3 节），生产同域走 nginx（见第 4 节）——前端代码不需要区分环境，统一 `new WebSocket(\`${location.origin === 'https:' ? 'wss' : 'ws'}://${location.host}/api/v1/ws\`)`；
3. React StrictMode 双挂载下 hook 需幂等（effect cleanup 里 close，防双连接）。

**来源**：
- https://tkdodo.eu/blog/using-web-sockets-with-react-query
- https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation （setQueryData/invalidateQueries 行为）
- https://registry.npmjs.org/react-use-websocket/latest 、`npm view react-use-websocket@4.13.0 peerDependencies`（2026-09-24 实查）
- https://registry.npmjs.org/reconnecting-websocket/latest

---

## 3. Vite 6 dev proxy：`ws: true`

**技术/版本**：Vite 6 当前 6.x 最新 **6.4.3**（npm 实查；项目 `^6.0.0` 会拉到该线）。上游最新 stable 已是 **Vite 8.0**（2026-03-12 发布）——本票不涉及升级，仅备忘。

**官方配置语法**（v6.vite.dev `config/server-options` 原文示例）：

```ts
export default defineConfig({
  server: {
    proxy: {
      // ...
      '/socket.io': {
        target: 'ws://localhost:5174',
        ws: true,
        rewriteWsOrigin: true,
      },
    },
  },
})
```

对应本项目票面写法即：`'/api/v1/ws': { target: 'ws://localhost:3000', ws: true }`（target 与后端 http 端口相同亦可，`ws` 选项决定 upgrade 是否被代理；`ws: true` 或 target 以 `ws://`/`wss://` 开头二者其一即生效——**Vite 6.4.3 源码证实**：`if (opts.ws || opts.target?.startsWith('ws:') || opts.target?.startsWith('wss:'))` 才走 `proxy.ws()`）。

**rewrite 对 WS 的适用性：生效。** Vite 6.4.3 源码 `packages/vite/src/node/server/middlewares/proxy.ts` 的 upgrade 分支原文：

```ts
httpServer.on('upgrade', async (req, socket, head) => {
  // ...
  if (opts.ws || opts.target?.toString().startsWith('ws:') /* ... */) {
    // ... bypass 处理 ...
    if (opts.rewrite) {
      req.url = opts.rewrite(url)
    }
    proxy.ws(req, socket, head)
    return
  }
})
```

即 rewrite 先于 `proxy.ws()` 执行，upgrade 请求同样被改写。本项目前后端路径一致（`/api/v1/ws` 直通），**无需 rewrite**。

**HMR 自有 WS 与代理 WS 共存**：Vite dev server 自己也监听同一 `httpServer` 的 `upgrade` 事件处理 HMR；proxy 的 upgrade 监听只拦截**匹配 proxy key** 的 URL（`startsWith` 或 `^` 正则）——proxy key 用 `/api` 前缀即天然不碰 HMR 通道，无需任何额外配置。v6 官方 `server.hmr` 文档补充（适用于复杂拓扑/反代场景）：反代不支持 WS 时 HMR 客户端会尝试直连 fallback；要避免可配 WS 反代、或 `server.strictPort = true` + `server.hmr.clientPort` 对齐 `server.port`、或给 `server.hmr.port` 换端口。

**票面级实施注意**：
1. `rewriteWsOrigin: true` 源码注释带 **CSRF 警告**（"Exercise caution as rewriting the Origin can leave the proxying open to CSRF attacks"）：仅当后端校验 Origin 且 dev 下 Origin 为 `localhost:5173` 被拒时才开；若开了它，**后端的 Origin/CSRF 校验在生产必须依然存在**，否则 dev 掩盖生产 bug；
2. proxy key 不要写成 `/`（会把 HMR 的 upgrade 也代理走）；统一收口在 `/api` 前缀。

**来源**：
- https://v6.vite.dev/config/server-options （server.proxy、server.hmr 原文）
- https://github.com/vitejs/vite/blob/v6.4.3/packages/vite/src/node/server/middlewares/proxy.ts （6.4.3 源码，rewrite/bypass/ws 判定原文）

---

## 4. nginx WS 反代

**技术/版本**：核验基于 nginx.org 官方文档（2026-09 当前版）。**重要新事实：nginx 1.29.7（mainline，2026-03）起 proxy 到上游默认即 HTTP/1.1**（官方博客 "NGINX 1.29.7 now defaults to HTTP/1.1 when proxying to upstreams"；1.30.0 stable，2026-05-02 起继承该默认）。官方 websocket.html 示例现已把该指令写为注释：`# proxy_http_version 1.1; # before version 1.29.7`。

**官方写法一（固定 Connection 头，简单场景）**：

```nginx
location /chat/ {
    proxy_pass http://backend;
    # proxy_http_version 1.1; # before version 1.29.7
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

**官方写法二（map，官方称 "more sophisticated"，混合流量安全）**：

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    ...
    location /chat/ {
        proxy_pass http://backend;
        # proxy_http_version 1.1; # before version 1.29.7
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
    }
}
```

**两种写法差异**：`Upgrade`/`Connection` 是 hop-by-hop 头，nginx 反代默认**不透传**，必须显式 `proxy_set_header` 转发（这是 WS 反代的全部要点；nginx 自 1.3.13 支持 101 Switching Protocols 隧道模式）。固定 `"upgrade"` 会让该 location 的**非 WS 请求**也带上 `Connection: upgrade` 头发给上游——WS 专用 location 可接受；map 写法在客户端无 `Upgrade` 头时发 `Connection: close`，对「同 location 混合 HTTP+WS 流量」安全。本项目 `/api/v1/ws` 独立 location，两种皆可，票面建议 map 写法（防御未来路径复用）。

**`proxy_read_timeout` 与心跳**：官方原文——"By default, the connection will be closed if the proxied server does not transmit any data within 60 seconds. This timeout can be increased with the proxy_read_timeout directive. **Alternatively, the proxied server can be configured to periodically send WebSocket ping frames to reset the timeout** and check if the connection is still alive." → **60s 默认 × 30s 服务端 ping = ping 间隔必须小于 60s 即可保活**，这正是第 1 节 README 惯例 30s 的工程意义（也是「默认 60s vs 30s ping」风险的定量答案：只要间隔 < proxy_read_timeout 就安全；若心跳间隔 ≥ 60s，必须显式调大 `proxy_read_timeout`，如 `proxy_read_timeout 3600s;` 双保险）。

**票面级实施注意**：
1. 生产 nginx 若版本 < 1.29.7，`proxy_http_version 1.1;` **必须显式写**（旧默认 1.0，Upgrade 握手会失败）；显式写上在 ≥1.29.7 亦无害且前向兼容 → **票面直接显式写**，不依赖部署环境版本；
2. location 内不要套会缓冲/改写响应的通用配置；WS 隧道不走 proxy_buffering 逻辑（101 升级后进入隧道模式），无需额外处理；
3. 若接入层还有 docker 网络超时/LB 空闲超时（云 LB 常见 60s/350s），同属「必须 ping < 空闲超时」约束——心跳间隔选取要覆盖整条链路中最短的超时。

**来源**：
- https://nginx.org/en/docs/http/websocket.html （官方 WebSocket proxying，全文摘录）
- https://blog.nginx.org （1.29.7 默认 HTTP/1.1 公告，2026-03-26）
- https://docs.nginx.com （Releases：Default HTTP/1.1 to upstreams）
- https://community.nginx.org （1.30.0 stable 公告，2026-05-02）

---

## 5. Node 20 http server：`server.on('upgrade')` 与 noServer 模式

**技术/版本**：Node.js **v20.20.2** 官方文档（docs/latest-v20.x）。

**官方语义**（http.Server `Event: 'upgrade'` 原文摘录）：

> Emitted each time a client requests an HTTP upgrade. Listening to this event is optional and clients cannot insist on a protocol change.
> After this event is emitted, the request's socket will not have a `'data'` event listener, meaning it will need to be bound in order to handle data sent to the server on that socket.
> — `request` <http.IncomingMessage>、`socket` <stream.Duplex>、`head` <Buffer>

关键历史变更（官方 History 表）：**v10.0.0 起 "Not listening to this event no longer causes the socket to be destroyed if a client sends an Upgrade header"**——即无人监听 upgrade 时 socket 不再被销毁（请求按普通 HTTP 流程悬置）。因此：
- 用 ws 的 `{ server }` 选项：ws 自己注册监听器，无需手写 `server.on('upgrade')`；
- 用 **noServer 模式**（要自己路由/鉴权时）：**必须**显式 `server.on('upgrade')` 并对每个分支调用 `wss.handleUpgrade(request, socket, head, cb)`，**未匹配路径必须 `socket.destroy()`**（官方 README「Multiple servers sharing a single HTTP/S server」范例原文如此，否则连接悬置泄漏）。这就是「path 过滤不用 WebSocketServer path 选项的替代方案」的完整官方形态（见第 1 节摘录）。
- 鉴权失败响应：官方范例 `socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy();`（升级请求无法走正常 res 管道，只能裸写 socket）。

**优雅关停相关官方事实**：`server.closeAllConnections()`（v18.2+）——"This does **not** destroy sockets upgraded to a different protocol, such as WebSocket or HTTP/2" → 票面的优雅关停必须**单独**处理 WS：`wss.close()`（停止接受新连接 + 等既有连接关闭）或逐 `ws.terminate()`，然后再 `server.close()`。

**兼容性警示：Node 20 已于 2026-04-30 EOL**（nodejs.org End-of-Life 页 + endoflife.date/herodevs 多源一致：Maintenance 期止于 2026-04-30，此后无安全补丁；当前 Maintenance LTS 为 22，Active LTS 为 24）。对本票影响：ws 8.21.3 engines ≥10 完全兼容，P1 按 Node 20 实施无技术障碍；但**不要在票面引入 Node 20 之后才有或 20 专属的 API 假设**，且应给 backlog 留「Node 20 → 22 LTS 升级」条目（项目 `@types/node ^20`、Docker 基础镜像同查）。

**来源**：
- https://nodejs.org/docs/latest-v20.x/api/http.html （server 'upgrade' 事件、closeAllConnections 原文，v20.20.2）
- https://nodejs.org/en/about/previous-releases （EOL 日程）
- https://endoflife.date/nodejs 、https://www.herodevs.com/blog/nodejs-versions （2026-09 实查佐证）

---

## 交叉核对：五项联动一致性

1. **心跳 30s** 同时满足三处约束：nginx `proxy_read_timeout` 60s 默认（30 < 60 ✓）、ws README 惯例（30s + terminate）、浏览器零 JS 自动 pong ✓。
2. **路径 `/api/v1/ws`** 三处一致性：ws `path` 精确匹配 ✓ → Vite proxy key `/api`（startsWith）✓ → nginx `location /api/v1/ws` ✓。注意 ws `path` 是全等匹配，若未来前端在路径上追加 segment/参数会 400。
3. **鉴权载体统一 cookie**：浏览器 WS 无法带 header（强制）→ upgrade 时解析 `request.headers.cookie`（Node 20 官方 upgrade 语义）→ 与项目既有 cookie 会话栈对齐。
4. **Node 20 EOL** 是本票唯一「不改代码但需记账」的发现 → 建议进 backlog。
