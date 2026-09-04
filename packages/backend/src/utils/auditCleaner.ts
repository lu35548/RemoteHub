// packages/backend/src/utils/auditCleaner.ts
// 审计日志保留期清理：遵循 sessionCleaner 既有模式（node-cron + catch 日志），
// 但按票面「仅定时——不启动即清」（6 月修订案），与 sessionCleaner 的启动即清刻意不同。
import cron from 'node-cron';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

/** 删除 createdAt 早于保留期（AUDIT_RETENTION_DAYS，默认 90 天）的审计日志，返回删除计数。 */
export async function cleanAuditLogs(): Promise<number> {
  const cutoff = new Date(Date.now() - env.AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  const result = await prisma.auditLog.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  if (result.count > 0) {
    logger.info(`Cleaned ${result.count} audit logs (retention ${env.AUDIT_RETENTION_DAYS}d)`);
  }
  return result.count;
}

/** 每日 03:30 清理，仅注册定时任务，不在启动时立即执行。 */
export function startAuditCleaner(): void {
  cron.schedule('30 3 * * *', () => {
    cleanAuditLogs().catch((err) => logger.error('Audit cleanup failed', { error: err.message }));
  });

  logger.info('Audit cleaner scheduled (daily at 03:30)');
}
