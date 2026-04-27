// packages/backend/src/controllers/memberController.ts
import type { Request, Response, NextFunction } from 'express';
import * as memberService from '../services/memberService.js';

function qsParam(val: unknown, fallback: string): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return fallback;
}

export async function listMembers(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = req.params['id'];
    if (typeof projectId !== 'string') throw new Error('缺少 id');
    const page = Math.max(1, parseInt(qsParam(req.query.page, '1')) || 1);
    const pageSize = parseInt(qsParam(req.query.pageSize, '20')) || 20;
    const result = await memberService.listMembers(projectId, page, pageSize);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

export async function addMember(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = req.params['id'];
    if (typeof projectId !== 'string') throw new Error('缺少 id');
    const data = await memberService.addMember(projectId, req.body.userId, req.body.role);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateRole(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = req.params['id'];
    if (typeof projectId !== 'string') throw new Error('缺少 id');
    const uid = req.params['uid'];
    if (typeof uid !== 'string') throw new Error('缺少 uid');
    const data = await memberService.updateMemberRole(projectId, uid, req.body.role, req.user.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function removeMember(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = req.params['id'];
    if (typeof projectId !== 'string') throw new Error('缺少 id');
    const uid = req.params['uid'];
    if (typeof uid !== 'string') throw new Error('缺少 uid');
    const result = await memberService.removeMember(projectId, uid, req.user.id, req.user.role);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
