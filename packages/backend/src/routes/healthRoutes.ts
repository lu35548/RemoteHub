import { Router, type Router as RouterType } from 'express';
import { prisma } from '../utils/prisma.js';

export const healthRoutes: RouterType = Router();

healthRoutes.get('/', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
  } catch {
    res.status(503).json({ success: false, error: { code: 'SYS_001', message: '数据库连接失败' } });
  }
});
