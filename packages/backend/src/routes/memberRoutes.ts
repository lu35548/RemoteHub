// packages/backend/src/routes/memberRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import * as memberController from '../controllers/memberController.js';
import type { MemberRole } from '@remotehub/shared';

// 注意：这些路由将作为子路由挂载到 /projects/:id/members
export const memberRoutes: RouterType = Router({ mergeParams: true });

/**
 * @swagger
 * /api/v1/projects/{id}/members:
 *   get:
 *     summary: 项目成员列表(分页)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 项目 ID
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *     responses:
 *       200:
 *         description: 成员分页列表
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
memberRoutes.get('/', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), memberController.listMembers);
/**
 * @swagger
 * /api/v1/projects/{id}/members:
 *   post:
 *     summary: 添加项目成员(owner)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 项目 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, role]
 *             properties:
 *               userId: { type: string, description: 被添加用户 ID }
 *               role: { type: string, enum: [owner, editor, viewer], description: 项目角色 }
 *     responses:
 *       201:
 *         description: 成员已添加
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目或用户不存在(PROJ_002/USER_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 成员已存在(MEMBER_001)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
memberRoutes.post('/', authMiddleware, auditMiddleware({ action: 'MEMBER_ADD', resource: 'member' }), projectRoleMiddleware('owner' as MemberRole), memberController.addMember);
/**
 * @swagger
 * /api/v1/projects/{id}/members/{uid}:
 *   patch:
 *     summary: 变更成员角色(owner)
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 项目 ID
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *         description: 成员用户 ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [owner, editor, viewer] }
 *     responses:
 *       200:
 *         description: 角色已变更
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目或成员不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 不能变更最后的项目 owner(MEMBER_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
memberRoutes.patch('/:uid', authMiddleware, auditMiddleware({ action: 'MEMBER_UPDATE', resource: 'member' }), projectRoleMiddleware('owner' as MemberRole), memberController.updateRole);
/**
 * @swagger
 * /api/v1/projects/{id}/members/{uid}:
 *   delete:
 *     summary: 移除项目成员
 *     tags: [Members]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *         description: 项目 ID
 *       - in: path
 *         name: uid
 *         required: true
 *         schema: { type: string }
 *         description: 成员用户 ID
 *     responses:
 *       200:
 *         description: 成员已移除
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目或成员不存在
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 唯一 owner 不可移除(MEMBER_002/MEMBER_003)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
memberRoutes.delete('/:uid', authMiddleware, auditMiddleware({ action: 'MEMBER_REMOVE', resource: 'member' }), projectRoleMiddleware('viewer' as MemberRole), memberController.removeMember);
