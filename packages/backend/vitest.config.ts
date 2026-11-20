import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // 串行执行 projects：integration 的 execSync(prisma migrate deploy) 在并发下
    // 偶发与 unit 抢占文件/pnpm 资源导致「表不存在」假失败，串行后稳定。
    fileParallelism: false,
    // 批 12 实录：751 用例全量默认池首验撞 2 时序断言红（clone 审计行 0 条 / WS
    // shutdown readyState CLOSING），单跑绿+全量二验绿实锤并发挤兑，非用例缺陷。
    // 修法照 frontend 先例（#26 方案 A，vite.config.ts 同款）：锁 threads 池 2 线程。
    // 注意 vitest v3 默认池是 forks：pool 与 poolOptions.threads 必须都显式写，
    // 只写 poolOptions 不生效（memory 铁律）。
    pool: 'threads',
    poolOptions: {
      threads: { maxThreads: 2, minThreads: 1 },
    },
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

