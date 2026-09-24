// packages/backend/src/middleware/passwordResetLimiter.test.ts
// 票 #28：forgot-password 双轨限流单元测试——keyGenerator 判型归一化（libcheck-auth §5：
// undefined 退化成全局共享配额 = 事故级；trim/lowercase 防变体绕过）。
// limiter 429 行为属集成覆盖（MemoryStore 状态不可在单测间隔离）。
import '../test/helpers/env.js'; // 环境前置（config/env.js 在 import 期 requireEnv 快照）
import { describe, expect, it } from 'vitest';
import { forgotPasswordUserKey } from './passwordResetLimiter.js';

/** 构造最小请求形状（keyGenerator 只读 body.username / ip） */
function req(over: { body?: unknown; ip?: string } = {}): { body?: unknown; ip?: string } {
  return { ip: '203.0.119.9', ...over };
}

describe('forgotPasswordUserKey（每用户 24h 限流的 key 归一化）', () => {
  it('字符串 username → trim + lowercase 归一化（大写/尾空格/tab 变体同 key 防绕过）', () => {
    expect(forgotPasswordUserKey(req({ body: { username: 'Alice' } }))).toBe('alice');
    expect(forgotPasswordUserKey(req({ body: { username: 'alice ' } }))).toBe('alice');
    expect(forgotPasswordUserKey(req({ body: { username: '\talice\t' } }))).toBe('alice');
  });

  it('username 非字符串（缺失/数字/undefined）→ 回退 req.ip，不产生全局共享 key', () => {
    expect(forgotPasswordUserKey(req({ body: {}, ip: '1.1.1.1' }))).toBe('1.1.1.1');
    expect(forgotPasswordUserKey(req({ body: { username: 42 }, ip: '2.2.2.2' }))).toBe('2.2.2.2');
    expect(forgotPasswordUserKey(req({ body: undefined, ip: '3.3.3.3' }))).toBe('3.3.3.3');
    // 双缺（body 无 username 且无 ip）→ 'unknown' 兜底，不返回 undefined 使限流失效
    expect(forgotPasswordUserKey({ body: {} })).toBe('unknown');
  });

  it('不同 IP 同缺 username → 各自独立 key（判型防 undefined 退化为全局共享配额）', () => {
    const a = forgotPasswordUserKey({ body: undefined, ip: '10.0.0.1' });
    const b = forgotPasswordUserKey({ body: undefined, ip: '10.0.0.2' });
    expect(a).not.toBe(b);
  });
});
