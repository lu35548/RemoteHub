import '../test/helpers/env.js'; // 环境前置必须第一个 import（vitest 不加载 .env，CI 无 .env 必崩）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});
vi.mock('node-cron', () => ({ default: { schedule: vi.fn() } }));

import cron from 'node-cron';
import { prisma as _prisma } from '../utils/prisma.js';
import { queryAuditLogs, exportAuditLogsCsv } from './auditService.js';
import { cleanAuditLogs, startAuditCleaner } from '../utils/auditCleaner.js';

const prisma = _prisma as any;

beforeEach(() => { vi.clearAllMocks(); });

/** 造一条合法 DB 行（字段对齐 prisma schema AuditLog model） */
function auditRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1', userId: 'u1', action: 'PROJECT_CREATE', resource: 'project', resourceId: 'p1',
    result: 'success', detail: null, ip: '127.0.0.1*', userAgent: 'ua', createdAt: new Date('2026-09-04T00:00:00Z'),
    ...overrides,
  };
}

describe('queryAuditLogs - 分页 clamp', () => {
  beforeEach(() => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
  });

  it('默认 page=1 / take=20 / skip=0 / orderBy createdAt desc', async () => {
    await queryAuditLogs({});
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 20, skip: 0, orderBy: { createdAt: 'desc' },
    }));
  });

  it('pageSize=500 → take 100（上限 clamp 到 MAX_PAGE_SIZE）', async () => {
    await queryAuditLogs({ page: 1, pageSize: 500 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 100 }));
  });

  it('pageSize=0 → take 1（clamp 进 [1,100] 而非回默认）', async () => {
    await queryAuditLogs({ page: 1, pageSize: 0 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 1 }));
  });

  it('page=3, pageSize=20 → skip 40', async () => {
    await queryAuditLogs({ page: 3, pageSize: 20 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 40 }));
  });

  it('page=0 → 按 page=1（下限 clamp）', async () => {
    await queryAuditLogs({ page: 0, pageSize: 20 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 0 }));
  });
});

describe('queryAuditLogs - where 构建', () => {
  beforeEach(() => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
  });

  it('全参数 where（含 result=failure 独立列过滤）', async () => {
    await queryAuditLogs({
      userId: 'u1', action: 'USER_DELETE', resource: 'user', result: 'failure',
      startDate: '2026-01-01T00:00:00.000Z', endDate: '2026-01-31T23:59:59.999Z',
    });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        userId: 'u1',
        action: 'USER_DELETE',
        resource: 'user',
        result: 'failure',
        createdAt: { gte: new Date('2026-01-01T00:00:00.000Z'), lte: new Date('2026-01-31T23:59:59.999Z') },
      },
    }));
    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ result: 'failure' }),
    });
  });

  it('endDate 为 date-only（YYYY-MM-DD）时按当天 23:59:59.999 截止', async () => {
    await queryAuditLogs({ endDate: '2026-01-31' });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { createdAt: { lte: new Date('2026-01-31T23:59:59.999Z') } },
    }));
  });

  it('无效 action → AUDIT_001', async () => {
    await expect(queryAuditLogs({ action: 'HACK' as never })).rejects.toMatchObject({ code: 'AUDIT_001' });
  });
  it('无效 resource → AUDIT_001', async () => {
    await expect(queryAuditLogs({ resource: 'nope' as never })).rejects.toMatchObject({ code: 'AUDIT_001' });
  });
  it('无效 result → AUDIT_001', async () => {
    await expect(queryAuditLogs({ result: 'warn' as never })).rejects.toMatchObject({ code: 'AUDIT_001' });
  });
  it('无效日期字符串 → AUDIT_001', async () => {
    await expect(queryAuditLogs({ startDate: 'not-a-date' })).rejects.toMatchObject({ code: 'AUDIT_001' });
  });
});

describe('queryAuditLogs - DTO 映射', () => {
  it('detail JSON 字符串解析为结构化对象，createdAt 转 ISO', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      auditRow({ detail: '{"before":{"name":"旧"}}' }),
    ]);
    prisma.auditLog.count.mockResolvedValue(1);

    const r = await queryAuditLogs({});
    expect(r.total).toBe(1);
    expect(r.data[0]!.detail).toEqual({ before: { name: '旧' } }); // 对象而非字符串
    expect(r.data[0]!.createdAt).toBe('2026-09-04T00:00:00.000Z');
  });

  it('detail 非法 JSON → 解析为 null（宽容，不抛）', async () => {
    prisma.auditLog.findMany.mockResolvedValue([auditRow({ detail: 'not-json' })]);
    prisma.auditLog.count.mockResolvedValue(1);

    const r = await queryAuditLogs({});
    expect(r.data[0]!.detail).toBeNull();
  });
});

describe('exportAuditLogsCsv', () => {
  it('首行为票面钦定 header', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    const csv = await exportAuditLogsCsv({});
    expect(csv.split('\n')[0]).toBe('id,action,resource,resourceId,userId,ip,userAgent,detail,createdAt');
  });

  it('值内逗号/引号转义：" → "" 且整值包裹；null 字段落空串', async () => {
    prisma.auditLog.findMany.mockResolvedValue([
      auditRow({ id: 'x1', resourceId: null, userId: null, ip: null, userAgent: 'a,b "q" c', detail: '{"k":"v"}' }),
    ]);
    const csv = await exportAuditLogsCsv({});
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('x1,PROJECT_CREATE,project,,,,"a,b ""q"" c","{""k"":""v""}",2026-09-04T00:00:00.000Z');
  });

  it('上限 10000 截断（take 10000 + createdAt 倒序，无分页）', async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);
    await exportAuditLogsCsv({});
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(expect.objectContaining({
      take: 10000, orderBy: { createdAt: 'desc' },
    }));
    const arg = prisma.auditLog.findMany.mock.calls[0][0];
    expect(arg.skip).toBeUndefined();
    expect(arg.take).not.toBe(20);
  });

  it('DB 故障 → 包装 AUDIT_002；where 无效枚举仍透传 AUDIT_001', async () => {
    prisma.auditLog.findMany.mockRejectedValue(new Error('db down'));
    await expect(exportAuditLogsCsv({})).rejects.toMatchObject({ code: 'AUDIT_002' });

    await expect(exportAuditLogsCsv({ action: 'HACK' as never })).rejects.toMatchObject({ code: 'AUDIT_001' });
  });
});

describe('cleanAuditLogs', () => {
  it('cutoff = now − 90 天（AUDIT_RETENTION_DAYS 默认），返回删除计数', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-04T03:30:00Z'));
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 2 });

      const n = await cleanAuditLogs();
      expect(n).toBe(2);
      expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
        where: { createdAt: { lt: new Date('2026-06-06T03:30:00Z') } },
      });
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('startAuditCleaner', () => {
  it('仅定时（30 3 * * *），不启动即清（6 月修订案，区别于 sessionCleaner）', () => {
    startAuditCleaner();
    expect(vi.mocked(cron.schedule)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(cron.schedule)).toHaveBeenCalledWith('30 3 * * *', expect.any(Function));
    expect(prisma.auditLog.deleteMany).not.toHaveBeenCalled();
  });
});

afterEach(() => {
  vi.useRealTimers();
});
