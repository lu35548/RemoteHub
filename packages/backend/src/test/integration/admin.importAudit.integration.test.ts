// 批 11 OQ(#50 import 403 不留痕):/api/v1/admin/import 的 roleMiddleware 403 拒绝
// 不落审计行,与 backupRoutes POST(auditMiddleware 挂 auth 后,403 同样记 failure)同域
// 不一致(review F4 挂账)。修法:importRoleGate 判定语义与 roleMiddleware('admin') 同构,
// 拒绝时先程序化 writeSystemAudit(SYSTEM_RESTORE failure,detail.reason=AUTH_003,内部
// redactDetail 脱敏对齐 #50 F5)再 next(createAppError('AUTH_003'));响应口径不变(仍 403),
// 只补「谁试图导入」的知情留痕。401 仍不留痕(authMiddleware 即拒,不经 gate——对齐
// auditMiddleware 通道挂 auth 后的既有口径)。审计断言用 action 过滤(登录落 AUTH_LOGIN 行)。
process.env.RATE_LIMIT_LOGIN_MAX = '1000';
import http from 'node:http';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;
let userToken = '';
let userId = '';

/** SYSTEM_RESTORE 审计行查询(action 过滤,勿裸 total——beforeAll 登录落 AUTH_LOGIN 行) */
async function restoreAuditRows(): Promise<Array<{ userId: string; result: string; detail: string }>> {
  const rows = await b.prisma.auditLog.findMany({ where: { action: 'SYSTEM_RESTORE' } });
  return rows as unknown as Array<{ userId: string; result: string; detail: string }>;
}

beforeAll(async () => {
  b = await setupServerWithDb();

  // 普通用户(403 门禁触达)
  const uniq = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
  const reg = await request(b.app)
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${b.adminToken}`)
    .send({ username: `impaudit${uniq}`, password: 'Member123!', nickname: '导入留痕用户' });
  expect(reg.status).toBe(201);
  const login = await request(b.app)
    .post('/api/v1/auth/login')
    .send({ username: `impaudit${uniq}`, password: 'Member123!' });
  expect(login.status).toBe(200);
  userToken = login.body.data.accessToken as string;
  userId = login.body.data.user.id as string;
}, 180_000);

afterAll(async () => {
  await teardownServerWithDb(b);
});

describe('POST /api/v1/admin/import 403 留痕(批 11 OQ:#50)', () => {
  it('普通用户 import → 403,且程序化落 SYSTEM_RESTORE failure 行(留痕对齐 backupRoutes POST)', async () => {
    const before = await restoreAuditRows();
    const res = await request(b.app)
      .post('/api/v1/admin/import')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ version: 1 });
    expect(res.status).toBe(403);

    const after = await restoreAuditRows();
    expect(after.length).toBe(before.length + 1);
    // 取行走 findFirst+非空断言惯例(noUncheckedIndexedAccess 下索引取行恒带 undefined)
    const row = await b.prisma.auditLog.findFirst({
      where: { action: 'SYSTEM_RESTORE', result: 'failure' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    expect(row!.userId).toBe(userId);
    expect(row!.result).toBe('failure');
    expect(JSON.parse(row!.detail as string)).toEqual({ reason: 'AUTH_003' });
  });

  it('未认证 import → 401,不落 SYSTEM_RESTORE 行(401 在 authMiddleware 即拒不经 gate,对齐既有口径)', async () => {
    const before = await restoreAuditRows();
    const res = await request(b.app).post('/api/v1/admin/import').send({ version: 1 });
    expect(res.status).toBe(401);
    const after = await restoreAuditRows();
    expect(after.length).toBe(before.length);
  });
});

describe('chunked 超限兜底(批 13a 裁量:entity.too.large → 413 SYS_003 契约一致)', () => {
  // 与 CL 预检(假 CL 头即拒,批 11 先例)同语义的 chunked 分支必须真实 body 锁死(memory:
  // 超限测试用真实 body)。chunked 无 CL 头,预检放行,50mb parser 读满超限抛 entity.too.large
  // ——原口径被 error handler 吞成 500。supertest .send(stream) 不真发 body(首版实测 422 空载荷),
  // 改 node:http 手工 chunked(不设 CL,Node 自动 Transfer-Encoding: chunked)。
  it('无 CL 真实 51mb 流式 body → 413 SYS_003', async () => {
    const port = await new Promise<number>((resolve, reject) => {
      b.server.once('error', reject);
      b.server.listen(0, () => {
        const a = b.server.address();
        if (a && typeof a === 'object') resolve(a.port);
        else reject(new Error('listen(0) 未返回端口'));
      });
    });
    try {
      const { status, body } = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
        const req = http.request(
          {
            host: '127.0.0.1',
            port,
            path: '/api/v1/admin/import',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${b.adminToken}`,
            },
          },
          (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf8') }));
          },
        );
        req.on('error', reject);
        const chunk = Buffer.alloc(1024 * 1024, 0x61);
        for (let i = 0; i < 51; i++) req.write(chunk);
        req.end();
      });
      expect(status).toBe(413);
      expect(JSON.parse(body).error.code).toBe('SYS_003');
    } finally {
      await new Promise<void>((resolve) => b.server.close(() => resolve()));
    }
  });
});
