import { describe, expect, it, vi, beforeEach } from 'vitest';

// B2（批 13b）：useProjects q 参数化契约锁——queryKey 形状 / URL 拼接 / enabled 门。
// mock 模式照 queries.test.ts 先例（捕获 useQuery options 断言，不真渲染 Provider）。
let captured: Record<string, unknown> | undefined;

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((opts: unknown) => {
    captured = opts as Record<string, unknown>;
    return { data: undefined, isPending: true };
  }),
  useMutation: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  keepPreviousData: (prev: unknown) => prev,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('./client.js', () => ({
  api: { get: vi.fn(), getRaw: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  setAccessToken: vi.fn(),
  API_BASE: '/api/v1',
  getAccessToken: vi.fn(() => 'tok123'),
  ensureRefreshed: vi.fn().mockResolvedValue(null),
}));

import { useProjects } from './queries';
import { api } from './client.js';

const mockedGetRaw = api.getRaw as ReturnType<typeof vi.fn>;

describe('useProjects q 参数化（批 13b B2：Sidebar 搜索走后端）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured = undefined;
  });

  it('q 传入 → queryKey 尾部追加 q + URL 带 q=xxx（encodeURIComponent）', () => {
    useProjects(1, 100, '某某 科技');
    expect(captured!.queryKey).toEqual(['projects', 1, 100, '某某 科技']);
    (captured!.queryFn as () => unknown)();
    expect(mockedGetRaw).toHaveBeenCalledWith(
      `/projects?page=1&pageSize=100&q=${encodeURIComponent('某某 科技')}`,
    );
  });

  it('空串 q → key 与不传 q 同形（无尾元素，不产生独立缓存条目）', () => {
    useProjects(1, 100, '');
    expect(captured!.queryKey).toEqual(['projects', 1, 100]);
    captured = undefined;
    useProjects(1, 100);
    expect(captured!.queryKey).toEqual(['projects', 1, 100]);
    (captured!.queryFn as () => unknown)();
    expect(mockedGetRaw).toHaveBeenCalledWith('/projects?page=1&pageSize=100');
  });

  it('空白串 q（trim 后空）→ 同空串口径：key 无尾元素 + URL 无 q 段', () => {
    useProjects(2, 100, '   ');
    expect(captured!.queryKey).toEqual(['projects', 2, 100]);
    (captured!.queryFn as () => unknown)();
    expect(mockedGetRaw).toHaveBeenCalledWith('/projects?page=2&pageSize=100');
  });

  it('enabled 第 4 参：默认 true（App 层旧调用零影响）；显式 false 进 options（搜索态门）', () => {
    useProjects(1, 100);
    expect(captured!.enabled).toBe(true);
    captured = undefined;
    useProjects(1, 100, 'x', false);
    expect(captured!.enabled).toBe(false);
    (captured!.queryFn as () => unknown)();
    expect(mockedGetRaw).toHaveBeenCalledWith('/projects?page=1&pageSize=100&q=x');
  });

  it('不传 q 回归：key 形状与 13b 前一致（底表/展示列表口径不变）', () => {
    useProjects(3, 100);
    expect(captured!.queryKey).toEqual(['projects', 3, 100]);
    (captured!.queryFn as () => unknown)();
    expect(mockedGetRaw).toHaveBeenCalledWith('/projects?page=3&pageSize=100');
  });
});
