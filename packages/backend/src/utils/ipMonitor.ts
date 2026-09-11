// packages/backend/src/utils/ipMonitor.ts
// IP 风险检测（P0-5，票 #19）：per-IP 60s 窗口内存计数，超阈值记 SECURITY_SUSPICIOUS_IP
// 审计（仅告警不阻断）。计数豁免限流白名单端点（NAT 单出口下全员心跳即触阈值的误报防线，
// 与 generalLimiter skip 共用 RATE_LIMIT_SKIP_PATHS 单一真相源）。
import type { AuditAction, AuditResource } from '@remotehub/shared';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

export const RATE_LIMIT_SKIP_PATHS = ['/health', '/auth/heartbeat', '/auth/online'] as const;

const WINDOW_MS = 60_000;
const THRESHOLD = 1000;

const ipWindows = new Map<string, { count: number; windowStart: number; alerted: boolean }>();
let lastSweepAt = 0;

/**
 * 限频惰性全表清扫（60s 至多一次）：惰性重置只覆盖 revisit 的 IP，扫描器换源的
 * 一次性条目靠此清除——闭环 spec「内存 Map 防长期运行泄漏」。仍无后台定时器，
 * 摊销 O(size)/min。无可观察行为差异（内存卫生），由既有行为测试回归保护。
 */
function sweepExpired(now: number): void {
  if (now - lastSweepAt < WINDOW_MS) return;
  lastSweepAt = now;
  for (const [key, win] of ipWindows) {
    if (now - win.windowStart >= WINDOW_MS) ipWindows.delete(key);
  }
}

export function checkIpRisk(ip: string | undefined, path: string): void {
  if (!ip) return;
  // 白名单双形态匹配：generalLimiter 挂 /api/v1/ 下 req.path 剥前缀（'/health'），
  // 本中间件挂 app 根 req.path 含前缀（'/api/v1/health'）——挂载点语义差异，两形态都豁免
  if ((RATE_LIMIT_SKIP_PATHS as readonly string[]).some((p) => path === p || path === `/api/v1${p}`)) return;

  const now = Date.now();
  let win = ipWindows.get(ip);
  if (win && now - win.windowStart >= WINDOW_MS) {
    sweepExpired(now); // 过期重置是低频路径，顺带清扫全表
    win = undefined; // 惰性淘汰：过期访问时重置（无后台定时器）
  }
  if (!win) {
    win = { count: 0, windowStart: now, alerted: false };
    ipWindows.set(ip, win);
  }
  win.count++;

  if (win.count > THRESHOLD && !win.alerted) {
    win.alerted = true;
    prisma.auditLog
      .create({
        data: {
          userId: null,
          action: 'SECURITY_SUSPICIOUS_IP' satisfies AuditAction,
          resource: 'security' satisfies AuditResource,
          resourceId: null,
          detail: JSON.stringify({ requestCount: win.count, window: '60s' }),
          ip, // 可疑 IP 要精确不要掩码（票面）
        },
      })
      .catch((err: Error) => logger.error('可疑 IP 审计落库失败（不传播）', { ip, error: err.message }));
  }
}
