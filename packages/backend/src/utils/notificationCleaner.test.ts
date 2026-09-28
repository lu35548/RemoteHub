// packages/backend/src/utils/notificationCleaner.test.ts
// #35 已读清理 cron 函数级测试（auditCleaner 先例：直调函数断言 deleteMany where 条件）。
import '../test/helpers/env.js'; // env 前置（cleaner 链 import config/env.ts，requireEnv 快照需要）
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./prisma.js', () => ({
  prisma: { notificationQueue: { deleteMany: vi.fn().mockResolvedValue({ count: 3 }) } },
}));
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

import cron from 'node-cron';
import { prisma } from './prisma.js';
import { cleanReadNotifications, startNotificationCleaner } from './notificationCleaner.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('startNotificationCleaner', () => {
  it('仅定时（0 4 * * *），不启动即清（auditCleaner 先例同款）', () => {
    startNotificationCleaner();

    expect(vi.mocked(cron.schedule)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cron.schedule)).toHaveBeenCalledWith('0 4 * * *', expect.any(Function));
    expect(prisma.notificationQueue.deleteMany).not.toHaveBeenCalled();
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
