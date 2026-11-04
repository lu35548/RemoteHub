// 票 #41 连接金矿 integration：tag 包夹法精确匹配 / q 模糊（含大小写语义）/ sort=lastAccessed
// null 殿后 / stats 聚合正确性 / stats 端点权限门禁（真库锁 SQL 行为——unit 的 where 形状断言测不了语义）
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;
let projectId = '';
let viewerToken = '';
let outsiderToken = '';

/** 注册并登录拿普通用户 token（monitoring.api.test.ts 先例）。 */
async function loginUserToken(prefix: string): Promise<string> {
  const uniq = Date.now().toString().slice(-6);
  const reg = await request(b.app)
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${b.adminToken}`)
    .send({ username: `${prefix}${uniq}`, password: 'Member123!', nickname: '连接测试员' });
  expect(reg.status).toBe(201);
  const login = await request(b.app).post('/api/v1/auth/login')
    .send({ username: `${prefix}${uniq}`, password: 'Member123!' });
  return login.body.data.accessToken as string;
}

/** 连接形状（lastAccessed/updatedAt 显式指定锁排序断言；Prisma @updatedAt 允许显式覆盖） */
interface SeedConn {
  id: string;
  name: string;
  host: string;
  username: string;
  protocol: string;
  tags: string | null;
  lastAccessed: Date | null;
  updatedAt: Date;
}

const T0 = new Date('2026-01-01T00:00:00.000Z');
const SEEDS: SeedConn[] = [
  // tag=test 应命中：单值 / 首段 / 尾段；不应命中：xtest 前缀（防子串误命中 AC）、NULL tags
  { id: 'c1', name: 'Web Server', host: '192.168.1.10', username: 'root', protocol: 'SSH', tags: 'test', lastAccessed: new Date('2026-01-10T00:00:00.000Z'), updatedAt: new Date(T0.getTime() + 1) },
  { id: 'c2', name: 'DB Primary', host: '192.168.1.11', username: 'admin', protocol: 'RDP', tags: 'test,test2', lastAccessed: new Date('2026-02-01T00:00:00.000Z'), updatedAt: new Date(T0.getTime() + 2) },
  { id: 'c3', name: 'Backup Host', host: '192.168.1.12', username: 'dba', protocol: 'SSH', tags: 'xtest,test2', lastAccessed: null, updatedAt: new Date(T0.getTime() + 3) },
  { id: 'c4', name: 'Monitoring', host: '192.168.1.13', username: 'monitor', protocol: 'VNC', tags: 'test2,test', lastAccessed: new Date('2026-01-20T00:00:00.000Z'), updatedAt: new Date(T0.getTime() + 4) },
  { id: 'c5', name: 'Dev Box', host: '192.168.1.14', username: 'dev', protocol: 'SSH', tags: null, lastAccessed: null, updatedAt: new Date(T0.getTime() + 5) },
  // 空片段（stats 剔除断言用）
  { id: 'c6', name: 'Legacy Jump', host: '192.168.1.15', username: 'ops', protocol: 'SSH', tags: 'prod,,web', lastAccessed: null, updatedAt: new Date(T0.getTime() + 6) },
  // review 补：三段串中段形态（锁四条件 OR 的 contains ',tag,' 中段命中分支）
  { id: 'c7', name: 'CI Runner', host: '192.168.1.16', username: 'ci', protocol: 'SSH', tags: 'prod,test,web', lastAccessed: new Date('2026-01-05T00:00:00.000Z'), updatedAt: new Date(T0.getTime() + 7) },
];

beforeAll(async () => {
  b = await setupServerWithDb();

  // 造数：项目 + viewer 成员 + 连接六条（直接 prisma 造——tags 原始形状不受 API 校验干扰）
  const viewerReg = await request(b.app)
    .post('/api/v1/auth/register')
    .set('Authorization', `Bearer ${b.adminToken}`)
    .send({ username: `goldview${Date.now().toString().slice(-6)}`, password: 'Member123!', nickname: '金矿观察员' });
  expect(viewerReg.status).toBe(201);
  const viewerLogin = await request(b.app).post('/api/v1/auth/login')
    .send({ username: viewerReg.body.data.username, password: 'Member123!' });
  viewerToken = viewerLogin.body.data.accessToken as string;
  const viewerId = viewerLogin.body.data.user.id as string;

  const admin = await b.prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });
  const project = await b.prisma.project.create({
    data: { name: `金矿项目-${Date.now()}`, icon: 'folder', createdBy: admin.id, updatedBy: admin.id },
  });
  projectId = project.id;
  await b.prisma.projectMember.create({
    data: { projectId, userId: viewerId, role: 'viewer' },
  });

  for (const s of SEEDS) {
    await b.prisma.connection.create({
      data: {
        id: s.id, projectId, name: s.name, host: s.host, port: 22,
        username: s.username, encryptedPass: null, protocol: s.protocol,
        tags: s.tags, lastAccessed: s.lastAccessed, updatedAt: s.updatedAt,
        createdBy: admin.id, updatedBy: admin.id,
      },
    });
  }

  outsiderToken = await loginUserToken('goldout');
}, 120_000);

afterAll(() => teardownServerWithDb(b));

// ─── AC1a：tag 精确匹配（包夹法）───

describe('GET /api/v1/connections?tag=（包夹法精确匹配）', () => {
  it('tag=test → 命中单值/首段/中段/尾段，不命中 xtest 前缀与 NULL tags（防 test 命中 test2 的反向即防 test 命中 xtest）', async () => {
    const res = await request(b.app)
      .get(`/api/v1/connections?tag=test`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    const names = res.body.data.map((c: { name: string }) => c.name);
    expect(names.sort()).toEqual(['CI Runner', 'DB Primary', 'Monitoring', 'Web Server']);
    // c3（xtest,test2）与 c5（NULL）不在结果；c4（test2,test）以尾段命中；c7（prod,test,web）以中段 contains ',test,' 命中
  });

  it('tag=test2 → 命中首段/中段/尾段（c2 尾段、c3 尾段、c4 首段），tag=test 的行不因 test 前缀误命中', async () => {
    const res = await request(b.app)
      .get(`/api/v1/connections?tag=test2`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    const names = res.body.data.map((c: { name: string }) => c.name);
    expect(names.sort()).toEqual(['Backup Host', 'DB Primary', 'Monitoring']);
  });

  it('tag=test + projectId → 与项目过滤叠加，total 与 data 一致', async () => {
    const res = await request(b.app)
      .get(`/api/v1/connections?tag=test&projectId=${projectId}&page=1&pageSize=2`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toEqual({ page: 1, pageSize: 2, total: 4 });
  });

  it('tag 无一命中 → 空列表 total=0', async () => {
    const res = await request(b.app)
      .get(`/api/v1/connections?tag=nosuchtag`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });
});

// ─── AC1b：q 模糊（name/host/username）───

describe('GET /api/v1/connections?q=（三字段模糊）', () => {
  it('q 命中 name（web → Web Server；SQLite LIKE ASCII 大小写不敏感 → WEB 同样命中，与 v1 ILIKE 语义对齐）', async () => {
    for (const q of ['web', 'WEB']) {
      const res = await request(b.app)
        .get(`/api/v1/connections?q=${q}`)
        .set('Authorization', `Bearer ${b.adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.map((c: { name: string }) => c.name)).toEqual(['Web Server']);
    }
  });

  it('q 命中 host（192.168.1.13 → Monitoring）', async () => {
    const res = await request(b.app)
      .get(`/api/v1/connections?q=192.168.1.13`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { name: string }) => c.name)).toEqual(['Monitoring']);
  });

  it('q 命中 username（dba → Backup Host；username NULL 的行不因 q 崩溃——本轮全有 username，空结果用例锁行为）', async () => {
    const res = await request(b.app)
      .get(`/api/v1/connections?q=dba`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { name: string }) => c.name)).toEqual(['Backup Host']);
  });

  it('q + tag 叠加（q=web 命中 1 条且其 tags 含 test → tag=test&q=web 仍 1 条；tag=prod&q=web → 0 条）', async () => {
    const hit = await request(b.app)
      .get(`/api/v1/connections?tag=test&q=web`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(hit.status).toBe(200);
    expect(hit.body.data.map((c: { name: string }) => c.name)).toEqual(['Web Server']);

    const miss = await request(b.app)
      .get(`/api/v1/connections?tag=prod&q=web`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(miss.status).toBe(200);
    expect(miss.body.pagination.total).toBe(0);
  });
});

// ─── AC1c：sort=lastAccessed（null 容忍排序）───

describe('GET /api/v1/connections?sort=lastAccessed', () => {
  it('最近访问优先 + 从未访问（NULL）殿后；NULL 组内按 updatedAt desc 次序稳定', async () => {
    const res = await request(b.app)
      .get(`/api/v1/connections?sort=lastAccessed&projectId=${projectId}`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    // 有 lastAccessed 的降序：c2(02-01) > c4(01-20) > c1(01-10) > c7(01-05)；NULL 殿后按 updatedAt desc：c6 > c5 > c3
    expect(res.body.data.map((c: { name: string }) => c.name)).toEqual([
      'DB Primary', 'Monitoring', 'Web Server', 'CI Runner', 'Legacy Jump', 'Dev Box', 'Backup Host',
    ]);
  });

  it('缺省 sort → 维持 updatedAt desc 默认序', async () => {
    const res = await request(b.app)
      .get(`/api/v1/connections?projectId=${projectId}`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { name: string }) => c.name)).toEqual([
      'CI Runner', 'Legacy Jump', 'Dev Box', 'Monitoring', 'Backup Host', 'DB Primary', 'Web Server',
    ]);
  });
});

// ─── AC2：stats 聚合正确性 + 权限门禁 ───

describe('GET /api/v1/projects/:id/connections/stats', () => {
  it('admin 200：协议计数 + 标签拆分计数（空片段剔除、NULL 跳过）', async () => {
    const res = await request(b.app)
      .get(`/api/v1/projects/${projectId}/connections/stats`)
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({
      protocols: { SSH: 5, RDP: 1, VNC: 1 },
      tags: { test: 4, test2: 3, xtest: 1, prod: 2, web: 2 },
    });
  });

  it('项目成员 viewer 200（「admin/项目成员」含 viewer）', async () => {
    const res = await request(b.app)
      .get(`/api/v1/projects/${projectId}/connections/stats`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.protocols).toEqual({ SSH: 5, RDP: 1, VNC: 1 });
  });

  it('非项目成员 403（AUTH_003）', async () => {
    const res = await request(b.app)
      .get(`/api/v1/projects/${projectId}/connections/stats`)
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AUTH_003');
  });

  it('未认证 401', async () => {
    const res = await request(b.app)
      .get(`/api/v1/projects/${projectId}/connections/stats`);
    expect(res.status).toBe(401);
  });

  it('项目不存在：admin → 404 PROJ_002（非 admin 由成员门拦为 403）', async () => {
    const adminRes = await request(b.app)
      .get('/api/v1/projects/nonexistent/connections/stats')
      .set('Authorization', `Bearer ${b.adminToken}`);
    expect(adminRes.status).toBe(404);
    expect(adminRes.body.error.code).toBe('PROJ_002');

    const viewerRes = await request(b.app)
      .get('/api/v1/projects/nonexistent/connections/stats')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(viewerRes.status).toBe(403);
  });
});
