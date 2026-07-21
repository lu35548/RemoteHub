// packages/backend/src/controllers/authController.ts
import type { Request, Response, NextFunction } from 'express';
import * as authService from '../services/authService.js';
import { createAppError, shouldClearRefreshCookie } from '../utils/appError.js';
import { hashRefreshToken } from '../utils/jwt.js';
import { prisma } from '../utils/prisma.js';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
};

const CLEAR_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'strict' as const,
  path: '/api/v1/auth',
  maxAge: 0,
};

function extractRefreshToken(req: Request): string | undefined {
  return req.cookies?.refreshToken;
}

/** POST /auth/login */
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { username, password } = req.body;
    if (!username || !password) throw createAppError('AUTH_001');

    const result = await authService.login(username, password);

    // 更新 session 的 userAgent 和 IP §5.1
    const tokenHash = hashRefreshToken(result.refreshToken);
    await prisma.session.updateMany({
      where: { tokenHash },
      data: {
        userAgent: (req.headers['user-agent'] || '').slice(0, 500),
        ip: req.ip?.slice(0, 45) || null,
      },
    });

    res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
    res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } });
  } catch (err) { next(err); }
}

/** POST /auth/register（仅 admin）*/
export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await authService.register(req.user.role, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (err) { next(err); }
}

/** POST /auth/refresh */
export async function refresh(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractRefreshToken(req);
    if (!token) throw createAppError('AUTH_004');

    const result = await authService.refresh(token);

    if (result.clearCookie) {
      res.cookie('refreshToken', '', CLEAR_COOKIE_OPTIONS);
    } else {
      res.cookie('refreshToken', result.refreshToken, REFRESH_COOKIE_OPTIONS);
    }

    res.json({ success: true, data: { accessToken: result.accessToken } });
  } catch (err) {
    if (shouldClearRefreshCookie(err)) {
      res.cookie('refreshToken', '', CLEAR_COOKIE_OPTIONS);
    }
    next(err);
  }
}

/** POST /auth/logout */
export async function logout(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractRefreshToken(req);
    await authService.logout(token);
    res.cookie('refreshToken', '', CLEAR_COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (err) { next(err); }
}

/** GET /auth/me */
export async function me(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authService.getMe(req.user.id);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}

/** POST /auth/change-password */
export async function changePassword(req: Request, res: Response, next: NextFunction) {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      throw createAppError('VAL_001', [
        ...(!oldPassword ? [{ field: 'oldPassword', message: '旧密码不能为空' }] : []),
        ...(!newPassword ? [{ field: 'newPassword', message: '新密码不能为空' }] : []),
      ]);
    }
    await authService.changePassword(req.user.id, oldPassword, newPassword);
    res.cookie('refreshToken', '', CLEAR_COOKIE_OPTIONS);
    res.json({ success: true });
  } catch (err) { next(err); }
}

/** PATCH /auth/profile */
export async function updateProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const { nickname } = req.body;
    if (!nickname) throw createAppError('VAL_001', [{ field: 'nickname', message: '昵称不能为空' }]);
    const user = await authService.updateProfile(req.user.id, nickname);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
}
