// packages/backend/src/utils/backupService.test.ts
// #38 备份 service 单元级（纯逻辑/文件系统，不依赖真库）：
// 路径锚定（resolveBackupDir / resolveSourceDbPath——票面测试红线的纯函数层）+ 文件名白名单 + retention 轮转
// + listBackups stat 竞态容错（readdir→stat 间隙文件消失 skip 不炸列表）。
// VACUUM INTO 真库链路在 src/test/integration/backup.api.test.ts（mock 验不了 raw SQL 副作用，libback §2）。
import '../test/helpers/env.js';
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BACKUP_FILENAME_RE,
  applyRetention,
  listBackups,
  resolveBackupDir,
  resolveSourceDbPath,
} from './backupService.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(here, '../..');

describe('resolveSourceDbPath（源库路径锚定——防「备到空库」的第一道防线）', () => {
  it('相对 file: URL 锚定到 prisma/ 目录（与 prisma CLI / resolveSqliteUrl 同语义）', () => {
    const p = resolveSourceDbPath('file:./dev.db');
    expect(path.isAbsolute(p)).toBe(true);
    expect(path.normalize(p)).toBe(path.resolve(BACKEND_ROOT, 'prisma/dev.db'));
  });

  it('变 CWD 后锚定结果不变（相对路径按 CWD 解析的坑被锁死）', () => {
    const origCwd = process.cwd();
    try {
      process.chdir(os.tmpdir());
      const p = resolveSourceDbPath('file:./dev.db');
      expect(path.normalize(p)).toBe(path.resolve(BACKEND_ROOT, 'prisma/dev.db'));
    } finally {
      process.chdir(origCwd);
    }
  });

  it('绝对 file: URL 剥前缀原样返回', () => {
    const abs = path.resolve(os.tmpdir(), 'x.db');
    expect(resolveSourceDbPath(`file:${abs}`)).toBe(abs);
  });
});

describe('resolveBackupDir（备份目录锚定——参照 resolveSqliteUrl 先例锚定到 backend 根）', () => {
  it('相对路径锚定到 backend 根（不随 CWD 漂移）', () => {
    expect(path.normalize(resolveBackupDir('./backups'))).toBe(path.resolve(BACKEND_ROOT, 'backups'));
    expect(path.normalize(resolveBackupDir('backups'))).toBe(path.resolve(BACKEND_ROOT, 'backups'));
  });

  it('绝对路径原样返回', () => {
    const abs = path.resolve(os.tmpdir(), 'bk');
    expect(resolveBackupDir(abs)).toBe(abs);
  });
});

describe('BACKUP_FILENAME_RE（下载白名单：服务端生成形态外的文件名一律拒）', () => {
  it.each([
    ['backup-20260924-020000.db', true],
    ['backup-20991231-235959.db', true],
    // 遍历/伪装/临时残留：全拒
    ['../dev.db', false],
    ['..\\dev.db', false],
    ['backup-20260924-020000.db.tmp', false],
    ['backup-20260924-020000.db.bak', false],
    ['xbackup-20260924-020000.db', false],
    ['backup-20260924-020000.sqlite', false],
    ['backup-2026924-020000.db', false], // 非 8 位日期
    ['.env', false],
    ['', false],
  ])('%s → %s', (name, ok) => {
    expect(BACKUP_FILENAME_RE.test(name)).toBe(ok);
  });
});

describe('applyRetention（轮转：保最新 N 份 + 清中断 tmp 残留）', () => {
  function mkDirWith(names: string[]): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-retention-'));
    for (const n of names) fs.writeFileSync(path.join(dir, n), 'x');
    return dir;
  }

  it('4 份保留 2 → 剩最新 2，tmp 残留一并清理，返回删除计数 3', () => {
    const dir = mkDirWith([
      'backup-20260101-000000.db',
      'backup-20260102-000000.db',
      'backup-20260103-000000.db',
      'backup-20260104-000000.db',
      'backup-20260105-000000.db.tmp', // 中断残留（libback §1.4：retention 顺带清理）
    ]);
    try {
      const removed = applyRetention(dir, 2);
      expect(removed).toBe(3);
      expect(fs.readdirSync(dir).sort()).toEqual([
        'backup-20260103-000000.db',
        'backup-20260104-000000.db',
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('不足保留数时零删除', () => {
    const dir = mkDirWith(['backup-20260101-000000.db']);
    try {
      expect(applyRetention(dir, 3)).toBe(0);
      expect(fs.readdirSync(dir)).toHaveLength(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keep 下界 1：keep=0 视为 1（不删光全部备份）', () => {
    const dir = mkDirWith(['backup-20260101-000000.db', 'backup-20260102-000000.db']);
    try {
      applyRetention(dir, 0);
      expect(fs.readdirSync(dir)).toEqual(['backup-20260102-000000.db']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('目录不存在静默返回 0（首启未备份过）', () => {
    expect(applyRetention(path.join(os.tmpdir(), `rh-no-such-${Date.now()}`), 2)).toBe(0);
  });
});

describe('listBackups（目录实时扫描——stat 竞态容错）', () => {
  it('readdir→stat 间隙文件消失（retention 轮转/同秒覆盖 rename 竞态）→ 该项 skip，列表不炸', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rh-listbk-'));
    fs.writeFileSync(path.join(dir, 'backup-20260101-000000.db'), 'a');
    fs.writeFileSync(path.join(dir, 'backup-20260102-000000.db'), 'b');
    // 只让「较新那份」stat 抛 ENOENT（模拟 readdir 后被并发轮转删除），其余走真 stat
    const realStatSync = fs.statSync.bind(fs);
    const statSpy = vi.spyOn(fs, 'statSync').mockImplementation((p: fs.PathLike) => {
      if (p.toString().endsWith('backup-20260102-000000.db')) {
        throw Object.assign(new Error(`ENOENT: no such file or directory, stat '${p}'`), { code: 'ENOENT' });
      }
      return realStatSync(p);
    });
    try {
      const list = listBackups(dir);
      expect(list).toHaveLength(1);
      expect(list[0]!.filename).toBe('backup-20260101-000000.db');
      expect(list[0]!.sizeBytes).toBe(1);
    } finally {
      statSpy.mockRestore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
