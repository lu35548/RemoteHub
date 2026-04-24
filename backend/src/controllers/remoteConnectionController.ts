import { Request, Response } from 'express';
import { getServices } from '@/services/container';
import { AuditService } from '@/services/auditService';
import { AuditMiddleware } from '@/middleware/audit';
import { AuditAction } from '@/enums/CommonEnums';
import { asyncHandler } from '@/middleware/errorHandler';
import { logger } from '@/utils/logger';

/**
 * RemoteConnection Controller
 * 处理远程连接的HTTP请求，与现有Controller模式保持一致
 */
export class RemoteConnectionController {
  private get services() {
    return getServices();
  }

  private get remoteConnectionService() {
    // 延迟实例化Service，确保数据库已初始化
    const { RemoteConnectionService } = require('@/services/remoteConnectionService');
    return new RemoteConnectionService();
  }

  /**
   * 获取用户的远程连接列表
   */
  getConnections = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '用户未认证',
        },
      });
    }

    const {
      projectId,
      protocol,
      query,
      tags,
      isActive,
      page = '1',
      limit = '20',
    } = req.query;

    const parsedTags = tags ? (tags as string).split(',').map(tag => tag.trim()) : undefined;

    const result = await this.remoteConnectionService.getUserConnections(userId, {
      projectId: projectId as string,
      protocol: protocol as any,
      query: query as string,
      tags: parsedTags,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      page: parseInt(page as string),
      limit: parseInt(limit as string),
    });

    res.json({
      success: true,
      data: result,
      pagination: {
        page: result.page,
        totalPages: result.totalPages,
        total: result.total,
        limit: parseInt(limit as string),
      },
    });
  });

  /**
   * 根据ID获取远程连接
   */
  getConnectionById = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '用户未认证',
        },
      });
    }

    const connection = await this.remoteConnectionService.getConnectionById(userId, id);

    res.json({
      success: true,
      data: connection,
    });
  });

  /**
   * 创建新的远程连接
   */
  createConnection = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '用户未认证',
        },
      });
    }

    const connectionData = req.body;

    try {
      const connection = await this.remoteConnectionService.createConnection(userId, connectionData);

      // TODO: 记录审计日志
      // AuditService.createAuditLog({
      //   action: AuditAction.CREATE,
      //   entityType: 'RemoteConnection',
      //   entityId: connection.id,
      //   entityName: connection.name,
      //   description: '创建远程连接',
      //   details: {
      //     protocol: connection.protocol,
      //     host: connection.host,
      //   },
      //   context: {
      //     userId: userId,
      //     ipAddress: req.ip,
      //     userAgent: req.get('User-Agent'),
      //   },
      // });

      res.status(201).json({
        success: true,
        data: connection,
        message: '远程连接创建成功',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        success: false,
        error: {
          code: error.code || 'CREATE_CONNECTION_FAILED',
          message: error.message,
        },
      });
    }
  });

  /**
   * 更新远程连接
   */
  updateConnection = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '用户未认证',
        },
      });
    }

    const updateData = req.body;

    try {
      // 获取原始连接信息用于审计
      const originalConnection = await this.remoteConnectionService.getConnectionById(userId, id);

      const connection = await this.remoteConnectionService.updateConnection(userId, id, updateData);

      // 记录审计日志
      AuditMiddleware.logUpdate(userId, 'RemoteConnection', connection.id, connection.name, {
        changes: updateData,
        original: originalConnection,
      });

      res.json({
        success: true,
        data: connection,
        message: '远程连接更新成功',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        success: false,
        error: {
          code: error.code || 'UPDATE_CONNECTION_FAILED',
          message: error.message,
        },
      });
    }
  });

  /**
   * 删除远程连接
   */
  deleteConnection = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '用户未认证',
        },
      });
    }

    try {
      // 获取连接信息用于审计
      const connection = await this.remoteConnectionService.getConnectionById(userId, id);

      await this.remoteConnectionService.deleteConnection(userId, id);

      // 记录审计日志
      AuditMiddleware.logDelete(userId, 'RemoteConnection', connection.id, connection.name, {
        protocol: connection.protocol,
        host: connection.host,
      });

      res.json({
        success: true,
        message: '远程连接删除成功',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        success: false,
        error: {
          code: error.code || 'DELETE_CONNECTION_FAILED',
          message: error.message,
        },
      });
    }
  });

  /**
   * 批量删除远程连接
   */
  deleteConnections = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '用户未认证',
        },
      });
    }

    const { connectionIds } = req.body;

    if (!connectionIds || !Array.isArray(connectionIds)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '请提供有效的连接ID列表',
        },
      });
    }

    try {
      const deletedCount = await this.remoteConnectionService.deleteConnections(userId, connectionIds);

      // 记录审计日志
      AuditMiddleware.logBulkDelete(userId, 'RemoteConnection', connectionIds, {
        deletedCount,
      });

      res.json({
        success: true,
        data: { deletedCount },
        message: `成功删除 ${deletedCount} 个远程连接`,
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        success: false,
        error: {
          code: error.code || 'DELETE_CONNECTIONS_FAILED',
          message: error.message,
        },
      });
    }
  });

  /**
   * 记录连接访问
   */
  recordAccess = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '用户未认证',
        },
      });
    }

    try {
      await this.remoteConnectionService.recordAccess(userId, id);

      res.json({
        success: true,
        message: '访问记录成功',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        success: false,
        error: {
          code: error.code || 'RECORD_ACCESS_FAILED',
          message: error.message,
        },
      });
    }
  });

  /**
   * 获取连接统计
   */
  getConnectionStats = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '用户未认证',
        },
      });
    }

    const stats = await this.remoteConnectionService.getConnectionStats(userId);

    res.json({
      success: true,
      data: stats,
    });
  });

  /**
   * 获取支持的协议类型
   */
  getSupportedProtocols = asyncHandler(async (req: Request, res: Response) => {
    const protocols = this.remoteConnectionService.getSupportedProtocols();

    res.json({
      success: true,
      data: protocols,
    });
  });

  /**
   * 根据标签查找连接
   */
  getConnectionsByTag = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { tag } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '用户未认证',
        },
      });
    }

    const connections = await this.remoteConnectionService.getConnectionsByTag(userId, tag);

    res.json({
      success: true,
      data: connections,
    });
  });

  /**
   * 获取最近访问的连接
   */
  getRecentlyAccessed = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '用户未认证',
        },
      });
    }

    const connections = await this.remoteConnectionService.getRecentlyAccessed(userId, limit);

    res.json({
      success: true,
      data: connections,
    });
  });

  /**
   * 克隆连接
   */
  cloneConnection = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.userId;
    const { id } = req.params;
    const { name } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '用户未认证',
        },
      });
    }

    try {
      const clonedConnection = await this.remoteConnectionService.cloneConnection(userId, id, name);

      // 记录审计日志
      AuditMiddleware.logCreate(userId, 'RemoteConnection', clonedConnection.id, clonedConnection.name, {
        clonedFrom: id,
        action: 'clone',
      });

      res.status(201).json({
        success: true,
        data: clonedConnection,
        message: '连接克隆成功',
      });
    } catch (error: any) {
      res.status(error.statusCode || 400).json({
        success: false,
        error: {
          code: error.code || 'CLONE_CONNECTION_FAILED',
          message: error.message,
        },
      });
    }
  });
}

// 创建Controller实例并导出绑定函数，与其他Controller保持一致
const remoteConnectionController = new RemoteConnectionController();

export const getConnections = remoteConnectionController.getConnections.bind(remoteConnectionController);
export const getConnectionById = remoteConnectionController.getConnectionById.bind(remoteConnectionController);
export const createConnection = remoteConnectionController.createConnection.bind(remoteConnectionController);
export const updateConnection = remoteConnectionController.updateConnection.bind(remoteConnectionController);
export const deleteConnection = remoteConnectionController.deleteConnection.bind(remoteConnectionController);
export const deleteConnections = remoteConnectionController.deleteConnections.bind(remoteConnectionController);
export const recordAccess = remoteConnectionController.recordAccess.bind(remoteConnectionController);
export const getConnectionStats = remoteConnectionController.getConnectionStats.bind(remoteConnectionController);
export const getSupportedProtocols = remoteConnectionController.getSupportedProtocols.bind(remoteConnectionController);
export const getConnectionsByTag = remoteConnectionController.getConnectionsByTag.bind(remoteConnectionController);
export const getRecentlyAccessed = remoteConnectionController.getRecentlyAccessed.bind(remoteConnectionController);
export const cloneConnection = remoteConnectionController.cloneConnection.bind(remoteConnectionController);