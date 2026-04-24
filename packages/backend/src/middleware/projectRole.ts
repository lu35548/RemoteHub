import type { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import type { MemberRole } from '@remotehub/shared';

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  owner: 3,
  editor: 2,
  viewer: 1,
};

export function projectRoleMiddleware(minRole: MemberRole) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ success: false, error: { code: 'AUTH_002', message: '令牌已过期' } });
      return;
    }

    if (req.user.role === 'admin') {
      next();
      return;
    }

    let projectId: string | undefined;

    const paramId = typeof req.params.id === 'string' ? req.params.id : Array.isArray(req.params.id) ? req.params.id[0] : undefined;

    if (paramId) {
      if (req.baseUrl?.includes('projects')) {
        projectId = paramId;
      } else if (req.baseUrl?.includes('connections')) {
        const conn = await prisma.connection.findUnique({
          where: { id: paramId },
          select: { projectId: true },
        });
        if (!conn) {
          res.status(403).json({ success: false, error: { code: 'AUTH_003', message: '权限不足' } });
          return;
        }
        projectId = conn.projectId;
      }
    }

    if (!projectId && req.body?.projectId) {
      projectId = req.body.projectId as string;
    }

    if (!projectId && req.query?.projectId && typeof req.query.projectId === 'string') {
      projectId = req.query.projectId;
    }

    if (!projectId) {
      next();
      return;
    }

    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: req.user.id } },
    });

    if (!member) {
      res.status(403).json({ success: false, error: { code: 'AUTH_003', message: '权限不足' } });
      return;
    }

    if (ROLE_HIERARCHY[member.role as MemberRole] < ROLE_HIERARCHY[minRole]) {
      res.status(403).json({ success: false, error: { code: 'AUTH_003', message: '权限不足' } });
      return;
    }

    next();
  };
}
