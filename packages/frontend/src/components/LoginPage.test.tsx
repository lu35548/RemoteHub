import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { UIProvider } from './UIComponents';
import LoginPage from './LoginPage';

// mock 数据层：useLogin 受控
vi.mock('../api/queries', () => ({
  useLogin: vi.fn(),
}));
import { useLogin } from '../api/queries';

const mockedUseLogin = useLogin as ReturnType<typeof vi.fn>;

/** 测试壳：UIProvider（toast）+ MemoryRouter + 位置探针 */
function Probe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderLogin() {
  return render(
    <UIProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Probe />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>主界面占位</div>} />
        </Routes>
      </MemoryRouter>
    </UIProvider>,
  );
}

describe('LoginPage（T3）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('smoke：渲染标题与表单', () => {
    mockedUseLogin.mockReturnValue({ mutateAsync: vi.fn(), isPending: false });
    renderLogin();
    expect(screen.getByText('RemoteHub')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('请输入用户名')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /安全登录/ })).toBeInTheDocument();
  });

  it('登录成功 → 欢迎回来 toast + 跳转 /', async () => {
    const user = { id: 'u1', username: 'admin', nickname: '管理员' };
    const mutateAsync = vi.fn().mockResolvedValue({ accessToken: 'tok', user });
    mockedUseLogin.mockReturnValue({ mutateAsync, isPending: false });

    const events = userEvent.setup();
    renderLogin();
    await events.type(screen.getByPlaceholderText('请输入用户名'), 'admin');
    await events.type(screen.getByPlaceholderText('••••••••'), 'Admin123');
    await events.click(screen.getByRole('button', { name: /安全登录/ }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({ username: 'admin', password: 'Admin123' });
    });
    await waitFor(() => {
      expect(screen.getByText('欢迎回来')).toBeInTheDocument();
      expect(screen.getByTestId('location')).toHaveTextContent('/');
    });
  });

  it('凭据错误（AUTH_001）→ 显示 v1 同款文案，不跳转', async () => {
    const mutateAsync = vi.fn().mockRejectedValue({ success: false, error: { code: 'AUTH_001', message: '用户名或密码错误' } });
    mockedUseLogin.mockReturnValue({ mutateAsync, isPending: false });

    const events = userEvent.setup();
    renderLogin();
    await events.type(screen.getByPlaceholderText('请输入用户名'), 'admin');
    await events.type(screen.getByPlaceholderText('••••••••'), 'wrong');
    await events.click(screen.getByRole('button', { name: /安全登录/ }));

    await waitFor(() => {
      expect(screen.getByText('用户名或密码错误')).toBeInTheDocument();
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });

  it('服务异常（非 AUTH_001）→ 登录服务异常，不跳转', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('network'));
    mockedUseLogin.mockReturnValue({ mutateAsync, isPending: false });

    const events = userEvent.setup();
    renderLogin();
    await events.type(screen.getByPlaceholderText('请输入用户名'), 'admin');
    await events.type(screen.getByPlaceholderText('••••••••'), 'Admin123');
    await events.click(screen.getByRole('button', { name: /安全登录/ }));

    await waitFor(() => {
      expect(screen.getByText('登录服务异常')).toBeInTheDocument();
    });
    expect(screen.getByTestId('location')).toHaveTextContent('/login');
  });
});
