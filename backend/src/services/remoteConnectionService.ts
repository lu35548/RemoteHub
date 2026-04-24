import { RemoteConnectionRepository } from '@/repositories/RemoteConnectionRepository';
import { RemoteConnection, RemoteProtocol } from '@/models/RemoteConnection';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * RemoteConnection Service
 * 提供远程连接的业务逻辑层，与现有Service模式保持一致
 */
export class RemoteConnectionService {
  private remoteConnectionRepository: RemoteConnectionRepository;

  constructor() {
    this.remoteConnectionRepository = new RemoteConnectionRepository();
  }

  /**
   * 创建远程连接
   */
  async createConnection(
    userId: string,
    connectionData: Partial<RemoteConnection>
  ): Promise<RemoteConnection> {
    // 验证连接配置
    const validation = this.remoteConnectionRepository.validateConnectionConfig(connectionData);
    if (!validation.isValid) {
      throw new AppError(`连接配置无效: ${validation.errors.join(', ')}`, 400, true, 'INVALID_CONNECTION_CONFIG');
    }

    // 设置默认值
    const connection = {
      ...connectionData,
      ownerId: userId,
      createdBy: userId,
      createdById: userId,
      updatedBy: userId,
      updatedById: userId,
      isActive: connectionData.isActive !== undefined ? connectionData.isActive : true,
      accessCount: 0,
    };

    try {
      const newConnection = await this.remoteConnectionRepository.create(connection);
      logger.info(`创建远程连接成功: ${newConnection.name} (ID: ${newConnection.id})`);
      return newConnection;
    } catch (error) {
      logger.error('创建远程连接失败:', error);
      throw new AppError('创建远程连接失败', 500, true, 'CREATE_CONNECTION_FAILED');
    }
  }

  /**
   * 获取用户的远程连接列表
   */
  async getUserConnections(
    userId: string,
    options: {
      projectId?: string;
      protocol?: RemoteProtocol;
      query?: string;
      tags?: string[];
      isActive?: boolean;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ connections: RemoteConnection[]; total: number; page: number; totalPages: number }> {
    const limit = options.limit || 20;
    const page = options.page || 1;
    const offset = (page - 1) * limit;

    const searchCriteria = {
      userId,
      projectId: options.projectId,
      protocol: options.protocol,
      query: options.query,
      tags: options.tags,
      isActive: options.isActive,
      limit,
      offset,
    };

    const { connections, total } = await this.remoteConnectionRepository.search(searchCriteria);
    const totalPages = Math.ceil(total / limit);

    return {
      connections,
      total,
      page,
      totalPages,
    };
  }

  /**
   * 根据ID获取远程连接
   */
  async getConnectionById(userId: string, connectionId: string): Promise<RemoteConnection> {
    const connection = await this.remoteConnectionRepository.findById(connectionId);

    if (!connection) {
      throw new AppError('连接不存在', 404, true, 'CONNECTION_NOT_FOUND');
    }

    // 检查权限
    if (connection.ownerId !== userId) {
      throw new AppError('没有权限访问此连接', 403, true, 'ACCESS_DENIED');
    }

    return connection;
  }

  /**
   * 更新远程连接
   */
  async updateConnection(
    userId: string,
    connectionId: string,
    updateData: Partial<RemoteConnection>
  ): Promise<RemoteConnection> {
    const existingConnection = await this.getConnectionById(userId, connectionId);

    // 验证更新后的配置
    const validation = this.remoteConnectionRepository.validateConnectionConfig({
      ...existingConnection,
      ...updateData,
    });
    if (!validation.isValid) {
      throw new AppError(`连接配置无效: ${validation.errors.join(', ')}`, 400, true, 'INVALID_CONNECTION_CONFIG');
    }

    // 设置更新者信息
    updateData.updatedBy = userId;
    updateData.updatedById = userId;

    try {
      const updatedConnection = await this.remoteConnectionRepository.update(connectionId, updateData);
      if (!updatedConnection) {
        throw new AppError('更新连接失败', 500, true, 'UPDATE_CONNECTION_FAILED');
      }

      logger.info(`更新远程连接成功: ${updatedConnection.name} (ID: ${updatedConnection.id})`);
      return updatedConnection;
    } catch (error) {
      logger.error('更新远程连接失败:', error);
      throw new AppError('更新连接失败', 500, true, 'UPDATE_CONNECTION_FAILED');
    }
  }

  /**
   * 删除远程连接
   */
  async deleteConnection(userId: string, connectionId: string): Promise<void> {
    const existingConnection = await this.getConnectionById(userId, connectionId);

    try {
      const success = await this.remoteConnectionRepository.delete(connectionId);
      if (!success) {
        throw new AppError('删除连接失败', 500, true, 'DELETE_CONNECTION_FAILED');
      }

      logger.info(`删除远程连接成功: ${existingConnection.name} (ID: ${existingConnection.id})`);
    } catch (error) {
      logger.error('删除远程连接失败:', error);
      throw new AppError('删除连接失败', 500, true, 'DELETE_CONNECTION_FAILED');
    }
  }

  /**
   * 批量删除远程连接
   */
  async deleteConnections(userId: string, connectionIds: string[]): Promise<number> {
    let deletedCount = 0;

    for (const connectionId of connectionIds) {
      try {
        await this.deleteConnection(userId, connectionId);
        deletedCount++;
      } catch (error) {
        logger.error(`删除连接失败: ${connectionId}`, error);
      }
    }

    return deletedCount;
  }

  /**
   * 记录连接访问
   */
  async recordAccess(userId: string, connectionId: string): Promise<void> {
    try {
      // 验证访问权限
      await this.getConnectionById(userId, connectionId);

      // 更新访问统计
      await this.remoteConnectionRepository.updateAccessStats(connectionId);

      logger.info(`记录连接访问: ${connectionId} by ${userId}`);
    } catch (error) {
      logger.error(`记录连接访问失败: ${connectionId}`, error);
      // 不抛出错误，避免影响主流程
    }
  }

  /**
   * 获取连接统计
   */
  async getConnectionStats(userId: string): Promise<{
    total: number;
    byProtocol: Record<string, number>;
    active: number;
    recentlyAccessed: number;
  }> {
    return await this.remoteConnectionRepository.getConnectionStats(userId);
  }

  /**
   * 获取支持的协议类型
   */
  getSupportedProtocols(): Array<{
    protocol: string;
    displayName: string;
    icon: string;
    defaultPort: number;
  }> {
    const protocols = Object.values(RemoteProtocol) as RemoteProtocol[];

    return protocols.map(protocol => {
      const connection = new RemoteConnection();
      connection.protocol = protocol;

      return {
        protocol,
        displayName: connection.protocolDisplayName,
        icon: connection.protocolIcon,
        defaultPort: connection.defaultPort,
      };
    });
  }

  /**
   * 根据标签查找连接
   */
  async getConnectionsByTag(userId: string, tag: string): Promise<RemoteConnection[]> {
    return await this.remoteConnectionRepository.findByTag(tag, userId);
  }

  /**
   * 获取最近访问的连接
   */
  async getRecentlyAccessed(userId: string, limit: number = 10): Promise<RemoteConnection[]> {
    return await this.remoteConnectionRepository.getRecentlyAccessed(userId, limit);
  }

  /**
   * 克隆连接
   */
  async cloneConnection(userId: string, connectionId: string, newName?: string): Promise<RemoteConnection> {
    const originalConnection = await this.getConnectionById(userId, connectionId);

    const clonedConnection = originalConnection.clone(newName || `${originalConnection.name} (副本)`);
    clonedConnection.createdBy = 'Clone';
    clonedConnection.createdById = userId;

    return await this.remoteConnectionRepository.create(clonedConnection);
  }
}