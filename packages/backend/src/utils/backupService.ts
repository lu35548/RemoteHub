// packages/backend/src/utils/backupService.ts
// #38 数据备份（W2-6）：VACUUM INTO 在线一致性快照 + cron 02:00 + 手动触发 + retention 轮转。
//
// 关键设计（libcheck-backup.md 三链路实测结论）：
// - VACUUM INTO 的文件名是标量表达式**可绑定参数**（sqlite.org lang_vacuum §2.1）——走 Prisma
//   `$executeRaw` 模板参数化，零 SQL 注入面；不用 $executeRawUnsafe 拼接（有注入面无收益）。
// - 目标已存在时 SQLite 报错拒绝——写**临时名**成功后 rename：天然绕开冲突，且中断残留的
//   半成品不会顶掉上一次好备份（libback §1.3/§1.4）。
// - 对源库只读、与 WAL 共存、产出 compacted 快照；Prisma adapter 下拿不到裸 Database 句柄，
//   `.backup()` 通道不适用（libback §5 对比，维持 VACUUM INTO 钦定）。
// - 备份元数据不落 manifest（design §7.4 偏离登记）：文件即真相（文件名时间戳 + stat 大小），
//   失败记录走通知（BACKUP_FAILED）+ logger 双通道，避免 manifest 与实际文件不一致的第二真相源。
import cron from 'node-cron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '@prisma/client';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';
import { resolveSqliteUrl } from './sqliteUrl.js';
import { emitToAdmins } from '../services/notificationService.js';

// src/utils/ → backend 包根（备份目录相对路径的锚定基准，参照 sqliteUrl.ts 的 SCHEMA_DIR 模式）
const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 服务端生成的备份文件名形态（下载端点白名单：此形态外一律拒，防路径遍历第一道防线） */
export const BACKUP_FILENAME_RE = /^backup-\d{8}-\d{6}\.db$/;

/** 中断残留的临时文件（retention 顺带清理，libback §1.4） */
const BACKUP_TMP_RE = /^backup-\d{8}-\d{6}\.db\.tmp$/;

export interface BackupResult {
  filename: string;
  /** 产物绝对路径（服务端内部用；HTTP 响应不外露服务器路径） */
  path: string;
  sizeBytes: number;
  durationMs: number;
}

/**
 * 源库绝对路径推导（防「备到空库」的第一道防线）：必须过 resolveSqliteUrl 锚定——
 * dev 下 DATABASE_URL 是相对 `file:./dev.db`，按进程 CWD 解析在 CWD 漂移后会指向
 * 不存在的库文件（better-sqlite3 默认建新空库 → 备出空库还报「成功」）。
 */
export function resolveSourceDbPath(url: string): string {
  const resolved = resolveSqliteUrl(url);
  return resolved.startsWith('file:') ? resolved.slice('file:'.length) : resolved;
}

/** 备份目录锚定：相对路径锚定 backend 根（不随 CWD 漂移），绝对路径原样（容器 /data/backups）。 */
export function resolveBackupDir(dir: string): string {
  return path.isAbsolute(dir) ? dir : path.resolve(BACKEND_ROOT, dir);
}

/** 本地时区时间戳文件名 backup-YYYYMMDD-HHmmss.db（与 cron 02:00 本地时区语义一致） */
function backupFilename(at = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}${p(at.getSeconds())}`;
  return `backup-${stamp}.db`;
}

/**
 * 执行一次备份（cron 02:00 与 admin 手动触发共用同一实现）。
 * 流程：源库存在性校验（锚定后路径）→ 临时名 VACUUM INTO → rename 正式名 → retention 顺带轮转。
 * 成功/失败均 emit 通知给全体 admin（service 层接线，两入口共用；emit 失败只记日志不影响备份结果）。
 * 参数可注入（测试控制变量用），默认取 env + prisma 单例。
 */
export async function createBackup(opts?: {
  prismaClient?: PrismaClient;
  sourceUrl?: string;
  backupDir?: string;
  trigger?: 'manual' | 'cron';
}): Promise<BackupResult> {
  const client = opts?.prismaClient ?? prisma;
  const sourcePath = resolveSourceDbPath(opts?.sourceUrl ?? env.DATABASE_URL);
  const dir = resolveBackupDir(opts?.backupDir ?? env.BACKUP_DIR);
  const trigger = opts?.trigger ?? 'manual';

  const startedAt = Date.now();
  const filename = backupFilename();
  const target = path.join(dir, filename);
  const tmpPath = `${target}.tmp`;

  try {
    // fail-fast：源库文件不存在（相对路径漂移/配置错误）直接报错，绝不静默备出空库
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`源库文件不存在（路径锚定后）: ${sourcePath}`);
    }
    fs.mkdirSync(dir, { recursive: true });

    // 临时名 + $executeRaw 模板参数化（INTO 目标已存在会被 SQLite 拒绝——临时名天然唯一）
    await client.$executeRaw`VACUUM INTO ${tmpPath}`;

    // rename 前清已存在目标（同秒双触发防御；正常时序目标必不存在）
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
    fs.renameSync(tmpPath, target);

    const sizeBytes = fs.statSync(target).size;
    const durationMs = Date.now() - startedAt;

    // retention 顺带（保留最新 N 份 + 清 tmp 残留）；失败不视为备份失败
    try {
      retentionSync(dir, env.BACKUP_RETENTION_COUNT);
    } catch (retentionErr) {
      logger.error('备份后 retention 清理失败（不影响备份结果）', { error: (retentionErr as Error).message });
    }

    logger.info(`Backup completed: ${filename} (${sizeBytes} bytes, ${durationMs}ms, trigger=${trigger})`);
    await notifyAdmins('BACKUP_COMPLETED', { filename, sizeBytes, durationMs, trigger });

    return { filename, path: target, sizeBytes, durationMs };
  } catch (err) {
    // 当场清临时残留（若已产生），防占空间；retention 也会兜底清历史残留
    fs.rmSync(tmpPath, { force: true });
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`Backup failed (trigger=${trigger})`, { error: message, sourcePath });
    await notifyAdmins('BACKUP_FAILED', { error: message, trigger });
    throw err;
  }
}

/** 备份列表：目录实时扫描（文件即真相，无 manifest），文件名时间戳 desc = 时间倒序。 */
export function listBackups(backupDir?: string): Array<{ filename: string; sizeBytes: number; createdAt: string }> {
  const dir = resolveBackupDir(backupDir ?? env.BACKUP_DIR);
  if (!fs.existsSync(dir)) return [];

  return fs
    .readdirSync(dir)
    .filter((f) => BACKUP_FILENAME_RE.test(f))
    .sort((a, b) => b.localeCompare(a)) // 文件名时间戳字典序 = 时间倒序
    .map((filename) => {
      const stat = fs.statSync(path.join(dir, filename));
      return { filename, sizeBytes: stat.size, createdAt: new Date(stat.mtimeMs).toISOString() };
    });
}

/**
 * retention 轮转：白名单文件按文件名排序（时间序），保留最新 keep 份，超出的最旧份删除；
 * 中断 tmp 残留一并清理。目录不存在静默 0（首启未备份过）。返回删除文件数。
 */
export async function applyRetention(backupDir?: string, keep = env.BACKUP_RETENTION_COUNT): Promise<number> {
  const dir = resolveBackupDir(backupDir ?? env.BACKUP_DIR);
  const removed = retentionSync(dir, keep);
  if (removed > 0) logger.info(`Backup retention: removed ${removed} file(s) (keep ${Math.max(1, keep)})`);
  return removed;
}

/** 轮转本体（同步 fs 语义，applyRetention 与 createBackup 主流程共用，勿复制逻辑） */
function retentionSync(dir: string, keep: number): number {
  if (!fs.existsSync(dir)) return 0;

  const kept = Math.max(1, keep); // 下界 1：不删光全部备份（与 env 下界保护同语义）
  const files = fs.readdirSync(dir).filter((f) => BACKUP_FILENAME_RE.test(f)).sort(); // asc = 时间正序
  const stale = files.slice(0, Math.max(0, files.length - kept));
  const tmpFiles = fs.readdirSync(dir).filter((f) => BACKUP_TMP_RE.test(f));

  let removed = 0;
  for (const f of [...stale, ...tmpFiles]) {
    fs.rmSync(path.join(dir, f), { force: true });
    removed += 1;
  }
  return removed;
}

/** 通知下发（fire-and-forget 契约：emit 失败只记日志，绝不影响备份结果/错误传播） */
async function notifyAdmins(type: 'BACKUP_COMPLETED' | 'BACKUP_FAILED', payload: Record<string, unknown>): Promise<void> {
  try {
    await emitToAdmins({ type, payload });
  } catch (err) {
    logger.error('备份结果通知下发失败（不传播）', { type, error: (err as Error).message });
  }
}

/** 每日 02:00 定时备份（auditCleaner 同款：仅定时——不启动即清，W2-5 cleaner 裁决）。 */
export function startBackupScheduler(): void {
  cron.schedule('0 2 * * *', () => {
    // createBackup 内部已 emit BACKUP_FAILED 通知，此处 catch 只收口日志（与 session 03:00 / 审计 03:30 / 通知 04:00 错峰）
    createBackup({ trigger: 'cron' }).catch((err) => {
      logger.error('Scheduled backup failed', { error: err instanceof Error ? err.message : String(err) });
    });
  });

  logger.info('Backup scheduler scheduled (daily at 02:00)');
}
