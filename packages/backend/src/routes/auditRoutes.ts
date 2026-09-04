// packages/backend/src/routes/auditRoutes.ts
// 审计查询/导出：admin 专属（读端点，不挂 auditMiddleware——审计只记写端点）。
import { Router, type Router as RouterType } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { roleMiddleware } from '../middleware/role.js';
import * as auditController from '../controllers/auditController.js';

export const auditRoutes: RouterType = Router();

auditRoutes.get('/', authMiddleware, roleMiddleware('admin'), auditController.listAuditLogs);
auditRoutes.get('/export', authMiddleware, roleMiddleware('admin'), auditController.exportAuditLogs);
