// 票 #51:Swagger 文档单一真相源(v1 双配置反例红线,快照 §4——全项目仅此一个 definition)。
// 结构对齐 v1 backend/src/config/swagger.ts 实践(快照 §1):集中静态定义 + 路由文件内 YAML-in-JSDoc 注解。
// 注解路径写全路径(含挂载前缀,大括号占位),与 server.ts 挂载点对账(集成测试精确断言 59 个操作)。
import { fileURLToPath } from 'node:url';
import swaggerJsdoc from 'swagger-jsdoc';
import type { SwaggerUiOptions } from 'swagger-ui-express';

/**
 * 生产环境不暴露 /api-docs(票面 AC:生产 404 由 lead compose 栈真机验收;
 * 本函数抽小便于单测分支覆盖——server.ts 挂载 guard 消费。
 */
export function isSwaggerEnabled(nodeEnv: string): boolean {
  return nodeEnv !== 'production';
}

// apis glob:routes/*.ts + server.ts(v2 无 model 层,快照 §7)。基于 import.meta.url 构造绝对路径,
// 不随进程启动 cwd 漂移(v1 相对 cwd 写法在 vitest/tsx/生产三种 cwd 下只有一种能扫到);
// Windows 反斜杠必须转正斜杠——swagger-jsdoc 内部 glob 只认 / 分隔。
const routesDir = fileURLToPath(new URL('../routes/', import.meta.url)).replace(/\\/g, '/');
const serverEntry = fileURLToPath(new URL('../server.ts', import.meta.url)).replace(/\\/g, '/');

// 错误码枚举(单一来源 utils/appError.ts ERROR_CODES + server.ts 限流器 RATE_LIMIT,2026-11-12 盘点)。
// 文档不撒谎:枚举随 ERROR_CODES 演进人工同步,新码必须补列(集成测试锁 VAL_001/SYS_003/SYS_001 在列)。
const ERROR_CODE_ENUM = [
  'AUTH_001', 'AUTH_002', 'AUTH_003', 'AUTH_004', 'AUTH_005', 'AUTH_006',
  'USER_001', 'USER_002',
  'CONN_002', 'CONN_003', 'CONN_004', 'CONN_005', 'CONN_006',
  'PROJ_001', 'PROJ_002',
  'MEMBER_001', 'MEMBER_002', 'MEMBER_003',
  'AUDIT_001', 'AUDIT_002',
  'RESET_001', 'RESET_003',
  'MFA_001', 'MFA_002', 'MFA_003',
  'VAL_001', 'SYS_001', 'SYS_002', 'SYS_003',
  'NOTIF_001', 'NOTIF_002',
  'BACKUP_001', 'BACKUP_002', 'BACKUP_003',
  'RATE_LIMIT',
] as const;

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
      // 四族复用(v1 先例)+ 本批新增限流/超限——注解里 $ref 引用,控制 YAML 篇幅
      Unauthorized: {
        description: '未认证(AUTH_001 用户名或密码错误 / AUTH_002 令牌过期 / MFA_002 挑战令牌无效)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      Forbidden: {
        description: '无权限(AUTH_003 / MEMBER_002 项目角色不足 / NOTIF_002)',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
      NotFound: {
        description: '资源不存在(SYS_002 路由不存在 / PROJ_002 / CONN_002 / USER_002 / NOTIF_001 / BACKUP_002)',
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
        description: '请求体超限(SYS_003,413;/api/v1/admin/import 预检 Content-Length > 50mb 即拒)',
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
