// packages/backend/src/routes/monitoringRoutes.ts
// /admin 监控端点（P0-6，票 #20）：全部端点 admin 门禁（authMiddleware + roleMiddleware），
// 审计中间件不挂（读端点，auditRoutes 先例）。
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import * as monitoringController from '../controllers/monitoringController.js';

export const monitoringRoutes: RouterType = Router();

monitoringRoutes.get('/dashboard', authMiddleware, roleMiddleware('admin'), monitoringController.getDashboardHandler);
monitoringRoutes.get('/stats/users', authMiddleware, roleMiddleware('admin'), monitoringController.getUserStatsHandler);
monitoringRoutes.get('/stats/projects', authMiddleware, roleMiddleware('admin'), monitoringController.getProjectStatsHandler);
