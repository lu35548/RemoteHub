import type { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../utils/jwt.js';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import { LAST_ACTIVE_THROTTLE_MS } from '@remotehub/shared';

const lastActiveUpdates = new Map<string, number>();

interface AuthUser {
  id: string;
  username: string;
  nickname: string;
  role: string;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
    }
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: { code: 'AUTH_002', message: '令牌已过期' } });
    return;
  }

  let userId: string;
  try {
    const payload = await verifyAccessToken(authHeader.slice(7));
    userId = payload.userId;
  } catch {
    res.status(401).json({ success: false, error: { code: 'AUTH_002', message: '令牌已过期' } });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    res.status(401).json({ success: false, error: { code: 'AUTH_002', message: '令牌已过期' } });
    return;
  }

  if (!user.isActive) {
    res.status(403).json({ success: false, error: { code: 'AUTH_005', message: '用户已被禁用' } });
    return;
  }

  req.user = user;

  const now = Date.now();
  const lastUpdate = lastActiveUpdates.get(user.id) || 0;
  if (now - lastUpdate > LAST_ACTIVE_THROTTLE_MS) {
    lastActiveUpdates.set(user.id, now);
    prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } })
      .catch((err) => logger.error('Failed to update lastActiveAt', { error: err.message }));
  }

  next();
}
