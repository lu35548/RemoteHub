import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
import { env } from '../config/env.js';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

function createPrisma(): PrismaClient {
  const adapter = new PrismaBetterSQLite3({ url: env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrisma();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
