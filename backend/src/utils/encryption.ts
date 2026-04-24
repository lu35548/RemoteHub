import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

/**
 * 加密数据
 */
export async function encryptData(data: string, key: string): Promise<string> {
  try {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // 使用PBKDF2从密码生成密钥
    const keyBuffer = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');

    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
    cipher.setAAD(Buffer.from('RemoteHub', 'utf8'));

    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const tag = cipher.getAuthTag();

    // 组合所有组件
    const combined = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'base64')
    ]);

    return combined.toString('base64');

  } catch (error: any) {
    throw new Error(`加密失败: ${error.message}`);
  }
}

/**
 * 解密数据
 */
export async function decryptData(encryptedData: string, key: string): Promise<string> {
  try {
    const combined = Buffer.from(encryptedData, 'base64');

    // 提取组件
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    // 生成密钥
    const keyBuffer = crypto.pbkdf2Sync(key, salt, 100000, 32, 'sha256');

    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(tag);
    decipher.setAAD(Buffer.from('RemoteHub', 'utf8'));

    let decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;

  } catch (error: any) {
    throw new Error(`解密失败: ${error.message}`);
  }
}

/**
 * 生成随机盐值
 */
export function generateSalt(): string {
  return crypto.randomBytes(SALT_LENGTH).toString('hex');
}

/**
 * 哈希密码
 */
export async function hashPassword(password: string, salt?: string): Promise<{ hash: string; salt: string }> {
  const passwordSalt = salt || crypto.randomBytes(SALT_LENGTH).toString('hex');
  const hash = crypto.pbkdf2Sync(password, passwordSalt, 100000, 64, 'sha512').toString('hex');

  return { hash, salt: passwordSalt };
}

/**
 * 验证密码
 */
export async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  try {
    const hashedPassword = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
    return hashedPassword === hash;
  } catch (error) {
    return false;
  }
}

/**
 * 生成安全的随机令牌
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * 生成UUID v4
 */
export function generateUUID(): string {
  return crypto.randomUUID();
}

/**
 * 创建HMAC签名
 */
export function createHMAC(data: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

/**
 * 验证HMAC签名
 */
export function verifyHMAC(data: string, signature: string, secret: string): boolean {
  const expectedSignature = createHMAC(data, secret);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}