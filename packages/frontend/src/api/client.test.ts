// packages/frontend/src/api/client.test.ts
// 票 #31 review 修复：2FA 通道层回归锁——
// F4① mfaRequest Authorization 注入挑战 token（非全局 access token）
// F4② mfaRequest 401 直抛 ApiErrorResponse、不触发 /auth/refresh
// F4③ useLogin mfaPending 分支不 setAccessToken（spec L138「单密码拿不到 access token」前端半边）
// F1  useMfaSetup 幂等性：窗口回焦不重取（stateless POST，重取即静默换 secret）
// 测试策略：client/queries 走真身，全局 fetch stub 按 client.ts 真实运行时形状造（res.status/ok/json）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { API_BASE, mfaRequest, setAccessToken, getAccessToken } from './client';
import { setMfaPending } from './mfaPending';
import { useLogin, useMfaSetup } from './queries';

let fetchMock: ReturnType<typeof vi.fn>;

/** client.ts 运行时消费形状：res.status / res.ok / res.json() */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

/** useMutation/useQuery 需要 QueryClientProvider 上下文（.ts 文件无 JSX，走 createElement） */
function queryWrapper() {
  const client = new QueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  };
}

beforeEach(() => {
  setMfaPending(null);
  setAccessToken(null);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mfaRequest 通道语义（票 #31 review F4）', () => {
  it('① Authorization 注入 mfaPending 的挑战 token，而非全局 access token', async () => {
    setMfaPending({ mfaPending: true, mfaStage: 'verify', mfaToken: 'mfa-challenge-token' });
    setAccessToken('global-access-token'); // 全局 token 同时在场——通道仍必须用挑战 token
    fetchMock.mockResolvedValue(jsonResponse({ success: true, data: { ok: true } }));

    await mfaRequest('POST', '/auth/mfa/verify', { token: '123456' });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${API_BASE}/auth/mfa/verify`);
    expect(init.headers['Authorization']).toBe('Bearer mfa-challenge-token');
  });

  it('② 401 直抛 ApiErrorResponse，不触发 refresh（fetch 仅一次）', async () => {
    setMfaPending({ mfaPending: true, mfaStage: 'verify', mfaToken: 'expired-token' });
    const errBody = {
      success: false,
      error: { code: 'MFA_002', message: '多因素认证令牌无效或已过期' },
    };
    fetchMock.mockResolvedValue(jsonResponse(errBody, 401));

    // 通用通道 401 会先 ensureRefreshed 再重试/强制登出；通道语义要求直抛（挑战过期是预期路径）
    await expect(mfaRequest('POST', '/auth/mfa/verify', { token: '123456' })).rejects.toEqual(errBody);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const urls = fetchMock.mock.calls.map((c) => c[0]);
    expect(urls.every((u) => !String(u).includes('/auth/refresh'))).toBe(true);
  });
});

describe('useLogin access token 门禁（spec L138 前端半边，review F4）', () => {
  it('mfaPending 响应（无 accessToken 字段）→ 不 setAccessToken', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { mfaPending: true, mfaStage: 'verify', mfaToken: 'mt' },
      }),
    );
    const { result } = renderHook(() => useLogin(), { wrapper: queryWrapper() });
    act(() => {
      result.current.mutate({ username: 'u', password: 'p' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // 单密码登录只拿到挑战票，绝不能落内存 access token
    expect(getAccessToken()).toBeNull();
  });

  it('对照：登录成功响应（含 accessToken）→ setAccessToken 生效', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { accessToken: 'at-123', user: { id: 'u1', nickname: '管理员' } },
      }),
    );
    const { result } = renderHook(() => useLogin(), { wrapper: queryWrapper() });
    act(() => {
      result.current.mutate({ username: 'u', password: 'p' });
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getAccessToken()).toBe('at-123');
  });
});

describe('useMfaSetup 幂等性（review F1：stateless POST 三闸全关）', () => {
  it('窗口回焦（visibilitychange）→ 不重新 POST /auth/mfa/setup', async () => {
    setMfaPending({ mfaPending: true, mfaStage: 'setup', mfaToken: 'mt' });
    fetchMock.mockResolvedValue(
      jsonResponse({
        success: true,
        data: { secret: 'JBSWY3DPEHPK3PXP', otpauthUri: 'otpauth://totp/RemoteHub:mfauser' },
      }),
    );

    const { result } = renderHook(() => useMfaSetup(true), { wrapper: queryWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // react-query focusManager 监听 window 的 visibilitychange；jsdom visibilityState 恒 visible
    await act(async () => {
      window.dispatchEvent(new Event('visibilitychange'));
    });
    // 再让一拍：若重取被触发，这里必然浮出第二次 fetch
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    // 修复前 refetchOnWindowFocus 默认 true → 计数为 2（secret 被静默换掉）；
    // 修复后（refetchOnWindowFocus/reconnect false + staleTime Infinity）恒为 1
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
