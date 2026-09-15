import '../test/helpers/env.js'; // 环境前置必须第一个 import（monitoringService 顶层拉起 prisma.ts→config/env.ts，CI 无 .env）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});
// 局部 mock（importOriginal 保底）：winston 等链上模块仍依赖真实 fs.promises/os。
// node:os 的 default 导出是原对象，须显式重建 default（spread 只改命名导出）。
vi.mock('node:os', async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import('node:os') & { default: typeof import('node:os') };
  return { ...actual, default: { ...actual.default, totalmem: vi.fn(), freemem: vi.fn() } };
});
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  statfs: vi.fn(),
}));

import os from 'node:os';
import { statfs } from 'node:fs/promises';
import { prisma as _prisma } from '../utils/prisma.js';
import {
  getDashboard,
  getProjectConnectionStats,
  getSystemHealth,
  getUserActivityStats,
} from './monitoringService.js';

// prisma mock 方法断言用（auditService.test.ts 先例：mock 运行时形状与 PrismaClient 类型不符）
const prisma = _prisma as any;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('getSystemHealth - degraded 判定矩阵（db×mem×disk）', () => {
  it('全绿：db 通 + mem 40% + disk 75% → healthy，五字段齐备（disk 一位小数）', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(os.totalmem).mockReturnValue(1000);
    vi.mocked(os.freemem).mockReturnValue(600); // used 40%
    vi.mocked(statfs).mockResolvedValue({ blocks: 100, bfree: 25 } as never);

    const h = await getSystemHealth();

    expect(h).toEqual({
      status: 'healthy',
      database: true,
      diskUsage: 75,
      memoryUsage: 40,
      uptime: expect.any(Number),
    });
  });

  it('memoryUsage > 90 → degraded（db/disk 正常）', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(os.totalmem).mockReturnValue(1000);
    vi.mocked(os.freemem).mockReturnValue(50); // used 95%
    vi.mocked(statfs).mockResolvedValue({ blocks: 100, bfree: 25 } as never);

    const h = await getSystemHealth();
    expect(h.status).toBe('degraded');
  });

  it('diskUsage > 95 → degraded（db/mem 正常）', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(os.totalmem).mockReturnValue(1000);
    vi.mocked(os.freemem).mockReturnValue(600);
    vi.mocked(statfs).mockResolvedValue({ blocks: 1000, bfree: 30 } as never); // 97%

    const h = await getSystemHealth();
    expect(h.status).toBe('degraded');
    expect(h.diskUsage).toBe(97);
  });

  it('DB 失败：不抛，database:false + degraded（health 端点据此落 503）', async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(new Error('db down'));
    vi.mocked(os.totalmem).mockReturnValue(1000);
    vi.mocked(os.freemem).mockReturnValue(600);
    vi.mocked(statfs).mockResolvedValue({ blocks: 100, bfree: 25 } as never);

    const h = await getSystemHealth();
    expect(h.database).toBe(false);
    expect(h.status).toBe('degraded');
  });

  it('statfs 异常 → diskUsage -1（前端显示「未知」），不影响状态判定', async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(os.totalmem).mockReturnValue(1000);
    vi.mocked(os.freemem).mockReturnValue(600);
    vi.mocked(statfs).mockRejectedValue(new Error('no statfs'));

    const h = await getSystemHealth();
    expect(h.diskUsage).toBe(-1);
    expect(h.status).toBe('healthy');
  });
});

describe('getDashboard', () => {
  it('组装：onlineUsers where gte=now-5min / stats 三计数 / recentActivity take 20 → DTO', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));

    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(os.totalmem).mockReturnValue(1000);
    vi.mocked(os.freemem).mockReturnValue(600);
    vi.mocked(statfs).mockResolvedValue({ blocks: 100, bfree: 25 } as never);

    prisma.user.count
      .mockResolvedValueOnce(3) // onlineUsers
      .mockResolvedValueOnce(7); // totalUsers
    prisma.project.count.mockResolvedValue(4);
    prisma.connection.count.mockResolvedValue(11);
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'a1', userId: 'u1', action: 'AUTH_LOGIN', resource: 'security', resourceId: null,
        result: 'success', detail: null, ip: '10.0.0.1', userAgent: 'ua',
        createdAt: new Date('2026-09-15T11:59:00Z'),
      },
    ]);
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', username: 'admin' }]);

    const d = await getDashboard();

    // onlineUsers 与前端顶栏同口径：lastActiveAt ≥ now − LAST_ACTIVE_THROTTLE_MS(5min)
    expect(prisma.user.count).toHaveBeenCalledWith({
      where: { lastActiveAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } },
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' }, take: 20 });
    expect(d).toEqual({
      health: { status: 'healthy', database: true, diskUsage: 75, memoryUsage: 40, uptime: expect.any(Number) },
      onlineUsers: 3,
      stats: { totalProjects: 4, totalConnections: 11, totalUsers: 7 },
      recentActivity: [
        {
          id: 'a1', username: 'admin', userId: 'u1', action: 'AUTH_LOGIN', resource: 'security', resourceId: null,
          result: 'success', detail: null, ip: '10.0.0.1', userAgent: 'ua',
          createdAt: '2026-09-15T11:59:00.000Z',
        },
      ],
    });
    vi.useRealTimers();
  });

  it('recentActivity username 映射：join user 表；SECURITY_* 行 userId null → username null', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));

    vi.mocked(prisma.$queryRaw).mockResolvedValue([]);
    vi.mocked(os.totalmem).mockReturnValue(1000);
    vi.mocked(os.freemem).mockReturnValue(600);
    vi.mocked(statfs).mockResolvedValue({ blocks: 100, bfree: 25 } as never);

    prisma.user.count.mockResolvedValue(0);
    prisma.project.count.mockResolvedValue(0);
    prisma.connection.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', username: 'admin' }]);
    prisma.auditLog.findMany.mockResolvedValue([
      {
        id: 'a1', userId: 'u1', action: 'AUTH_LOGIN', resource: 'user', resourceId: null,
        result: 'success', detail: null, ip: null, userAgent: null,
        createdAt: new Date('2026-09-15T11:59:00Z'),
      },
      {
        id: 'a2', userId: null, action: 'SECURITY_SUSPICIOUS_IP', resource: 'security', resourceId: null,
        result: 'failure', detail: null, ip: '10.0.0.1', userAgent: null,
        createdAt: new Date('2026-09-15T11:58:00Z'),
      },
    ]);

    const d = await getDashboard();

    expect(prisma.user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['u1'] } },
      select: { id: true, username: true },
    });
    expect(d.recentActivity[0]!.username).toBe('admin');
    expect(d.recentActivity[1]!.username).toBeNull();
    vi.useRealTimers();
  });
});

describe('getUserActivityStats - 活跃趋势分桶', () => {
  /** 造一条趋势扫描行（select 仅 action+createdAt）。 */
  const trendRow = (action: string, iso: string, result = 'success') => ({ action, result, createdAt: new Date(iso) });

  it('30 天日粒度：logins=AUTH_LOGIN / operations=其余 / failure 不进桶 / 无数据日补零', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-15T12:00:00Z'));

    prisma.auditLog.findMany.mockResolvedValue([
      trendRow('AUTH_LOGIN', '2026-09-15T08:00:00Z'),
      trendRow('AUTH_LOGIN', '2026-09-15T08:05:00Z'),
      trendRow('PROJECT_CREATE', '2026-09-15T09:00:00Z'),
      trendRow('CONNECTION_ACCESS', '2026-09-14T10:00:00Z'),
      trendRow('AUTH_LOGIN', '2026-08-17T06:00:00Z'),
      trendRow('AUTH_LOGIN', '2026-09-13T10:00:00Z', 'failure'), // 分桶层防御：failure 不进桶
    ] as never);

    const stats = await getUserActivityStats();

    // where 用独立 result 列过滤（spec 修正表 #15 受益者）+ 30 天窗口对齐 UTC 日界
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          result: 'success',
          createdAt: { gte: new Date('2026-08-17T00:00:00.000Z') },
        },
        take: 10000,
      }),
    );

    expect(stats).toHaveLength(30);
    expect(stats[0]).toEqual({ date: '2026-08-17', logins: 1, operations: 0 });
    expect(stats[27]).toEqual({ date: '2026-09-13', logins: 0, operations: 0 }); // failure 行不计
    expect(stats[28]).toEqual({ date: '2026-09-14', logins: 0, operations: 1 });
    expect(stats[29]).toEqual({ date: '2026-09-15', logins: 2, operations: 1 });
    expect(stats[1]).toEqual({ date: '2026-08-18', logins: 0, operations: 0 }); // 补零
    vi.useRealTimers();
  });
});

describe('getProjectConnectionStats', () => {
  it('按项目聚合连接数（_count.connections），projectName 映射，name 升序', async () => {
    prisma.project.findMany.mockResolvedValue([
      { id: 'p1', name: 'alpha', _count: { connections: 3 } },
      { id: 'p2', name: 'beta', _count: { connections: 0 } },
    ] as never);

    const stats = await getProjectConnectionStats();

    expect(prisma.project.findMany).toHaveBeenCalledWith({
      select: { id: true, name: true, _count: { select: { connections: true } } },
      orderBy: { name: 'asc' },
    });
    expect(stats).toEqual([
      { projectId: 'p1', projectName: 'alpha', connectionCount: 3 },
      { projectId: 'p2', projectName: 'beta', connectionCount: 0 },
    ]);
  });
});
