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
      update: vi.fn(),
    },
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: { info: vi.fn(), error: vi.fn() },
}));

import { authMiddleware } from './auth.js';
import { prisma } from '../utils/prisma.js';
import { signAccessToken } from '../utils/jwt.js';
import type { Request, Response, NextFunction } from 'express';

function mockReqRes(authHeader?: string) {
  const req = {
    headers: authHeader ? { authorization: authHeader } : {},
    user: undefined,
    path: '/api/v1/test',
  } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('authMiddleware', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('无 Authorization 头 → 401 AUTH_002', async () => {
    const { req, res, next } = mockReqRes();
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'AUTH_002' }),
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('无效 token → 401 AUTH_002', async () => {
    const { req, res, next } = mockReqRes('Bearer invalid-token');
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('用户不存在 → 401 AUTH_002', async () => {
    const token = await signAccessToken('nonexistent-id');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('用户 isActive=false → 403 AUTH_005', async () => {
    const token = await signAccessToken('user-1');
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'user-1', username: 'test', nickname: 'Test', role: 'user', isActive: false,
    });
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ code: 'AUTH_005' }),
    }));
  });

  it('有效 token + 活跃用户 → next + req.user', async () => {
    const token = await signAccessToken('user-1');
    const user = { id: 'user-1', username: 'test', nickname: 'Test', role: 'admin', isActive: true };
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(user);
    const { req, res, next } = mockReqRes(`Bearer ${token}`);
    await authMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({ id: 'user-1', role: 'admin' }));
  });
});
