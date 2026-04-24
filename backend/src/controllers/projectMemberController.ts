import { Request, Response, NextFunction } from 'express';
import { getServices } from '../services/container';
import { User } from '../models/User';
import { Project, ProjectMember } from '../models/Project';
import { ProjectMemberRepository } from '../repositories/ProjectMemberRepository';
import { ProjectRepository } from '../repositories/ProjectRepository';
import { UserRepository } from '../repositories/UserRepository';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors';
import { logger } from '../utils/logger';

export class ProjectMemberController {
  private get services() {
    return getServices();
  }

  /**
   * 获取项目成员列表
   */
  public async getProjectMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;
      const {
        page = 1,
        limit = 10,
        role,
        status,
        search,
        sortBy = 'joinedAt',
        sortOrder = 'DESC',
      } = req.query;

      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      const result = await projectMemberRepo.getProjectMembers(id, user.id, {
        page: Number(page),
        limit: Number(limit),
        role: role as string,
        status: status as string,
        search: search as string,
        sortBy: sortBy as any,
        sortOrder: sortOrder as 'ASC' | 'DESC',
      });

      res.json({
        success: true,
        data: {
          members: result.members,
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
   * 邀请成员加入项目
   */
  public async inviteMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { userId, role = 'viewer', message } = req.body;
      const user = req.userEntity as User;

      // 验证角色
      const validRoles = ['owner', 'admin', 'editor', 'viewer'];
      if (!validRoles.includes(role)) {
        throw new ValidationError('无效的角色');
      }

      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      const member = await projectMemberRepo.addMember(id, userId, role, user.id);

      // TODO: 发送邀请邮件
      logger.info('成员邀请已发送', {
        projectId: id,
        memberId: member.id,
        userId,
        role,
        inviterId: user.id,
        invitationToken: member.invitationToken,
      });

      res.status(201).json({
        success: true,
        message: '邀请已发送',
        data: {
          id: member.id,
          userId: member.userId,
          role: member.role,
          status: member.status,
          invitationToken: member.invitationToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 批量邀请成员
   */
  public async batchInviteMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { invitations } = req.body; // [{ userId, role }]
      const user = req.userEntity as User;

      if (!Array.isArray(invitations) || invitations.length === 0) {
        throw new ValidationError('邀请列表不能为空');
      }

      if (invitations.length > 50) {
        throw new ValidationError('一次最多邀请50个成员');
      }

      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      const results = [];

      for (const invitation of invitations) {
        try {
          const member = await projectMemberRepo.addMember(
            id,
            invitation.userId,
            invitation.role || 'viewer',
            user.id
          );

          results.push({
            userId: invitation.userId,
            success: true,
            memberId: member.id,
            invitationToken: member.invitationToken,
          });
        } catch (error) {
          results.push({
            userId: invitation.userId,
            success: false,
            error: error instanceof Error ? error.message : '邀请失败',
          });
        }
      }

      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;

      logger.info('批量邀请成员完成', {
        projectId: id,
        total: invitations.length,
        success: successCount,
        failed: failCount,
        operatorId: user.id,
      });

      res.json({
        success: true,
        data: {
          results,
          summary: {
            total: invitations.length,
            success: successCount,
            failed: failCount,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 接受项目邀请
   */
  public async acceptInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;
      const user = req.userEntity as User;

      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      const member = await projectMemberRepo.acceptInvitation(token, user.id);

      res.json({
        success: true,
        message: '已成功加入项目',
        data: {
          projectId: member.projectId,
          userId: member.userId,
          role: member.role,
          joinedAt: member.joinedAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 拒绝项目邀请
   */
  public async rejectInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token } = req.params;
      const user = req.userEntity as User;

      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      await projectMemberRepo.rejectInvitation(token, user.id);

      res.json({
        success: true,
        message: '已拒绝邀请',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 更新成员角色
   */
  public async updateMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, memberId } = req.params;
      const { role } = req.body;
      const user = req.userEntity as User;

      // 验证角色
      const validRoles = ['owner', 'admin', 'editor', 'viewer'];
      if (!validRoles.includes(role)) {
        throw new ValidationError('无效的角色');
      }

      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      const member = await projectMemberRepo.updateMemberRole(id, memberId, role, user.id);

      res.json({
        success: true,
        message: '成员角色已更新',
        data: {
          id: member.id,
          userId: member.userId,
          role: member.role,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 移除项目成员
   */
  public async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, memberId } = req.params;
      const user = req.userEntity as User;

      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      await projectMemberRepo.removeMember(id, memberId, user.id);

      res.json({
        success: true,
        message: '成员已移除',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 更新成员权限
   */
  public async updateMemberPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id, memberId } = req.params;
      const { permissions } = req.body;
      const user = req.userEntity as User;

      if (!permissions || typeof permissions !== 'object') {
        throw new ValidationError('权限格式无效');
      }

      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      const member = await projectMemberRepo.updateMemberPermissions(id, memberId, permissions, user.id);

      res.json({
        success: true,
        message: '成员权限已更新',
        data: {
          id: member.id,
          userId: member.userId,
          permissions: member.permissions,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取用户在项目中的信息
   */
  public async getUserMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      const membership = await projectMemberRepo.getUserMembership(id, user.id);

      res.json({
        success: true,
        data: membership,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 离开项目
   */
  public async leaveProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      const membership = await projectMemberRepo.getUserMembership(id, user.id);

      if (!membership) {
        throw new NotFoundError('您不是该项目的成员');
      }

      // 项目所有者不能直接离开项目
      if (membership.role === 'owner') {
        throw new ValidationError('项目所有者不能离开项目，请先转让所有权');
      }

      // 移除成员
      await this.services.database.getRepository(ProjectMember).remove(membership);

      logger.info('用户已离开项目', {
        projectId: id,
        userId: user.id,
      });

      res.json({
        success: true,
        message: '已离开项目',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 转让项目所有权
   */
  public async transferOwnership(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { newOwnerId } = req.body;
      const user = req.userEntity as User;

      if (!newOwnerId) {
        throw new ValidationError('新所有者ID是必需的');
      }

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const project = await projectRepo.findOneProject({
        where: { id, ownerId: user.id },
      });

      if (!project) {
        throw new ForbiddenError('只有项目所有者可以转让所有权');
      }

      const userRepo = this.services.database.getRepository(User);
      const newOwner = await userRepo.findOne({ where: { id: newOwnerId } });

      if (!newOwner) {
        throw new NotFoundError('新所有者不存在');
      }

      // 检查新所有者是否是项目成员
      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      const membership = await projectMemberRepo.getUserMembership(id, newOwnerId);

      if (!membership) {
        throw new ValidationError('新所有者必须是项目成员');
      }

      // 使用事务处理所有权转让
      await this.services.database.getDataSource().transaction(async manager => {
        // 更新项目所有者
        await manager.update(Project, { id }, { ownerId: newOwnerId });

        // 更新原所有者的成员角色为管理员
        await manager.update(ProjectMember,
          { projectId: id, userId: user.id },
          { role: 'admin' }
        );

        // 更新新所有者的成员角色为所有者
        await manager.update(ProjectMember,
          { projectId: id, userId: newOwnerId },
          { role: 'owner' }
        );
      });

      logger.info('项目所有权已转让', {
        projectId: id,
        oldOwnerId: user.id,
        newOwnerId,
      });

      res.json({
        success: true,
        message: '项目所有权转让成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取项目成员统计
   */
  public async getProjectMemberStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      // 检查用户是否有权限查看项目成员统计
      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const isMember = await projectRepo.isProjectMember(id, user.id);

      if (!isMember) {
        throw new UnauthorizedError('无权限查看项目成员统计');
      }

      const projectMemberRepo = new ProjectMemberRepository(this.services.database.getDataSource());
      const stats = await projectMemberRepo.getProjectMemberStats(id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 搜索用户（用于邀请）
   */
  public async searchUsersForInvitation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { q, limit = 10 } = req.query;
      const user = req.userEntity as User;

      if (!q) {
        throw new ValidationError('搜索关键词是必需的');
      }

      const query = q as string;

      // 检查用户是否有权限邀请成员
      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const project = await projectRepo.findOneProject({ where: { id } });

      if (!project) {
        throw new NotFoundError('项目不存在');
      }

      // 检查是否是所有者或管理员
      if (project.ownerId !== user.id) {
        const member = project.members?.find(m => m.userId === user.id);
        if (!member || !['admin', 'owner'].includes(member.role)) {
          throw new ForbiddenError('无权限邀请成员');
        }
      }

      const userRepo = this.services.database.getRepository(User);

      // 搜索用户（排除已经是成员的）
      const searchQuery = userRepo.createQueryBuilder('user')
        .where(
          '(user.username ILIKE :query OR user.email ILIKE :query OR user.firstName ILIKE :query OR user.lastName ILIKE :query)',
          { query: `%${query}%` }
        )
        .andWhere('user.id != :currentUserId', { currentUserId: user.id })
        .andWhere('user.status = :status', { status: 'active' })
        .take(Number(limit));

      // 排除已经是项目成员的用户
      const memberSubQuery = this.services.database.getRepository(ProjectMember)
        .createQueryBuilder('member')
        .select('member.userId')
        .where('member.projectId = :projectId', { projectId: id });

      searchQuery.andWhere(`user.id NOT IN (${memberSubQuery.getQuery()})`);

      const users = await searchQuery.getMany();

      // 只返回基本信息
      const userInfo = users.map(u => ({
        id: u.id,
        username: u.username,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        avatar: u.avatar,
      }));

      res.json({
        success: true,
        data: userInfo,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const projectMemberController = new ProjectMemberController();

// 导出路由处理函数
export const getProjectMembers = projectMemberController.getProjectMembers.bind(projectMemberController);
export const inviteMember = projectMemberController.inviteMember.bind(projectMemberController);
export const batchInviteMembers = projectMemberController.batchInviteMembers.bind(projectMemberController);
export const acceptInvitation = projectMemberController.acceptInvitation.bind(projectMemberController);
export const rejectInvitation = projectMemberController.rejectInvitation.bind(projectMemberController);
export const updateMemberRole = projectMemberController.updateMemberRole.bind(projectMemberController);
export const removeMember = projectMemberController.removeMember.bind(projectMemberController);
export const updateMemberPermissions = projectMemberController.updateMemberPermissions.bind(projectMemberController);
export const getUserMembership = projectMemberController.getUserMembership.bind(projectMemberController);
export const leaveProject = projectMemberController.leaveProject.bind(projectMemberController);
export const transferOwnership = projectMemberController.transferOwnership.bind(projectMemberController);
export const getProjectMemberStats = projectMemberController.getProjectMemberStats.bind(projectMemberController);
export const searchUsersForInvitation = projectMemberController.searchUsersForInvitation.bind(projectMemberController);