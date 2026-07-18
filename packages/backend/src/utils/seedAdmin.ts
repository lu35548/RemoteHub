import type { PrismaClient } from '@prisma/client';
import { hashPassword } from './password.js';
import { env } from '../config/env.js';

/**
 * 建/更新 admin 用户（idempotent）。接收外部 prisma（确保在 driver adapter + WAL 之下执行）。
 * 供 server.ts 启动 ensureAdminSeed 与 prisma/seed.ts 复用。§1.9
 */
export async function seedAdmin(prisma: PrismaClient) {
  const username = env.ADMIN_USERNAME;
  const password = env.ADMIN_PASSWORD;

  const admin = await prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      username,
      nickname: '系统管理员',
      passwordHash: await hashPassword(password),
      role: 'admin',
      isActive: true,
    },
  });

  return { username: admin.username, id: admin.id };
}
