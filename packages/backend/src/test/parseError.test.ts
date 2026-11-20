// 批 11 OQ(#50 畸形 JSON 落 500 而非 4xx):body-parser 的 entity.parse.failed 被
// 全局 error handler「非 AppError 一律 500」吞掉,畸形请求体落 500 SYS_001 是错误口径——
// 请求体畸形是客户端 4xx 责任。本文件锁死 4xx 化:400 + 统一错误壳 SYS_004。
// parse 失败在 parser 层即被 next(err) 跳到全局 handler,不触库/限流——unit 纪律同
// swagger.test.ts(helpers/env.js 必须第一个 import,NODE_ENV=test guard 保证 import 不 bootstrap)。
import './helpers/env.js'; // 环境前置:必须第一个 import(先于任何拉起 config/env.ts 的模块链)
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../server.js';

describe('畸形 JSON 落 400(批 11 OQ:#50;原口径非 AppError 一律 500 吞掉 body-parser 400)', () => {
  it('POST /api/v1/auth/login 畸形 JSON → 400 + 统一错误壳 SYS_004', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, error: { code: 'SYS_004', message: '请求体格式错误' } });
  });

  it('不同端点同样命中(全局 handler 单点修复,非 login 专属)', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set('Content-Type', 'application/json')
      .send('not-json-at-all');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SYS_004');
  });
});
