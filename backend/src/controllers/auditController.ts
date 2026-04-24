import { Request, Response } from 'express';
import { AuditService } from '../services/auditService';
import { AuditAction } from '../enums/CommonEnums';
import { logger } from '../utils/logger';

interface RequestWithUser extends Request {
  user?: any;
}

export class AuditController {
  /**
   * 获取审计日志列表
   */
  static async getAuditLogs(req: RequestWithUser, res: Response) {
    try {
      // 只有管理员可以查看所有审计日志
      if (req.user?.role !== 'admin') {
        // 普通用户只能查看自己的日志
        const userId = req.user?.id;
        const logs = await AuditService.getAuditLogs({
          userId,
          page: parseInt(req.query.page as string) || 1,
          limit: parseInt(req.query.limit as string) || 20
        });

        return res.status(200).json({
          success: true,
          data: logs
        });
      }

      // 管理员可以查看所有日志
      const {
        page = 1,
        limit = 50,
        userId,
        action,
        entityType,
        entityId,
        startDate,
        endDate,
        isSensitive,
        isFailure
      } = req.query;

      const logs = await AuditService.getAuditLogs({
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        userId: userId as string,
        action: action as AuditAction,
        entityType: entityType as string,
        entityId: entityId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        isSensitive: isSensitive === 'true' ? true : isSensitive === 'false' ? false : undefined,
        isFailure: isFailure === 'true' ? true : isFailure === 'false' ? false : undefined
      });

      res.status(200).json({
        success: true,
        data: logs
      });
    } catch (error) {
      logger.error('获取审计日志失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取审计日志失败'
        }
      });
    }
  }

  /**
   * 获取实体审计历史
   */
  static async getEntityAuditHistory(req: Request, res: Response) {
    try {
      const { entityType, entityId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!entityType) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: '实体类型是必需的'
          }
        });
      }

      const logs = await AuditService.getAuditLogs({
        page,
        limit,
        entityType,
        entityId
      });

      res.status(200).json({
        success: true,
        data: logs
      });
    } catch (error) {
      logger.error('获取实体审计历史失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取审计历史失败'
        }
      });
    }
  }

  /**
   * 获取用户活动统计
   */
  static async getUserActivityStats(req: Request, res: Response) {
    try {
      const { userId } = req.params;
      const days = parseInt(req.query.days as string) || 30;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: '用户ID是必需的'
          }
        });
      }

      // 检查权限：用户只能查看自己的统计，管理员可以查看所有用户
      if (req.user?.role !== 'admin' && req.user?.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '没有权限查看该用户的活动统计'
          }
        });
      }

      const stats = await AuditService.getUserActivityStats(userId, days);

      res.status(200).json({
        success: true,
        data: {
          userId,
          days,
          stats
        }
      });
    } catch (error) {
      logger.error('获取用户活动统计失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取用户活动统计失败'
        }
      });
    }
  }

  /**
   * 获取系统审计统计
   */
  static async getAuditStats(req: Request, res: Response) {
    try {
      // 只有管理员可以查看统计信息
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '只有管理员可以查看审计统计'
          }
        });
      }

      const days = parseInt(req.query.days as string) || 7;
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // 获取各种统计数据
      const [
        totalLogs,
        successLogs,
        failureLogs,
        sensitiveLogs,
        actionStats,
        entityTypeStats
      ] = await Promise.all([
        AuditService.getAuditLogs({ startDate, endDate, limit: 1 }),
        AuditService.getAuditLogs({ startDate, endDate, isFailure: false, limit: 1 }),
        AuditService.getAuditLogs({ startDate, endDate, isFailure: true, limit: 1 }),
        AuditService.getAuditLogs({ startDate, endDate, isSensitive: true, limit: 1 }),
          // 获取按操作类型分组的统计（这里简化处理）
          Promise.resolve({}),
          // 获取按实体类型分组的统计（这里简化处理）
          Promise.resolve({})
      ]);

      res.status(200).json({
        success: true,
        data: {
          period: {
            days,
            startDate,
            endDate
          },
          summary: {
            total: totalLogs.pagination.total,
            success: successLogs.pagination.total,
            failure: failureLogs.pagination.total,
            sensitive: sensitiveLogs.pagination.total
          },
          trends: {
            // 这里可以添加趋势数据
          }
        }
      });
    } catch (error) {
      logger.error('获取审计统计失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取审计统计失败'
        }
      });
    }
  }

  /**
   * 导出审计日志
   */
  static async exportAuditLogs(req: Request, res: Response) {
    try {
      // 只有管理员可以导出审计日志
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '只有管理员可以导出审计日志'
          }
        });
      }

      const {
        format = 'json',
        action,
        entityType,
        entityId,
        startDate,
        endDate,
        isSensitive,
        isFailure
      } = req.query;

      // 获取所有匹配的日志（不分页）
      const logs = await AuditService.getAuditLogs({
        action: action as AuditAction,
        entityType: entityType as string,
        entityId: entityId as string,
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        isSensitive: isSensitive === 'true' ? true : isSensitive === 'false' ? false : undefined,
        isFailure: isFailure === 'true' ? true : isFailure === 'false' ? false : undefined,
        limit: 10000 // 最大导出10000条
      });

      // 记录导出操作
      await AuditService.logExport(
        req as RequestWithUser,
        'audit_log',
        format as string,
        logs.pagination.total,
        {
          action,
          entityType,
          entityId,
          startDate,
          endDate
        }
      );

      // 根据格式返回数据
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.csv"`);

        // 简化的CSV导出
        const csvHeaders = [
          'Date', 'Action', 'User', 'Entity Type', 'Entity ID',
          'Entity Name', 'Description', 'IP Address', 'User Agent', 'Is Failure'
        ];

        const csvRows = logs.logs.map(log => [
          log.createdAt.toISOString(),
          log.action,
          log.user?.email || 'System',
          log.entityType,
          log.entityId || '',
          log.entityName || '',
          log.description || '',
          log.ipAddress || '',
          log.userAgent || '',
          log.isFailure ? 'Yes' : 'No'
        ]);

        const csvContent = [csvHeaders, ...csvRows].map(row => row.join(',')).join('\n');
        res.send(csvContent);
      } else {
        // JSON格式
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="audit_logs_${new Date().toISOString().split('T')[0]}.json"`);
        res.json({
          success: true,
          data: logs.logs,
          pagination: logs.pagination,
          exportedAt: new Date().toISOString(),
          exportedBy: req.user?.email
        });
      }
    } catch (error) {
      logger.error('导出审计日志失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '导出审计日志失败'
        }
      });
    }
  }

  /**
   * 清理旧的审计日志
   */
  static async cleanupAuditLogs(req: Request, res: Response) {
    try {
      // 只有管理员可以清理审计日志
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: '只有管理员可以清理审计日志'
          }
        });
      }

      const daysToKeep = parseInt(req.body.daysToKeep as string) || 365;

      if (daysToKeep < 30) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: '审计日志至少保留30天'
          }
        });
      }

      const deletedCount = await AuditService.cleanupOldLogs(daysToKeep);

      // 记录清理操作
      await AuditService.logSystemAction(
        AuditAction.DELETE,
        'audit_log',
        undefined,
        undefined,
        `清理了${daysToKeep}天前的审计日志`,
        {
          deletedCount,
          daysToKeep,
          performedBy: req.user?.email
        }
      );

      res.status(200).json({
        success: true,
        message: `成功清理了${deletedCount}条旧审计日志`,
        data: {
          deletedCount,
          daysToKeep,
          performedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('清理审计日志失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '清理审计日志失败'
        }
      });
    }
  }

  /**
   * 获取审计配置信息
   */
  static async getAuditConfig(req: Request, res: Response) {
    try {
      // 返回审计相关的配置信息
      const config = {
        logLevels: ['info', 'warn', 'error', 'debug'],
        sensitiveFields: ['password', 'token', 'secret', 'key', 'credential', 'apiKey'],
        defaultRetentionDays: 365,
        minimumRetentionDays: 30,
        supportedExportFormats: ['json', 'csv'],
        maxExportRecords: 10000,
        autoCleanupEnabled: process.env.AUDIT_AUTO_CLEANUP === 'true',
        auditMiddlewareEnabled: process.env.AUDIT_MIDDLEWARE_ENABLED === 'true'
      };

      res.status(200).json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('获取审计配置失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取审计配置失败'
        }
      });
    }
  }
}