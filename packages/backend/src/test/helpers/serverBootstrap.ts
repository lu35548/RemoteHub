import './env.js'; // 环境前置（helper 依赖图中最先执行，供 server 链 requireEnv 消费）
import { vi } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import type { PrismaClient } from '@prisma/client';
import { setupTestDb } from './testDb.js';
import { seedAdmin } from '../../utils/seedAdmin.js';

/**
 * integration 测试的 server bootstrap（票 #18 双轴 review 抽取：
 * audit.middleware / audit.api / sanitization.middleware 三处逐字复制的骨架收敛到一处）。
 *
 * 时序要求（票 #16 踩坑产物，勿走样）：
 * config/env.ts 是 import 期快照——server 链必须在 DATABASE_URL 指向临时库**之后**
 * 重新构建：vi.resetModules() 重置模块图 + 清 globalThis.prisma 单例缓存 + 动态 import server。
 */
export interface ServerBootstrap {
  app: Express;
  /** 测试自持的 prisma（连临时库，用于造数/断言） */
  prisma: PrismaClient;
  /** server 单例 prisma（连临时库；afterAll 须先断开，Windows 下才能删库文件） */
  serverPrisma: PrismaClient;
  cleanUp: () => Promise<void>;
  adminToken: string;
}

export async function setupServerWithDb(): Promise<ServerBootstrap> {
  const t = await setupTestDb();
  process.env.DATABASE_URL = t.url;

  // seedAdmin 静态 import 链已把 config/env.ts 快照成占位 DATABASE_URL——重置模块图
  // 让 server 链重新执行 env 快照；同时清掉 prisma.ts 的 globalThis 单例缓存
  vi.resetModules();
  (globalThis as Record<string, unknown>).prisma = undefined;

  const server = await import('../../server.js');
  const serverPrisma = (await import('../../utils/prisma.js')).prisma;

  await seedAdmin(t.prisma);
  const res = await request(server.app).post('/api/v1/auth/login').send({ username: 'admin', password: 'Admin123456!' });
  const adminToken = res.body.data.accessToken as string;

  return { app: server.app, prisma: t.prisma, serverPrisma, cleanUp: t.cleanUp, adminToken };
}

/** afterAll 拆卸：server 单例先断开（连临时库），Windows 下先断开才能删库文件 */
export async function teardownServerWithDb(b: Pick<ServerBootstrap, 'serverPrisma' | 'cleanUp'>): Promise<void> {
  await b.serverPrisma?.$disconnect();
  await b.cleanUp?.();
}
