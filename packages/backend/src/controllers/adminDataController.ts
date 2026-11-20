// packages/backend/src/controllers/adminDataController.ts
// 票 #50 数据导入导出 handler。审计为程序化落行(service.writeSystemAudit,成败皆记),
// 不挂 auditMiddleware——export 响应体是全量导出 JSON(envelope 通道会把密文本体塞进审计
// detail.after,审计行膨胀且密文入库),import 响应计数亦由程序化通道精确记录。
import type { Request, Response, NextFunction } from 'express';
import { AppError, createAppError } from '../utils/appError.js';
import * as adminDataService from '../services/adminDataService.js';

/** 审计 detail.reason:AppError 取业务码,未知异常归 SYS_001(对齐 auditMiddleware 口径) */
function auditReason(err: unknown): string {
  return err instanceof AppError ? err.code : 'SYS_001';
}

function ua(req: Request): string | undefined {
  return typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined;
}

/**
 * import 专用 role 门禁(批 11 OQ #50:import 403 不留痕)。判定语义与 roleMiddleware('admin')
 * 同构:!req.user → AUTH_002(防御分支,authMiddleware 已保证 req.user,不可达;不落行,与
 * roleMiddleware 对齐);role ≠ admin → 先程序化 writeSystemAudit(SYSTEM_RESTORE failure,
 * detail.reason=AUTH_003;writeSystemAudit 内部 redactDetail 脱敏对齐 #50 F5)再转发 AUTH_003。
 * 响应口径不变(仍 403),只补「谁试图导入」的知情留痕(对齐 backupRoutes POST 的 403 留痕)。
 */
export async function importRoleGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    next(createAppError('AUTH_002'));
    return;
  }
  if (req.user.role !== 'admin') {
    await adminDataService.writeSystemAudit({
      userId: req.user.id,
      action: 'SYSTEM_RESTORE',
      result: 'failure',
      detail: { reason: 'AUTH_003' },
      ip: req.ip,
      userAgent: ua(req),
    });
    next(createAppError('AUTH_003'));
    return;
  }
  next();
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
