import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/utils/password.js';
import { env } from '../src/config/env.js';

const prisma = new PrismaClient();

async function main() {
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

  console.log(`Seed complete: admin user "${admin.username}" (${admin.id})`);
}

main()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
