import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { auditMiddleware } from '../middleware/audit';
import { User, UserRole } from '../models/User';
import { AuditAction } from '../enums/CommonEnums';
import {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getCurrentUser,
  updateCurrentUser,
  updateUserStatus,
  updateUserRole,
  resetUserPassword,
} from '../controllers/userController';

const router = Router();

// 所有用户路由都需要认证
router.use(authenticateToken);

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: 获取用户列表（仅管理员）
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: 页码
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: 每页数量
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: 搜索关键词
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *           enum: [admin, user]
 *         description: 用户角色
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, suspended, pending]
 *         description: 用户状态
 *     responses:
 *       200:
 *         description: 成功返回用户列表
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限（需要管理员权限）
 */
router.get('/', requireRole(UserRole.ADMIN), getUsers);

/**
 * @swagger
 * /api/v1/users/profile/me:
 *   get:
 *     summary: 获取当前用户资料
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功返回用户资料
 *       401:
 *         description: 未认证
 */
router.get('/profile/me', getCurrentUser);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: 获取用户详情
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 用户ID
 *     responses:
 *       200:
 *         description: 成功返回用户详情
 *       401:
 *         description: 未认证
 *       404:
 *         description: 用户不存在
 */
router.get('/:id', getUserById);

/**
 * @swagger
 * /api/v1/users/profile/me:
 *   put:
 *     summary: 更新当前用户资料
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 description: 用户名
 *               email:
 *                 type: string
 *                 format: email
 *                 description: 邮箱
 *               firstName:
 *                 type: string
 *                 maxLength: 100
 *                 description: 名
 *               lastName:
 *                 type: string
 *                 maxLength: 100
 *                 description: 姓
 *               bio:
 *                 type: string
 *                 description: 个人简介
 *               phone:
 *                 type: string
 *                 maxLength: 20
 *                 description: 电话号码
 *               avatar:
 *                 type: string
 *                 format: uri
 *                 description: 头像URL
 *               preferences:
 *                 type: object
 *                 description: 用户偏好设置
 *     responses:
 *       200:
 *         description: 更新成功
 *       401:
 *         description: 未认证
 *       400:
 *         description: 请求参数错误
 *       409:
 *         description: 用户名或邮箱已存在
 */
router.put('/profile/me',
  auditMiddleware({
    action: AuditAction.UPDATE,
    entityType: 'user',
    description: '更新当前用户资料',
    isSensitive: true
  }),
  updateCurrentUser
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   put:
 *     summary: 更新用户信息（管理员或本人）
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 用户ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *               email:
 *                 type: string
 *                 format: email
 *               firstName:
 *                 type: string
 *                 maxLength: 100
 *               lastName:
 *                 type: string
 *                 maxLength: 100
 *               bio:
 *                 type: string
 *               phone:
 *                 type: string
 *                 maxLength: 20
 *               avatar:
 *                 type: string
 *                 format: uri
 *               role:
 *                 type: string
 *                 enum: [admin, user]
 *                 description: 角色（仅管理员可修改）
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended, pending]
 *                 description: 状态（仅管理员可修改）
 *     responses:
 *       200:
 *         description: 更新成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限
 *       404:
 *         description: 用户不存在
 *       409:
 *         description: 用户名或邮箱已存在
 */
router.put('/:id',
  auditMiddleware({
    action: AuditAction.UPDATE,
    entityType: 'user',
    entityId: req => req.params.id,
    description: '更新用户信息',
    isSensitive: true
  }),
  updateUser
);

/**
 * @swagger
 * /api/v1/users/{id}/status:
 *   put:
 *     summary: 更新用户状态（仅管理员）
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 用户ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, suspended, pending]
 *                 description: 新状态
 *     responses:
 *       200:
 *         description: 更新成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限（需要管理员权限）
 *       404:
 *         description: 用户不存在
 */
router.put('/:id/status',
  requireRole(UserRole.ADMIN),
  auditMiddleware({
    action: AuditAction.UPDATE,
    entityType: 'user',
    entityId: req => req.params.id,
    description: '更新用户状态',
    isSensitive: true
  }),
  updateUserStatus
);

/**
 * @swagger
 * /api/v1/users/{id}/role:
 *   put:
 *     summary: 更新用户角色（仅管理员）
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 用户ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - role
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [admin, user]
 *                 description: 新角色
 *     responses:
 *       200:
 *         description: 更新成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限（需要管理员权限）
 *       404:
 *         description: 用户不存在
 */
router.put('/:id/role',
  requireRole(UserRole.ADMIN),
  auditMiddleware({
    action: AuditAction.UPDATE,
    entityType: 'user',
    entityId: req => req.params.id,
    description: '更新用户角色',
    isSensitive: true
  }),
  updateUserRole
);

/**
 * @swagger
 * /api/v1/users/{id}/password/reset:
 *   put:
 *     summary: 重置用户密码（仅管理员）
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 用户ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 description: 新密码
 *     responses:
 *       200:
 *         description: 密码重置成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限（需要管理员权限）
 *       404:
 *         description: 用户不存在
 */
router.put('/:id/password/reset',
  requireRole(UserRole.ADMIN),
  auditMiddleware({
    action: AuditAction.UPDATE,
    entityType: 'user',
    entityId: req => req.params.id,
    description: '重置用户密码',
    isSensitive: true
  }),
  resetUserPassword
);

/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     summary: 删除用户（仅管理员）
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: 用户ID
 *     responses:
 *       200:
 *         description: 删除成功
 *       401:
 *         description: 未认证
 *       403:
 *         description: 无权限（需要管理员权限）
 *       404:
 *         description: 用户不存在
 */
router.delete('/:id',
  requireRole(UserRole.ADMIN),
  auditMiddleware({
    action: AuditAction.DELETE,
    entityType: 'user',
    entityId: req => req.params.id,
    description: '删除用户',
    isSensitive: true
  }),
  deleteUser
);

export default router;