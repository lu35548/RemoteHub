// packages/backend/src/controllers/userController.ts
import type { Request, Response, NextFunction } from 'express';
import * as userService from '../services/userService.js';
import { createAppError } from '../utils/appError.js';

function qsParam(val: unknown, fallback: string): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return fallback;
}

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
