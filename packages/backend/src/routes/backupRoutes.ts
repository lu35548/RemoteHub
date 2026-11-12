// packages/backend/src/routes/backupRoutes.ts
// #38 备份路由（/api/v1/admin/backups）：三端点全部 admin 门禁。
// POST 手动触发为写操作，挂审计 SYSTEM_BACKUP（照 reset-link 先例：auth → audit → role，
// 权限拒绝 403 同样记 failure）；GET 列表/下载为读端点不挂审计（monitoringRoutes 先例）。
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import { auditMiddleware } from '../middleware/audit.js';
import * as backupController from '../controllers/backupController.js';

export const backupRoutes: RouterType = Router();

/**
 * @swagger
 * /api/v1/admin/backups:
 *   post:
 *     summary: 手动触发数据库备份(admin)
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 备份完成(文件名/大小/耗时)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         description: 备份执行失败(BACKUP_003)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
backupRoutes.post(
  '/',
  authMiddleware,
  auditMiddleware({ action: 'SYSTEM_BACKUP', resource: 'system' }),
  roleMiddleware('admin'),
  backupController.triggerBackup,
);
/**
 * @swagger
 * /api/v1/admin/backups:
 *   get:
 *     summary: 备份文件列表(admin)
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 备份文件元信息数组(文件名/大小/时间)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
backupRoutes.get('/', authMiddleware, roleMiddleware('admin'), backupController.listBackupsHandler);
/**
 * @swagger
 * /api/v1/admin/backups/{filename}/download:
 *   get:
 *     summary: 下载备份文件(admin,白名单防遍历)
 *     tags: [Backups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: filename
 *         required: true
 *         schema: { type: string, example: remotehub-2026-11-12.db.gz }
 *     responses:
 *       200:
 *         description: 备份文件二进制流(octet-stream,attachment 下载)
 *         content:
 *           application/octet-stream:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: 文件名不在白名单(BACKUP_001,路径遍历防护)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         description: 备份文件不存在(BACKUP_002)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
backupRoutes.get('/:filename/download', authMiddleware, roleMiddleware('admin'), backupController.downloadBackup);
