// packages/backend/src/services/twoFactorService.ts
// 2FA 域（P1-3，票 #30，spec W1-2 修正后方案）：
// - 登录二段：enabled 用户密码通过后发 aud:'mfa' 挑战 token（15 分钟），session 建立时机
//   推迟到 mfa/verify 成功后——绝不提前建 session / 签 access token（spec 修正表 #1）
// - 绑定流：setup 发 secret+URI（不落库）→ confirm 校验一次 TOTP 后才落库（加密走通用通道）
//   + 生成恢复码一次性返回（OWASP 口径：N 组单次 + hash 存储 + 用后作废，libcheck-auth §2）
import crypto from 'node:crypto';
import { prisma } from '../utils/prisma.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../utils/jwt.js';
import { createAppError } from '../utils/appError.js';
import { toUserPublic } from './authService.js';
import * as OTPAuth from 'otpauth';

/** 恢复码组数（OWASP 常见 8-10 组，取 10） */
const RECOVERY_CODE_COUNT = 10;
/** base32 风格字母表，去除易混淆字符（0/O、1/I/L） */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** 标准 base32（RFC 4648，A-Z2-7）形状校验，拦截乱码 secret 进 HMAC */
const BASE32_PATTERN = /^[A-Z2-7]+=*$/;
/** 恢复码验证/落库前的归一化：去分隔符 + 大写（用户手输大小写/横杠差异容忍） */
function normalizeRecoveryCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

function generateRecoveryCode(): string {
  const bytes = crypto.randomBytes(10);
  const chars = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

function buildTotp(secretBase32: string, label: string): OTPAuth.TOTP {
  return new OTPAuth.TOTP({
    issuer: 'RemoteHub',
    label,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

/** 绑定/验证共用的前置状态守卫：加载用户 + isActive + admin 开关判定 */
async function loadGuardedUser(userId: string, requireBound: boolean) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw createAppError('MFA_002');
  if (!user.twoFactorEnabled) throw createAppError('MFA_003');
  if (requireBound !== Boolean(user.totpSecret)) throw createAppError('MFA_003');
  return user;
}

/** 绑定流第一步：生成 secret + otpauth:// URI（stateless 不落库）。
 * secret 只在 confirm 校验通过后落库（票面口径「验证一次 TOTP 后落库」），
 * 未确认即放弃不留脏状态，下次登录仍进绑定页。 */
export async function generateMfaSetup(userId: string) {
  const user = await loadGuardedUser(userId, false);
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const totp = buildTotp(secret, user.username);
  return { secret, otpauthUri: totp.toString() };
}

/** 绑定流第二步：校验一次 TOTP → secret 密文 CAS 条件写落库（事务内守卫）+ 生成恢复码（一次性返回） */
export async function confirmMfaSetup(userId: string, secret: string, token: string) {
  const user = await loadGuardedUser(userId, false);
  if (!BASE32_PATTERN.test(secret)) {
    throw createAppError('VAL_001', [{ field: 'secret', message: 'secret 格式无效' }]);
  }
  const delta = buildTotp(secret, user.username).validate({ token, window: 1 });
  if (delta === null) throw createAppError('MFA_001');

  const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await prisma.$transaction(async (tx) => {
    // 事务内条件写守卫（CAS，对照批 1 resetPassword `usedAt: null` 先例）：loadGuardedUser 的
    // 读-验-写非原子，双端点并发 confirm（各持有效 TOTP）可同时过守卫；`totpSecret 仍为 null`
    // 条件写保证仅一个赢家——输家 count=0 → MFA_003（语义=「已被并发请求绑定」，与 loadGuardedUser
    // 的已绑定 MFA_003 同状态码），杜绝后写覆盖 secret + 双份恢复码并存。
    const claimed = await tx.user.updateMany({
      where: { id: user.id, totpSecret: null },
      data: { totpSecret: encrypt(secret) },
    });
    if (claimed.count !== 1) throw createAppError('MFA_003');
    // 恢复码创建须在守卫成功路径内、同一事务，与 secret 写入原子
    await tx.twoFactorRecoveryCode.createMany({
      data: recoveryCodes.map((code) => ({ userId: user.id, codeHash: hashRecoveryCode(code) })),
    });
  });
  return { recoveryCodes };
}

/** 登录二段：TOTP 优先、恢复码兜底 → 建正式 session + 签 access token */
export async function verifyMfa(userId: string, input: { token?: string; recoveryCode?: string }) {
  const user = await loadGuardedUser(userId, true);

  let verified = false;
  if (input.token) {
    // 显式收窄（review note）：loadGuardedUser(requireBound=true) 已保证非 null，此处仅为
    // 类型系统显式化；null 视为状态异常拒绝，杜绝 `!` 断言喂 null 给 decrypt
    if (!user.totpSecret) throw createAppError('MFA_002');
    const totp = buildTotp(decrypt(user.totpSecret), user.username);
    verified = totp.validate({ token: input.token, window: 1 }) !== null;
  }
  if (!verified && input.recoveryCode) {
    // CAS 原子占用（RESET_001 同款守卫）：并发复用同码仅一个成功
    const claimed = await prisma.twoFactorRecoveryCode.updateMany({
      where: { userId: user.id, codeHash: hashRecoveryCode(input.recoveryCode), usedAt: null },
      data: { usedAt: new Date() },
    });
    verified = claimed.count === 1;
  }
  if (!verified) throw createAppError('MFA_001');

  const accessToken = await signAccessToken(user.id);
  const refreshToken = generateRefreshToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });
  return { accessToken, refreshToken, user: toUserPublic(user) };
}
