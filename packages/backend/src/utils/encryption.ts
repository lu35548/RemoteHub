import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ENCRYPTION_VERSION } from '@remotehub/shared';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'base64');
}

function getOldKey(): Buffer | null {
  if (!env.ENCRYPTION_KEY_OLD) return null;
  return Buffer.from(env.ENCRYPTION_KEY_OLD, 'base64');
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${ENCRYPTION_VERSION}:${iv.toString('base64')}:${encrypted.toString('base64')}:${authTag.toString('base64')}`;
}

export function decrypt(encrypted: string): string {
  const parts = encrypted.split(':');
  const version = parts[0];

  if (version === 'v1') {
    const [, ivB64, ctB64, tagB64] = parts;
    const iv = Buffer.from(ivB64!, 'base64');
    const ciphertext = Buffer.from(ctB64!, 'base64');
    const authTag = Buffer.from(tagB64!, 'base64');

    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
      decipher.setAuthTag(authTag);
      return decipher.update(ciphertext) + decipher.final('utf8');
    } catch {
      const oldKey = getOldKey();
      if (oldKey) {
        const decipher = crypto.createDecipheriv(ALGORITHM, oldKey, iv);
        decipher.setAuthTag(authTag);
        return decipher.update(ciphertext) + decipher.final('utf8');
      }
      throw new Error('解密失败：密钥不匹配');
    }
  }

  throw new Error(`不支持的加密版本: ${version}`);
}
