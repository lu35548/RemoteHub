import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest 默认 globals: false，RTL 的 auto-cleanup 检测不到全局 afterEach 会整体跳过，
// 必须手动挂（研究笔记 §4 要点 4）
afterEach(cleanup);
