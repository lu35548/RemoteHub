import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 串行执行 projects：integration 的 execSync(prisma migrate deploy) 在并发下
    // 偶发与 unit 抢占文件/pnpm 资源导致「表不存在」假失败，串行后稳定。
    fileParallelism: false,
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

