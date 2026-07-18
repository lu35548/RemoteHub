import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../prisma');

/**
 * 解析 SQLite file: URL：相对路径锚定到 prisma/ schema 目录（与 prisma CLI 的解析语义一致），
 * 避免 driver adapter 按进程 CWD 解析导致 dev.db 分裂成两个文件。绝对路径/非 file: URL 原样返回。
 */
export function resolveSqliteUrl(url: string): string {
  if (!url.startsWith('file:')) return url;
  const p = url.slice('file:'.length);
  if (path.isAbsolute(p)) return url;
  return `file:${path.resolve(SCHEMA_DIR, p)}`;
}
