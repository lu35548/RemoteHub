// packages/backend/src/controllers/projectController.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
vi.mock('../services/projectService.js', () => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  getProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
}));

import * as projectController from './projectController.js';
import * as projectService from '../services/projectService.js';
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

describe('projectController', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── listProjects ───
  describe('listProjects', () => {
    it('返回项目列表 + 分页信息', async () => {
      const mockResult = {
        data: [
          {
            id: 'p1', name: '测试项目', icon: 'folder',
            createdBy: 'u1', updatedBy: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
            currentUserRole: 'owner',
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1 },
      };
      (projectService.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const { req, res, next } = mockReqRes(undefined, { page: '1', pageSize: '20' }, undefined, { id: 'u1', role: 'user' });
      await projectController.listProjects(req, res, next);

      expect(projectService.listProjects).toHaveBeenCalledWith('u1', 'user', 1, 20);
      expect(res.json).toHaveBeenCalledWith({ success: true, ...mockResult });
      expect(next).not.toHaveBeenCalled();
    });

    it('无分页参数 → 使用默认值', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0 },
      };
      (projectService.listProjects as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const { req, res, next } = mockReqRes(undefined, {}, undefined, { id: 'u1', role: 'admin' });
      await projectController.listProjects(req, res, next);

      expect(projectService.listProjects).toHaveBeenCalledWith('u1', 'admin', 1, 20);
      expect(res.json).toHaveBeenCalledWith({ success: true, ...mockResult });
    });

    it('service 抛错 → 传递到 next', async () => {
      const error = new Error('DB error');
      (projectService.listProjects as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(undefined, {}, undefined, { id: 'u1', role: 'user' });
      await projectController.listProjects(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── createProject ───
  describe('createProject', () => {
    it('创建项目 → 201 + 自动成为 owner', async () => {
      const mockData = {
        id: 'p1', name: '新项目', description: '描述', icon: 'folder',
        createdBy: { id: 'u1', nickname: '已删除用户' },
        updatedBy: { id: 'u1', nickname: '已删除用户' },
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      };
      (projectService.createProject as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

      const { req, res, next } = mockReqRes(undefined, undefined, { name: '新项目', description: '描述' }, { id: 'u1', role: 'user' });
      await projectController.createProject(req, res, next);

      expect(projectService.createProject).toHaveBeenCalledWith('u1', { name: '新项目', description: '描述' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockData });
      expect(next).not.toHaveBeenCalled();
    });

    it('项目名冲突 → 传递 PROJ_001 到 next', async () => {
      const error = new Error('PROJ_001') as any;
      error.code = 'PROJ_001';
      error.statusCode = 409;
      (projectService.createProject as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(undefined, undefined, { name: '重复名' }, { id: 'u1', role: 'user' });
      await projectController.createProject(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('验证失败 → 传递 VAL_001 到 next', async () => {
      const error = new Error('VAL_001') as any;
      error.code = 'VAL_001';
      error.statusCode = 422;
      error.details = [{ field: 'name', message: '项目名称不合法' }];
      (projectService.createProject as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(undefined, undefined, { name: '' }, { id: 'u1', role: 'user' });
      await projectController.createProject(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── getProject ───
  describe('getProject', () => {
    it('有效 ID → 返回项目详情', async () => {
      const mockData = {
        id: 'p1', name: '测试项目', description: null, icon: 'folder',
        createdBy: { id: 'u1', nickname: '已删除用户' },
        updatedBy: { id: 'u1', nickname: '已删除用户' },
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      };
      (projectService.getProject as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

      const { req, res, next } = mockReqRes({ id: 'p1' }, undefined, undefined, { id: 'u1', role: 'user' });
      await projectController.getProject(req, res, next);

      expect(projectService.getProject).toHaveBeenCalledWith('p1');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockData });
      expect(next).not.toHaveBeenCalled();
    });

    it('项目不存在 → 传递 PROJ_002 到 next', async () => {
      const error = new Error('PROJ_002') as any;
      error.code = 'PROJ_002';
      error.statusCode = 404;
      (projectService.getProject as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'nonexist' }, undefined, undefined, { id: 'u1', role: 'user' });
      await projectController.getProject(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── updateProject ───
  describe('updateProject', () => {
    it('更新项目名 → 返回更新后的项目', async () => {
      const mockData = {
        id: 'p1', name: '更新后的项目', description: null, icon: 'folder',
        createdBy: { id: 'u1', nickname: '已删除用户' },
        updatedBy: { id: 'u1', nickname: '已删除用户' },
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      };
      (projectService.updateProject as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

      const { req, res, next } = mockReqRes({ id: 'p1' }, undefined, { name: '更新后的项目' }, { id: 'u1', role: 'user' });
      await projectController.updateProject(req, res, next);

      expect(projectService.updateProject).toHaveBeenCalledWith('u1', 'p1', { name: '更新后的项目' });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockData });
      expect(next).not.toHaveBeenCalled();
    });

    it('项目不存在 → 传递 PROJ_002 到 next', async () => {
      const error = new Error('PROJ_002') as any;
      error.code = 'PROJ_002';
      error.statusCode = 404;
      (projectService.updateProject as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'nonexist' }, undefined, { name: 'test' }, { id: 'u1', role: 'user' });
      await projectController.updateProject(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('验证失败 → 传递 VAL_001 到 next', async () => {
      const error = new Error('VAL_001') as any;
      error.code = 'VAL_001';
      error.statusCode = 422;
      error.details = [{ field: 'name', message: '项目名称不合法' }];
      (projectService.updateProject as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'p1' }, undefined, { name: '' }, { id: 'u1', role: 'user' });
      await projectController.updateProject(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── deleteProject ───
  describe('deleteProject', () => {
    it('删除项目 → 返回被删除项目 ID', async () => {
      (projectService.deleteProject as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p1' });

      const { req, res, next } = mockReqRes({ id: 'p1' }, undefined, undefined, { id: 'u1', role: 'user' });
      await projectController.deleteProject(req, res, next);

      expect(projectService.deleteProject).toHaveBeenCalledWith('p1');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'p1' } });
      expect(next).not.toHaveBeenCalled();
    });

    it('项目不存在 → 传递 PROJ_002 到 next', async () => {
      const error = new Error('PROJ_002') as any;
      error.code = 'PROJ_002';
      error.statusCode = 404;
      (projectService.deleteProject as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'nonexist' }, undefined, undefined, { id: 'u1', role: 'user' });
      await projectController.deleteProject(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
