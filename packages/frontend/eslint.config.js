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
    // UIComponents 是组件库聚合文件（UIProvider/useUI/Modal/Tooltip 同文件导出），
    // 非纯组件文件，豁免 react-refresh 导出限制；set-state-in-effect 为 v1 原样迁移的
    // Modal 进出场动画时序模式（rAF 驱动），非副作用滥用
    files: ['src/components/UIComponents.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  {
    // 测试文件：mock 工厂/断言天然使用 any（与 backend 范围豁免一致）
    files: ['src/**/*.test.{ts,tsx}', 'src/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);
