// packages/frontend/src/components/ResetPasswordPage.test.tsx
// 票 #29：/reset-password?token= 页面——token 读取 + 双密码表单 + 成功跳登录
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UIProvider } from './UIComponents';
import ResetPasswordPage from './ResetPasswordPage';

const state = vi.hoisted(() => ({
  reset: vi.fn(),
}));

vi.mock('../api/queries', () => ({
  useResetPassword: () => ({ mutateAsync: state.reset, isPending: false }),
}));

function renderPage(entry = '/reset-password?token=abc123') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <UIProvider>
          <ResetPasswordPage />
        </UIProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ResetPasswordPage（票 #29）', () => {
  beforeEach(() => {
    state.reset.mockReset();
  });

  it('无 token → 显示链接无效提示，不渲染表单', () => {
    renderPage('/reset-password');
    expect(screen.getByText(/链接无效/)).toBeInTheDocument();
    expect(screen.queryByLabelText('新密码')).not.toBeInTheDocument();
  });

  it('渲染：双密码输入 + 提交按钮', () => {
    renderPage();
    expect(screen.getByLabelText('新密码')).toBeInTheDocument();
    expect(screen.getByLabelText('确认新密码')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '重置密码' })).toBeInTheDocument();
  });

  it('两次输入不一致 → 错误提示，不调 API', async () => {
    renderPage();
    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'NewPass123' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'Other123' } });
    fireEvent.click(screen.getByRole('button', { name: '重置密码' }));

    expect(await screen.findByText('两次输入的新密码不一致')).toBeInTheDocument();
    expect(state.reset).not.toHaveBeenCalled();
  });

  it('提交成功 → 调 useResetPassword（token+newPassword）+ 成功 toast', async () => {
    state.reset.mockResolvedValue(undefined);
    renderPage();

    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'NewPass123' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'NewPass123' } });
    fireEvent.click(screen.getByRole('button', { name: '重置密码' }));

    await waitFor(() => expect(state.reset).toHaveBeenCalledWith({ token: 'abc123', newPassword: 'NewPass123' }));
    expect(await screen.findByText('密码已重置')).toBeInTheDocument();
  });

  it('提交失败 → toast 错误文案（RESET_001 场景）', async () => {
    state.reset.mockRejectedValue({ error: { code: 'RESET_001', message: '密码重置令牌无效或已过期' } });
    renderPage();

    fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'NewPass123' } });
    fireEvent.change(screen.getByLabelText('确认新密码'), { target: { value: 'NewPass123' } });
    fireEvent.click(screen.getByRole('button', { name: '重置密码' }));

    expect(await screen.findByText('密码重置令牌无效或已过期')).toBeInTheDocument();
  });
});
