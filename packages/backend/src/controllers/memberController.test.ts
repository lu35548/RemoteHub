// packages/backend/src/controllers/memberController.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
vi.mock('../services/memberService.js', () => ({
  listMembers: vi.fn(),
  addMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));

import * as memberController from './memberController.js';
import * as memberService from '../services/memberService.js';
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

describe('memberController', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── listMembers ───
  describe('listMembers', () => {
    it('返回成员列表 + 分页信息', async () => {
      const mockResult = {
        data: [
          {
            id: 'm1', userId: 'u2', role: 'editor',
            addedAt: '2026-01-01T00:00:00.000Z',
            username: 'testuser', nickname: '测试用户',
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1 },
      };
      (memberService.listMembers as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const { req, res, next } = mockReqRes(
        { id: 'p1' },
        { page: '1', pageSize: '20' },
        undefined,
        { id: 'u1', role: 'owner' },
      );
      await memberController.listMembers(req, res, next);

      expect(memberService.listMembers).toHaveBeenCalledWith('p1', 1, 20);
      expect(res.json).toHaveBeenCalledWith({ success: true, ...mockResult });
      expect(next).not.toHaveBeenCalled();
    });

    it('无分页参数 → 使用默认值', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0 },
      };
      (memberService.listMembers as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const { req, res, next } = mockReqRes({ id: 'p1' }, {}, undefined, { id: 'u1', role: 'viewer' });
      await memberController.listMembers(req, res, next);

      expect(memberService.listMembers).toHaveBeenCalledWith('p1', 1, 20);
    });

    it('service 抛错 → 传递到 next', async () => {
      const error = new Error('DB error');
      (memberService.listMembers as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'p1' }, {}, undefined, { id: 'u1', role: 'viewer' });
      await memberController.listMembers(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── addMember ───
  describe('addMember', () => {
    it('添加成员 → 201', async () => {
      const mockData = { id: 'm2', userId: 'u3', role: 'editor', addedAt: '2026-01-01T00:00:00.000Z' };
      (memberService.addMember as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

      const { req, res, next } = mockReqRes(
        { id: 'p1' }, undefined,
        { userId: 'u3', role: 'editor' },
        { id: 'u1', role: 'owner' },
      );
      await memberController.addMember(req, res, next);

      expect(memberService.addMember).toHaveBeenCalledWith('p1', 'u3', 'editor');
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockData });
      expect(next).not.toHaveBeenCalled();
    });

    it('成员已存在 → 传递 MEMBER_001 到 next', async () => {
      const error = new Error('MEMBER_001') as any;
      error.code = 'MEMBER_001';
      error.statusCode = 409;
      (memberService.addMember as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(
        { id: 'p1' }, undefined,
        { userId: 'u2', role: 'viewer' },
        { id: 'u1', role: 'owner' },
      );
      await memberController.addMember(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('无效角色 → 传递 VAL_001 到 next', async () => {
      const error = new Error('VAL_001') as any;
      error.code = 'VAL_001';
      error.statusCode = 422;
      error.details = [{ field: 'role', message: '无效的成员角色' }];
      (memberService.addMember as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(
        { id: 'p1' }, undefined,
        { userId: 'u3', role: 'invalid' },
        { id: 'u1', role: 'owner' },
      );
      await memberController.addMember(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── updateRole ───
  describe('updateRole', () => {
    it('更新角色 → 返回更新后的成员', async () => {
      const mockData = { id: 'm1', userId: 'u2', role: 'owner' };
      (memberService.updateMemberRole as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

      const { req, res, next } = mockReqRes(
        { id: 'p1', uid: 'u2' }, undefined,
        { role: 'owner' },
        { id: 'u1', role: 'owner' },
      );
      await memberController.updateRole(req, res, next);

      expect(memberService.updateMemberRole).toHaveBeenCalledWith('p1', 'u2', 'owner', 'u1');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockData });
      expect(next).not.toHaveBeenCalled();
    });

    it('不能降级唯一 owner → 传递 MEMBER_002 到 next', async () => {
      const error = new Error('MEMBER_002') as any;
      error.code = 'MEMBER_002';
      error.statusCode = 403;
      (memberService.updateMemberRole as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(
        { id: 'p1', uid: 'u1' }, undefined,
        { role: 'editor' },
        { id: 'u1', role: 'owner' },
      );
      await memberController.updateRole(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('成员不存在 → 传递 MEMBER_001 到 next', async () => {
      const error = new Error('MEMBER_001') as any;
      error.code = 'MEMBER_001';
      error.statusCode = 409;
      (memberService.updateMemberRole as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(
        { id: 'p1', uid: 'nonexist' }, undefined,
        { role: 'editor' },
        { id: 'u1', role: 'owner' },
      );
      await memberController.updateRole(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── removeMember ───
  describe('removeMember', () => {
    it('移除成员 → 返回被删除成员 ID', async () => {
      (memberService.removeMember as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'm1' });

      const { req, res, next } = mockReqRes(
        { id: 'p1', uid: 'u2' }, undefined, undefined,
        { id: 'u1', role: 'owner' },
      );
      await memberController.removeMember(req, res, next);

      expect(memberService.removeMember).toHaveBeenCalledWith('p1', 'u2', 'u1', 'owner');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'm1' } });
      expect(next).not.toHaveBeenCalled();
    });

    it('不能移除唯一 owner → 传递 MEMBER_002 到 next', async () => {
      const error = new Error('MEMBER_002') as any;
      error.code = 'MEMBER_002';
      error.statusCode = 403;
      (memberService.removeMember as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(
        { id: 'p1', uid: 'u1' }, undefined, undefined,
        { id: 'u2', role: 'owner' },
      );
      await memberController.removeMember(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('成员不存在 → 传递 MEMBER_001 到 next', async () => {
      const error = new Error('MEMBER_001') as any;
      error.code = 'MEMBER_001';
      error.statusCode = 409;
      (memberService.removeMember as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(
        { id: 'p1', uid: 'nonexist' }, undefined, undefined,
        { id: 'u1', role: 'owner' },
      );
      await memberController.removeMember(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
