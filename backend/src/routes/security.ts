import { Router } from 'express';
import { SecurityController } from '@/controllers/securityController';
import { authenticateToken } from '@/middleware/auth';
import { body, param, query } from '@/middleware/validation';

const router = Router();

// 所有安全路由都需要认证和管理员权限
router.use(authenticateToken);

/**
 * @swagger
 * /security/events:
 *   get:
 *     summary: 获取安全事件列表
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 开始日期
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: 结束日期
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [suspicious_activity, rate_limit_exceeded, failed_authentication, unauthorized_access, brute_force_attack, sql_injection_attempt, xss_attempt, csrf_attempt, data_leakage, abnormal_traffic, session_hijacking, malicious_request]
 *         description: 事件类型
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: 严重程度
 *       - in: query
 *         name: ipAddress
 *         schema:
 *           type: string
 *         description: IP地址
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: 用户ID
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: 限制数量
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: 偏移量
 *     responses:
 *       200:
 *         description: 安全事件列表
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     events:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/SecurityEvent'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.get('/events', SecurityController.getSecurityEvents);

/**
 * @swagger
 * /security/statistics:
 *   get:
 *     summary: 获取安全统计
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 安全统计数据
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalEvents:
 *                       type: integer
 *                     eventsByType:
 *                       type: object
 *                     eventsBySeverity:
 *                       type: object
 *                     eventsToday:
 *                       type: integer
 *                     eventsThisWeek:
 *                       type: integer
 *                     topOffenders:
 *                       type: array
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.get('/statistics', SecurityController.getSecurityStatistics);

/**
 * @swagger
 * /security/dashboard:
 *   get:
 *     summary: 获取安全仪表板
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 安全仪表板数据
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     overview:
 *                       type: object
 *                     statistics:
 *                       type: object
 *                     recentEvents:
 *                       type: array
 *                     issues:
 *                       type: array
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.get('/dashboard', SecurityController.getSecurityDashboard);

/**
 * @swagger
 * /security/check:
 *   post:
 *     summary: 执行安全检查
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 安全检查结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [safe, warning, danger]
 *                     issues:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           description:
 *                             type: string
 *                           recommendation:
 *                             type: string
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.post('/check', SecurityController.performSecurityCheck);

/**
 * @swagger
 * /security/events:
 *   post:
 *     summary: 手动记录安全事件
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - type
 *               - severity
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [suspicious_activity, rate_limit_exceeded, failed_authentication, unauthorized_access, brute_force_attack, sql_injection_attempt, xss_attempt, csrf_attempt, data_leakage, abnormal_traffic, session_hijacking, malicious_request]
 *               severity:
 *                 type: string
 *                 enum: [low, medium, high, critical]
 *               details:
 *                 type: object
 *                 description: 事件详情
 *     responses:
 *       200:
 *         description: 事件记录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     eventId:
 *                       type: string
 *                     message:
 *                       type: string
 *       400:
 *         description: 请求参数错误
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.post('/events',
  body(['type', 'severity']).notEmpty().withMessage('type和severity为必填项'),
  body('type').isIn([
    'suspicious_activity',
    'rate_limit_exceeded',
    'failed_authentication',
    'unauthorized_access',
    'brute_force_attack',
    'sql_injection_attempt',
    'xss_attempt',
    'csrf_attempt',
    'data_leakage',
    'abnormal_traffic',
    'session_hijacking',
    'malicious_request'
  ]).withMessage('无效的事件类型'),
  body('severity').isIn(['low', 'medium', 'high', 'critical']).withMessage('无效的严重程度'),
  SecurityController.recordSecurityEvent
);

/**
 * @swagger
 * /security/events/{eventId}/resolve:
 *   put:
 *     summary: 解决安全事件
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: 事件ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 description: 解决备注
 *     responses:
 *       200:
 *         description: 事件解决成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: 请求参数错误
 *       403:
 *         description: 权限不足
 *       404:
 *         description: 事件不存在
 *       500:
 *         description: 服务器错误
 */
router.put('/events/:eventId/resolve',
  param('eventId').notEmpty().withMessage('事件ID不能为空'),
  SecurityController.resolveSecurityEvent
);

/**
 * @swagger
 * /security/ip/{ipAddress}/risk:
 *   get:
 *     summary: 获取IP风险评分
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ipAddress
 *         required: true
 *         schema:
 *           type: string
 *         description: IP地址
 *     responses:
 *       200:
 *         description: IP风险评分
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     score:
 *                       type: integer
 *                       minimum: 0
 *                       maximum: 100
 *                     level:
 *                       type: string
 *                       enum: [low, medium, high, critical]
 *                     reasons:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: 请求参数错误
 *       500:
 *         description: 服务器错误
 */
router.get('/ip/:ipAddress/risk',
  param('ipAddress').notEmpty().withMessage('IP地址不能为空'),
  SecurityController.getIPRiskScore
);

/**
 * @swagger
 * /security/cleanup:
 *   post:
 *     summary: 清理旧安全事件
 *     tags: [Security]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               olderThanDays:
 *                 type: integer
 *                 default: 30
 *                 description: 清理多少天前的事件
 *     responses:
 *       200:
 *         description: 清理成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.post('/cleanup',
  body('olderThanDays').optional().isInt({ min: 1 }).withMessage('olderThanDays必须是正整数'),
  SecurityController.cleanupOldEvents
);

export default router;