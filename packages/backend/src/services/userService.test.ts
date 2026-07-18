import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});

import { prisma } from '../utils/prisma.js';
import { listUsers, searchUsers, getUser, updateUser, deleteUser } from './userService.js';

beforeEach(() => { vi.clearAllMocks(); });

describe('getUser', () => {
  it('用户不存在抛 USER_002', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(getUser('u1')).rejects.toMatchObject({ code: 'USER_002' });
  });
  it('存在则返回', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', username: 'a' });
    await expect(getUser('u1')).resolves.toMatchObject({ id: 'u1' });
  });
});

describe('updateUser - last-admin 保护', () => {
  it('降级最后一个 active admin 抛 AUTH_003', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'admin', isActive: true });
    prisma.user.count.mockResolvedValue(1);
    await expect(updateUser('admin-1', 'u1', { role: 'user' })).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('禁用最后一个 active admin 抛 AUTH_003', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'admin', isActive: true });
    prisma.user.count.mockResolvedValue(1);
    await expect(updateUser('admin-1', 'u1', { isActive: false })).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('正常更新 nickname', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'user', isActive: true });
    prisma.user.update.mockResolvedValue({ id: 'u1', nickname: '新昵称' });
    await expect(updateUser('admin-1', 'u1', { nickname: '新昵称' })).resolves.toMatchObject({ nickname: '新昵称' });
  });
  it('超长 nickname 抛 VAL_001（Plan A 校验接线）', async () => {
    await expect(updateUser('admin-1', 'u1', { nickname: 'a'.repeat(51) })).rejects.toMatchObject({ code: 'VAL_001' });
  });
});

describe('deleteUser - 保护事务', () => {
  it('删自己抛 AUTH_003', async () => {
    await expect(deleteUser('u1', 'u1')).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('删最后一个 active admin 抛 AUTH_003', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', role: 'admin', isActive: true });
    prisma.user.count.mockResolvedValue(1);
    await expect(deleteUser('u1', 'u2')).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('删唯一 owner 抛 MEMBER_003', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', role: 'user', isActive: true });
    prisma.projectMember.findMany.mockResolvedValue([{ projectId: 'p1' }]);
    prisma.projectMember.count.mockResolvedValue(1);
    await expect(deleteUser('u1', 'u2')).rejects.toMatchObject({ code: 'MEMBER_003' });
  });
  it('正常删除', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u2', role: 'user', isActive: true });
    prisma.projectMember.findMany.mockResolvedValue([]);
    prisma.user.delete.mockResolvedValue({ id: 'u2' });
    await expect(deleteUser('u1', 'u2')).resolves.toMatchObject({ id: 'u2' });
  });
});

describe('listUsers / searchUsers', () => {
  it('listUsers 返回分页', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u1' }]);
    prisma.user.count.mockResolvedValue(1);
    const r = await listUsers(1, 20);
    expect(r.data).toHaveLength(1);
    expect(r.pagination.total).toBe(1);
  });
  it('searchUsers 按查询返回', async () => {
    prisma.user.findMany.mockResolvedValue([{ id: 'u1', username: 'a' }]);
    const r = await searchUsers('a');
    expect(r).toHaveLength(1);
  });
});
