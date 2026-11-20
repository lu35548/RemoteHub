# v1 Swagger 注解实践提炼（backend/ 删除前快照）

> 2026-11-05 / #52 Phase 1 删 `backend/` 前提炼，供 #51（Swagger 票）消费。行号基于删除前状态（v1 源码删后仅存 git 历史）。
> 票面口径：#51「注解模式对齐 v1 backend/ 的 Express 4 实践结构（删前参照）」。

## 1. 总体结构：集中式 definition + 路由内注解

v1 采用「一个集中配置文件 + 各路由文件内嵌 YAML-in-JSDoc 注解」的混合模式：

- **集中配置** `backend/src/config/swagger.ts`：单文件持有 `swaggerJsdoc({ definition, apis })` 全部静态定义——info（含错误格式说明文档）、servers、`components.securitySchemes`（bearerAuth JWT）、`components.schemas`（SuccessResponse / ErrorResponse / User / TokenPair / Project / Connection / LoginRequest / RegisterRequest）、`components.responses`（Unauthorized / Forbidden / NotFound / Validation 四族）、全局 `security`、`tags` 清单；外加 swagger-ui options（见 §5）。
- **分散注解**：每个 route 文件内，`/** @swagger ... */` YAML 块紧贴对应 `router.get/post(...)` 定义之前。样板位置：`routes/connections.ts` clone 端点注解（删前 L482-516）、`routes/export.ts` 整文件注解、`routes/auth.ts` L250-284（forgot/reset-password）、`routes/index.ts` L11-36（API root）。
- **生成与挂载**：`app.ts` L115 `app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions))` + L120 独立 JSON 端点 `GET /api-docs.json`。design 对 #51 的口径是 `GET /api/v1/docs` + `/api/v1/docs/swagger.json`——落地端点路径按 design，不照抄 v1 的 `/api-docs`。

## 2. apis glob 与路径约定

- `apis: ['./src/routes/*.ts', './src/models/*.ts']`，相对**进程启动 cwd** 解析。
- **路径写全路径**：注解路径直接写含挂载前缀的全路径（如 `/api/v1/connections/{id}/clone`），不依赖挂载拼接——注解自包含，可读性优先。v2 挂载前缀集中在 `server.ts`（含 `/api/v1/projects/:id/members` 这类嵌套前缀），#51 需沿用全路径约定，并在注解内保持与挂载一致。

## 3. 注解块字段清单（v1 实际用到的全集）

- 路径 + method 键（如 `post:`）
- `summary`：中文一句话
- `tags: [Xxx]`：引用 definition.tags 已定义的 tag 名
- `security: [{ bearerAuth: [] }]`：受保护端点
- `parameters`：path/query 参数，`in` / `name` / `required` / `schema` / `description`
- `requestBody`：`required` + `content.application/json.schema`——内联 object schema（clone 先例）或 `$ref` components.schemas（LoginRequest / RegisterRequest 先例）
- `responses`：状态码键 + `description`（必填）+ 可选 `content.schema`。v1 多数注解响应只写 description（薄响应），少数厚响应（登录返回 TokenPair `$ref`；export 主端点返回 `application/octet-stream` binary 流）

注解块以 YAML 缩进表达层级，紧贴路由定义之前放置。

## 4. 双配置冗余反例（#51 落地红线）

v1 同时存在两套 swagger 定义：仅 `config/swagger.ts` 被 app.ts 挂载使用；`docs/apiDocumentation.ts` 是从未接线的第二套，且两套字段口径不一致（role 枚举不同；第二套 Connection 是数据库连接语义而非远程连接语义）。#51 落地必须单一真相源，禁止出现第二个 definition 文件。

## 5. swagger-ui options（v1 实际配置）

`persistAuthorization`（刷新不掉授权）、`displayRequestDuration`、`filter: true`、`showExtensions` / `showCommonExtensions`、`docExpansion: 'none'`（默认收起）、`defaultModelsExpandDepth: 2`、`defaultModelExpandDepth: 2`、customCss / customSiteTitle。v2 消费时可整组继承（纯呈现层配置，与 Express 5 兼容性无关）。

## 6. 错误壳文档漂移（#51 照抄必错项）

`config/swagger.ts` 的 info.description 固化的错误格式文档带 `timestamp / path / method / requestId` 四个字段，**比 v2 现行错误壳（`{ success, error: { code, message, details? } }`）多四个字段**。#51 生成 ErrorResponse schema 时必须以 v2 现行壳为准；v1 的 timestamp/path/method/requestId 在 v2 不存在，照抄即文档说谎。

## 7. 依赖与 Express 5 兼容面

- v1 实跑组合：Express 4.18 + swagger-jsdoc 6.2.8 + swagger-ui-express 5.0.0（`backend/package.json` L49-50）。
- P1 spec 定版：swagger-jsdoc 6.3.0 + swagger-ui-express 5.0.1（`research/2026-09-24-p1-libcheck-docs-ci-rdp.md` 定版）。v1 只证明「Express 4 + swagger-jsdoc 6 + swagger-ui-express 5」组合实跑可行；Express 5 下 swagger-ui-express 的 serve/setup 走的 res API 面较窄，但兼容性需 #51 首跑验证，v1 不提供 Express 5 证据。
- v1 的 apis glob 含 `models/*.ts`（model 层注解）；v2 无 model 层——#51 的 apis glob 只需 routes + server.ts。
