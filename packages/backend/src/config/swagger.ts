// 票 #51:Swagger 文档单一真相源(v1 双配置反例红线,快照 §4——全项目仅此一个 definition)。
// 结构对齐 v1 backend/src/config/swagger.ts 实践(快照 §1):集中静态定义 + 路由文件内 YAML-in-JSDoc 注解。
// 注解路径写全路径(含挂载前缀,大括号占位),与 server.ts 挂载点对账(集成测试精确断言 59 个操作)。
import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';
import type { SwaggerUiOptions } from 'swagger-ui-express';
import { ERROR_CODES } from '../utils/appError.js';

/**
 * 生产环境不暴露 /api-docs(票面 AC:生产 404 由 lead compose 栈真机验收;
 * 本函数抽小便于单测分支覆盖——server.ts 挂载 guard 消费。
 * review 修复(批 12):toLowerCase 防大小写变体(如 'Production')fail-open。
 */
export function isSwaggerEnabled(nodeEnv: string): boolean {
  return nodeEnv.toLowerCase() !== 'production';
}

// apis glob:routes/*.ts + server.ts(v2 无 model 层,快照 §7)。基于 import.meta.url 构造绝对路径,
// 不随进程启动 cwd 漂移(v1 相对 cwd 写法在 vitest/tsx/生产三种 cwd 下只有一种能扫到);
// Windows 反斜杠必须转正斜杠——swagger-jsdoc 内部 glob 只认 / 分隔。
const routesDir = fileURLToPath(new URL('../routes/', import.meta.url)).replace(/\\/g, '/');
const serverEntry = fileURLToPath(new URL('../server.ts', import.meta.url)).replace(/\\/g, '/');

// 错误码枚举动态生成(review 修复批 12):单一来源 utils/appError.ts ERROR_CODES,
// 新码进 ERROR_CODES 即自动入文档,无人工同步面;RATE_LIMIT 是限流器 429 的 code
// (server.ts 硬编码,不在 ERROR_CODES 表内),单独补列。
const ERROR_CODE_ENUM: string[] = [...Object.keys(ERROR_CODES), 'RATE_LIMIT'];

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'RemoteHub API',
    version: '2.0.0',
    description: `RemoteHub 后端 API 文档(票 #51)。

## 认证
除公开端点(登录/注册/刷新/探针/健康检查/密码重置)外,均需 JWT:
\`Authorization: Bearer <accessToken>\`

## 统一响应壳
成功:\`{ "success": true, "data": <T> }\`(分页端点另含 \`pagination\`);
失败:\`{ "success": false, "error": { "code", "message", "details?" } }\`——错误码全表见 ErrorResponse schema 的 code 枚举。

## 限流
login/register/refresh/forgot-password/mfa 各有专属配额,超限 429(code=RATE_LIMIT);响应含标准 RateLimit-* 头。`,
  },
  // 注解已写全路径,servers 不再拼 /api/v1 前缀(双前缀即文档说谎)
  servers: [{ url: 'http://localhost:3001', description: '开发服务器' }],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '登录返回的 accessToken(15 分钟),置于 Authorization 头',
      },
    },
    schemas: {
      // 统一成功壳(shared types.ts ApiResponse<T> 先例;DTO 不裸用,必须包 wrapper)
      SuccessResponse: {
        type: 'object',
        required: ['success', 'data'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object', description: '端点业务数据(形状见各端点注解)' },
        },
      },
      // 分页成功壳(shared types.ts PaginatedResponse<T> 先例)
      PaginatedSuccess: {
        type: 'object',
        required: ['success', 'data', 'pagination'],
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { type: 'object' }, description: '当前页数据' },
          pagination: {
            type: 'object',
            required: ['page', 'pageSize', 'total'],
            properties: {
              page: { type: 'integer', example: 1 },
              pageSize: { type: 'integer', example: 20 },
              total: { type: 'integer', example: 42 },
            },
          },
        },
      },
      // 错误壳:以 v2 现行壳为准(server.ts error handler / shared ApiErrorResponse)。
      // v1 的 timestamp/path/method/requestId 四字段在 v2 不存在,照抄即文档说谎(快照 §6)。
      // additionalProperties:false 锁死漂移——新增顶层字段必须改本定义并过集成测试。
      ErrorResponse: {
        type: 'object',
        required: ['success', 'error'],
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', example: false, description: '恒为 false' },
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                enum: [...ERROR_CODE_ENUM],
                description: '业务错误码,与 utils/appError.ts ERROR_CODES 表一致',
              },
              message: { type: 'string', example: '输入验证失败', description: '中文可读消息' },
              details: {
                type: 'array',
                description: '字段级校验明细(仅 VAL_001 等校验类错误携带)',
                items: {
                  type: 'object',
                  required: ['field', 'message'],
                  properties: {
                    field: { type: 'string', example: 'username' },
                    message: { type: 'string', example: '不能为空' },
                  },
                },
              },
            },
          },
        },
      },
    },
    responses: {
      // 三族复用(Unauthorized/Forbidden/ValidationError)+ 本批新增限流/超限——注解里 $ref 引用,
      // 控制 YAML 篇幅。NotFound 族已删(review 修复批 12):零 $ref 引用,各端点 404 均为
      // 内联错误码描述(PROJ_002/CONN_002 等具体码,比泛化 NotFound 更准确)。
      Unauthorized: {
        description: '未认证(AUTH_001 用户名或密码错误 / AUTH_002 令牌过期 / MFA_002 挑战令牌无效)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      Forbidden: {
        description: '无权限(AUTH_003 / MEMBER_002 项目角色不足 / NOTIF_002)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      ValidationError: {
        description: '输入校验失败(VAL_001,422;details 含字段级明细)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      RateLimited: {
        description: '请求过于频繁(RATE_LIMIT,429;含 RateLimit-* 标准头)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      PayloadTooLarge: {
        description: '请求体超限(SYS_003,413)。三条触发路径:①/admin/import 预检 Content-Length > 50mb 即拒;②chunked 无 Content-Length 读满 50mb parser 时拒;③部署层 nginx client_max_body_size 50m 硬顶——无 CL 头不可绕过',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
    },
  },
  // 12 个 route 文件 × 1 tag,与集成测试对账基准一一对应
  tags: [
    { name: 'Probe', description: 'K8s 探针(挂 app 根,无 /api/v1 前缀)' },
    { name: 'Health', description: '系统健康检查' },
    { name: 'Auth', description: '认证与会话(登录/注册/刷新/密码/2FA)' },
    { name: 'Users', description: '用户管理(admin)' },
    { name: 'Projects', description: '项目管理(含归档/复制/转让)' },
    { name: 'Members', description: '项目成员管理(嵌套于项目)' },
    { name: 'Connections', description: '远程连接管理(含克隆/解密/直连)' },
    { name: 'Audit', description: '审计日志查询与导出' },
    { name: 'Monitoring', description: '运维监控仪表盘(admin)' },
    { name: 'Backups', description: '数据库备份管理(admin)' },
    { name: 'Admin', description: '数据导入导出(admin)' },
    { name: 'Notifications', description: '站内通知' },
  ],
} as const;

export const swaggerSpec: object = swaggerJsdoc({
  definition: swaggerDefinition,
  apis: [`${routesDir}*.ts`, serverEntry],
});

// swagger-ui 呈现层 options:整组继承 v1 实跑配置(快照 §5,与 Express 5 兼容性无关)。
// persistAuthorization 等 swagger-ui 本体选项须经 swaggerOptions 透传
// (@types/swagger-ui-express 的 SwaggerUiOptions 仅覆盖 HTML 壳层字段)。
export const swaggerUiOptions: SwaggerUiOptions = {
  customSiteTitle: 'RemoteHub API 文档',
  customCss: '.topbar-wrapper img { display: none; }',
  swaggerOptions: {
    persistAuthorization: true, // 刷新不掉授权
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    docExpansion: 'none', // 默认收起
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
  },
};
