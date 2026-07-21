import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
import { seedAdmin } from '../src/utils/seedAdmin.js';
import { resolveSqliteUrl } from '../src/utils/sqliteUrl.js';

async function main() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error('DATABASE_URL 未设置（prisma db seed 需通过 prisma CLI 运行，由其注入 .env）');
  const adapter = new PrismaBetterSQLite3({ url: resolveSqliteUrl(rawUrl) });
  const prisma = new PrismaClient({ adapter });
  try {
    const admin = await seedAdmin(prisma);
    console.log(`Seed complete: admin user "${admin.username}" (${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
