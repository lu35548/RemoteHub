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

describe('输入净化中间件 integration（supertest + 真库）', () => {
  it('场景1：projects name 含 script 标签 → 201 且入库值已剥离', async () => {
    const uniq = Date.now().toString().slice(-6);
    const res = await request(b.app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ name: `<script>alert(1)</script>标记${uniq}` });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // 直查库坐实入库值已剥离（而非仅响应脱敏）
    const row = await b.prisma.project.findUnique({ where: { name: `标记${uniq}` } });
    expect(row).not.toBeNull();
    expect(row?.name).toBe(`标记${uniq}`);
  });

  it('场景2：name 含 SQL 注入模式 → 422 VAL_001 中文消息', async () => {
    const res = await request(b.app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ name: "' OR 1=1 --" });
    expect(res.status).toBe(422);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('VAL_001');
    expect(res.body.error.message).toBe('输入验证失败');
  });

  it('场景3：notes 含命令注入形态 → 201 原样保存（豁免字段，落在 Connection 上）', async () => {
    const uniq = Date.now().toString().slice(-6);
    const proj = await request(b.app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ name: `净化豁免项目${uniq}` });
    expect(proj.status).toBe(201);
    const projectId = proj.body.data.id;

    const notes = `ssh user@host && ls -la --color ${uniq}`;
    const res = await request(b.app)
      .post('/api/v1/connections')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ projectId, name: `净化豁免主机${uniq}`, host: '10.0.0.8', protocol: 'SSH', notes });
    expect(res.status).toBe(201);
    const row = await b.prisma.connection.findUnique({ where: { id: res.body.data.id } });
    expect(row?.notes).toBe(notes);
  });

  it('场景4：GET query 含注入模式 → 422（Express 5 下 defineProperty 覆写 req.query 的真实 HTTP 层证据）', async () => {
    const res = await request(b.app)
      .get("/api/v1/audit-logs?userId=' OR 1=1 --")
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VAL_001');
  });

  it('场景5：GET query 合法值 → 200 正常消费（覆写不破坏 query 读取）', async () => {
    const res = await request(b.app)
      .get('/api/v1/audit-logs?action=AUTH_LOGIN&page=1&pageSize=5')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
