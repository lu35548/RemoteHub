import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});

import { prisma as _prisma } from '../utils/prisma.js';
import { addMember, updateMemberRole, removeMember, listMembers } from './memberService.js';

const prisma = _prisma as any;

beforeEach(() => { vi.clearAllMocks(); });

describe('addMember', () => {
  it('无效角色抛 VAL_001', async () => {
    await expect(addMember('p1', 'u1', 'invalid')).rejects.toMatchObject({ code: 'VAL_001' });
  });
  it('用户不存在抛 USER_002', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(addMember('p1', 'u1', 'editor')).rejects.toMatchObject({ code: 'USER_002' });
  });
  it('已存在抛 MEMBER_001', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.projectMember.findUnique.mockResolvedValue({ id: 'm1' });
    await expect(addMember('p1', 'u1', 'editor')).rejects.toMatchObject({ code: 'MEMBER_001' });
  });
  it('正常添加', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    prisma.projectMember.findUnique.mockResolvedValue(null);
    prisma.projectMember.create.mockResolvedValue({ id: 'm1', addedAt: new Date() });
    await expect(addMember('p1', 'u1', 'editor')).resolves.toMatchObject({ userId: 'u1', role: 'editor' });
  });
});

describe('updateMemberRole - last-owner 保护', () => {
  it('成员不存在抛 MEMBER_001', async () => {
    prisma.projectMember.findUnique.mockResolvedValue(null);
    await expect(updateMemberRole('p1', 'u1', 'editor', 'admin-1')).rejects.toMatchObject({ code: 'MEMBER_001' });
  });
  it('降级最后一个 owner 抛 MEMBER_002', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ id: 'm1', role: 'owner' });
    prisma.projectMember.count.mockResolvedValue(1);
    await expect(updateMemberRole('p1', 'u1', 'editor', 'admin-1')).rejects.toMatchObject({ code: 'MEMBER_002' });
  });
  it('正常变更', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ id: 'm1', role: 'viewer' });
    prisma.projectMember.update.mockResolvedValue({ id: 'm1', role: 'editor' });
    await expect(updateMemberRole('p1', 'u1', 'editor', 'admin-1')).resolves.toMatchObject({ role: 'editor' });
  });
});

describe('removeMember - B-3 权限修复', () => {
  it('editor 移除他人抛 AUTH_003（B-3：editor/viewer 只能移除自己）', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ id: 'caller', role: 'editor' });
    await expect(removeMember('p1', 'other-user', 'caller-user', 'user')).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('viewer 移除他人抛 AUTH_003', async () => {
    prisma.projectMember.findUnique.mockResolvedValue({ id: 'caller', role: 'viewer' });
    await expect(removeMember('p1', 'other-user', 'caller-user', 'user')).rejects.toMatchObject({ code: 'AUTH_003' });
  });
  it('editor 移除自己成功', async () => {
    prisma.projectMember.findUnique
      .mockResolvedValueOnce({ id: 'caller', role: 'editor' })
      .mockResolvedValueOnce({ id: 'm1', role: 'editor' });
    prisma.projectMember.delete.mockResolvedValue({ id: 'm1' });
    await expect(removeMember('p1', 'caller-user', 'caller-user', 'user')).resolves.toMatchObject({ id: 'm1' });
  });
  it('移除最后一个 owner 抛 MEMBER_002', async () => {
    prisma.projectMember.findUnique
      .mockResolvedValueOnce({ id: 'caller', role: 'owner' })
      .mockResolvedValueOnce({ id: 'm1', role: 'owner' });
    prisma.projectMember.count.mockResolvedValue(1);
    await expect(removeMember('p1', 'target', 'caller', 'user')).rejects.toMatchObject({ code: 'MEMBER_002' });
  });
  it('owner 移除任意成员成功', async () => {
    prisma.projectMember.findUnique
      .mockResolvedValueOnce({ id: 'caller', role: 'owner' })
      .mockResolvedValueOnce({ id: 'm1', role: 'editor' });
    prisma.projectMember.delete.mockResolvedValue({ id: 'm1' });
    await expect(removeMember('p1', 'target', 'caller', 'user')).resolves.toMatchObject({ id: 'm1' });
  });
});

describe('listMembers', () => {
  it('返回分页成员', async () => {
    prisma.projectMember.findMany.mockResolvedValue([{
      id: 'm1', userId: 'u1', role: 'editor', addedAt: new Date(),
      user: { username: 'a', nickname: 'A' },
    }]);
    prisma.projectMember.count.mockResolvedValue(1);
    const r = await listMembers('p1');
    expect(r.data).toHaveLength(1);
  });
});
