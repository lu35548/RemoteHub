import { describe, it, expect, afterEach, vi } from 'vitest';
import { setupTestDb } from '../helpers/testDb.js';

// 真实 SQLite migration 在并行满载（如 root pnpm -r test）下可能超过默认 5s，放宽到 15s
vi.setConfig({ testTimeout: 15_000 });

const instances: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (instances.length) await instances.pop()!();
});

describe('schema 约束（真实 SQLite）', () => {
  it('migrate deploy 建出 5 张表', async () => {
    const { prisma, cleanUp } = await setupTestDb();
    instances.push(cleanUp);
    const tables = await prisma.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_prisma_%'
    `;
    const names = tables.map((t) => t.name).sort();
    expect(names).toEqual(['connections', 'project_members', 'projects', 'sessions', 'users']);
  });

  it('@@unique([projectId, name]) 抛 P2002', async () => {
    const { prisma, cleanUp } = await setupTestDb();
    instances.push(cleanUp);
    await prisma.project.create({ data: { id: 'p1', name: 'dup', createdBy: 'u1', updatedBy: 'u1' } });
    await expect(
      prisma.project.create({ data: { id: 'p2', name: 'dup', createdBy: 'u1', updatedBy: 'u1' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('user→session onDelete Cascade', async () => {
    const { prisma, cleanUp } = await setupTestDb();
    instances.push(cleanUp);
    await prisma.user.create({ data: { id: 'u1', username: 'a', nickname: 'A', passwordHash: 'h', role: 'user' } });
    await prisma.session.create({ data: { id: 's1', userId: 'u1', tokenHash: 't', expiresAt: new Date() } });
    await prisma.user.delete({ where: { id: 'u1' } });
    expect(await prisma.session.count()).toBe(0);
  });

  it('connection 自引用 requiredVpnId onDelete SetNull', async () => {
    const { prisma, cleanUp } = await setupTestDb();
    instances.push(cleanUp);
    await prisma.project.create({ data: { id: 'p1', name: 'proj', createdBy: 'u1', updatedBy: 'u1' } });
    await prisma.connection.create({ data: { id: 'c1', projectId: 'p1', name: 'vpn', host: 'h', protocol: 'VPN', createdBy: 'u1', updatedBy: 'u1' } });
    await prisma.connection.create({ data: { id: 'c2', projectId: 'p1', name: 'ssh', host: 'h', protocol: 'SSH', requiredVpnId: 'c1', createdBy: 'u1', updatedBy: 'u1' } });
    await prisma.connection.delete({ where: { id: 'c1' } });
    const c2 = await prisma.connection.findUnique({ where: { id: 'c2' } });
    expect(c2?.requiredVpnId).toBeNull();
  });
});
