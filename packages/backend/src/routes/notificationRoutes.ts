// packages/backend/src/routes/notificationRoutes.ts
// #35 通知路由（authMiddleware 门禁；两端点均不挂审计，理由见 controller 头注释）。
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import * as notificationController from '../controllers/notificationController.js';

export const notificationRoutes: RouterType = Router();

notificationRoutes.get('/', authMiddleware, notificationController.listNotifications);
notificationRoutes.patch('/:id/read', authMiddleware, notificationController.markRead);
