// packages/backend/src/services/userService.ts
import { prisma } from '../utils/prisma.js';
import { createAppError } from '../utils/appError.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, USER_SEARCH_MAX_RESULTS, validateNickname, validateRole } from '@remotehub/shared';

/** 用户列表（admin）§4 */
export async function listUsers(page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) {
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
  const [users, total] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, username: true, nickname: true, role: true, isActive: true, twoFactorEnabled: true, lastActiveAt: true, createdAt: true },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count(),
  ]);
  return { data: users, pagination: { page, pageSize, total } };
}

/** 用户搜索（项目成员可用）§4 */
export async function searchUsers(query: string) {
  return prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { username: { contains: query } },
        { nickname: { contains: query } },
      ],
    },
    select: { id: true, username: true, nickname: true },
    take: USER_SEARCH_MAX_RESULTS,
    orderBy: { username: 'asc' },
  });
}

/** 用户详情 §4 */
export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, nickname: true, role: true, isActive: true, twoFactorEnabled: true, lastActiveAt: true, createdAt: true },
  });
  if (!user) throw createAppError('USER_002');
  return user;
}

/** 管理员修改用户 §4.2（事务：admin count 检查 + update） */
export async function updateUser(callerId: string, targetId: string, data: { nickname?: string; role?: string; isActive?: boolean; twoFactorEnabled?: boolean }) {
  // 白名单过滤 §4.2
  const updateData: Record<string, unknown> = {};

  if (data.nickname !== undefined) {
    const v = validateNickname(data.nickname);
    if (!v.valid) throw createAppError('VAL_001', [{ field: 'nickname', message: v.message }]);
    updateData.nickname = data.nickname;
  }

  if (data.role !== undefined) {
    const v = validateRole(data.role);
    if (!v.valid) throw createAppError('VAL_001', [{ field: 'role', message: v.message }]);
    updateData.role = data.role;
  }

  if (data.isActive !== undefined) {
    updateData.isActive = data.isActive;
  }

  // 2FA 开关（票 #30）：关闭时清 totpSecret + 作废全部恢复码（admin 关掉再开 = 强制重新绑定，
  // 也是「绑定中途放弃/恢复码耗尽且丢失」场景的管理员逃生通道）
  if (data.twoFactorEnabled !== undefined) {
    updateData.twoFactorEnabled = data.twoFactorEnabled;
    if (data.twoFactorEnabled === false) {
      updateData.totpSecret = null;
    }
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetId } });
    if (!target) throw createAppError('USER_002');

    // 从 admin 降级 → 检查 admin 数量 §4.2
    if (data.role !== undefined && target.role === 'admin' && data.role === 'user') {
      const adminCount = await tx.user.count({ where: { role: 'admin', isActive: true } });
      if (adminCount <= 1) throw createAppError('AUTH_003');
    }

    // 禁用最后一个 admin §4.2
    if (data.isActive === false && target.role === 'admin') {
      const adminCount = await tx.user.count({ where: { role: 'admin', isActive: true } });
      if (adminCount <= 1) throw createAppError('AUTH_003');
    }

    const updated = await tx.user.update({
      where: { id: targetId },
      data: updateData,
      select: { id: true, username: true, nickname: true, role: true, isActive: true, twoFactorEnabled: true, lastActiveAt: true, createdAt: true },
    });

    // 关闭 2FA 时作废全部恢复码（与 totpSecret 清空同事务，防半关状态）
    if (data.twoFactorEnabled === false) {
      await tx.twoFactorRecoveryCode.deleteMany({ where: { userId: targetId } });
    }

    return updated;
  });
}

/** 删除用户 §4.2（事务：admin/owner count 检查 + delete） */
export async function deleteUser(callerId: string, targetId: string) {
  // 禁止删除自己 §4.2
  if (callerId === targetId) throw createAppError('AUTH_003');

  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetId } });
    if (!target) throw createAppError('USER_002');

    // 禁止删除最后一个 admin §4.2
    // 仅当 target 是 active admin 时才做 last-admin 检查（删 inactive admin 不应被拦）§4.2
    if (target.role === 'admin' && target.isActive) {
      const adminCount = await tx.user.count({ where: { role: 'admin', isActive: true } });
      if (adminCount <= 1) throw createAppError('AUTH_003');
    }

    // 检查是否是唯一 owner §4.2
    const ownedProjects = await tx.projectMember.findMany({
      where: { userId: targetId, role: 'owner' },
      select: { projectId: true },
    });

    for (const pm of ownedProjects) {
      const ownerCount = await tx.projectMember.count({
        where: { projectId: pm.projectId, role: 'owner' },
      });
      if (ownerCount <= 1) throw createAppError('MEMBER_003');
    }

    await tx.user.delete({ where: { id: targetId } });
    return { id: targetId };
  });
}
