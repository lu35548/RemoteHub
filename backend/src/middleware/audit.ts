import { Request, Response, NextFunction } from 'express';
import { AuditService } from '../services/auditService';
import { AuditAction } from '../enums/CommonEnums';
import { logger } from '../utils/logger';

interface RequestWithUser extends Request {
  user?: any;
}

interface AuditOptions {
  action: AuditAction;
  entityType: string;
  entityId?: string | ((req: any) => string);
  entityName?: string;
  description?: string;
  oldValues?: any;
  newValues?: any;
  changedFields?: string[];
  reason?: string;
  isSensitive?: boolean;
}

/**
 * 审计中间件工厂函数
 * 用于自动记录CRUD操作的审计日志
 */
export const auditMiddleware = (options: AuditOptions) => {
  return async (req: RequestWithUser, res: Response, next: NextFunction) => {
    // 在处理请求前保存原始的json方法
    const originalJson = res.json;
    let statusCode: number;
    let responseData: any;

    // 重写res.json以捕获响应
    res.json = function(data: any) {
      statusCode = res.statusCode;
      responseData = data;
      return originalJson.call(this, data);
    };

    // 继续处理请求
    await next();

    // 在响应后记录审计日志
    setImmediate(async () => {
      try {
        // 只对成功的请求进行审计（2xx状态码）
        if (statusCode >= 200 && statusCode < 300 && req.user) {
          const entityId = typeof options.entityId === 'function'
            ? options.entityId(req)
            : options.entityId || req.params.id || req.body?.id;

          await AuditService.createAuditLog({
            action: options.action,
            entityType: options.entityType,
            entityId,
            entityName: options.entityName,
            description: options.description,
            details: {
              oldValues: options.oldValues,
              newValues: options.newValues || responseData?.data,
              changedFields: options.changedFields,
              reason: options.reason,
              httpMethod: req.method,
              requestPath: req.path,
              statusCode,
              responseSize: JSON.stringify(responseData || {}).length
            },
            context: {
              userId: req.user.id,
              sessionId: req.user.sessionId,
              ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
              userAgent: req.headers['user-agent']
            },
            isSensitive: options.isSensitive || false,
            isFailure: false
          });
        }
      } catch (error) {
        logger.error('审计中间件记录失败:', error);
        // 不抛出错误，避免影响主要业务流程
      }
    });
  };
};

/**
 * 创建专门的登录审计中间件
 */
export const loginAuditMiddleware = async (req: RequestWithUser, res: Response, next: NextFunction) => {
  const originalJson = res.json;
  let statusCode: number;
  let responseData: any;

  res.json = function(data: any) {
    statusCode = res.statusCode;
    responseData = data;
    return originalJson.call(this, data);
  };

  await next();

  setImmediate(async () => {
    try {
      const success = statusCode >= 200 && statusCode < 300;
      const userId = success ? responseData?.data?.user?.id : undefined;

      await AuditService.logLogin(
        req,
        success,
        userId,
        success ? undefined : responseData?.error?.message
      );
    } catch (error) {
      logger.error('登录审计记录失败:', error);
    }
  });
};

/**
 * 创建访问审计中间件
 */
export const accessAuditMiddleware = (entityType: string, getId: (req: Request) => string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json;
    let statusCode: number;
    let responseData: any;

    res.json = function(data: any) {
      statusCode = res.statusCode;
      responseData = data;
      return originalJson.call(this, data);
    };

    await next();

    setImmediate(async () => {
      try {
        const success = statusCode >= 200 && statusCode < 300;
        const entityId = getId(req);
        const entityName = responseData?.data?.name || responseData?.data?.title;

        await AuditService.logAccess(
          req as RequestWithUser,
          entityType,
          success,
          entityId,
          entityName,
          success ? undefined : responseData?.error?.message
        );
      } catch (error) {
        logger.error('访问审计记录失败:', error);
      }
    });
  };
};

/**
 * 创建通用的API审计中间件
 * 记录所有API访问
 */
export const apiAuditMiddleware = () => {
  return async (req: RequestWithUser, res: Response, next: NextFunction) => {
    // 跳过不需要审计的路径
    const skipPaths = [
      '/api/v1/health',
      '/api/v1/auth/login',
      '/api/v1/auth/logout',
      '/api/v1/audit-logs'
    ];

    const shouldSkip = skipPaths.some(path => req.path.startsWith(path));

    if (shouldSkip) {
      return next();
    }

    const startTime = Date.now();
    const originalJson = res.json;
    let statusCode: number;

    res.json = function(data: any) {
      statusCode = res.statusCode;
      return originalJson.call(this, data);
    };

    await next();

    setImmediate(async () => {
      try {
        const responseTime = Date.now() - startTime;
        const success = statusCode >= 200 && statusCode < 300;

        // 只对认证用户的请求进行详细审计
        if (req.user && req.user.id) {
          await AuditService.createAuditLog({
            action: AuditAction.ACCESS,
            entityType: 'api',
            entityId: undefined,
            entityName: `${req.method} ${req.path}`,
            description: `${success ? '访问' : '访问失败'}: ${req.method} ${req.path}`,
            details: {
              httpMethod: req.method,
              requestPath: req.path,
              statusCode,
              responseTime,
              query: req.query,
              bodySize: JSON.stringify(req.body || {}).length
            },
            context: {
              userId: req.user.id,
              sessionId: req.user.sessionId,
              ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
              userAgent: req.headers['user-agent']
            },
            isFailure: !success
          });
        }
      } catch (error) {
        logger.error('API审计记录失败:', error);
      }
    });
  };
};

/**
 * 创建敏感操作审计中间件
 * 用于标记需要特别关注的操作
 */
export const sensitiveAuditMiddleware = (options: Omit<AuditOptions, 'isSensitive'>) => {
  return auditMiddleware({
    ...options,
    isSensitive: true
  });
};

/**
 * 创建失败操作审计中间件
 * 自动标记失败的操作
 */
export const failureAuditMiddleware = (options: Omit<AuditOptions, 'isFailure'>) => {
  return async (req: RequestWithUser, res: Response, next: NextFunction) => {
    const originalJson = res.json;
    let statusCode: number;
    let responseData: any;

    res.json = function(data: any) {
      statusCode = res.statusCode;
      responseData = data;
      return originalJson.call(this, data);
    };

    await next();

    setImmediate(async () => {
      try {
        const success = statusCode >= 200 && statusCode < 300;

        if (!success && req.user) {
          const entityId = typeof options.entityId === 'function'
            ? options.entityId(req)
            : options.entityId || req.params.id || req.body?.id;

          await AuditService.createAuditLog({
            action: options.action,
            entityType: options.entityType,
            entityId,
            entityName: options.entityName,
            description: options.description || `操作失败: ${req.method} ${req.path}`,
            details: {
              httpMethod: req.method,
              requestPath: req.path,
              statusCode,
              errorMessage: responseData?.error?.message,
              oldValues: options.oldValues,
              newValues: options.newValues,
              changedFields: options.changedFields,
              reason: options.reason
            },
            context: {
              userId: req.user.id,
              sessionId: req.user.sessionId,
              ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
              userAgent: req.headers['user-agent']
            },
            isSensitive: options.isSensitive || false,
            isFailure: true
          });
        }
      } catch (error) {
        logger.error('失败审计记录失败:', error);
      }
    });
  };
};

/**
 * 创建批量操作审计中间件
 */
export const batchAuditMiddleware = (entityType: string, operation: 'create' | 'update' | 'delete') => {
  return async (req: RequestWithUser, res: Response, next: NextFunction) => {
    const originalJson = res.json;
    let statusCode: number;
    let responseData: any;

    res.json = function(data: any) {
      statusCode = res.statusCode;
      responseData = data;
      return originalJson.call(this, data);
    };

    await next();

    setImmediate(async () => {
      try {
        if (statusCode >= 200 && statusCode < 300 && req.user) {
          const itemCount = Array.isArray(responseData?.data)
            ? responseData.data.length
            : responseData?.data?.count || 1;

          await AuditService.createAuditLog({
            action: operation === 'create' ? AuditAction.CREATE :
                    operation === 'update' ? AuditAction.UPDATE :
                    AuditAction.DELETE,
            entityType,
            description: `批量${operation}了${entityType} (${itemCount}项)`,
            details: {
              operation,
              itemCount,
              httpMethod: req.method,
              requestPath: req.path
            },
            context: {
              userId: req.user.id,
              sessionId: req.user.sessionId,
              ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
              userAgent: req.headers['user-agent']
            },
            isSensitive: true // 批量操作通常是敏感的
          });
        }
      } catch (error) {
        logger.error('批量审计记录失败:', error);
      }
    });
  };
};

/**
 * AuditMiddleware 工具类
 * 提供静态方法用于快速创建审计日志
 */
export class AuditMiddleware {
  /**
   * 记录创建操作
   */
  static logCreate(userId: string, entityType: string, entityId: string, entityName?: string, details?: any): void {
    setImmediate(async () => {
      try {
        await AuditService.createAuditLog({
          action: AuditAction.CREATE,
          entityType,
          entityId,
          entityName,
          description: `创建${entityType}: ${entityName || entityId}`,
          details: details || {},
          context: { userId } as any,
          isFailure: false
        });
      } catch (error) {
        logger.error('记录创建审计日志失败:', error);
      }
    });
  }

  /**
   * 记录更新操作
   */
  static logUpdate(userId: string, entityType: string, entityId: string, entityName?: string, details?: any): void {
    setImmediate(async () => {
      try {
        await AuditService.createAuditLog({
          action: AuditAction.UPDATE,
          entityType,
          entityId,
          entityName,
          description: `更新${entityType}: ${entityName || entityId}`,
          details: details || {},
          context: { userId } as any,
          isFailure: false
        });
      } catch (error) {
        logger.error('记录更新审计日志失败:', error);
      }
    });
  }

  /**
   * 记录删除操作
   */
  static logDelete(userId: string, entityType: string, entityId: string, entityName?: string, details?: any): void {
    setImmediate(async () => {
      try {
        await AuditService.createAuditLog({
          action: AuditAction.DELETE,
          entityType,
          entityId,
          entityName,
          description: `删除${entityType}: ${entityName || entityId}`,
          details: details || {},
          context: { userId } as any,
          isFailure: false
        });
      } catch (error) {
        logger.error('记录删除审计日志失败:', error);
      }
    });
  }

  /**
   * 记录批量删除操作
   */
  static logBulkDelete(userId: string, entityType: string, entityIds: string[], details?: any): void {
    setImmediate(async () => {
      try {
        await AuditService.createAuditLog({
          action: AuditAction.DELETE,
          entityType,
          entityId: entityIds.join(','),
          entityName: `批量删除${entityIds.length}个${entityType}`,
          description: `批量删除${entityType} (${entityIds.length}项)`,
          details: {
            deletedIds: entityIds,
            ...details
          },
          context: { userId } as any,
          isSensitive: true,
          isFailure: false
        });
      } catch (error) {
        logger.error('记录批量删除审计日志失败:', error);
      }
    });
  }
}