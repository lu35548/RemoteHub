import { describe, expect, it, vi, beforeEach } from 'vitest';

// mock 数据层与 react-query：捕获 useQuery options 断言（queryKey/URL/staleTime），
// 不真渲染 Provider——hooks 层契约测试（票 #22：staleTime 5min 覆盖默认 30s）
let captured: Record<string, unknown> | undefined;

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((opts: unknown) => {
    captured = opts as Record<string, unknown>;
    return { data: undefined, isPending: true };
  }),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.mock('./client.js', () => ({
  api: { get: vi.fn(), getRaw: vi.fn() },
  setAccessToken: vi.fn(),
}));

import { useDashboard, useProjectStats, useUserStats } from './queries';
import { api } from './client.js';

// 监控端点是非分页读端点：queryFn 须走剥 data 壳的 api.get（getRaw 返回完整响应体，真机联调教训）
const mockedGet = api.get as ReturnType<typeof vi.fn>;

describe('admin 监控 hooks（票 #22）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured = undefined;
  });

  it('useDashboard：GET /admin/dashboard，staleTime 5 分钟', () => {
    useDashboard();

    expect(captured).toMatchObject({
      queryKey: ['admin-dashboard'],
      staleTime: 5 * 60_000,
    });
    expect(typeof captured!.queryFn).toBe('function');
    (captured!.queryFn as () => unknown)();
    expect(mockedGet).toHaveBeenCalledWith('/admin/dashboard');
  });

  it('useUserStats：GET /admin/stats/users（30 天趋势），staleTime 5 分钟', () => {
    useUserStats();

    expect(captured).toMatchObject({
      queryKey: ['admin-stats-users'],
      staleTime: 5 * 60_000,
    });
    (captured!.queryFn as () => unknown)();
    expect(mockedGet).toHaveBeenCalledWith('/admin/stats/users');
  });

  it('useProjectStats：GET /admin/stats/projects，staleTime 5 分钟', () => {
    useProjectStats();

    expect(captured).toMatchObject({
      queryKey: ['admin-stats-projects'],
      staleTime: 5 * 60_000,
    });
    (captured!.queryFn as () => unknown)();
    expect(mockedGet).toHaveBeenCalledWith('/admin/stats/projects');
  });
});
