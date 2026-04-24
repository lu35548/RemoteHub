import { Request, Response, NextFunction } from 'express';
import { getServices } from '../services/container';
import { Project, ProjectStatus, ProjectVisibility, ProjectPriority } from '../models/Project';
import { ProjectRepository } from '../repositories/ProjectRepository';
import { User } from '../models/User';
import { ProjectMember } from '../models/Project';
import { ProjectConnection } from '../models/Project';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors';
import { logger } from '../utils/logger';

export class ProjectController {
  private get services() {
    return getServices();
  }

  /**
   * 获取用户可访问的项目列表
   */
  public async getProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.userEntity as User;
      const {
        page = 1,
        limit = 10,
        status,
        visibility,
        priority,
        search,
        tags,
        sortBy = 'updatedAt',
        sortOrder = 'DESC',
      } = req.query;

      // 将 tags 从字符串转换为数组
      const tagsArray = tags ? (tags as string).split(',').filter(t => t.trim()) : undefined;

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const result = await projectRepo.getAccessibleProjects(user.id, {
        page: Number(page),
        limit: Number(limit),
        status: status as ProjectStatus,
        visibility: visibility as ProjectVisibility,
        priority: priority as ProjectPriority,
        search: search as string,
        tags: tagsArray,
        sortBy: sortBy as any,
        sortOrder: sortOrder as 'ASC' | 'DESC',
      });

      // 返回统一的响应格式
      res.json({
        success: true,
        data: {
          projects: result.projects,
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
   * 创建新项目
   */
  public async createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.userEntity as User;
      const projectData = req.body;

      // 基本验证
      if (!projectData.name || projectData.name.trim().length === 0) {
        throw new ValidationError('项目名称是必需的');
      }

      if (projectData.name.length > 255) {
        throw new ValidationError('项目名称不能超过255个字符');
      }

      // 设置项目所有者为当前用户
      projectData.ownerId = user.id;

      // 验证状态、可见性、优先级
      if (projectData.status && !Object.values(ProjectStatus).includes(projectData.status)) {
        throw new ValidationError('无效的项目状态');
      }

      if (projectData.visibility && !Object.values(ProjectVisibility).includes(projectData.visibility)) {
        throw new ValidationError('无效的项目可见性');
      }

      if (projectData.priority && !Object.values(ProjectPriority).includes(projectData.priority)) {
        throw new ValidationError('无效的项目优先级');
      }

      // 处理标签
      if (projectData.tags && Array.isArray(projectData.tags)) {
        projectData.tags = projectData.tags.join(',');
      }

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const project = await projectRepo.createProject(projectData);

      logger.info('项目创建成功', {
        projectId: project.id,
        projectName: project.name,
        ownerId: user.id,
      });

      res.status(201).json({
        success: true,
        message: '项目创建成功',
        data: project,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取项目详情
   */
  public async getProjectById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const project = await projectRepo.getProjectById(id, user.id);

      // 获取用户在项目中的角色
      const userRole = await projectRepo.getUserProjectRole(id, user.id);

      res.json({
        success: true,
        data: {
          ...project,
          userRole,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 更新项目
   */
  public async updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
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
          throw new ValidationError('项目名称不能为空');
        }
        if (updateData.name.length > 255) {
          throw new ValidationError('项目名称不能超过255个字符');
        }
      }

      // 验证枚举值
      if (updateData.status && !Object.values(ProjectStatus).includes(updateData.status)) {
        throw new ValidationError('无效的项目状态');
      }

      if (updateData.visibility && !Object.values(ProjectVisibility).includes(updateData.visibility)) {
        throw new ValidationError('无效的项目可见性');
      }

      if (updateData.priority && !Object.values(ProjectPriority).includes(updateData.priority)) {
        throw new ValidationError('无效的项目优先级');
      }

      // 处理标签
      if (updateData.tags && Array.isArray(updateData.tags)) {
        updateData.tags = updateData.tags.join(',');
      }

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const project = await projectRepo.updateProject(id, updateData, user.id);

      logger.info('项目更新成功', {
        projectId: id,
        userId: user.id,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: '项目更新成功',
        data: project,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 删除项目
   */
  public async deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      await projectRepo.deleteProject(id, user.id);

      logger.info('项目删除成功', {
        projectId: id,
        userId: user.id,
      });

      res.json({
        success: true,
        message: '项目删除成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取项目统计信息
   */
  public async getProjectStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.userEntity as User;

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const stats = await projectRepo.getProjectStats(user.id);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 复制项目
   */
  public async duplicateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { name } = req.body;
      const user = req.userEntity as User;

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());

      // 获取原项目
      const originalProject = await projectRepo.getProjectById(id, user.id);

      // 检查权限 - 项目所有者或管理员可以复制
      if (originalProject.ownerId !== user.id) {
        const member = originalProject.members?.find(m => m.userId === user.id);
        if (!member || !['admin', 'owner'].includes(member.role)) {
          throw new UnauthorizedError('无权限复制此项目');
        }
      }

      // 创建新项目数据
      const newProjectData = {
        name: name || `${originalProject.name} (副本)`,
        description: originalProject.description,
        visibility: originalProject.visibility,
        priority: originalProject.priority,
        tags: originalProject.tags,
        settings: originalProject.settings,
        metadata: originalProject.metadata,
        ownerId: user.id,
      };

      // 创建新项目
      const newProject = await projectRepo.createProject(newProjectData);

      logger.info('项目复制成功', {
        originalProjectId: id,
        newProjectId: newProject.id,
        userId: user.id,
      });

      res.status(201).json({
        success: true,
        message: '项目复制成功',
        data: newProject,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 归档项目
   */
  public async archiveProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      await projectRepo.updateProject(id, {
        status: ProjectStatus.ARCHIVED,
      }, user.id);

      logger.info('项目已归档', {
        projectId: id,
        userId: user.id,
      });

      res.json({
        success: true,
        message: '项目已归档',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 激活项目
   */
  public async activateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      await projectRepo.updateProject(id, {
        status: ProjectStatus.ACTIVE,
      }, user.id);

      logger.info('项目已激活', {
        projectId: id,
        userId: user.id,
      });

      res.json({
        success: true,
        message: '项目已激活',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 更新项目设置
   */
  public async updateProjectSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { settings } = req.body;
      const user = req.userEntity as User;

      if (!settings || typeof settings !== 'object') {
        throw new ValidationError('项目设置格式无效');
      }

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      await projectRepo.updateProject(id, { settings }, user.id);

      logger.info('项目设置已更新', {
        projectId: id,
        userId: user.id,
      });

      res.json({
        success: true,
        message: '项目设置更新成功',
      });
    } catch (error) {
      next(error);
    }
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

      
      // 检查用户是否有权限查看成员
      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const isMember = await projectRepo.isProjectMember(id, user.id);

      if (!isMember) {
        throw new UnauthorizedError('无权限查看项目成员');
      }
      const result = await projectRepo.getProjectMembersExtended(id, user.id, {
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
   * 获取用户在项目中的角色
   */
  public async getUserRoleInProject(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const user = req.userEntity as User;

      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const role = await projectRepo.getUserProjectRole(id, user.id);

      res.json({
        success: true,
        data: {
          projectId: id,
          userId: user.id,
          role,
        },
      });
    } catch (error) {
      next(error);
    }
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

      
      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const result = await projectRepo.getProjectConnections(id, user.id, {
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
}

export const projectController = new ProjectController();

// 导出路由处理函数
export const getProjects = projectController.getProjects.bind(projectController);
export const createProject = projectController.createProject.bind(projectController);
export const getProjectById = projectController.getProjectById.bind(projectController);
export const updateProject = projectController.updateProject.bind(projectController);
export const deleteProject = projectController.deleteProject.bind(projectController);
export const getProjectStats = projectController.getProjectStats.bind(projectController);
export const duplicateProject = projectController.duplicateProject.bind(projectController);
export const archiveProject = projectController.archiveProject.bind(projectController);
export const activateProject = projectController.activateProject.bind(projectController);
export const updateProjectSettings = projectController.updateProjectSettings.bind(projectController);
export const getProjectMembers = projectController.getProjectMembers.bind(projectController);
export const getUserRoleInProject = projectController.getUserRoleInProject.bind(projectController);
export const getProjectConnections = projectController.getProjectConnections.bind(projectController);