// packages/backend/src/utils/notificationCleaner.test.ts
// #35 已读清理 cron 函数级测试（auditCleaner 先例：直调函数断言 deleteMany where 条件）。
// #54 扩展 capUnreadNotifications（未读保留上限 200）：mock prisma 断言 groupBy/skip/updateMany 形状。
import '../test/helpers/env.js'; // env 前置（cleaner 链 import config/env.ts，requireEnv 快照需要）
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./prisma.js', () => ({
  prisma: {
    notificationQueue: {
      deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
      // #54 capUnreadNotifications 依赖三方法（factory 随 import 扩展，缺 key 即 "No export defined on the mock"）
      groupBy: vi.fn().mockResolvedValue([]),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  },
}));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

import cron from 'node-cron';
import { prisma } from './prisma.js';
import { cleanReadNotifications, capUnreadNotifications, UNREAD_CAP_PER_USER, startNotificationCleaner } from './notificationCleaner.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('startNotificationCleaner', () => {
  it('仅定时（0 4 * * *），不启动即清（auditCleaner 先例同款）', () => {
    startNotificationCleaner();

    expect(vi.mocked(cron.schedule)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cron.schedule)).toHaveBeenCalledWith('0 4 * * *', expect.any(Function));
    expect(prisma.notificationQueue.deleteMany).not.toHaveBeenCalled();
    expect(prisma.notificationQueue.groupBy).not.toHaveBeenCalled();
  });
});

describe('cleanReadNotifications', () => {
  it('deleteMany where isRead:true 且 createdAt 早于保留期，返回删除计数', async () => {
    const count = await cleanReadNotifications();

    expect(count).toBe(3);
    expect(prisma.notificationQueue.deleteMany).toHaveBeenCalledTimes(1);
    const arg = (prisma.notificationQueue.deleteMany as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { where: { isRead: boolean; createdAt: { lt: Date } } };
    expect(arg.where.isRead).toBe(true);
    expect(arg.where.createdAt.lt).toBeInstanceOf(Date);
    // 保留期默认 7 天（±1 分钟容忍）
    const days = (Date.now() - arg.where.createdAt.lt.getTime()) / 86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
  });

  it('NOTIFICATION_READ_RETENTION_DAYS=1 → cutoff 收窄到 1 天', async () => {
    process.env.NOTIFICATION_READ_RETENTION_DAYS = '1';
    vi.resetModules();
    const { prisma: p2 } = await import('./prisma.js');
    const { cleanReadNotifications: clean2 } = await import('./notificationCleaner.js');
    const count2 = await clean2();
    expect(count2).toBe(3);
    const arg2 = (p2.notificationQueue.deleteMany as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { where: { isRead: boolean; createdAt: { lt: Date } } };
    const days2 = (Date.now() - arg2.where.createdAt.lt.getTime()) / 86_400_000;
    expect(days2).toBeGreaterThan(0.99);
    expect(days2).toBeLessThan(1.01);
    process.env.NOTIFICATION_READ_RETENTION_DAYS = '';
  });
});

describe('capUnreadNotifications（#54 未读保留上限）', () => {
  it('未读超上限用户：skip=UNREAD_CAP_PER_USER findMany 取更早未读 → updateMany 转已读，返回转换计数', async () => {
    const groupBy = prisma.notificationQueue.groupBy as ReturnType<typeof vi.fn>;
    const findMany = prisma.notificationQueue.findMany as ReturnType<typeof vi.fn>;
    const updateMany = prisma.notificationQueue.updateMany as ReturnType<typeof vi.fn>;
    groupBy.mockResolvedValue([{ userId: 'u1', _count: { userId: 250 } }]);
    findMany.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);
    updateMany.mockResolvedValue({ count: 50 });

    const total = await capUnreadNotifications();

    expect(groupBy).toHaveBeenCalledWith({
      by: ['userId'],
      where: { isRead: false },
      _count: { userId: true },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', isRead: false },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: UNREAD_CAP_PER_USER,
      select: { id: true },
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['old-1', 'old-2'] } },
      data: { isRead: true },
    });
    expect(total).toBe(50);
  });

  it('无人超限（groupBy 全 ≤ 200）→ findMany/updateMany 不被调，返回 0', async () => {
    const findMany = prisma.notificationQueue.findMany as ReturnType<typeof vi.fn>;
    const updateMany = prisma.notificationQueue.updateMany as ReturnType<typeof vi.fn>;
    (prisma.notificationQueue.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { userId: 'u1', _count: { userId: 42 } },
      { userId: 'u2', _count: { userId: 200 } },
    ]);

    const total = await capUnreadNotifications();

    expect(findMany).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(total).toBe(0);
  });

  it('多用户超限逐个处理，计数累加', async () => {
    const groupBy = prisma.notificationQueue.groupBy as ReturnType<typeof vi.fn>;
    const findMany = prisma.notificationQueue.findMany as ReturnType<typeof vi.fn>;
    const updateMany = prisma.notificationQueue.updateMany as ReturnType<typeof vi.fn>;
    groupBy.mockResolvedValue([
      { userId: 'u1', _count: { userId: 205 } },
      { userId: 'u2', _count: { userId: 300 } },
    ]);
    findMany
      .mockResolvedValueOnce([{ id: 'u1-old' }])
      .mockResolvedValueOnce([{ id: 'u2-old-1' }, { id: 'u2-old-2' }, { id: 'u2-old-3' }]);
    updateMany
      .mockResolvedValueOnce({ count: 5 })
      .mockResolvedValueOnce({ count: 297 });

    const total = await capUnreadNotifications();

    expect(total).toBe(302);
    expect(updateMany).toHaveBeenCalledTimes(2);
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: { in: ['u1-old'] } },
      data: { isRead: true },
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: { in: ['u2-old-1', 'u2-old-2', 'u2-old-3'] } },
      data: { isRead: true },
    });
  });
});
