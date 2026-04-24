import { Request } from 'express';
import database from '../config/database';
import { AuditLog } from '../models/AuditLog';
import { AuditAction } from '../enums/CommonEnums';
import { logger } from '../utils/logger';

interface RequestWithUser extends Request {
  user?: any;
}

interface AuditContext {
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export class AuditService {
  /**
   * 记录审计日志的通用方法
   */
  public static async createAuditLog(params: {
    action: AuditAction;
    entityType: string;
    entityId?: string;
    entityName?: string;
    description?: string;
    details?: any;
    context?: AuditContext;
    isSensitive?: boolean;
    isFailure?: boolean;
    errorMessage?: string;
    stackTrace?: string;
  }): Promise<AuditLog> {
    try {
      const auditLog = new AuditLog();

      // 设置基本信息
      auditLog.userId = params.context?.userId;
      auditLog.action = params.action;
      auditLog.entityType = params.entityType;
      auditLog.entityId = params.entityId;
      auditLog.entityName = params.entityName;
      auditLog.description = params.description;
      auditLog.details = params.details;

      // 设置上下文信息
      auditLog.ipAddress = params.context?.ipAddress;
      auditLog.userAgent = params.context?.userAgent;
      auditLog.sessionId = params.context?.sessionId;

      // 设置敏感性和失败状态
      auditLog.isSensitive = params.isSensitive || false;
      auditLog.isFailure = params.isFailure || false;
      auditLog.errorMessage = params.errorMessage;
      auditLog.stackTrace = params.stackTrace;

      // 保存到数据库
      const auditLogRepository = database.getRepository(AuditLog);
      const savedLog = await auditLogRepository.save(auditLog);

      // 记录日志
      logger.info('Audit log created', {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        userId: params.context?.userId,
        isFailure: params.isFailure
      });

      return savedLog;
    } catch (error) {
      logger.error('Failed to create audit log:', error);
      // 不抛出错误，避免影响主要业务流程
      throw error;
    }
  }

  /**
   * 从请求中提取审计上下文
   */
  private static extractContext(req: RequestWithUser): AuditContext {
    return {
      userId: req.user?.id,
      sessionId: req.user?.sessionId,
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent']
    };
  }

  /**
   * 记录创建操作
   */
  static async logCreation(
    req: RequestWithUser,
    entityType: string,
    entityId?: string,
    entityName?: string,
    newValues?: any
  ): Promise<AuditLog> {
    const context = this.extractContext(req);

    return this.createAuditLog({
      action: AuditAction.CREATE,
      entityType,
      entityId,
      entityName,
      description: `创建了${entityType}: ${entityName || entityId}`,
      details: {
        newValues: this.sanitizeSensitiveData(newValues),
      },
      context,
      isSensitive: this.isSensitiveEntity(entityType)
    });
  }

  /**
   * 记录更新操作
   */
  static async logUpdate(
    req: RequestWithUser,
    entityType: string,
    entityId?: string,
    entityName?: string,
    oldValues?: any,
    newValues?: any,
    changedFields?: string[]
  ): Promise<AuditLog> {
    const context = this.extractContext(req);

    return this.createAuditLog({
      action: AuditAction.UPDATE,
      entityType,
      entityId,
      entityName,
      description: `更新了${entityType}: ${entityName || entityId}`,
      details: {
        oldValues: this.sanitizeSensitiveData(oldValues),
        newValues: this.sanitizeSensitiveData(newValues),
        changedFields,
      },
      context,
      isSensitive: this.isSensitiveEntity(entityType)
    });
  }

  /**
   * 记录删除操作
   */
  static async logDeletion(
    req: RequestWithUser,
    entityType: string,
    entityId?: string,
    entityName?: string,
    oldValues?: any,
    reason?: string
  ): Promise<AuditLog> {
    const context = this.extractContext(req);

    return this.createAuditLog({
      action: AuditAction.DELETE,
      entityType,
      entityId,
      entityName,
      description: `删除了${entityType}: ${entityName || entityId}`,
      details: {
        oldValues: this.sanitizeSensitiveData(oldValues),
        reason,
      },
      context,
      isSensitive: this.isSensitiveEntity(entityType)
    });
  }

  /**
   * 记录登录操作
   */
  static async logLogin(
    req: RequestWithUser,
    success: boolean,
    userId?: string,
    errorMessage?: string
  ): Promise<AuditLog | null> {
    try {
      const context = this.extractContext(req);
      context.userId = userId; // 登录时可能还没有user对象

      if (success) {
        return this.createAuditLog({
          action: AuditAction.LOGIN,
          entityType: 'auth',
          description: '用户登录成功',
          context
        });
      } else {
        return this.createAuditLog({
          action: AuditAction.LOGIN,
          entityType: 'auth',
          description: '用户登录失败',
          errorMessage,
          isFailure: true,
          context
        });
      }
    } catch (error) {
      logger.error('Failed to log login attempt:', error);
      return null;
    }
  }

  /**
   * 记录登出操作
   */
  static async logLogout(req: RequestWithUser): Promise<AuditLog | null> {
    try {
      const context = this.extractContext(req);

      return this.createAuditLog({
        action: AuditAction.LOGOUT,
        entityType: 'auth',
        description: '用户登出',
        context
      });
    } catch (error) {
      logger.error('Failed to log logout:', error);
      return null;
    }
  }

  /**
   * 记录访问操作
   */
  static async logAccess(
    req: RequestWithUser,
    entityType: string,
    success: boolean,
    entityId?: string,
    entityName?: string,
    errorMessage?: string
  ): Promise<AuditLog | null> {
    try {
      const context = this.extractContext(req);

      return this.createAuditLog({
        action: AuditAction.ACCESS,
        entityType,
        entityId,
        entityName,
        description: success
          ? `访问了${entityType}: ${entityName || entityId}`
          : `访问被拒绝${entityType}: ${entityName || entityId}`,
        isFailure: !success,
        errorMessage,
        context
      });
    } catch (error) {
      logger.error('Failed to log access:', error);
      return null;
    }
  }

  /**
   * 记录导出操作
   */
  static async logExport(
    req: RequestWithUser,
    entityType: string,
    format: string,
    recordCount?: number,
    filters?: any
  ): Promise<AuditLog | null> {
    try {
      const context = this.extractContext(req);

      return this.createAuditLog({
        action: AuditAction.EXPORT,
        entityType,
        description: `导出了${entityType}数据`,
        details: {
          format,
          recordCount,
          filters
        },
        context,
        isSensitive: true // 导出操作通常是敏感的
      });
    } catch (error) {
      logger.error('Failed to log export:', error);
      return null;
    }
  }

  /**
   * 记录导入操作
   */
  static async logImport(
    req: RequestWithUser,
    entityType: string,
    format: string,
    recordCount?: number,
    successCount?: number,
    errors?: any[]
  ): Promise<AuditLog | null> {
    try {
      const context = this.extractContext(req);

      return this.createAuditLog({
        action: AuditAction.IMPORT,
        entityType,
        description: `导入了${entityType}数据`,
        details: {
          format,
          recordCount,
          successCount,
          errorCount: errors?.length || 0,
          errors: errors?.slice(0, 10) // 只保留前10个错误
        },
        context,
        isSensitive: true, // 导入操作通常是敏感的
        isFailure: (successCount || 0) < (recordCount || 0)
      });
    } catch (error) {
      logger.error('Failed to log import:', error);
      return null;
    }
  }

  /**
   * 记录系统操作（无用户上下文）
   */
  static async logSystemAction(
    action: AuditAction,
    entityType: string,
    entityId?: string,
    entityName?: string,
    description?: string,
    details?: any
  ): Promise<AuditLog | null> {
    try {
      return this.createAuditLog({
        action,
        entityType,
        entityId,
        entityName,
        description: description || `系统执行${action}操作: ${entityName || entityId}`,
        details,
        isSensitive: this.isSensitiveEntity(entityType)
      });
    } catch (error) {
      logger.error('Failed to log system action:', error);
      return null;
    }
  }

  /**
   * 获取审计日志列表
   */
  static async getAuditLogs(params: {
    page?: number;
    limit?: number;
    userId?: string;
    action?: AuditAction;
    entityType?: string;
    entityId?: string;
    startDate?: Date;
    endDate?: Date;
    isSensitive?: boolean;
    isFailure?: boolean;
  }) {
    try {
      const auditLogRepository = database.getRepository(AuditLog);
      const queryBuilder = auditLogRepository.createQueryBuilder('audit');

      // 添加过滤条件
      if (params.userId) {
        queryBuilder.andWhere('audit.userId = :userId', { userId: params.userId });
      }

      if (params.action) {
        queryBuilder.andWhere('audit.action = :action', { action: params.action });
      }

      if (params.entityType) {
        queryBuilder.andWhere('audit.entityType = :entityType', { entityType: params.entityType });
      }

      if (params.entityId) {
        queryBuilder.andWhere('audit.entityId = :entityId', { entityId: params.entityId });
      }

      if (params.startDate) {
        queryBuilder.andWhere('audit.createdAt >= :startDate', { startDate: params.startDate });
      }

      if (params.endDate) {
        queryBuilder.andWhere('audit.createdAt <= :endDate', { endDate: params.endDate });
      }

      if (params.isSensitive !== undefined) {
        queryBuilder.andWhere('audit.isSensitive = :isSensitive', { isSensitive: params.isSensitive });
      }

      if (params.isFailure !== undefined) {
        queryBuilder.andWhere('audit.isFailure = :isFailure', { isFailure: params.isFailure });
      }

      // 添加排序
      queryBuilder.orderBy('audit.createdAt', 'DESC');

      // 添加分页
      const page = params.page || 1;
      const limit = Math.min(params.limit || 50, 200); // 最大200条
      const offset = (page - 1) * limit;

      queryBuilder.skip(offset).take(limit);

      // 查询总数和结果
      const [logs, total] = await queryBuilder.getManyAndCount();

      return {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      throw error;
    }
  }

  /**
   * 获取用户活动统计
   */
  static async getUserActivityStats(userId: string, days: number = 30) {
    try {
      const auditLogRepository = database.getRepository(AuditLog);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const stats = await auditLogRepository
        .createQueryBuilder('audit')
        .select('audit.action', 'action')
        .addSelect('COUNT(*)', 'count')
        .where('audit.userId = :userId', { userId })
        .andWhere('audit.createdAt >= :startDate', { startDate })
        .andWhere('audit.isFailure = :isFailure', { isFailure: false })
        .groupBy('audit.action')
        .getRawMany();

      return stats.reduce((acc, stat) => {
        acc[stat.action] = parseInt(stat.count);
        return acc;
      }, {} as Record<string, number>);
    } catch (error) {
      logger.error('Failed to get user activity stats:', error);
      throw error;
    }
  }

  /**
   * 判断实体是否包含敏感信息
   */
  private static isSensitiveEntity(entityType: string): boolean {
    const sensitiveEntities = ['user', 'connection', 'auth'];
    return sensitiveEntities.includes(entityType.toLowerCase());
  }

  /**
   * 清理敏感数据
   */
  private static sanitizeSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sensitiveFields = ['password', 'token', 'secret', 'key', 'credential', 'apiKey'];
    const sanitized = { ...data };

    const sanitizeObject = (obj: any) => {
      for (const key in obj) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
          obj[key] = '[REDACTED]';
        } else if (typeof obj[key] === 'object' && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
    };

    sanitizeObject(sanitized);
    return sanitized;
  }

  /**
   * 清理旧的审计日志（保留指定天数）
   */
  static async cleanupOldLogs(daysToKeep: number = 365): Promise<number> {
    try {
      const auditLogRepository = database.getRepository(AuditLog);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      // 删除非敏感的旧日志
      const result = await auditLogRepository
        .createQueryBuilder()
        .delete()
        .from(AuditLog)
        .where('createdAt < :cutoffDate', { cutoffDate })
        .andWhere('isSensitive = :isSensitive', { isSensitive: false })
        .execute();

      const deletedCount = result.affected || 0;

      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} old audit logs older than ${daysToKeep} days`);
      }

      return deletedCount;
    } catch (error) {
      logger.error('Failed to cleanup old audit logs:', error);
      throw error;
    }
  }

  /**
   * 创建审计中间件
   */
  static createAuditMiddleware() {
    return async (req: RequestWithUser, res: any, next: any) => {
      // 记录原始的res.json方法
      const originalJson = res.json;

      // 重写res.json方法以捕获响应
      res.json = function(data: any) {
        // 只对成功的响应进行审计
        if (res.statusCode >= 200 && res.statusCode < 300 && req.user) {
          const routePath = req.route?.path || req.path;

          // 跳过不需要审计的路径
          const skipAudit = [
            '/api/v1/auth/login',
            '/api/v1/audit-logs'
          ].includes(routePath);

          if (!skipAudit) {
            // 异步记录访问日志
            AuditService.logAccess(
              req,
              'api',
              true,
              undefined,
              routePath
            ).catch(error => {
              logger.error('Failed to log API access:', error);
            });
          }
        }

        // 调用原始的json方法
        return originalJson.call(this, data);
      };

      next();
    };
  }
}