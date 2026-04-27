// packages/backend/src/controllers/connectionController.ts
import type { Request, Response, NextFunction } from 'express';
import * as connectionService from '../services/connectionService.js';

function qsParam(val: unknown, fallback: string): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return fallback;
}

export async function listConnections(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = qsParam(req.query.projectId, '');
    const page = Math.max(1, parseInt(qsParam(req.query.page, '1')) || 1);
    const pageSize = parseInt(qsParam(req.query.pageSize, '20')) || 20;
    const result = await connectionService.listConnections(
      req.user.id,
      req.user.role,
      projectId || undefined,
      page,
      pageSize,
    );
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function createConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await connectionService.createConnection(req.user.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const data = await connectionService.getConnection(id, req.user.role);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const data = await connectionService.updateConnection(req.user.id, id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const result = await connectionService.deleteConnection(id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

export async function decryptPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const result = await connectionService.decryptPassword(id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
