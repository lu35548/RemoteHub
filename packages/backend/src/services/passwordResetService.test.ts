import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────
vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});

vi.mock('../utils/password.js', () => ({
  verifyPassword: vi.fn(),
  hashPassword: vi.fn((p: string) => `hashed:${p}`),
}));

vi.mock('../utils/jwt.js', () => ({
  generatePasswordResetToken: vi.fn(() => 'raw-token-hex'),
  hashPasswordResetToken: vi.fn((t: string) => `h:${t}`),
}));

vi.mock('../config/env.js', () => ({
  env: {
    FRONTEND_URL: 'http://test.local',
    PASSWORD_RESET_TOKEN_EXPIRES_HOURS: 1,
    PASSWORD_RESET_MAX_PER_USER: 3,
    RATE_LIMIT_FORGOT_PASSWORD_MAX: 3,
  },
}));

vi.mock('../utils/appError.js', () => ({
  createAppError: vi.fn((code: string, details?: any) => {
    const error: any = new Error(`AppError:${code}`);
    error.code = code;
    error.details = details;
    return error;
  }),
  handlePrismaUniqueViolation: vi.fn(async (e: any) => { throw e; }),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { requestPasswordReset, resetPassword, createResetLink } from './passwordResetService.js';
import { prisma } from '../utils/prisma.js';
import { hashPassword } from '../utils/password.js';
import { generatePasswordResetToken, hashPasswordResetToken } from '../utils/jwt.js';
import { createAppError } from '../utils/appError.js';

const mockUser = (overrides: Record<string, any> = {}) => ({
  id: 'user-1',
  username: 'resetuser',
  nickname: '重置用户',
  role: 'user',
  isActive: true,
  passwordHash: 'hashed:OldPass1',
  lastActiveAt: null,
  createdAt: new Date('2025-01-01'),
  ...overrides,
});

/** 有效 token 行（未使用未过期） */
const activeToken = (overrides: Record<string, any> = {}) => ({
  id: 'prt-1',
  userId: 'user-1',
  tokenHash: 'h:raw-token-hex',
  expiresAt: new Date(Date.now() + 3600_000),
  usedAt: null,
  ...overrides,
});

describe('passwordResetService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── requestPasswordReset（自助流，不暴露用户存在性）──────────────
  describe('requestPasswordReset', () => {
    it('用户不存在 → 静默成功（不建 token、不抛错，防用户名枚举）', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(requestPasswordReset('ghost')).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
      expect(createAppError).not.toHaveBeenCalled();
    });

    it('用户存在且低于上限 → 建 token（sha256 落库 + 1h 过期 + ip/ua 存档）', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      (prisma.passwordResetToken.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);

      await requestPasswordReset('resetuser', '203.0.213.7', 'vitest-agent');

      expect(generatePasswordResetToken).toHaveBeenCalledTimes(1);
      expect(hashPasswordResetToken).toHaveBeenCalledWith('raw-token-hex');
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          tokenHash: 'h:raw-token-hex',
          expiresAt: expect.any(Date),
          ip: '203.0.213.7',
          userAgent: 'vitest-agent',
        }),
      });
      // 1 小时有效期（允许 ±60s 时钟滑差）
      const arg = (prisma.passwordResetToken.create as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      const exp = (arg.data.expiresAt as Date).getTime() - Date.now();
      expect(exp).toBeGreaterThan(55 * 60_000);
      expect(exp).toBeLessThanOrEqual(65 * 60_000);
    });

    it('已届上限（3 个有效 token）→ 静默返回不新建（自助流不暴露存在性）', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      (prisma.passwordResetToken.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      await expect(requestPasswordReset('resetuser')).resolves.toBeUndefined();
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });
  });

  // ─── resetPassword（执行重置）────────────────────────────────────
  describe('resetPassword', () => {
    it('有效 token → 事务[改密 + 标记 usedAt + 撤全部 session]', async () => {
      (prisma.passwordResetToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(activeToken());
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());

      await resetPassword('raw-token-hex', 'NewPass123');

      expect(hashPassword).toHaveBeenCalledWith('NewPass123');
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { passwordHash: 'hashed:NewPass123' },
      });
      expect(prisma.passwordResetToken.update).toHaveBeenCalledWith({
        where: { id: 'prt-1' },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
    });

    it('token 不存在 → RESET_001', async () => {
      (prisma.passwordResetToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(resetPassword('nope', 'NewPass123')).rejects.toThrow('AppError:RESET_001');
      expect(createAppError).toHaveBeenCalledWith('RESET_001');
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('token 已过期 → RESET_001（与无效同码不区分，防信息暴露）', async () => {
      (prisma.passwordResetToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        activeToken({ expiresAt: new Date(Date.now() - 1000) }),
      );

      await expect(resetPassword('raw-token-hex', 'NewPass123')).rejects.toThrow('AppError:RESET_001');
    });

    it('用户已禁用 → RESET_001（不执行改密）', async () => {
      (prisma.passwordResetToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(activeToken());
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockUser({ isActive: false }),
      );

      await expect(resetPassword('raw-token-hex', 'NewPass123')).rejects.toThrow('AppError:RESET_001');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('新密码不合规 → VAL_001 且不消费 token', async () => {
      (prisma.passwordResetToken.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(activeToken());

      await expect(resetPassword('raw-token-hex', 'short')).rejects.toThrow('AppError:VAL_001');
      expect(prisma.passwordResetToken.update).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });


  // ─── createResetLink（admin 代重置）──────────────────────────────
  describe('createResetLink', () => {
    it('用户不存在 → USER_002', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(createResetLink('no-such-id')).rejects.toThrow('AppError:USER_002');
      expect(createAppError).toHaveBeenCalledWith('USER_002');
    });

    it('已届上限 → RESET_003', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      (prisma.passwordResetToken.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);

      await expect(createResetLink('user-1')).rejects.toThrow('AppError:RESET_003');
      expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    });

    it('成功 → 返回含 64 位 hex token 的绝对链接，ip/ua 存档', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      (prisma.passwordResetToken.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

      const link = await createResetLink('user-1', '198.51.100.9', 'admin-agent');

      expect(link).toBe('http://test.local/reset-password?token=raw-token-hex');
      expect(prisma.passwordResetToken.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          tokenHash: 'h:raw-token-hex',
          ip: '198.51.100.9',
          userAgent: 'admin-agent',
        }),
      });
    });
  });
});
