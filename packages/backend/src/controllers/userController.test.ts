// packages/backend/src/controllers/userController.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
vi.mock('../services/userService.js', () => ({
  listUsers: vi.fn(),
  searchUsers: vi.fn(),
  getUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
}));

import * as userController from './userController.js';
import * as userService from '../services/userService.js';
import type { Request, Response, NextFunction } from 'express';

function mockReqRes(
  params?: Record<string, string>,
  query?: Record<string, string>,
  body?: Record<string, unknown>,
  user?: { id: string; role: string },
) {
  const req = {
    params: params ?? {},
    query: query ?? {},
    body: body ?? {},
    user,
  } as unknown as Request;
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('userController', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── listUsers ───
  describe('listUsers', () => {
    it('返回用户列表 + 分页信息', async () => {
      const mockResult = {
        data: [
          { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01T00:00:00.000Z' },
          { id: 'u2', username: 'user1', nickname: '用户1', role: 'user', isActive: true, lastActiveAt: null, createdAt: '2026-01-02T00:00:00.000Z' },
        ],
        pagination: { page: 1, pageSize: 20, total: 2 },
      };
      (userService.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const { req, res, next } = mockReqRes(undefined, { page: '1', pageSize: '20' }, undefined, { id: 'u1', role: 'admin' });
      await userController.listUsers(req, res, next);

      expect(userService.listUsers).toHaveBeenCalledWith(1, 20);
      expect(res.json).toHaveBeenCalledWith({ success: true, ...mockResult });
      expect(next).not.toHaveBeenCalled();
    });

    it('无分页参数 → 使用默认值', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0 },
      };
      (userService.listUsers as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const { req, res, next } = mockReqRes(undefined, {}, undefined, { id: 'u1', role: 'admin' });
      await userController.listUsers(req, res, next);

      expect(userService.listUsers).toHaveBeenCalledWith(1, 20);
      expect(res.json).toHaveBeenCalledWith({ success: true, ...mockResult });
    });

    it('service 抛错 → 传递到 next', async () => {
      const error = new Error('DB error');
      (userService.listUsers as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(undefined, {}, undefined, { id: 'u1', role: 'admin' });
      await userController.listUsers(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── searchUsers ───
  describe('searchUsers', () => {
    it('有效查询 → 返回匹配用户', async () => {
      const mockData = [
        { id: 'u2', username: 'testuser', nickname: '测试用户' },
      ];
      (userService.searchUsers as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

      const { req, res, next } = mockReqRes(undefined, { q: 'test' }, undefined, { id: 'u1', role: 'admin' });
      await userController.searchUsers(req, res, next);

      expect(userService.searchUsers).toHaveBeenCalledWith('test');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockData });
      expect(next).not.toHaveBeenCalled();
    });

    it('空查询 → 返回空数组', async () => {
      const { req, res, next } = mockReqRes(undefined, { q: '' }, undefined, { id: 'u1', role: 'admin' });
      await userController.searchUsers(req, res, next);

      expect(userService.searchUsers).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
    });

    it('service 抛错 → 传递到 next', async () => {
      const error = new Error('DB error');
      (userService.searchUsers as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(undefined, { q: 'test' }, undefined, { id: 'u1', role: 'admin' });
      await userController.searchUsers(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── getUser ───
  describe('getUser', () => {
    it('有效 ID → 返回用户详情', async () => {
      const mockUser = { id: 'u2', username: 'user1', nickname: '用户1', role: 'user', isActive: true, lastActiveAt: null, createdAt: '2026-01-02T00:00:00.000Z' };
      (userService.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser);

      const { req, res, next } = mockReqRes({ id: 'u2' }, undefined, undefined, { id: 'u1', role: 'admin' });
      await userController.getUser(req, res, next);

      expect(userService.getUser).toHaveBeenCalledWith('u2');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockUser });
      expect(next).not.toHaveBeenCalled();
    });

    it('用户不存在 → 传递 USER_002 到 next', async () => {
      const error = new Error('USER_002') as any;
      error.code = 'USER_002';
      error.statusCode = 404;
      (userService.getUser as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'nonexist' }, undefined, undefined, { id: 'u1', role: 'admin' });
      await userController.getUser(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── updateUser ───
  describe('updateUser', () => {
    it('修改昵称 → 返回更新后的用户', async () => {
      const mockUpdated = { id: 'u2', username: 'user1', nickname: '新昵称', role: 'user', isActive: true, lastActiveAt: null, createdAt: '2026-01-02T00:00:00.000Z' };
      (userService.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(mockUpdated);

      const { req, res, next } = mockReqRes({ id: 'u2' }, undefined, { nickname: '新昵称' }, { id: 'u1', role: 'admin' });
      await userController.updateUser(req, res, next);

      expect(userService.updateUser).toHaveBeenCalledWith('u1', 'u2', { nickname: '新昵称' });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockUpdated });
      expect(next).not.toHaveBeenCalled();
    });

    it('修改角色 → 传递正确参数', async () => {
      const mockUpdated = { id: 'u2', username: 'user1', nickname: '用户1', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-02T00:00:00.000Z' };
      (userService.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(mockUpdated);

      const { req, res, next } = mockReqRes({ id: 'u2' }, undefined, { role: 'admin' }, { id: 'u1', role: 'admin' });
      await userController.updateUser(req, res, next);

      expect(userService.updateUser).toHaveBeenCalledWith('u1', 'u2', { role: 'admin' });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockUpdated });
    });

    it('降级最后一个 admin → 传递 AUTH_003 到 next', async () => {
      const error = new Error('AUTH_003') as any;
      error.code = 'AUTH_003';
      error.statusCode = 403;
      (userService.updateUser as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'u1' }, undefined, { role: 'user' }, { id: 'u2', role: 'admin' });
      await userController.updateUser(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── deleteUser ───
  describe('deleteUser', () => {
    it('删除普通用户 → 返回被删除用户 ID', async () => {
      (userService.deleteUser as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'u2' });

      const { req, res, next } = mockReqRes({ id: 'u2' }, undefined, undefined, { id: 'u1', role: 'admin' });
      await userController.deleteUser(req, res, next);

      expect(userService.deleteUser).toHaveBeenCalledWith('u1', 'u2');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'u2' } });
      expect(next).not.toHaveBeenCalled();
    });

    it('删除自己 → 传递 AUTH_003 到 next', async () => {
      const error = new Error('AUTH_003') as any;
      error.code = 'AUTH_003';
      error.statusCode = 403;
      (userService.deleteUser as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'u1' }, undefined, undefined, { id: 'u1', role: 'admin' });
      await userController.deleteUser(req, res, next);

      expect(userService.deleteUser).toHaveBeenCalledWith('u1', 'u1');
      expect(next).toHaveBeenCalledWith(error);
    });

    it('删除最后一个 admin → 传递 AUTH_003 到 next', async () => {
      const error = new Error('AUTH_003') as any;
      error.code = 'AUTH_003';
      error.statusCode = 403;
      (userService.deleteUser as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'u3' }, undefined, undefined, { id: 'u1', role: 'admin' });
      await userController.deleteUser(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('删除唯一项目 owner → 传递 MEMBER_003 到 next', async () => {
      const error = new Error('MEMBER_003') as any;
      error.code = 'MEMBER_003';
      error.statusCode = 409;
      (userService.deleteUser as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'u2' }, undefined, undefined, { id: 'u1', role: 'admin' });
      await userController.deleteUser(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
