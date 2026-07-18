import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});

import { prisma as _prisma } from '../utils/prisma.js';
import { createProject, updateProject, deleteProject, listProjects } from './projectService.js';

const prisma = _prisma as any;

beforeEach(() => { vi.clearAllMocks(); });

function p2025(): Error {
  return Object.assign(new Error('P2025'), { code: 'P2025' });
}

describe('createProject - owner 自动插入事务', () => {
  it('建项目 + 插 owner 成员', async () => {
    prisma.project.create.mockImplementation(async (args: any) => ({
      id: 'p1', name: args.data.name, description: null, icon: 'folder',
      createdBy: 'u1', updatedBy: 'u1', createdAt: new Date(), updatedAt: new Date(),
    }));
    prisma.projectMember.create.mockResolvedValue({});
    prisma.user.findMany.mockResolvedValue([]);
    const r = await createProject('u1', { name: 'proj' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(r).toMatchObject({ name: 'proj' });
  });
});

describe('updateProject', () => {
  it('P2025 不存在抛 PROJ_002', async () => {
    prisma.project.update.mockRejectedValue(p2025());
    await expect(updateProject('u1', 'p1', { name: 'new' })).rejects.toMatchObject({ code: 'PROJ_002' });
  });
  it('正常更新', async () => {
    prisma.project.update.mockResolvedValue({
      id: 'p1', name: 'new', icon: 'folder', description: null,
      createdBy: 'u1', updatedBy: 'u1', createdAt: new Date(), updatedAt: new Date(),
    });
    prisma.user.findMany.mockResolvedValue([]);
    await expect(updateProject('u1', 'p1', { name: 'new' })).resolves.toMatchObject({ name: 'new' });
  });
});

describe('deleteProject', () => {
  it('P2025 不存在抛 PROJ_002', async () => {
    prisma.project.delete.mockRejectedValue(p2025());
    await expect(deleteProject('p1')).rejects.toMatchObject({ code: 'PROJ_002' });
  });
  it('正常删除', async () => {
    prisma.project.delete.mockResolvedValue({ id: 'p1' });
    await expect(deleteProject('p1')).resolves.toMatchObject({ id: 'p1' });
  });
});

describe('listProjects', () => {
  it('admin 看全部', async () => {
    prisma.project.findMany.mockResolvedValue([]);
    prisma.project.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    const r = await listProjects('u1', 'admin');
    expect(r.pagination.total).toBe(0);
  });
});
