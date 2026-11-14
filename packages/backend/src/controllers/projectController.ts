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
    // #47 归档过滤：缺省/false=仅 active；archived=true=仅归档项目（归档视图专用）
    const archived = qsParam(req.query.archived, 'false') === 'true';
    const result = await projectService.listProjects(req.user.id, req.user.role, page, pageSize, archived);
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

// ─── #47 项目管理增强 ───

export async function archiveProject(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const data = await projectService.archiveProject(req.user.id, id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function restoreProject(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const data = await projectService.restoreProject(req.user.id, id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function copyProject(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const data = await projectService.copyProject(req.user.id, id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function transferProjectOwnership(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const data = await projectService.transferProjectOwnership(id, (req.body ?? {}).userId);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function batchArchiveProjects(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await projectService.batchArchiveProjects({
      operatorUserId: req.user.id,
      operatorRole: req.user.role,
      ip: req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      ids: (req.body ?? {}).ids,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

/** 批 13b-A3 批量恢复：batch-archive 全链镜像（幂等 skipped 零审计口径对齐） */
export async function batchRestoreProjects(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await projectService.batchRestoreProjects({
      operatorUserId: req.user.id,
      operatorRole: req.user.role,
      ip: req.ip,
      userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
      ids: (req.body ?? {}).ids,
    });
    res.json({ success: true, data });
  } catch (err) { next(err); }
}
