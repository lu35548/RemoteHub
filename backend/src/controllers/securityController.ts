import { Request, Response } from 'express';
import { SecurityMonitoringService } from '@/services/securityMonitoringService';
import { logger } from '@/utils/logger';
import { requireRole } from '@/middleware/auth';

interface RequestWithUser extends Request {
  user?: any;
}

export class SecurityController {
  /**
   * 获取安全事件列表
   */
  static async getSecurityEvents(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以查看安全事件
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法查看安全事件',
          },
        });
        return;
      }

      const {
        startDate,
        endDate,
        type,
        severity,
        ipAddress,
        userId,
        limit = 50,
        offset = 0,
      } = req.query;

      const filters: any = {
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
      };

      if (startDate) {
        filters.startDate = new Date(startDate as string);
      }

      if (endDate) {
        filters.endDate = new Date(endDate as string);
      }

      if (type) {
        filters.type = type;
      }

      if (severity) {
        filters.severity = severity;
      }

      if (ipAddress) {
        filters.ipAddress = ipAddress;
      }

      if (userId) {
        filters.userId = userId;
      }

      const { events, total } = await SecurityMonitoringService.getSecurityEvents(filters);

      res.json({
        success: true,
        data: {
          events,
          pagination: {
            total,
            limit: filters.limit,
            offset: filters.offset,
            hasMore: total > filters.offset + filters.limit,
          },
        },
      });

    } catch (error: any) {
      logger.error('获取安全事件失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: '获取安全事件失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 获取安全统计
   */
  static async getSecurityStatistics(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以查看安全统计
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法查看安全统计',
          },
        });
        return;
      }

      const statistics = await SecurityMonitoringService.getSecurityStatistics();

      res.json({
        success: true,
        data: statistics,
      });

    } catch (error: any) {
      logger.error('获取安全统计失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: '获取安全统计失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 解决安全事件
   */
  static async resolveSecurityEvent(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以解决安全事件
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法解决安全事件',
          },
        });
        return;
      }

      const { eventId } = req.params;
      const { notes } = req.body;

      if (!eventId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_EVENT_ID',
            message: '缺少事件ID',
          },
        });
        return;
      }

      const success = await SecurityMonitoringService.resolveEvent(
        eventId,
        req.user.id,
        notes
      );

      if (!success) {
        res.status(404).json({
          success: false,
          error: {
            code: 'EVENT_NOT_FOUND',
            message: '安全事件不存在',
          },
        });
        return;
      }

      res.json({
        success: true,
        message: '安全事件已标记为解决',
      });

    } catch (error: any) {
      logger.error('解决安全事件失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: '解决安全事件失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 获取IP风险评分
   */
  static async getIPRiskScore(req: Request, res: Response): Promise<void> {
    try {
      const { ipAddress } = req.params;

      if (!ipAddress) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_IP_ADDRESS',
            message: '缺少IP地址',
          },
        });
        return;
      }

      const riskScore = await SecurityMonitoringService.getIPRiskScore(ipAddress);

      res.json({
        success: true,
        data: riskScore,
      });

    } catch (error: any) {
      logger.error('获取IP风险评分失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: '获取IP风险评分失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 执行安全检查
   */
  static async performSecurityCheck(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以执行安全检查
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法执行安全检查',
          },
        });
        return;
      }

      const checkResult = await SecurityMonitoringService.performSecurityCheck();

      res.json({
        success: true,
        data: checkResult,
      });

    } catch (error: any) {
      logger.error('执行安全检查失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: '执行安全检查失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 记录安全事件（手动）
   */
  static async recordSecurityEvent(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以手动记录安全事件
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法记录安全事件',
          },
        });
        return;
      }

      const { type, severity, details } = req.body;

      if (!type || !severity) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_REQUIRED_FIELDS',
            message: '缺少必填字段：type, severity',
          },
        });
        return;
      }

      const eventId = await SecurityMonitoringService.recordSecurityEvent(
        type,
        severity,
        req,
        details
      );

      res.json({
        success: true,
        data: {
          eventId,
          message: '安全事件已记录',
        },
      });

    } catch (error: any) {
      logger.error('记录安全事件失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: '记录安全事件失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 清理旧安全事件
   */
  static async cleanupOldEvents(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以清理安全事件
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法清理安全事件',
          },
        });
        return;
      }

      const { olderThanDays = 30 } = req.body;

      SecurityMonitoringService.cleanupOldEvents(parseInt(olderThanDays));

      res.json({
        success: true,
        message: `已清理${olderThanDays}天前的安全事件`,
      });

    } catch (error: any) {
      logger.error('清理安全事件失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: '清理安全事件失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 获取安全仪表板数据
   */
  static async getSecurityDashboard(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以查看安全仪表板
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法查看安全仪表板',
          },
        });
        return;
      }

      const [statistics, securityCheck] = await Promise.all([
        SecurityMonitoringService.getSecurityStatistics(),
        SecurityMonitoringService.performSecurityCheck(),
      ]);

      // 获取最近的安全事件
      const { events: recentEvents } = await SecurityMonitoringService.getSecurityEvents({
        limit: 10,
      });

      const dashboard = {
        overview: {
          status: securityCheck.status,
          totalEvents: statistics.totalEvents,
          eventsToday: statistics.eventsToday,
          criticalEvents: statistics.eventsBySeverity.critical,
          highEvents: statistics.eventsBySeverity.high,
        },
        statistics,
        recentEvents,
        issues: securityCheck.issues,
      };

      res.json({
        success: true,
        data: dashboard,
      });

    } catch (error: any) {
      logger.error('获取安全仪表板失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: '获取安全仪表板失败',
          details: error.message,
        },
      });
    }
  }
}