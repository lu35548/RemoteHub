import { describe, it, expect, vi } from 'vitest';

// mock @prisma/client 的 Prisma.PrismaClientKnownRequestError
class FakeKnownError extends Error {
  code: string;
  meta: Record<string, unknown> | undefined;
  clientVersion = '6.19.3';
  constructor(code: string, meta?: Record<string, unknown>) {
    super(code);
    this.name = 'PrismaClientKnownRequestError';
    this.code = code;
    this.meta = meta;
  }
}
vi.mock('@prisma/client', () => ({
  Prisma: { PrismaClientKnownRequestError: FakeKnownError },
}));

import { handlePrismaUniqueViolation, createAppError } from './appError.js';

describe('handlePrismaUniqueViolation - P2002 映射 §11.2', () => {
  const cases: Array<[string, string]> = [
    ['username', 'USER_001'],
    ['name', 'PROJ_001'],
    ['projectId,name', 'CONN_005'],
    ['projectId,userId', 'MEMBER_001'],
    ['tokenHash', 'SYS_001'],
  ];

  for (const [target, expectedCode] of cases) {
    it(`P2002 target="${target}" → ${expectedCode}`, async () => {
      const err = new FakeKnownError('P2002', { target: target.split(',') });
      await expect(handlePrismaUniqueViolation(err)).rejects.toMatchObject({ code: expectedCode });
    });
  }

  it('非 P2002 错误透传（不映射）', async () => {
    const other = new FakeKnownError('P2025', {});
    await expect(handlePrismaUniqueViolation(other)).rejects.toBe(other);
  });

  it('普通 Error 透传', async () => {
    const other = new Error('something else');
    await expect(handlePrismaUniqueViolation(other)).rejects.toBe(other);
  });

  it('P2002 但 target 未识别 → 透传', async () => {
    const err = new FakeKnownError('P2002', { target: ['unknownField'] });
    await expect(handlePrismaUniqueViolation(err)).rejects.toBe(err);
  });
});

describe('createAppError', () => {
  it('VAL_001 状态码 422', () => {
    const e = createAppError('VAL_001', [{ field: 'x', message: '错' }]);
    expect(e.statusCode).toBe(422);
    expect(e.code).toBe('VAL_001');
    expect(e.details).toEqual([{ field: 'x', message: '错' }]);
  });
  it('未知 code 回退 500', () => {
    const e = createAppError('NOPE' as string);
    expect(e.statusCode).toBe(500);
  });
});
