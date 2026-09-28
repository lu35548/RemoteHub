// packages/backend/src/utils/jwt.test.ts
// 票 #30 安全核心：jose 双向显式 aud（libcheck-auth §4）——
// ① jose 不传 audience 选项时 aud claim 完全不校验，反向拒收不够，必须显式 audience
// ② 绝不签发多值 aud（any-overlap 语义下 ['access','mfa'] 双过=没防），验签侧亦须拒收
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../config/env.js', () => ({
  env: {
    NODE_ENV: 'test',
    JWT_SECRET: 'test-jwt-secret-for-unit-tests-at-least-32-chars',
    JWT_ACCESS_EXPIRES_IN: '15m',
  },
}));

import * as jose from 'jose';
import {
  signAccessToken,
  verifyAccessToken,
  signMfaToken,
  verifyMfaToken,
} from './jwt.js';

const secret = new TextEncoder().encode('test-jwt-secret-for-unit-tests-at-least-32-chars');

/** 绕过项目签发函数，手工造指定 aud 形状的 token（aud 攻击面的输入源） */
async function craftToken(payload: Record<string, unknown>, expirationTime?: string): Promise<string> {
  let builder = new jose.SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt();
  if (expirationTime) builder = builder.setExpirationTime(expirationTime);
  return builder.sign(secret);
}

describe('jwt aud 双向校验（票 #30 安全核心）', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('signAccessToken → verifyAccessToken 往返成功（aud=access）', async () => {
    const token = await signAccessToken('user-1');
    const { userId } = await verifyAccessToken(token);
    expect(userId).toBe('user-1');
  });

  it('signMfaToken → verifyMfaToken 往返成功（aud=mfa）', async () => {
    const token = await signMfaToken('user-1');
    const { userId } = await verifyMfaToken(token);
    expect(userId).toBe('user-1');
  });

  it('mfa token 喂给 verifyAccessToken → 拒收（aud 互斥正向）', async () => {
    const mfaToken = await signMfaToken('user-1');
    await expect(verifyAccessToken(mfaToken)).rejects.toThrow();
  });

  it('access token 喂给 verifyMfaToken → 拒收（aud 互斥反向）', async () => {
    const accessToken = await signAccessToken('user-1');
    await expect(verifyMfaToken(accessToken)).rejects.toThrow();
  });

  it('无 aud claim 的 token → verifyAccessToken 拒收（jose 显式 audience 后 aud 进必查清单）', async () => {
    const token = await craftToken({ userId: 'user-1' }, '15m');
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it('多值 aud ["access","mfa"] → verifyAccessToken 拒收（jose any-overlap 会放行，须自实现拒收）', async () => {
    const token = await craftToken({ userId: 'user-1', aud: ['access', 'mfa'] }, '15m');
    await expect(verifyAccessToken(token)).rejects.toThrow();
  });

  it('多值 aud ["mfa"] → verifyMfaToken 拒收（同款自实现拒收）', async () => {
    const token = await craftToken({ userId: 'user-1', aud: ['mfa'] }, '15m');
    await expect(verifyMfaToken(token)).rejects.toThrow();
  });

  it('过期 mfa token → verifyMfaToken 拒收（15 分钟短时效语义）', async () => {
    const token = await craftToken({ userId: 'user-1', aud: 'mfa' }, '-1s');
    await expect(verifyMfaToken(token)).rejects.toThrow();
  });

  it('无 exp claim 的伪 token → 双 verifier 必拒（requiredClaims 纵深，防手工无过期 token）', async () => {
    const noExpAccess = await craftToken({ userId: 'user-1', aud: 'access' });
    await expect(verifyAccessToken(noExpAccess)).rejects.toThrow();
    const noExpMfa = await craftToken({ userId: 'user-1', aud: 'mfa' });
    await expect(verifyMfaToken(noExpMfa)).rejects.toThrow();
  });
});
