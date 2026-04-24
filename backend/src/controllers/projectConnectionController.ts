import { Request, Response, NextFunction } from 'express';
import { getServices } from '../services/container';
import { User } from '../models/User';
import { Project } from '../models/Project';
import { Connection } from '../models/Connection';
import { ProjectConnectionRepository } from '../repositories/ProjectConnectionRepository';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors';
import { logger } from '../utils/logger';

export class ProjectConnectionController {
  private get services() {
    return getServices();
  }

  /**
   * 获取项目连接列表
   */
  public async getProjectConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;
      const {
        page = 1,
        limit = 10,
        status,
        category,
        search,
        sortBy = 'addedAt',
        sortOrder = 'DESC',
      } = req.query;

      const projectConnectionRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      const result = await projectConnectionRepo.getProjectConnections(id, user.id, {
        page: Number(page),
        limit: Number(limit),
        status: status as string,
        category: category as string,
        search: search as string,
        sortBy: sortBy as any,
        sortOrder: sortOrder as 'ASC' | 'DESC',
      });

      res.json({
        success: true,
        data: {
          connections: result.connections,
          pagination: {
            page: result.page,
            limit: result.limit,
            total: result.total,
            totalPages: result.totalPages,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 添加连接到项目
   */
  public async addConnectionToProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { connectionId, alias, description, category, permissions, tags } = req.body;
      const user = req.userEntity as User;

      if (!connectionId) {
        throw new ValidationError('连接ID是必需的');
      }

      const projectConnectionRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      const projectConnection = await projectConnectionRepo.addConnectionToProject(
        id,
        connectionId,
        user.id,
        {
          alias,
          description,
          category,
          permissions,
          tags,
        }
      );

      res.status(201).json({
        success: true,
        message: '连接已添加到项目',
        data: projectConnection,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 批量添加连接到项目
   */
  public async batchAddConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { connectionIds, defaultSettings } = req.body;
      const user = req.userEntity as User;

      if (!Array.isArray(connectionIds) || connectionIds.length === 0) {
        throw new ValidationError('连接ID列表不能为空');
      }

      if (connectionIds.length > 100) {
        throw new ValidationError('一次最多添加100个连接');
      }

      const projectConnectionRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      const result = await projectConnectionRepo.batchAddConnections(id, connectionIds, user.id);

      res.json({
        success: true,
        message: '批量添加连接完成',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 更新项目连接关联
   */
  public async updateProjectConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, connectionId } = req.params;
      const { alias, description, category, permissions, tags } = req.body;
      const user = req.userEntity as User;

      const projectConnectionRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      const projectConnection = await projectConnectionRepo.updateProjectConnection(
        id,
        connectionId,
        user.id,
        {
          alias,
          description,
          category,
          permissions,
          tags,
        }
      );

      res.json({
        success: true,
        message: '项目连接关联已更新',
        data: projectConnection,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 从项目移除连接
   */
  public async removeConnectionFromProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, connectionId } = req.params;
      const user = req.userEntity as User;

      const projectConnectionRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      await projectConnectionRepo.removeConnectionFromProject(id, connectionId, user.id);

      res.json({
        success: true,
        message: '连接已从项目移除',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 测试项目连接
   */
  public async testProjectConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, connectionId } = req.params;
      const { timeout = 30000, retryCount = 1 } = req.body;
      const user = req.userEntity as User;

      const projectConnectionRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      const result = await projectConnectionRepo.testProjectConnection(id, connectionId, user.id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 批量测试项目连接
   */
  public async batchTestProjectConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { connectionIds, timeout = 30000, retryCount = 1 } = req.body;
      const user = req.userEntity as User;

      if (!Array.isArray(connectionIds) || connectionIds.length === 0) {
        throw new ValidationError('连接ID列表不能为空');
      }

      if (connectionIds.length > 10) {
        throw new ValidationError('一次最多测试10个连接');
      }

      const projectConnectionRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      const results = [];

      for (const connectionId of connectionIds) {
        try {
          const result = await projectConnectionRepo.testProjectConnection(id, connectionId, user.id);
          results.push({
            connectionId,
            success: true,
            ...result,
          });
        } catch (error) {
          results.push({
            connectionId,
            success: false,
            error: error instanceof Error ? error.message : '测试失败',
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failedCount = results.filter(r => !r.success).length;

      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: connectionIds.length,
            success: successCount,
            failed: failedCount,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 更新连接权限
   */
  public async updateConnectionPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, connectionId } = req.params;
      const { permissions } = req.body;
      const user = req.userEntity as User;

      if (!permissions || typeof permissions !== 'object') {
        throw new ValidationError('权限格式无效');
      }

      // 验证权限字段
      const validPermissions = ['canView', 'canEdit', 'canDelete', 'canTest', 'canExport'];
      for (const permission of validPermissions) {
        if (permissions[permission] !== undefined && typeof permissions[permission] !== 'boolean') {
          throw new ValidationError(`权限 ${permission} 必须是布尔值`);
        }
      }

      const projectConnectionRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      const projectConnection = await projectConnectionRepo.updateConnectionPermissions(
        id,
        connectionId,
        user.id,
        permissions
      );

      res.json({
        success: true,
        message: '连接权限已更新',
        data: {
          id: projectConnection.id,
          connectionId: projectConnection.connectionId,
          permissions: projectConnection.permissions,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取连接项目列表
   */
  public async getConnectionProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      const projectConnectionRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      const projects = await projectConnectionRepo.getConnectionProjects(id, user.id);

      res.json({
        success: true,
        data: projects,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取项目连接统计
   */
  public async getProjectConnectionStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      // 检查用户是否有权限查看项目连接统计
      const projectRepo = this.services.database.getRepository(Project);
      const isMember = await projectRepo.isProjectMember(id, user.id);

      if (!isMember) {
        throw new UnauthorizedError('无权限查看项目连接统计');
      }

      const projectConnectionRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      const stats = await projectConnectionRepo.getProjectConnectionStats(id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 导出项目连接列表
   */
  public async exportProjectConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { format = 'json', includeCredentials = false } = req.query;
      const user = req.userEntity as User;

      const projectConnectionRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      const result = await projectConnectionRepo.getProjectConnections(id, user.id, {
        page: 1,
        limit: 10000, // 获取所有连接
      });

      // 过滤敏感信息
      const connections = result.connections.map(pc => {
        const connectionData = {
          id: pc.connection.id,
          name: pc.connection.name,
          type: pc.connection.type,
          host: pc.connection.host,
          port: pc.connection.port,
          database: pc.connection.database,
          username: pc.connection.username,
          category: pc.connection.category,
          alias: pc.alias,
          description: pc.description,
          tags: pc.tags,
          permissions: pc.permissions,
          addedAt: pc.createdAt,
        };

        // 如果不包含凭证信息，移除敏感字段
        if (includeCredentials !== 'true') {
          delete (connectionData as any).password;
          delete (connectionData as any)._encryptedPassword;
          if (pc.connection.sshConfig) {
            delete pc.connection.sshConfig.password;
            delete pc.connection.sshConfig.privateKey;
            delete pc.connection.sshConfig.passphrase;
          }
        }

        return connectionData;
      });

      const exportData = {
        projectId: id,
        exportDate: new Date().toISOString(),
        exportedBy: user.id,
        totalConnections: connections.length,
        connections,
      };

      res.json({
        success: true,
        data: exportData,
      });

      logger.info('项目连接列表已导出', {
        projectId: id,
        userId: user.id,
        format,
        includeCredentials,
        totalConnections: connections.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取可添加的连接列表
   */
  public async getAvailableConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { search, type, limit = 50 } = req.query;
      const user = req.userEntity as User;

      // 检查用户是否有权限管理项目连接
      const projectRepo = this.services.database.getRepository(Project);
      const project = await projectRepo.findOne({ where: { id } });

      if (!project) {
        throw new NotFoundError('项目不存在');
      }

      if (!project.canUserManageConnections(user.id)) {
        throw new ForbiddenError('无权限管理项目连接');
      }

      const connectionRepo = this.services.database.getRepository(Connection);

      // 获取用户拥有的连接
      const query = connectionRepo.createQueryBuilder('connection')
        .where('connection.ownerId = :userId', { userId: user.id })
        .andWhere('connection.status = :status', { status: 'active' })
        .take(Number(limit));

      if (search) {
        query.andWhere('connection.name ILIKE :search', { search: `%${search}%` });
      }

      if (type) {
        query.andWhere('connection.type = :type', { type });
      }

      // 排除已经添加到项目的连接
      const projectConnRepo = new ProjectConnectionRepository(this.services.database.getDataSource());
      const existingConnectionIds = await projectConnRepo.getProjectConnectionIds(id);

      if (existingConnectionIds.length > 0) {
        query.andWhere('connection.id NOT IN (:...ids)', { ids: existingConnectionIds });
      }

      const connections = await query.getMany();

      // 返回连接基本信息
      const connectionList = connections.map(conn => ({
        id: conn.id,
        name: conn.name,
        type: conn.type,
        host: conn.host,
        category: conn.category,
        lastTestStatus: conn.lastTestStatus,
        lastTestedAt: conn.lastTestedAt,
      }));

      res.json({
        success: true,
        data: connectionList,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const projectConnectionController = new ProjectConnectionController();

// 导出路由处理函数
export const getProjectConnections = projectConnectionController.getProjectConnections.bind(projectConnectionController);
export const addConnectionToProject = projectConnectionController.addConnectionToProject.bind(projectConnectionController);
export const batchAddConnections = projectConnectionController.batchAddConnections.bind(projectConnectionController);
export const updateProjectConnection = projectConnectionController.updateProjectConnection.bind(projectConnectionController);
export const removeConnectionFromProject = projectConnectionController.removeConnectionFromProject.bind(projectConnectionController);
export const testProjectConnection = projectConnectionController.testProjectConnection.bind(projectConnectionController);
export const batchTestProjectConnections = projectConnectionController.batchTestProjectConnections.bind(projectConnectionController);
export const updateConnectionPermissions = projectConnectionController.updateConnectionPermissions.bind(projectConnectionController);
export const getConnectionProjects = projectConnectionController.getConnectionProjects.bind(projectConnectionController);
export const getProjectConnectionStats = projectConnectionController.getProjectConnectionStats.bind(projectConnectionController);
export const exportProjectConnections = projectConnectionController.exportProjectConnections.bind(projectConnectionController);
export const getAvailableConnections = projectConnectionController.getAvailableConnections.bind(projectConnectionController);