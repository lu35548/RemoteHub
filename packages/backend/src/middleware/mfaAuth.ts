// packages/backend/src/middleware/mfaAuth.ts
// 票 #30：mfa 挑战 token（aud:'mfa'）专用守卫，与 authMiddleware（aud:'access'）双向互斥——
// access token 冒充 mfa 会被 audience:'mfa' 拒收，mfa token 也进不了业务 API（audience:'access'）。
import type { Request, Response, NextFunction } from 'express';
import { verifyMfaToken } from '../utils/jwt.js';
import { prisma } from '../utils/prisma.js';

function unauthorized(res: Response): void {
  res.status(401).json({ success: false, error: { code: 'MFA_002', message: '多因素认证令牌无效或已过期' } });
}

export async function mfaAuthMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    unauthorized(res);
    return;
  }

  let userId: string;
  try {
    ({ userId } = await verifyMfaToken(authHeader.slice(7)));
  } catch {
    unauthorized(res);
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  // review F6：isActive=false 时与 authMiddleware（403 AUTH_005）不同构，统一回 401 MFA_002——
  // 与「无效 token」同响应形状，避免向持挑战 token 者泄露「账号存在但已被禁用」。
  if (!user || !user.isActive) {
    unauthorized(res);
    return;
  }

  req.user = user;
  next();
}
