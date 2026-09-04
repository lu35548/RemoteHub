import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { setupServerWithDb, teardownServerWithDb } from '../helpers/serverBootstrap.js';

// migrate deploy 冷启动（Defender 首扫/CI 慢机）可超默认 10s
let b: Awaited<ReturnType<typeof setupServerWithDb>>;

beforeAll(async () => {
  b = await setupServerWithDb();
}, 120_000);

afterAll(async () => {
  await teardownServerWithDb(b);
});

/** 直接插库造审计行（不经中间件，查询/导出的输入数据）。userId 省略（外键可空）。 */
async function seedAuditLog(overrides: Record<string, unknown> = {}) {
  return b.prisma.auditLog.create({
    data: {
      action: 'PROJECT_CREATE',
      resource: 'project',
      resourceId: 'p1',
      result: 'success',
      detail: JSON.stringify({ after: { name: 'x' } }),
      ip: '1.2.3.4*',
      userAgent: 'vitest-agent',
      ...overrides,
    },
  });
}

describe('审计查询/导出 API integration（supertest + 真库）', () => {
  it('场景1：admin 查询 200 返回分页结构（clamp 生效、createdAt 倒序、detail 已解析为对象）', async () => {
    // 用 action 过滤隔离：beforeAll 的 admin 登录本身会产生一条 AUTH_LOGIN 审计
    await seedAuditLog({ action: 'PROJECT_CREATE', resourceId: 's1-a', createdAt: new Date('2026-09-01T00:00:00Z') });
    await seedAuditLog({ action: 'PROJECT_CREATE', resourceId: 's1-b', createdAt: new Date('2026-09-03T00:00:00Z') });
    await seedAuditLog({ action: 'PROJECT_CREATE', resourceId: 's1-c', createdAt: new Date('2026-09-02T00:00:00Z') });

    const res = await request(b.app)
      .get('/api/v1/audit-logs?action=PROJECT_CREATE&page=1&pageSize=2')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 2, total: 3 });
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].resourceId).toBe('s1-b'); // 最新在前（倒序）
    expect(res.body.data[0].detail).toEqual({ after: { name: 'x' } }); // 对象而非 JSON 字符串
    expect(typeof res.body.data[0].createdAt).toBe('string');
  });

  it('场景2：非 admin 403（AUTH_003）', async () => {
    const uniq = Date.now().toString().slice(-6);
    const reg = await request(b.app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ username: `audq${uniq}`, password: 'Member123!', nickname: '审计查询员' });
    expect(reg.status).toBe(201);

    const login = await request(b.app).post('/api/v1/auth/login')
      .send({ username: `audq${uniq}`, password: 'Member123!' });
    const userToken = login.body.data.accessToken;

    const res = await request(b.app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_003');
  });

  it('场景3：result=failure 只返回失败记录（独立列 where，spec 修正表 #15 动因）', async () => {
    await seedAuditLog({ action: 'AUTH_LOGIN', resource: 'security', resourceId: null, result: 'failure', detail: JSON.stringify({ reason: 'AUTH_001' }) });
    // 场景1 已有 3 条 success，不干扰 failure 过滤

    const res = await request(b.app)
      .get('/api/v1/audit-logs?result=failure')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(res.body.data[0].result).toBe('failure');
    expect(res.body.data[0].detail).toEqual({ reason: 'AUTH_001' });
  });

  it('场景4：export 返回 text/csv 附件（header 首行 + 引号转义）', async () => {
    await seedAuditLog({
      action: 'CONNECTION_ACCESS', resource: 'connection', resourceId: 's4-csv',
      userAgent: 'a,b "q" c', // 触发转义
      detail: '{"k":"v,1"}', // detail 原样入 CSV，同样触发转义
    });

    const res = await request(b.app)
      .get('/api/v1/audit-logs/export')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');

    const lines = res.text.split('\n');
    expect(lines[0]).toBe('id,action,resource,resourceId,userId,ip,userAgent,detail,createdAt');
    expect(lines[1]).toContain('"a,b ""q"" c"');
    expect(lines[1]).toContain('"{""k"":""v,1""}"');
  });

  it('场景5：无效枚举参数 → 400 AUDIT_001（audit-logs 与 export 同语义）', async () => {
    const res = await request(b.app)
      .get('/api/v1/audit-logs?action=HACK')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AUDIT_001');

    const res2 = await request(b.app)
      .get('/api/v1/audit-logs/export?result=warn')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe('AUDIT_001');
  });
});
