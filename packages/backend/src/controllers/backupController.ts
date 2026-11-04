// packages/backend/src/controllers/backupController.ts
// #38 备份端点控制器：手动触发（写，挂审计 SYSTEM_BACKUP）/ 列表（读不挂审计，monitoring 先例）/
// 下载（读不挂；路径遍历三重防护：白名单正则 + path.resolve 前缀校验 + 绝对路径 res.download）。
import type { Request, Response, NextFunction } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { createAppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { BACKUP_FILENAME_RE, createBackup, listBackups, resolveBackupDir } from '../utils/backupService.js';
import { env } from '../config/env.js';

/** POST /api/v1/admin/backups：admin 手动触发备份（与 cron 02:00 共用 createBackup） */
export async function triggerBackup(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await createBackup({ trigger: 'manual' });
    // 不外露服务器绝对路径（path 仅供服务端内部消费）
    res.json({ success: true, data: { filename: result.filename, sizeBytes: result.sizeBytes, durationMs: result.durationMs } });
  } catch (err) {
    // createBackup 不会抛 AppError——统一包 BACKUP_003（500），原始错误已在其内部 logger.error
    if (err instanceof Error && err.name === 'AppError') return next(err);
    logger.error('手动备份触发失败（controller 包装前）', { error: err instanceof Error ? err.message : String(err) });
    next(createAppError('BACKUP_003'));
  }
}

/** GET /api/v1/admin/backups：备份列表（目录实时扫描，文件即真相） */
export function listBackupsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: listBackups() });
  } catch (err) { next(err); }
}

/** GET /api/v1/admin/backups/:filename/download：下载备份（attachment） */
export function downloadBackup(req: Request, res: Response, next: NextFunction) {
  try {
    const filename = typeof req.params.filename === 'string' ? req.params.filename : '';

    // 防线 1：文件名白名单（服务端生成形态 backup-YYYYMMDD-HHmmss.db 之外一律拒——
    // Express 参数解码后可含 ../，正则先于任何文件系统操作）
    if (!BACKUP_FILENAME_RE.test(filename)) {
      next(createAppError('BACKUP_001'));
      return;
    }

    // 防线 2：resolve 后必须仍在备份根目录内（前缀校验），传绝对路径给 res.download
    //（相对路径会按 process.cwd() 解析——spec「相对 URL+变 CWD」风险点）
    const root = resolveBackupDir(env.BACKUP_DIR);
    const abs = path.resolve(root, filename);
    if (!abs.startsWith(root + path.sep)) {
      next(createAppError('BACKUP_001'));
      return;
    }

    // 防线 3：res.download 传**绝对路径**（相对路径会按 process.cwd() 解析——spec「相对 URL+变 CWD」
    // 风险点）。注意不带 root 选项：send 库对 root 内路径做 join 拼接，绝对路径 + root 会拼出
    // 坏路径报 Forbidden/ENOENT（实测 500）——root 是相对路径的沙箱基准，绝对路径场景省略。
    res.download(abs, filename, (err) => {
      if (!err) return;
      if (res.headersSent) { next(err); return; } // 响应已部分发送，只能交全局 handler 记日志
      // 白名单形态但文件不存在（如刚被 retention 轮转删除的竞态）
      if (!fs.existsSync(abs)) { next(createAppError('BACKUP_002')); return; }
      next(err);
    });
  } catch (err) { next(err); }
}
