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
  signAccessToken: vi.fn(() => 'access-token'),
  generateRefreshToken: vi.fn(() => 'refresh-token-raw'),
  hashRefreshToken: vi.fn((t: string) => `hash:${t}`),
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
import { login, register, refresh, logout, changePassword, getMe, updateProfile, heartbeat, getOnlineUsers } from './authService.js';
import { prisma } from '../utils/prisma.js';
import { verifyPassword } from '../utils/password.js';
import { hashRefreshToken } from '../utils/jwt.js';
import { createAppError } from '../utils/appError.js';

// ── Helpers ────────────────────────────────────────────────────────────
const mockUser = (overrides: Record<string, any> = {}) => ({
  id: 'user-1',
  username: 'testuser',
  nickname: 'Test User',
  role: 'user',
  isActive: true,
  passwordHash: 'hashed:password123',
  lastActiveAt: new Date('2025-01-01'),
  createdAt: new Date('2025-01-01'),
  ...overrides,
});

// ── Tests ──────────────────────────────────────────────────────────────
describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (hashRefreshToken as ReturnType<typeof vi.fn>).mockImplementation(
      (t: string) => `hash:${t}`,
    );
  });

  // ─── login ─────────────────────────────────────────────────────
  describe('login', () => {
    it('成功登录 → 返回 accessToken, refreshToken, user', async () => {
      const user = mockUser();
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);
      (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const result = await login('testuser', 'password123');

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token-raw');
      expect(result.user).toEqual(expect.objectContaining({
        id: 'user-1',
        username: 'testuser',
      }));
      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', tokenHash: 'hash:refresh-token-raw' }),
        }),
      );
    });

    it('用户不存在 → AUTH_001', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(login('nouser', 'pass')).rejects.toThrow('AppError:AUTH_001');
      expect(createAppError).toHaveBeenCalledWith('AUTH_001');
    });

    it('密码错误 → AUTH_001', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(login('testuser', 'wrong')).rejects.toThrow('AppError:AUTH_001');
    });

    it('用户被禁用 → AUTH_001', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser({ isActive: false }));
      (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(login('testuser', 'password123')).rejects.toThrow('AppError:AUTH_001');
    });
  });

  // ─── register ──────────────────────────────────────────────────
  describe('register', () => {
    it('成功注册 → 返回用户信息', async () => {
      const created = mockUser();
      (prisma.user.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

      const result = await register('admin', {
        username: 'testuser',
        nickname: 'Test',
        password: 'Password1',
      });

      expect(result.username).toBe('testuser');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ passwordHash: 'hashed:Password1' }),
        }),
      );
    });

    it('验证失败（无效用户名/密码）→ VAL_001', async () => {
      // 空用户名触发验证失败
      await expect(
        register('admin', { username: '', nickname: 'Nick', password: '123' }),
      ).rejects.toThrow('AppError:VAL_001');
      expect(createAppError).toHaveBeenCalledWith('VAL_001', expect.any(Array));
    });

    it('无效角色 → VAL_001', async () => {
      await expect(
        register('admin', { username: 'validuser', nickname: 'Nick', password: 'Password1', role: 'superadmin' }),
      ).rejects.toThrow('AppError:VAL_001');
    });
  });

  // ─── refresh（核心安全逻辑）──────────────────────────────────
  describe('refresh', () => {
    it('正常轮换 → 新 accessToken + refreshToken', async () => {
      const session = {
        id: 'sess-1',
        tokenHash: 'hash:old-token',
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userId: 'user-1',
        user: mockUser(),
      };

      (prisma.session.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(session);

      const result = await refresh('old-token');

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token-raw');
      expect(result.clearCookie).toBe(false);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('token 已过期（expiresAt < now）→ AUTH_002', async () => {
      const session = {
        id: 'sess-1',
        tokenHash: 'hash:old-token',
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() - 1000), // 已过期
        userId: 'user-1',
        user: mockUser(),
      };

      (prisma.session.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(session);

      await expect(refresh('old-token')).rejects.toThrow('AppError:AUTH_002');
      expect(createAppError).toHaveBeenCalledWith('AUTH_002');
    });

    it('重用攻击（consumedAt 超过 30 秒）→ 撤销所有 session + AUTH_004', async () => {
      const oldConsumedAt = new Date(Date.now() - 60 * 1000); // 60秒前
      const session = {
        id: 'sess-1',
        tokenHash: 'hash:old-token',
        consumedAt: oldConsumedAt,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userId: 'user-1',
        user: mockUser(),
      };

      // updateMany count=0 → 进入重用/并发判断
      (prisma.session.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(session);

      await expect(refresh('old-token')).rejects.toThrow('AppError:AUTH_004');
      // 应撤销用户所有 session
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });

    it('并发 refresh（consumedAt 在 30 秒内）→ 允许，返回新 token', async () => {
      const recentConsumedAt = new Date(Date.now() - 10 * 1000); // 10秒前
      const session = {
        id: 'sess-1',
        tokenHash: 'hash:old-token',
        consumedAt: recentConsumedAt,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userId: 'user-1',
        user: mockUser(),
      };

      (prisma.session.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(session);

      const result = await refresh('old-token');

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token-raw');
      expect(result.clearCookie).toBe(false);
      expect(prisma.session.create).toHaveBeenCalled();
    });

    it('无效 token（无匹配 session）→ AUTH_004', async () => {
      (prisma.session.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(refresh('bogus-token')).rejects.toThrow('AppError:AUTH_004');
    });

    it('已禁用用户在并发窗口内 → 删除 session + AUTH_004 + clearCookie', async () => {
      const recentConsumedAt = new Date(Date.now() - 5 * 1000);
      const session = {
        id: 'sess-1',
        tokenHash: 'hash:old-token',
        consumedAt: recentConsumedAt,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userId: 'user-1',
        user: mockUser({ isActive: false }),
      };

      (prisma.session.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (prisma.session.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await expect(refresh('old-token')).rejects.toThrow('AppError:AUTH_004');
    });

    it('已禁用用户在正常轮换路径 → 删除 session + AUTH_004 + clearCookie', async () => {
      const session = {
        id: 'sess-1',
        tokenHash: 'hash:old-token',
        consumedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userId: 'user-1',
        user: mockUser({ isActive: false }),
      };

      (prisma.session.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      (prisma.session.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(session);
      (prisma.session.delete as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      try {
        await refresh('old-token');
        expect.fail('should have thrown');
      } catch (err: any) {
        expect(err.code).toBe('AUTH_004');
        expect(err.clearCookie).toBe(true);
      }
    });
  });

  // ─── changePassword ────────────────────────────────────────────
  describe('changePassword', () => {
    it('成功修改', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await changePassword('user-1', 'Password1', 'NewPassword1');

      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('旧密码错误 → AUTH_001', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      await expect(changePassword('user-1', 'wrong', 'NewPassword1')).rejects.toThrow(
        'AppError:AUTH_001',
      );
    });

    it('新密码验证失败 → VAL_001', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      (verifyPassword as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      await expect(changePassword('user-1', 'Password1', '1')).rejects.toThrow(
        'AppError:VAL_001',
      );
    });
  });

  // ─── logout ────────────────────────────────────────────────────
  describe('logout', () => {
    it('成功登出', async () => {
      (prisma.session.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });

      await logout('some-refresh-token');

      expect(prisma.session.deleteMany).toHaveBeenCalledWith({
        where: { tokenHash: 'hash:some-refresh-token' },
      });
    });

    it('无匹配 session → 不报错', async () => {
      (prisma.session.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });

      // 不应抛错（.catch 吞掉）
      await expect(logout('unknown-token')).resolves.toBeUndefined();
    });

    it('refreshToken 为 undefined → 直接返回', async () => {
      await logout(undefined);
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── getMe ─────────────────────────────────────────────────────
  describe('getMe', () => {
    it('返回用户信息', async () => {
      const user = mockUser();
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(user);

      const result = await getMe('user-1');

      expect(result.id).toBe('user-1');
      expect(result.username).toBe('testuser');
    });

    it('用户不存在 → AUTH_002', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(getMe('nonexistent')).rejects.toThrow('AppError:AUTH_002');
    });
  });

  // ─── updateProfile ─────────────────────────────────────────────
  describe('updateProfile', () => {
    it('成功更新昵称', async () => {
      const updated = mockUser({ nickname: 'New Nick' });
      (prisma.user.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const result = await updateProfile('user-1', 'New Nick');

      expect(result.nickname).toBe('New Nick');
    });

    it('验证失败 → VAL_001', async () => {
      // 空昵称触发验证失败
      await expect(updateProfile('user-1', '')).rejects.toThrow('AppError:VAL_001');
    });
  });
});

describe('heartbeat（T2）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('距上次活跃超过 10 秒 → 刷新 lastActiveAt', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockUser({ lastActiveAt: new Date(Date.now() - 60_000) }),
    );
    await heartbeat('user-1');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user-1' },
        data: { lastActiveAt: expect.any(Date) },
      }),
    );
  });

  it('10 秒内重复心跳 → 节流不写库（v1 行为）', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockUser({ lastActiveAt: new Date(Date.now() - 3_000) }),
    );
    await heartbeat('user-1');
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('lastActiveAt 为 null（从未活跃）→ 直接写入', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockUser({ lastActiveAt: null }),
    );
    await heartbeat('user-1');
    expect(prisma.user.update).toHaveBeenCalled();
  });

  it('用户不存在 → 静默返回不写库', async () => {
    (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(heartbeat('nouser')).resolves.toBeUndefined();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('getOnlineUsers（T2）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('返回 5 分钟内活跃且启用的用户（倒序）+ count', async () => {
    const online = [
      mockUser({ id: 'u1', lastActiveAt: new Date(Date.now() - 30_000) }),
      mockUser({ id: 'u2', username: 'other', lastActiveAt: new Date(Date.now() - 3 * 60_000) }),
    ];
    (prisma.user.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(online);
    const result = await getOnlineUsers();
    expect(result.count).toBe(2);
    expect(result.users[0]).toEqual(expect.objectContaining({ id: 'u1' }));
    expect(result.users[0]).not.toHaveProperty('passwordHash');
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        lastActiveAt: { gte: expect.any(Date) },
        isActive: true,
      },
      orderBy: { lastActiveAt: 'desc' },
    }));
  });
});
