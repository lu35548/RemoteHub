// packages/backend/src/routes/auditRoutes.ts
// 审计查询/导出：admin 专属（读端点，不挂 auditMiddleware——审计只记写端点）。
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import * as auditController from '../controllers/auditController.js';

export const auditRoutes: RouterType = Router();

/**
 * @swagger
 * /api/v1/audit-logs:
 *   get:
 *     summary: 审计日志列表(分页,admin)
 *     tags: [Audit]
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
 *         name: action
 *         schema: { type: string, example: AUTH_LOGIN }
 *       - in: query
 *         name: resource
 *         schema: { type: string, enum: [security, user, project, connection, member, system] }
 *       - in: query
 *         name: result
 *         schema: { type: string, enum: [success, failure] }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, description: ISO 日期 }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, description: ISO 日期 }
 *     responses:
 *       200:
 *         description: 审计日志分页列表
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PaginatedSuccess'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
auditRoutes.get('/', authMiddleware, roleMiddleware('admin'), auditController.listAuditLogs);
/**
 * @swagger
 * /api/v1/audit-logs/export:
 *   get:
 *     summary: 审计日志导出 CSV(admin)
 *     tags: [Audit]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: action
 *         schema: { type: string, example: AUTH_LOGIN }
 *       - in: query
 *         name: resource
 *         schema: { type: string, enum: [security, user, project, connection, member, system] }
 *       - in: query
 *         name: result
 *         schema: { type: string, enum: [success, failure] }
 *       - in: query
 *         name: userId
 *         schema: { type: string }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, description: ISO 日期 }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, description: ISO 日期 }
 *     responses:
 *       200:
 *         description: CSV 文件流(text/csv,attachment 下载)
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: 查询参数无效(AUDIT_001)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: 导出失败(AUDIT_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
auditRoutes.get('/export', authMiddleware, roleMiddleware('admin'), auditController.exportAuditLogs);
