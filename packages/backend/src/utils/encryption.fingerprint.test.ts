// 票 #50：ENCRYPTION_KEY 指纹口径锁死——SHA-256 作用于 base64 **解码后 32 字节**（非 env 原串），
// 前 8 hex。导入端以此校验导出文件（不匹配 422 VAL_001）；口径变更须同步导出/导入两侧与集成测试。
import '../test/helpers/env.js';
import crypto from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { getKeyFingerprint } from './encryption.js';

describe('getKeyFingerprint（票 #50）', () => {
  it('口径：等于 SHA-256(解码后字节) 前 8 hex', () => {
    const decoded = Buffer.from(process.env.ENCRYPTION_KEY!, 'base64');
    const expected = crypto.createHash('sha256').update(decoded).digest('hex').slice(0, 8);
    expect(getKeyFingerprint()).toBe(expected);
  });

  it('形态：8 位小写 hex', () => {
    expect(getKeyFingerprint()).toMatch(/^[0-9a-f]{8}$/);
  });

  it('同 key 稳定、不同 key 不同（同 KEY 校验的判别力）', () => {
    const fp1 = getKeyFingerprint();
    expect(getKeyFingerprint()).toBe(fp1);
    const other = crypto.randomBytes(32).toString('base64');
    const otherDigest = crypto.createHash('sha256').update(Buffer.from(other, 'base64')).digest('hex').slice(0, 8);
    // 与默认 env key 的指纹撞车概率 2^-32，随机 key 下视为不可能
    expect(otherDigest).not.toBe(fp1);
  });
});
