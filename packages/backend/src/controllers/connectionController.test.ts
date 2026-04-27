// packages/backend/src/controllers/connectionController.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock modules before imports
vi.mock('../services/connectionService.js', () => ({
  listConnections: vi.fn(),
  createConnection: vi.fn(),
  getConnection: vi.fn(),
  updateConnection: vi.fn(),
  deleteConnection: vi.fn(),
  decryptPassword: vi.fn(),
}));

import * as connectionController from './connectionController.js';
import * as connectionService from '../services/connectionService.js';
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

describe('connectionController', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  // ─── listConnections ───
  describe('listConnections', () => {
    it('返回连接列表 + 分页信息', async () => {
      const mockResult = {
        data: [
          {
            id: 'c1', projectId: 'p1', name: '测试连接', host: '192.168.1.1',
            port: 3389, protocol: 'RDP', vpnType: null, tags: null,
            lastAccessed: null, createdBy: 'u1',
            createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        pagination: { page: 1, pageSize: 20, total: 1 },
      };
      (connectionService.listConnections as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const { req, res, next } = mockReqRes(
        undefined,
        { page: '1', pageSize: '20', projectId: 'p1' },
        undefined,
        { id: 'u1', role: 'owner' },
      );
      await connectionController.listConnections(req, res, next);

      expect(connectionService.listConnections).toHaveBeenCalledWith('u1', 'owner', 'p1', 1, 20);
      expect(res.json).toHaveBeenCalledWith({ success: true, ...mockResult });
      expect(next).not.toHaveBeenCalled();
    });

    it('无分页参数 → 使用默认值', async () => {
      const mockResult = {
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0 },
      };
      (connectionService.listConnections as ReturnType<typeof vi.fn>).mockResolvedValue(mockResult);

      const { req, res, next } = mockReqRes(undefined, {}, undefined, { id: 'u1', role: 'admin' });
      await connectionController.listConnections(req, res, next);

      expect(connectionService.listConnections).toHaveBeenCalledWith('u1', 'admin', undefined, 1, 20);
    });

    it('service 抛错 → 传递到 next', async () => {
      const error = new Error('DB error');
      (connectionService.listConnections as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(undefined, {}, undefined, { id: 'u1', role: 'user' });
      await connectionController.listConnections(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── createConnection ───
  describe('createConnection', () => {
    it('创建连接 → 201', async () => {
      const mockData = {
        id: 'c1', projectId: 'p1', name: '新连接', host: '10.0.0.1',
        port: 22, username: 'admin', protocol: 'SSH',
        vpnType: null, vpnLoginUrl: null, requiredVpnId: null,
        notes: null, tags: null, lastAccessed: null,
        createdBy: 'u1', updatedBy: 'u1',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      };
      (connectionService.createConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

      const { req, res, next } = mockReqRes(
        undefined, undefined,
        { projectId: 'p1', name: '新连接', host: '10.0.0.1', port: 22, protocol: 'SSH', username: 'admin' },
        { id: 'u1', role: 'editor' },
      );
      await connectionController.createConnection(req, res, next);

      expect(connectionService.createConnection).toHaveBeenCalledWith('u1', req.body);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockData });
      expect(next).not.toHaveBeenCalled();
    });

    it('名称冲突 → 传递 CONN_005 到 next', async () => {
      const error = new Error('CONN_005') as any;
      error.code = 'CONN_005';
      error.statusCode = 409;
      (connectionService.createConnection as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(
        undefined, undefined,
        { projectId: 'p1', name: '重复名', host: '10.0.0.1', protocol: 'SSH' },
        { id: 'u1', role: 'editor' },
      );
      await connectionController.createConnection(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('验证失败 → 传递 VAL_001 到 next', async () => {
      const error = new Error('VAL_001') as any;
      error.code = 'VAL_001';
      error.statusCode = 422;
      error.details = [{ field: 'name', message: '连接名称不能为空' }];
      (connectionService.createConnection as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(
        undefined, undefined,
        { projectId: 'p1', name: '', host: '10.0.0.1', protocol: 'SSH' },
        { id: 'u1', role: 'editor' },
      );
      await connectionController.createConnection(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── getConnection ───
  describe('getConnection', () => {
    it('有效 ID → 返回连接详情', async () => {
      const mockData = {
        id: 'c1', projectId: 'p1', name: '测试连接', host: '10.0.0.1',
        port: 22, username: 'admin', protocol: 'SSH',
        vpnType: null, vpnLoginUrl: null, requiredVpnId: null,
        notes: null, tags: null, lastAccessed: null,
        createdBy: 'u1', updatedBy: 'u1',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      };
      (connectionService.getConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

      const { req, res, next } = mockReqRes({ id: 'c1' }, undefined, undefined, { id: 'u1', role: 'viewer' });
      await connectionController.getConnection(req, res, next);

      expect(connectionService.getConnection).toHaveBeenCalledWith('c1', 'viewer');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockData });
      expect(next).not.toHaveBeenCalled();
    });

    it('连接不存在 → 传递 CONN_002 到 next', async () => {
      const error = new Error('CONN_002') as any;
      error.code = 'CONN_002';
      error.statusCode = 404;
      (connectionService.getConnection as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'nonexist' }, undefined, undefined, { id: 'u1', role: 'viewer' });
      await connectionController.getConnection(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── updateConnection ───
  describe('updateConnection', () => {
    it('更新连接名 → 返回更新后的连接', async () => {
      const mockData = {
        id: 'c1', projectId: 'p1', name: '更新后', host: '10.0.0.1',
        port: 22, username: 'admin', protocol: 'SSH',
        vpnType: null, vpnLoginUrl: null, requiredVpnId: null,
        notes: null, tags: null, lastAccessed: null,
        createdBy: 'u1', updatedBy: 'u1',
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
      };
      (connectionService.updateConnection as ReturnType<typeof vi.fn>).mockResolvedValue(mockData);

      const { req, res, next } = mockReqRes(
        { id: 'c1' }, undefined,
        { name: '更新后' },
        { id: 'u1', role: 'editor' },
      );
      await connectionController.updateConnection(req, res, next);

      expect(connectionService.updateConnection).toHaveBeenCalledWith('u1', 'c1', { name: '更新后' });
      expect(res.json).toHaveBeenCalledWith({ success: true, data: mockData });
      expect(next).not.toHaveBeenCalled();
    });

    it('连接不存在 → 传递 CONN_002 到 next', async () => {
      const error = new Error('CONN_002') as any;
      error.code = 'CONN_002';
      error.statusCode = 404;
      (connectionService.updateConnection as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(
        { id: 'nonexist' }, undefined,
        { name: 'test' },
        { id: 'u1', role: 'editor' },
      );
      await connectionController.updateConnection(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('VPN 仍被依赖 → 传递 CONN_004 到 next', async () => {
      const error = new Error('CONN_004') as any;
      error.code = 'CONN_004';
      error.statusCode = 409;
      (connectionService.updateConnection as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes(
        { id: 'c1' }, undefined,
        { protocol: 'SSH' },
        { id: 'u1', role: 'editor' },
      );
      await connectionController.updateConnection(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── deleteConnection ───
  describe('deleteConnection', () => {
    it('删除连接 → 返回被删除连接 ID', async () => {
      (connectionService.deleteConnection as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c1' });

      const { req, res, next } = mockReqRes({ id: 'c1' }, undefined, undefined, { id: 'u1', role: 'editor' });
      await connectionController.deleteConnection(req, res, next);

      expect(connectionService.deleteConnection).toHaveBeenCalledWith('c1');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { id: 'c1' } });
      expect(next).not.toHaveBeenCalled();
    });

    it('连接不存在 → 传递 CONN_002 到 next', async () => {
      const error = new Error('CONN_002') as any;
      error.code = 'CONN_002';
      error.statusCode = 404;
      (connectionService.deleteConnection as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'nonexist' }, undefined, undefined, { id: 'u1', role: 'editor' });
      await connectionController.deleteConnection(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });

    it('VPN 仍被依赖 → 传递 CONN_004 到 next', async () => {
      const error = new Error('CONN_004') as any;
      error.code = 'CONN_004';
      error.statusCode = 409;
      (connectionService.deleteConnection as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'c1' }, undefined, undefined, { id: 'u1', role: 'editor' });
      await connectionController.deleteConnection(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });

  // ─── decryptPassword ───
  describe('decryptPassword', () => {
    it('解密密码 → 返回明文', async () => {
      (connectionService.decryptPassword as ReturnType<typeof vi.fn>).mockResolvedValue({ password: 'secret123' });

      const { req, res, next } = mockReqRes({ id: 'c1' }, undefined, undefined, { id: 'u1', role: 'editor' });
      await connectionController.decryptPassword(req, res, next);

      expect(connectionService.decryptPassword).toHaveBeenCalledWith('c1');
      expect(res.json).toHaveBeenCalledWith({ success: true, data: { password: 'secret123' } });
      expect(next).not.toHaveBeenCalled();
    });

    it('连接不存在 → 传递 CONN_002 到 next', async () => {
      const error = new Error('CONN_002') as any;
      error.code = 'CONN_002';
      error.statusCode = 404;
      (connectionService.decryptPassword as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { req, res, next } = mockReqRes({ id: 'nonexist' }, undefined, undefined, { id: 'u1', role: 'editor' });
      await connectionController.decryptPassword(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
    });
  });
});
