/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    // #26：jsdom 14 文件按本机核数默认并行会挤爆 5s testTimeout（userEvent 用例超时，
    // 单文件恒绿、失败集漂移）；锁 threads 池 2 线程为 447 基线的记录口径
    pool: 'threads',
    poolOptions: {
      threads: { maxThreads: 2, minThreads: 1 },
    },
  },
  server: {
    // 5173 在本机防火墙拦截段（EACCES，实测 5173/5188/5199/7777/8888 被拦，3000/4173 可用）
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
