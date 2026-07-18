import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// ── Mocks ──────────────────────────────────────────────────────────────
vi.mock('../utils/appError.js', () => ({
  createAppError: vi.fn((code: string) => {
    const error: any = new Error(`AppError:${code}`);
    error.code = code;
    return error;
  }),
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: {
    projectMember: { findUnique: vi.fn() },
    connection: { findUnique: vi.fn() },
  },
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { roleMiddleware } from './role.js';
import { projectRoleMiddleware } from './projectRole.js';
import { prisma } from '../utils/prisma.js';

// ── Helpers ────────────────────────────────────────────────────────────
function mockReqRes(user?: { id: string; role: string }, overrides: Partial<Request> = {}) {
  const req = {
    user,
    params: {},
    body: {},
    query: {},
    baseUrl: '',
    ...overrides,
  } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

// ── Tests ──────────────────────────────────────────────────────────────
describe('roleMiddleware', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('admin 绕过 → next()', () => {
    const { req, res, next } = mockReqRes({ id: 'admin-1', role: 'admin' });
    roleMiddleware('user')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('匹配 requiredRole → next()', () => {
    const { req, res, next } = mockReqRes({ id: 'user-1', role: 'user' });
    roleMiddleware('user')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('不匹配 requiredRole → next(AppError AUTH_003)', () => {
    const { req, res, next } = mockReqRes({ id: 'user-1', role: 'user' });
    roleMiddleware('admin')(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_003' }));
  });

  it('req.user 不存在 → next(AppError AUTH_002)', () => {
    const { req, res, next } = mockReqRes(undefined);
    roleMiddleware('admin')(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_002' }));
  });
});

describe('projectRoleMiddleware', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('admin 绕过 → next()', async () => {
    const { req, res, next } = mockReqRes({ id: 'admin-1', role: 'admin' });
    await projectRoleMiddleware('owner')(req, res, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('req.user 不存在 → 401 AUTH_002', async () => {
    const { req, res, next } = mockReqRes(undefined);
    await projectRoleMiddleware('owner')(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'AUTH_002' }) }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('从 req.params.id 获取 projectId（projects 路由）→ 查 ProjectMember', async () => {
    (prisma.projectMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: 'owner',
    });
    const { req, res, next } = mockReqRes(
      { id: 'user-1', role: 'user' },
      { params: { id: 'proj-1' }, baseUrl: '/api/v1/projects' },
    );

    await projectRoleMiddleware('editor')(req, res, next);

    expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'proj-1', userId: 'user-1' } },
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('从 req.body.projectId 获取 projectId → 查 ProjectMember', async () => {
    (prisma.projectMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: 'editor',
    });
    const { req, res, next } = mockReqRes(
      { id: 'user-1', role: 'user' },
      { body: { projectId: 'proj-2' } },
    );

    await projectRoleMiddleware('editor')(req, res, next);

    expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'proj-2', userId: 'user-1' } },
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('从 req.query.projectId 获取 projectId → 查 ProjectMember', async () => {
    (prisma.projectMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: 'viewer',
    });
    const { req, res, next } = mockReqRes(
      { id: 'user-1', role: 'user' },
      { query: { projectId: 'proj-3' } },
    );

    await projectRoleMiddleware('viewer')(req, res, next);

    expect(prisma.projectMember.findUnique).toHaveBeenCalledWith({
      where: { projectId_userId: { projectId: 'proj-3', userId: 'user-1' } },
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('无 projectId → 直接 next()（不拦截）', async () => {
    const { req, res, next } = mockReqRes({ id: 'user-1', role: 'user' });
    await projectRoleMiddleware('owner')(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(prisma.projectMember.findUnique).not.toHaveBeenCalled();
  });

  it('用户不是项目成员 → 403', async () => {
    (prisma.projectMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const { req, res, next } = mockReqRes(
      { id: 'user-1', role: 'user' },
      { body: { projectId: 'proj-1' } },
    );

    await projectRoleMiddleware('viewer')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'AUTH_003' }) }),
    );
  });

  it('用户角色层级不足 → 403', async () => {
    (prisma.projectMember.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: 'viewer',
    });
    const { req, res, next } = mockReqRes(
      { id: 'user-1', role: 'user' },
      { body: { projectId: 'proj-1' } },
    );

    // 需要 owner 但用户是 viewer → 层级不足
    await projectRoleMiddleware('owner')(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'AUTH_003' }) }),
    );
  });
});
