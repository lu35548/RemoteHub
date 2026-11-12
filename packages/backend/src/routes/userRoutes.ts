// packages/backend/src/routes/userRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { auditMiddleware } from '../middleware/audit.js';
import * as userController from '../controllers/userController.js';

export const userRoutes: RouterType = Router();

/**
 * @swagger
 * /api/v1/users:
 *   get:
 *     summary: 用户列表(分页,admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: 用户分页列表
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
userRoutes.get('/', authMiddleware, roleMiddleware('admin'), userController.listUsers);
/**
 * @swagger
 * /api/v1/users/search:
 *   get:
 *     summary: 按用户名模糊搜索用户
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string }
 *         description: 搜索关键字(≥1 字符,空串返回空数组)
 *     responses:
 *       200:
 *         description: 用户数组(非分页)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
userRoutes.get('/search', authMiddleware, userController.searchUsers);
/**
 * @swagger
 * /api/v1/users/{id}:
 *   get:
 *     summary: 用户详情(admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 用户详情
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 用户不存在(USER_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRoutes.get('/:id', authMiddleware, roleMiddleware('admin'), userController.getUser);
/**
 * @swagger
 * /api/v1/users/{id}:
 *   patch:
 *     summary: 更新用户(admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { type: object }
 *           example: { role: "admin", enabled: true }
 *     responses:
 *       200:
 *         description: 更新后的用户
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 用户不存在(USER_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRoutes.patch('/:id', authMiddleware, auditMiddleware({ action: 'USER_UPDATE', resource: 'user' }), roleMiddleware('admin'), userController.updateUser);
/**
 * @swagger
 * /api/v1/users/{id}:
 *   delete:
 *     summary: 删除用户(admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 已删除
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 用户不存在(USER_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
userRoutes.delete('/:id', authMiddleware, auditMiddleware({ action: 'USER_DELETE', resource: 'user' }), roleMiddleware('admin'), userController.deleteUser);
