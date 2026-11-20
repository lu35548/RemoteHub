import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ENCRYPTION_VERSION } from '@remotehub/shared';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;

function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'base64');
}

/**
 * ENCRYPTION_KEY 指纹（票 #50）：SHA-256 前 8 hex。
 * 口径裁量：作用于 **base64 解码后的 32 字节** 而非 env 原串——同一 key 的不同 base64
 * 表示形式（padding/换行变体）判同 KEY；语义上「同 KEY」即解码字节相同。
 * 导出文件携带此指纹，导入端不匹配即 422 VAL_001 拒绝（跨 KEY 明文中转范围外）。
 */
export function getKeyFingerprint(): string {
  return crypto.createHash('sha256').update(getKey()).digest('hex').slice(0, 8);
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
