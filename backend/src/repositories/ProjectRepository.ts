import { DataSource, Repository, SelectQueryBuilder } from 'typeorm';
import { Project, ProjectMember, ProjectConnection } from '../models/Project';
import { User } from '../models/User';
import { Connection } from '../models/Connection';
import { ProjectStatus, ProjectVisibility, ProjectPriority } from '../enums/ProjectEnums';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface ProjectListOptions {
  page?: number;
  limit?: number;
  status?: ProjectStatus;
  visibility?: ProjectVisibility;
  priority?: ProjectPriority;
  search?: string;
  tags?: string[];
  ownerId?: string;
  memberId?: string;
  sortBy?: 'name' | 'createdAt' | 'updatedAt' | 'status';
  sortOrder?: 'ASC' | 'DESC';
}

export interface ProjectListResult {
  projects: Project[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class ProjectRepository {
  constructor(private dataSource: DataSource) {}

  private get repository(): Repository<Project> {
    return this.dataSource.getRepository(Project);
  }

  private get projectMemberRepository(): Repository<ProjectMember> {
    return this.dataSource.getRepository(ProjectMember);
  }

  private get projectConnectionRepository(): Repository<ProjectConnection> {
    return this.dataSource.getRepository(ProjectConnection);
  }

  private get userRepository(): Repository<User> {
    return this.dataSource.getRepository(User);
  }

  private get connectionRepository(): Repository<Connection> {
    return this.dataSource.getRepository(Connection);
  }

  /**
   * 获取查询构建器
   */
  private getQueryBuilder(alias: string = 'project') {
    return this.repository.createQueryBuilder(alias);
  }

  /**
   * 查找单个项目（基础版本）
   */
  async findOneProject(options: any): Promise<Project | null> {
    return await this.repository.findOne(options);
  }

  /**
   * 创建项目
   */
  async createProject(projectData: Partial<Project>): Promise<Project> {
    try {
      // 验证必需字段
      if (!projectData.name) {
        throw new ValidationError('项目名称是必需的');
      }

      if (!projectData.ownerId) {
        throw new ValidationError('项目所有者是必需的');
      }

      // 检查项目名称是否已存在（同一所有者下）
      const existingProject = await this.repository.findOne({
        where: {
          name: projectData.name,
          ownerId: projectData.ownerId,
        },
      });

      if (existingProject) {
        throw new ConflictError('项目名称已存在');
      }

      // 创建项目
      const project = this.repository.create({
        ...projectData,
        id: uuidv4(),
        status: projectData.status || ProjectStatus.DRAFT,
        visibility: projectData.visibility || ProjectVisibility.PRIVATE,
        priority: projectData.priority || ProjectPriority.MEDIUM,
      });

      const savedProject = await this.repository.save(project);

      // 创建项目成员记录（所有者自动成为管理员）
      const projectMemberRepo = this.projectMemberRepository;
      const member = projectMemberRepo.create({
        id: uuidv4(),
        projectId: savedProject.id,
        userId: savedProject.ownerId,
        role: 'owner',
        status: 'active',
        joinedAt: new Date(),
        lastAccessAt: new Date(),
      });
      await projectMemberRepo.save(member);

      logger.info('项目创建成功', {
        projectId: savedProject.id,
        projectName: savedProject.name,
        ownerId: savedProject.ownerId,
      });

      return savedProject;
    } catch (error) {
      logger.error('创建项目失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectData: {
          name: projectData.name,
          ownerId: projectData.ownerId,
        },
      });
      throw error;
    }
  }

  /**
   * 获取用户可访问的项目列表（优化版本）
   */
  async getAccessibleProjects(
    userId: string,
    options: ProjectListOptions = {}
  ): Promise<ProjectListResult> {
    try {
      const {
        page = 1,
        limit = 10,
        status,
        visibility,
        priority,
        search,
        tags,
        ownerId,
        memberId,
        sortBy = 'updatedAt',
        sortOrder = 'DESC',
      } = options;

      // 简化版本：使用基础的repository方法，避免QueryBuilder在Mock数据库中的问题
      let projects: Project[] = [];

      try {
        // 尝试使用QueryBuilder（如果可用）
        const queryBuilder = this.getQueryBuilder('project')
          .leftJoinAndSelect('project.members', 'members')
          .leftJoinAndSelect('project.connections', 'connections')
          .where(
            '(project.ownerId = :userId OR members.userId = :userId)',
            { userId }
          )
          .andWhere('members.status = :status', { status: 'active' });

        // 添加过滤条件
        if (status) {
          queryBuilder.andWhere('project.status = :status', { status });
        }

        if (visibility) {
          queryBuilder.andWhere('project.visibility = :visibility', { visibility });
        }

        if (priority) {
          queryBuilder.andWhere('project.priority = :priority', { priority });
        }

        if (ownerId) {
          queryBuilder.andWhere('project.ownerId = :ownerId', { ownerId });
        }

        if (memberId) {
          queryBuilder.andWhere('members.userId = :memberId', { memberId });
        }

        // 搜索功能
        if (search) {
          queryBuilder.andWhere(
            '(project.name LIKE :search OR project.description LIKE :search)',
            { search: `%${search}%` }
          );
        }

        // 排序
        const sortField = sortBy === 'name' ? 'project.name' :
                         sortBy === 'status' ? 'project.status' :
                         sortBy === 'createdAt' ? 'project.createdAt' :
                         'project.updatedAt';

        queryBuilder.orderBy(sortField, sortOrder);

        // 分页
        const skip = (page - 1) * limit;
        queryBuilder.skip(skip).take(limit);

        // 执行查询
        projects = await queryBuilder.getMany();

      } catch (queryError) {
        // 如果QueryBuilder不可用（如在Mock数据库中），使用简化方法
        logger.warn('QueryBuilder不可用，使用简化方法', {
          error: queryError instanceof Error ? queryError.message : '未知错误'
        });

        // 简化查询：获取所有项目，然后手动过滤
        const allProjects = await this.repository.find({
          relations: ['members', 'connections']
        });

        // 过滤用户可访问的项目
        projects = allProjects.filter(project =>
          project.ownerId === userId ||
          project.members?.some((member: any) => member.userId === userId && member.status === 'active')
        );

        // 应用额外过滤条件
        if (status) {
          projects = projects.filter(project => project.status === status);
        }

        if (visibility) {
          projects = projects.filter(project => project.visibility === visibility);
        }

        if (priority) {
          projects = projects.filter(project => project.priority === priority);
        }

        if (ownerId) {
          projects = projects.filter(project => project.ownerId === ownerId);
        }

        if (memberId) {
          projects = projects.filter(project =>
            project.members?.some((member: any) => member.userId === memberId)
          );
        }

        // 搜索功能
        if (search) {
          const searchLower = search.toLowerCase();
          projects = projects.filter(project =>
            project.name.toLowerCase().includes(searchLower) ||
            (project.description && project.description.toLowerCase().includes(searchLower))
          );
        }

        // 手动排序
        projects.sort((a, b) => {
          let aValue: any = a[sortBy as keyof Project] || a.updatedAt;
          let bValue: any = b[sortBy as keyof Project] || b.updatedAt;

          if (aValue instanceof Date) aValue = aValue.getTime();
          if (bValue instanceof Date) bValue = bValue.getTime();

          if (sortOrder === 'DESC') {
            return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
          } else {
            return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
          }
        });

        // 手动分页
        const skip = (page - 1) * limit;
        projects = projects.slice(skip, skip + limit);
      }

      // 获取总数（对于简化版本，需要重新计算）
      let total: number;
      if (projects.length < limit) {
        // 如果返回的结果少于请求的限制，说明已经是全部结果
        total = projects.length + ((page - 1) * limit);
      } else {
        try {
          // 尝试使用QueryBuilder获取总数
          const queryBuilder = this.getQueryBuilder('project')
            .leftJoin('project.members', 'members')
            .where(
              '(project.ownerId = :userId OR members.userId = :userId)',
              { userId }
            )
            .andWhere('members.status = :status', { status: 'active' });

          if (status) {
            queryBuilder.andWhere('project.status = :status', { status });
          }
          if (visibility) {
            queryBuilder.andWhere('project.visibility = :visibility', { visibility });
          }
          if (priority) {
            queryBuilder.andWhere('project.priority = :priority', { priority });
          }
          if (ownerId) {
            queryBuilder.andWhere('project.ownerId = :ownerId', { ownerId });
          }
          if (memberId) {
            queryBuilder.andWhere('members.userId = :memberId', { memberId });
          }
          if (search) {
            queryBuilder.andWhere(
              '(project.name LIKE :search OR project.description LIKE :search)',
              { search: `%${search}%` }
            );
          }

          total = await queryBuilder.getCount();
        } catch {
          // 如果QueryBuilder不可用，估算总数
          total = projects.length + ((page - 1) * limit);
        }
      }

      // 计算总页数
      const totalPages = Math.ceil(total / limit);

      logger.debug('获取项目列表', {
        userId,
        total,
        page,
        limit,
        filters: { status, visibility, priority, search },
      });

      return {
        projects,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('获取项目列表失败', {
        error: error instanceof Error ? error.message : '未知错误',
        userId,
        options,
      });
      throw error;
    }
  }

  /**
   * 根据ID获取项目详情（带权限检查）
   */
  async getProjectById(
    id: string,
    userId?: string,
    checkPermission: boolean = true
  ): Promise<Project> {
    try {
      const queryBuilder = this.getQueryBuilder('project')
        .leftJoinAndSelect('project.members', 'members')
        .leftJoinAndSelect('project.connections', 'connections')
        .where('project.id = :id', { id });

      // 权限检查子查询
      if (userId && checkPermission) {
        const memberExistsQuery = this.getQueryBuilder('project')
          .select('1')
          .leftJoin('project.members', 'member')
          .where('project.id = :id', { id })
          .andWhere(
            '(project.ownerId = :userId OR (member.userId = :userId AND member.status = :status))',
            { userId, status: 'active' }
          );

        const memberExists = await memberExistsQuery.getCount();
        if (memberExists === 0) {
          throw new UnauthorizedError('无权访问此项目');
        }
      }

      const project = await queryBuilder.getOne();

      if (!project) {
        throw new NotFoundError('项目不存在');
      }

      return project;
    } catch (error) {
      logger.error('获取项目详情失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId: id,
        userId,
      });

      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }

      throw new Error('获取项目详情失败');
    }
  }

  /**
   * 更新项目
   */
  async updateProject(
    id: string,
    updateData: Partial<Project>,
    userId: string,
    checkPermission: boolean = true
  ): Promise<Project> {
    try {
      // 获取项目
      const project = await this.getProjectById(id, userId, checkPermission);

      // 检查权限
      if (checkPermission && project.ownerId !== userId) {
        // 检查是否是管理员
        const member = project.members?.find(m => m.userId === userId);
        if (!member || !['admin', 'owner'].includes(member.role)) {
          throw new UnauthorizedError('无权修改此项目');
        }
      }

      // 如果修改项目名称，检查是否重复
      if (updateData.name && updateData.name !== project.name) {
        const existingProject = await this.repository.findOne({
          where: {
            name: updateData.name,
            ownerId: project.ownerId,
          },
        });

        if (existingProject && existingProject.id !== id) {
          throw new ConflictError('项目名称已存在');
        }
      }

      // 更新项目
      await this.repository.update(id, {
        ...updateData,
        updatedAt: new Date(),
      });

      // 返回更新后的项目
      const updatedProject = await this.getProjectById(id, userId, false);

      logger.info('项目更新成功', {
        projectId: id,
        userId,
        updatedFields: Object.keys(updateData),
      });

      return updatedProject;
    } catch (error) {
      logger.error('更新项目失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId: id,
        userId,
        updateData,
      });

      if (error instanceof NotFoundError ||
          error instanceof UnauthorizedError ||
          error instanceof ConflictError) {
        throw error;
      }

      throw new Error('更新项目失败');
    }
  }

  /**
   * 删除项目
   */
  async deleteProject(id: string, userId: string): Promise<void> {
    try {
      // 获取项目
      const project = await this.getProjectById(id, userId, true);

      // 检查是否是所有者或管理员
      if (project.ownerId !== userId) {
        const member = project.members?.find(m => m.userId === userId);
        if (!member || !['admin', 'owner'].includes(member.role)) {
          throw new UnauthorizedError('只有项目所有者或管理员可以删除项目');
        }
      }

      // 软删除：将项目状态标记为已删除
      await this.repository.update(id, {
        status: ProjectStatus.ARCHIVED,
        updatedAt: new Date(),
      });

      logger.info('项目删除成功', {
        projectId: id,
        userId,
        projectName: project.name,
      });
    } catch (error) {
      logger.error('删除项目失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId: id,
        userId,
      });

      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }

      throw new Error('删除项目失败');
    }
  }

  /**
   * 归档项目
   */
  async archiveProject(id: string, userId: string): Promise<void> {
    return this.deleteProject(id, userId);
  }

  /**
   * 检查用户是否是项目成员
   */
  async isProjectMember(projectId: string, userId: string): Promise<boolean> {
    try {
      const count = await this.getQueryBuilder('project')
        .leftJoin('project.members', 'member')
        .where('project.id = :projectId', { projectId })
        .andWhere(
          '(project.ownerId = :userId OR (member.userId = :userId AND member.status = :status))',
          { userId, status: 'active' }
        )
        .getCount();

      return count > 0;
    } catch (error) {
      logger.error('检查项目成员失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId,
      });
      return false;
    }
  }

  /**
   * 获取项目成员列表
   */
  async getProjectMembers(projectId: string, userId: string): Promise<ProjectMember[]> {
    try {
      // 验证权限
      await this.getProjectById(projectId, userId, true);

      const members = await this.projectMemberRepository.find({
        where: { projectId },
        relations: ['user'],
        order: { joinedAt: 'ASC' },
      });

      return members;
    } catch (error) {
      logger.error('获取项目成员失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId,
      });
      throw error;
    }
  }

  /**
   * 添加项目成员
   */
  async addProjectMember(
    projectId: string,
    userId: string,
    newMemberId: string,
    role: string = 'member',
    operatorId: string
  ): Promise<ProjectMember> {
    try {
      // 验证权限
      const project = await this.getProjectById(projectId, userId, true);

      if (project.ownerId !== userId) {
        const member = project.members?.find(m => m.userId === userId);
        if (!member || !['admin', 'owner'].includes(member.role)) {
          throw new UnauthorizedError('只有项目所有者或管理员可以添加成员');
        }
      }

      // 检查用户是否存在
      const user = await this.userRepository.findOne({ where: { id: newMemberId } });
      if (!user) {
        throw new NotFoundError('用户不存在');
      }

      // 检查是否已经是成员
      const existingMember = await this.projectMemberRepository.findOne({
        where: { projectId, userId: newMemberId },
      });

      if (existingMember) {
        if (existingMember.status === 'active') {
          throw new ConflictError('用户已经是项目成员');
        } else {
          // 重新激活成员
          existingMember.status = 'active';
          existingMember.role = role;
          existingMember.joinedAt = new Date();
          return await this.projectMemberRepository.save(existingMember);
        }
      }

      // 添加新成员
      const member = this.projectMemberRepository.create({
        id: uuidv4(),
        projectId,
        userId: newMemberId,
        role,
        status: 'active',
        joinedAt: new Date(),
        lastAccessAt: new Date(),
        notes: `Added by user ${operatorId}`,
      });

      const savedMember = await this.projectMemberRepository.save(member) as ProjectMember;

      logger.info('项目成员添加成功', {
        projectId,
        userId: newMemberId,
        role,
        addedBy: operatorId,
      });

      return savedMember;
    } catch (error) {
      logger.error('添加项目成员失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId: newMemberId,
        role,
      });
      throw error;
    }
  }

  /**
   * 获取项目统计信息
   */
  async getProjectStats(userId: string): Promise<{
    total: number;
    owned: number;
    member: number;
    active: number;
  }> {
    try {
      // 获取用户拥有的项目
      const ownedCount = await this.repository.count({
        where: { ownerId: userId },
      });

      // 获取用户参与的项目（包括拥有的）
      const memberCount = await this.getQueryBuilder('project')
        .leftJoin('project.members', 'member')
        .where('project.ownerId = :userId OR member.userId = :userId', { userId })
        .getCount();

      // 获取活跃项目数
      const activeCount = await this.repository.count({
        where: {
          status: ProjectStatus.ACTIVE,
          ownerId: userId,
        },
      });

      const total = ownedCount;

      return {
        total,
        owned: ownedCount,
        member: memberCount,
        active: activeCount,
      };
    } catch (error) {
      logger.error('获取项目统计失败', {
        error: error instanceof Error ? error.message : '未知错误',
        userId,
      });
      return {
        total: 0,
        owned: 0,
        member: 0,
        active: 0,
      };
    }
  }

  /**
   * 搜索项目
   */
  async searchProjects(
    query: string,
    userId: string,
    options: Omit<ProjectListOptions, 'search'> = {}
  ): Promise<ProjectListResult> {
    return this.getAccessibleProjects(userId, {
      ...options,
      search: query,
    });
  }

  /**
   * 获取用户在项目中的角色
   */
  async getUserProjectRole(projectId: string, userId: string): Promise<string> {
    try {
      const member = await this.projectMemberRepository.findOne({
        where: { projectId, userId },
        relations: ['user'],
      });

      if (!member) {
        // 如果不是成员，检查是否是所有者
        const project = await this.repository.findOne({ where: { id: projectId } });
        if (project && project.ownerId === userId) {
          return 'owner';
        }
        throw new UnauthorizedError('用户不是项目成员');
      }

      return member.role;
    } catch (error) {
      logger.error('获取用户项目角色失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId,
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
    options: {
      page?: number;
      limit?: number;
      status?: string;
      category?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
    } = {}
  ): Promise<{
    connections: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      // 验证权限
      await this.getProjectById(projectId, userId, true);

      const {
        page = 1,
        limit = 10,
        status,
        category,
        search,
        sortBy = 'addedAt',
        sortOrder = 'DESC',
      } = options;

      const skip = (page - 1) * limit;

      // 构建查询
      const queryBuilder = this.projectConnectionRepository
        .createQueryBuilder('connection')
        .leftJoinAndSelect('connection.project', 'project')
        .where('connection.projectId = :projectId', { projectId });

      // 添加过滤条件
      if (status) {
        queryBuilder.andWhere('connection.status = :status', { status });
      }

      if (category) {
        queryBuilder.andWhere('connection.category = :category', { category });
      }

      if (search) {
        queryBuilder.andWhere(
          '(connection.name LIKE :search OR connection.description LIKE :search)',
          { search: `%${search}%` }
        );
      }

      // 获取总数
      const total = await queryBuilder.getCount();

      // 排序和分页
      queryBuilder
        .orderBy(`connection.${sortBy}`, sortOrder)
        .skip(skip)
        .take(limit);

      const connections = await queryBuilder.getMany();

      const totalPages = Math.ceil(total / limit);

      return {
        connections,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('获取项目连接失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId,
      });
      throw error;
    }
  }

  /**
   * 获取项目成员列表（扩展版本）
   */
  async getProjectMembersExtended(
    projectId: string,
    userId: string,
    options: {
      page?: number;
      limit?: number;
      role?: string;
      status?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: 'ASC' | 'DESC';
    } = {}
  ): Promise<{
    members: ProjectMember[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    try {
      // 验证权限
      await this.getProjectById(projectId, userId, true);

      const {
        page = 1,
        limit = 10,
        role,
        status,
        search,
        sortBy = 'joinedAt',
        sortOrder = 'DESC',
      } = options;

      const skip = (page - 1) * limit;

      // 构建查询
      const queryBuilder = this.projectMemberRepository
        .createQueryBuilder('member')
        .leftJoinAndSelect('member.user', 'user')
        .where('member.projectId = :projectId', { projectId });

      // 添加过滤条件
      if (role) {
        queryBuilder.andWhere('member.role = :role', { role });
      }

      if (status) {
        queryBuilder.andWhere('member.status = :status', { status });
      }

      if (search) {
        queryBuilder.andWhere(
          '(user.username LIKE :search OR user.email LIKE :search OR user.firstName LIKE :search OR user.lastName LIKE :search)',
          { search: `%${search}%` }
        );
      }

      // 获取总数
      const total = await queryBuilder.getCount();

      // 排序和分页
      queryBuilder
        .orderBy(`member.${sortBy}`, sortOrder)
        .skip(skip)
        .take(limit);

      const members = await queryBuilder.getMany();

      const totalPages = Math.ceil(total / limit);

      return {
        members,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      logger.error('获取项目成员列表失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId,
      });
      throw error;
    }
  }

  /**
   * 获取项目数据用于导出
   */
  public async findProjectsForExport(filters: {
    status?: string;
    visibility?: string;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    ownerId?: string;
  }, limit: number = 1000): Promise<Project[]> {
    const queryBuilder = this.getQueryBuilder('project')
      .leftJoin('project.owner', 'owner')
      .addSelect(['owner.username', 'ownerName']);

    // 应用过滤器
    if (filters.status) {
      queryBuilder.andWhere('project.status = :status', { status: filters.status });
    }

    if (filters.visibility) {
      queryBuilder.andWhere('project.visibility = :visibility', { visibility: filters.visibility });
    }

    if (filters.ownerId) {
      queryBuilder.andWhere('project.ownerId = :ownerId', { ownerId: filters.ownerId });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(project.name LIKE :search OR project.description LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.startDate) {
      queryBuilder.andWhere('project.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('project.createdAt <= :endDate', { endDate: filters.endDate });
    }

    return queryBuilder
      .orderBy('project.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }
}