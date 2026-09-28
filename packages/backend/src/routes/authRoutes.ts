// packages/backend/src/routes/authRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { mfaAuthMiddleware } from '../middleware/mfaAuth.js';
import { roleMiddleware } from '../middleware/role.js';
import { auditMiddleware } from '../middleware/audit.js';
import { forgotPasswordIpLimiter, forgotPasswordUserLimiter } from '../middleware/passwordResetLimiter.js';
import { mfaVerifyLimiter } from '../middleware/mfaLimiter.js';
import * as authController from '../controllers/authController.js';

export const authRoutes: RouterType = Router();

// 速率限制已在 server.ts 全局注册，此处不再重复。
// 审计挂载（票 #16）：login/logout/change-password/profile 归 security 域；register 记
// USER_CREATE（spec 修正表 #13，行为语义优先于端点命名）。audit 在 authMiddleware 之后
// （要 req.user）、role 之前（403 同样记 failure）。refresh/heartbeat/GET 不审计（spec 排除）。

authRoutes.post('/login', auditMiddleware({ action: 'AUTH_LOGIN', resource: 'security' }), authController.login);
authRoutes.post('/register', authMiddleware, auditMiddleware({ action: 'USER_CREATE', resource: 'user' }), roleMiddleware('admin'), authController.register);
authRoutes.post('/refresh', authController.refresh);
authRoutes.post('/logout', authMiddleware, auditMiddleware({ action: 'AUTH_LOGOUT', resource: 'security' }), authController.logout);
authRoutes.get('/me', authMiddleware, authController.me);
authRoutes.post('/change-password', authMiddleware, auditMiddleware({ action: 'AUTH_PASSWORD_CHANGE', resource: 'security' }), authController.changePassword);
authRoutes.patch('/profile', authMiddleware, auditMiddleware({ action: 'AUTH_PROFILE_UPDATE', resource: 'security' }), authController.updateProfile);
authRoutes.post('/heartbeat', authMiddleware, authController.heartbeat);
authRoutes.get('/online', authMiddleware, authController.getOnlineUsers);

// 密码重置（票 #28，公开端点）：限流双轨挂路由级（避开 app.use 挂载点剥前缀陷阱，
// 且 server.ts 由并行票占用）；audit 循 login 公开端点先例（userId 落 null），
// 排在 limiter 之后——429 不落审计，与 login 同口径。
authRoutes.post(
  '/forgot-password',
  forgotPasswordIpLimiter,
  forgotPasswordUserLimiter,
  auditMiddleware({ action: 'AUTH_PASSWORD_RESET_REQUEST', resource: 'security' }),
  authController.forgotPassword,
);
authRoutes.post(
  '/reset-password',
  auditMiddleware({ action: 'AUTH_PASSWORD_RESET', resource: 'security' }),
  authController.resetPassword,
);

// 2FA（票 #30）：mfaAuthMiddleware 守卫（aud:'mfa' 挑战 token，login 二段签发）。
// verify 挂 per-IP 限流（TOTP 爆破节流，libcheck-auth §1）；三端点不挂审计
// （挑战阶段无 session/无业务写操作，session 建立时点已在 login 审计覆盖之外，票面未要求）。
authRoutes.post('/mfa/setup', mfaAuthMiddleware, authController.mfaSetup);
authRoutes.post('/mfa/confirm', mfaAuthMiddleware, authController.mfaConfirm);
authRoutes.post('/mfa/verify', mfaVerifyLimiter, mfaAuthMiddleware, authController.mfaVerify);
