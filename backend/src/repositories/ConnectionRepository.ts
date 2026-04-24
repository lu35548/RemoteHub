import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Connection } from '../models/Connection';
import { ProjectConnection } from '../models/Project';
import { User } from '../models/User';
import {
  ConnectionType,
  ConnectionStatus,
  ConnectionSecurityLevel,
  ConnectionCategory,
} from '../enums/ConnectionEnums';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { DatabaseEncryption } from '../utils/database';
import { v4 as uuidv4 } from 'uuid';

export interface ConnectionListOptions {
  page?: number;
  limit?: number;
  type?: ConnectionType;
  status?: ConnectionStatus;
  category?: ConnectionCategory;
  securityLevel?: ConnectionSecurityLevel;
  search?: string;
  tags?: string[];
  ownerId?: string;
  projectId?: string;
  sortBy?: 'name' | 'type' | 'status' | 'createdAt' | 'updatedAt' | 'lastTestedAt';
  sortOrder?: 'ASC' | 'DESC';
  includeTests?: boolean;
}

export interface ConnectionListResult {
  connections: Connection[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface TestConnectionOptions {
  timeout?: number;
  retryCount?: number;
}

export class ConnectionRepository {
  private dataSource: DataSource;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  private get repository(): Repository<Connection> {
    return this.dataSource.getRepository(Connection);
  }

  /**
   * 创建连接
   */
  async createConnection(connectionData: Partial<Connection>): Promise<Connection> {
    try {
      // 验证必需字段
      if (!connectionData.name) {
        throw new ValidationError('连接名称是必需的');
      }

      if (!connectionData.type) {
        throw new ValidationError('连接类型是必需的');
      }

      if (!connectionData.ownerId) {
        throw new ValidationError('连接所有者是必需的');
      }

      // 处理密码加密 - 等待保存时在控制器中处理
      // 不在这里处理密码，让控制器负责

      // 检查连接名称是否已存在（同一所有者下）
      const existingConnection = await this.repository.findOne({
        where: {
          name: connectionData.name,
          ownerId: connectionData.ownerId,
        },
      });

      if (existingConnection) {
        throw new ConflictError('连接名称已存在');
      }

      // 准备连接数据，设置必需字段
      const connectionToCreate = {
        ...connectionData,
        id: uuidv4(),
        status: ConnectionStatus.INACTIVE,
        category: connectionData.category || ConnectionCategory.DEVELOPMENT,
        securityLevel: connectionData.securityLevel || ConnectionSecurityLevel.NONE,
      };

      // 创建连接实体 - 使用save直接创建，这样在Mock模式下会触发Mock的create逻辑
      const savedConnection = await this.repository.save(connectionToCreate);

      logger.info('连接创建成功', {
        connectionId: savedConnection.id,
        connectionName: savedConnection.name,
        type: savedConnection.type,
        ownerId: savedConnection.ownerId,
      });

      return savedConnection;
    } catch (error) {
      logger.error('创建连接失败', {
        error: error instanceof Error ? error.message : '未知错误',
        connectionData: {
          name: connectionData.name,
          type: connectionData.type,
          ownerId: connectionData.ownerId,
        },
      });
      throw error;
    }
  }

  /**
   * 获取用户可访问的连接列表（优化版本）
   */
  async getAccessibleConnections(
    userId: string,
    options: ConnectionListOptions = {}
  ): Promise<ConnectionListResult> {
    try {

      const {
        page = 1,
        limit = 10,
        type,
        status,
        category,
        securityLevel,
        search,
        tags,
        ownerId,
        projectId,
        sortBy = 'updatedAt',
        sortOrder = 'DESC',
      } = options;

      // 首先获取可访问的连接ID列表
      let idSubQuery: SelectQueryBuilder<Connection>;

      if (projectId) {
        // 通过项目关联获取连接ID
        idSubQuery = this.repository.createQueryBuilder('connection')
          .select('connection.id')
          .innerJoin(ProjectConnection, 'pc', 'pc.connectionId = connection.id')
          .innerJoin('pc.project', 'project')
          .innerJoin('project.members', 'member', 'member.userId = :userId AND member.status = :status')
          .where('pc.projectId = :projectId', { projectId, userId, status: 'active' });
      } else {
        // 获取用户拥有的连接ID
        idSubQuery = this.repository.createQueryBuilder('connection')
          .select('connection.id')
          .where('connection.ownerId = :ownerId', {
            ownerId: ownerId || userId
          });
      }

      // 添加过滤条件到子查询
      if (type) {
        idSubQuery.andWhere('connection.type = :type', { type });
      }
      if (status) {
        idSubQuery.andWhere('connection.status = :status', { status });
      }
      if (category) {
        idSubQuery.andWhere('connection.category = :category', { category });
      }
      if (securityLevel) {
        idSubQuery.andWhere('connection.securityLevel = :securityLevel', { securityLevel });
      }
      if (search) {
        idSubQuery.andWhere(
          '(connection.name ILIKE :search OR connection.description ILIKE :search OR connection.host ILIKE :search)',
          { search: `%${search}%` }
        );
      }
      if (tags && tags.length > 0) {
        const tagConditions = tags.map(tag => `connection.tags LIKE :tag${tags.indexOf(tag)}`);
        idSubQuery.andWhere(`(${tagConditions.join(' OR ')})`,
          Object.fromEntries(tags.map((tag, index) => [`tag${index}`, `%,${tag},%`]))
        );
      }

      // 主查询：只选择必要的字段
      const queryBuilder = this.repository.createQueryBuilder('connection')
        .select([
          'connection.id',
          'connection.name',
          'connection.description',
          'connection.type',
          'connection.status',
          'connection.category',
          'connection.securityLevel',
          'connection.host',
          'connection.port',
          'connection.database',
          'connection.username',
          'connection.createdAt',
          'connection.updatedAt',
          'connection.lastTestedAt',
          'connection.lastTestStatus',
          'connection.tags',
          'connection.metadata',
        ])
        .leftJoin('connection.owner', 'owner')
        .addSelect([
          'owner.id',
          'owner.username',
          'owner.email',
          'owner.firstName',
          'owner.lastName',
        ])
        .where(`connection.id IN (${idSubQuery.getQuery()})`)
        .setParameters(idSubQuery.getParameters());

      // 排序
      queryBuilder.orderBy(`connection.${sortBy}`, sortOrder);

      // 分页
      const skip = (page - 1) * limit;
      queryBuilder.skip(skip).take(limit);

      // 执行查询
      const [connections, total] = await queryBuilder.getManyAndCount();

      // 计算总页数
      const totalPages = Math.ceil(total / limit);

      return {
        connections,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('获取连接列表失败', {
        error: error instanceof Error ? error.message : '未知错误',
        userId,
        options,
      });
      throw error;
    }
  }

  /**
   * 根据ID获取连接（带权限检查）
   */
  async getConnectionById(id: string, userId?: string): Promise<Connection> {
    try {
      const queryBuilder = this.repository.createQueryBuilder('connection')
        .leftJoinAndSelect('connection.owner', 'owner')
        .where('connection.id = :id', { id });

      // 如果提供了用户ID，检查权限
      if (userId) {
        queryBuilder.andWhere('connection.ownerId = :userId', { userId });
      }

      const connection = await queryBuilder.getOne();

      if (!connection) {
        throw new NotFoundError('连接不存在或无权限访问');
      }

      return connection;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      logger.error('获取连接详情失败', {
        error: error instanceof Error ? error.message : '未知错误',
        connectionId: id,
        userId,
      });
      throw error;
    }
  }

  /**
   * 更新连接
   */
  async updateConnection(
    id: string,
    userId: string,
    updateData: Partial<Connection>
  ): Promise<Connection> {
    try {
      // 获取连接并验证权限
      const connection = await this.getConnectionById(id, userId);

      // 验证所有者权限
      if (connection.ownerId !== userId) {
        throw new UnauthorizedError('无权限修改此连接');
      }

      // 如果更新名称，检查重复
      if (updateData.name && updateData.name !== connection.name) {
        const existingConnection = await this.repository.findOne({
          where: {
            name: updateData.name,
            ownerId: connection.ownerId,
          },
        });

        if (existingConnection) {
          throw new ConflictError('连接名称已存在');
        }
      }

      // 处理密码更新
      if ((updateData as any).password) {
        connection.setPassword((updateData as any).password);
        delete (updateData as any).password;
      } else if ((updateData as any)._encryptedPassword) {
        connection._encryptedPassword = (updateData as any)._encryptedPassword;
      }

      // 处理SSH配置更新
      if (updateData.sshConfig) {
        if (updateData.sshConfig.password) {
          connection.setSSHPassword(updateData.sshConfig.password);
        }
        if (updateData.sshConfig.privateKey) {
          connection.setSSHPrivateKey(updateData.sshConfig.privateKey);
        }
        if (updateData.sshConfig.passphrase) {
          connection.setSSHPassphrase(updateData.sshConfig.passphrase);
        }
      }

      // 更新连接
      await this.repository.update(id, updateData);

      // 获取更新后的连接
      const updatedConnection = await this.getConnectionById(id);

      logger.info('连接更新成功', {
        connectionId: id,
        userId,
        updatedFields: Object.keys(updateData),
      });

      return updatedConnection;
    } catch (error) {
      if (error instanceof NotFoundError ||
          error instanceof UnauthorizedError ||
          error instanceof ConflictError) {
        throw error;
      }
      logger.error('更新连接失败', {
        error: error instanceof Error ? error.message : '未知错误',
        connectionId: id,
        userId,
        updateData,
      });
      throw error;
    }
  }

  /**
   * 删除连接
   */
  async deleteConnection(id: string, userId: string): Promise<void> {
    try {
      // 获取连接并验证权限
      const connection = await this.getConnectionById(id, userId);

      // 验证所有者权限
      if (connection.ownerId !== userId) {
        throw new UnauthorizedError('无权限删除此连接');
      }

      // 删除连接（级联删除相关数据）
      await this.repository.delete(id);

      logger.info('连接删除成功', {
        connectionId: id,
        userId,
        connectionName: connection.name,
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('删除连接失败', {
        error: error instanceof Error ? error.message : '未知错误',
        connectionId: id,
        userId,
      });
      throw error;
    }
  }

  /**
   * 测试连接
   */
  async testConnection(
    id: string,
    userId: string,
    options: TestConnectionOptions = {}
  ): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      // 获取连接并验证权限
      const connection = await this.getConnectionById(id, userId);

      // 验证所有者权限
      if (connection.ownerId !== userId) {
        throw new UnauthorizedError('无权限测试此连接');
      }

      // 这里应该实现实际的连接测试逻辑
      // 暂时返回模拟结果
      const testResult = await this.performConnectionTest(connection, options);

      // 更新测试结果
      connection.recordTestAttempt(
        testResult.success ? 'passed' : 'failed',
        testResult.message
      );

      await this.repository.save(connection);

      logger.info('连接测试完成', {
        connectionId: id,
        userId,
        success: testResult.success,
        message: testResult.message,
      });

      return testResult;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('测试连接失败', {
        error: error instanceof Error ? error.message : '未知错误',
        connectionId: id,
        userId,
      });
      return {
        success: false,
        message: '测试失败：' + (error instanceof Error ? error.message : '未知错误'),
      };
    }
  }

  /**
   * 执行实际的连接测试
   * 这是一个占位符实现，实际应该根据连接类型进行相应的测试
   */
  private async performConnectionTest(
    connection: Connection,
    options: TestConnectionOptions
  ): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    // TODO: 实现实际的连接测试逻辑
    // 这里需要根据连接类型（MySQL、PostgreSQL、SQL Server等）实现相应的测试

    // 模拟测试延迟
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 模拟测试结果（实际应该根据连接配置进行真实测试）
    const success = Math.random() > 0.2; // 80% 成功率

    return {
      success,
      message: success ? '连接成功' : '连接失败：无法连接到数据库服务器',
      details: {
        host: connection.host,
        port: connection.port,
        database: connection.database,
        testTime: new Date().toISOString(),
      },
    };
  }

  /**
   * 克隆连接
   */
  async cloneConnection(id: string, userId: string, newName?: string): Promise<Connection> {
    try {
      // 获取原连接
      const originalConnection = await this.getConnectionById(id, userId);

      // 验证所有者权限
      if (originalConnection.ownerId !== userId) {
        throw new UnauthorizedError('无权限克隆此连接');
      }

      // 克隆连接
      const clonedConnection = originalConnection.clone(newName);
      clonedConnection.ownerId = userId;
      clonedConnection.id = uuidv4();

      // 保存克隆的连接
      const savedConnection = await this.repository.save(clonedConnection);

      logger.info('连接克隆成功', {
        originalConnectionId: id,
        newConnectionId: savedConnection.id,
        userId,
      });

      return savedConnection;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('克隆连接失败', {
        error: error instanceof Error ? error.message : '未知错误',
        connectionId: id,
        userId,
      });
      throw error;
    }
  }

  /**
   * 获取连接统计信息
   */
  async getConnectionStats(userId: string): Promise<{
    total: number;
    active: number;
    inactive: number;
    error: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
  }> {
    try {
      const stats = await this.repository.createQueryBuilder('connection')
        .select([
          'COUNT(*) as total',
          'COUNT(CASE WHEN status = :active THEN 1 END) as active',
          'COUNT(CASE WHEN status = :inactive THEN 1 END) as inactive',
          'COUNT(CASE WHEN status = :error THEN 1 END) as error',
          'type',
          'category',
        ])
        .where('ownerId = :userId', {
          userId,
          active: ConnectionStatus.ACTIVE,
          inactive: ConnectionStatus.INACTIVE,
          error: ConnectionStatus.ERROR,
        })
        .groupBy('type, category')
        .getRawMany();

      const result = {
        total: 0,
        active: 0,
        inactive: 0,
        error: 0,
        byType: {} as Record<string, number>,
        byCategory: {} as Record<string, number>,
      };

      stats.forEach(stat => {
        result.total += parseInt(stat.total) || 0;
        result.active += parseInt(stat.active) || 0;
        result.inactive += parseInt(stat.inactive) || 0;
        result.error += parseInt(stat.error) || 0;

        if (stat.type) {
          result.byType[stat.type] = (result.byType[stat.type] || 0) + parseInt(stat.total) || 0;
        }

        if (stat.category) {
          result.byCategory[stat.category] = (result.byCategory[stat.category] || 0) + parseInt(stat.total) || 0;
        }
      });

      return result;
    } catch (error) {
      logger.error('获取连接统计失败', {
        error: error instanceof Error ? error.message : '未知错误',
        userId,
      });
      return {
        total: 0,
        active: 0,
        inactive: 0,
        error: 0,
        byType: {},
        byCategory: {},
      };
    }
  }

  /**
   * 批量测试连接
   */
  async testMultipleConnections(
    ids: string[],
    userId: string,
    options: TestConnectionOptions = {}
  ): Promise<Array<{
    id: string;
    name: string;
    success: boolean;
    message: string;
  }>> {
    try {
      const results = [];

      for (const id of ids) {
        try {
          const connection = await this.getConnectionById(id, userId);
          if (connection.ownerId !== userId) {
            continue;
          }

          const testResult = await this.testConnection(id, userId, options);

          results.push({
            id,
            name: connection.name,
            success: testResult.success,
            message: testResult.message,
          });
        } catch (error) {
          results.push({
            id,
            name: '未知',
            success: false,
            message: error instanceof Error ? error.message : '测试失败',
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('批量测试连接失败', {
        error: error instanceof Error ? error.message : '未知错误',
        userId,
        ids,
      });
      throw error;
    }
  }

  /**
   * Mock模式：获取用户可访问的连接列表（简化版）
   */
  private async getAccessibleConnectionsMock(
    userId: string,
    options: ConnectionListOptions = {}
  ): Promise<ConnectionListResult> {
    try {
      const {
        page = 1,
        limit = 10,
        type,
        status,
        category,
        securityLevel,
        search,
        sortBy = 'updatedAt',
        sortOrder = 'DESC',
      } = options;

      // 从Mock数据库获取所有连接
      const allConnections = await this.repository.find();

      // 过滤：用户可访问的连接（自己拥有）
      let accessibleConnections = allConnections.filter(connection =>
        connection.ownerId === userId // 用户是所有者
        // TODO: 添加项目成员检查（目前简化处理）
      );

      // 应用过滤条件
      if (type) {
        accessibleConnections = accessibleConnections.filter(c => c.type === type);
      }
      if (status) {
        accessibleConnections = accessibleConnections.filter(c => c.status === status);
      }
      if (category) {
        accessibleConnections = accessibleConnections.filter(c => c.category === category);
      }
      if (securityLevel) {
        accessibleConnections = accessibleConnections.filter(c => c.securityLevel === securityLevel);
      }
      if (search) {
        const searchLower = search.toLowerCase();
        accessibleConnections = accessibleConnections.filter(c =>
          c.name.toLowerCase().includes(searchLower) ||
          (c.description && c.description.toLowerCase().includes(searchLower)) ||
          (c.host && c.host.toLowerCase().includes(searchLower))
        );
      }

      // 排序
      accessibleConnections.sort((a, b) => {
        let aValue = a[sortBy as keyof Connection];
        let bValue = b[sortBy as keyof Connection];

        // 处理日期
        if (aValue instanceof Date) aValue = aValue.getTime();
        if (bValue instanceof Date) bValue = bValue.getTime();

        if (sortOrder === 'ASC') {
          return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
        } else {
          return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
        }
      });

      // 分页
      const total = accessibleConnections.length;
      const totalPages = Math.ceil(total / limit);
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const connections = accessibleConnections.slice(startIndex, endIndex);

      return {
        connections,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('获取连接列表失败', {
        error: error instanceof Error ? error.message : '未知错误',
        userId,
        options,
      });

      return {
        connections: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };
    }
  }

  /**
   * 获取连接数据用于导出
   */
  public async findConnectionsForExport(filters: {
    type?: string;
    status?: string;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    ownerId?: string;
  }, limit: number = 1000): Promise<Connection[]> {
    const queryBuilder = this.repository.createQueryBuilder('connection')
      .leftJoin('connection.owner', 'owner')
      .addSelect(['owner.username', 'ownerName']);

    // 应用过滤器
    if (filters.type) {
      queryBuilder.andWhere('connection.type = :type', { type: filters.type });
    }

    if (filters.status) {
      queryBuilder.andWhere('connection.status = :status', { status: filters.status });
    }

    if (filters.ownerId) {
      queryBuilder.andWhere('connection.ownerId = :ownerId', { ownerId: filters.ownerId });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(connection.name LIKE :search OR connection.host LIKE :search OR connection.database LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.startDate) {
      queryBuilder.andWhere('connection.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('connection.createdAt <= :endDate', { endDate: filters.endDate });
    }

    return queryBuilder
      .orderBy('connection.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }
}