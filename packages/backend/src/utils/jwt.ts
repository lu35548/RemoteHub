import crypto from 'node:crypto';
import { env } from '../config/env.js';
import * as jose from 'jose';

export async function signAccessToken(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  return new jose.SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime(env.JWT_ACCESS_EXPIRES_IN)
    .setIssuedAt()
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<{ userId: string }> {
  const secret = new TextEncoder().encode(env.JWT_SECRET);
  const { payload } = await jose.jwtVerify<{ userId: string }>(token, secret);
  return { userId: payload.userId };
}

export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
