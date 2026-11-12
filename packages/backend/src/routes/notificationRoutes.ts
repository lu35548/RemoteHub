// packages/backend/src/routes/notificationRoutes.ts
// #35 通知路由（authMiddleware 门禁；两端点均不挂审计，理由见 controller 头注释）。
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as notificationController from '../controllers/notificationController.js';

export const notificationRoutes: RouterType = Router();

/**
 * @swagger
 * /api/v1/notifications:
 *   get:
 *     summary: 我的通知列表(分页)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: 通知分页列表
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
notificationRoutes.get('/', authMiddleware, notificationController.listNotifications);
/**
 * @swagger
 * /api/v1/notifications/{id}/read:
 *   patch:
 *     summary: 标记通知已读(仅本人)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 通知 ID
 *     responses:
 *       200:
 *         description: 已标记已读
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: 无权操作他人通知(NOTIF_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: 通知不存在(NOTIF_001)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
notificationRoutes.patch('/:id/read', authMiddleware, notificationController.markRead);
