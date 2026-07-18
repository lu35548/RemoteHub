import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let counter = 0;

/**
 * 建临时 SQLite file + migrate deploy，返回带 adapter 的 prisma 实例。
 * 每次调用独立 db 文件，用完由调用方 cleanUp。§2 验收自动化/D9
 */
export async function setupTestDb(): Promise<{ prisma: PrismaClient; cleanUp: () => Promise<void> }> {
  counter += 1;
  const dbPath = path.join(os.tmpdir(), `remotehub-test-${process.pid}-${counter}-${Date.now()}.db`);
  const url = `file:${dbPath}`;

  // migrate deploy 到临时库
  execSync('pnpm --filter @remotehub/backend exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const adapter = new PrismaBetterSQLite3({ url });
  const prisma = new PrismaClient({ adapter });

  // 开 WAL（与生产一致）
  await prisma.$queryRaw`PRAGMA journal_mode = WAL`;

  return {
    prisma,
    cleanUp: async () => {
      await prisma.$disconnect();
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        const f = dbPath + suffix;
        if (fs.existsSync(f)) fs.rmSync(f);
      }
    },
  };
}
