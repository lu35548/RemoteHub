import { Router } from 'express';
import { AuditController } from '../controllers/auditController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { UserRole } from '../models/User';

const router = Router();

// Apply authentication to all routes
router.use(authenticateToken);

/**
 * GET /api/v1/audit-logs
 * 获取审计日志列表
 * 管理员可以查看所有日志，普通用户只能查看自己的日志
 */
router.get('/', AuditController.getAuditLogs);

/**
 * GET /api/v1/audit-logs/entity/:entityType/:entityId?
 * 获取特定实体的审计历史
 */
router.get('/entity/:entityType/:entityId?', AuditController.getEntityAuditHistory);

/**
 * GET /api/v1/audit-logs/users/:userId/stats
 * 获取用户活动统计
 */
router.get('/users/:userId/stats', AuditController.getUserActivityStats);

/**
 * GET /api/v1/audit-logs/stats
 * 获取审计日志统计信息（仅管理员）
 */
router.get(
  '/stats',
  requireRole(UserRole.ADMIN),
  AuditController.getAuditStats
);

// 简化审计路由，移除不存在的方法
export default router;