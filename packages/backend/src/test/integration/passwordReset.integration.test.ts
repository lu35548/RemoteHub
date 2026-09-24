// packages/backend/src/test/integration/passwordReset.integration.test.ts
// 票 #28 集成：自助流 + admin 代重置全链路（supertest + 真库）。
// 限流预算（MemoryStore 按进程内 limiter 实例计）：
// - per-IP 3 次/h：每个 forgot 请求带唯一 X-Forwarded-For（trust proxy 1 → req.ip=XFF 末跳），
//   仅专项用例故意撞同 IP 触发 429
// - per-user 5 次/24h（硬编码常量）：同 username 至多 6 次调用，第 6 次 429
process.env.FRONTEND_URL = 'http://test-fe.local';
process.env.RATE_LIMIT_FORGOT_PASSWORD_MAX = '3';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import { setupServerWithDb, teardownServerWithDb } from '../helpers/serverBootstrap.js';

let b: Awaited<ReturnType<typeof setupServerWithDb>>;

beforeAll(async () => {
  b = await setupServerWithDb();
  // 造两个业务用户：resetuser（完整重置流）+ capuser（上限/限流序列）
  const admin = { Authorization: `Bearer ${b.adminToken}` };
  await request(b.app).post('/api/v1/auth/register').set(admin)
    .send({ username: 'resetuser', nickname: '重置流用户', password: 'ResetUser1' });
  await request(b.app).post('/api/v1/auth/register').set(admin)
    .send({ username: 'capuser', nickname: '配额用户', password: 'CapUser12' });
}, 120_000);

afterAll(async () => {
  await teardownServerWithDb(b);
});

/** sha256 hex（与后端同族哈希，直接插过期 token 行用） */
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

describe('密码重置集成（票 #28）', () => {
  it('A1 自助流：未知用户 → 200 统一响应（不暴露存在性），不建 token 行', async () => {
    const res = await request(b.app)
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', '198.51.100.1')
      .send({ username: 'ghost_user' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(await b.prisma.passwordResetToken.count()).toBe(0);
  });

  it('A2 自助流：已知用户 → 200 + 建 1 行有效 token（1h 过期）', async () => {
    const res = await request(b.app)
      .post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', '198.51.100.2')
      .send({ username: 'resetuser' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const rows = await b.prisma.passwordResetToken.findMany({ where: { user: { username: 'resetuser' } } });
    expect(rows).toHaveLength(1);
    const lifetime = rows[0]!.expiresAt.getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(50 * 60_000);
    expect(lifetime).toBeLessThanOrEqual(70 * 60_000);
  });

  it('A3 admin 代重置：非 admin 403 / 未知用户 404 USER_002', async () => {
    await request(b.app).post('/api/v1/auth/register').set('Authorization', `Bearer ${b.adminToken}`)
      .send({ username: 'plainuser', nickname: '普通用户', password: 'PlainUser1' });
    const login = await request(b.app).post('/api/v1/auth/login')
      .send({ username: 'plainuser', password: 'PlainUser1' });
    const plainToken = login.body.data.accessToken as string;

    const res403 = await request(b.app)
      .post('/api/v1/admin/users/nonexistent-id/reset-link')
      .set('Authorization', `Bearer ${plainToken}`);
    expect(res403.status).toBe(403);
    expect(res403.body.error.code).toBe('AUTH_003');


    const res404 = await request(b.app)
      .post('/api/v1/admin/users/nonexistent-id/reset-link')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res404.status).toBe(404);
    expect(res404.body.error.code).toBe('USER_002');
  });


  it('A4 admin 代重置链接成功：200 + 链接格式（FRONTEND_URL + /reset-password?token=64hex）', async () => {
    const user = await b.prisma.user.findUnique({ where: { username: 'resetuser' } });
    const res = await request(b.app)
      .post(`/api/v1/admin/users/${user!.id}/reset-link`)
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const link: string = res.body.data.resetLink;
    expect(link).toMatch(/^http:\/\/test-fe\.local\/reset-password\?token=[0-9a-f]{64}$/);
  });



  it('A5 完整重置流：改密生效 + session 全撤 + token 标记 used', async () => {
    const user = await b.prisma.user.findUnique({ where: { username: 'resetuser' } });
    const admin = { Authorization: `Bearer ${b.adminToken}` };

    // 用户先登录建 session（重置后必须全撤）
    const before = await request(b.app).post('/api/v1/auth/login')
      .send({ username: 'resetuser', password: 'ResetUser1' });
    expect(before.status).toBe(200);
    const sessionsBefore = await b.prisma.session.count({ where: { userId: user!.id } });
    expect(sessionsBefore).toBeGreaterThanOrEqual(1);

    // admin 生成一次性链接
    const linkRes = await request(b.app)
      .post(`/api/v1/admin/users/${user!.id}/reset-link`)
      .set(admin)
      .send({});
    expect(linkRes.status).toBe(200);
    const token = (linkRes.body.data.resetLink as string).split('token=')[1];

    // 执行重置
    const reset = await request(b.app).post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'NewPass456' });
    expect(reset.status).toBe(200);
    expect(reset.body).toEqual({ success: true });

    // 旧密码 401 / 新密码 200
    const oldLogin = await request(b.app).post('/api/v1/auth/login')
      .send({ username: 'resetuser', password: 'ResetUser1' });
    expect(oldLogin.status).toBe(401);
    const newLogin = await request(b.app).post('/api/v1/auth/login')
      .send({ username: 'resetuser', password: 'NewPass456' });
    expect(newLogin.status).toBe(200);

    // session 全撤（重置后、新登录前为 0）
    const sessionsAfter = await b.prisma.session.count({ where: { userId: user!.id } });
    expect(sessionsAfter).toBe(1); // 仅剩新登录建的 session
    // token 已标记 usedAt
    const used = await b.prisma.passwordResetToken.findFirst({
      where: { userId: user!.id, usedAt: { not: null } },
    });
    expect(used).not.toBeNull();

    // token 复用 → 401 RESET_001
    const reuse = await request(b.app).post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'NewPass789' });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('RESET_001');
  });

  it('A6 过期 token → 401 RESET_001（直插过期行）', async () => {
    const user = await b.prisma.user.findUnique({ where: { username: 'resetuser' } });
    await b.prisma.passwordResetToken.create({
      data: {
        userId: user!.id,
        tokenHash: sha256('expired-raw-token'),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    const res = await request(b.app).post('/api/v1/auth/reset-password')
      .send({ token: 'expired-raw-token', newPassword: 'Whatever1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('RESET_001');
  });

  it('A7 弱新密码 → 422 VAL_001 且 token 不被消费', async () => {
    const user = await b.prisma.user.findUnique({ where: { username: 'resetuser' } });
    const linkRes = await request(b.app)
      .post(`/api/v1/admin/users/${user!.id}/reset-link`)
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({});
    const token = (linkRes.body.data.resetLink as string).split('token=')[1];

    const res = await request(b.app).post('/api/v1/auth/reset-password')
      .send({ token, newPassword: 'short' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VAL_001');
    // token 未被消费（usedAt 仍为 null）
    const row = await b.prisma.passwordResetToken.findFirst({
      where: { userId: user!.id, usedAt: null },
    });
    expect(row).not.toBeNull();
  });

  it('A8 每用户 24h 5 次：capuser 6 连发，第 6 次 429；前 3 建满后静默 200 不再新建', async () => {
    const user = await b.prisma.user.findUnique({ where: { username: 'capuser' } });
    const forgot = (i: number) => request(b.app).post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', `198.51.201.${i}`)
      .send({ username: 'capuser' });

    // 1-3：建满 3 个有效 token
    for (let i = 1; i <= 3; i++) {
      const r = await forgot(i);
      expect(r.status).toBe(200);
    }
    expect(await b.prisma.passwordResetToken.count({ where: { userId: user!.id, usedAt: null } })).toBe(3);

    // 4-5：已届上限 → 静默 200（自助流不暴露存在性），行数保持 3
    for (let i = 4; i <= 5; i++) {
      const r = await forgot(i);
      expect(r.status).toBe(200);
    }
    expect(await b.prisma.passwordResetToken.count({ where: { userId: user!.id, usedAt: null } })).toBe(3);

    // 6：per-user 24h 配额耗尽 → 429 RATE_LIMIT
    const r6 = await forgot(6);
    expect(r6.status).toBe(429);
    expect(r6.body.error.code).toBe('RATE_LIMIT');
  });

  it('A9 每 IP 3 次/h：同 XFF 第 4 次 429', async () => {
    const forgot = (n: string) => request(b.app).post('/api/v1/auth/forgot-password')
      .set('X-Forwarded-For', '198.51.202.9')
      .send({ username: n });
    for (const n of ['nolimitA', 'nolimitB', 'nolimitC']) {
      const r = await forgot(n);
      expect(r.status).toBe(200);
    }
    const r4 = await forgot('nolimitD');
    expect(r4.status).toBe(429);
    expect(r4.body.error.code).toBe('RATE_LIMIT');
  });

  it('A10 审计：reset 系 action 落库 + resetLink 脱敏', async () => {
    // setImmediate 异步落库，先等一拍
    await new Promise((r) => setTimeout(r, 100));

    // 自助流（security 域）：A2/A8/A9 多次 forgot + A5 的 reset-password 执行
    const forgotCount = await b.prisma.auditLog.count({
      where: { action: 'AUTH_PASSWORD_RESET_REQUEST', resource: 'security' },
    });
    expect(forgotCount).toBeGreaterThanOrEqual(1);

    // admin 代重置（user 域，resourceId=目标用户）
    const adminReq = await b.prisma.auditLog.findFirst({
      where: { action: 'AUTH_PASSWORD_RESET_REQUEST', resource: 'user' },
      orderBy: { createdAt: 'desc' },
    });
    expect(adminReq).not.toBeNull();
    expect(adminReq!.resourceId).toBe((await b.prisma.user.findUnique({ where: { username: 'resetuser' } }))!.id);

    // reset-password 执行落 AUTH_PASSWORD_RESET（security 域）
    const execCount = await b.prisma.auditLog.count({
      where: { action: 'AUTH_PASSWORD_RESET', resource: 'security' },
    });
    expect(execCount).toBeGreaterThanOrEqual(1);

    // admin reset-link 响应体进审计 detail.after 时 resetLink 必须已脱敏
    const adminReq2 = await b.prisma.auditLog.findFirst({
      where: { action: 'AUTH_PASSWORD_RESET_REQUEST', resource: 'user', result: 'success' },
      orderBy: { createdAt: 'desc' },
    });
    const detail = JSON.parse(adminReq2!.detail!);
    expect(detail.after.resetLink).toBe('[REDACTED]');
    // detail 中不含任何未脱敏链接痕迹（若泄漏会带 token= 明文）
    expect(adminReq2!.detail).not.toContain('token=');
  });
});
