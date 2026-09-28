// 票 #32 P1-5 integration：/admin/stats/performance 门禁与结构（supertest + 真库）。
// AC：admin 403 门禁实测（非 admin 必 403）；真实请求 → 路由模板聚合自证。
// 计数断言用「包含」而非「等于」（beforeAll 登录/注册等 bootstrap 请求也进统计，总量不稳定）。
import request from 'supertest';
import type { PerformanceStats } from '@remotehub/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;

/** admin 建 user → 登录拿 user token（monitoring.api.test.ts 先例）。 */
async function loginUserToken(): Promise<string> {
  const uniq = Date.now().toString().slice(-6);
  const reg = await request(b.app)
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${b.adminToken}`)
    .send({ username: `perf${uniq}`, password: 'Member123!', nickname: '性能员' });
  expect(reg.status).toBe(201);
  const login = await request(b.app).post('/api/v1/auth/login')
    .send({ username: `perf${uniq}`, password: 'Member123!' });
  return login.body.data.accessToken as string;
}

beforeAll(async () => {
  b = await setupServerWithDb();
}, 120_000);

afterAll(() => teardownServerWithDb(b));

describe('GET /api/v1/admin/stats/performance', () => {
  it('未认证 401', async () => {
    const res = await request(b.app).get('/api/v1/admin/stats/performance');
    expect(res.status).toBe(401);
  });

  it('非 admin 403（AUTH_003）——AC 门禁实测', async () => {
    const userToken = await loginUserToken();
    const res = await request(b.app)
      .get('/api/v1/admin/stats/performance')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_003');
  });

  it('admin 200：结构齐全（PerformanceStats DTO）', async () => {
    const res = await request(b.app)
      .get('/api/v1/admin/stats/performance')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    const data = res.body.data as PerformanceStats;
    expect(Array.isArray(data.routes)).toBe(true);
    expect(data.bufferSize).toBeGreaterThan(0);
    expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
    for (const r of data.routes) {
      expect(typeof r.route).toBe('string');
      expect(r.count).toBeGreaterThan(0);
      expect(r.p50Ms).toBeGreaterThanOrEqual(0);
      expect(r.p95Ms).toBeGreaterThanOrEqual(r.p50Ms);
      expect(r.p99Ms).toBeGreaterThanOrEqual(r.p95Ms);
      expect(r.minMs).toBeLessThanOrEqual(r.p50Ms);
      expect(r.maxMs).toBeGreaterThanOrEqual(r.p99Ms);
    }
  });

  it('自证：真实请求按路由模板聚合入库（登录/注册/本端点自身），:id 级原始 URL 不入库', async () => {
    // 先打几发真实请求（loginUserToken 已产 register+login；401 请求也属真实流量）
    await request(b.app).post('/api/v1/auth/login').send({ username: 'nobody', password: 'BadPass123!' }); // 401
    const res = await request(b.app)
      .get('/api/v1/admin/stats/performance')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);

    const data = res.body.data as PerformanceStats;
    const routeNames = data.routes.map((r) => r.route);
    expect(routeNames).toContain('/api/v1/auth/login');
    expect(routeNames).toContain('/api/v1/auth/register');
    expect(routeNames).toContain('/api/v1/admin/stats/performance'); // 端点自指入库
    // 模板化防高基数：任何路由条目不得携带具体 id/用户名片段
    expect(routeNames.some((r) => /perf\d+|nobody/.test(r))).toBe(false);
  });
});
