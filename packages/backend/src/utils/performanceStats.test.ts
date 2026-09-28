// 票 #32 P1-5 unit：性能统计核心（环形缓冲 + nearest-rank 分位）。
// 不依赖 DB/HTTP——样本直接注入 recordSample，断言精确分位值（时间无关，无 fake timers 需求）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PERFORMANCE_BUFFER_SIZE,
  ROUTE_MAP_MAX_TEMPLATES,
  getPerformanceStats,
  recordSample,
  resetPerformanceStats,
} from './performanceStats.js';

beforeEach(() => resetPerformanceStats());
afterEach(() => resetPerformanceStats());

describe('getPerformanceStats（空态）', () => {
  it('无样本时 routes 为空数组，结构字段齐全', () => {
    const stats = getPerformanceStats();
    expect(stats.routes).toEqual([]);
    expect(stats.bufferSize).toBe(PERFORMANCE_BUFFER_SIZE);
    expect(stats.uptimeSeconds).toBeGreaterThanOrEqual(0);
  });
});

describe('分位数计算（nearest-rank，手算精确值）', () => {
  it('1..100 样本：P50=50 P95=95 P99=99 min=1 max=100 avg=50.5', () => {
    for (let i = 1; i <= 100; i++) recordSample('/t', i);
    const stats = getPerformanceStats();
    expect(stats.routes).toHaveLength(1);
    const r = stats.routes[0]!;
    expect(r.route).toBe('/t');
    expect(r.count).toBe(100);
    expect(r.p50Ms).toBe(50);
    expect(r.p95Ms).toBe(95);
    expect(r.p99Ms).toBe(99);
    expect(r.minMs).toBe(1);
    expect(r.maxMs).toBe(100);
    expect(r.avgMs).toBe(50.5);
  });

  it('单样本：全部分位收敛到该值', () => {
    recordSample('/one', 7);
    const r = getPerformanceStats().routes[0]!;
    expect([r.p50Ms, r.p95Ms, r.p99Ms, r.minMs, r.maxMs]).toEqual([7, 7, 7, 7, 7]);
    expect(r.avgMs).toBe(7);
    expect(r.count).toBe(1);
  });
});

describe('环形缓冲覆盖语义', () => {
  it(`超容量（600 > 500）后 count 保留生命周期计数，分位只反映最近 500 样本（101..600）`, () => {
    for (let i = 1; i <= 600; i++) recordSample('/ring', i);
    const r = getPerformanceStats().routes[0]!;
    expect(r.count).toBe(600); // 生命周期总请求数不因覆盖丢失
    // 最近 500 个样本为 101..600（升序数组第 k 个 = 101 + k - 1）
    expect(r.minMs).toBe(101);
    expect(r.maxMs).toBe(600);
    expect(r.p50Ms).toBe(101 + Math.ceil(500 * 0.5) - 1); // 350
    expect(r.p95Ms).toBe(101 + Math.ceil(500 * 0.95) - 1); // 575
    expect(r.p99Ms).toBe(101 + Math.ceil(500 * 0.99) - 1); // 595
  });
});

describe('多模板隔离', () => {
  it('不同路由模板各占独立桶', () => {
    recordSample('/a', 10);
    recordSample('/b', 20);
    recordSample('/a', 30);
    const routes = getPerformanceStats().routes;
    const a = routes.find((x) => x.route === '/a')!;
    const b = routes.find((x) => x.route === '/b')!;
    expect(a.count).toBe(2);
    expect(b.count).toBe(1);
    expect(a.maxMs).toBe(30);
    expect(b.maxMs).toBe(20);
  });
});

describe('带参挂载点归一化（server.ts 带参 app.use 的 baseUrl 是实际解析值，Express 5 实测）', () => {
  it('uuid 形态 members 挂载 key 归一化为 :id 模板，两个不同 uuid 聚合到同一 entry', () => {
    recordSample('/api/v1/projects/550e8400-e29b-41d4-a1b2-c3d4e5f6a7b8/members/', 10);
    recordSample('/api/v1/projects/99990000-a1b2-c3d4-e5f6-a7b8c3d4e5f6/members/', 20);
    const routes = getPerformanceStats().routes;
    expect(routes).toHaveLength(1);
    expect(routes[0]!.route).toBe('/api/v1/projects/:id/members/');
    expect(routes[0]!.count).toBe(2);
  });

  it('嵌套子路由参数段（/:memberId）同样保留模板形态，仅挂载参数段被归一化', () => {
    recordSample('/api/v1/projects/550e8400-e29b-41d4-a1b2-c3d4e5f6a7b8/members/:memberId', 10);
    expect(getPerformanceStats().routes[0]!.route).toBe('/api/v1/projects/:id/members/:memberId');
  });

  it('getPerformanceStats 输出的 route 字段不含任何 uuid 形态串（安全面锁死）', () => {
    recordSample('/api/v1/projects/550e8400-e29b-41d4-a1b2-c3d4e5f6a7b8/members/', 10);
    recordSample('/api/v1/projects/6ba7b810-9dad-11d1-80b4-00c04fd430c8/members/:memberId', 20);
    const raw = JSON.stringify(getPerformanceStats());
    expect(raw).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(raw).not.toContain('550e8400');
    expect(raw).not.toContain('6ba7b810');
  });
});

describe('模板 Map 容量兜底（归一化漏网的新带参挂载不致无界增长）', () => {
  it('超 ROUTE_MAP_MAX_TEMPLATES 后新模板归 overflow 固定桶；存量模板与 overflow 各自继续聚合', () => {
    for (let i = 0; i < ROUTE_MAP_MAX_TEMPLATES; i++) recordSample(`/template-${i}`, 1);
    recordSample('/brand-new', 5); // 新模板 → overflow
    recordSample('/another-new', 6); // 新模板 → overflow（同桶聚合）
    recordSample('/template-0', 9); // 存量模板不受容量钳制
    const routes = getPerformanceStats().routes;
    expect(routes.find((x) => x.route === 'overflow')!.count).toBe(2);
    expect(routes.find((x) => x.route === '/template-0')!.count).toBe(2);
    // 无界增长被钳制：200 存量 + 1 overflow 固定桶
    expect(routes).toHaveLength(ROUTE_MAP_MAX_TEMPLATES + 1);
  });
});
