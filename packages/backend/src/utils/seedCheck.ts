import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { execSync } from 'node:child_process';

export async function seedCheck(): Promise<void> {
  const adminCount = await prisma.user.count({ where: { role: 'admin' } });
  if (adminCount > 0) {
    logger.info('Admin user exists, skipping seed');
    return;
  }
  logger.info('No admin user found, running seed...');
  execSync('npx prisma db seed', { stdio: 'inherit' });
}
