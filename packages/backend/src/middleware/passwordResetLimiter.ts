// packages/backend/src/middleware/passwordResetLimiter.ts
// 票 #28：forgot-password 双轨限流（design §6.5）：
// - per-IP 3 次/h：express-rate-limit 默认按 IP 计数
// - per-user 5 次/24h：keyGenerator 取 body.username（trim/lowercase 归一化防变体绕过）。
//   判型防 undefined：body 缺 username 时回退 req.ip（v7 合法），绝不返回 undefined——
//   keyGenerator 恒定返回同值会退化成全局共享配额（libcheck-auth §5 事故级场景）。
// 挂载点：路由级（authRoutes 内），避开 app.use('/api/v1/') 挂载点剥前缀陷阱；
// express.json 在全局栈更外侧，路由级执行时 req.body 已解析。
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const RATE_LIMIT_MESSAGE = { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } } as const;

/** per-user key：username 归一化 → 缺失回退 req.ip → 双缺兜底 'unknown' */
export function forgotPasswordUserKey(req: { body?: unknown; ip?: string | undefined }): string {
  const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as { username?: unknown };
  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
  return username || req.ip || 'unknown';
}

/** forgot-password per-IP 限流：3 次/h/IP（RATE_LIMIT_FORGOT_PASSWORD_MAX 可配） */
export const forgotPasswordIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: env.RATE_LIMIT_FORGOT_PASSWORD_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

/** forgot-password 每用户限流：5 次/24h（自首请求起算非自然日，libcheck-auth §5） */
export const forgotPasswordUserLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
  keyGenerator: forgotPasswordUserKey,
});
