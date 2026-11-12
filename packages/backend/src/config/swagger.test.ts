// 票 #51:Swagger 文档测试(unit——swagger 端点自身不碰库,server.ts 的 NODE_ENV=test guard
// 保证 import 不触发 bootstrap/seed/cleaner,先例与 probeRoutes.test.ts 同源纪律)。
// 对账口径:路由表 59 个操作(multiline grep 盘点,含 4 个跨行定义端点)——精确相等,不是 ≥。
import '../test/helpers/env.js'; // 环境前置:必须第一个 import(拉起 server.ts→config/env.ts 的 requireEnv 快照)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../server.js';
import { isSwaggerEnabled } from './swagger.js';

/** OpenAPI 操作 method 全集(OpenAPI 3.0 路径项合法操作键) */
const METHODS = ['get', 'post', 'patch', 'put', 'delete'] as const;
type Method = (typeof METHODS)[number];

interface OperationObject {
  tags?: string[];
  responses?: Record<string, unknown>;
}
interface PathItem extends Partial<Record<Method, OperationObject>> {}
interface OpenApiSpec {
  openapi?: string;
  info?: { title?: string; version?: string };
  paths?: Record<string, PathItem>;
}

/** 12 个 route 文件 × 端点数的路由表对账基准(2026-11-12 盘点,multiline grep 全量) */
const EXPECTED_OPERATIONS_BY_TAG: Record<string, number> = {
  Probe: 2, // GET /healthz + /readyz(挂 app 根)
  Health: 1, // GET /api/v1/health
  Auth: 14, // 含 forgot/reset-password(跨行定义)与 mfa 三端点
  Users: 5,
  Projects: 11, // 含 batch-archive 与归档四操作
  Members: 4, // 嵌套前缀 /api/v1/projects/{id}/members
  Connections: 8, // 含 decrypt-password/launch/clone
  Audit: 2, // 含 /export CSV
  Monitoring: 5, // dashboard + stats×3 + users/{id}/reset-link(跨行定义)
  Backups: 3, // POST /(手动触发,跨行定义)+ GET 列表 + download
  Admin: 2, // /export + /import(422 VAL_001 / 413 SYS_003)
  Notifications: 2,
};
const EXPECTED_TOTAL_OPERATIONS = Object.values(EXPECTED_OPERATIONS_BY_TAG).reduce((a, b) => a + b, 0); // = 59

async function fetchSpec(): Promise<OpenApiSpec> {
  const res = await request(app).get('/api-docs/swagger.json');
  expect(res.status).toBe(200);
  return res.body as OpenApiSpec;
}

function countOperations(spec: OpenApiSpec): { total: number; byTag: Record<string, number> } {
  let total = 0;
  const byTag: Record<string, number> = {};
  for (const pathItem of Object.values(spec.paths ?? {})) {
    for (const method of METHODS) {
      const op = pathItem[method];
      if (!op) continue;
      total += 1;
      for (const tag of op.tags ?? []) {
        byTag[tag] = (byTag[tag] ?? 0) + 1;
      }
    }
  }
  return { total, byTag };
}

describe('Swagger /api-docs(票 #51,非生产环境挂载)', () => {
  it('GET /api-docs → 200 且返回 swagger-ui HTML', async () => {
    const res = await request(app).get('/api-docs/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
  });

  it('GET /api-docs/swagger.json → 200 OpenAPI 3.0 文档(单一真相源 config/swagger.ts)', async () => {
    const spec = await fetchSpec();
    expect(spec.openapi).toBe('3.0.0');
    expect(spec.info?.title).toBe('RemoteHub API');
  });

  it(`operations 总数与路由表精确对账 = ${EXPECTED_TOTAL_OPERATIONS}(不是 ≥)`, async () => {
    const spec = await fetchSpec();
    const { total } = countOperations(spec);
    expect(total).toBe(EXPECTED_TOTAL_OPERATIONS);
  });

  it('12 个 tag 分组数量逐一对账(每 route 文件全覆盖)', async () => {
    const spec = await fetchSpec();
    const { byTag } = countOperations(spec);
    for (const [tag, expected] of Object.entries(EXPECTED_OPERATIONS_BY_TAG)) {
      expect(byTag[tag], `tag ${tag} 应有 ${expected} 个操作`).toBe(expected);
    }
    // 注解不允许游离 tag:byTag 总和必须等于 operations 总数
    const tagged = Object.values(byTag).reduce((a, b) => a + b, 0);
    expect(tagged).toBe(EXPECTED_TOTAL_OPERATIONS);
  });

  it('抽查关键路径存在(嵌套前缀/探针/导出导入/重置链接/备份下载)', async () => {
    const spec = await fetchSpec();
    const paths = spec.paths ?? {};
    // probe 挂 app 根(K8s 惯例,无 /api/v1 前缀)
    expect(paths['/healthz']?.get).toBeDefined();
    expect(paths['/readyz']?.get).toBeDefined();
    // 嵌套前缀:members 二级资源
    expect(paths['/api/v1/projects/{id}/members']?.get).toBeDefined();
    expect(paths['/api/v1/projects/{id}/members/{uid}']?.patch).toBeDefined();
    // 批 12 相邻票的高危端点:导入(413 SYS_003)/审计 CSV/重置链接/备份下载
    expect(paths['/api/v1/admin/import']?.post).toBeDefined();
    expect(paths['/api/v1/admin/export']?.post).toBeDefined();
    expect(paths['/api/v1/audit-logs/export']?.get).toBeDefined();
    expect(paths['/api/v1/admin/users/{id}/reset-link']?.post).toBeDefined();
    expect(paths['/api/v1/admin/backups/{filename}/download']?.get).toBeDefined();
    // 认证核心 + MFA 三端点
    expect(paths['/api/v1/auth/login']?.post).toBeDefined();
    expect(paths['/api/v1/auth/mfa/setup']?.post).toBeDefined();
  });

  it('ErrorResponse 壳与 v2 现行壳一致:v1 四字段(timestamp/path/method/requestId)不存在', async () => {
    // 文档不撒谎红线(快照 §6):v1 的错误壳多四个字段,照抄即文档说谎。
    // 注解 401 走 $ref 短语法(components.responses 复用),JSON 形状为 responses['401'].$ref;
    // 解引用目标 ErrorResponse 的形状由下一个用例在 components 层锁定。
    const spec = await fetchSpec();
    const res401 = spec.paths?.['/api/v1/auth/login']?.post?.responses?.['401'] as
      | { $ref?: string; content?: Record<string, unknown> }
      | undefined;
    expect(res401?.$ref).toBe('#/components/responses/Unauthorized');
    const unauthorized = (spec as unknown as {
      components?: { responses?: { Unauthorized?: { content?: { 'application/json'?: { schema?: { $ref?: string } } } } } };
    }).components?.responses?.Unauthorized;
    expect(unauthorized?.content?.['application/json']?.schema?.$ref).toBe('#/components/schemas/ErrorResponse');
  });

  it('components.schemas.ErrorResponse:顶层仅 success/error,error 内仅 code/message/details', async () => {
    const spec = await fetchSpec();
    const schema = (spec as unknown as {
      components?: {
        schemas?: {
          ErrorResponse?: {
            properties?: Record<string, unknown>;
            required?: string[];
            additionalProperties?: boolean;
          };
        };
      };
    }).components?.schemas?.ErrorResponse;
    expect(schema).toBeDefined();
    const topKeys = Object.keys(schema?.properties ?? {}).sort();
    expect(topKeys).toEqual(['error', 'success']);
    // review 修复(批 12 项 11):锁死 v1 四字段漂移防线两要素,防删定义行不红
    expect(schema?.additionalProperties).toBe(false);
    expect(schema?.required).toEqual(expect.arrayContaining(['success', 'error']));
    const errorKeys = Object.keys(
      (schema?.properties?.error as { properties?: Record<string, unknown> } | undefined)?.properties ?? {},
    ).sort();
    expect(errorKeys).toEqual(['code', 'details', 'message']);
  });

  it('components.schemas.SuccessResponse:统一 success+data wrapper(DTO 不裸用)', async () => {
    const spec = await fetchSpec();
    const schema = (spec as unknown as {
      components?: {
        schemas?: {
          SuccessResponse?: { properties?: Record<string, unknown>; required?: string[] };
        };
      };
    }).components?.schemas?.SuccessResponse;
    expect(schema).toBeDefined();
    expect(Object.keys(schema?.properties ?? {}).sort()).toEqual(['data', 'success']);
    expect(schema?.required).toEqual(expect.arrayContaining(['success', 'data']));
  });

  it('错误码枚举覆盖批 11 红线:VAL_001(422)/SYS_003(413)/SYS_001(500) 在 ErrorResponse.code 枚举内', async () => {
    const spec = await fetchSpec();
    const codeEnum = (spec as unknown as {
      components?: {
        schemas?: {
          ErrorResponse?: {
            properties?: { error?: { properties?: { code?: { enum?: string[] } } } };
          };
        };
      };
    }).components?.schemas?.ErrorResponse?.properties?.error?.properties?.code?.enum;
    expect(codeEnum).toEqual(expect.arrayContaining(['VAL_001', 'SYS_003', 'SYS_001']));
  });
});

describe('生产环境不暴露 /api-docs(生产真机 404 由 lead compose 栈验收,此处锁分支逻辑)', () => {
  it("isSwaggerEnabled:仅 production=false(大小写不敏感),development/test/staging 均 true", () => {
    expect(isSwaggerEnabled('production')).toBe(false);
    expect(isSwaggerEnabled('Production')).toBe(false); // 项 9:toLowerCase 防 fail-open
    expect(isSwaggerEnabled('development')).toBe(true);
    expect(isSwaggerEnabled('test')).toBe(true);
    expect(isSwaggerEnabled('staging')).toBe(true);
  });

  it('server.ts 挂载段被 isSwaggerEnabled guard 包裹(源码文本断言,防删 guard 仍绿)', () => {
    // review 修复(批 12,双轴同发现):原用例用测试自写 if 副本,属 tautology——删 server.ts
    // 的 guard 依旧绿。改源码文本断言;server.ts 为 CRLF,只用单行 phrase includes,不做多行锚点。
    const serverSrc = readFileSync(fileURLToPath(new URL('../server.ts', import.meta.url)), 'utf8');
    const guardLine = 'if (isSwaggerEnabled(env.NODE_ENV)) {';
    const jsonRoute = "app.get('/api-docs/swagger.json'";
    const uiMount = "app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(";
    expect(serverSrc.includes(guardLine)).toBe(true);
    expect(serverSrc.includes(jsonRoute)).toBe(true);
    expect(serverSrc.includes(uiMount)).toBe(true);
    // 顺序锁死:guard 必须先于两处挂载出现(删 guard 则第一断言红;移出 guard 外则顺序断言红)
    const guardIdx = serverSrc.indexOf(guardLine);
    expect(guardIdx).toBeLessThan(serverSrc.indexOf(jsonRoute));
    expect(guardIdx).toBeLessThan(serverSrc.indexOf(uiMount));
  });
});
