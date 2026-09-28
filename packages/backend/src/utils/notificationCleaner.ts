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

/** 每日 04:00 清理（design §8.6：与 session 03:00 / 审计 03:30 / 备份 02:00 错峰），仅定时——不启动即清。 */
export function startNotificationCleaner(): void {
  cron.schedule('0 4 * * *', () => {
    cleanReadNotifications().catch((err) => logger.error('Notification cleanup failed', { error: err.message }));
  });

  logger.info('Notification cleaner scheduled (daily at 04:00)');
}
