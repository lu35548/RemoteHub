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

/**
 * @swagger
 * /api/v1/admin/dashboard:
 *   get:
 *     summary: 运维监控仪表盘(admin)
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 仪表盘聚合数据(用户/项目/连接统计)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
monitoringRoutes.get('/dashboard', authMiddleware, roleMiddleware('admin'), monitoringController.getDashboardHandler);
/**
 * @swagger
 * /api/v1/admin/stats/users:
 *   get:
 *     summary: 用户活跃统计(admin)
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 用户活跃统计(在线人数/最近登录分布)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
monitoringRoutes.get('/stats/users', authMiddleware, roleMiddleware('admin'), monitoringController.getUserStatsHandler);
/**
 * @swagger
 * /api/v1/admin/stats/projects:
 *   get:
 *     summary: 项目与连接统计(admin)
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 项目/连接分布统计
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
monitoringRoutes.get('/stats/projects', authMiddleware, roleMiddleware('admin'), monitoringController.getProjectStatsHandler);
// 票 #32 P1-5：性能统计端点（照上述三端点同款门禁；写端点无，审计不挂——读端点先例）
/**
 * @swagger
 * /api/v1/admin/stats/performance:
 *   get:
 *     summary: 接口性能统计(admin,环形缓冲)
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 按路由模板聚合的请求计数/延迟分位数
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
monitoringRoutes.get('/stats/performance', authMiddleware, roleMiddleware('admin'), monitoringController.getPerformanceHandler);
/**
 * @swagger
 * /api/v1/admin/users/{id}/reset-link:
 *   post:
 *     summary: admin 代生成密码重置链接(票 #28)
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 目标用户 ID
 *     responses:
 *       200:
 *         description: 一次性重置链接(供面板复制转交)
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/SuccessResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         resetLink: { type: string, example: /reset-password?token=... }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 用户不存在(USER_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: 该用户重置请求已达上限(RESET_003)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
