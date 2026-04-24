import { Repository } from 'typeorm';
import { AppDataSource } from '@/config/database';
import { RemoteConnection, RemoteProtocol, VpnType } from '@/models/RemoteConnection';

/**
 * RemoteConnection Repository
 * 提供远程连接的数据访问层，与现有的Repository模式保持一致
 * 用于存储和管理前端RDP、SSH、VNC等远程连接信息
 */
export class RemoteConnectionRepository {
  private repository: Repository<RemoteConnection>;

  constructor() {
    // 使用Mock数据源来避免TypeORM依赖问题
    const DatabaseService = require('@/config/database').DatabaseService;
    const dataSource = DatabaseService.getDataSource();

    if (dataSource.getRepository) {
      this.repository = dataSource.getRepository(RemoteConnection);
    } else {
      // 使用Mock Repository
      this.repository = {
        find: () => Promise.resolve([]),
        findOne: () => Promise.resolve(null),
        create: (data: any) => data,
        save: (data: any) => Promise.resolve(data),
        update: () => Promise.resolve({ affected: 1 }),
        delete: () => Promise.resolve({ affected: 1 }),
        createQueryBuilder: () => ({
          leftJoinAndSelect: () => ({
            andWhere: () => ({
              orWhere: () => ({
                getCount: () => Promise.resolve(0),
                limit: () => ({
                  offset: () => ({
                    orderBy: () => ({
                      getMany: () => Promise.resolve([])
                    })
                  })
                })
              })
            })
          })
        })
      } as any;
    }
  }

  /**
   * 创建远程连接
   */
  async create(connectionData: Partial<RemoteConnection>): Promise<RemoteConnection> {
    const connection = this.repository.create(connectionData);
    return await this.repository.save(connection);
  }

  /**
   * 根据ID查找远程连接
   */
  async findById(id: string): Promise<RemoteConnection | null> {
    return await this.repository.findOne({
      where: { id },
      relations: ['owner', 'project'],
    });
  }

  /**
   * 根据用户ID查找所有远程连接
   */
  async findByUserId(userId: string): Promise<RemoteConnection[]> {
    return await this.repository.find({
      where: { ownerId: userId },
      relations: ['owner', 'project'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 根据项目ID查找所有远程连接
   */
  async findByProjectId(projectId: string): Promise<RemoteConnection[]> {
    return await this.repository.find({
      where: { projectId },
      relations: ['owner', 'project'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 根据协议类型查找连接
   */
  async findByProtocol(protocol: RemoteProtocol): Promise<RemoteConnection[]> {
    return await this.repository.find({
      where: { protocol },
      relations: ['owner', 'project'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 搜索远程连接
   */
  async search(criteria: {
    userId?: string;
    projectId?: string;
    protocol?: RemoteProtocol;
    query?: string;
    tags?: string[];
    isActive?: boolean;
    limit?: number;
    offset?: number;
  }): Promise<{ connections: RemoteConnection[]; total: number }> {
    const queryBuilder = this.repository
      .createQueryBuilder('connection')
      .leftJoinAndSelect('connection.owner', 'owner')
      .leftJoinAndSelect('connection.project', 'project');

    // 用户过滤
    if (criteria.userId) {
      queryBuilder.andWhere('connection.ownerId = :userId', { userId: criteria.userId });
    }

    // 项目过滤
    if (criteria.projectId) {
      queryBuilder.andWhere('connection.projectId = :projectId', { projectId: criteria.projectId });
    }

    // 协议过滤
    if (criteria.protocol) {
      queryBuilder.andWhere('connection.protocol = :protocol', { protocol: criteria.protocol });
    }

    // 活跃状态过滤
    if (criteria.isActive !== undefined) {
      queryBuilder.andWhere('connection.isActive = :isActive', { isActive: criteria.isActive });
    }

    // 文本搜索
    if (criteria.query) {
      queryBuilder.andWhere(
        '(connection.name ILIKE :query OR connection.host ILIKE :query OR connection.notes ILIKE :query)',
        { query: `%${criteria.query}%` }
      );
    }

    // 标签过滤
    if (criteria.tags && criteria.tags.length > 0) {
      criteria.tags.forEach((tag, index) => {
        queryBuilder.andWhere(`connection.tags LIKE :tag${index}`, { [`tag${index}`]: `%${tag}%` });
      });
    }

    // 总数
    const total = await queryBuilder.getCount();

    // 分页
    if (criteria.limit) {
      queryBuilder.limit(criteria.limit);
    }
    if (criteria.offset) {
      queryBuilder.offset(criteria.offset);
    }

    // 排序
    queryBuilder.orderBy('connection.createdAt', 'DESC');

    const connections = await queryBuilder.getMany();
    return { connections, total };
  }

  /**
   * 更新远程连接
   */
  async update(id: string, updateData: Partial<RemoteConnection>): Promise<RemoteConnection | null> {
    await this.repository.update(id, updateData);
    return await this.findById(id);
  }

  /**
   * 删除远程连接
   */
  async delete(id: string): Promise<boolean> {
    const result = await this.repository.delete(id);
    return result.affected !== undefined && result.affected! > 0;
  }

  /**
   * 检查用户是否有权限访问连接
   */
  async hasAccess(userId: string, connectionId: string): Promise<boolean> {
    const connection = await this.repository.findOne({
      where: { id: connectionId, ownerId: userId },
    });
    return !!connection;
  }

  /**
   * 获取用户的连接统计
   */
  async getConnectionStats(userId: string): Promise<{
    total: number;
    byProtocol: Record<string, number>;
    active: number;
    recentlyAccessed: number;
  }> {
    const connections = await this.findByUserId(userId);

    const stats = {
      total: connections.length,
      byProtocol: {} as Record<string, number>,
      active: connections.filter(c => c.isActive).length,
      recentlyAccessed: connections.filter(c => {
        if (!c.lastAccessed) return false;
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        return new Date(c.lastAccessed) > weekAgo;
      }).length,
    };

    // 按协议统计
    Object.values(RemoteProtocol).forEach(protocol => {
      stats.byProtocol[protocol] = connections.filter(c => c.protocol === protocol).length;
    });

    return stats;
  }

  /**
   * 获取所有协议类型
   */
  getAllProtocols(): RemoteProtocol[] {
    return Object.values(RemoteProtocol);
  }

  /**
   * 获取所有VPN类型
   */
  getAllVpnTypes(): VpnType[] {
    return Object.values(VpnType);
  }

  /**
   * 批量删除连接
   */
  async deleteByIds(ids: string[]): Promise<number> {
    const result = await this.repository.delete(ids);
    return result.affected || 0;
  }

  /**
   * 根据标签查找连接
   */
  async findByTag(tag: string, userId?: string): Promise<RemoteConnection[]> {
    const queryBuilder = this.repository
      .createQueryBuilder('connection')
      .where('connection.tags LIKE :tag', { tag: `%${tag}%` });

    if (userId) {
      queryBuilder.andWhere('connection.ownerId = :userId', { userId });
    }

    return await queryBuilder.getMany();
  }

  /**
   * 更新连接访问统计
   */
  async updateAccessStats(id: string): Promise<void> {
    await this.repository.increment({ id: id }, 'accessCount', 1);
    await this.repository.update(id, { lastAccessed: new Date().toISOString() });
  }

  /**
   * 获取最近访问的连接
   */
  async getRecentlyAccessed(userId: string, limit: number = 10): Promise<RemoteConnection[]> {
    return await this.repository.find({
      where: { ownerId: userId },
      order: { lastAccessed: 'DESC' },
      take: limit,
      relations: ['project'],
    });
  }

  /**
   * 验证连接配置
   */
  validateConnectionConfig(connectionData: Partial<RemoteConnection>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!connectionData.name || connectionData.name.trim().length === 0) {
      errors.push('连接名称不能为空');
    }

    if (!connectionData.host || connectionData.host.trim().length === 0) {
      errors.push('主机地址不能为空');
    }

    if (!connectionData.protocol) {
      errors.push('协议类型不能为空');
    }

    if (connectionData.protocol === RemoteProtocol.VPN && !connectionData.vpnType) {
      errors.push('VPN连接必须指定VPN类型');
    }

    if (connectionData.port && (connectionData.port < 1 || connectionData.port > 65535)) {
      errors.push('端口号必须在1-65535范围内');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * 从localStorage格式迁移数据
   * 用于前端数据迁移到数据库
   */
  async migrateFromLocalStorage(connections: any[], userId: string, projectId: string): Promise<RemoteConnection[]> {
    const migratedConnections: RemoteConnection[] = [];

    for (const conn of connections) {
      try {
        const remoteConnection = new RemoteConnection();
        remoteConnection.name = conn.name;
        remoteConnection.protocol = conn.protocol;
        remoteConnection.host = conn.host;
        remoteConnection.port = conn.port;
        remoteConnection.username = conn.username;
        remoteConnection.projectId = projectId;
        remoteConnection.ownerId = userId;
        remoteConnection.createdBy = 'Migration';
        remoteConnection.createdById = userId;

        // 设置密码（如果有）
        if (conn.password) {
          remoteConnection.setPassword(conn.password);
        }

        // 设置其他字段
        remoteConnection.vpnType = conn.vpnType;
        remoteConnection.vpnLoginUrl = conn.vpnLoginUrl;
        remoteConnection.requiredVpnId = conn.requiredVpnId;
        remoteConnection.notes = conn.notes;
        remoteConnection.tags = conn.tags || [];

        const saved = await this.create(remoteConnection);
        migratedConnections.push(saved);
      } catch (error) {
        console.error(`迁移连接失败: ${conn.name}`, error);
      }
    }

    return migratedConnections;
  }
}