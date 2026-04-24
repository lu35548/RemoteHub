import { Request, Response, NextFunction } from 'express';
import { getServices } from '../services/container';
import { Connection, ConnectionType, ConnectionStatus, ConnectionSecurityLevel, ConnectionCategory } from '../models/Connection';
import { ConnectionRepository } from '../repositories/ConnectionRepository';
import { ProjectConnectionRepository } from '../repositories/ProjectConnectionRepository';
import { User } from '../models/User';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors';
import { logger } from '../utils/logger';

export class ConnectionController {
  private get services() {
    return getServices();
  }

  /**
   * 获取用户可访问的连接列表
   */
  public async getConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.userEntity as User;
      const {
        page = 1,
        limit = 10,
        type,
        status,
        category,
        securityLevel,
        search,
        tags,
        projectId,
        sortBy = 'updatedAt',
        sortOrder = 'DESC',
        includeTests = false,
      } = req.query;

      // 将 tags 从字符串转换为数组
      const tagsArray = tags ? (tags as string).split(',').filter(t => t.trim()) : undefined;

      const connectionRepo = new ConnectionRepository(this.services.database.getDataSource());
      const result = await connectionRepo.getAccessibleConnections(user.id, {
        page: Number(page),
        limit: Number(limit),
        type: type as ConnectionType,
        status: status as ConnectionStatus,
        category: category as ConnectionCategory,
        securityLevel: securityLevel as ConnectionSecurityLevel,
        search: search as string,
        tags: tagsArray,
        projectId: projectId as string,
        sortBy: sortBy as any,
        sortOrder: sortOrder as 'ASC' | 'DESC',
      });

      // 如果不包含测试信息，过滤掉敏感测试数据
      const connections = includeTests ? result.connections : result.connections.map(conn => ({
        ...conn,
        lastTestStatus: conn.lastTestStatus,
        lastTestedAt: conn.lastTestedAt,
        lastTestResult: undefined, // 不返回详细错误信息
      }));

      // 返回统一的响应格式
      res.json({
        success: true,
        data: {
          connections,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 创建新连接
   */
  public async createConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.userEntity as User;
      const connectionData = req.body;

      // 基本验证
      if (!connectionData.name || connectionData.name.trim().length === 0) {
        throw new ValidationError('连接名称是必需的');
      }

      if (connectionData.name.length > 255) {
        throw new ValidationError('连接名称不能超过255个字符');
      }

      if (!connectionData.type) {
        throw new ValidationError('连接类型是必需的');
      }

      if (!Object.values(ConnectionType).includes(connectionData.type)) {
        throw new ValidationError('无效的连接类型');
      }

      // 设置连接所有者为当前用户
      connectionData.ownerId = user.id;

      // 验证枚举值
      if (connectionData.category && !Object.values(ConnectionCategory).includes(connectionData.category)) {
        throw new ValidationError('无效的连接类别');
      }

      if (connectionData.securityLevel && !Object.values(ConnectionSecurityLevel).includes(connectionData.securityLevel)) {
        throw new ValidationError('无效的安全级别');
      }

      // 验证连接配置
      // 创建临时对象进行验证
      const tempConnection = new Connection();
      tempConnection.name = connectionData.name;
      tempConnection.type = connectionData.type;
      tempConnection.host = connectionData.host;
      tempConnection.port = connectionData.port;
      tempConnection.database = connectionData.database;
      tempConnection.username = connectionData.username;

      // 如果有密码，设置到加密字段以供验证
      if (connectionData.password) {
        tempConnection.setPassword(connectionData.password);
      }

      if (!tempConnection.isValidConfiguration) {
        logger.error('连接配置验证失败', {
          type: tempConnection.type,
          host: tempConnection.host,
          database: tempConnection.database,
          username: tempConnection.username,
          hasPassword: tempConnection.hasPassword(),
        });
        throw new ValidationError('连接配置无效，请检查必填字段');
      }

      // 处理密码加密
      if (connectionData.password) {
        const tempConnection = new Connection();
        tempConnection.setPassword(connectionData.password);
        connectionData._encryptedPassword = tempConnection._encryptedPassword;
        // 删除明文密码
        delete connectionData.password;
      }

      // 处理SSH配置
      if (connectionData.sshConfig) {
        // 验证SSH配置
        if (connectionData.sshConfig.enabled && (!connectionData.sshConfig.host || !connectionData.sshConfig.username)) {
          throw new ValidationError('SSH隧道配置不完整');
        }
      }

      // 处理标签
      if (connectionData.tags && Array.isArray(connectionData.tags)) {
        connectionData.tags = connectionData.tags.join(',');
      }

      const connectionRepo = new ConnectionRepository(this.services.database.getDataSource());
      const connection = await connectionRepo.createConnection(connectionData);

      // 返回时不包含敏感信息
      logger.debug('连接对象调试信息', {
        connectionType: typeof connection,
        hasToJSON: typeof connection.toJSON,
        connectionKeys: Object.keys(connection),
        connectionConstructor: connection.constructor?.name
      });

      const responseConnection = connection.toJSON();

      logger.info('连接创建成功', {
        connectionId: connection.id,
        connectionName: connection.name,
        type: connection.type,
        ownerId: user.id,
      });

      res.status(201).json({
        success: true,
        message: '连接创建成功',
        data: responseConnection,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取连接详情
   */
  public async getConnectionById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      const connectionRepo = new ConnectionRepository(this.services.database.getDataSource());
      const connection = await connectionRepo.getConnectionById(id, user.id);

      // 返回时不包含敏感信息
      const responseConnection = connection.toJSON();

      res.json({
        success: true,
        data: responseConnection,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 更新连接
   */
  public async updateConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;
      const updateData = req.body;

      // 移除不允许更新的字段
      const restrictedFields = ['id', 'ownerId', 'createdAt', 'updatedAt'];
      for (const field of restrictedFields) {
        delete updateData[field];
      }

      // 基本验证
      if (updateData.name !== undefined) {
        if (!updateData.name || updateData.name.trim().length === 0) {
          throw new ValidationError('连接名称不能为空');
        }
        if (updateData.name.length > 255) {
          throw new ValidationError('连接名称不能超过255个字符');
        }
      }

      // 验证枚举值
      if (updateData.type && !Object.values(ConnectionType).includes(updateData.type)) {
        throw new ValidationError('无效的连接类型');
      }

      if (updateData.category && !Object.values(ConnectionCategory).includes(updateData.category)) {
        throw new ValidationError('无效的连接类别');
      }

      if (updateData.securityLevel && !Object.values(ConnectionSecurityLevel).includes(updateData.securityLevel)) {
        throw new ValidationError('无效的安全级别');
      }

      // 处理密码更新
      if (updateData.password !== undefined) {
        if (updateData.password === '') {
          // 清空密码
          updateData._encryptedPassword = null;
        }
      }

      // 处理SSH配置更新
      if (updateData.sshConfig) {
        if (updateData.sshConfig.enabled && (!updateData.sshConfig.host || !updateData.sshConfig.username)) {
          throw new ValidationError('SSH隧道配置不完整');
        }
      }

      // 处理标签
      if (updateData.tags && Array.isArray(updateData.tags)) {
        updateData.tags = updateData.tags.join(',');
      }

      const connectionRepo = new ConnectionRepository(this.services.database.getDataSource());
      const connection = await connectionRepo.updateConnection(id, user.id, updateData);

      // 返回时不包含敏感信息
      const responseConnection = connection.toJSON();

      logger.info('连接更新成功', {
        connectionId: id,
        userId: user.id,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: '连接更新成功',
        data: responseConnection,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 删除连接
   */
  public async deleteConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      const connectionRepo = new ConnectionRepository(this.services.database.getDataSource());
      await connectionRepo.deleteConnection(id, user.id);

      logger.info('连接删除成功', {
        connectionId: id,
        userId: user.id,
      });

      res.json({
        success: true,
        message: '连接删除成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 测试连接
   */
  public async testConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { timeout = 30000, retryCount = 1 } = req.body;
      const user = req.userEntity as User;

      const connectionRepo = new ConnectionRepository(this.services.database.getDataSource());
      const result = await connectionRepo.testConnection(id, user.id, {
        timeout: Number(timeout),
        retryCount: Number(retryCount),
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 克隆连接
   */
  public async cloneConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const user = req.userEntity as User;

      const connectionRepo = new ConnectionRepository(this.services.database.getDataSource());
      const clonedConnection = await connectionRepo.cloneConnection(id, user.id, name);

      // 返回时不包含敏感信息
      const responseConnection = clonedConnection.toJSON();

      logger.info('连接克隆成功', {
        originalConnectionId: id,
        newConnectionId: clonedConnection.id,
        userId: user.id,
      });

      res.status(201).json({
        success: true,
        message: '连接克隆成功',
        data: responseConnection,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 批量测试连接
   */
  public async testMultipleConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ids } = req.body;
      const { timeout = 30000, retryCount = 1 } = req.query;
      const user = req.userEntity as User;

      if (!Array.isArray(ids) || ids.length === 0) {
        throw new ValidationError('连接ID列表是必需的');
      }

      if (ids.length > 10) {
        throw new ValidationError('一次最多测试10个连接');
      }

      const connectionRepo = new ConnectionRepository(this.services.database.getDataSource());
      const results = await connectionRepo.testMultipleConnections(ids, user.id, {
        timeout: Number(timeout),
        retryCount: Number(retryCount),
      });

      res.json({
        success: true,
        data: {
          results,
          total: ids.length,
          success: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取连接统计信息
   */
  public async getConnectionStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.userEntity as User;

      const connectionRepo = new ConnectionRepository(this.services.database.getDataSource());
      const stats = await connectionRepo.getConnectionStats(user.id);

      res.json({
        success: true,
        data: stats,
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
   * 导出连接配置
   */
  public async exportConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { format = 'json' } = req.query;
      const user = req.userEntity as User;

      const connectionRepo = new ConnectionRepository(this.services.database.getDataSource());
      const connection = await connectionRepo.getConnectionById(id, user.id);

      // 导出不包含敏感信息
      const exportData = connection.exportConfig();

      // 根据格式返回不同响应
      if (format === 'json') {
        res.json({
          success: true,
          data: exportData,
        });
      } else {
        // 其他格式（如 yaml、xml 等）可以在这里扩展
        res.json({
          success: true,
          data: exportData,
        });
      }

      logger.info('连接配置已导出', {
        connectionId: id,
        userId: user.id,
        format,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取连接类型列表
   */
  public async getConnectionTypes(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // 返回所有支持的连接类型及其配置要求
      const types = Object.values(ConnectionType).map(type => ({
        value: type,
        label: type.charAt(0) + type.slice(1).toLowerCase(),
        requiredFields: this.getRequiredFieldsForType(type),
        optionalFields: this.getOptionalFieldsForType(type),
        supportsSSL: this.supportsSSLForType(type),
        supportsSSH: this.supportsSSHForType(type),
      }));

      res.json({
        success: true,
        data: types,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取连接类别列表
   */
  public async getConnectionCategories(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const categories = Object.values(ConnectionCategory).map(category => ({
        value: category,
        label: category.charAt(0) + category.slice(1).toLowerCase(),
        description: this.getCategoryDescription(category),
      }));

      res.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取连接类型所需的字段
   */
  private getRequiredFieldsForType(type: ConnectionType): string[] {
    const requirements = {
      [ConnectionType.MYSQL]: ['host', 'username', 'database'],
      [ConnectionType.POSTGRESQL]: ['host', 'username', 'database'],
      [ConnectionType.SQLITE]: ['database'],
      [ConnectionType.SQLSERVER]: ['host', 'username', 'database'],
      [ConnectionType.ORACLE]: ['host', 'username', 'database'],
      [ConnectionType.MONGODB]: ['host'],
      [ConnectionType.REDIS]: ['host'],
    };

    return requirements[type] || [];
  }

  /**
   * 获取连接类型可选的字段
   */
  private getOptionalFieldsForType(type: ConnectionType): string[] {
    const options = {
        [ConnectionType.MYSQL]: ['port', 'password', 'sslConfig'],
        [ConnectionType.POSTGRESQL]: ['port', 'password', 'sslConfig'],
        [ConnectionType.SQLITE]: ['password'],
        [ConnectionType.SQLSERVER]: ['port', 'password', 'sslConfig'],
        [ConnectionType.ORACLE]: ['port', 'password', 'sslConfig'],
        [ConnectionType.MONGODB]: ['port', 'password', 'database', 'sslConfig'],
        [ConnectionType.REDIS]: ['port', 'password', 'sslConfig'],
      };

    return options[type] || [];
  }

  /**
   * 检查连接类型是否支持SSL
   */
  private supportsSSLForType(type: ConnectionType): boolean {
    const sslSupportedTypes = [
      ConnectionType.MYSQL,
      ConnectionType.POSTGRESQL,
      ConnectionType.SQLSERVER,
      ConnectionType.MONGODB,
      ConnectionType.REDIS,
    ];

    return sslSupportedTypes.includes(type);
  }

  /**
   * 检查连接类型是否支持SSH
   */
  private supportsSSHForType(type: ConnectionType): boolean {
    const sshSupportedTypes = [
      ConnectionType.MYSQL,
      ConnectionType.POSTGRESQL,
      ConnectionType.SQLSERVER,
      ConnectionType.ORACLE,
    ];

    return sshSupportedTypes.includes(type);
  }

  /**
   * 获取连接类别描述
   */
  private getCategoryDescription(category: ConnectionCategory): string {
    const descriptions = {
      [ConnectionCategory.DEVELOPMENT]: '开发环境数据库连接',
      [ConnectionCategory.STAGING]: '测试环境数据库连接',
      [ConnectionCategory.PRODUCTION]: '生产环境数据库连接',
      [ConnectionCategory.TESTING]: '自动化测试数据库连接',
      [ConnectionCategory.BACKUP]: '备份或恢复数据库连接',
    };

    return descriptions[category] || '';
  }
}

export const connectionController = new ConnectionController();

// 导出路由处理函数
export const getConnections = connectionController.getConnections.bind(connectionController);
export const createConnection = connectionController.createConnection.bind(connectionController);
export const getConnectionById = connectionController.getConnectionById.bind(connectionController);
export const updateConnection = connectionController.updateConnection.bind(connectionController);
export const deleteConnection = connectionController.deleteConnection.bind(connectionController);
export const testConnection = connectionController.testConnection.bind(connectionController);
export const cloneConnection = connectionController.cloneConnection.bind(connectionController);
export const testMultipleConnections = connectionController.testMultipleConnections.bind(connectionController);
export const getConnectionStats = connectionController.getConnectionStats.bind(connectionController);
export const getConnectionProjects = connectionController.getConnectionProjects.bind(connectionController);
export const exportConnection = connectionController.exportConnection.bind(connectionController);
export const getConnectionTypes = connectionController.getConnectionTypes.bind(connectionController);
export const getConnectionCategories = connectionController.getConnectionCategories.bind(connectionController);