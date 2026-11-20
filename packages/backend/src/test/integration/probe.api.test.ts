// 票 #33 K8s 探针 integration：真库 readiness 200 / 停库注入 503 / 白名单直通无限流头（supertest + 真库）
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi, type Mock } from 'vitest';

// service 层 mock（importOriginal 保底透传真实现）：真 SQLite 场景无法注入 DB 宕机，
// 停库用例由 mock 注入 ready:false（票面纪律）。工厂里 vi.fn(actual.getReadiness) 默认透传，
// 使「真库 ready」用例走完整真实链路；工厂随 vi.resetModules 重跑，自动绑当前代 actual。
vi.mock('../../services/monitoringService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/monitoringService.js')>();
  return { ...actual, getReadiness: vi.fn(actual.getReadiness) };
});

import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;
// setupServerWithDb 内部 vi.resetModules() 重建模块图——mock 工厂重跑产生新代 vi.fn，
// 须在其后动态 import 拿「同代」实例注入（静态 import 是上一代，注入无效）
let getReadinessMock: Mock;

beforeAll(async () => {
  b = await setupServerWithDb();
  const mod = await import('../../services/monitoringService.js');
  getReadinessMock = vi.mocked(mod.getReadiness) as Mock;
}, 120_000);

afterAll(() => teardownServerWithDb(b));

describe('GET /healthz + GET /readyz（K8s 探针）', () => {
  it('真库在线：healthz 恒 200 {status:"ok"}', async () => {
    const res = await request(b.app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('真库在线：readyz 200 {status:"ready",database:true}（readiness 端到端真实现）', async () => {
    const res = await request(b.app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ready');
    expect(res.body.database).toBe(true);
    expect(typeof res.body.diskUsage).toBe('number');
  });

  it('停库注入：getReadiness → ready:false → readyz 503 / healthz 仍 200（liveness 不受依赖故障牵连）', async () => {
    getReadinessMock.mockResolvedValueOnce({ ready: false, database: false, diskUsage: -1 });

    const readyz = await request(b.app).get('/readyz');
    expect(readyz.status).toBe(503);
    expect(readyz.body).toEqual({ status: 'unready', database: false, diskUsage: -1 });

    const healthz = await request(b.app).get('/healthz');
    expect(healthz.status).toBe(200);
  });

  it('白名单直通：探针响应无 RateLimit 头；对照非白名单端点（/api/v1/projects 401）有头——断言有判别力', async () => {
    for (const path of ['/healthz', '/readyz']) {
      const res = await request(b.app).get(path);
      expect(res.headers['ratelimit-limit']).toBeUndefined();
      expect(res.headers['ratelimit-policy']).toBeUndefined();
    }

    const control = await request(b.app).get('/api/v1/projects'); // 未认证 401，但 generalLimiter 先行加头
    expect(control.status).toBe(401);
    expect(control.headers['ratelimit-limit']).toBeDefined();
  });
});
