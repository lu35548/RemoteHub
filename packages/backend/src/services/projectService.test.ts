import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});
// #47：projectService 将 import notificationService（转让通知）——mock 工厂随 import 扩展
vi.mock('./notificationService.js', () => ({ emitToProjectMembers: vi.fn().mockResolvedValue(undefined) }));

import { prisma as _prisma } from '../utils/prisma.js';
import { emitToProjectMembers } from './notificationService.js';
import {
  createProject, updateProject, deleteProject, listProjects,
  archiveProject, restoreProject, copyProject, transferProjectOwnership, batchArchiveProjects,
} from './projectService.js';

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

  it('P2002 name 冲突抛 PROJ_001', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target: ['name'] },
    });
    prisma.project.create.mockRejectedValue(p2002);
    await expect(createProject('u1', { name: 'dup' })).rejects.toMatchObject({ code: 'PROJ_001' });
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
  it('批13b-A6:pageSize=600 → take 500（超上限 clamp 到 MAX_PAGE_SIZE=500）', async () => {
    prisma.project.findMany.mockResolvedValue([]);
    prisma.project.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    await listProjects('u1', 'admin', 1, 600);
    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
  });
});

// ─── #47 项目管理增强：status 字段 + 归档/复制/转让/批量归档 ───

describe('#47 listProjects 归档过滤', () => {
  beforeEach(() => {
    prisma.project.findMany.mockResolvedValue([]);
    prisma.project.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
  });

  it('缺省 archived=false → where 锁 status=active（默认列表不显归档）', async () => {
    await listProjects('u1', 'admin');
    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'active' }),
    }));
  });

  it('archived=true → where status=archived（归档视图专用）', async () => {
    await listProjects('u1', 'admin', 1, 20, true);
    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'archived' }),
    }));
    expect(prisma.project.count).toHaveBeenCalledWith({ where: { status: 'archived' } });
  });
});

describe('#47 archiveProject / restoreProject', () => {
  const row = (status: string) => ({
    id: 'p1', name: 'proj', description: null, icon: 'folder', status,
    createdBy: 'u1', updatedBy: 'u1', createdAt: new Date(), updatedAt: new Date(),
  });

  it('归档置 status=archived + updatedBy=操作者', async () => {
    prisma.project.findUnique.mockResolvedValue(row('active'));
    prisma.project.update.mockResolvedValue(row('archived'));
    prisma.user.findMany.mockResolvedValue([]);
    const r = await archiveProject('u1', 'p1');
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1' },
      data: expect.objectContaining({ status: 'archived', updatedBy: 'u1' }),
    }));
    expect(r.status).toBe('archived');
  });

  it('恢复置 status=active', async () => {
    prisma.project.findUnique.mockResolvedValue(row('archived'));
    prisma.project.update.mockResolvedValue(row('active'));
    prisma.user.findMany.mockResolvedValue([]);
    const r = await restoreProject('u1', 'p1');
    expect(prisma.project.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'active' }),
    }));
    expect(r.status).toBe('active');
  });

  it('项目不存在 → PROJ_002（归档/恢复同门）', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(archiveProject('u1', 'p404')).rejects.toMatchObject({ code: 'PROJ_002' });
    await expect(restoreProject('u1', 'p404')).rejects.toMatchObject({ code: 'PROJ_002' });
  });
});

describe('#47 copyProject', () => {
  const srcRow = { id: 'p1', name: 'proj', description: null, icon: 'folder', status: 'active', createdBy: 'u1', updatedBy: 'u1', createdAt: new Date(), updatedAt: new Date() };

  it('源项目不存在 → PROJ_002', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(copyProject('u1', 'p404')).rejects.toMatchObject({ code: 'PROJ_002' });
  });

  it('rev-47 major:并发复制撞 Project.name @unique → P2002 映射 PROJ_001(不再裸抛 500,对齐 createProject)', async () => {
    prisma.project.findUnique.mockResolvedValue(srcRow);
    prisma.project.findMany.mockResolvedValue([]); // 递增名「proj (副本)」
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique constraint failed', {
      code: 'P2002',
      clientVersion: '6.19.3',
      meta: { target: ['name'] },
    });
    prisma.project.create.mockRejectedValue(p2002);
    await expect(copyProject('u1', 'p1')).rejects.toMatchObject({ code: 'PROJ_001' });
  });

  it('rev-47 minor-1:源名顶格(100)+「 (副本)」超长 → VAL_001', async () => {
    prisma.project.findUnique.mockResolvedValue({ ...srcRow, name: 'X'.repeat(100) });
    prisma.project.findMany.mockResolvedValue([]);
    await expect(copyProject('u1', 'p1')).rejects.toMatchObject({ code: 'VAL_001' });
  });
});

describe('#47 transferProjectOwnership', () => {
  const project = { id: 'p1', name: 'proj', description: null, icon: 'folder', status: 'active', createdBy: 'uA', updatedBy: 'uA', createdAt: new Date(), updatedAt: new Date() };

  function mockHappy(oldOwner: string, newOwner: string, targetRole = 'viewer') {
    prisma.project.findUnique.mockResolvedValue(project);
    prisma.projectMember.findUnique.mockResolvedValue({ id: 'mTarget', projectId: 'p1', userId: newOwner, role: targetRole });
    prisma.projectMember.findFirst.mockResolvedValue({ id: 'mOwner', projectId: 'p1', userId: oldOwner, role: 'owner' });
  }

  it('事务内先升新 owner 后降原 owner（调用顺序锁死——绕开 last-owner 保护 MEMBER_002 的兑现证据）', async () => {
    mockHappy('uA', 'uB');
    const idToUser: Record<string, string> = { mTarget: 'uB', mOwner: 'uA' };
    const calls: Array<{ userId: string; role: string }> = [];
    prisma.projectMember.update.mockImplementation(async (args: any) => {
      calls.push({ userId: idToUser[args.where.id as string] ?? '<unknown>', role: args.data.role });
      return { id: args.where.id, role: args.data.role };
    });
    const r = await transferProjectOwnership('p1', 'uB');
    expect(calls).toEqual([
      { userId: 'uB', role: 'owner' },  // 先升
      { userId: 'uA', role: 'editor' }, // 后降（此时 owner count 已 2，不触发 MEMBER_002）
    ]);
    expect(r).toEqual({ projectId: 'p1', fromUserId: 'uA', toUserId: 'uB' });
  });

  it('唯一 owner 转出成功（last-owner 边界：转让专用事务不落 MEMBER_002 拒绝）', async () => {
    mockHappy('uA', 'uB');
    prisma.projectMember.update.mockResolvedValue({ id: 'm1', role: 'owner' });
    await expect(transferProjectOwnership('p1', 'uB')).resolves.toBeDefined();
  });

  it('转让给当前 owner（自己）→ VAL_001', async () => {
    mockHappy('uA', 'uA', 'owner');
    await expect(transferProjectOwnership('p1', 'uA')).rejects.toMatchObject({ code: 'VAL_001' });
  });

  it('目标不是项目成员 → MEMBER_001', async () => {
    prisma.project.findUnique.mockResolvedValue(project);
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(transferProjectOwnership('p1', 'uX')).rejects.toMatchObject({ code: 'MEMBER_001' });
  });

  it('项目不存在 → PROJ_002', async () => {
    prisma.project.findUnique.mockResolvedValue(null);
    await expect(transferProjectOwnership('p404', 'uB')).rejects.toMatchObject({ code: 'PROJ_002' });
  });

  it('通知双发（新 owner 升 + 原 owner 降，各一条 MEMBER_ROLE_UPDATED）', async () => {
    mockHappy('uA', 'uB');
    prisma.projectMember.update.mockResolvedValue({ id: 'm1', role: 'owner' });
    await transferProjectOwnership('p1', 'uB');
    expect(emitToProjectMembers).toHaveBeenCalledTimes(2);
    expect(emitToProjectMembers).toHaveBeenCalledWith('p1', expect.objectContaining({ type: 'MEMBER_ROLE_UPDATED' }));
  });
});

describe('#47 batchArchiveProjects', () => {
  const base = { operatorUserId: 'u1', operatorRole: 'user', ip: undefined, userAgent: undefined };

  it.each([
    ['空数组', { ...base, ids: [] }],
    ['非数组', { ...base, ids: 'p1' }],
    ['超 50 上限', { ...base, ids: Array.from({ length: 51 }, (_, i) => `p${i}`) }],
    ['含非 string 项', { ...base, ids: ['p1', 42] }],
  ])('%s → VAL_001', async (_name, params) => {
    await expect(batchArchiveProjects(params)).rejects.toMatchObject({ code: 'VAL_001' });
  });
});
