// packages/backend/src/services/notificationService.test.ts
// #35 通知 service unit：分页 clamp / 403 门禁 / emit 挂点形状（mock prisma + mock ws 广播）。
// 端到端真库走 notification.api 集成。
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});

vi.mock('../ws/wsServer.js', () => ({
  sendToUser: vi.fn(),
  sendToAdmins: vi.fn(),
  sendToProject: vi.fn(),
}));

import { prisma as _prisma } from '../utils/prisma.js';
import { sendToUser } from '../ws/wsServer.js';
import { listUnreadNotifications, markNotificationRead, emitNotification } from './notificationService.js';

const prisma = _prisma as any;

beforeEach(() => { vi.clearAllMocks(); });

describe('listUnreadNotifications', () => {
  it('默认分页：where userId+isRead:false，orderBy createdAt desc，返回 pagination', async () => {
    prisma.notificationQueue.findMany.mockResolvedValue([]);
    prisma.notificationQueue.count.mockResolvedValue(0);

    const result = await listUnreadNotifications('u1');

    expect(prisma.notificationQueue.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'u1', isRead: false },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    }));
    expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 0 });
  });

  it('pageSize=500 → clamp 到 MAX_PAGE_SIZE(100)', async () => {
    prisma.notificationQueue.findMany.mockResolvedValue([]);
    prisma.notificationQueue.count.mockResolvedValue(0);

    await listUnreadNotifications('u1', 1, 500);

    expect(prisma.notificationQueue.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it('page=0 → 按 1 算（skip 0）', async () => {
    prisma.notificationQueue.findMany.mockResolvedValue([]);
    prisma.notificationQueue.count.mockResolvedValue(0);

    await listUnreadNotifications('u1', 0, 10);

    expect(prisma.notificationQueue.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
  });
});

describe('markNotificationRead', () => {
  it('本人通知：update isRead=true 并返回', async () => {
    prisma.notificationQueue.findUnique.mockResolvedValue({ id: 'n1', userId: 'u1', isRead: false });
    prisma.notificationQueue.update.mockResolvedValue({ id: 'n1', userId: 'u1', isRead: true });

    const row = await markNotificationRead('n1', 'u1');

    expect(prisma.notificationQueue.update).toHaveBeenCalledWith({ where: { id: 'n1' }, data: { isRead: true } });
    expect(row.isRead).toBe(true);
  });

  it('非本人通知 → NOTIF_002（403 门禁，admin 也不例外）', async () => {
    prisma.notificationQueue.findUnique.mockResolvedValue({ id: 'n1', userId: 'someone-else', isRead: false });

    await expect(markNotificationRead('n1', 'u1')).rejects.toMatchObject({ code: 'NOTIF_002', statusCode: 403 });
    expect(prisma.notificationQueue.update).not.toHaveBeenCalled();
  });

  it('通知不存在 → NOTIF_001（404）', async () => {
    prisma.notificationQueue.findUnique.mockResolvedValue(null);

    await expect(markNotificationRead('missing', 'u1')).rejects.toMatchObject({ code: 'NOTIF_001', statusCode: 404 });
  });
});

describe('emitNotification（#36 事件源接线挂点）', () => {
  it('写队列（payload JSON 序列化）+ WS 尽力推送', async () => {
    prisma.notificationQueue.create.mockResolvedValue({ id: 'n9', userId: 'u1', type: 'FORCE_LOGOUT' });

    const row = await emitNotification({ userId: 'u1', type: 'FORCE_LOGOUT', payload: { reason: 'password_changed' } });

    expect(prisma.notificationQueue.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'FORCE_LOGOUT', payload: JSON.stringify({ reason: 'password_changed' }) },
    });
    expect(sendToUser).toHaveBeenCalledWith('u1', { type: 'FORCE_LOGOUT', payload: { reason: 'password_changed' } });
    expect(row.id).toBe('n9');
  });
});
