// packages/backend/src/services/notificationService.ts
// #35 通知 service：未读列表（分页 clamp）/ 已读标记（403 门禁）/ emit 挂点（#36 接线）。
import { prisma } from '../utils/prisma.js';
import { createAppError } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@remotehub/shared';
import type { NotificationType } from '@remotehub/shared';
import { sendToUser } from '../ws/wsServer.js';

/** GET /notifications：当前用户未读列表，createdAt desc，分页 clamp 照 userService/auditService 先例 */
export async function listUnreadNotifications(userId: string, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  page = Math.max(1, page);
  pageSize = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);

  const [data, total] = await Promise.all([
    prisma.notificationQueue.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.notificationQueue.count({ where: { userId, isRead: false } }),
  ]);
  return { data, pagination: { page, pageSize, total } };
}

/** PATCH /notifications/:id/read：本人才可标记（403 门禁——AC 要求，admin 也不例外：个人通知个人管理） */
export async function markNotificationRead(id: string, userId: string) {
  const notification = await prisma.notificationQueue.findUnique({ where: { id } });
  if (!notification) throw createAppError('NOTIF_001');
  if (notification.userId !== userId) throw createAppError('NOTIF_002');
  return prisma.notificationQueue.update({ where: { id }, data: { isRead: true } });
}

/**
 * #36 事件源接线挂点：六类事件源（可疑 IP/强制登出/备份结果/连接与成员变更）不直接摸表，
 * 统一经此函数 → ① 写 NotificationQueue（离线可达，用户上线后 GET /notifications 拉取）
 * → ② WS 尽力推送（在线即时，#34 管道 sendToUser；未 init 时静默跳过）。
 * 事件触发点的接线（何时对谁 emit 什么）在 #36 实现。
 */
export async function emitNotification(input: {
  userId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
}) {
  const notification = await prisma.notificationQueue.create({
    data: { userId: input.userId, type: input.type, payload: JSON.stringify(input.payload) },
  });
  sendToUser(input.userId, { type: input.type, payload: input.payload });
  return notification;
}

// ─── #36 多目标辅助：查目标用户集合 → 逐个 emitNotification ───
// 走 emitNotification 单发入口（每目标一行 Queue + WS 直推），不旁路；
// allSettled 并发：单目标失败只 logger.error 不中断其余目标。
// 目标集合查询失败会整体 reject——调用侧 catch 收口（fire-and-forget 契约，见各挂点）。

/** 全体 admin（可疑 IP 告警等系统事件；SYSTEM_ALERT 优先送达 = sendToUser 直推在线连接） */
export async function emitToAdmins(input: {
  type: NotificationType;
  payload: Record<string, unknown>;
}): Promise<void> {
  const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
  await settleEmit(admins.map((a) => ({ userId: a.id, ...input })));
}

/**
 * 项目全体成员（连接/成员/角色变更）。成员快照取自操作成功后的查询时点：
 * 添加后含新成员本人、移除后不含被移除者（被移除者零打扰）。
 */
export async function emitToProjectMembers(projectId: string, input: {
  type: NotificationType;
  payload: Record<string, unknown>;
}): Promise<void> {
  const members = await prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } });
  await settleEmit(members.map((m) => ({ userId: m.userId, ...input })));
}

/** 并发下发 + 逐发失败记日志（allSettled 不中断其余目标） */
async function settleEmit(inputs: Array<{ userId: string; type: NotificationType; payload: Record<string, unknown> }>): Promise<void> {
  const results = await Promise.allSettled(inputs.map((i) => emitNotification(i)));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      logger.error('通知下发单目标失败（不传播）', {
        type: inputs[i]?.type,
        userId: inputs[i]?.userId,
        error: (r.reason as Error)?.message,
      });
    }
  });
}
