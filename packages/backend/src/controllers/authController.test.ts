// packages/backend/src/controllers/authController.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
vi.mock('../services/authService.js', () => ({
  login: vi.fn(),
  register: vi.fn(),
  refresh: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
  changePassword: vi.fn(),
  updateProfile: vi.fn(),
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: {
    session: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('../utils/jwt.js', () => ({
  hashRefreshToken: vi.fn().mockReturnValue('hashed-token'),
}));

vi.mock('../utils/appError.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/appError.js')>();
  return {
    ...actual,
    createAppError: vi.fn((code: string, details?: Array<{ field: string; message: string }>) => {
      const error = new Error(`AppError: ${code}`);
      (error as any).code = code;
      (error as any).statusCode = code === 'AUTH_001' ? 401 : code === 'VAL_001' ? 422 : 500;
      (error as any).details = details;
      return error;
    }),
  };
});

import * as authController from './authController.js';
import * as authService from '../services/authService.js';
import { prisma } from '../utils/prisma.js';
import type { Request, Response, NextFunction } from 'express';

function mockReqRes(body?: Record<string, unknown>, cookies?: Record<string, string>, user?: { id: string; role: string }, headers?: Record<string, string>) {
  const req = {
    body: body ?? {},
    cookies: cookies ?? {},
    user,
    headers: headers ?? {},
    ip: '127.0.0.1',
  } as unknown as Request;
  const cookieFn = vi.fn();
  const res = {
    cookie: cookieFn,
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('authController', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── login ───
  describe('login', () => {
    it('成功登录 → 200 + accessToken + refreshToken cookie', async () => {
      const mockResult = {
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-456',
        user: { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
      };
      (authService.login as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);
      (prisma.session.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

      const { req, res, next } = mockReqRes({ username: 'admin', password: 'Admin123' });
      await authController.login(req, res, next);

      expect(authService.login).toHaveBeenCalledWith('admin', 'Admin123');
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'refresh-token-456', expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/v1/auth',
      }));
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: { accessToken: 'access-token-123', user: mockResult.user },
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('缺少 username/password → 传递 AUTH_001 错误', async () => {
      const { req, res, next } = mockReqRes({ username: 'admin' });
      await authController.login(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(authService.login).not.toHaveBeenCalled();
    });

    it('错误密码 → 传递错误到 next', async () => {
      const error = new Error('AUTH_001') as any;
      error.code = 'AUTH_001';
      error.statusCode = 401;
      (authService.login as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ username: 'admin', password: 'wrong' });
      await authController.login(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── register ───
  describe('register', () => {
    it('admin 注册用户 → 201 + 用户数据', async () => {
      const mockUser = { id: 'u2', username: 'newuser', nickname: '新用户', role: 'user', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' };
      (authService.register as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const { req, res, next } = mockReqRes(
        { username: 'newuser', nickname: '新用户', password: 'Pass1234' },
        undefined,
        { id: 'u1', role: 'admin' },
      );
      await authController.register(req, res, next);

      expect(authService.register).toHaveBeenCalledWith('admin', req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockUser });
    });

    it('重复用户名 → 传递错误到 next', async () => {
      const error = new Error('USER_001') as any;
      error.code = 'USER_001';
      error.statusCode = 409;
      (authService.register as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(
        { username: 'admin', nickname: 'Test', password: 'Pass1234' },
        undefined,
        { id: 'u1', role: 'admin' },
      );
      await authController.register(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── refresh ───
  describe('refresh', () => {
    it('有效 refreshToken → 200 + 新 accessToken + 新 cookie', async () => {
      const mockResult = { accessToken: 'new-access', refreshToken: 'new-refresh', clearCookie: false };
      (authService.refresh as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const { req, res, next } = mockReqRes({}, { refreshToken: 'old-refresh-token' });
      await authController.refresh(req, res, next);

      expect(authService.refresh).toHaveBeenCalledWith('old-refresh-token');
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'new-refresh', expect.objectContaining({
        httpOnly: true,
        sameSite: 'strict',
        path: '/api/v1/auth',
      }));
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { accessToken: 'new-access' } });
    });

    it('clearCookie=true → 清除 cookie', async () => {
      const mockResult = { accessToken: 'new-access', refreshToken: 'new-refresh', clearCookie: true };
      (authService.refresh as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const { req, res, next } = mockReqRes({}, { refreshToken: 'old-refresh-token' });
      await authController.refresh(req, res, next);

      expect(res.cookie).toHaveBeenCalledWith('refreshToken', '', expect.objectContaining({ maxAge: 0 }));
    });

    it('无 cookie → 传递 AUTH_004 错误 + 清除 cookie', async () => {
      const { req, res, next } = mockReqRes({}, {});
      await authController.refresh(req, res, next);

      expect(res.cookie).toHaveBeenCalledWith('refreshToken', '', expect.objectContaining({ maxAge: 0 }));
      expect(next).toHaveBeenCalled();
    });

    it('token 重用攻击 → 清除 cookie + 传递错误', async () => {
      const error = new Error('AUTH_004') as any;
      error.code = 'AUTH_004';
      error.statusCode = 401;
      (authService.refresh as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({}, { refreshToken: 'reused-token' });
      await authController.refresh(req, res, next);

      expect(res.cookie).toHaveBeenCalledWith('refreshToken', '', expect.objectContaining({ maxAge: 0 }));
      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── logout ───
  describe('logout', () => {
    it('成功登出 → 清除 cookie + 200', async () => {
      (authService.logout as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { req, res, next } = mockReqRes({}, { refreshToken: 'some-token' });
      await authController.logout(req, res, next);

      expect(authService.logout).toHaveBeenCalledWith('some-token');
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', '', expect.objectContaining({ maxAge: 0 }));
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('无 cookie 也正常返回 200', async () => {
      (authService.logout as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { req, res, next } = mockReqRes({}, {});
      await authController.logout(req, res, next);

      expect(authService.logout).toHaveBeenCalledWith(undefined);
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });
  });

  // ─── me ───
  describe('me', () => {
    it('有效 token → 返回用户信息', async () => {
      const mockUser = { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01T00:00:00.000Z' };
      (authService.getMe as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const { req, res, next } = mockReqRes(undefined, undefined, { id: 'u1', role: 'admin' });
      await authController.me(req, res, next);

      expect(authService.getMe).toHaveBeenCalledWith('u1');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockUser });
    });
  });

  // ─── changePassword ───
  describe('changePassword', () => {
    it('成功修改密码 → 清除 cookie + 200', async () => {
      (authService.changePassword as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { req, res, next } = mockReqRes(
        { oldPassword: 'Old1234', newPassword: 'New1234' },
        undefined,
        { id: 'u1', role: 'admin' },
      );
      await authController.changePassword(req, res, next);

      expect(authService.changePassword).toHaveBeenCalledWith('u1', 'Old1234', 'New1234');
      expect(res.cookie).toHaveBeenCalledWith('refreshToken', '', expect.objectContaining({ maxAge: 0 }));
      expect(res.json).toHaveBeenCalledWith({ success: true });
    });

    it('缺少旧密码 → 传递验证错误', async () => {
      const { req, res, next } = mockReqRes(
        { newPassword: 'New1234' },
        undefined,
        { id: 'u1', role: 'admin' },
      );
      await authController.changePassword(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(authService.changePassword).not.toHaveBeenCalled();
    });

    it('缺少新密码 → 传递验证错误', async () => {
      const { req, res, next } = mockReqRes(
        { oldPassword: 'Old1234' },
        undefined,
        { id: 'u1', role: 'admin' },
      );
      await authController.changePassword(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(authService.changePassword).not.toHaveBeenCalled();
    });
  });

  // ─── updateProfile ───
  describe('updateProfile', () => {
    it('成功更新昵称 → 返回用户信息', async () => {
      const mockUser = { id: 'u1', username: 'admin', nickname: '新昵称', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01T00:00:00.000Z' };
      (authService.updateProfile as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const { req, res, next } = mockReqRes(
        { nickname: '新昵称' },
        undefined,
        { id: 'u1', role: 'admin' },
      );
      await authController.updateProfile(req, res, next);

      expect(authService.updateProfile).toHaveBeenCalledWith('u1', '新昵称');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockUser });
    });

    it('缺少昵称 → 传递验证错误', async () => {
      const { req, res, next } = mockReqRes({}, undefined, { id: 'u1', role: 'admin' });
      await authController.updateProfile(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(authService.updateProfile).not.toHaveBeenCalled();
    });
  });
});
