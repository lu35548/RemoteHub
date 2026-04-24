import { Request, Response } from 'express';
import { MonitoringService } from '@/services/monitoringService';
import { logger } from '@/utils/logger';

interface RequestWithUser extends Request {
  user?: any;
}

export class MonitoringController {
  /**
   * 基础健康检查端点
   */
  static async basicHealthCheck(req: Request, res: Response): Promise<void> {
    try {
      const uptime = process.uptime();
      const timestamp = new Date();

      res.json({
        status: 'OK',
        timestamp: timestamp.toISOString(),
        uptime: Math.floor(uptime),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
      });

    } catch (error: any) {
      logger.error('基础健康检查失败:', error);
      res.status(503).json({
        status: 'ERROR',
        timestamp: new Date().toISOString(),
        error: 'Health check failed',
      });
    }
  }

  /**
   * 详细健康检查
   */
  static async detailedHealthCheck(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以查看详细的健康检查
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法查看详细健康检查',
          },
        });
        return;
      }

      const healthResult = await MonitoringService.performHealthCheck();

      // 根据健康状态设置HTTP状态码
      let statusCode = 200;
      if (healthResult.status === 'degraded') {
        statusCode = 200; // 仍然可访问，但性能下降
      } else if (healthResult.status === 'unhealthy') {
        statusCode = 503;
      }

      res.status(statusCode).json({
        success: true,
        data: healthResult,
      });

    } catch (error: any) {
      logger.error('详细健康检查失败:', error);
      res.status(503).json({
        success: false,
        error: {
          code: 'HEALTH_CHECK_FAILED',
          message: '健康检查失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 获取系统指标
   */
  static async getSystemMetrics(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以查看系统指标
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法查看系统指标',
          },
        });
        return;
      }

      const metrics = await MonitoringService.getSystemMetrics();

      res.json({
        success: true,
        data: metrics,
      });

    } catch (error: any) {
      logger.error('获取系统指标失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'METRICS_RETRIEVAL_FAILED',
          message: '获取系统指标失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 获取数据库指标
   */
  static async getDatabaseMetrics(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以查看数据库指标
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法查看数据库指标',
          },
        });
        return;
      }

      const metrics = await MonitoringService.getDatabaseMetrics();

      res.json({
        success: true,
        data: metrics,
      });

    } catch (error: any) {
      logger.error('获取数据库指标失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'DATABASE_METRICS_FAILED',
          message: '获取数据库指标失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 获取应用指标
   */
  static async getApplicationMetrics(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以查看应用指标
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法查看应用指标',
          },
        });
        return;
      }

      const metrics = MonitoringService.getApplicationMetrics();

      res.json({
        success: true,
        data: metrics,
      });

    } catch (error: any) {
      logger.error('获取应用指标失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'APPLICATION_METRICS_FAILED',
          message: '获取应用指标失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 获取性能报告
   */
  static async getPerformanceReport(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以查看性能报告
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法查看性能报告',
          },
        });
        return;
      }

      const report = MonitoringService.getPerformanceReport();

      res.json({
        success: true,
        data: report,
      });

    } catch (error: any) {
      logger.error('获取性能报告失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'PERFORMANCE_REPORT_FAILED',
          message: '获取性能报告失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 清理旧指标数据
   */
  static async cleanupMetrics(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以清理指标数据
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法清理指标数据',
          },
        });
        return;
      }

      const { olderThanHours = 24 } = req.body;

      MonitoringService.cleanupMetrics(parseInt(olderThanHours));

      res.json({
        success: true,
        message: `${olderThanHours}小时前的指标数据已清理`,
      });

    } catch (error: any) {
      logger.error('清理指标数据失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'METRICS_CLEANUP_FAILED',
          message: '清理指标数据失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 记录请求指标（中间件）
   */
  static requestMetricsMiddleware(req: Request, res: Response, next: Function): void {
    const startTime = Date.now();

    // 监听响应完成事件
    res.on('finish', () => {
      const responseTime = Date.now() - startTime;
      MonitoringService.recordRequest(
        req.method,
        req.path,
        res.statusCode,
        responseTime
      );
    });

    next();
  }

  /**
   * 记录错误指标
   */
  static recordErrorMetrics(error: Error, req?: Request): void {
    MonitoringService.recordError(error, req);
  }

  /**
   * Liveness探针（Kubernetes）
   */
  static async livenessProbe(req: Request, res: Response): Promise<void> {
    try {
      // 简单的存活检查，确认应用进程正在运行
      const uptime = process.uptime();

      res.status(200).json({
        status: 'alive',
        uptime: Math.floor(uptime),
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('存活探针失败:', error);
      res.status(500).json({
        status: 'dead',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Readiness探针（Kubernetes）
   */
  static async readinessProbe(req: Request, res: Response): Promise<void> {
    try {
      // 检查应用是否准备好接收流量
      const startTime = Date.now();

      // 测试数据库连接
      const services = require('./container').getServices();
      await services.database.query('SELECT 1');

      const responseTime = Date.now() - startTime;

      // 如果响应时间太长，认为未就绪
      if (responseTime > 5000) {
        res.status(503).json({
          status: 'not ready',
          reason: 'Database response time too high',
          responseTime,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      res.status(200).json({
        status: 'ready',
        responseTime,
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('就绪探针失败:', error);
      res.status(503).json({
        status: 'not ready',
        reason: 'Database connection failed',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Startup探针（Kubernetes）
   */
  static async startupProbe(req: Request, res: Response): Promise<void> {
    try {
      // 检查应用是否已完成启动
      const uptime = process.uptime();

      // 如果应用运行时间少于30秒，认为仍在启动中
      if (uptime < 30) {
        res.status(503).json({
          status: 'starting',
          uptime: Math.floor(uptime),
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // 执行基本健康检查
      await MonitoringService.performHealthCheck();

      res.status(200).json({
        status: 'started',
        uptime: Math.floor(uptime),
        timestamp: new Date().toISOString(),
      });

    } catch (error: any) {
      logger.error('启动探针失败:', error);
      res.status(503).json({
        status: 'starting',
        error: error.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
}