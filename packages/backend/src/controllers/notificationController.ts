// packages/backend/src/controllers/notificationController.ts
// #35 通知端点控制器（读端点不挂审计——monitoringRoutes 先例；PATCH 已读标记为用户私有
// UI 状态、非安全事件，同族不挂审计，AUDIT_ACTIONS 枚举不扩）。
import type { Request, Response, NextFunction } from 'express';
import * as notificationService from '../services/notificationService.js';

/** GET /api/v1/notifications */
export async function listNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
    const pageSize = parseInt(String(req.query.pageSize ?? '20'), 10) || 20;
    const result = await notificationService.listUnreadNotifications(req.user.id, page, pageSize);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

/** PATCH /api/v1/notifications/:id/read */
export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    const data = await notificationService.markNotificationRead(id, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
