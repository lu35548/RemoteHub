import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import BackupsPage from './BackupsPage';
import type { UserPublic } from '@remotehub/shared';
import type { BackupListItem } from '../api/queries';

// mock 数据层：useMe 受控（两段式守卫的第二段在组件内）+ 备份三件（#39）。
// useTriggerBackup 的 onSuccess invalidate 行为在 queries.test.ts 锁，此处只控页面层交互
vi.mock('../api/queries', () => ({
  useMe: vi.fn(),
  useAdminBackups: vi.fn(),
  useTriggerBackup: vi.fn(),
  downloadBackup: vi.fn(),
}));
// UIComponents 仅 mock useUI（toast 受控），PageLoading 等保持真实现
vi.mock('./UIComponents', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useUI: vi.fn(),
}));
import { downloadBackup, useAdminBackups, useMe, useTriggerBackup } from '../api/queries';
import { useUI } from './UIComponents';

const mockedUseMe = useMe as ReturnType<typeof vi.fn>;
const mockedUseAdminBackups = useAdminBackups as ReturnType<typeof vi.fn>;
const mockedUseTriggerBackup = useTriggerBackup as ReturnType<typeof vi.fn>;
const mockedDownloadBackup = downloadBackup as ReturnType<typeof vi.fn>;
const mockedUseUI = useUI as ReturnType<typeof vi.fn>;

const admin: UserPublic = { id: 'u1', username: 'admin', nickname: '管理员', role: 'admin', isActive: true, lastActiveAt: null, createdAt: '2026-01-01' };
const normalUser: UserPublic = { ...admin, id: 'u2', username: 'wangwu', nickname: '王五', role: 'user' };

const backup = (overrides: Partial<BackupListItem> = {}): BackupListItem => ({
  filename: 'backup-20261104-020000.db',
  sizeBytes: 5_242_880, // 5.0 MB
  createdAt: '2026-11-04T02:00:00.000Z',
  ...overrides,
});

/** 测试壳：MemoryRouter + 位置探针 + / 承接路由（断言重定向落点） */
function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/admin/backups']}>
      <Routes>
        <Route path="/admin/backups" element={<BackupsPage />} />
        <Route path="/" element={<div>工作台占位</div>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>,
  );
}

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location-probe">{location.pathname}</div>;
}

/** 守卫用例共用：hooks 默认返回成功数据（守卫路径不消费内容）；触发/下载 mock 对齐真实形状 */
function mockSuccessData(items: BackupListItem[] = []) {
  mockedUseAdminBackups.mockReturnValue({ data: items, isPending: false } as never);
  mockedUseTriggerBackup.mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({ filename: 'backup-20261104-020000.db', sizeBytes: 1, durationMs: 1234 }),
    isPending: false,
  } as never);
  mockedDownloadBackup.mockResolvedValue(undefined);
}

describe('BackupsPage 守卫（P0-7 两段式）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseUI.mockReturnValue({ toast: vi.fn(), confirm: vi.fn() });
    mockSuccessData();
  });

  it('isPending → 不渲染标题且不重定向', () => {
    mockedUseMe.mockReturnValue({ data: undefined, isPending: true });
    renderPage();
    expect(screen.queryByText('数据备份')).not.toBeInTheDocument();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/admin/backups');
  });

  it('非 admin → Navigate 重定向回工作台', () => {
    mockedUseMe.mockReturnValue({ data: normalUser, isPending: false });
    renderPage();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/');
    expect(screen.getByText('工作台占位')).toBeInTheDocument();
  });

  it('useMe 失败（me=undefined）→ fail-closed 同样重定向', () => {
    mockedUseMe.mockReturnValue({ data: undefined, isPending: false });
    renderPage();
    expect(screen.getByTestId('location-probe')).toHaveTextContent('/');
    expect(screen.queryByText('数据备份')).not.toBeInTheDocument();
  });

  it('admin → 页标题可见', () => {
    mockedUseMe.mockReturnValue({ data: admin, isPending: false });
    renderPage();
    expect(screen.getByText('数据备份')).toBeInTheDocument();
  });
});

describe('BackupsPage 备份列表（#39）', () => {
  const items = [
    backup(),
    backup({ filename: 'backup-20261103-020000.db', sizeBytes: 1536, createdAt: '2026-11-03T02:00:00.000Z' }), // 1.5 KB
    backup({ filename: 'backup-20261102-020000.db', sizeBytes: 500, createdAt: '2026-11-02T02:00:00.000Z' }), // 500 B
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseUI.mockReturnValue({ toast: vi.fn(), confirm: vi.fn() });
    mockedUseMe.mockReturnValue({ data: admin, isPending: false });
    mockSuccessData(items);
  });

  it('表格行：文件名 / 大小分档 / 时间列；无「状态」列（文件即真相裁决 2026-11-04）', () => {
    renderPage();

    // 行定位：文件名 → closest('tr')
    const row1 = screen.getByText('backup-20261104-020000.db').closest('tr')!;
    const row2 = screen.getByText('backup-20261103-020000.db').closest('tr')!;
    const row3 = screen.getByText('backup-20261102-020000.db').closest('tr')!;
    // 大小人性化：MB / KB / B 三档
    expect(within(row1).getByText('5.0 MB')).toBeInTheDocument();
    expect(within(row2).getByText('1.5 KB')).toBeInTheDocument();
    expect(within(row3).getByText('500 B')).toBeInTheDocument();
    // 时间列形状 MM-DD HH:mm（formatTime 本地时区，断形状不断具体值）
    for (const row of [row1, row2, row3]) {
      expect(row.textContent).toMatch(/\d{2}-\d{2} \d{2}:\d{2}/);
    }
    // 每行有下载按钮
    expect(screen.getByRole('button', { name: '下载 backup-20261104-020000.db' })).toBeInTheDocument();
    // 裁决测试锁：无状态字段 → 不渲染「状态」列
    expect(screen.queryByText('状态')).not.toBeInTheDocument();
  });

  it('列表 loading → 骨架态：表头在、行数据与空态文案不在', () => {
    mockedUseAdminBackups.mockReturnValue({ data: undefined, isPending: true } as never);
    renderPage();
    expect(screen.getByText('文件名')).toBeInTheDocument(); // DataTable loading 态仍渲染表头
    expect(screen.queryByText('backup-20261104-020000.db')).not.toBeInTheDocument();
    expect(screen.queryByText('暂无备份')).not.toBeInTheDocument();
  });

  it('空列表 → 空态文案「暂无备份」', () => {
    mockedUseAdminBackups.mockReturnValue({ data: [], isPending: false } as never);
    renderPage();
    expect(screen.getByText('暂无备份')).toBeInTheDocument();
  });

  it('useAdminBackups 失败 → toast 中文错误（errMsg 兜底）', async () => {
    const toast = vi.fn();
    mockedUseUI.mockReturnValue({ toast, confirm: vi.fn() });
    mockedUseAdminBackups.mockReturnValue({
      data: undefined, isPending: false, isError: true, error: new Error('boom'),
    } as never);
    renderPage();

    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', '加载失败', '无法加载备份列表'));
  });
});

describe('BackupsPage 手动触发与下载（#39）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseUI.mockReturnValue({ toast: vi.fn(), confirm: vi.fn() });
    mockedUseMe.mockReturnValue({ data: admin, isPending: false });
    mockSuccessData([backup()]);
  });

  it('点击「立即备份」→ mutateAsync 触发；成功 toast 含耗时（durationMs 秒）', async () => {
    const toast = vi.fn();
    const mutateAsync = vi.fn().mockResolvedValue({ filename: 'backup-20261104-020000.db', sizeBytes: 1, durationMs: 1234 });
    mockedUseUI.mockReturnValue({ toast, confirm: vi.fn() });
    mockedUseTriggerBackup.mockReturnValue({ mutateAsync, isPending: false } as never);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '立即备份' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
    // durationMs=1234 → 「1.2 秒」
    await waitFor(() => expect(toast).toHaveBeenCalledWith('success', '备份完成', expect.stringContaining('1.2 秒')));
  });

  it('触发失败 → toast 中文错误（errMsg 取服务端消息）', async () => {
    const toast = vi.fn();
    mockedUseUI.mockReturnValue({ toast, confirm: vi.fn() });
    mockedUseTriggerBackup.mockReturnValue({
      mutateAsync: vi.fn().mockRejectedValue({ error: { code: 'BACKUP_003', message: '备份执行失败' } }),
      isPending: false,
    } as never);
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '立即备份' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', '备份失败', '备份执行失败'));
  });

  it('触发进行中 → 按钮禁用且文案「备份中...」', () => {
    mockedUseTriggerBackup.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
    } as never);
    renderPage();

    const btn = screen.getByRole('button', { name: '备份中...' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '立即备份' })).not.toBeInTheDocument();
  });

  it('点击行内下载 → downloadBackup 收到行内 filename', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '下载 backup-20261104-020000.db' }));

    expect(mockedDownloadBackup).toHaveBeenCalledWith('backup-20261104-020000.db');
  });

  it('下载失败 → toast 中文错误（errMsg 兜底）', async () => {
    const toast = vi.fn();
    mockedUseUI.mockReturnValue({ toast, confirm: vi.fn() });
    mockedDownloadBackup.mockRejectedValue(new Error('network'));
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: '下载 backup-20261104-020000.db' }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith('error', '下载失败', '下载失败'));
  });
});
