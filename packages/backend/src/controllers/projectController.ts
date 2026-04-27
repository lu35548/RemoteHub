// packages/backend/src/controllers/projectController.ts
import type { Request, Response, NextFunction } from 'express';
import * as projectService from '../services/projectService.js';

function qsParam(val: unknown, fallback: string): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return fallback;
}

export async function listProjects(req: Request, res: Response, next: NextFunction) {
  try {
    const page = Math.max(1, parseInt(qsParam(req.query.page, '1')) || 1);
    const pageSize = parseInt(qsParam(req.query.pageSize, '20')) || 20;
    const result = await projectService.listProjects(req.user.id, req.user.role, page, pageSize);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function createProject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await projectService.createProject(req.user.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getProject(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const data = await projectService.getProject(id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateProject(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const data = await projectService.updateProject(req.user.id, id, req.body);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteProject(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const result = await projectService.deleteProject(id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
