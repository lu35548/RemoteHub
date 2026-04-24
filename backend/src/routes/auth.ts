import { Router } from 'express';
import {
  register,
  login,
  refreshToken,
  logout,
  getCurrentUser,
  requestPasswordReset,
  resetPassword,
  changePassword,
} from '../controllers/authController';
import {
  authenticateToken,
  optionalAuth,
  loginRateLimit,
  passwordResetRateLimit,
} from '../middleware/auth';
import { loginAuditMiddleware, auditMiddleware, sensitiveAuditMiddleware } from '../middleware/audit';
import { AuditAction } from '../enums/CommonEnums';

const router = Router();

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: 用户注册
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 30
 *                 pattern: '^[a-zA-Z0-9_]+$'
 *                 description: 用户名，只能包含字母、数字和下划线
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 邮箱地址
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: 密码，必须包含大小写字母、数字和特殊字符
 *               firstName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: 名字（可选）
 *               lastName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *                 description: 姓氏（可选）
 *     responses:
 *       201:
 *         description: 注册成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       400:
 *         description: 请求参数错误
 *       409:
 *         description: 用户已存在
 */
router.post('/register',
  auditMiddleware({
    action: AuditAction.CREATE,
    entityType: 'user',
    description: '用户注册',
    isSensitive: true
  }),
  register
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: 用户登录
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 邮箱地址
 *               password:
 *                 type: string
 *                 description: 密码
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *                     tokens:
 *                       $ref: '#/components/schemas/TokenPair'
 *       401:
 *         description: 认证失败
 *       429:
 *         description: 请求过于频繁
 */
router.post('/login', loginRateLimit, loginAuditMiddleware, login);

/**
 * @swagger
 * /auth/refresh:
 *   post:
 *     summary: 刷新访问令牌
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *                 description: 刷新令牌
 *     responses:
 *       200:
 *         description: 令牌刷新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     tokens:
 *                       $ref: '#/components/schemas/TokenPair'
 *       401:
 *         description: 无效的刷新令牌
 */
router.post('/refresh', refreshToken);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: 用户登出
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 登出成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: 未认证
 */
router.post('/logout',
  authenticateToken,
  auditMiddleware({
    action: AuditAction.LOGOUT,
    entityType: 'auth',
    description: '用户登出',
    isSensitive: true
  }),
  logout
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: 获取当前用户信息
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: 未认证
 */
router.get('/me', authenticateToken, getCurrentUser);

// Compatibility endpoint for frontend
router.get('/current-user', authenticateToken, getCurrentUser);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: 请求密码重置
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 邮箱地址
 *     responses:
 *       200:
 *         description: 重置链接已发送
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       429:
 *         description: 请求过于频繁
 */
router.post('/forgot-password', passwordResetRateLimit, requestPasswordReset);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: 重置密码
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *                 description: 密码重置令牌
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: 新密码
 *     responses:
 *       200:
 *         description: 密码重置成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 无效或过期的重置令牌
 */
router.post('/reset-password',
  auditMiddleware({
    action: AuditAction.UPDATE,
    entityType: 'auth',
    description: '重置密码',
    isSensitive: true
  }),
  resetPassword
);

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: 更改密码
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: 当前密码
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: 新密码
 *     responses:
 *       200:
 *         description: 密码更改成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: 请求参数错误
 *       401:
 *         description: 当前密码错误
 */
router.post('/change-password',
  authenticateToken,
  auditMiddleware({
    action: AuditAction.UPDATE,
    entityType: 'auth',
    description: '修改密码',
    isSensitive: true
  }),
  changePassword
);

export default router;