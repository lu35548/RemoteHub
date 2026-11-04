// packages/backend/src/test/integration/backup.api.test.ts
// #38 备份集成：真库端到端——手动触发（VACUUM INTO 产物可用性）/ 列表 / 下载防遍历 / 门禁 /
// 通知接线（BACKUP_COMPLETED/FAILED）/ retention 串链 / 相对 URL + 变 CWD 锚定红线（票面 AC）。
// VACUUM INTO 无法被 Prisma mock 验证（libback §2），备份成功路径必须走真库。
import '../helpers/env.js';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PRISMA_BIN = process.platform === 'win32' ? 'prisma.CMD' : 'prisma';
const PRISMA_CLI = path.join(BACKEND_ROOT, 'node_modules', '.bin', PRISMA_BIN);

let b: ServerBootstrap;
let adminToken: string;
let userToken: string;
let userId: string;
let adminUserId: string;
let backupDir: string;
/** setupServerWithDb 之后动态 import 的同代 backupService（resetModules 代际陷阱，notification.api 先例） */
let svc: typeof import('../../utils/backupService.js');

/** 用 Prisma adapter 打开备份产物做只读验证（AC：备份文件可用——SQLite 打开验证表数） */
async function openBackupClient(p: string): Promise<PrismaClient> {
  const adapter = new PrismaBetterSQLite3({ url: `file:${p}` });
  return new PrismaClient({ adapter });
}

beforeAll(async () => {
  // BACKUP_DIR/BACKUP_RETENTION_COUNT 必须在 setupServerWithDb 的 resetModules **之前**入 env：
  // config/env.ts 是 import 期快照，动态 import server 链时才重取。
  backupDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-backup-'));
  process.env.BACKUP_DIR = backupDir;
  process.env.BACKUP_RETENTION_COUNT = '10';

  b = await setupServerWithDb();
  svc = await import('../../utils/backupService.js');

  const hash = bcrypt.hashSync('User123456!', 10);
  const u = await b.prisma.user.create({ data: { username: 'backupuser1', nickname: '备份用户', passwordHash: hash } });
  userId = u.id;
  adminUserId = (await b.prisma.user.findUnique({ where: { username: 'admin' } }))!.id;

  const res = await request(b.app).post('/api/v1/auth/login').send({ username: 'backupuser1', password: 'User123456!' });
  userToken = res.body.data.accessToken;
  adminToken = b.adminToken;
}, 180_000);

afterAll(async () => {
  await teardownServerWithDb(b);
  fs.rmSync(backupDir, { recursive: true, force: true });
});

describe('POST /api/v1/admin/backups（手动触发）', () => {
  it('未认证 → 401', async () => {
    const res = await request(b.app).post('/api/v1/admin/backups');
    expect(res.status).toBe(401);
  });

  it('普通用户 → 403', async () => {
    const res = await request(b.app).post('/api/v1/admin/backups').set('Authorization', `Bearer ${userToken}`);
    expect(res.status).toBe(403);
  });

  it('AC：admin 触发 → 200 + 元数据（大小/时长），产物可被 SQLite 打开且数据非空', async () => {
    // 造可验证数据：备份后产物里必须能查到这行（「备到空库」的反向证明）
    await b.prisma.project.create({ data: { name: '备份验据项目', createdBy: userId, updatedBy: userId } });

    const res = await request(b.app).post('/api/v1/admin/backups').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as { filename: string; sizeBytes: number; durationMs: number };
    expect(data.filename).toMatch(/^backup-\d{8}-\d{6}\.db$/);
    expect(data.sizeBytes).toBeGreaterThan(0);
    expect(data.durationMs).toBeGreaterThanOrEqual(0);

    // 产物落盘 + SQLite 打开验证（AC：表数）+ 数据真实性（projects 表有验据行）
    const p = path.join(backupDir, data.filename);
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.statSync(p).size).toBe(data.sizeBytes);

    const client = await openBackupClient(p);
    try {
      const tables = await client.$queryRaw<Array<{ c: number | bigint }>>`
        SELECT count(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'`;
      expect(Number(tables[0]?.c ?? 0)).toBeGreaterThanOrEqual(7); // 7 model 全量表
      const projects = await client.$queryRaw<Array<{ c: number | bigint }>>`SELECT count(*) AS c FROM projects`;
      expect(Number(projects[0]?.c ?? 0)).toBe(1);
    } finally {
      await client.$disconnect();
    }
  });

  it('通知接线：成功后 admin 收到 BACKUP_COMPLETED（落 NotificationQueue）', async () => {
    const before = await b.prisma.notificationQueue.count({ where: { type: 'BACKUP_COMPLETED' } });
    await request(b.app).post('/api/v1/admin/backups').set('Authorization', `Bearer ${adminToken}`);
    const after = await b.prisma.notificationQueue.count({ where: { type: 'BACKUP_COMPLETED' } });
    expect(after).toBe(before + 1);
    const row = await b.prisma.notificationQueue.findFirst({
      where: { type: 'BACKUP_COMPLETED', userId: adminUserId },
      orderBy: { createdAt: 'desc' },
    });
    expect(row).not.toBeNull();
    const payload = JSON.parse(row!.payload) as Record<string, unknown>;
    expect(typeof payload.filename).toBe('string');
    expect(typeof payload.sizeBytes).toBe('number');
  });

  it('手动触发挂审计：SYSTEM_BACKUP action 落 AuditLog', async () => {
    const before = await b.prisma.auditLog.count({ where: { action: 'SYSTEM_BACKUP' } });
    await request(b.app).post('/api/v1/admin/backups').set('Authorization', `Bearer ${adminToken}`);
    // auditMiddleware 是 setImmediate 异步落库
    await new Promise((r) => setTimeout(r, 50));
    const after = await b.prisma.auditLog.count({ where: { action: 'SYSTEM_BACKUP' } });
    expect(after).toBe(before + 1);
  });

  it('同秒重复触发：均 200（同名覆盖语义——秒级时间戳文件名，后触发顶掉前者），无 tmp 残留', async () => {
    const r1 = await request(b.app).post('/api/v1/admin/backups').set('Authorization', `Bearer ${adminToken}`);
    const r2 = await request(b.app).post('/api/v1/admin/backups').set('Authorization', `Bearer ${adminToken}`);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    // 目录里没有 tmp 残留（rename 完成；rename 前清已存在目标防中断半档）
    expect(fs.readdirSync(backupDir).some((f) => f.endsWith('.tmp'))).toBe(false);
  });
});

describe('GET /api/v1/admin/backups（列表）', () => {
  it('未认证 → 401；普通用户 → 403', async () => {
    expect((await request(b.app).get('/api/v1/admin/backups')).status).toBe(401);
    expect((await request(b.app).get('/api/v1/admin/backups').set('Authorization', `Bearer ${userToken}`)).status).toBe(403);
  });

  it('admin → 列表含本套已产备份，元数据（filename/sizeBytes/createdAt），createdAt desc', async () => {
    const res = await request(b.app).get('/api/v1/admin/backups').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Array<{ filename: string; sizeBytes: number; createdAt: string }>;
    // 前序用例触发 5 次，但秒级时间戳文件名在同秒触发下为**同名覆盖**语义（互测套件亚秒跑完）
    // ——目录文件数 = 不同秒数 ≥ 1；列表完整性由下方「与目录一致」断言保证
    expect(data.length).toBeGreaterThanOrEqual(1);
    for (const item of data) {
      expect(item.filename).toMatch(/^backup-\d{8}-\d{6}\.db$/);
      expect(item.sizeBytes).toBeGreaterThan(0);
      expect(typeof item.createdAt).toBe('string');
    }
    // desc 排序（文件名时间戳字典序 = 时间序）
    const names = data.map((d) => d.filename);
    expect([...names].sort().reverse()).toEqual(names);
    // 目录内无列表外的白名单文件（列表与目录一致）
    const onDisk = fs.readdirSync(backupDir).filter((f) => /^backup-\d{8}-\d{6}\.db$/.test(f));
    expect(names.sort()).toEqual(onDisk.sort());
  });
});

describe('GET /api/v1/admin/backups/:filename/download（下载）', () => {
  it('未认证 → 401；普通用户 → 403', async () => {
    expect((await request(b.app).get('/api/v1/admin/backups/x/download')).status).toBe(401);
    expect((await request(b.app).get('/api/v1/admin/backups/x/download').set('Authorization', `Bearer ${userToken}`)).status).toBe(403);
  });

  it('admin 下载 → 200 attachment，字节与磁盘一致', async () => {
    const list = await request(b.app).get('/api/v1/admin/backups').set('Authorization', `Bearer ${adminToken}`);
    const filename = (list.body.data as Array<{ filename: string }>)[0]!.filename;

    const res = await request(b.app)
      .get(`/api/v1/admin/backups/${encodeURIComponent(filename)}/download`)
      .set('Authorization', `Bearer ${adminToken}`)
      .responseType('arraybuffer');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain(filename);
    const got = Buffer.from(res.body as ArrayBuffer);
    expect(got.equals(fs.readFileSync(path.join(backupDir, filename)))).toBe(true);
  });

  it('路径遍历/非法文件名 → 400 BACKUP_001（白名单先于任何文件系统操作）', async () => {
    const evil = [
      '..%2F..%2Fdev.db',            // 编码穿越：解码后含路径分隔符
      'backup-..%2F..%2Fdev.db',     // 白名单形态前缀 + 穿越尾巴
      'backup-20260924-020000.db.tmp',
      '.gitignore',
    ];
    for (const name of evil) {
      const res = await request(b.app)
        .get(`/api/v1/admin/backups/${name}/download`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
      expect(res.body.error?.code).toBe('BACKUP_001');
    }
  });

  it('白名单形态但不存在 → 404 BACKUP_002', async () => {
    const res = await request(b.app)
      .get('/api/v1/admin/backups/backup-20990101-000000.db/download')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('BACKUP_002');
  });
});

describe('备份失败路径（函数级：backupDir 指向文件 → mkdir 失败）', () => {
  it('失败 → 抛错 + admin 收到 BACKUP_FAILED 通知（通知在 service 层接线，cron/手动两入口共用）', async () => {
    const blocker = path.join(backupDir, 'blocker');
    fs.writeFileSync(blocker, 'not a dir');

    const before = await b.prisma.notificationQueue.count({ where: { type: 'BACKUP_FAILED' } });
    await expect(
      svc.createBackup({ backupDir: blocker }), // sourceUrl 默认 env.DATABASE_URL（本套临时库，源校验通过）
    ).rejects.toThrow();
    const after = await b.prisma.notificationQueue.count({ where: { type: 'BACKUP_FAILED' } });
    expect(after).toBe(before + 1);

    fs.rmSync(blocker, { force: true });
  });
});

describe('retention 串链（手动触发后顺带轮转 + tmp 清理）', () => {
  it('目录预放 tmp 残留 → 触发备份后 tmp 被清、正式备份在列', async () => {
    fs.writeFileSync(path.join(backupDir, 'backup-20200101-000000.db.tmp'), 'partial');
    const res = await request(b.app).post('/api/v1/admin/backups').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(fs.existsSync(path.join(backupDir, 'backup-20200101-000000.db.tmp'))).toBe(false);
    expect(fs.existsSync(path.join(backupDir, (res.body.data as { filename: string }).filename))).toBe(true);
  });

  it('AC：轮转保最新 N 份（函数级精准断言，4 份 + 1 tmp → keep 2）', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-retention-'));
    try {
      for (const n of ['backup-20260101-000000.db', 'backup-20260102-000000.db', 'backup-20260103-000000.db', 'backup-20260104-000000.db']) {
        fs.writeFileSync(path.join(dir, n), 'x');
      }
      fs.writeFileSync(path.join(dir, 'backup-20260105-000000.db.tmp'), 'partial');
      const removed = await svc.applyRetention(dir, 2);
      expect(removed).toBe(3);
      expect(fs.readdirSync(dir).sort()).toEqual(['backup-20260103-000000.db', 'backup-20260104-000000.db']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('AC 红线：相对 URL + 变 CWD（源库锚定分支真触发——防 setupTestDb 绝对 URL 空转绿）', () => {
  it('sourceUrl 相对 + CWD 在别处 → 源锚定 prisma/ 真库，备份产物非空', async () => {
    const relName = `rel-backup-${process.pid}-${Date.now()}.db`;
    const relUrl = `file:./${relName}`;
    // prisma CLI 相对 URL 锚定 schema 目录 → 产物落在 prisma/ 下（与 resolveSqliteUrl 同语义）
    execSync(`"${PRISMA_CLI}" migrate deploy --schema prisma/schema.prisma`, {
      cwd: BACKEND_ROOT,
      env: { ...process.env, DATABASE_URL: relUrl },
      stdio: 'pipe',
    });
    const absPath = path.join(BACKEND_ROOT, 'prisma', relName);
    expect(fs.existsSync(absPath)).toBe(true);

    // 控制变量：连接用绝对 URL（隔离「adapter 按 CWD 解析」的老坑），只让 sourceUrl 走相对
    const adapter = new PrismaBetterSQLite3({ url: `file:${absPath}` });
    const client = new PrismaClient({ adapter });
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-rel-backup-'));
    const origCwd = process.cwd();
    try {
      process.chdir(os.tmpdir()); // CWD 远离 backend——不锚定则源路径按 CWD 解析必不存在
      const result = await svc.createBackup({ prismaClient: client, sourceUrl: relUrl, backupDir: outDir });
      expect(fs.existsSync(result.path)).toBe(true);
      const verify = await openBackupClient(result.path);
      try {
        const tables = await verify.$queryRaw<Array<{ c: number | bigint }>>`
          SELECT count(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '_prisma_migrations'`;
        expect(Number(tables[0]?.c ?? 0)).toBeGreaterThanOrEqual(7); // 备的是锚定真库，不是 CWD 下凭空出现的空库
      } finally {
        await verify.$disconnect();
      }
    } finally {
      process.chdir(origCwd);
      await client.$disconnect();
      for (const s of ['', '-wal', '-shm', '-journal']) fs.rmSync(absPath + s, { force: true });
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
