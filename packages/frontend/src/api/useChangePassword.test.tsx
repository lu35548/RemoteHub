// packages/frontend/src/api/useChangePassword.test.tsx
// 票 #29 会话空窗修复：改密/重置 onSuccess 后必须清内存 access token + 跳 /login。
// （后端已撤 session 清 cookie，前端残留 ≤15min 空窗是本票要锁死的回归面）
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useChangePassword, useResetPassword } from './queries';
import { setAccessToken, getAccessToken } from './client';

// client 部分真身：保留 set/getAccessToken 真实实现（模块级内存态），只 mock api/fetch 面
vi.mock('./client.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./client.js')>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      getRaw: vi.fn(),
      post: vi.fn().mockResolvedValue(undefined),
      patch: vi.fn(),
      delete: vi.fn(),
    },
    ensureRefreshed: vi.fn().mockResolvedValue(null),
    refreshAccessToken: vi.fn().mockResolvedValue(null),
  };
});

describe('改密/重置成功后的会话清理（票 #29 会话空窗修复）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setAccessToken(null);
  });

  it('useChangePassword onSuccess：getAccessToken() 清空 + 路由跳 /login', async () => {
    setAccessToken('stale-token');
    function Probe() {
      const m = useChangePassword();
      return <button onClick={() => m.mutate({ oldPassword: 'o', newPassword: 'n' })}>触发改密</button>;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/profile']}>
          <Routes>
            <Route path="/profile" element={<Probe />} />
            <Route path="/login" element={<div>login-page-reached</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '触发改密' }));

    await waitFor(() => expect(getAccessToken()).toBeNull());
    expect(await screen.findByText('login-page-reached')).toBeInTheDocument();
  });

  it('useResetPassword onSuccess：getAccessToken() 清空 + 路由跳 /login', async () => {
    setAccessToken('stale-token');
    function Probe() {
      const m = useResetPassword();
      return <button onClick={() => m.mutate({ token: 't', newPassword: 'n' })}>触发改密</button>;
    }
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/profile']}>
          <Routes>
            <Route path="/profile" element={<Probe />} />
            <Route path="/login" element={<div>login-page-reached</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: '触发改密' }));

    await waitFor(() => expect(getAccessToken()).toBeNull());
    expect(await screen.findByText('login-page-reached')).toBeInTheDocument();
  });
});
