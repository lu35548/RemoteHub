import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    projects: [
      {
        // 单元测试：mock prisma，不依赖真实 DB
        test: {
          name: 'unit',
          include: ['src/**/*.test.ts'],
          exclude: ['src/test/integration/**'],
        },
      },
      {
        // 集成测试：真实临时 SQLite + migrate deploy
        test: {
          name: 'integration',
          include: ['src/test/integration/**/*.test.ts'],
        },
      },
    ],
  },
});
