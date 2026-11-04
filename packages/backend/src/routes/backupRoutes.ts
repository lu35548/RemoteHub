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

backupRoutes.post(
  '/',
  authMiddleware,
  auditMiddleware({ action: 'SYSTEM_BACKUP', resource: 'system' }),
  roleMiddleware('admin'),
  backupController.triggerBackup,
);
backupRoutes.get('/', authMiddleware, roleMiddleware('admin'), backupController.listBackupsHandler);
backupRoutes.get('/:filename/download', authMiddleware, roleMiddleware('admin'), backupController.downloadBackup);
