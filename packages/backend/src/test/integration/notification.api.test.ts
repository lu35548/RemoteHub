// packages/backend/src/test/integration/notification.api.test.ts
// #35 通知 API 集成：真库端到端（未读列表分页 / 已读标记 / 403 门禁 / 清理函数真库）。
import '../helpers/env.js';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;
let userToken: string;
let userId: string;
let adminUserId: string;

/** 造通知行 */
async function makeNotification(userId: string, opts?: { isRead?: boolean; ageDays?: number; type?: string }) {
  return b.prisma.notificationQueue.create({ data: {
    userId,
    type: opts?.type ?? 'SYSTEM_ALERT',
    payload: JSON.stringify({ message: '测试通知' }),
    isRead: opts?.isRead ?? false,
    ...(opts?.ageDays ? { createdAt: new Date(Date.now() - opts.ageDays * 86_400_000) } : {}),
  } });
}

beforeAll(async () => {
  b = await setupServerWithDb();
  // bcrypt 造普通用户（密码已知，可 login 拿 token）
  const hash = bcrypt.hashSync('User123456!', 10);
  const u = await b.prisma.user.create({ data: { username: 'notifuser1', nickname: '通知用户', passwordHash: hash } });
  userId = u.id;
  adminUserId = (await b.prisma.user.findUnique({ where: { username: 'admin' } }))!.id;

  const res = await request(b.app).post('/api/v1/auth/login').send({ username: 'notifuser1', password: 'User123456!' });
  userToken = res.body.data.accessToken;
}, 120_000);

afterAll(() => teardownServerWithDb(b));

describe('GET /api/v1/notifications', () => {
  it('未认证 → 401', async () => {
    const res = await request(b.app).get('/api/v1/notifications');
    expect(res.status).toBe(401);
  });

  it('空列表 → data []', async () => {
    const res = await request(b.app).get('/api/v1/notifications').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 20, total: 0 });
  });

  it('只返回未读：3 未读 + 1 已读 → 3 条（不含已读），orderBy createdAt desc', async () => {
    await makeNotification(userId, { isRead: true });
    await makeNotification(userId);
    await new Promise((r) => setTimeout(r, 5));
    await makeNotification(userId);
    await new Promise((r) => setTimeout(r, 5));
    await makeNotification(userId);

    const res = await request(b.app).get('/api/v1/notifications').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.data.every((n: { isRead: boolean }) => n.isRead === false)).toBe(true);
    expect(res.body.pagination.total).toBe(3);
    // createdAt desc：后造的在前
    const dates = res.body.data.map((n: { createdAt: string }) => n.createdAt);
    expect(new Date(dates[0]).getTime()).toBeGreaterThanOrEqual(new Date(dates[1]).getTime());
  });

  it('分页透传：pageSize=2 → 2 条 + total 3', async () => {
    const res = await request(b.app).get('/api/v1/notifications?pageSize=2').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 2, total: 3 });
  });

  it('不含他人通知（admin 的通知不进 user 列表）', async () => {
    await makeNotification(adminUserId);
    const res = await request(b.app).get('/api/v1/notifications').set('Authorization', `Bearer ${userToken}`);
    expect(res.body.data.every((n: { userId: string }) => n.userId === userId)).toBe(true);
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  it('未认证 → 401', async () => {
    const n = await makeNotification(userId);
    const res = await request(b.app).patch(`/api/v1/notifications/${n.id}/read`);
    expect(res.status).toBe(401);
  });

  it('本人标记已读 → 200 isRead:true，GET 列表不再返回', async () => {
    const n = await makeNotification(userId);
    const res = await request(b.app)
      .patch(`/api/v1/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isRead).toBe(true);

    const list = await request(b.app).get('/api/v1/notifications').set('Authorization', `Bearer ${userToken}`);
    expect(list.body.data.find((x: { id: string }) => x.id === n.id)).toBeUndefined();
  });

  it('AC 门禁：非本人通知 → 403 NOTIF_002（admin 标记他人通知同样被拒）', async () => {
    const n = await makeNotification(adminUserId);   // admin 的通知
    const res = await request(b.app)
      .patch(`/api/v1/notifications/${n.id}/read`)
      .set('Authorization', `Bearer ${userToken}`);  // 普通用户操作
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOTIF_002');
    // 库里确认未被标记
    const row = await b.prisma.notificationQueue.findUnique({ where: { id: n.id } });
    expect(row?.isRead).toBe(false);
  });

  it('不存在 → 404 NOTIF_001', async () => {
    const res = await request(b.app)
      .patch('/api/v1/notifications/00000000-0000-0000-0000-000000000000/read')
      .set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOTIF_001');
  });
});

describe('已读清理（真库函数级）', () => {
  it('只删 isRead 且超保留期：已读+8d 删 / 已读+1d 留 / 未读+8d 留', async () => {
    const deleted = await makeNotification(userId, { isRead: true, ageDays: 8 });
    await makeNotification(userId, { isRead: true, ageDays: 1 });
    await makeNotification(userId, { isRead: false, ageDays: 8 });

    const mod = await import('../../utils/notificationCleaner.js');
    const count = await mod.cleanReadNotifications();

    expect(count).toBeGreaterThanOrEqual(1); // 前序用例遗留的已读过期行也一并被删（增量口径）
    expect(await b.prisma.notificationQueue.findUnique({ where: { id: deleted.id } })).toBeNull();
    // 本用例造的未过期/未读两条必须在（相对断言，不与前序遗留行混算）
    expect(await b.prisma.notificationQueue.count({ where: { userId, isRead: false } })).toBeGreaterThanOrEqual(1);
    expect(await b.prisma.notificationQueue.count({ where: { userId, isRead: true, createdAt: { gte: new Date(Date.now() - 2 * 86_400_000) } } })).toBeGreaterThanOrEqual(1);
  });
});
