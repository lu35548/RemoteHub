// packages/backend/src/controllers/adminDataController.ts
// 票 #50 数据导入导出 handler。审计为程序化落行(service.writeSystemAudit,成败皆记),
// 不挂 auditMiddleware——export 响应体是全量导出 JSON(envelope 通道会把密文本体塞进审计
// detail.after,审计行膨胀且密文入库),import 响应计数亦由程序化通道精确记录。
import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/appError.js';
import * as adminDataService from '../services/adminDataService.js';

/** 审计 detail.reason:AppError 取业务码,未知异常归 SYS_001(对齐 auditMiddleware 口径) */
function auditReason(err: unknown): string {
  return err instanceof AppError ? err.code : 'SYS_001';
}

function ua(req: Request): string | undefined {
  return typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
}

export async function exportData(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await adminDataService.exportData();
    await adminDataService.writeSystemAudit({
      userId: req.user.id,
      action: 'SYSTEM_BACKUP',
      result: 'success',
      // 只记计数:密文本体不入审计行(体积护栏由集成测试锁死)
      detail: { after: { counts: { users: data.users.length, projects: data.projects.length, connections: data.connections.length, members: data.members.length } } },
      ip: req.ip,
      userAgent: ua(req),
    });
    res.json({ success: true, data });
  } catch (err) {
    await adminDataService.writeSystemAudit({
      userId: req.user.id,
      action: 'SYSTEM_BACKUP',
      result: 'failure',
      detail: { reason: auditReason(err) },
      ip: req.ip,
      userAgent: ua(req),
    });
    next(err);
  }
}

export async function importData(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await adminDataService.importData(req.body);
    await adminDataService.writeSystemAudit({
      userId: req.user.id,
      action: 'SYSTEM_RESTORE',
      result: 'success',
      detail: { after: data },
      ip: req.ip,
      userAgent: ua(req),
    });
    res.json({ success: true, data });
  } catch (err) {
    await adminDataService.writeSystemAudit({
      userId: req.user.id,
      action: 'SYSTEM_RESTORE',
      result: 'failure',
      detail: { reason: auditReason(err) },
      ip: req.ip,
      userAgent: ua(req),
    });
    next(err);
  }
}
