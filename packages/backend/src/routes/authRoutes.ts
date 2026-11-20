// packages/backend/src/routes/authRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { mfaAuthMiddleware } from '../middleware/mfaAuth.js';
import { roleMiddleware } from '../middleware/role.js';
import { auditMiddleware } from '../middleware/audit.js';
import { forgotPasswordIpLimiter, forgotPasswordUserLimiter } from '../middleware/passwordResetLimiter.js';
import { mfaSetupConfirmLimiter, mfaVerifyLimiter } from '../middleware/mfaLimiter.js';
import * as authController from '../controllers/authController.js';

export const authRoutes: RouterType = Router();

// 速率限制已在 server.ts 全局注册，此处不再重复。
// 审计挂载（票 #16）：login/logout/change-password/profile 归 security 域；register 记
// USER_CREATE（spec 修正表 #13，行为语义优先于端点命名）。audit 在 authMiddleware 之后
// （要 req.user）、role 之前（403 同样记 failure）。refresh/heartbeat/GET 不审计（spec 排除）。

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     summary: 登录(限流;2FA enabled 用户返回挑战)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password]
 *             properties:
 *               username: { type: string }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: 登录成功(accessToken+user);2FA 用户返回 mfaPending 挑战(mfaToken,无 access token)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */
authRoutes.post('/login', auditMiddleware({ action: 'AUTH_LOGIN', resource: 'security' }), authController.login);
/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     summary: 创建用户(admin 专属,限流;审计 USER_CREATE)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username, password, nickname]
 *             properties:
 *               username: { type: string }
 *               password: { type: string, format: password }
 *               role: { type: string, enum: [admin, user], description: 可选,默认 user }
 *               nickname: { type: string, description: 昵称(必填) }
 *     responses:
 *       201:
 *         description: 用户已创建
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       409:
 *         description: 用户名已存在(USER_001)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
authRoutes.post('/register', authMiddleware, auditMiddleware({ action: 'USER_CREATE', resource: 'user' }), roleMiddleware('admin'), authController.register);
/**
 * @swagger
 * /api/v1/auth/refresh:
 *   post:
 *     summary: 刷新 access token(限流;refreshToken 走 httpOnly cookie)
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: 新 accessToken
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */
authRoutes.post('/refresh', authController.refresh);
/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     summary: 登出(撤销当前 session)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 已登出
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
authRoutes.post('/logout', authMiddleware, auditMiddleware({ action: 'AUTH_LOGOUT', resource: 'security' }), authController.logout);
/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     summary: 当前用户信息
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 当前用户(不含密码哈希)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
authRoutes.get('/me', authMiddleware, authController.me);
/**
 * @swagger
 * /api/v1/auth/change-password:
 *   post:
 *     summary: 修改密码(成功后撤销全部 session,必被踢下线——契约非 bug)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword: { type: string, format: password }
 *               newPassword: { type: string, format: password }
 *     responses:
 *       200:
 *         description: 已修改(所有 session 已撤销)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: 旧密码错误(AUTH_006)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
authRoutes.post('/change-password', authMiddleware, auditMiddleware({ action: 'AUTH_PASSWORD_CHANGE', resource: 'security' }), authController.changePassword);
/**
 * @swagger
 * /api/v1/auth/profile:
 *   patch:
 *     summary: 更新我的资料
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object, description: 可更新字段(如昵称等展示信息) }
 *     responses:
 *       200:
 *         description: 更新后的用户
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
authRoutes.patch('/profile', authMiddleware, auditMiddleware({ action: 'AUTH_PROFILE_UPDATE', resource: 'security' }), authController.updateProfile);
/**
 * @swagger
 * /api/v1/auth/heartbeat:
 *   post:
 *     summary: 在线心跳(客户端 5s 固定节奏)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 已记录
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
authRoutes.post('/heartbeat', authMiddleware, authController.heartbeat);
/**
 * @swagger
 * /api/v1/auth/online:
 *   get:
 *     summary: 在线用户列表(5 分钟窗口)
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 在线用户数组
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
authRoutes.get('/online', authMiddleware, authController.getOnlineUsers);

// 密码重置（票 #28，公开端点）：限流双轨挂路由级（避开 app.use 挂载点剥前缀陷阱，
// 且 server.ts 由并行票占用）；audit 循 login 公开端点先例（userId 落 null），
// 排在 limiter 之后——429 不落审计，与 login 同口径。
/**
 * @swagger
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: 忘记密码(公开,IP+用户双轨限流;响应恒中性防枚举)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [username]
 *             properties:
 *               username: { type: string }
 *     responses:
 *       200:
 *         description: 恒中性成功(用户存在与否不泄露;重置链接仅经 admin 面板转交)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
authRoutes.post(
  '/forgot-password',
  forgotPasswordIpLimiter,
  forgotPasswordUserLimiter,
  auditMiddleware({ action: 'AUTH_PASSWORD_RESET_REQUEST', resource: 'security' }),
  authController.forgotPassword,
);
/**
 * @swagger
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: 重置密码(公开;一次性 token 用后即焚,成功撤销全部 session)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, newPassword]
 *             properties:
 *               token: { type: string, description: 重置令牌(1 小时有效,最多 3 次/用户) }
 *               newPassword: { type: string, format: password }
 *     responses:
 *       200:
 *         description: 密码已重置(全部 session 撤销)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: 令牌无效/过期/已复用(RESET_001)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
authRoutes.post(
  '/reset-password',
  auditMiddleware({ action: 'AUTH_PASSWORD_RESET', resource: 'security' }),
  authController.resetPassword,
);

// 2FA（票 #30）：mfaAuthMiddleware 守卫（aud:'mfa' 挑战 token，login 二段签发）。
// 三端点均挂 per-IP 限流（TOTP 爆破节流，libcheck-auth §1；review F3 补 setup/confirm，
// confirm 有 TOTP 猜测面），limiter 在 mfaAuth 之前（429 不消耗 mfa token 验签与查库）；
// 三端点不挂审计（挑战阶段无 session/无业务写操作，session 建立时点已在 login 审计覆盖之外，票面未要求）。
/**
 * @swagger
 * /api/v1/auth/mfa/setup:
 *   post:
 *     summary: 发起 2FA 绑定(mfa 挑战 token;返回 secret+otpauthUri)
 *     description: security 标 bearerAuth 系折中呈现;实际守卫为 mfaAuthMiddleware(aud:'mfa' 短时挑战 token,login 二段签发),非常规 access token。
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 绑定材料(secret 手输 / otpauthUri 渲染二维码)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 */
authRoutes.post('/mfa/setup', mfaSetupConfirmLimiter, mfaAuthMiddleware, authController.mfaSetup);
/**
 * @swagger
 * /api/v1/auth/mfa/confirm:
 *   post:
 *     summary: 确认 2FA 绑定(校验一次 TOTP 后落库,返回恢复码)
 *     description: security 标 bearerAuth 系折中呈现;实际守卫为 mfaAuthMiddleware(aud:'mfa' 短时挑战 token,login 二段签发),非常规 access token。
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [secret, token]
 *             properties:
 *               secret: { type: string }
 *               token: { type: string, description: 6 位 TOTP }
 *     responses:
 *       200:
 *         description: 绑定完成(返回恢复码)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: 验证码错误(MFA_001)或状态冲突(MFA_003)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 挑战令牌无效/过期(MFA_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
authRoutes.post('/mfa/confirm', mfaSetupConfirmLimiter, mfaAuthMiddleware, authController.mfaConfirm);
/**
 * @swagger
 * /api/v1/auth/mfa/verify:
 *   post:
 *     summary: 2FA 挑战验证(成功换发 access token)
 *     description: security 标 bearerAuth 系折中呈现;实际守卫为 mfaAuthMiddleware(aud:'mfa' 短时挑战 token,login 二段签发),非常规 access token。
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token: { type: string, description: 6 位 TOTP 或恢复码 }
 *     responses:
 *       200:
 *         description: 验证通过(accessToken+user)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: 验证码或恢复码错误(MFA_001)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: 挑战令牌无效/过期(MFA_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         $ref: '#/components/responses/RateLimited'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
authRoutes.post('/mfa/verify', mfaVerifyLimiter, mfaAuthMiddleware, authController.mfaVerify);
