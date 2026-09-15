import '../test/helpers/env.js'; // 环境前置（healthRoutes→monitoringService 链拉起 config/env.ts，CI 无 .env）
import express, { type Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// router seam：mock service 层注入 database:false，测 503 分支（真库 integration 无法注入 DB 宕机）
vi.mock('../services/monitoringService.js', () => ({
  getSystemHealth: vi.fn(),
}));

import { getSystemHealth } from '../services/monitoringService.js';
import { healthRoutes } from './healthRoutes.js';

const mockedHealth = vi.mocked(getSystemHealth);

// Express 5（router@2.x）的 Router 不能直接当 http handler——套一层 app 挂载（server.ts 同款）
let app: Express;
beforeEach(() => {
  vi.clearAllMocks();
  app = express();
  app.use('/', healthRoutes);
});

describe('healthRoutes - 200/503 语义（Docker healthcheck 只看状态码）', () => {
  it('database:true → 200 {success, data 五字段}', async () => {
    mockedHealth.mockResolvedValue({
      status: 'healthy',
      database: true,
      diskUsage: 63.2,
      memoryUsage: 41.5,
      uptime: 42,
    });

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'healthy', database: true, diskUsage: 63.2, memoryUsage: 41.5, uptime: 42 } });
  });

  it('database:false → 503 {success:false, error}（AC「compose 探活不破」押注的分支）', async () => {
    mockedHealth.mockResolvedValue({
      status: 'degraded',
      database: false,
      diskUsage: -1,
      memoryUsage: 41.5,
      uptime: 42,
    });

    const res = await request(app).get('/');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ success: false, error: { code: 'SYS_001', message: '数据库连接失败' } });
  });
});
