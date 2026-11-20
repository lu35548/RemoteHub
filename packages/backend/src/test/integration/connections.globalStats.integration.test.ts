// 批 13b 票 A4：全局协议分布聚合端点 GET /api/v1/connections/stats。
// 聚合范围=该用户可见的**活跃项目**（非 ARCHIVED；admin 全部活跃项目 / 非 admin=已加入项目，
// 对齐 listProjects 可见性口径）的全部分连接；形状对齐 shared ConnectionStats { protocols, tags }。
// Express 参数路由陷阱：/stats 注册于 /:id 之前（否则被参数路由吞掉——/stats 可达即顺序正确，
// 本测试隐式锁死该顺序）。
// 限流前置（projects.management 先例）
process.env.RATE_LIMIT_REGISTER_MAX = '1000';
process.env.RATE_LIMIT_LOGIN_MAX = '1000';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

let b: ServerBootstrap;
let viewerToken = '';
let outsiderToken = '';
let proj1Id = '';
let proj2Id = '';
let proj3Id = '';
let arcProjId = '';

beforeAll(async () => {
  b = await setupServerWithDb();

  async function mkProject(token: string, name: string): Promise<string> {
    const res = await request(b.app).post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`).send({ name });
    expect(res.status).toBe(201);
    return res.body.data.id as string;
  }
  async function mkConn(token: string, projectId: string, body: Record<string, unknown>) {
    const res = await request(b.app).post('/api/v1/connections')
      .set('Authorization', `Bearer ${token}`).send({ projectId, ...body });
    expect(res.status).toBe(201);
  }

  // 三活跃项目（admin 建）+ 一归档项目
  proj1Id = await mkProject(b.adminToken, `全局stats-P1-${Date.now()}`);
  proj2Id = await mkProject(b.adminToken, `全局stats-P2-${Date.now()}`);
  proj3Id = await mkProject(b.adminToken, `全局stats-P3-${Date.now()}`);
  arcProjId = await mkProject(b.adminToken, `全局stats-ARC-${Date.now()}`);

  // viewer：P1/P2 成员；outsider：仅 P3 owner
  async function registerUser(prefix: string, nickname: string): Promise<string> {
    const uniq = Date.now().toString().slice(-6) + Math.floor(Math.random() * 1000);
    const reg = await request(b.app)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${b.adminToken}`)
      .send({ username: `${prefix}${uniq}`, password: 'Member123!', nickname });
    expect(reg.status).toBe(201);
    const login = await request(b.app).post('/api/v1/auth/login')
      .send({ username: `${prefix}${uniq}`, password: 'Member123!' });
    return login.body.data.accessToken as string;
  }
  viewerToken = await registerUser('gview', '全局stats观察员');
  const viewerId = (await b.prisma.user.findFirstOrThrow({ where: { nickname: '全局stats观察员' } })).id;
  await b.prisma.projectMember.create({ data: { projectId: proj1Id, userId: viewerId, role: 'viewer' } });
  await b.prisma.projectMember.create({ data: { projectId: proj2Id, userId: viewerId, role: 'viewer' } });

  outsiderToken = await registerUser('gout', '全局stats局外人');
  const outsiderId = (await b.prisma.user.findFirstOrThrow({ where: { nickname: '全局stats局外人' } })).id;
  await b.prisma.projectMember.create({ data: { projectId: proj3Id, userId: outsiderId, role: 'owner' } });

  // P1：SSH×2（tags 交叠）+ P2：RDP+VNC + P3：TODESK（设备码协议） + ARC：SSH（tags 'prod'）
  await mkConn(b.adminToken, proj1Id, { name: 'G1', host: 'g1.example.com', username: 'op', protocol: 'SSH', tags: 'prod' });
  await mkConn(b.adminToken, proj1Id, { name: 'G2', host: 'g2.example.com', username: 'op', protocol: 'SSH', tags: 'prod,core' });
  await mkConn(b.adminToken, proj2Id, { name: 'G3', host: 'g3.example.com', username: 'op', protocol: 'RDP', tags: 'core' });
  await mkConn(b.adminToken, proj2Id, { name: 'G4', host: 'g4.example.com', username: 'op', protocol: 'VNC' });
  await mkConn(b.adminToken, proj3Id, { name: 'G5', host: 'g5.example.com', username: 'op', protocol: 'TODESK' });
  await mkConn(b.adminToken, arcProjId, { name: 'GARC', host: 'garc.example.com', username: 'op', protocol: 'SSH', tags: 'prod' });

  // ARC 归档（admin 直通）
  const archiveRes = await request(b.app).post(`/api/v1/projects/${arcProjId}/archive`)
    .set('Authorization', `Bearer ${b.adminToken}`).send({});
  expect(archiveRes.status).toBe(200);
}, 240_000);

afterAll(() => teardownServerWithDb(b));

describe('GET /api/v1/connections/stats（全局协议分布）', () => {
  async function fetchStats(token: string) {
    const res = await request(b.app).get('/api/v1/connections/stats')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    return res.body.data as { protocols: Record<string, number>; tags: Record<string, number> };
  }

  it('admin：全部活跃项目聚合（归档项目不计入）——protocols/tags 计数正确', async () => {
    expect(await fetchStats(b.adminToken)).toEqual({
      protocols: { SSH: 2, TODESK: 1, RDP: 1, VNC: 1 },
      tags: { prod: 2, core: 2 },
    });
  });

  it('viewer：可见范围=P1∪P2 成员项目聚合（可见性口径对齐 listProjects）', async () => {
    expect(await fetchStats(viewerToken)).toEqual({
      protocols: { SSH: 2, RDP: 1, VNC: 1 },
      tags: { prod: 2, core: 2 },
    });
  });

  it('非成员：只见自己可见范围（P3 的 1 条 TODESK）', async () => {
    expect(await fetchStats(outsiderToken)).toEqual({
      protocols: { TODESK: 1 },
      tags: {},
    });
  });

  it('未认证 401', async () => {
    const res = await request(b.app).get('/api/v1/connections/stats');
    expect(res.status).toBe(401);
  });

  it('归档动态：restore ARC 后计数含其连接；再 archive 复原排除', async () => {
    // 基线（ARC archived：排除）
    expect((await fetchStats(b.adminToken)).protocols).toEqual({ SSH: 2, TODESK: 1, RDP: 1, VNC: 1 });

    await b.prisma.project.update({ where: { id: arcProjId }, data: { status: 'active' } });
    expect((await fetchStats(b.adminToken)).protocols).toEqual({ SSH: 3, TODESK: 1, RDP: 1, VNC: 1 });

    await b.prisma.project.update({ where: { id: arcProjId }, data: { status: 'archived' } });
    expect((await fetchStats(b.adminToken)).protocols).toEqual({ SSH: 2, TODESK: 1, RDP: 1, VNC: 1 });
  });
});
