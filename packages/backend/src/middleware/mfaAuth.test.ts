import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-at-least-32-chars',
    JWT_ACCESS_EXPIRES_IN: '15m',
  },
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

import { mfaAuthMiddleware } from './mfaAuth.js';
import { prisma } from '../utils/prisma.js';
import { signAccessToken, signMfaToken } from '../utils/jwt.js';
import type { Request, Response, NextFunction } from 'express';

function mockReqRes(authHeader?: string) {
  const req = {
    headers: authHeader ? { authorization: authHeader } : {},
    user: undefined,
  } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('mfaAuthMiddleware', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('无 Authorization 头 → 401 MFA_002', async () => {
    const { req, res, next } = mockReqRes();
    await mfaAuthMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'MFA_002' }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('access token 冒充 mfa token → 401（aud 互斥：audience mfa 校验拒收 access）', async () => {
    const accessToken = await signAccessToken('user-1');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', isActive: true });
    const { req, res, next } = mockReqRes(`Bearer ${accessToken}`);
    await mfaAuthMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('mfa token + 活跃用户 → next + req.user', async () => {
    const mfaToken = await signMfaToken('user-1');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', isActive: true });
    const { req, res, next } = mockReqRes(`Bearer ${mfaToken}`);
    await mfaAuthMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({ id: 'user-1' }));
  });

  it('用户不存在 → 401', async () => {
    const mfaToken = await signMfaToken('user-1');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { req, res, next } = mockReqRes(`Bearer ${mfaToken}`);
    await mfaAuthMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('用户被禁用 → 401', async () => {
    const mfaToken = await signMfaToken('user-1');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'user-1', isActive: false });
    const { req, res, next } = mockReqRes(`Bearer ${mfaToken}`);
    await mfaAuthMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
