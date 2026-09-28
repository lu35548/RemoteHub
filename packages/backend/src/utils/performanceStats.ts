// packages/backend/src/utils/performanceStats.ts
// API 性能统计核心（P1-5，票 #32）：内存环形缓冲 + nearest-rank 分位数。
// 照 ipMonitor.ts 先例：模块级单例、无后台定时器、无持久化（spec 范围外：历史持久化不做）。
// 按路由模板聚合（如 /api/v1/projects/:id）防高基数；模板集合 = 静态路由注册，天然有界，
// 未匹配请求统一归 'unmatched' 单桶（原始 URL 永不入库）。

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

/** 清空全部统计（测试隔离用；生产不调用）。 */
export function resetPerformanceStats(): void {
  routeMap.clear();
}

/** nearest-rank 分位：sorted（升序）第 ceil(p/100·n) 个。n≥1（调用方保证）；?? 0 为防御分支。 */
function percentile(sorted: number[], p: number): number {
  return sorted[Math.ceil((p / 100) * sorted.length) - 1] ?? 0;
}

/** 记录一次请求延迟样本（ms，单调时钟差值）。route 须为路由模板。 */
export function recordSample(route: string, durationMs: number): void {
  let rec = routeMap.get(route);
  if (!rec) {
    rec = { samples: [], head: 0, count: 0 };
    routeMap.set(route, rec);
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

/** 聚合当前窗口统计（admin 端点低频调用，查询时排序开销可接受）。 */
export function getPerformanceStats(): {
  routes: Array<{
    route: string;
    count: number;
    p50Ms: number;
    p95Ms: number;
    p99Ms: number;
    minMs: number;
    maxMs: number;
    avgMs: number;
  }>;
  bufferSize: number;
  uptimeSeconds: number;
} {
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
 *  未匹配（req.route 为 undefined）归 unmatched。route.path 类型兜底 String()（正则注册防御）。 */
export function resolveRouteTemplate(baseUrl: string, routePath: unknown): string {
  if (typeof routePath !== 'string' || routePath.length === 0) return UNMATCHED;
  return baseUrl + routePath;
}
