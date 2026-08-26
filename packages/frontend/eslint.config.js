import { defineConfig, globalIgnores } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    rules: {
      // 与 backend 同款严格口径（backend eslint.config.js 对齐）
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // React hooks：rules-of-hooks 硬约束 + exhaustive-deps 警示
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    // Vite fast refresh：组件文件仅允许导出组件 + 常量
    files: ['src/**/*.tsx'],
    extends: [reactRefresh.configs.vite()],
  },
  {
    // 测试文件：mock 工厂/断言天然使用 any（与 backend 范围豁免一致）
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);
