import { DataSource, Repository } from 'typeorm';
import { ProjectMember } from '../models/Project';
import { User } from '../models/User';
import { Project } from '../models/Project';
import { ProjectRepository } from './ProjectRepository';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export interface MemberListOptions {
  page?: number;
  limit?: number;
  role?: string;
  status?: string;
  search?: string;
  sortBy?: 'name' | 'email' | 'role' | 'joinedAt' | 'lastAccessAt';
  sortOrder?: 'ASC' | 'DESC';
}

export interface MemberListResult {
  members: Array<ProjectMember & { user: User }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface InvitationOptions {
  message?: string;
  expiresAt?: Date;
}

export class ProjectMemberRepository {
  constructor(private dataSource: DataSource) {}

  private get repository(): Repository<ProjectMember> {
    return this.dataSource.getRepository(ProjectMember);
  }

  private get userRepository(): Repository<User> {
    return this.dataSource.getRepository(User);
  }

  private get projectRepository(): Repository<Project> {
    return this.dataSource.getRepository(Project);
  }

  /**
   * 添加项目成员
   */
  async addMember(
    projectId: string,
    userId: string,
    role: string = 'viewer',
    inviterId: string
  ): Promise<ProjectMember> {
    try {
      // 验证项目存在
      const projectRepo = this.projectRepository;
      const project = await projectRepo.findOne({
        where: { id: projectId },
        relations: ['members'],
      });

      if (!project) {
        throw new NotFoundError('项目不存在');
      }

      // 检查用户是否有权限添加成员
      if (!project.canUserManageMembers(inviterId)) {
        throw new UnauthorizedError('无权限添加项目成员');
      }

      // 验证用户存在
      const userRepo = this.userRepository;
      const user = await userRepo.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundError('用户不存在');
      }

      // 检查是否已经是成员
      const existingMember = project.members.find(
        m => m.userId === userId && m.status !== 'banned'
      );

      if (existingMember) {
        if (existingMember.status === 'active') {
          throw new ConflictError('用户已经是项目成员');
        } else if (existingMember.status === 'pending') {
          throw new ConflictError('用户已被邀请，等待接受');
        }
      }

      // 创建成员记录
      const member = this.repository.create({
        id: uuidv4(),
        projectId,
        userId,
        role,
        status: 'pending',
        invitationToken: uuidv4() + uuidv4().replace(/-/g, ''),
        invitationExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7天后过期
      });

      const savedMember = await this.repository.save(member);

      logger.info('项目成员邀请已发送', {
        projectId,
        memberId: savedMember.id,
        userId,
        role,
        inviterId,
        invitationToken: savedMember.invitationToken,
      });

      return savedMember;
    } catch (error) {
      if (error instanceof NotFoundError ||
          error instanceof UnauthorizedError ||
          error instanceof ConflictError) {
        throw error;
      }
      logger.error('添加项目成员失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId,
        role,
        inviterId,
      });
      throw error;
    }
  }

  /**
   * 通过邀请链接添加成员
   */
  async acceptInvitation(token: string, userId: string): Promise<ProjectMember> {
    try {
      // 查找邀请
      const member = await this.repository.findOne({
        where: { invitationToken: token },
        relations: ['project'],
      });

      if (!member) {
        throw new NotFoundError('邀请不存在或已失效');
      }

      // 验证邀请是否有效
      if (!member.isValidInvitation) {
        throw new ValidationError('邀请已过期或已被使用');
      }

      // 验证被邀请的用户ID是否匹配
      if (member.userId !== userId) {
        throw new UnauthorizedError('此邀请不适用于当前用户');
      }

      // 接受邀请
      member.acceptInvitation();
      await this.repository.save(member);

      logger.info('项目邀请已被接受', {
        projectId: member.projectId,
        memberId: member.id,
        userId,
      });

      return member;
    } catch (error) {
      if (error instanceof NotFoundError ||
          error instanceof UnauthorizedError ||
          error instanceof ValidationError) {
        throw error;
      }
      logger.error('接受邀请失败', {
        error: error instanceof Error ? error.message : '未知错误',
        token,
        userId,
      });
      throw error;
    }
  }

  /**
   * 拒绝邀请
   */
  async rejectInvitation(token: string, userId: string): Promise<void> {
    try {
      const member = await this.repository.findOne({
        where: { invitationToken: token },
      });

      if (!member) {
        throw new NotFoundError('邀请不存在或已失效');
      }

      if (member.userId !== userId) {
        throw new UnauthorizedError('无权限操作此邀请');
      }

      if (!member.isValidInvitation) {
        throw new ValidationError('邀请已过期或已被使用');
      }

      // 拒绝邀请
      member.rejectInvitation();
      await this.repository.save(member);

      logger.info('项目邀请已被拒绝', {
        projectId: member.projectId,
        memberId: member.id,
        userId,
      });
    } catch (error) {
      if (error instanceof NotFoundError ||
          error instanceof UnauthorizedError ||
          error instanceof ValidationError) {
        throw error;
      }
      logger.error('拒绝邀请失败', {
        error: error instanceof Error ? error.message : '未知错误',
        token,
        userId,
      });
      throw error;
    }
  }

  /**
   * 更新成员角色
   */
  async updateMemberRole(
    projectId: string,
    memberId: string,
    newRole: string,
    operatorId: string
  ): Promise<ProjectMember> {
    try {
      // 验证成员存在
      const member = await this.repository.findOne({
        where: { id: memberId, projectId },
        relations: ['project', 'user'],
      });

      if (!member) {
        throw new NotFoundError('成员不存在');
      }

      // 检查操作权限
      if (!member.project.canUserManageMembers(operatorId)) {
        throw new UnauthorizedError('无权限修改成员角色');
      }

      // 不能修改项目所有者的角色
      if (member.role === 'owner') {
        throw new ValidationError('不能修改项目所有者的角色');
      }

      // 不能将自己降级（如果是管理员）
      if (member.userId === operatorId && member.role === 'admin') {
        throw new ValidationError('不能将自身降级');
      }

      // 更新角色
      member.role = newRole;
      await this.repository.save(member);

      logger.info('成员角色已更新', {
        projectId,
        memberId,
        userId: member.userId,
        oldRole: member.role,
        newRole,
        operatorId,
      });

      return member;
    } catch (error) {
      if (error instanceof NotFoundError ||
          error instanceof UnauthorizedError ||
          error instanceof ValidationError) {
        throw error;
      }
      logger.error('更新成员角色失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        memberId,
        newRole,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * 移除项目成员
   */
  async removeMember(
    projectId: string,
    memberId: string,
    operatorId: string
  ): Promise<void> {
    try {
      // 验证成员存在
      const member = await this.repository.findOne({
        where: { id: memberId, projectId },
        relations: ['project', 'user'],
      });

      if (!member) {
        throw new NotFoundError('成员不存在');
      }

      // 检查操作权限
      if (!member.project.canUserManageMembers(operatorId)) {
        throw new UnauthorizedError('无权限移除成员');
      }

      // 不能移除项目所有者
      if (member.role === 'owner') {
        throw new ValidationError('不能移除项目所有者');
      }

      // 不能移除自己（除非是所有者）
      if (member.userId === operatorId && member.project.ownerId !== operatorId) {
        throw new ValidationError('不能移除自己');
      }

      await this.repository.remove(member);

      logger.info('成员已被移除', {
        projectId,
        memberId,
        userId: member.userId,
        operatorId,
      });
    } catch (error) {
      if (error instanceof NotFoundError ||
          error instanceof UnauthorizedError ||
          error instanceof ValidationError) {
        throw error;
      }
      logger.error('移除成员失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        memberId,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * 获取项目成员列表
   */
  async getProjectMembers(
    projectId: string,
    userId: string,
    options: MemberListOptions = {}
  ): Promise<MemberListResult> {
    try {
      // 验证用户有权限查看成员列表
      const project = await this.projectRepository.findOne({
        where: { id: projectId },
      });

      if (!project) {
        throw new NotFoundError('项目不存在');
      }

      // 检查查看权限
      const projectRepoInstance = new ProjectRepository(this.dataSource);
      if (!await projectRepoInstance.isProjectMember(projectId, userId)) {
        throw new UnauthorizedError('无权限查看项目成员');
      }

      const {
        page = 1,
        limit = 10,
        role,
        status,
        search,
        sortBy = 'joinedAt',
        sortOrder = 'DESC',
      } = options;

      // 构建查询
      const queryBuilder = this.repository.createQueryBuilder('member')
        .leftJoinAndSelect('member.user', 'user')
        .leftJoinAndSelect('member.project', 'project')
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
          '(user.username ILIKE :search OR user.email ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)',
          { search: `%${search}%` }
        );
      }

      // 排序
      if (['name', 'email'].includes(sortBy)) {
        queryBuilder.orderBy(`user.${sortBy === 'name' ? 'username' : 'email'}`, sortOrder);
      } else {
        queryBuilder.orderBy(`member.${sortBy}`, sortOrder);
      }

      // 分页
      const skip = (page - 1) * limit;
      queryBuilder.skip(skip).take(limit);

      // 执行查询
      const [members, total] = await queryBuilder.getManyAndCount();

      // 计算总页数
      const totalPages = Math.ceil(total / limit);

      return {
        members,
        total,
        page,
        limit,
        totalPages,
      };
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('获取项目成员列表失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId,
        options,
      });
      throw error;
    }
  }

  /**
   * 获取用户的项目成员信息
   */
  async getUserMembership(
    projectId: string,
    userId: string
  ): Promise<ProjectMember | null> {
    try {
      const member = await this.repository.findOne({
        where: { projectId, userId },
        relations: ['project', 'user'],
      });

      return member;
    } catch (error) {
      logger.error('获取用户项目成员信息失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId,
      });
      return null;
    }
  }

  /**
   * 更新成员最后访问时间
   */
  async updateLastAccess(projectId: string, userId: string): Promise<void> {
    try {
      await this.repository.update(
        { projectId, userId, status: 'active' },
        { lastAccessAt: new Date() }
      );
    } catch (error) {
      logger.error('更新最后访问时间失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        userId,
      });
    }
  }

  /**
   * 更新成员权限
   */
  async updateMemberPermissions(
    projectId: string,
    memberId: string,
    permissions: any,
    operatorId: string
  ): Promise<ProjectMember> {
    try {
      const member = await this.repository.findOne({
        where: { id: memberId, projectId },
        relations: ['project'],
      });

      if (!member) {
        throw new NotFoundError('成员不存在');
      }

      if (!member.project.canUserManageMembers(operatorId)) {
        throw new UnauthorizedError('无权限修改成员权限');
      }

      member.permissions = permissions;
      await this.repository.save(member);

      logger.info('成员权限已更新', {
        projectId,
        memberId,
        userId: member.userId,
        operatorId,
      });

      return member;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof UnauthorizedError) {
        throw error;
      }
      logger.error('更新成员权限失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
        memberId,
        operatorId,
      });
      throw error;
    }
  }

  /**
   * 获取用户参与的所有项目
   */
  async getUserProjects(userId: string): Promise<Array<ProjectMember & { project: Project }>> {
    try {
      const memberships = await this.repository.find({
        where: { userId, status: 'active' },
        relations: ['project'],
        order: { lastAccessAt: 'DESC' },
      });

      return memberships;
    } catch (error) {
      logger.error('获取用户项目列表失败', {
        error: error instanceof Error ? error.message : '未知错误',
        userId,
      });
      return [];
    }
  }

  /**
   * 统计项目成员信息
   */
  async getProjectMemberStats(projectId: string): Promise<{
    total: number;
    active: number;
    pending: number;
    byRole: Record<string, number>;
  }> {
    try {
      const stats = await this.repository.createQueryBuilder('member')
        .select([
          'COUNT(*) as total',
          'COUNT(CASE WHEN status = :active THEN 1 END) as active',
          'COUNT(CASE WHEN status = :pending THEN 1 END) as pending',
          'role',
        ])
        .where('projectId = :projectId', {
          projectId,
          active: 'active',
          pending: 'pending',
        })
        .groupBy('role')
        .getRawMany();

      const result = {
        total: 0,
        active: 0,
        pending: 0,
        byRole: {} as Record<string, number>,
      };

      stats.forEach(stat => {
        result.total += parseInt(stat.total) || 0;
        result.active += parseInt(stat.active) || 0;
        result.pending += parseInt(stat.pending) || 0;

        if (stat.role) {
          result.byRole[stat.role] = (result.byRole[stat.role] || 0) + parseInt(stat.total) || 0;
        }
      });

      return result;
    } catch (error) {
      logger.error('获取项目成员统计失败', {
        error: error instanceof Error ? error.message : '未知错误',
        projectId,
      });
      return {
        total: 0,
        active: 0,
        pending: 0,
        byRole: {},
      };
    }
  }

  /**
   * 清理过期邀请
   */
  async cleanupExpiredInvitations(): Promise<number> {
    try {
      const result = await this.repository
        .createQueryBuilder()
        .delete()
        .from(ProjectMember)
        .where('status = :status', { status: 'pending' })
        .andWhere('invitationExpiresAt < :now', { now: new Date() })
        .execute();

      const deletedCount = result.affected || 0;

      if (deletedCount > 0) {
        logger.info('已清理过期邀请', { deletedCount });
      }

      return deletedCount;
    } catch (error) {
      logger.error('清理过期邀请失败', {
        error: error instanceof Error ? error.message : '未知错误',
      });
      return 0;
    }
  }
}