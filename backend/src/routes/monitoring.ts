import { Router } from 'express';
import { MonitoringController } from '@/controllers/monitoringController';
import { authenticateToken } from '@/middleware/auth';
import { body, param } from '@/middleware/validation';

const router = Router();

// 基础健康检查端点（无需认证）
router.get('/health', MonitoringController.basicHealthCheck);

// Kubernetes探针端点（无需认证）
router.get('/live', MonitoringController.livenessProbe);
router.get('/ready', MonitoringController.readinessProbe);
router.get('/startup', MonitoringController.startupProbe);

// 其他监控端点需要认证和管理员权限
router.use(authenticateToken);

/**
 * @swagger
 * /monitoring/detailed-health:
 *   get:
 *     summary: 获取详细健康检查结果
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 健康检查结果
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/HealthCheckResult'
 *       403:
 *         description: 权限不足
 *       503:
 *         description: 服务不可用
 */
router.get('/detailed-health', MonitoringController.detailedHealthCheck);

/**
 * @swagger
 * /monitoring/system:
 *   get:
 *     summary: 获取系统指标
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 系统指标
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/SystemMetrics'
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.get('/system', MonitoringController.getSystemMetrics);

/**
 * @swagger
 * /monitoring/database:
 *   get:
 *     summary: 获取数据库指标
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 数据库指标
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/DatabaseMetrics'
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.get('/database', MonitoringController.getDatabaseMetrics);

/**
 * @swagger
 * /monitoring/application:
 *   get:
 *     summary: 获取应用指标
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 应用指标
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/ApplicationMetrics'
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.get('/application', MonitoringController.getApplicationMetrics);

/**
 * @swagger
 * /monitoring/performance:
 *   get:
 *     summary: 获取性能报告
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 性能报告
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
 *                     period:
 *                       type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalRequests:
 *                           type: number
 *                         avgResponseTime:
 *                           type: number
 *                         errorRate:
 *                           type: number
 *                         throughput:
 *                           type: number
 *                     slowestRequests:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           path:
 *                             type: string
 *                           method:
 *                             type: string
 *                           responseTime:
 *                             type: number
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                     mostErrors:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           path:
 *                             type: string
 *                           errorCount:
 *                             type: number
 *                           lastError:
 *                             type: string
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.get('/performance', MonitoringController.getPerformanceReport);

/**
 * @swagger
 * /monitoring/metrics/cleanup:
 *   post:
 *     summary: 清理旧指标数据
 *     tags: [Monitoring]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               olderThanHours:
 *                 type: integer
 *                 default: 24
 *                 description: 清理多少小时前的数据
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
router.post('/metrics/cleanup',
  body('olderThanHours').optional().isInt({ min: 1 }).withMessage('olderThanHours必须是正整数'),
  MonitoringController.cleanupMetrics
);

export default router;