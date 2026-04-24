import { Request, Response, NextFunction } from 'express';
import { getServices } from '../services/container';
import { User, UserRole, UserStatus } from '../models/User';
import { UserRepository } from '../repositories/UserRepository';
import { ProjectRepository } from '../repositories/ProjectRepository';
import { ConnectionRepository } from '../repositories/ConnectionRepository';
import {
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

export class UserController {
  private get services() {
    return getServices();
  }

  /**
   * 获取用户列表（管理员）
   */
  public async getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.userEntity as User;

      // 检查管理员权限
      if (user.role !== UserRole.ADMIN) {
        throw new ForbiddenError('只有管理员可以查看用户列表');
      }

      const {
        page = 1,
        limit = 10,
        search,
        role,
        status,
        sortBy = 'createdAt',
        sortOrder = 'DESC',
      } = req.query;

      const userRepo = this.services.database.getRepository(User);
      const [users, total] = await userRepo.findAndCount({
        where: this.buildUserFilter({
          search: search as string,
          role: role as UserRole,
          status: status as UserStatus,
        }),
        select: [
          'id',
          'username',
          'email',
          'firstName',
          'lastName',
          'role',
          'status',
          'emailVerified',
          'avatar',
          'createdAt',
          'updatedAt',
          'lastLoginAt',
          'lastLoginIp',
        ],
        order: { [sortBy as string]: sortOrder as 'ASC' | 'DESC' },
        take: Number(limit),
        skip: (Number(page) - 1) * Number(limit),
      });

      const totalPages = Math.ceil(total / Number(limit));

      // 返回统一的响应格式
      res.json({
        success: true,
        data: {
          users,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取用户详情
   */
  public async getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const currentUser = req.userEntity as User;

      const userRepo = this.services.database.getRepository(User);
      let user: User | null = null;

      // 如果是管理员或查看自己的信息
      if (currentUser.role === UserRole.ADMIN || currentUser.id === id) {
        user = await userRepo.findOne({
          where: { id },
          select: [
            'id',
            'username',
            'email',
            'firstName',
            'lastName',
            'role',
            'status',
            'emailVerified',
            'avatar',
            'bio',
            'phone',
            'createdAt',
            'updatedAt',
            'lastLoginAt',
            'lastLoginIp',
            'preferences',
          ],
        });
      } else {
        // 普通用户只能查看基本信息
        user = await userRepo.findOne({
          where: { id, status: UserStatus.ACTIVE },
          select: [
            'id',
            'username',
            'firstName',
            'lastName',
            'avatar',
            'bio',
          ],
        });
      }

      if (!user) {
        throw new NotFoundError('用户不存在');
      }

      res.json({
        success: true,
        data: user,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 更新用户信息
   */
  public async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const currentUser = req.userEntity as User;
      const updateData = req.body;

      const userRepo = this.services.database.getRepository(User);
      const user = await userRepo.findOne({ where: { id } });

      if (!user) {
        throw new NotFoundError('用户不存在');
      }

      // 权限检查
      if (currentUser.role !== UserRole.ADMIN && currentUser.id !== id) {
        throw new ForbiddenError('无权限修改此用户信息');
      }

      // 普通用户不能修改敏感字段
      if (currentUser.role !== UserRole.ADMIN) {
        const restrictedFields = ['role', 'status', 'emailVerified'];
        for (const field of restrictedFields) {
          if (updateData[field] !== undefined) {
            throw new ForbiddenError('无权限修改此字段');
          }
        }
      }

      // 如果更新邮箱，检查是否已存在
      if (updateData.email && updateData.email !== user.email) {
        const existingUser = await userRepo.findOne({
          where: { email: updateData.email },
        });

        if (existingUser) {
          throw new ConflictError('邮箱已被使用');
        }

        // 更新邮箱需要重新验证
        updateData.emailVerified = false;
      }

      // 如果更新用户名，检查是否已存在
      if (updateData.username && updateData.username !== user.username) {
        const existingUser = await userRepo.findOne({
          where: { username: updateData.username },
        });

        if (existingUser) {
          throw new ConflictError('用户名已被使用');
        }
      }

      // 执行更新
      await userRepo.update(id, updateData);

      // 获取更新后的用户信息
      const updatedUser = await userRepo.findOne({
        where: { id },
        select: [
          'id',
          'username',
          'email',
          'firstName',
          'lastName',
          'role',
          'status',
          'emailVerified',
          'avatar',
          'bio',
          'phone',
          'createdAt',
          'updatedAt',
        ],
      });

      logger.info('用户信息已更新', {
        userId: id,
        operatorId: currentUser.id,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: '用户信息更新成功',
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 删除用户（管理员）
   */
  public async deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const currentUser = req.userEntity as User;

      // 检查管理员权限
      if (currentUser.role !== UserRole.ADMIN) {
        throw new ForbiddenError('只有管理员可以删除用户');
      }

      // 不能删除自己
      if (currentUser.id === id) {
        throw new ValidationError('不能删除自己的账户');
      }

      const userRepo = this.services.database.getRepository(User);
      const user = await userRepo.findOne({ where: { id } });

      if (!user) {
        throw new NotFoundError('用户不存在');
      }

      // 软删除：将状态设为非活跃
      await userRepo.update(id, {
        status: UserStatus.INACTIVE,
        email: `${user.email}.deleted.${Date.now()}`, // 避免邮箱冲突
        username: `${user.username}.deleted.${Date.now()}`, // 避免用户名冲突
      });

      logger.info('用户已被删除', {
        deletedUserId: id,
        deletedUsername: user.username,
        operatorId: currentUser.id,
      });

      res.json({
        success: true,
        message: '用户删除成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 获取当前用户资料
   */
  public async getCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.userEntity as User;

      // 获取用户统计信息
      const projectRepo = new ProjectRepository(this.services.database.getDataSource());
      const connectionRepo = new ConnectionRepository(this.services.database.getDataSource());

      const [projectStats, connectionStats] = await Promise.all([
        projectRepo.getProjectStats(user.id),
        connectionRepo.getConnectionStats(user.id),
      ]);

      const userProfile = {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        bio: user.bio,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
        preferences: user.preferences,
        stats: {
          projects: projectStats,
          connections: connectionStats,
        },
      };

      res.json({
        success: true,
        data: userProfile,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 更新当前用户资料
   */
  public async updateCurrentUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.userEntity as User;
      const updateData = req.body;

      // 移除不允许更新的字段
      delete updateData.id;
      delete updateData.role;
      delete updateData.status;
      delete updateData.emailVerified;
      delete updateData.password;
      delete updateData.loginAttempts;
      delete updateData.lockedUntil;
      delete updateData.tokenVersion;

      const userRepo = this.services.database.getRepository(User);

      // 如果更新邮箱或用户名，检查重复
      if (updateData.email && updateData.email !== user.email) {
        const existingUser = await userRepo.findOne({
          where: { email: updateData.email },
        });

        if (existingUser) {
          throw new ConflictError('邮箱已被使用');
        }

        updateData.emailVerified = false;
      }

      if (updateData.username && updateData.username !== user.username) {
        const existingUser = await userRepo.findOne({
          where: { username: updateData.username },
        });

        if (existingUser) {
          throw new ConflictError('用户名已被使用');
        }
      }

      // 执行更新
      await userRepo.update(user.id, updateData);

      // 获取更新后的用户信息
      const updatedUser = await userRepo.findOne({
        where: { id: user.id },
        select: [
          'id',
          'username',
          'email',
          'firstName',
          'lastName',
          'avatar',
          'bio',
          'phone',
          'preferences',
          'updatedAt',
        ],
      });

      logger.info('用户资料已更新', {
        userId: user.id,
        updatedFields: Object.keys(updateData),
      });

      res.json({
        success: true,
        message: '资料更新成功',
        data: updatedUser,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 更新用户状态（管理员）
   */
  public async updateUserStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const currentUser = req.userEntity as User;

      // 检查管理员权限
      if (currentUser.role !== UserRole.ADMIN) {
        throw new ForbiddenError('只有管理员可以修改用户状态');
      }

      if (!Object.values(UserStatus).includes(status)) {
        throw new ValidationError('无效的用户状态');
      }

      const userRepo = this.services.database.getRepository(User);
      const user = await userRepo.findOne({ where: { id } });

      if (!user) {
        throw new NotFoundError('用户不存在');
      }

      // 不能修改自己的状态
      if (currentUser.id === id) {
        throw new ValidationError('不能修改自己的状态');
      }

      await userRepo.update(id, { status });

      logger.info('用户状态已更新', {
        userId: id,
        oldStatus: user.status,
        newStatus: status,
        operatorId: currentUser.id,
      });

      res.json({
        success: true,
        message: '用户状态更新成功',
        data: { id, status },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 更新用户角色（管理员）
   */
  public async updateUserRole(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { role } = req.body;
      const currentUser = req.userEntity as User;

      // 检查管理员权限
      if (currentUser.role !== UserRole.ADMIN) {
        throw new ForbiddenError('只有管理员可以修改用户角色');
      }

      if (!Object.values(UserRole).includes(role)) {
        throw new ValidationError('无效的用户角色');
      }

      const userRepo = this.services.database.getRepository(User);
      const user = await userRepo.findOne({ where: { id } });

      if (!user) {
        throw new NotFoundError('用户不存在');
      }

      // 不能修改自己的角色
      if (currentUser.id === id) {
        throw new ValidationError('不能修改自己的角色');
      }

      await userRepo.update(id, { role });

      logger.info('用户角色已更新', {
        userId: id,
        oldRole: user.role,
        newRole: role,
        operatorId: currentUser.id,
      });

      res.json({
        success: true,
        message: '用户角色更新成功',
        data: { id, role },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 重置用户密码（管理员）
   */
  public async resetUserPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { newPassword } = req.body;
      const currentUser = req.userEntity as User;

      // 检查管理员权限
      if (currentUser.role !== UserRole.ADMIN) {
        throw new ForbiddenError('只有管理员可以重置用户密码');
      }

      if (!newPassword || newPassword.length < 8) {
        throw new ValidationError('密码长度至少8个字符');
      }

      const userRepo = this.services.database.getRepository(User);
      const user = await userRepo.findOne({ where: { id } });

      if (!user) {
        throw new NotFoundError('用户不存在');
      }

      // 加密新密码
      const hashedPassword = await this.services.passwordService.hashPassword(newPassword);

      await userRepo.updatePassword(id, hashedPassword);

      // 使所有用户会话失效
      await this.services.sessionService.invalidateAllUserSessions(id);

      logger.info('用户密码已重置', {
        userId: id,
        operatorId: currentUser.id,
      });

      res.json({
        success: true,
        message: '密码重置成功',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * 构建用户过滤条件
   */
  private buildUserFilter(filters: {
    search?: string;
    role?: UserRole;
    status?: UserStatus;
  }): any {
    const whereConditions: any = {};

    if (filters.search) {
      whereConditions.username = { $ilike: `%${filters.search}%` };
      whereConditions.email = { $ilike: `%${filters.search}%` };
      whereConditions.firstName = { $ilike: `%${filters.search}%` };
      whereConditions.lastName = { $ilike: `%${filters.search}%` };
    }

    if (filters.role) {
      whereConditions.role = filters.role;
    }

    if (filters.status) {
      whereConditions.status = filters.status;
    }

    return whereConditions;
  }
}

export const userController = new UserController();

// 导出路由处理函数
export const getUsers = userController.getUsers.bind(userController);
export const getUserById = userController.getUserById.bind(userController);
export const updateUser = userController.updateUser.bind(userController);
export const deleteUser = userController.deleteUser.bind(userController);
export const getCurrentUser = userController.getCurrentUser.bind(userController);
export const updateCurrentUser = userController.updateCurrentUser.bind(userController);
export const updateUserStatus = userController.updateUserStatus.bind(userController);
export const updateUserRole = userController.updateUserRole.bind(userController);
export const resetUserPassword = userController.resetUserPassword.bind(userController);