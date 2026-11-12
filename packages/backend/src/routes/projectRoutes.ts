// packages/backend/src/routes/projectRoutes.ts
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { projectRoleMiddleware } from '../middleware/projectRole.js';
import { auditMiddleware } from '../middleware/audit.js';
import * as projectController from '../controllers/projectController.js';
import * as connectionController from '../controllers/connectionController.js';
import type { MemberRole } from '@remotehub/shared';

export const projectRoutes: RouterType = Router();

/**
 * @swagger
 * /api/v1/projects:
 *   get:
 *     summary: 我可见的项目列表(分页,含归档折叠参数)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pageSize
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: archived
 *         schema: { type: string, enum: [true, false, all] }
 *         description: 归档过滤(票 #48 归档折叠视图)
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: 名称模糊搜索
 *     responses:
 *       200:
 *         description: 项目分页列表
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
projectRoutes.get('/', authMiddleware, projectController.listProjects);
/**
 * @swagger
 * /api/v1/projects:
 *   post:
 *     summary: 创建项目
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, description: 全局唯一名称 }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: 项目已创建
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       409:
 *         description: 项目名冲突(PROJ_001)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
projectRoutes.post('/', authMiddleware, auditMiddleware({ action: 'PROJECT_CREATE', resource: 'project' }), projectController.createProject);
/**
 * @swagger
 * /api/v1/projects/{id}:
 *   get:
 *     summary: 项目详情(viewer)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 项目详情(含我的角色)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目不存在(PROJ_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
projectRoutes.get('/:id', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), projectController.getProject);
// #41 连接金矿：项目连接统计（admin/项目成员含 viewer 可见）
/**
 * @swagger
 * /api/v1/projects/{id}/connections/stats:
 *   get:
 *     summary: 项目连接统计(viewer,票 #41 连接金矿)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 连接统计(按协议/VPN 依赖分布)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目不存在(PROJ_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
projectRoutes.get('/:id/connections/stats', authMiddleware, projectRoleMiddleware('viewer' as MemberRole), connectionController.getProjectConnectionStats);
/**
 * @swagger
 * /api/v1/projects/{id}:
 *   patch:
 *     summary: 更新项目(editor)
 *     tags: [Projects]
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
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *     responses:
 *       200:
 *         description: 更新后的项目
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目不存在(PROJ_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 项目名冲突(PROJ_001)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         $ref: '#/components/responses/ValidationError'
 */
projectRoutes.patch('/:id', authMiddleware, auditMiddleware({ action: 'PROJECT_UPDATE', resource: 'project' }), projectRoleMiddleware('editor' as MemberRole), projectController.updateProject);
/**
 * @swagger
 * /api/v1/projects/{id}:
 *   delete:
 *     summary: 删除项目(owner)
 *     tags: [Projects]
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
 *         description: 项目不存在(PROJ_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
projectRoutes.delete('/:id', authMiddleware, auditMiddleware({ action: 'PROJECT_DELETE', resource: 'project' }), projectRoleMiddleware('owner' as MemberRole), projectController.deleteProject);
// ─── #47 项目管理增强 ───
// 归档/恢复/复制/转让权限门=owner（全局 admin 在 projectRoleMiddleware 直通）——design §17 权限矩阵
// （duplicate/archive/activate/batch/transfer = owner+admin）。「写权同门(editor)」口径被 §17 原文压过，报告注明。
// 批量归档不挂 auditMiddleware：逐项目审计行在 service 事务内程序化落行（envelope 单请求单行无法逐项目 resourceId）
/**
 * @swagger
 * /api/v1/projects/batch-archive:
 *   post:
 *     summary: 批量归档项目(owner,逐项目审计落行)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [ids]
 *             properties:
 *               ids:
 *                 type: array
 *                 items: { type: string }
 *                 description: 项目 ID 列表
 *     responses:
 *       200:
 *         description: 批量归档结果(成功/跳过明细)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目不存在(PROJ_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
projectRoutes.post('/batch-archive', authMiddleware, projectController.batchArchiveProjects);
/**
 * @swagger
 * /api/v1/projects/{id}/archive:
 *   post:
 *     summary: 归档项目(owner,票 #48)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 已归档(status=archived)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目不存在(PROJ_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
projectRoutes.post('/:id/archive', authMiddleware, auditMiddleware({ action: 'PROJECT_ARCHIVE', resource: 'project' }), projectRoleMiddleware('owner' as MemberRole), projectController.archiveProject);
/**
 * @swagger
 * /api/v1/projects/{id}/restore:
 *   post:
 *     summary: 恢复归档项目(owner,票 #48)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: 已恢复
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目不存在(PROJ_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
projectRoutes.post('/:id/restore', authMiddleware, auditMiddleware({ action: 'PROJECT_RESTORE', resource: 'project' }), projectRoleMiddleware('owner' as MemberRole), projectController.restoreProject);
/**
 * @swagger
 * /api/v1/projects/{id}/copy:
 *   post:
 *     summary: 复制项目(owner,票 #48;连接含密文原样搬运)
 *     tags: [Projects]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, description: 新项目名(默认"原名 (副本)") }
 *     responses:
 *       201:
 *         description: 复制成功(返回新项目)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目不存在(PROJ_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: 新项目名冲突(PROJ_001)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
projectRoutes.post('/:id/copy', authMiddleware, auditMiddleware({ action: 'PROJECT_COPY', resource: 'project' }), projectRoleMiddleware('owner' as MemberRole), projectController.copyProject);
/**
 * @swagger
 * /api/v1/projects/{id}/transfer-ownership:
 *   post:
 *     summary: 转让项目所有权(owner,票 #48)
 *     tags: [Projects]
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
 *           schema:
 *             type: object
 *             required: [userId]
 *             properties:
 *               userId: { type: string, description: 受让人用户 ID(须为项目成员) }
 *     responses:
 *       200:
 *         description: 所有权已转让(原 owner 降级角色)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 项目或目标用户不存在(PROJ_002/USER_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
projectRoutes.post('/:id/transfer-ownership', authMiddleware, auditMiddleware({ action: 'PROJECT_TRANSFER', resource: 'project' }), projectRoleMiddleware('owner' as MemberRole), projectController.transferProjectOwnership);
