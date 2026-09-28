// packages/backend/src/utils/performanceStats.ts
// API 性能统计核心（P1-5，票 #32）：内存环形缓冲 + nearest-rank 分位数。
// 照 ipMonitor.ts 先例：模块级单例、无后台定时器、无持久化（spec 范围外：历史持久化不做）。
// 按路由模板聚合（如 /api/v1/projects/:id）防高基数；未匹配请求统一归 'unmatched' 单桶
//（原始 URL 永不入库）。带参挂载点（server.ts: /api/v1/projects/:id/members）运行时 baseUrl
// 是实际解析值（含真实 id，Express 5 实测）——normalizeRouteKey 归一化 + ROUTE_MAP_MAX_TEMPLATES
// 容量兜底，双层防真实 id 混入统计与 Map 无界增长。

import type { PerformanceStats } from '@remotehub/shared';

/** 单模板环形缓冲容量（窗口语义：分位反映最近 N 个样本） */
export const PERFORMANCE_BUFFER_SIZE = 500;

interface RouteRecord {
  /** 环形缓冲（覆盖式：满后覆盖最旧样本）；分位/均值基于当前窗口 */
  samples: number[];
  /** 写指针（下一写入位）+ 已满标志，免 shift 拷贝 */
  head: number;
  /** 进程生命周期内该模板总请求数（含已被覆盖淘汰的样本） */
  count: number;
}

const routeMap = new Map<string, RouteRecord>();

/** 未匹配路由（404 等）的固定聚合桶 */
const UNMATCHED = 'unmatched';

/** 归一化漏网新模板的固定聚合桶（与 unmatched 同款处理） */
const OVERFLOW = 'overflow';

/** 模板聚合 Map 容量上限（兜底层）：未来新增带参挂载点若漏更新 normalizeRouteKey，
 *  逐请求 uuid key 不致无界增长；超限后新模板统一归 overflow 固定桶。 */
export const ROUTE_MAP_MAX_TEMPLATES = 200;

/**
 * 带参挂载点归一化：app.use('/api/v1/projects/:id/members', ...) 挂载下运行时 baseUrl
 * 是实际解析值（含真实 project uuid，Express 5 实测），不是模板——不归一化则真实 id
 * 混入聚合 key（统计污染 + 安全面泄漏）且 Map 随项目数无界增长。将该挂载前缀的参数段
 * 归一化为 :id；对已模板化的 key（:id 匹配 [^/]+ 被原样替换）幂等。
 */
const PARAM_MOUNTED_PREFIX = /^(\/api\/v1\/projects\/)[^/]+(\/members)(?=\/|$)/;

export function normalizeRouteKey(route: string): string {
  return route.replace(PARAM_MOUNTED_PREFIX, '$1:id$2');
}

/** 清空全部统计（测试隔离用；生产不调用）。 */
export function resetPerformanceStats(): void {
  routeMap.clear();
}

/** nearest-rank 分位：sorted（升序）第 ceil(p/100·n) 个。n≥1（调用方保证）；?? 0 为防御分支。 */
function percentile(sorted: number[], p: number): number {
  return sorted[Math.ceil((p / 100) * sorted.length) - 1] ?? 0;
}

/** 记录一次请求延迟样本（ms，单调时钟差值）。route 须为路由模板；
 *  带参挂载的实际解析段在此归一化（Map 写入口单点收口），超容量新模板归 overflow。 */
export function recordSample(route: string, durationMs: number): void {
  route = normalizeRouteKey(route);
  let rec = routeMap.get(route);
  if (!rec) {
    if (routeMap.size >= ROUTE_MAP_MAX_TEMPLATES) route = OVERFLOW;
    rec = routeMap.get(route);
    if (!rec) {
      rec = { samples: [], head: 0, count: 0 };
      routeMap.set(route, rec);
    }
  }
  rec.count++;
  if (rec.samples.length < PERFORMANCE_BUFFER_SIZE) {
    rec.samples.push(durationMs);
    if (rec.samples.length === PERFORMANCE_BUFFER_SIZE) rec.head = 0; // 满即转入覆盖模式
    return;
  }
  rec.samples[rec.head] = durationMs; // 环形覆盖
  rec.head = (rec.head + 1) % PERFORMANCE_BUFFER_SIZE;
}

/** 聚合当前窗口统计（admin 端点低频调用，查询时排序开销可接受）。
 *  返回类型编译期绑定 shared DTO（照 monitoringService.ts 先例），结构漂移在 tsc 期报错。 */
export function getPerformanceStats(): PerformanceStats {
  const routes = [...routeMap.entries()].map(([route, rec]) => {
    const sorted = [...rec.samples].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);
    const minMs = sorted[0] ?? 0; // n=0 防御分支（实际不可达：有 count 必有样本）
    const maxMs = sorted[n - 1] ?? 0;
    return {
      route,
      count: rec.count,
      p50Ms: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      p99Ms: percentile(sorted, 99),
      minMs,
      maxMs,
      avgMs: n > 0 ? sum / n : 0,
    };
  });
  return {
    routes,
    bufferSize: PERFORMANCE_BUFFER_SIZE,
    uptimeSeconds: Math.floor(process.uptime()),
  };
}

/** 供中间件解析路由模板：Express 5 下 req.baseUrl + req.route.path 拼接；
 *  未匹配（req.route 为 undefined 或 path 非 string）一律归 unmatched。 */
export function resolveRouteTemplate(baseUrl: string, routePath: unknown): string {
  if (typeof routePath !== 'string' || routePath.length === 0) return UNMATCHED;
  return baseUrl + routePath;
}
