// packages/backend/src/controllers/monitoringController.ts
// /admin 监控端点（P0-6，票 #20）：thin controller，聚合逻辑在 monitoringService。
import type { NextFunction, Request, Response } from 'express';
import { getDashboard, getProjectConnectionStats, getUserActivityStats } from '../services/monitoringService.js';
import { getPerformanceStats } from '../utils/performanceStats.js';

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

// 票 #32 P1-5：API 性能统计（内存环形缓冲聚合，无 IO，同步返回）
export function getPerformanceHandler(_req: Request, res: Response) {
  res.json({ success: true, data: getPerformanceStats() });
}
