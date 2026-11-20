// packages/backend/src/utils/notificationCleaner.ts
// #35 已读通知清理：auditCleaner.ts 同款模式（node-cron + catch 日志 + 仅定时——不启动即清）。
import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

/** 删除已读且超过保留期的通知，返回删除计数。 */
export async function cleanReadNotifications(): Promise<number> {
  const cutoff = new Date(Date.now() - env.NOTIFICATION_READ_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const result = await prisma.notificationQueue.deleteMany({
    where: { isRead: true, createdAt: { lt: cutoff } },
  });

  if (result.count > 0) {
    logger.info(`Cleaned ${result.count} read notifications (retention ${env.NOTIFICATION_READ_RETENTION_DAYS}d)`);
  }
  return result.count;
}

/** #54 未读保留上限（票面自建建议值，用户已拍板采纳）：每用户保留最新 200 条未读。 */
export const UNREAD_CAP_PER_USER = 200;

/**
 * #54 未读保留上限：未读超上限的用户，把第 N 条（createdAt desc）之外的更早未读批量转已读。
 * 幂等（重复执行第二次 groupBy 即查不到超限用户）；不删行、不改 payload，只翻 isRead。
 * groupBy 不带 having、结果 JS 侧过滤——绕开 having._count 语法在旧版客户端的类型分叉，
 * 用户量级（内部系统）让 N+1 无压力；id 作次级排序保证同毫秒边界下截断集合稳定。
 */
export async function capUnreadNotifications(): Promise<number> {
  const unreadByUser = await prisma.notificationQueue.groupBy({
    by: ['userId'],
    where: { isRead: false },
    _count: { userId: true },
  });
  const overLimit = unreadByUser.filter((u) => u._count.userId > UNREAD_CAP_PER_USER);

  let total = 0;
  for (const u of overLimit) {
    const stale = await prisma.notificationQueue.findMany({
      where: { userId: u.userId, isRead: false },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: UNREAD_CAP_PER_USER,
      select: { id: true },
    });
    const result = await prisma.notificationQueue.updateMany({
      where: { id: { in: stale.map((s) => s.id) } },
      data: { isRead: true },
    });
    total += result.count;
  }

  if (total > 0) {
    logger.info(`Capped unread notifications: ${total} marked read across ${overLimit.length} user(s) (limit ${UNREAD_CAP_PER_USER}/user)`);
  }
  return total;
}

/** 每日 04:00 清理（design §8.6：与 session 03:00 / 审计 03:30 / 备份 02:00 错峰），仅定时——不启动即清。 */
export function startNotificationCleaner(): void {
  cron.schedule('0 4 * * *', () => {
    cleanReadNotifications().catch((err) => logger.error('Notification cleanup failed', { error: err.message }));
    capUnreadNotifications().catch((err) => logger.error('Unread cap failed', { error: err.message }));
  });

  logger.info('Notification cleaner scheduled (daily at 04:00)');
}
