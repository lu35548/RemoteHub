import { Router } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';
import { auditMiddleware, sensitiveAuditMiddleware } from '../middleware/audit';
import { AuditAction } from '../enums/CommonEnums';
import {
  ExportController
} from '../controllers/exportController';

const router = Router();

// 所有导出路由都需要认证
router.use(authenticateToken);

/**
 * @swagger
 * /api/v1/export:
 *   post:
 *     summary: 导出数据
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - format
 *               - entityType
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [json, csv, xlsx]
 *                 description: 导出格式
 *               entityType:
 *                 type: string
 *                 enum: [users, projects, connections, audit-logs]
 *                 description: 要导出的实体类型
 *               filters:
 *                 type: object
 *                 description: 过滤条件
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date
 *                   endDate:
 *                     type: string
 *                     format: date
 *                   status:
 *                     type: string
 *                   role:
 *                     type: string
 *                   search:
 *                     type: string
 *                   isSensitive:
 *                     type: boolean
 *                   isFailure:
 *                     type: boolean
 *               fields:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: 要导出的字段列表
 *               limit:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 10000
 *                 default: 1000
 *                 description: 导出记录数限制
 *     responses:
 *       200:
 *         description: 导出成功，返回文件流
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: 请求参数错误
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 导出失败
 */
// Post / - 导出数据
router.post('/', ExportController.exportData);

/**
 * @swagger
 * /api/v1/export/config:
 *   get:
 *     summary: 获取导出配置
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 成功返回导出配置
 *       401:
 *         description: 未认证
 */
router.get('/config', ExportController.getExportConfig);

/**
 * @swagger
 * /api/v1/export/history:
 *   get:
 *     summary: 获取导出历史
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: 返回记录数限制
 *     responses:
 *       200:
 *         description: 成功返回导出历史
 *       401:
 *         description: 未认证
 */
router.get('/history', ExportController.getExportHistory);

/**
 * @swagger
 * /api/v1/export/preview:
 *   post:
 *     summary: 预览导出数据
 *     tags: [Export]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entityType
 *             properties:
 *               entityType:
 *                 type: string
 *                 enum: [users, projects, connections, audit-logs]
 *                 description: 要预览的实体类型
 *               filters:
 *                 type: object
 *                 description: 过滤条件
 *                 properties:
 *                   startDate:
 *                     type: string
 *                     format: date
 *                   endDate:
 *                     type: string
 *                     format: date
 *                   status:
 *                     type: string
 *                   role:
 *                     type: string
 *                   search:
 *                     type: string
 *               limit:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 100
 *                 default: 10
 *                 description: 预览记录数限制
 *     responses:
 *       200:
 *         description: 成功返回预览数据
 *       400:
 *         description: 请求参数错误
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 预览失败
 */
router.post('/preview', ExportController.previewExportData);

export default router;