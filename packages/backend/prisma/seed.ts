import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
import { seedAdmin } from '../src/utils/seedAdmin.js';
import { resolveSqliteUrl } from '../src/utils/sqliteUrl.js';

async function main() {
  const adapter = new PrismaBetterSQLite3({ url: resolveSqliteUrl(process.env.DATABASE_URL!) });
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
