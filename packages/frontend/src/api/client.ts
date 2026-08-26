import type { ApiResponse, ApiErrorResponse } from '@remotehub/shared';

// 401 时不应触发 refresh 的端点（仅认证入口自身；me/change-password 等过期恰恰需要 refresh，
// 不能按 /auth/ 前缀一刀切排除——否则 token 过期时 me 401 直接报错，App 侧还得兜底清 token）
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout', '/auth/register'];

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

// 导出供 main.tsx bootstrap 复用（避免与此处重复实现 refresh fetch）
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) {
      setAccessToken(null);
      return null;
    }
    const body: ApiResponse<{ accessToken: string }> = await res.json();
    setAccessToken(body.data.accessToken);
    return body.data.accessToken;
  } catch {
    setAccessToken(null);
    return null;
  }
}

async function ensureRefreshed(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = refreshAccessToken();
  const token = await refreshPromise;
  refreshPromise = null;
  return token;
}

export async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`/api/v1${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (res.status === 401 && !NO_REFRESH_PATHS.includes(path)) {
    const newToken = await ensureRefreshed();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      const retryRes = await fetch(`/api/v1${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'include',
      });
      if (retryRes.ok) {
        const retryBody: ApiResponse<T> = await retryRes.json();
        return retryBody.data;
      }
    }
    setAccessToken(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err: ApiErrorResponse = await res.json();
    throw err;
  }

  const resBody: ApiResponse<T> = await res.json();
  return resBody.data;
}

/** 分页端点专用：返回完整响应体（含 pagination），不剥 data——分页 hooks 需要 total */
async function apiRequestRaw<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

  const res = await fetch(`/api/v1${path}`, {
    method: 'GET',
    headers,
    credentials: 'include',
  });

  if (res.status === 401) {
    const newToken = await ensureRefreshed();
    if (newToken) {
      return apiRequestRaw<T>(path);
    }
    setAccessToken(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  if (!res.ok) {
    const err: ApiErrorResponse = await res.json();
    throw err;
  }

  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path),
  getRaw: <T>(path: string) => apiRequestRaw<T>(path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
  delete: <T>(path: string) => apiRequest<T>('DELETE', path),
};
