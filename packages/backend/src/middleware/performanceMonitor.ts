// packages/backend/src/middleware/performanceMonitor.ts
// API 响应时间监控中间件（P1-5，票 #32）：res.on('finish') 记录每请求延迟到环形缓冲。
// 零业务侵入：不读写 req/res 业务数据、不改路由行为，仅观测。
// 挂载点定序（research 漂移点 9）：净化之后、路由之前——被限流/净化拒绝的快速 4xx
// 不进业务延迟分布（否则 429 快速响应拉低 P50 扭曲业务视角）。
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { RATE_LIMIT_SKIP_PATHS } from '../utils/ipMonitor.js';
import { recordSample, resolveRouteTemplate } from '../utils/performanceStats.js';

// 白名单与限流豁免同源（单一真相源，server.ts #33 回写先例）；若未来两域豁免面需要分叉，届时再拆独立清单

export const performanceMonitorMiddleware: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  // 探针/心跳/健康检查是高频基础设施打点，挤占环形缓冲窗口属噪音，豁免
  const path = req.path;
  if (RATE_LIMIT_SKIP_PATHS.some((p) => path === p || path === `/api/v1${p}`)) {
    next();
    return;
  }

  const start = performance.now();
  // finish 在响应完成后触发，此时 req.route 已被路由层填充——模板从匹配结果取，
  // 与挂载点无关（挂 app 根也无 req.path 前缀剥离问题，generalLimiter skip 教训）
  res.on('finish', () => {
    const durationMs = performance.now() - start;
    recordSample(resolveRouteTemplate(req.baseUrl, req.route?.path), durationMs);
  });
  next();
};
