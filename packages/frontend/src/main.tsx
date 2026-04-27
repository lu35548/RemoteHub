import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setAccessToken } from './api/client.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

async function bootstrap() {
  try {
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (res.ok) {
      const body = await res.json();
      if (body.success && body.data?.accessToken) {
        setAccessToken(body.data.accessToken);
      }
    }
  } catch {
    // refresh 失败 → 未登录状态
  }

  const { default: App } = await import('./App.js');
  const root = document.getElementById('root')!;
  createRoot(root).render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

document.getElementById('root')!.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh">加载中...</div>';
bootstrap();
