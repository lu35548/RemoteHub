import '../test/helpers/env.js'; // 环境前置（probeRoutes→monitoringService 链拉起 config/env.ts，CI 无 .env）
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// router seam：mock service 层注入 readiness（真库 integration 无法注入 DB 宕机——票面纪律）
// importOriginal 保底：getSystemHealth 等其余导出保持真实现，只替换 getReadiness
vi.mock('../services/monitoringService.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/monitoringService.js')>();
  return { ...actual, getReadiness: vi.fn() };
});

import { getReadiness } from '../services/monitoringService.js';
import { probeRoutes } from './probeRoutes.js';

const mockedReadiness = vi.mocked(getReadiness);

// Express 5（router@2.x）的 Router 不能直接当 http handler——套一层 app 挂载（healthRoutes.test 同款）
let app: Express;
beforeEach(() => {
  vi.clearAllMocks();
  app = express();
  app.use('/', probeRoutes);
});

describe('GET /healthz - liveness（进程活，恒 200）', () => {
  it('依赖全挂（mock 返回 unready）也恒 200 {status:"ok"}，且不探测任何依赖（getReadiness 零调用）', async () => {
    mockedReadiness.mockResolvedValue({ ready: false, database: false, diskUsage: -1 });

    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(mockedReadiness).not.toHaveBeenCalled();
  });
});

describe('GET /readyz - readiness（database 可用且磁盘低于阈值）', () => {
  it('ready → 200 {status:"ready",database,diskUsage}（探针惯例裸壳，无 {success} 包装）', async () => {
    mockedReadiness.mockResolvedValue({ ready: true, database: true, diskUsage: 75 });

    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', database: true, diskUsage: 75 });
    expect(res.body.success).toBeUndefined();
  });

  it('database:false → 503 {status:"unready",database:false,diskUsage}', async () => {
    mockedReadiness.mockResolvedValue({ ready: false, database: false, diskUsage: -1 });

    const res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unready', database: false, diskUsage: -1 });
  });

  it('磁盘越阈值（ready:false 而 database:true）→ 503，体保留 database:true 便于诊断区分', async () => {
    mockedReadiness.mockResolvedValue({ ready: false, database: true, diskUsage: 97 });

    const res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ status: 'unready', database: true, diskUsage: 97 });
  });

  it('diskUsage -1（探测未知）由 service 判 ready → 200（未知不阻断口径在 service 层锁定）', async () => {
    mockedReadiness.mockResolvedValue({ ready: true, database: true, diskUsage: -1 });

    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready', database: true, diskUsage: -1 });
  });
});
