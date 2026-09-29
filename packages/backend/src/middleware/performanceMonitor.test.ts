// 票 #32 P1-5 unit：性能监控中间件（小 express app + supertest，不连 DB）。
// 重点断言「路由模板聚合」与「零业务侵入」：模板化防高基数、白名单豁免、unmatched 固定桶。
import '../test/helpers/env.js'; // 环境前置必须先于其余 import（performanceMonitor → ipMonitor → prisma → config/env.ts，vitest 不加载 .env，CI 必崩；照 ipMonitor.test.ts 先例）
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { performanceMonitorMiddleware } from './performanceMonitor.js';
import { getPerformanceStats, resetPerformanceStats } from '../utils/performanceStats.js';

function buildApp() {
  const app = express();
  app.use(performanceMonitorMiddleware);
  app.get('/api/v1/things/:id', (_req, res) => res.json({ ok: true }));
  app.get('/api/v1/boom', (_req, _res, next) => next(new Error('boom'))); // 500 路径
  app.get('/api/v1/health', (_req, res) => res.json({ ok: true }));
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(500).json({ error: err.message });
  });
  return app;
}

const app = buildApp();

beforeEach(() => resetPerformanceStats());
afterEach(() => resetPerformanceStats());

describe('performanceMonitorMiddleware', () => {
  it('按路由模板聚合：不同 :id 归同一模板桶，原始 URL 不入库', async () => {
    await request(app).get('/api/v1/things/1').expect(200);
    await request(app).get('/api/v1/things/abc-def-123').expect(200);
    const routes = getPerformanceStats().routes;
    expect(routes).toHaveLength(1);
    expect(routes[0]!.route).toBe('/api/v1/things/:id');
    expect(routes[0]!.count).toBe(2);
  });

  it('未匹配路由（404）归 unmatched 固定桶，原始路径不得入库（防高基数）', async () => {
    const marker = `nope-${Date.now()}-xyz`;
    await request(app).get(`/api/v1/${marker}`).expect(404);
    const routes = getPerformanceStats().routes;
    expect(routes).toHaveLength(1);
    expect(routes[0]!.route).toBe('unmatched');
    expect(JSON.stringify(routes)).not.toContain(marker);
  });

  it('非 2xx（500）响应同样被记录（finish 覆盖错误路径）', async () => {
    await request(app).get('/api/v1/boom').expect(500);
    const routes = getPerformanceStats().routes;
    expect(routes).toHaveLength(1);
    expect(routes[0]!.route).toBe('/api/v1/boom');
    expect(routes[0]!.count).toBe(1);
  });

  it('探针/心跳白名单（双形态）不记录：/healthz 与 /api/v1/health 零入库', async () => {
    await request(app).get('/healthz').expect(200);
    await request(app).get('/api/v1/health').expect(200);
    expect(getPerformanceStats().routes).toEqual([]);
  });

  it('零业务侵入：响应体与状态码不受中间件影响', async () => {
    const res = await request(app).get('/api/v1/things/9').expect(200);
    expect(res.body).toEqual({ ok: true });
  });
});
