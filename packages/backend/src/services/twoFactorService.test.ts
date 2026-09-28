// packages/backend/src/services/twoFactorService.test.ts
// 票 #30：2FA 域 service 单测（mock prisma，TDD 先红后绿）。
// 加密通道用真实 encrypt/decrypt（env helper 前置提供 ENCRYPTION_KEY），验证密文落库而非明文。
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── 环境前置（config/env.js 在 import 期 requireEnv 快照，必须最先执行）──
import '../test/helpers/env.js';

// ── Mocks ──────────────────────────────────────────────────────────────
vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});

vi.mock('../utils/jwt.js', () => ({
  signAccessToken: vi.fn(() => 'access-token'),
  generateRefreshToken: vi.fn(() => 'refresh-token-raw'),
  hashRefreshToken: vi.fn((t: string) => `hash:${t}`),
  signMfaToken: vi.fn(() => 'mfa-token'),
  verifyMfaToken: vi.fn(() => ({ userId: 'user-1' })),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────
import { generateMfaSetup, confirmMfaSetup, verifyMfa } from './twoFactorService.js';
import { prisma } from '../utils/prisma.js';
import { signAccessToken } from '../utils/jwt.js';
import { encrypt } from '../utils/encryption.js';
import * as OTPAuth from 'otpauth';

// ── Helpers ────────────────────────────────────────────────────────────
const SECRET = 'JBSWY3DPEHPK3PXP'; // 合法 base32

const mockUser = (overrides: Record<string, unknown> = {}) => ({
  id: 'user-1',
  username: 'mfauser',
  nickname: 'MFA User',
  role: 'user',
  isActive: true,
  twoFactorEnabled: true,
  totpSecret: null,
  lastActiveAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  ...overrides,
});

const boundUser = () => mockUser({ totpSecret: encrypt(SECRET) });

function buildTotp(secretBase32: string) {
  return new OTPAuth.TOTP({
    issuer: 'RemoteHub',
    label: 'mfauser',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** 造一个「确定错误」的 6 位码：取当前真实码翻一个数字，杜绝撞上 ±1 窗口的极小概率 */
function wrongCode(secretBase32: string): string {
  const code = buildTotp(secretBase32).generate();
  return code === '123456' ? '123457' : '123456';
}

describe('twoFactorService', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  describe('generateMfaSetup', () => {
    it('用户不存在 → MFA_002', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(generateMfaSetup('user-1')).rejects.toMatchObject({ code: 'MFA_002' });
    });
    it('2FA 未启用（admin 开关未开）→ MFA_003', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser({ twoFactorEnabled: false }));
      await expect(generateMfaSetup('user-1')).rejects.toMatchObject({ code: 'MFA_003' });
    });
    it('已完成绑定（totpSecret 已存在）→ MFA_003', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(boundUser());
      await expect(generateMfaSetup('user-1')).rejects.toMatchObject({ code: 'MFA_003' });
    });
    it('guard 合规 → 返回 base32 secret 与 otpauth URI（不落库）', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      const r = await generateMfaSetup('user-1');
      expect(r.secret).toMatch(/^[A-Z2-7]+$/);
      expect(r.otpauthUri).toContain('otpauth://totp/RemoteHub:mfauser?');
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
  // ─── confirmMfaSetup ───────────────────────────────────────────
  describe('confirmMfaSetup', () => {
    it('2FA 未启用 → MFA_003', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser({ twoFactorEnabled: false }));
      await expect(confirmMfaSetup('user-1', SECRET, '123456')).rejects.toMatchObject({ code: 'MFA_003' });
    });
    it('已绑定 → MFA_003', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(boundUser());
      await expect(confirmMfaSetup('user-1', SECRET, '123456')).rejects.toMatchObject({ code: 'MFA_003' });
    });
    it('secret 非 base32 形状 → VAL_001', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      await expect(confirmMfaSetup('user-1', 'not base32!!', '123456')).rejects.toMatchObject({ code: 'VAL_001' });
    });
    it('TOTP 错误 → MFA_001 且零写库', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      const bad = wrongCode(SECRET);
      await expect(confirmMfaSetup('user-1', SECRET, bad)).rejects.toMatchObject({ code: 'MFA_001' });
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(prisma.twoFactorRecoveryCode.createMany).not.toHaveBeenCalled();
    });
    it('TOTP 正确 → 密文落库 + 10 组恢复码 + 一次性返回', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser());
      const code = buildTotp(SECRET).generate();
      const r = await confirmMfaSetup('user-1', SECRET, code);
      expect(r.recoveryCodes).toHaveLength(10);
      expect(r.recoveryCodes[0]!).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      for (const c of r.recoveryCodes) expect(c).not.toMatch(/[ILO01]/);
      expect(new Set(r.recoveryCodes).size).toBe(10);
      expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ totpSecret: expect.stringMatching(/^v1:/) }),
      }));
      expect(prisma.twoFactorRecoveryCode.createMany).toHaveBeenCalledTimes(1);
      const call = (prisma.twoFactorRecoveryCode.createMany as ReturnType<typeof vi.fn>).mock.calls[0]![0];
      expect(call.data).toHaveLength(10);
      expect(call.data[0]).toEqual({ userId: 'user-1', codeHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
    });
  });

  // ─── verifyMfa ─────────────────────────────────────────────────
  describe('verifyMfa', () => {
    it('用户不存在 → MFA_002', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(verifyMfa('user-1', { token: '123456' })).rejects.toMatchObject({ code: 'MFA_002' });
    });
    it('2FA 未启用 → MFA_003', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser({ twoFactorEnabled: false }));
      await expect(verifyMfa('user-1', { token: '123456' })).rejects.toMatchObject({ code: 'MFA_003' });
    });
    it('未完成绑定 → MFA_003', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(mockUser({ totpSecret: null }));
      await expect(verifyMfa('user-1', { token: '123456' })).rejects.toMatchObject({ code: 'MFA_003' });
    });
    it('TOTP 正确 → 建 session + 签 access token + 返回 user DTO', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(boundUser());
      const code = buildTotp(SECRET).generate();
      const r = await verifyMfa('user-1', { token: code });
      expect(signAccessToken).toHaveBeenCalledWith('user-1');
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      expect(r.user).toEqual(expect.objectContaining({ id: 'user-1', twoFactorEnabled: true }));
    });
    it('TOTP 错误 → MFA_001 且不建 session', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(boundUser());
      const bad = wrongCode(SECRET);
      await expect(verifyMfa('user-1', { token: bad })).rejects.toMatchObject({ code: 'MFA_001' });
      expect(prisma.session.create).not.toHaveBeenCalled();
    });
    it('恢复码命中 → CAS 占用 + 建 session', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(boundUser());
      (prisma.twoFactorRecoveryCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      const r = await verifyMfa('user-1', { recoveryCode: 'ABCDE-FGHJK' });
      expect(prisma.twoFactorRecoveryCode.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', codeHash: expect.any(String), usedAt: null },
        data: { usedAt: expect.any(Date) },
      });
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      expect(r.accessToken).toBe('access-token');
    });
    it('恢复码未命中（已用/不存在）→ MFA_001', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(boundUser());
      (prisma.twoFactorRecoveryCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 });
      await expect(verifyMfa('user-1', { recoveryCode: 'ZZZZZ-ZZZZZ' })).rejects.toMatchObject({ code: 'MFA_001' });
      expect(prisma.session.create).not.toHaveBeenCalled();
    });
    it('TOTP 错但恢复码对 → 放行', async () => {
      (prisma.user.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(boundUser());
      const bad = wrongCode(SECRET);
      (prisma.twoFactorRecoveryCode.updateMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
      const r = await verifyMfa('user-1', { token: bad, recoveryCode: 'ABCDE-FGHJK' });
      expect(prisma.session.create).toHaveBeenCalledTimes(1);
      expect(r.accessToken).toBe('access-token');
    });
  });
});
