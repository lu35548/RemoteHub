// packages/backend/src/routes/monitoringRoutes.ts
// /admin 监控端点（P0-6，票 #20）：全部端点 admin 门禁（authMiddleware + roleMiddleware），
// 读端点审计中间件不挂（auditRoutes 先例）。
// 票 #28 增 admin 代重置端点（写操作循 authRoutes 先例挂审计；挂本文件因票面路径契约
// 为 /admin/users/:id/reset-link，本 router 挂 /api/v1/admin 前缀——避免动 server.ts）。
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { auditMiddleware } from '../middleware/audit.js';
import * as monitoringController from '../controllers/monitoringController.js';
import * as userController from '../controllers/userController.js';

export const monitoringRoutes: RouterType = Router();

monitoringRoutes.get('/dashboard', authMiddleware, roleMiddleware('admin'), monitoringController.getDashboardHandler);
monitoringRoutes.get('/stats/users', authMiddleware, roleMiddleware('admin'), monitoringController.getUserStatsHandler);
monitoringRoutes.get('/stats/projects', authMiddleware, roleMiddleware('admin'), monitoringController.getProjectStatsHandler);
// 票 #32 P1-5：性能统计端点（照上述三端点同款门禁；写端点无，审计不挂——读端点先例）
monitoringRoutes.get('/stats/performance', authMiddleware, roleMiddleware('admin'), monitoringController.getPerformanceHandler);
monitoringRoutes.post(
  '/users/:id/reset-link',
  authMiddleware,
  auditMiddleware({
    action: 'AUTH_PASSWORD_RESET_REQUEST',
    resource: 'user',
    // 显式收窄（req.params.id 是 string | undefined，直接返回会撑宽 getResourceId 签名）
    getResourceId: (req) => (typeof req.params.id === 'string' ? req.params.id : undefined),
  }),
  roleMiddleware('admin'),
  userController.createResetLink,
);
