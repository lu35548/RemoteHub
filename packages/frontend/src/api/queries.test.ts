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
  // M1（#49 rev）：queries.ts 三分页 hook 新消费 keepPreviousData——factory 随 import 扩展
  keepPreviousData: (prev: unknown) => prev,
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('./client.js', () => ({
  api: { get: vi.fn(), getRaw: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  setAccessToken: vi.fn(),
  API_BASE: '/api/v1',
  // 导出走手动 fetch，token 从内存取；401 走 ensureRefreshed 重试（票 #23 review 采纳）
  getAccessToken: vi.fn(() => 'tok123'),
  ensureRefreshed: vi.fn().mockResolvedValue(null),
}));

import { exportAuditLogsCsv, launchConnection, useAuditLogs, useDashboard, useForgotPassword, useProjectStats, useResetPassword, useAdminResetLink, useUserStats, useNotifications, useMarkNotificationRead, NOTIFICATION_QUERY_KEY, useAdminBackups, useTriggerBackup, downloadBackup, BACKUP_QUERY_KEY, useConnections, useConnectionStats, useDeleteConnection, useCloneConnection, useUsers, useProjects } from './queries';
import { keepPreviousData } from '@tanstack/react-query';
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

// ── 直连动作分派（票 #46）──
// launch 端点双形态响应：application/x-rdp → Blob 下载（downloadBlob 真链路，jsdom 配方同 CSV 导出）；
// JSON → 剥壳 union。401 与统一客户端同口径（ensureRefreshed 重试一次）。
describe('launchConnection（票 #46）', () => {
  /** jsdom 未实现 URL.createObjectURL/revokeObjectURL，defineProperty 补桩 */
  function stubObjectURL() {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:mock'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  }

  it('application/x-rdp → Blob 下载（filename* UTF-8 中文解码 + Authorization 头）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'Content-Type': 'application/x-rdp',
        'Content-Disposition': `attachment; filename="connection-c1.rdp"; filename*=UTF-8''${encodeURIComponent('财务部.rdp')}`,
      }),
      blob: async () => new Blob(['﻿full address:s:'], { type: 'application/x-rdp' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    stubObjectURL();
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      // a.click() 无参调用，取元素只能经 this（jsdom 场景的正当 alias）
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      clicked = this;
    });

    const result = await launchConnection('c1');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/connections/c1/launch',
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok123' },
        credentials: 'include',
      }),
    );
    expect(result).toMatchObject({ type: 'rdp_file', filename: '财务部.rdp' });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clicked?.download).toBe('财务部.rdp');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('rdp 响应无 filename* → 回退 ASCII filename（connection-<id>.rdp）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({
        'Content-Type': 'application/x-rdp',
        'Content-Disposition': 'attachment; filename="connection-c1.rdp"',
      }),
      blob: async () => new Blob(['x']),
    });
    vi.stubGlobal('fetch', fetchMock);
    stubObjectURL();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const result = await launchConnection('c1');

    expect(result).toMatchObject({ type: 'rdp_file', filename: 'connection-c1.rdp' });

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('JSON command → 剥壳返回 {type:command, command}', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ success: true, data: { type: 'command', command: 'ssh root@10.0.0.5 -p 22' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await launchConnection('c1');

    expect(result).toMatchObject({ type: 'command', command: 'ssh root@10.0.0.5 -p 22' });

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('JSON url → 剥壳返回 {type:url, url}', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ success: true, data: { type: 'url', url: 'https://intranet.example.com' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await launchConnection('c1');

    expect(result).toMatchObject({ type: 'url', url: 'https://intranet.example.com' });

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('400 CONN_006 → 抛 Error 携带 code 属性（组件层判码出中文 toast）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false, status: 400,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      json: async () => ({ success: false, error: { code: 'CONN_006', message: '该协议不支持直连' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(launchConnection('c1')).rejects.toMatchObject({ message: '该协议不支持直连', code: 'CONN_006' });

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('401 → ensureRefreshed 刷新后重试一次（新 token 进 Authorization）', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => ({ success: true, data: { type: 'url', url: 'https://vpn.example.com' } }),
      });
    vi.stubGlobal('fetch', fetchMock);
    (ensureRefreshed as ReturnType<typeof vi.fn>).mockResolvedValue('tok456');

    const result = await launchConnection('c1');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[1] as unknown[])[1]).toHaveProperty('headers.Authorization', 'Bearer tok456');
    expect(result).toMatchObject({ type: 'url', url: 'https://vpn.example.com' });

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

// ── 备份 hooks（#39）──
// GET /admin/backups 是非分页端点（backupController.listBackupsHandler 直出纯数组，
// 无 pagination 包裹）：queryFn 须走剥壳的 api.get——与 audit-logs（分页 getRaw）相反
describe('备份 hooks（#39）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured = undefined;
    mutationCaptured = undefined;
  });

  it('useAdminBackups：GET /admin/backups（api.get 剥壳），staleTime 5 分钟', () => {
    useAdminBackups();

    expect(captured).toMatchObject({ queryKey: BACKUP_QUERY_KEY, staleTime: 5 * 60_000 });
    expect(typeof captured!.queryFn).toBe('function');
    (captured!.queryFn as () => unknown)();
    expect(mockedGet).toHaveBeenCalledWith('/admin/backups');
  });

  it('useTriggerBackup：POST /admin/backups（无 body）；成功后 invalidate 备份列表', () => {
    const invalidate = vi.fn();
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({ invalidateQueries: invalidate } as never);
    useTriggerBackup();
    (mutationCaptured!.mutationFn as () => unknown)();
    expect(api.post).toHaveBeenCalledWith('/admin/backups'); // 单参数 = 无 body
    (mutationCaptured!.onSuccess as () => void)();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: BACKUP_QUERY_KEY });
  });
});

// ── 连接金矿 hooks（#42）──
// 列表是分页端点（响应含 pagination → getRaw）；stats 是 data 壳端点（controller 包 { success, data }
// → api.get 剥壳）——壳选择相反，双双锁死（frontend-api-get-vs-getraw 教训）
describe('连接金矿 hooks（#42）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured = undefined;
    mutationCaptured = undefined;
  });

  it('useConnections：filters 全量 → queryKey 携带结构化 filters（#49 分页参数预留），URL 按键序拼 projectId/tag/q/sort', () => {
    useConnections({ projectId: 'p1', tag: 'prod', q: 'web', sort: 'lastAccessed' }, 2, 50);

    expect(captured).toMatchObject({
      queryKey: ['connections', { projectId: 'p1', tag: 'prod', q: 'web', sort: 'lastAccessed' }, 2, 50],
    });
    (captured!.queryFn as () => unknown)();
    expect(mockedGetRaw).toHaveBeenCalledWith('/connections?page=2&pageSize=50&projectId=p1&tag=prod&q=web&sort=lastAccessed');
  });

  it('useConnections：空 filters → URL 只带默认分页（undefined 不拼，与审计页同口径）', () => {
    useConnections();

    expect(captured).toMatchObject({ queryKey: ['connections', {}, 1, 100] });
    (captured!.queryFn as () => unknown)();
    expect(mockedGetRaw).toHaveBeenCalledWith('/connections?page=1&pageSize=100');
  });

  it('useConnectionStats：GET /projects/:id/connections/stats（api.get 剥壳），projectId 空停查', () => {
    useConnectionStats('p1');

    expect(captured).toMatchObject({ queryKey: ['connection-stats', 'p1'] });
    (captured!.queryFn as () => unknown)();
    expect(mockedGet).toHaveBeenCalledWith('/projects/p1/connections/stats');

    useConnectionStats(null);
    expect(captured).toMatchObject({ enabled: false });
  });

  it('useDeleteConnection：成功后 invalidate 连接列表与统计两族缓存（stats 随 CRUD 失效）', () => {
    const invalidate = vi.fn();
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({ invalidateQueries: invalidate } as never);
    useDeleteConnection();

    (mutationCaptured!.mutationFn as (d: unknown) => unknown)('c1');
    expect(api.delete).toHaveBeenCalledWith('/connections/c1');

    (mutationCaptured!.onSuccess as () => void)();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['connections'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['connection-stats'] });
  });
});

// ── 克隆连接 hook（#43）──
describe('克隆连接 hook（#43）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutationCaptured = undefined;
  });

  it('useCloneConnection：POST /connections/:id/clone（无 body）；成功后 invalidate 连接列表与统计两族缓存', () => {
    const invalidate = vi.fn();
    (useQueryClient as ReturnType<typeof vi.fn>).mockReturnValueOnce({ invalidateQueries: invalidate } as never);
    useCloneConnection();

    (mutationCaptured!.mutationFn as (d: unknown) => unknown)('c1');
    expect(api.post).toHaveBeenCalledWith('/connections/c1/clone');

    (mutationCaptured!.onSuccess as () => void)();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['connections'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['connection-stats'] });
  });
});

describe('downloadBackup（#39）', () => {
  /** jsdom 未实现 URL.createObjectURL/revokeObjectURL，defineProperty 补桩 */
  function stubObjectURL() {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn().mockReturnValue('blob:mock'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
  }

  it('fetch blob → downloadBlob 以行内 filename 落盘（带 Authorization）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(['db'], { type: 'application/octet-stream' }) });
    vi.stubGlobal('fetch', fetchMock);
    stubObjectURL();
    let clicked: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      // a.click() 无参调用，取元素只能经 this（jsdom 场景的正当 alias）
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      clicked = this;
    });

    await downloadBackup('backup-20261104-020000.db');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/admin/backups/backup-20261104-020000.db/download',
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok123' },
        credentials: 'include',
      }),
    );
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(clicked?.download).toBe('backup-20261104-020000.db'); // 落盘文件名 = 行内 filename
    expect(clicked?.href).toContain('blob:mock');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock');

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('非 2xx → 抛中文错误（不触发下载）', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);
    stubObjectURL();

    await expect(downloadBackup('backup-20261104-020000.db')).rejects.toThrow('下载失败');
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('401 → ensureRefreshed 刷新后重试一次成功（新 token 进 Authorization）', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, blob: async () => new Blob(['db']) });
    vi.stubGlobal('fetch', fetchMock);
    stubObjectURL();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    (ensureRefreshed as ReturnType<typeof vi.fn>).mockResolvedValue('tok456');

    await downloadBackup('backup-20261104-020000.db');

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
      ok: false, status: 403, json: async () => ({ success: false, error: { code: 'ROLE_001', message: '仅管理员可访问' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(downloadBackup('backup-20261104-020000.db')).rejects.toThrow('仅管理员可访问');

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});


describe('useUsers 分页契约（#49）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured = undefined;
  });

  it('useUsers(2) → queryKey [users, 2] + URL page=2&pageSize=100（pageSize 与后端 MAX_PAGE_SIZE 同口径）', () => {
    useUsers(2);
    expect(captured).toMatchObject({ queryKey: ['users', 2] });
    (captured!.queryFn as () => unknown)();
    expect(mockedGetRaw).toHaveBeenCalledWith('/users?page=2&pageSize=100');
  });

  it('useUsers() 默认 page=1', () => {
    useUsers();
    expect(captured).toMatchObject({ queryKey: ['users', 1] });
  });
});


describe('M1 placeholderData 契约（#49 rev：翻页期间保持旧 data 渲染）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured = undefined;
  });

  it('useUsers/useProjects/useConnections 三 hook options 均携带 placeholderData=keepPreviousData', () => {
    useUsers(1);
    expect(captured!.placeholderData).toBe(keepPreviousData);
    captured = undefined;
    useProjects(2, 100);
    expect(captured!.placeholderData).toBe(keepPreviousData);
    captured = undefined;
    useConnections({}, 3, 100);
    expect(captured!.placeholderData).toBe(keepPreviousData);
  });
});
