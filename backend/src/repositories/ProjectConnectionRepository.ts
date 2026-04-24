import { DataSource, Repository } from 'typeorm';
import { ProjectConnection } from '../models/Project';
import { Project } from '../models/Project';
import { Connection } from '../models/Connection';
import { User } from '../models/User';
import { ConnectionRepository } from './ConnectionRepository';
import { ProjectRepository } from './ProjectRepository';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ProjectConnectionListOptions {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  search?: string;
  sortBy?: 'name' | 'type' | 'addedAt' | 'lastTestedAt' | 'testStatus';
  sortOrder?: 'ASC' | 'DESC';
}

export interface ProjectConnectionListResult {
  connections: Array<ProjectConnection & {
    connection: Connection;
    addedByUser: User;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface AddConnectionOptions {
  alias?: string;
  description?: string;
  category?: string;
  permissions?: {
    canView?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canTest?: boolean;
    canExport?: boolean;
  };
  tags?: string[];
}

export class ProjectConnectionRepository {
  constructor(private dataSource: DataSource) {}

  private get repository(): Repository<ProjectConnection> {
    return this.dataSource.getRepository(ProjectConnection);
  }

  private get connectionRepository(): Repository<Connection> {
    return this.connectionRepository;
  }

  private get projectRepository(): Repository<Project> {
    return this.projectRepository;
  }

  private get userRepository(): Repository<User> {
    return this.userRepository;
  }

  /**
   * 添加连接到项目
   */
  async addConnectionToProject(
    projectId: string,
    connectionId: string,
    userId: string,
    options: AddConnectionOptions = {}
  ): Promise<ProjectConnection> {
    try {
      // 验证项目存在
      const projectRepo = this.projectRepository;
      const project = await projectRepo.findOne({
        where: { id: projectId },
      });

      if (!project) {
        throw new NotFoundError('项目不存在');
      }

      // 检查用户权限
      if (!project.canUserManageConnections(userId)) {
        throw new UnauthorizedError('无权限向项目添加连接');
      }

      // 验证连接存在
      const connectionRepo = this.connectionRepository;
      const connection = await connectionRepo.findOne({
        where: { id: connectionId },
      });

      if (!connection) {
        throw new NotFoundError('连接不存在');
      }

      // 检查连接是否已在项目中
      const existingAssociation = await this.repository.findOne({
        where: { projectId, connectionId },
      });

      if (existingAssociation) {
        if (existingAssociation.status === 'active') {
          throw new ConflictError('连接已在项目中');
        } else {
          // 重新激活已存在的关联
          existingAssociation.status = 'active';
          existingAssociation.addedBy = userId;
          return await this.repository.save(existingAssociation);
        }
      }

      // 检查用户是否有权限使用该连接
      if (connection.ownerId !== userId) {
        // TODO: 检查用户是否有权限访问其他用户的连接
        // 目前只允许添加自己的连接
        throw new UnauthorizedError('只能添加自己创建的连接');
      }

      // 创建项目连接关联
      const projectConnection = this.repository.create({
        id: uuidv4(),
        projectId,
        connectionId,
        addedBy: userId,
        status: 'active',
        alias: options.alias,
        description: options.description,
        category: options.category,
        permissions: options.permissions,
        tags: options.tags,
      });

      const savedAssociation = await this.repository.save(projectConnection);

      logger.info('连接已添加到项目', {
        projectId,
        connectionId,
        associationId: savedAssociation.id,
        userId,
      });

      return savedAssociation;
    } catch (error) {
      if (error instanceof NotFoundError ||
          error instanceof UnauthorizedError ||
          error instanceof ConflictError) {
        throw error;
      }
      logger.error('添加连接到项目失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        connectionId,
        userId,
        options,
      });
      throw error;
    }
  }

  /**
   * 从项目移除连接
   */
  async removeConnectionFromProject(
    projectId: string,
    connectionId: string,
    userId: string
  ): Promise<void> {
    try {
      // 验证关联存在
      const projectConnection = await this.repository.findOne({
        where: { projectId, connectionId },
        relations: ['project'],
      });

      if (!projectConnection) {
        throw new NotFoundError('连接不在项目中');
      }

      // 检查权限
      if (!projectConnection.project.canUserManageConnections(userId)) {
        throw new UnauthorizedError('无权限从项目移除连接');
      }

      // 移除关联（软删除）
      projectConnection.status = 'inactive';
      await this.repository.save(projectConnection);

      logger.info('连接已从项目移除', {
        projectId,
        connectionId,
        userId,
      });
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('从项目移除连接失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        connectionId,
        userId,
      });
      throw error;
    }
  }

  /**
   * 更新项目连接关联
   */
  async updateProjectConnection(
    projectId: string,
    connectionId: string,
    userId: string,
    updateData: Partial<ProjectConnection>
  ): Promise<ProjectConnection> {
    try {
      // 验证关联存在
      const projectConnection = await this.repository.findOne({
        where: { projectId, connectionId },
        relations: ['project'],
      });

      if (!projectConnection) {
        throw new NotFoundError('连接不在项目中');
      }

      // 检查权限
      if (!projectConnection.project.canUserManageConnections(userId)) {
        throw new UnauthorizedError('无权限修改项目连接');
      }

      // 更新关联信息
      Object.assign(projectConnection, updateData);
      await this.repository.save(projectConnection);

      logger.info('项目连接关联已更新', {
        projectId,
        connectionId,
        userId,
        updatedFields: Object.keys(updateData),
      });

      return projectConnection;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('更新项目连接关联失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        connectionId,
        userId,
        updateData,
      });
      throw error;
    }
  }

  /**
   * 获取项目连接列表
   */
  async getProjectConnections(
    projectId: string,
    userId: string,
    options: ProjectConnectionListOptions = {}
  ): Promise<ProjectConnectionListResult> {
    try {
      // 验证用户有权限访问项目
      const projectRepo = this.projectRepository;
      const project = await projectRepo.findOne({
        where: { id: projectId },
      });

      if (!project) {
        throw new NotFoundError('项目不存在');
      }

      const projectRepoInstance = new ProjectRepository(this.dataSource);
      if (!await projectRepoInstance.isProjectMember(projectId, userId)) {
        throw new UnauthorizedError('无权限访问项目');
      }

      const {
        page = 1,
        limit = 10,
        status,
        category,
        search,
        sortBy = 'addedAt',
        sortOrder = 'DESC',
      } = options;

      // 构建查询
      const queryBuilder = this.repository.createQueryBuilder('pc')
        .leftJoinAndSelect('pc.connection', 'connection')
        .leftJoinAndSelect('pc.addedByUser', 'addedByUser')
        .where('pc.projectId = :projectId', { projectId });

      // 添加过滤条件
      if (status) {
        queryBuilder.andWhere('pc.status = :status', { status });
      }

      if (category) {
        queryBuilder.andWhere('pc.category = :category', { category });
      }

      if (search) {
        queryBuilder.andWhere(
          '(connection.name ILIKE :search OR connection.description ILIKE :search OR pc.alias ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      // 只显示活跃的连接
      queryBuilder.andWhere('pc.status = :activeStatus', { activeStatus: 'active' });

      // 排序
      if (sortBy === 'name') {
        queryBuilder.orderBy('COALESCE(pc.alias, connection.name)', sortOrder);
      } else if (sortBy === 'type') {
        queryBuilder.orderBy('connection.type', sortOrder);
      } else {
        queryBuilder.orderBy(`pc.${sortBy}`, sortOrder);
      }

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
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('获取项目连接列表失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId,
        options,
      });
      throw error;
    }
  }

  /**
   * 测试项目连接
   */
  async testProjectConnection(
    projectId: string,
    connectionId: string,
    userId: string
  ): Promise<{
    success: boolean;
    message: string;
    details?: any;
  }> {
    try {
      // 验证关联存在
      const projectConnection = await this.repository.findOne({
        where: { projectId, connectionId },
        relations: ['project', 'connection'],
      });

      if (!projectConnection) {
        throw new NotFoundError('连接不在项目中');
      }

      // 检查权限
      if (!projectConnection.project.canUserManageConnections(userId)) {
        throw new UnauthorizedError('无权限测试项目连接');
      }

      // 检查连接测试权限
      if (!projectConnection.canUserPerform('canTest')) {
        throw new UnauthorizedError('无权限测试此连接');
      }

      // 测试连接
      const connectionRepoInstance = new ConnectionRepository(this.dataSource);
      const testResult = await connectionRepoInstance.testConnection(connectionId, userId);

      // 更新测试结果
      projectConnection.updateTestResult(
        testResult.success ? 'passed' : 'failed',
        testResult.message
      );
      await this.repository.save(projectConnection);

      logger.info('项目连接测试完成', {
        projectId,
        connectionId,
        userId,
        success: testResult.success,
      });

      return testResult;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('测试项目连接失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        connectionId,
        userId,
      });
      return {
        success: false,
        message: '测试失败：' + (error instanceof Error ? error.message : '未知错误'),
      };
    }
  }

  /**
   * 获取连接关联的所有项目
   */
  async getConnectionProjects(
    connectionId: string,
    userId: string
  ): Promise<Array<ProjectConnection & { project: Project }>> {
    try {
      const associations = await this.repository.find({
        where: { connectionId, status: 'active' },
        relations: ['project'],
        order: { createdAt: 'DESC' },
      });

      // 过滤用户有权限访问的项目
      const projectRepo = this.projectRepository;
      const accessibleAssociations = [];

      for (const association of associations) {
        const projectRepoInstance = new ProjectRepository(this.dataSource);
        if (await projectRepoInstance.isProjectMember(association.projectId, userId)) {
          accessibleAssociations.push(association);
        }
      }

      return accessibleAssociations;
    } catch (error) {
      logger.error('获取连接项目列表失败', {
        error: error instanceof Error ? error.message : '未知错误',
        connectionId,
        userId,
      });
      return [];
    }
  }

  /**
   * 更新连接权限
   */
  async updateConnectionPermissions(
    projectId: string,
    connectionId: string,
    userId: string,
    permissions: any
  ): Promise<ProjectConnection> {
    try {
      const projectConnection = await this.repository.findOne({
        where: { projectId, connectionId },
        relations: ['project'],
      });

      if (!projectConnection) {
        throw new NotFoundError('连接不在项目中');
      }

      if (!projectConnection.project.canUserManageConnections(userId)) {
        throw new UnauthorizedError('无权限修改连接权限');
      }

      projectConnection.permissions = permissions;
      await this.repository.save(projectConnection);

      logger.info('连接权限已更新', {
        projectId,
        connectionId,
        userId,
      });

      return projectConnection;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('更新连接权限失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        connectionId,
        userId,
      });
      throw error;
    }
  }

  /**
   * 批量添加连接到项目
   */
  async batchAddConnections(
    projectId: string,
    connectionIds: string[],
    userId: string
  ): Promise<{
    success: number;
    failed: number;
    errors: Array<{ connectionId: string; error: string }>;
  }> {
    try {
      const projectRepo = this.projectRepository;
      const project = await projectRepo.findOne({
        where: { id: projectId },
      });

      if (!project) {
        throw new NotFoundError('项目不存在');
      }

      if (!project.canUserManageConnections(userId)) {
        throw new UnauthorizedError('无权限向项目添加连接');
      }

      let success = 0;
      let failed = 0;
      const errors: Array<{ connectionId: string; error: string }> = [];

      for (const connectionId of connectionIds) {
        try {
          await this.addConnectionToProject(projectId, connectionId, userId);
          success++;
        } catch (error) {
          failed++;
          errors.push({
            connectionId,
            error: error instanceof Error ? error.message : '添加失败',
          });
        }
      }

      logger.info('批量添加连接完成', {
        projectId,
        userId,
        total: connectionIds.length,
        success,
        failed,
      });

      return { success, failed, errors };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('批量添加连接失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId,
        connectionIds,
      });
      throw error;
    }
  }

  /**
   * 获取项目连接统计
   */
  async getProjectConnectionStats(projectId: string): Promise<{
    total: number;
    byType: Record<string, number>;
    byCategory: Record<string, number>;
    recentlyTested: number;
    requiresTesting: number;
  }> {
    try {
      const stats = await this.repository.createQueryBuilder('pc')
        .leftJoin('pc.connection', 'connection')
        .select([
          'COUNT(*) as total',
          'connection.type as type',
          'pc.category as category',
          'COUNT(CASE WHEN pc.lastTestedAt > :recent THEN 1 END) as recentlyTested',
          'COUNT(CASE WHEN pc.lastTestStatus IS NULL OR pc.lastTestStatus != :passed THEN 1 END) as requiresTesting',
        ])
        .where('pc.projectId = :projectId', {
          projectId,
          recent: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24小时内
          passed: 'passed',
        })
        .andWhere('pc.status = :active', { active: 'active' })
        .groupBy('connection.type, pc.category')
        .getRawMany();

      const result = {
        total: 0,
        byType: {} as Record<string, number>,
        byCategory: {} as Record<string, number>,
        recentlyTested: 0,
        requiresTesting: 0,
      };

      stats.forEach(stat => {
        const count = parseInt(stat.total) || 0;
        result.total += count;
        result.recentlyTested += parseInt(stat.recentlyTested) || 0;
        result.requiresTesting += parseInt(stat.requiresTesting) || 0;

        if (stat.type) {
          result.byType[stat.type] = (result.byType[stat.type] || 0) + count;
        }

        if (stat.category) {
          result.byCategory[stat.category] = (result.byCategory[stat.category] || 0) + count;
        }
      });

      return result;
    } catch (error) {
      logger.error('获取项目连接统计失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
      });
      return {
        total: 0,
        byType: {},
        byCategory: {},
        recentlyTested: 0,
        requiresTesting: 0,
      };
    }
  }

  /**
   * 获取项目的连接ID列表
   */
  async getProjectConnectionIds(projectId: string): Promise<string[]> {
    try {
      const connections = await this.repository.find({
        where: { projectId },
        select: ['connectionId'],
      });

      return connections.map(pc => pc.connectionId);
    } catch (error) {
      logger.error('获取项目连接ID失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
      });
      return [];
    }
  }
}