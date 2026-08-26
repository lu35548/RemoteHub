import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider, redirect } from 'react-router-dom';
import { getAccessToken, refreshAccessToken } from './api/client.js';
import { UIProvider } from './components/UIComponents.js';
import App from './App.js';
import LoginPage from './components/LoginPage.js';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

// 已登录访问 /login → 弹回主界面；未登录访问 / → 弹回登录页（对称守卫，v1 条件渲染的路由化）
async function requireAuth() {
  if (!getAccessToken()) throw redirect('/login');
  return null;
}

async function requireUnauth() {
  if (getAccessToken()) throw redirect('/');
  return null;
}

const router = createBrowserRouter([
  { path: '/', loader: requireAuth, element: <App /> },
  { path: '/login', loader: requireUnauth, element: <LoginPage /> },
]);

async function bootstrap() {
  // 页面刷新：先尝试 refresh 恢复会话（httpOnly cookie → 内存 access token）
  // 复用 client 的单飞 refresh，避免重复实现
  await refreshAccessToken();

  const root = document.getElementById('root')!;
  createRoot(root).render(
    <UIProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </UIProvider>,
  );
}

document.getElementById('root')!.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh">加载中...</div>';
bootstrap();
