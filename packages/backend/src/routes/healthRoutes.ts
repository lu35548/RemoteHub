import { Router, type Router as RouterType } from 'express';
import { getSystemHealth } from '../services/monitoringService.js';

export const healthRoutes: RouterType = Router();

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     summary: 系统健康检查(degraded 矩阵)
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: 健康矩阵(database 等)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       503:
 *         description: 数据库连接失败(SYS_001,Docker healthcheck 只看状态码)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
healthRoutes.get('/', async (_req, res) => {
  const health = await getSystemHealth();

  // DB 失败仍 503（Docker healthcheck 只看状态码，向后兼容——200 体带 degraded 矩阵数值）
  if (!health.database) {
    res.status(503).json({ success: false, error: { code: 'SYS_001', message: '数据库连接失败' } });
    return;
  }

  res.json({ success: true, data: health });
});
