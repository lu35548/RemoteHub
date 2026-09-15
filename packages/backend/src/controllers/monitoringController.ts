// packages/backend/src/controllers/monitoringController.ts
// /admin 监控端点（P0-6，票 #20）：thin controller，聚合逻辑在 monitoringService。
import type { NextFunction, Request, Response } from 'express';
import { getDashboard, getProjectConnectionStats, getUserActivityStats } from '../services/monitoringService.js';

export async function getDashboardHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await getDashboard() });
  } catch (err) {
    next(err);
  }
}

export async function getUserStatsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await getUserActivityStats() });
  } catch (err) {
    next(err);
  }
}

export async function getProjectStatsHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await getProjectConnectionStats() });
  } catch (err) {
    next(err);
  }
}
