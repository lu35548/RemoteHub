import '../test/helpers/env.js'; // 环境前置必须第一个 import（ipMonitor 顶层拉起 prisma.ts→config/env.ts，vitest 不加载 .env，CI 必崩）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});

// ipMonitor 持模块级 per-IP 计数 Map：每用例 resetModules 重建模块，计数互不渗透。
// logger 未被 mock，resetModules 后同样重建——须动态 import 拿同代实例，spy 才落在
// ipMonitor 实际调用的那个 logger 上（静态 import 是上一代实例，spy 恒 0 调用）。
let checkIpRisk!: typeof import('./ipMonitor.js').checkIpRisk;
let logger!: typeof import('./logger.js').logger;
let prisma: ReturnType<typeof import('../test/helpers/prismaMock.js').createPrismaMock>;

beforeEach(async () => {
  vi.clearAllMocks(); // resetModules 不重跑 vi.mock 工厂：prisma mock 跨用例单例，须清调用计数
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-11T00:00:00Z'));
  vi.resetModules();
  ({ checkIpRisk } = await import('./ipMonitor.js'));
  ({ logger } = await import('./logger.js')); // 与 ipMonitor 同代（resetModules 后同一注册表）
  ({ prisma } = await import('../utils/prisma.js') as unknown as { prisma: typeof prisma });
  prisma.auditLog.create.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('checkIpRisk', () => {
  it('ip undefined 直返：不计数不记录', () => {
    checkIpRisk(undefined, '/api/v1/projects');
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('SECURITY_SUSPICIOUS_IP 触发', () => {
  it('同 IP 非白名单第 1001 次请求触发恰好 1 条审计（字段齐备，ip 原值不掩码）', () => {
    for (let i = 0; i < 1001; i++) checkIpRisk('203.0.113.7', '/api/v1/projects');

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        userId: null,
        action: 'SECURITY_SUSPICIOUS_IP',
        resource: 'security',
        resourceId: null,
        detail: JSON.stringify({ requestCount: 1001, window: '60s' }),
        ip: '203.0.113.7',
      },
    });
  });

  it('同窗口第 1002 次起不再记录（每 IP 每窗口最多 1 条，防告警刷屏）', () => {
    for (let i = 0; i < 1005; i++) checkIpRisk('203.0.113.8', '/api/v1/projects');

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('时间推进 61s 后窗口惰性重置，新窗口重新计数可再触发', () => {
    for (let i = 0; i < 1001; i++) checkIpRisk('203.0.113.9', '/api/v1/projects');
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-09-11T00:01:01Z')); // +61s：窗口过期
    for (let i = 0; i < 1001; i++) checkIpRisk('203.0.113.9', '/api/v1/projects');

    expect(prisma.auditLog.create).toHaveBeenCalledTimes(2);
    // 重置是重新计数而非延续：新窗口第 1001 次触发，requestCount 仍为 1001
    expect(prisma.auditLog.create).nthCalledWith(2, {
      data: expect.objectContaining({ detail: JSON.stringify({ requestCount: 1001, window: '60s' }) }),
    });
  });
});

describe('限流白名单豁免', () => {
  it('白名单路径打满 2000 次 → 0 记录（NAT 单出口全员心跳不触阈值）', () => {
    for (const path of ['/health', '/auth/heartbeat', '/auth/online']) {
      for (let i = 0; i < 2000; i++) checkIpRisk('198.51.100.1', path);
    }
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('全路径形态 /api/v1/health 同样豁免（app 根挂载 req.path 含前缀的回归）', () => {
    for (let i = 0; i < 2000; i++) checkIpRisk('198.51.100.2', '/api/v1/health');

    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe('落库失败', () => {
  it('auditLog.create reject → logger.error 吞掉，不向调用方抛', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));
    const errorSpy = vi.spyOn(logger, 'error');

    for (let i = 0; i < 1001; i++) checkIpRisk('192.0.2.1', '/api/v1/projects');

    await vi.advanceTimersByTimeAsync(0); // flush microtask 让 .catch 跑完
    expect(errorSpy).toHaveBeenCalledWith(
      '可疑 IP 审计落库失败（不传播）',
      expect.objectContaining({ ip: '192.0.2.1' }),
    );
    errorSpy.mockRestore();
  });
});
