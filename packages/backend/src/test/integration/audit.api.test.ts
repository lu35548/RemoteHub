import '../helpers/env.js'; // 环境前置必须第一个 import（vitest 不加载 .env）
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb } from '../helpers/testDb.js';
import { seedAdmin } from '../../utils/seedAdmin.js';

// server 链上 config/env.ts 在 import 时构建快照、prisma 单例随之连库——
// server 必须在 DATABASE_URL 指向临时库之后**动态 import**（audit.middleware.test.ts 同款骨架）。
let app: Express;
let prisma: PrismaClient;
let serverPrisma: PrismaClient;
let cleanUp: () => Promise<void>;
let adminToken: string;

beforeAll(async () => {
  const t = await setupTestDb();
  prisma = t.prisma;
  cleanUp = t.cleanUp;
  process.env.DATABASE_URL = t.url;

  vi.resetModules();
  (globalThis as Record<string, unknown>).prisma = undefined;

  const server = await import('../../server.js');
  app = server.app;
  serverPrisma = (await import('../../utils/prisma.js')).prisma;

  await seedAdmin(prisma);
  const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'Admin123456!' });
  adminToken = res.body.data.accessToken;
  // migrate deploy 冷启动（Defender 首扫/CI 慢机）可超默认 10s
}, 120_000);

afterAll(async () => {
  await serverPrisma?.$disconnect(); // server 单例也连着临时库，Windows 下先断开才能删文件
  await cleanUp?.();
});

/** 直接插库造审计行（不经中间件，查询/导出的输入数据）。userId 省略（外键可空）。 */
async function seedAuditLog(overrides: Record<string, unknown> = {}) {
  return prisma.auditLog.create({
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

    const res = await request(app)
      .get('/api/v1/audit-logs?action=PROJECT_CREATE&page=1&pageSize=2')
      .set('Authorization', `Bearer ${adminToken}`);
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
    const reg = await request(app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: `audq${uniq}`, password: 'Member123!', nickname: '审计查询员' });
    expect(reg.status).toBe(201);

    const login = await request(app).post('/api/v1/auth/login')
      .send({ username: `audq${uniq}`, password: 'Member123!' });
    const userToken = login.body.data.accessToken;

    const res = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_003');
  });

  it('场景3：result=failure 只返回失败记录（独立列 where，spec 修正表 #15 动因）', async () => {
    await seedAuditLog({ action: 'AUTH_LOGIN', resource: 'security', resourceId: null, result: 'failure', detail: JSON.stringify({ reason: 'AUTH_001' }) });
    // 场景1 已有 3 条 success，不干扰 failure 过滤

    const res = await request(app)
      .get('/api/v1/audit-logs?result=failure')
      .set('Authorization', `Bearer ${adminToken}`);
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

    const res = await request(app)
      .get('/api/v1/audit-logs/export')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');

    const lines = res.text.split('\n');
    expect(lines[0]).toBe('id,action,resource,resourceId,userId,ip,userAgent,detail,createdAt');
    expect(lines[1]).toContain('"a,b ""q"" c"');
    expect(lines[1]).toContain('"{""k"":""v,1""}"');
  });

  it('场景5：无效枚举参数 → 400 AUDIT_001（audit-logs 与 export 同语义）', async () => {
    const res = await request(app)
      .get('/api/v1/audit-logs?action=HACK')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('AUDIT_001');

    const res2 = await request(app)
      .get('/api/v1/audit-logs/export?result=warn')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res2.status).toBe(400);
    expect(res2.body.error.code).toBe('AUDIT_001');
  });
});
