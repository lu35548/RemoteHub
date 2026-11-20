// packages/backend/src/services/memberService.ts
import { prisma } from '../utils/prisma.js';
import { createAppError, handlePrismaUniqueViolation, hasErrorCode } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { emitToProjectMembers } from './notificationService.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, validateMemberRole } from '@remotehub/shared';

/** 成员列表 §4 */
export async function listMembers(projectId: string, page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) {
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);
  const [members, total] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId },
      select: { id: true, userId: true, role: true, addedAt: true, user: { select: { username: true, nickname: true } } },
      orderBy: { addedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.projectMember.count({ where: { projectId } }),
  ]);

  const data = members.map((m) => ({
    id: m.id, userId: m.userId, role: m.role, addedAt: m.addedAt.toISOString(),
    username: m.user.username, nickname: m.user.nickname,
  }));

  return { data, pagination: { page, pageSize, total } };
}

/** 添加成员 §4, §5.1（事务） */
export async function addMember(projectId: string, userId: string, role: string) {
  const v = validateMemberRole(role);
  if (!v.valid) throw createAppError('VAL_001', [{ field: 'role', message: v.message }]);

  // 检查用户存在
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createAppError('USER_002');

  try {
    const member = await prisma.$transaction(async (tx) => {
      // 检查是否已存在 §4.2
      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId } },
      });
      if (existing) throw createAppError('MEMBER_001');

      return tx.projectMember.create({
        data: { projectId, userId, role },
      });
    });

    // #36：添加成功后通知项目全体成员（事务外 fire-and-forget；helper 成员快照后置，
    // 新成员本人含在通知目标内；失败只记日志不破主流程）
    void emitToProjectMembers(projectId, {
      type: 'MEMBER_ADDED',
      payload: { projectId, userId, username: user.username, role },
    }).catch((err: Error) => logger.error('成员添加通知下发失败（不传播）', { projectId, userId, error: err.message }));

    return { id: member.id, userId, role, addedAt: member.addedAt.toISOString() };
  } catch (error) {
    if (hasErrorCode(error, 'MEMBER_001')) throw error;
    await handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** 变更角色 §4.2（事务：owner count 检查 + 更新） */
export async function updateMemberRole(projectId: string, targetUserId: string, newRole: string, _callerUserId: string) {
  const v = validateMemberRole(newRole);
  if (!v.valid) throw createAppError('VAL_001', [{ field: 'role', message: v.message }]);

  const result = await prisma.$transaction(async (tx) => {
    const member = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    if (!member) throw createAppError('MEMBER_001');

    // 如果从 owner 降级，检查 owner count §4.2
    if (member.role === 'owner' && newRole !== 'owner') {
      const ownerCount = await tx.projectMember.count({
        where: { projectId, role: 'owner' },
      });
      if (ownerCount <= 1) throw createAppError('MEMBER_002');
    }

    const updated = await tx.projectMember.update({
      where: { id: member.id },
      data: { role: newRole },
    });

    return { id: updated.id, userId: targetUserId, role: updated.role };
  });

  // #36：角色变更成功后通知项目全体成员（事务外 fire-and-forget，失败只记日志）
  void emitToProjectMembers(projectId, {
    type: 'MEMBER_ROLE_UPDATED',
    payload: { projectId, userId: targetUserId, role: newRole },
  }).catch((err: Error) => logger.error('角色变更通知下发失败（不传播）', { projectId, userId: targetUserId, error: err.message }));

  return result;
}

/** 移除成员/退出 §4.2（事务：owner count 检查 + delete） */
export async function removeMember(projectId: string, targetUserId: string, callerUserId: string, callerRole: string) {
  // 非 admin 需校验调用者项目角色 §4.2：owner 可移除任意成员，editor/viewer 只能移除自己
  if (callerRole !== 'admin') {
    const caller = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: callerUserId } },
    });
    if (!caller) throw createAppError('AUTH_003');
    if (caller.role !== 'owner' && targetUserId !== callerUserId) {
      throw createAppError('AUTH_003');
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const member = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
    });
    if (!member) throw createAppError('MEMBER_001');

    // 如果移除的是 owner，检查 owner count §4.2
    if (member.role === 'owner') {
      const ownerCount = await tx.projectMember.count({
        where: { projectId, role: 'owner' },
      });
      if (ownerCount <= 1) throw createAppError('MEMBER_002');
    }

    await tx.projectMember.delete({ where: { id: member.id } });
    return { id: member.id };
  });

  // #36：移除成功后通知剩余成员（helper 成员快照后置——被移除者零打扰；
  // 事务外 fire-and-forget，失败只记日志不破主流程）
  void emitToProjectMembers(projectId, {
    type: 'MEMBER_REMOVED',
    payload: { projectId, userId: targetUserId },
  }).catch((err: Error) => logger.error('成员移除通知下发失败（不传播）', { projectId, userId: targetUserId, error: err.message }));

  return result;
}
