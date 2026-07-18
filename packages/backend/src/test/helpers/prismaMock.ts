import { vi } from 'vitest';

/**
 * prisma mock 工厂。$transaction 支持交互式事务（回调形式，tx=prismaMock）
 * + 数组形式（Promise.all）。§4 mock 约定 / D8。
 *
 * 每个 model 提供常用方法超集（findMany/findUnique/findFirst/count/create/
 * update/upsert/delete/updateMany/deleteMany），覆盖现有 + 新增 service test 需要。
 */
export function createPrismaMock() {
  const prismaMock: Record<string, any> = {
    user: modelFns(),
    session: modelFns(),
    project: modelFns(),
    projectMember: modelFns(),
    connection: modelFns(),
    $transaction: vi.fn(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: unknown) => unknown)(prismaMock) : Promise.all(arg as Promise<unknown>[])),
    $queryRaw: vi.fn(),
    $executeRawUnsafe: vi.fn(),
  };
  return prismaMock;
}

function modelFns() {
  return {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  };
}
