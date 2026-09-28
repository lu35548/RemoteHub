// packages/frontend/src/components/MfaChallengePage.test.tsx
// 票 #31：/mfa 挑战页 + 绑定流——状态机（setup→恢复码→challenge）与错误分路的行为锁
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { UIProvider } from './UIComponents';
import MfaChallengePage from './MfaChallengePage';
import { setMfaPending, getMfaPending } from '../api/mfaPending';

const { state } = vi.hoisted(() => ({
  state: {
    setupData: undefined as { secret: string; otpauthUri: string } | undefined,
    setupError: null as { error?: { code?: string; message?: string } } | null,
    setupPending: false,
    confirm: vi.fn(),
    verify: vi.fn(),
  },
}));

vi.mock('../api/queries', () => ({
  useMfaSetup: () => ({
    data: state.setupData,
    isPending: state.setupPending,
    isError: !!state.setupError,
    error: state.setupError,
  }),
  useMfaConfirm: () => ({ mutateAsync: state.confirm, isPending: false }),
  useMfaVerify: () => ({ mutateAsync: state.verify, isPending: false }),
}));

function Probe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage(entry = '/mfa') {
  return render(
    <UIProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Probe />
        <Routes>
          <Route path="/mfa" element={<MfaChallengePage />} />
          <Route path="/login" element={<div>登录页占位</div>} />
          <Route path="/" element={<div>主界面占位</div>} />
        </Routes>
      </MemoryRouter>
    </UIProvider>,
  );
}

describe('MfaChallengePage（票 #31）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMfaPending(null);
    state.setupData = undefined;
    state.setupError = null;
    state.setupPending = false;
  });

  it('无 mfaPending → 重定向 /login（内存态不持久，刷新重走密码）', () => {
    renderPage();
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('stage=verify：TOTP 提交 → verify({token}) 成功 → 跳 /', async () => {
    setMfaPending({ mfaPending: true, mfaStage: 'verify', mfaToken: 'mt' });
    state.verify.mockResolvedValue({ accessToken: 'at', user: { nickname: '管理员' } });
    renderPage();
    const input = screen.getByLabelText('动态验证码');
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));
    await waitFor(() => {
      expect(state.verify).toHaveBeenCalledWith({ token: '123456' });
    });
    await waitFor(() => {
      expect(screen.getByText('欢迎回来')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent('/');
    });
  });

  it('恢复码 tab 切换 → verify({recoveryCode})', async () => {
    setMfaPending({ mfaPending: true, mfaStage: 'verify', mfaToken: 'mt' });
    state.verify.mockResolvedValue({ accessToken: 'at', user: { nickname: '测试' } });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '恢复码' }));
    const input = screen.getByLabelText('恢复码');
    fireEvent.change(input, { target: { value: 'ABCDE-FGHJK' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));
    await waitFor(() => {
      expect(state.verify).toHaveBeenCalledWith({ recoveryCode: 'ABCDE-FGHJK' });
      expect(screen.getByTestId('location')).toHaveTextContent('/');
    });
  });

  it('MFA_001 → 内联错误，停留原页', async () => {
    setMfaPending({ mfaPending: true, mfaStage: 'verify', mfaToken: 'mt' });
    state.verify.mockRejectedValue({ error: { code: 'MFA_001', message: '动态验证码或恢复码错误' } });
    renderPage();
    fireEvent.change(screen.getByLabelText('动态验证码'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));
    await waitFor(() => {
      expect(screen.getByText('动态验证码或恢复码错误')).toBeInTheDocument();
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/mfa');
  });

  it('MFA_002 → 清 pending + 跳 /login（挑战 token 过期重走密码）', async () => {
    setMfaPending({ mfaPending: true, mfaStage: 'verify', mfaToken: 'mt' });
    state.verify.mockRejectedValue({ error: { code: 'MFA_002', message: '多因素认证令牌无效或已过期' } });
    renderPage();
    fireEvent.change(screen.getByLabelText('动态验证码'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并登录' }));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/login');
      expect(getMfaPending()).toBeNull();
    });
  });

  it('stage=setup：渲染二维码 SVG + secret + 确认输入', () => {
    setMfaPending({ mfaPending: true, mfaStage: 'setup', mfaToken: 'mt' });
    state.setupData = { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/RemoteHub:mfauser?secret=JBSWY3DPEHPK3PXP' };
    const { container } = renderPage();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeInTheDocument();
    expect(screen.getByLabelText('验证码确认')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认绑定' })).toBeInTheDocument();
  });

  it('确认绑定成功 → 恢复码一次性展示（10 组）+ 我已保存进入挑战', async () => {
    setMfaPending({ mfaPending: true, mfaStage: 'setup', mfaToken: 'mt' });
    state.setupData = { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/RemoteHub:mfauser' };
    const codes = Array.from({ length: 10 }, (_, i) => `CODE${i}-XXXXX`);
    state.confirm.mockResolvedValue({ recoveryCodes: codes });
    renderPage();
    fireEvent.change(screen.getByLabelText('验证码确认'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: '确认绑定' }));
    await waitFor(() => {
      expect(state.confirm).toHaveBeenCalledWith({ secret: 'JBSWY3DPEHPK3PXP', token: '654321' });
      expect(screen.getByText('请保存恢复码')).toBeInTheDocument();
    });
    for (const c of codes) expect(screen.getByText(c)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '我已保存，前往验证' }));
    expect(screen.getByLabelText('动态验证码')).toBeInTheDocument();
  });

  it('setup 数据加载失败（MFA_002）→ 清 pending 跳 /login', async () => {
    setMfaPending({ mfaPending: true, mfaStage: 'setup', mfaToken: 'mt' });
    state.setupError = { error: { code: 'MFA_002', message: '多因素认证令牌无效或已过期' } };
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/login');
      expect(getMfaPending()).toBeNull();
    });
  });

  // ── review F2：confirm 路径的清 pending 也要有锁（第三条清 pending 测试）──
  it('confirm MFA_002 → 清 pending + 跳 /login（挑战 token 过期重走密码）', async () => {
    setMfaPending({ mfaPending: true, mfaStage: 'setup', mfaToken: 'mt' });
    state.setupData = { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/RemoteHub:mfauser' };
    state.confirm.mockRejectedValue({ error: { code: 'MFA_002', message: '多因素认证令牌无效或已过期' } });
    renderPage();
    fireEvent.change(screen.getByLabelText('验证码确认'), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: '确认绑定' }));
    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/login');
      expect(getMfaPending()).toBeNull();
    });
  });

  // ── review F3：setup 阶段无数据时的显式分支（不落错位挑战表单）──
  it('setup 加载中 → 加载提示，不渲染挑战表单', () => {
    setMfaPending({ mfaPending: true, mfaStage: 'setup', mfaToken: 'mt' });
    state.setupPending = true;
    renderPage();
    expect(screen.getByText('正在获取绑定信息…')).toBeInTheDocument();
    expect(screen.queryByLabelText('动态验证码')).not.toBeInTheDocument();
  });

  it('setup 非预期错误（SYS_001）→ 兜底错误 + 返回登录，不渲染错位挑战表单', async () => {
    setMfaPending({ mfaPending: true, mfaStage: 'setup', mfaToken: 'mt' });
    state.setupError = { error: { code: 'SYS_001', message: '服务器内部错误' } };
    renderPage();
    expect(screen.getByText('服务器内部错误')).toBeInTheDocument();
    expect(screen.queryByLabelText('动态验证码')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回登录' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
    expect(getMfaPending()).toBeNull();
  });
});
