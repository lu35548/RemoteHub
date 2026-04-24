import { Router } from 'express';
import { BackupController } from '@/controllers/backupController';
import { authenticateToken } from '@/middleware/auth';
import { body, param } from '@/middleware/validation';

const router = Router();

// 所有备份路由都需要认证和管理员权限
router.use(authenticateToken);

/**
 * @swagger
 * /backup:
 *   post:
 *     summary: 创建数据备份
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               includeUsers:
 *                 type: boolean
 *                 default: true
 *                 description: 是否包含用户数据
 *               includeProjects:
 *                 type: boolean
 *                 default: true
 *                 description: 是否包含项目数据
 *               includeConnections:
 *                 type: boolean
 *                 default: true
 *                 description: 是否包含连接数据
 *               includeAuditLogs:
 *                 type: boolean
 *                 default: true
 *                 description: 是否包含审计日志
 *               compress:
 *                 type: boolean
 *                 default: true
 *                 description: 是否压缩备份
 *               encrypt:
 *                 type: boolean
 *                 default: false
 *                 description: 是否加密备份
 *               encryptionKey:
 *                 type: string
 *                 description: 加密密钥（启用加密时必需）
 *               outputFormat:
 *                 type: string
 *                 enum: [json, sql]
 *                 default: json
 *                 description: 输出格式
 *               description:
 *                 type: string
 *                 description: 备份描述
 *     responses:
 *       200:
 *         description: 备份创建成功
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
 *                     backupId:
 *                       type: string
 *                     metadata:
 *                       $ref: '#/components/schemas/BackupMetadata'
 *                     message:
 *                       type: string
 *       400:
 *         description: 请求参数错误
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.post('/',
  body('encryptionKey').if(body('encrypt').equals(true)).notEmpty().withMessage('启用加密时必须提供加密密钥'),
  BackupController.createBackup
);

/**
 * @swagger
 * /backup:
 *   get:
 *     summary: 获取备份列表
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 备份列表
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
 *                     backups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           fileName:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           size:
 *                             type: integer
 *                           description:
 *                             type: string
 *                           totalRecords:
 *                             type: integer
 *                           entities:
 *                             type: array
 *                             items:
 *                               type: string
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.get('/', BackupController.getBackupList);

/**
 * @swagger
 * /backup/restore:
 *   post:
 *     summary: 从备份恢复数据
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - backupId
 *             properties:
 *               backupId:
 *                 type: string
 *                 description: 备份ID
 *               overwriteExisting:
 *                 type: boolean
 *                 default: false
 *                 description: 是否覆盖现有数据
 *               validateData:
 *                 type: boolean
 *                 default: true
 *                 description: 是否验证数据
 *               encryptionKey:
 *                 type: string
 *                 description: 解密密钥（如果备份已加密）
 *               skipEntities:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [users, projects, connections, auditLogs]
 *                 description: 跳过的实体类型
 *     responses:
 *       200:
 *         description: 数据恢复成功
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
 *                     restoredEntities:
 *                       type: array
 *                       items:
 *                         type: string
 *                     message:
 *                       type: string
 *       400:
 *         description: 请求参数错误
 *       403:
 *         description: 权限不足
 *       404:
 *         description: 备份不存在
 *       500:
 *         description: 服务器错误
 */
router.post('/restore',
  body('backupId').notEmpty().withMessage('备份ID不能为空'),
  BackupController.restoreFromBackup
);

/**
 * @swagger
 * /backup/schedule:
 *   post:
 *     summary: 创建定时备份任务
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - schedule
 *             properties:
 *               schedule:
 *                 type: string
 *                 enum: [daily, weekly, monthly]
 *                 description: 备份频率
 *               includeUsers:
 *                 type: boolean
 *                 default: true
 *               includeProjects:
 *                 type: boolean
 *                 default: true
 *               includeConnections:
 *                 type: boolean
 *                 default: true
 *               includeAuditLogs:
 *                 type: boolean
 *                 default: true
 *               compress:
 *                 type: boolean
 *                 default: true
 *               encrypt:
 *                 type: boolean
 *                 default: false
 *               encryptionKey:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: 备份计划创建成功
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
 *                     scheduleId:
 *                       type: string
 *                     message:
 *                       type: string
 *       400:
 *         description: 请求参数错误
 *       403:
 *         description: 权限不足
 *       500:
 *         description: 服务器错误
 */
router.post('/schedule',
  body('schedule').isIn(['daily', 'weekly', 'monthly']).withMessage('无效的备份计划'),
  body('encryptionKey').if(body('encrypt').equals(true)).notEmpty().withMessage('启用加密时必须提供加密密钥'),
  BackupController.scheduleBackup
);

/**
 * @swagger
 * /backup/{backupId}:
 *   get:
 *     summary: 获取备份详情
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *         description: 备份ID
 *     responses:
 *       200:
 *         description: 备份详情
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
 *                     id:
 *                       type: string
 *                     fileName:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     size:
 *                       type: integer
 *                     metadata:
 *                       $ref: '#/components/schemas/BackupMetadata'
 *       400:
 *         description: 请求参数错误
 *       403:
 *         description: 权限不足
 *       404:
 *         description: 备份不存在
 *       500:
 *         description: 服务器错误
 */
router.get('/:backupId',
  param('backupId').notEmpty().withMessage('备份ID不能为空'),
  BackupController.getBackupDetails
);

/**
 * @swagger
 * /backup/{backupId}/download:
 *   get:
 *     summary: 下载备份文件
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *         description: 备份ID
 *     responses:
 *       200:
 *         description: 备份文件
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: 请求参数错误
 *       403:
 *         description: 权限不足
 *       404:
 *         description: 备份不存在
 *       500:
 *         description: 服务器错误
 */
router.get('/:backupId/download',
  param('backupId').notEmpty().withMessage('备份ID不能为空'),
  BackupController.downloadBackup
);

/**
 * @swagger
 * /backup/{backupId}:
 *   delete:
 *     summary: 删除备份
 *     tags: [Backup]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: backupId
 *         required: true
 *         schema:
 *           type: string
 *         description: 备份ID
 *     responses:
 *       200:
 *         description: 备份删除成功
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
 *       403:
 *         description: 权限不足
 *       404:
 *         description: 备份不存在
 *       500:
 *         description: 服务器错误
 */
router.delete('/:backupId',
  param('backupId').notEmpty().withMessage('备份ID不能为空'),
  BackupController.deleteBackup
);

export default router;