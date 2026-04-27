import type { ApiResponse, ApiErrorResponse } from '@remotehub/shared';

let accessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

export function getAccessToken() {
  return accessToken;
}

async function refreshAccessToken(): Promise<string | null> {
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

  if (res.status === 401 && !path.startsWith('/auth/')) {
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

export const api = {
  get: <T>(path: string) => apiRequest<T>('GET', path),
  post: <T>(path: string, body?: unknown) => apiRequest<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>('PATCH', path, body),
  delete: <T>(path: string) => apiRequest<T>('DELETE', path),
};
