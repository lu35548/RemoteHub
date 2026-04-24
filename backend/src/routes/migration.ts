/**
 * 数据迁移路由
 * 提供localStorage到数据库的迁移API端点
 */

import { Router } from 'express';
import { MigrationController } from '@/controllers/migrationController';
import { authenticateToken } from '@/middleware/auth';
import { auditMiddleware } from '@/middleware/audit';
import { validateRequest, body } from '@/middleware/validation';
// Mock multer implementation for development
const mockUpload = {
  single: (fieldName: string) => {
    return (req: any, res: any, next: any) => {
      // 对于Mock实现，假设数据已经在req.body中
      if (req.body.connections) {
        // 创建一个虚拟的file对象
        req.file = {
          fieldname: fieldName,
          originalname: 'mock-upload.json',
          encoding: '7bit',
          mimetype: 'application/json',
          size: JSON.stringify(req.body.connections).length,
          buffer: Buffer.from(JSON.stringify(req.body.connections))
        };
      }
      next();
    };
  }
};

const router = Router();
const migrationController = new MigrationController();

// 应用认证中间件
router.use(authenticateToken);

// 应用审计中间件
router.use(auditMiddleware({
  action: 'migration' as any,
  entityType: 'data',
  description: 'Data migration operations'
}));

/**
 * @route GET /api/v1/migration/info
 * @desc 获取迁移工具信息和使用说明
 * @access Private
 */
router.get('/info', migrationController.getMigrationInfo);

/**
 * @route GET /api/v1/migration/history
 * @desc 获取用户迁移历史记录
 * @access Private
 */
router.get('/history', migrationController.getMigrationHistory);

/**
 * @route POST /api/v1/migration/validate
 * @desc 验证迁移数据的有效性
 * @access Private
 */
router.post('/validate', validateRequest([
  body('connections')
    .isArray({ min: 1 })
    .withMessage('连接数据不能为空且必须是数组'),
  body('connections.*.name')
    .notEmpty()
    .withMessage('连接名称不能为空'),
  body('connections.*.host')
    .notEmpty()
    .withMessage('主机地址不能为空'),
  body('connections.*.protocol')
    .notEmpty()
    .withMessage('协议类型不能为空'),
  body('userId')
    .notEmpty()
    .withMessage('用户ID不能为空')
]), migrationController.validateMigrationData);

/**
 * @route POST /api/v1/migration/execute
 * @desc 执行数据迁移
 * @access Private
 */
router.post('/execute', validateRequest([
  body('connections')
    .isArray({ min: 1 })
    .withMessage('连接数据不能为空且必须是数组'),
  body('connections.*.name')
    .notEmpty()
    .withMessage('连接名称不能为空'),
  body('connections.*.host')
    .notEmpty()
    .withMessage('主机地址不能为空'),
  body('connections.*.protocol')
    .notEmpty()
    .withMessage('协议类型不能为空'),
  body('userId')
    .notEmpty()
    .withMessage('用户ID不能为空'),
  body('overwriteExisting')
    .optional()
    .isBoolean()
    .withMessage('overwriteExisting必须是布尔值'),
  body('skipPasswords')
    .optional()
    .isBoolean()
    .withMessage('skipPasswords必须是布尔值'),
  body('batchSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('batchSize必须是1-100之间的整数')
]), migrationController.executeMigration);

/**
 * @route POST /api/v1/migration/upload
 * @desc 上传迁移文件
 * @access Private
 */
router.post('/upload', mockUpload.single('file'), migrationController.uploadMigrationFile);

export default router;