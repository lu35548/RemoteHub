// packages/backend/src/services/notificationService.ts
// #35 通知 service：未读列表（分页 clamp）/ 已读标记（403 门禁）/ emit 挂点（#36 接线）。
import { prisma } from '../utils/prisma.js';
import { createAppError } from '../utils/appError.js';
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
