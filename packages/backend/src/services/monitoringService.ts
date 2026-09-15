// packages/backend/src/services/monitoringService.ts
// 系统监控（P0-6，票 #20）：健康快照 / 仪表盘聚合 / 活跃趋势 / 项目连接计数。
// 口径锚点（CONTEXT.md 领域语言）：onlineUsers 与前端顶栏同源同数（lastActiveAt 5min）；
// recentActivity 全量含 failure 与安全事件；趋势 success-only。
import os from 'node:os';
import { statfs } from 'node:fs/promises';
import type { DailyActivityStat, Dashboard, ProjectConnectionStat, SystemHealth } from '@remotehub/shared';
import { LAST_ACTIVE_THROTTLE_MS } from '@remotehub/shared';
import { prisma } from '../utils/prisma.js';
import { toDTO } from './auditService.js';

const round1 = (n: number): number => Math.round(n * 10) / 10;

const TREND_DAYS = 30;
const TREND_SCAN_CAP = 10000; // 趋势扫描上限（票面钦定；超限日粒度分桶仍正确，只统计进 cap 的行）

/** db 通 + mem ≤90 + disk ≤95 → healthy；任一越界 → degraded（75/80 警告值不进后端状态，前端拿数值自行变色）。 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [database, totalMem, freeMem, disk, uptime] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => true)
      .catch(() => false),
    Promise.resolve(os.totalmem()),
    Promise.resolve(os.freemem()),
    statfs(process.cwd()).catch(() => null),
    Promise.resolve(process.uptime()),
  ]);

  const memoryUsage = totalMem > 0 ? round1((1 - freeMem / totalMem) * 100) : 0;
  const diskUsage = disk ? round1(((disk.blocks - disk.bfree) / disk.blocks) * 100) : -1;

  const degraded = !database || memoryUsage > 90 || diskUsage > 95;

  return { status: degraded ? 'degraded' : 'healthy', database, diskUsage, memoryUsage, uptime };
}

/** 仪表盘聚合：健康快照 + 在线人数 + 总量统计 + 最近 20 条活动（全量口径，含 failure 与安全事件）。 */
export async function getDashboard(): Promise<Dashboard> {
  const [health, onlineUsers, totalProjects, totalConnections, totalUsers, recentRows] = await Promise.all([
    getSystemHealth(),
    prisma.user.count({ where: { lastActiveAt: { gte: new Date(Date.now() - LAST_ACTIVE_THROTTLE_MS) } } }),
    prisma.project.count(),
    prisma.connection.count(),
    prisma.user.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 20 }),
  ]);

  return {
    health,
    onlineUsers,
    stats: { totalProjects, totalConnections, totalUsers },
    recentActivity: recentRows.map(toDTO),
  };
}

/** 活跃趋势：近 30 天日粒度，仅 result='success'（趋势口径）；logins=AUTH_LOGIN，operations=其余动作。 */
export async function getUserActivityStats(): Promise<DailyActivityStat[]> {
  const now = new Date();
  const since = new Date(now);
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (TREND_DAYS - 1));

  const rows = await prisma.auditLog.findMany({
    where: { result: 'success', createdAt: { gte: since } },
    select: { action: true, result: true, createdAt: true },
    orderBy: { createdAt: 'desc' }, // 超 cap 截取须是「最近」的 10000 行（auditService export 端点同款截断语义）
    take: TREND_SCAN_CAP,
  });

  // 30 天补零初始化（UTC 日界），行按 toISOString 日键落桶；Map 迭代序 = 日期升序
  const buckets = new Map<string, DailyActivityStat>();
  for (let d = 0; d < TREND_DAYS; d++) {
    const key = new Date(since.getTime() + d * 86_400_000).toISOString().slice(0, 10);
    buckets.set(key, { date: key, logins: 0, operations: 0 });
  }

  for (const row of rows) {
    if (row.result !== 'success') continue; // 双保险：where 之外分桶层再滤（AC「趋势 failure 排除」在 service seam 行为级固化）
    const bucket = buckets.get(row.createdAt.toISOString().slice(0, 10));
    if (!bucket) continue; // 窗口外兜底丢弃
    if (row.action === 'AUTH_LOGIN') bucket.logins++;
    else bucket.operations++;
  }

  return [...buckets.values()];
}

/** 项目连接计数：全部项目（含 0 连接），name 升序，_count 关联聚合单查询。 */
export async function getProjectConnectionStats(): Promise<ProjectConnectionStat[]> {
  const rows = await prisma.project.findMany({
    select: { id: true, name: true, _count: { select: { connections: true } } },
    orderBy: { name: 'asc' },
  });

  return rows.map((r) => ({ projectId: r.id, projectName: r.name, connectionCount: r._count.connections }));
}
