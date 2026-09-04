import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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

/** 审计经 setImmediate 异步落库（真库写入是异步 promise）：flush 宏任务队列 + 缓冲。 */
async function flushAudit(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 50));
}

describe('审计中间件 integration（supertest + 真库）', () => {
  it('场景1：POST /projects 201 → 落一条 PROJECT_CREATE success（before 无、after 含 name、IP 已掩码）', async () => {
    const res = await request(b.app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ name: '审计集成测试项目', description: '场景1' });
    expect(res.status).toBe(201);

    await flushAudit();
    const rows = await b.prisma.auditLog.findMany({ where: { action: 'PROJECT_CREATE' } });
    expect(rows).toHaveLength(1);

    const row = rows[0]!;
    expect(row.result).toBe('success');
    expect(row.resource).toBe('project');
    expect(row.resourceId).toBe(res.body.data.id);
    expect(row.userId).not.toBeNull();
    expect(row.ip?.endsWith('*')).toBe(true); // 掩码生效（IPv4/IPv6 末段/末组均为 *）

    const detail = JSON.parse(row.detail ?? '{}') as { before?: unknown; after?: { name?: string } };
    expect(detail.before).toBeUndefined(); // POST 无 before 快照
    expect(detail.after?.name).toBe('审计集成测试项目');
  });

  it('场景2：错误密码 login 401 → AUTH_LOGIN failure（detail.reason=AUTH_001、无 after、userId null）', async () => {
    const res = await request(b.app).post('/api/v1/auth/login').send({ username: 'admin', password: 'wrong-password' });
    expect(res.status).toBe(401);

    await flushAudit();
    const rows = await b.prisma.auditLog.findMany({ where: { action: 'AUTH_LOGIN', result: 'failure' } });
    expect(rows).toHaveLength(1);

    const row = rows[0]!;
    expect(row.userId).toBeNull(); // login 未认证端点，userId 为 null（spec 口径）
    const detail = JSON.parse(row.detail ?? '{}') as { reason?: string; after?: unknown };
    expect(detail.reason).toBe('AUTH_001');
    expect(detail.after).toBeUndefined(); // 失败不记 after
  });

  it('场景3：PATCH 改项目名 → PROJECT_UPDATE success（detail.before 旧名 / after 新名，快照自治）', async () => {
    const create = await request(b.app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ name: '改名前项目' });
    const id = create.body.data.id as string;

    const res = await request(b.app)
      .patch(`/api/v1/projects/${id}`)
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ name: '改名后项目' });
    expect(res.status).toBe(200);

    await flushAudit();
    const rows = await b.prisma.auditLog.findMany({ where: { action: 'PROJECT_UPDATE', resourceId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.result).toBe('success');

    const detail = JSON.parse(rows[0]!.detail ?? '{}') as { before?: { name?: string }; after?: { name?: string } };
    expect(detail.before?.name).toBe('改名前项目'); // next() 前自治 findUnique 的旧值
    expect(detail.after?.name).toBe('改名后项目');
  });

  it('场景5：register → USER_CREATE（resourceId=新用户 id）；POST members → MEMBER_ADD（resourceId=projectMember 行 id，非父 projectId）', async () => {
    const uniq = Date.now().toString().slice(-6);

    const reg = await request(b.app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ username: `member${uniq}`, password: 'Member123!', nickname: '成员甲' });
    expect(reg.status).toBe(201);

    const proj = await request(b.app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ name: `成员项目${uniq}` });
    const projectId = proj.body.data.id as string;

    const add = await request(b.app)
      .post(`/api/v1/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ userId: reg.body.data.id, role: 'viewer' });
    expect(add.status).toBe(201);

    await flushAudit();
    const regRow = (await b.prisma.auditLog.findMany({ where: { action: 'USER_CREATE' } }))[0]!;
    expect(regRow.result).toBe('success');
    expect(regRow.resourceId).toBe(reg.body.data.id); // 来自响应体 data.id
    expect(regRow.userId).not.toBeNull(); // 操作者（admin）

    const addRow = (await b.prisma.auditLog.findMany({ where: { action: 'MEMBER_ADD' } }))[0]!;
    expect(addRow.result).toBe('success');
    expect(addRow.resourceId).toBe(add.body.data.id); // projectMember 行 id
    expect(addRow.resourceId).not.toBe(projectId); // 不是挂载点的父资源 id
  });

  it('场景4：审计落库 reject → 主请求仍 201（审计失败不传播）', async () => {
    // 注：mockRestore 会破坏 Prisma delegate 的方法属性（restore 后 create 变 undefined，
    // 殃及后续场景），故保存原函数引用、用 mockImplementation 回落而非 restore。
    const delegate = b.serverPrisma.auditLog;
    const originalCreate = delegate.create.bind(delegate);
    const spy = vi.spyOn(delegate, 'create').mockRejectedValueOnce(new Error('audit db down'));

    const res = await request(b.app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ name: `审计故障注入项目${Date.now().toString().slice(-6)}` });
    expect(res.status).toBe(201); // 主请求不受审计失败影响
    await flushAudit();
    spy.mockImplementation((args) => originalCreate(args));
    expect(typeof delegate.create).toBe('function');
  });

  it('场景6：decrypt-password → CONNECTION_ACCESS，after.password 脱敏为 [REDACTED]（明文不落审计表）', async () => {
    const proj = await request(b.app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ name: `解密脱敏项目${Date.now().toString().slice(-6)}` });

    const conn = await request(b.app)
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ projectId: proj.body.data.id, name: 'rdp-host', host: '192.168.1.100', port: 3389, username: 'admin', password: 'SuperSecret123', protocol: 'RDP' });
    expect(conn.status).toBe(201);

    const dec = await request(b.app)
      .post(`/api/v1/connections/${conn.body.data.id}/decrypt-password`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(dec.status).toBe(200);
    expect(dec.body.data.password).toBe('SuperSecret123'); // 主请求正常返回明文

    await flushAudit();
    const row = (await b.prisma.auditLog.findMany({ where: { action: 'CONNECTION_ACCESS', resourceId: conn.body.data.id } }))[0]!;
    expect(row.result).toBe('success');
    const detail = JSON.parse(row.detail ?? '{}') as { after?: { password?: string } };
    expect(detail.after?.password).toBe('[REDACTED]'); // 审计表中已脱敏
  });

  it('AC：连打 heartbeat 后 auditLog 0 新增（排除实证）', async () => {
    const before = await b.prisma.auditLog.count();
    for (let i = 0; i < 3; i++) {
      const res = await request(b.app).post('/api/v1/auth/heartbeat').set('Authorization', `Bearer ${b.adminToken}`);
      expect(res.status).toBe(200);
    }
    await flushAudit();
    expect(await b.prisma.auditLog.count()).toBe(before);
  });
});
