// packages/backend/src/middleware/mfaLimiter.ts
// 票 #30：mfa 流程 per-IP 限流（5 次/min，RATE_LIMIT_MFA_VERIFY_MAX 可配）。
// otpauth 官方口径：window=1 之外「必须在服务端实现节流机制」（libcheck-auth §1/§5）。
// 挂载点：路由级（authRoutes 内，同 passwordResetLimiter 先例），避开 app.use 挂载剥前缀陷阱。
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';

const RATE_LIMIT_MESSAGE = { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } } as const;

export const mfaVerifyLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_MFA_VERIFY_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});

// setup/confirm 复用 RATE_LIMIT_MFA_VERIFY_MAX（#30 review F3 裁决：语义同为「mfa 流程防爆破」，
// 不新加 env 变量）；同一实例挂两端点 → setup+confirm 共享一份 per-IP 配额（比各自 5/min 更紧），
// 正常绑定流 1 setup + 1 confirm = 2 次/min，余量充足；且防持 mfa token 者 10^6 TOTP 空间猜测（confirm）。
export const mfaSetupConfirmLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_MFA_VERIFY_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: RATE_LIMIT_MESSAGE,
});
