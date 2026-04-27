// packages/backend/src/utils/sessionCleaner.ts
import cron from 'node-cron';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

/** 清理过期和已消耗超过 30 天的 session §9.5 */
export async function cleanSessions(): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const result = await prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { consumedAt: { not: null, lt: thirtyDaysAgo } },
      ],
    },
  });

  if (result.count > 0) {
    logger.info(`Cleaned ${result.count} expired/consumed sessions`);
  }
}

/** 启动定时清理（每日凌晨 3 点） */
export function startSessionCleaner(): void {
  cleanSessions().catch((err) => logger.error('Session cleanup failed', { error: err.message }));

  cron.schedule('0 3 * * *', () => {
    cleanSessions().catch((err) => logger.error('Session cleanup failed', { error: err.message }));
  });

  logger.info('Session cleaner scheduled (daily at 03:00)');
}
