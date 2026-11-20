import crypto from 'node:crypto';
import { env } from '../config/env.js';
import * as jose from 'jose';

export async function signAccessToken(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new jose.SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    // 票 #30 安全核心：显式 aud（jose 不传 audience 选项时 aud claim 完全不校验）
    .setAudience('access')
    .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
    .setIssuedAt()
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<{ userId: string }> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  // 显式 audience:'access'：aud 缺失即抛错；aud='mfa' 的挑战 token 在此被拒收
  // requiredClaims 纵深（review note）：签发端恒 setExpirationTime，防无 exp 的手工 token
  const { payload } = await jose.jwtVerify<{ userId: string; aud?: string | string[] }>(token, secret, { audience: 'access', requiredClaims: ['exp'] });
  // 多值 aud 拒收：jose any-overlap 语义会放行 ['access','mfa']，双过等于没防——
  // 绝不签发多值 aud，验签侧亦显式拒绝（libcheck-auth §4）
  if (Array.isArray(payload.aud)) {
    throw new Error('多值 aud token 拒收（any-overlap 双过=没防）');
  }
  return { userId: payload.userId };
}

// ─── mfa 挑战 token（票 #30，独立 aud:'mfa'，15 分钟）───

const MFA_TOKEN_EXPIRES_IN = '15m';

export async function signMfaToken(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new jose.SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('mfa')
    .setExpirationTime(MFA_TOKEN_EXPIRES_IN)
    .setIssuedAt()
    .sign(secret);
}

export async function verifyMfaToken(token: string): Promise<{ userId: string }> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  // requiredClaims 纵深（review note）：同 verifyAccessToken，exp 缺失即拒
  const { payload } = await jose.jwtVerify<{ userId: string; aud?: string | string[] }>(token, secret, { audience: 'mfa', requiredClaims: ['exp'] });
  if (Array.isArray(payload.aud)) {
    throw new Error('多值 aud token 拒收（any-overlap 双过=没防）');
  }
  return { userId: payload.userId };
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ─── 密码重置 token（票 #28，design §6.3：256-bit 随机，SHA-256 hex 落库与 Session 同族）───

export function generatePasswordResetToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashPasswordResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
