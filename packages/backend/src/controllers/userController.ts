// packages/backend/src/controllers/userController.ts
import type { Request, Response, NextFunction } from 'express';
import * as userService from '../services/userService.js';
import * as passwordResetService from '../services/passwordResetService.js';
import { createAppError } from '../utils/appError.js';
import { qsParam } from '../utils/qs.js';

function paramId(req: Request, name: string): string {
  const val = req.params[name];
  if (typeof val === 'string') return val;
  throw createAppError('VAL_001', [{ field: name, message: `缺少 ${name}` }]);
}

export async function listUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(qsParam(req.query.page, '1')) || 1);
    const pageSize = parseInt(qsParam(req.query.pageSize, '20')) || 20;
    const result = await userService.listUsers(page, pageSize);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function searchUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const q = qsParam(req.query.q, '');
    if (q.length < 1) {
      res.json({ success: true, data: [] });
      return;
    }
    const data = await userService.searchUsers(q);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getUser(req: Request, res: Response, next: NextFunction) {
  try {
    const id = paramId(req, 'id');
    const data = await userService.getUser(id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateUser(req: Request, res: Response, next: NextFunction) {
  try {
    const id = paramId(req, 'id');
    const data = await userService.updateUser(req.user.id, id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction) {
  try {
    const id = paramId(req, 'id');
    const result = await userService.deleteUser(req.user.id, id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

/** POST /admin/users/:id/reset-link（admin 代重置，票 #28）：生成一次性链接供面板复制转交 */
export async function createResetLink(req: Request, res: Response, next: NextFunction) {
  try {
    const id = paramId(req, 'id');
    // ip/UA 原样透传（截断归一收口 service，同 forgotPassword）
    const resetLink = await passwordResetService.createResetLink(id, req.ip, req.headers['user-agent']);
    res.json({ success: true, data: { resetLink } });
  } catch (err) { next(err); }
}
