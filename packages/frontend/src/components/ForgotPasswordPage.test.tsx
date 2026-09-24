// packages/frontend/src/components/ForgotPasswordPage.test.tsx
// 票 #29：/forgot-password 页面——统一响应文案（不暴露用户存在性）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UIProvider } from './UIComponents';
import ForgotPasswordPage from './ForgotPasswordPage';

const state = vi.hoisted(() => ({
  forgot: vi.fn(),
}));

vi.mock('../api/queries', () => ({
  useForgotPassword: () => ({ mutateAsync: state.forgot, isPending: false }),
}));

function renderPage() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <UIProvider>
          <ForgotPasswordPage />
        </UIProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ForgotPasswordPage（票 #29）', () => {
  beforeEach(() => {
    state.forgot.mockReset();
  });

  it('渲染：账号输入 + 提交按钮 + 返回登录链接', () => {
    renderPage();
    expect(screen.getByLabelText('账号')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交请求' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '返回登录' })).toBeInTheDocument();
  });

  it('提交 → 调 useForgotPassword（username 透传）+ 统一成功文案（不暴露存在性）', async () => {
    state.forgot.mockResolvedValue(undefined);
    renderPage();

    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'alice' } });
    fireEvent.click(screen.getByRole('button', { name: '提交请求' }));

    await waitFor(() => expect(state.forgot).toHaveBeenCalledWith({ username: 'alice' }));
    expect(await screen.findByText('请求已提交。如该用户名存在，系统已生成重置链接，请联系管理员获取。')).toBeInTheDocument();
  });

  it('提交失败 → toast 错误（不出现成功文案）', async () => {
    state.forgot.mockRejectedValue({ error: { code: 'VAL_001', message: '用户名不能为空' } });
    renderPage();

    fireEvent.change(screen.getByLabelText('账号'), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: '提交请求' }));

    expect(await screen.findByText('用户名不能为空')).toBeInTheDocument();
    expect(screen.queryByText(/请求已提交/)).not.toBeInTheDocument();
  });
});
