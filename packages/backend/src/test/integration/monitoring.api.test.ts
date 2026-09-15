// 票 #20 P0-6 integration：健康检查五字段 + /admin 监控端点门禁与结构（supertest + 真库）
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;

/** admin 建 user → 登录拿 user token（audit.api.test.ts 先例）。 */
async function loginUserToken(): Promise<string> {
  const uniq = Date.now().toString().slice(-6);
  const reg = await request(b.app)
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${b.adminToken}`)
    .send({ username: `mon${uniq}`, password: 'Member123!', nickname: '监控员' });
  expect(reg.status).toBe(201);
  const login = await request(b.app).post('/api/v1/auth/login')
    .send({ username: `mon${uniq}`, password: 'Member123!' });
  return login.body.data.accessToken as string;
}

beforeAll(async () => {
  b = await setupServerWithDb();
}, 120_000);

afterAll(() => teardownServerWithDb(b));

describe('GET /api/v1/health', () => {
  it('200 五字段（Docker healthcheck 只看状态码；200 体带 degraded 矩阵数值）', async () => {
    const res = await request(b.app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Object.keys(res.body.data).sort()).toEqual(
      ['database', 'diskUsage', 'memoryUsage', 'status', 'uptime'],
    );
    expect(['healthy', 'degraded']).toContain(res.body.data.status);
    expect(res.body.data.database).toBe(true);
  });

  // DB 挂 → 503 分支不在此造（真库场景无法注入 DB 宕机）；degraded 矩阵由 unit 层固化
});

describe('GET /api/v1/admin/dashboard', () => {
  it('未认证 401', async () => {
    const res = await request(b.app).get('/api/v1/admin/dashboard');
    expect(res.status).toBe(401);
  });

  it('非 admin 403（AUTH_003）', async () => {
    const userToken = await loginUserToken();
    const res = await request(b.app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_003');
  });

  it('非 admin 403（stats/users 与 stats/projects 同门槛——AC 三端点实测）', async () => {
    const userToken = await loginUserToken();
    for (const path of ['/api/v1/admin/stats/users', '/api/v1/admin/stats/projects']) {
      const res = await request(b.app).get(path).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('AUTH_003');
    }
  });

  it('admin 200：health 快照 + onlineUsers + stats 三计数 + recentActivity（含 login 落的审计行）', async () => {
    const res = await request(b.app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);

    const { health, onlineUsers, stats, recentActivity } = res.body.data;
    expect(Object.keys(health).sort()).toEqual(['database', 'diskUsage', 'memoryUsage', 'status', 'uptime']);
    expect(typeof onlineUsers).toBe('number');
    expect(stats).toEqual({
      totalProjects: expect.any(Number),
      totalConnections: expect.any(Number),
      totalUsers: expect.any(Number),
    });
    expect(Array.isArray(recentActivity)).toBe(true);
    expect(recentActivity.length).toBeGreaterThanOrEqual(1); // beforeAll 登录已落 AUTH_LOGIN 审计
    expect(typeof recentActivity[0].createdAt).toBe('string');
  });
});
