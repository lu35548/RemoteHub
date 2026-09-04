import { PrismaClient } from '@prisma/client';
import { PrismaBetterSQLite3 } from '@prisma/adapter-better-sqlite3';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// src/test/helpers/testDb.ts → backend 包根
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PRISMA_BIN = process.platform === 'win32' ? 'prisma.CMD' : 'prisma';
const PRISMA_CLI = path.join(BACKEND_ROOT, 'node_modules', '.bin', PRISMA_BIN);

let dbInstanceCounter = 0;

/**
 * 建临时 SQLite file + migrate deploy，返回带 adapter 的 prisma 实例。
 * 每次调用独立 db 文件，用完由调用方 cleanUp。§2 验收自动化/D9
 *
 * 注：直接调用本地 prisma 二进制（带 --schema），避免在 vitest projects 并行时
 * 嵌套 `pnpm exec` 造成的竞态（曾导致偶发「表不存在」失败）。
 */
export async function setupTestDb(): Promise<{
  prisma: PrismaClient;
  cleanUp: () => Promise<void>;
  /** 临时库 file: URL（绝对路径）——供测试把 DATABASE_URL 指向本库后动态 import server 链 */
  url: string;
}> {
  dbInstanceCounter += 1;
  const dbPath = path.join(os.tmpdir(), `remotehub-test-${process.pid}-${dbInstanceCounter}-${Date.now()}.db`);
  const url = `file:${dbPath}`;

  execSync(`"${PRISMA_CLI}" migrate deploy --schema prisma/schema.prisma`, {
    cwd: BACKEND_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const adapter = new PrismaBetterSQLite3({ url });
  const prisma = new PrismaClient({ adapter });

  // 开 WAL（与生产一致）
  await prisma.$queryRaw`PRAGMA journal_mode = WAL`;

  return {
    prisma,
    url,
    cleanUp: async () => {
      await prisma.$disconnect();
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        const f = dbPath + suffix;
        if (fs.existsSync(f)) fs.rmSync(f);
      }
    },
  };
}
