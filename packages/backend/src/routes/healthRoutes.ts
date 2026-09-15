import { Router, type Router as RouterType } from 'express';
import { getSystemHealth } from '../services/monitoringService.js';

export const healthRoutes: RouterType = Router();

healthRoutes.get('/', async (_req, res) => {
  const health = await getSystemHealth();

  // DB 失败仍 503（Docker healthcheck 只看状态码，向后兼容——200 体带 degraded 矩阵数值）
  if (!health.database) {
    res.status(503).json({ success: false, error: { code: 'SYS_001', message: '数据库连接失败' } });
    return;
  }

  res.json({ success: true, data: health });
});
