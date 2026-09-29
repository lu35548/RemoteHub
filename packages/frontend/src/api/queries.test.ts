import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useQueryClient } from '@tanstack/react-query';

// mock 数据层与 react-query：捕获 useQuery options 断言（queryKey/URL/staleTime），
// 不真渲染 Provider——hooks 层契约测试（票 #22：staleTime 5min 覆盖默认 30s）
let captured: Record<string, unknown> | undefined;
let mutationCaptured: Record<string, unknown> | undefined;

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn((opts: unknown) => {
    captured = opts as Record<string, unknown>;
    return { data: undefined, isPending: true };
  }),
  useMutation: vi.fn((opts: unknown) => {
    mutationCaptured = opts as Record<string, unknown>;
    return { mutateAsync: vi.fn(), isPending: false };
  }),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('./client.js', () => ({
  api: { get: vi.fn(), getRaw: vi.fn(), post: vi.fn(), patch: vi.fn() },
  setAccessToken: vi.fn(),
  API_BASE: '/api/v1',
  // 导出走手动 fetch，token 从内存取；401 走 ensureRefreshed 重试（票 #23 review 采纳）
  getAccessToken: vi.fn(() => 'tok123'),
  ensureRefreshed: vi.fn().mockResolvedValue(null),
}));

import { exportAuditLogsCsv, useAuditLogs, useDashboard, useForgotPassword, useProjectStats, useResetPassword, useAdminResetLink, useUserStats, useNotifications, useMarkNotificationRead, NOTIFICATION_QUERY_KEY } from './queries';
import { api, ensureRefreshed } from './client.js';
import type { AuditLogQuery } from '@remotehub/shared';

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

// ── 审计查询（票 #23）──
// audit-logs 是分页端点（响应含 pagination）：queryFn 须走 api.getRaw（与 dashboard 三 hooks 相反）
const mockedGetRaw = api.getRaw as ReturnType<typeof vi.fn>;

describe('useAuditLogs（票 #23）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured = undefined;
  });

  it('queryKey 含全部筛选参数与 page，URL 同步全部参数', () => {
    const filters: AuditLogQuery = {
      userId: 'u1', action: 'AUTH_LOGIN', resource: 'user',
      startDate: '2026-09-01', endDate: '2026-09-23', result: 'success',
    };
    useAuditLogs(filters, 2);

    expect(captured).toMatchObject({ queryKey: ['audit-logs', filters, 2] });
    (captured!.queryFn as () => unknown)();
    const url = mockedGetRaw.mock.lastCall?.[0] as string;
    expect(url).toContain('/audit-logs?');
    for (const kv of [
      'userId=u1', 'action=AUTH_LOGIN', 'resource=user',
      'startDate=2026-09-01', 'endDate=2026-09-23', 'result=success', 'page=2',
    ]) {
      expect(url).toContain(kv);
    }
  });

  it('空筛选 → URL 只带 page（不拼 undefined 参数）', () => {
    useAuditLogs({}, 1);

    expect(captured).toMatchObject({ queryKey: ['audit-logs', {}, 1] });
    (captured!.queryFn as () => unknown)();
    expect(mockedGetRaw).toHaveBeenCalledWith('/audit-logs?page=1');
  });
});

describe('exportAuditLogsCsv（票 #23）', () => {
  /** jsdom 未实现 URL.createObjectURL/revokeObjectURL，defineProperty 补桩 */
  function stubObjectURL() {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:mock'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  }

  it('fetch blob → a[download] 触发浏览器保存（带 Authorization）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['id\n'], { type: 'text/csv' }) });
    vi.stubGlobal('fetch', fetchMock);
    stubObjectURL();
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      // a.click() 无参调用，取元素只能经 this（jsdom 场景的正当 alias）
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      clicked = this;
    });

    await exportAuditLogsCsv({ result: 'failure' });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/audit-logs/export?result=failure',
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok123' },
        credentials: 'include',
      }),
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clicked?.download).toBe('audit-logs.csv');
    expect(clicked?.href).toContain('blob:mock');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('非 2xx → 抛中文错误（不触发下载）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);
    stubObjectURL();

    await expect(exportAuditLogsCsv({})).rejects.toThrow('导出失败');
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('401 → ensureRefreshed 刷新后重试一次成功（新 token 进 Authorization）', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['csv']) });
    vi.stubGlobal('fetch', fetchMock);
    stubObjectURL();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    (ensureRefreshed as ReturnType<typeof vi.fn>).mockResolvedValue('tok456');

    await exportAuditLogsCsv({});

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1] as unknown[])[1]).toHaveProperty(
      'headers.Authorization', 'Bearer tok456',
    );
    expect(URL.createObjectURL).toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('非 2xx 且 body 是 ApiErrorResponse → 保留服务端中文消息', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 403, json: async () => ({ success: false, error: { code: 'FORBIDDEN', message: '仅管理员可导出' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(exportAuditLogsCsv({})).rejects.toThrow('仅管理员可导出');

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});

// ── 密码重置 hooks（票 #29）──
// forgot/reset 是 POST 端点：mutationFn URL/载荷契约（空窗导航行为在 useChangePassword.test 锁）
describe('密码重置 hooks（票 #29）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationCaptured = undefined;
  });

  it('useForgotPassword：POST /auth/forgot-password', () => {
    useForgotPassword();
    expect(typeof mutationCaptured!.mutationFn).toBe('function');
    (mutationCaptured!.mutationFn as (d: unknown) => unknown)({ username: 'alice' });
    expect((api.post as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('/auth/forgot-password', { username: 'alice' });
  });

  it('useResetPassword：POST /auth/reset-password（token+newPassword）', () => {
    useResetPassword();
    (mutationCaptured!.mutationFn as (d: unknown) => unknown)({ token: 't', newPassword: 'n' });
    expect(api.post).toHaveBeenCalledWith('/auth/reset-password', { token: 't', newPassword: 'n' });
  });

  it('useAdminResetLink：POST /admin/users/:id/reset-link', () => {
    useAdminResetLink();
    (mutationCaptured!.mutationFn as (d: unknown) => unknown)('u2');
    expect(api.post).toHaveBeenCalledWith('/admin/users/u2/reset-link');
  });
});

// ── 通知 hooks（票 #37）──
// 两个 API 事实的测试锁：① 列表是分页端点须走 getRaw（不剥壳，total 驱动角标）；
// ② PATCH 已读无 body（notificationController.markRead 不读 req.body，design §8.6 勘误）
describe('通知 hooks（票 #37）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured = undefined;
    mutationCaptured = undefined;
  });

  it('useNotifications：getRaw /notifications 分页端点，queryFn 把 payload JSON 字符串归一化为对象', async () => {
    useNotifications();
    expect(captured).toMatchObject({ queryKey: NOTIFICATION_QUERY_KEY });

    // queryFn 归一化：REST payload 是 Prisma String 列直出的 JSON 字符串。
    // 先 mock 再唯一一次调用并 await——裸调用时 mock 返回 undefined，raw.data.map 抛出的
    // rejected promise 无人接收，会以 unhandled error 把 vitest 退出码顶成 1（CI 必红）
    const getRawMock = api.getRaw as ReturnType<typeof vi.fn>;
    const rawBody = {
      success: true as const,
      data: [
        { id: 'n1', type: 'MEMBER_ADDED', payload: '{"message":"张三加入了项目"}', isRead: false, createdAt: '2026-09-29T00:00:00.000Z' },
        { id: 'n2', type: 'SYSTEM_ALERT', payload: 'not-json', isRead: false, createdAt: '2026-09-29T00:00:01.000Z' }, // 脏数据兜底
      ],
      pagination: { page: 1, pageSize: 50, total: 2 },
    };
    getRawMock.mockResolvedValueOnce(rawBody);
    const normalized = await (captured!.queryFn as () => Promise<typeof rawBody>)();
    expect(getRawMock).toHaveBeenCalledWith('/notifications?page=1&pageSize=50');
    expect(normalized.data[0]!.payload).toEqual({ message: '张三加入了项目' }); // 字符串 → 对象
    expect(normalized.data[1]!.payload).toEqual({}); // 脏 payload 不炸列表
    expect(normalized.pagination.total).toBe(2);
  });

  it('useMarkNotificationRead：PATCH /notifications/:id/read 且无 body；成功后 invalidate 通知缓存', () => {
    const invalidate = vi.fn();
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({ invalidateQueries: invalidate } as never);
    useMarkNotificationRead();
    (mutationCaptured!.mutationFn as (d: unknown) => unknown)('n9');
    expect(api.patch).toHaveBeenCalledWith('/notifications/n9/read'); // 单参数 = 无 body
    (mutationCaptured!.onSuccess as () => void)();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: NOTIFICATION_QUERY_KEY });
  });
});
