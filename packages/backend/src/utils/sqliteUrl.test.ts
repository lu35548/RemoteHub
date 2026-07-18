import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSqliteUrl } from './sqliteUrl.js';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('resolveSqliteUrl', () => {
  it('相对 file: 路径锚定到 prisma/ schema 目录', () => {
    const r = resolveSqliteUrl('file:./dev.db');
    expect(r.startsWith('file:')).toBe(true);
    expect(path.normalize(r.slice(5))).toBe(path.resolve(here, '../../prisma/dev.db'));
  });

  it('绝对 file: 路径原样返回', () => {
    const abs = path.resolve('/tmp/x.db');
    expect(resolveSqliteUrl(`file:${abs}`)).toBe(`file:${abs}`);
  });

  it('非 file: URL 原样返回', () => {
    expect(resolveSqliteUrl('mysql://x')).toBe('mysql://x');
  });
});
