import { Request, Response, NextFunction } from 'express';
import { getServices, IServiceContainer } from '../services/container';
import { UserRole, UserStatus } from '../models/User';
import { User } from '../models/User';
import { UserRepository } from '../repositories/UserRepository';
import { v4 as uuidv4 } from 'uuid';
import {
  InvalidCredentialsError,
  AccountLockedError,
  EmailNotVerifiedError,
  UserAlreadyExistsError,
  InvalidPasswordError,
  PasswordResetTokenExpiredError,
  InvalidPasswordResetTokenError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { JWTService } from '../services/jwtService';
import { PasswordService } from '../services/passwordService';
import { PasswordResetService } from '../services/passwordResetService';
import { SessionService } from '../services/sessionService';
import { AuditService } from '../services/auditService';

export class AuthController {
  private services: IServiceContainer;
  private jwtService: JWTService;
  private passwordService: PasswordService;
  private passwordResetService: PasswordResetService;
  private sessionService: SessionService;

  constructor() {
    // Services will be lazy-loaded to avoid initialization issues
  }

  private getServices() {
    if (!this.services) {
      this.services = getServices();
      this.getServices().jwtService = this.services.jwtService;
      this.getServices().passwordService = this.services.passwordService;
      this.getServices().passwordResetService = this.services.passwordResetService;
      this.getServices().sessionService = this.services.sessionService;
    }
    return this.services;
  }

  /**
   * 用户注册
   */
  public async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { username, email, password, firstName, lastName } = req.body;

      // 基本验证
      if (!username || !email || !password) {
        throw new ValidationError('用户名、邮箱和密码都是必需的');
      }

      const userRepo = new UserRepository(this.getServices().database.getDataSource());

      // 检查用户是否已存在
      const existingUserByEmail = await userRepo.findByEmail(email);
      if (existingUserByEmail) {
        res.status(409).json({
          success: false,
          message: '该邮箱已被注册',
          error: 'EMAIL_EXISTS'
        });
        return;
      }

      const existingUserByUsername = await userRepo.findByUsername(username);
      if (existingUserByUsername) {
        res.status(409).json({
          success: false,
          message: '该用户名已被使用',
          error: 'USERNAME_EXISTS'
        });
        return;
      }

      // 密码强度验证
      if (password.length < 8) {
        throw new InvalidPasswordError('密码长度至少8个字符');
      }

      // 加密密码
      const hashedPassword = await this.getServices().passwordService.hashPassword(password);

      // 创建用户
      const userData = {
        username,
        email,
        password: hashedPassword,
        firstName: firstName || '',
        lastName: lastName || '',
        role: UserRole.USER,
      };

      const user = await userRepo.createUser(userData);

      logger.info('用户注册成功', {
        userId: user.id,
        username: user.username,
        email: user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });

      res.status(201).json({
        success: true,
        message: '注册成功',
        data: {
          id: user.id,
          username: user.username,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          createdAt: user.createdAt,
        }
      });
    } catch (error) {
      logger.error('API error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      next(error);
    }
  }

  /**
   * 用户登录
   */
  public async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { emailOrUsername, password } = req.body;

      if (!emailOrUsername || !password) {
        throw new ValidationError('邮箱/用户名和密码都是必需的');
      }

      const userRepo = new UserRepository(this.getServices().database.getDataSource());

      // 查找用户（支持邮箱或用户名登录）
      const user = await userRepo.findByEmailOrUsername(emailOrUsername);
      if (!user) {
        throw new InvalidCredentialsError('用户不存在');
      }

      // 检查用户状态
      if (user.status !== UserStatus.ACTIVE) {
        if (user.status === UserStatus.SUSPENDED) {
          throw new AccountLockedError('账户已被暂停');
        }
        throw new UnauthorizedError('账户不可用');
      }

      // 检查账户是否被锁定
      if (user.isLocked) {
        throw new AccountLockedError('账户已被锁定，请稍后再试');
      }

      // 验证密码
      const isPasswordValid = await this.getServices().passwordService.verifyPassword(password, user.password);
      if (!isPasswordValid) {
        // 增加登录失败次数
        await userRepo.incrementLoginAttempts(user.id);

        logger.warn('用户登录失败', {
          userId: user.id,
          username: user.username,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          reason: 'invalid_password'
        });

        // 记录审计日志
        await AuditService.logLogin(req, false, user.id, '密码错误');

        throw new InvalidCredentialsError('密码错误');
      }

      // 邮箱验证检查 - 暂时跳过，因为系统没有邮件发送功能
      // TODO: 重新启用此检查当邮件服务配置后
      // if (!user.emailVerified) {
      //   throw new EmailNotVerifiedError('请先验证您的邮箱地址');
      // }

      // 创建会话
      const sessionInfo = await this.getServices().sessionService.createSession({
        userId: user.id,
        email: user.email,
        role: user.role,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      // 生成JWT令牌对
      const tokens = this.getServices().jwtService.generateTokenPair(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
        sessionInfo.sessionId,
        user.tokenVersion || 0
      );

      // 更新最后登录信息
      await userRepo.updateLastLogin(user.id, req.ip);

      // 清除登录失败次数
      await userRepo.resetLoginAttempts(user.id);

      logger.info('用户登录成功', {
        userId: user.id,
        username: user.username,
        ip: req.ip,
        sessionId: sessionInfo.sessionId,
      });

      // 记录审计日志
      await AuditService.logLogin(req, true, user.id);

      res.json({
        success: true,
        message: '登录成功',
        data: {
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            avatar: user.avatar,
          },
          tokens,
          sessionId: sessionInfo.sessionId,
        }
      });
    } catch (error) {
      logger.error('API error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      next(error);
    }
  }

  /**
   * 刷新令牌
   */
  public async refreshToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new ValidationError('刷新令牌是必需的');
      }

      // 验证刷新令牌
      const payload = this.getServices().jwtService.verifyRefreshToken(refreshToken);
      const userRepo = new UserRepository(this.getServices().database.getDataSource());

      const user = await userRepo.findById(payload.userId);
      if (!user) {
        throw new InvalidCredentialsError('用户不存在');
      }

      if (user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedError('账户不可用');
      }

      // 检查令牌版本
      if (payload.tokenVersion !== user.tokenVersion) {
        throw new InvalidCredentialsError('令牌已失效，请重新登录');
      }

      // 验证会话
      const session = await this.getServices().sessionService.getSession(payload.sessionId);
      if (!session || session.userId !== user.id) {
        throw new InvalidCredentialsError('会话已失效，请重新登录');
      }

      // 生成新的令牌对
      const newTokens = this.getServices().jwtService.generateTokenPair(
        {
          userId: user.id,
          email: user.email,
          role: user.role,
        },
        payload.sessionId,
        user.tokenVersion || 0
      );

      res.json({
        success: true,
        message: '令牌刷新成功',
        data: {
          tokens: newTokens,
        }
      });
    } catch (error) {
      logger.error('API error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      next(error);
    }
  }

  /**
   * 用户登出
   */
  public async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { refreshToken, sessionId } = req.body;
      let sessionToInvalidate = sessionId;

      // 如果提供了刷新令牌，从中提取会话ID
      if (refreshToken) {
        try {
          const payload = this.getServices().jwtService.verifyRefreshToken(refreshToken);
          sessionToInvalidate = payload.sessionId;
        } catch {
          // 忽略令牌验证错误，继续登出流程
        }
      }

      // 使会话失效
      if (sessionToInvalidate) {
        await this.getServices().sessionService.invalidateSession(sessionToInvalidate);
      }

      logger.info('用户登出', {
        sessionId: sessionToInvalidate,
        ip: req.ip,
      });

      res.json({
        success: true,
        message: '登出成功',
      });
    } catch (error) {
      logger.error('API error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      next(error);
    }
  }

  /**
   * 忘记密码
   */
  public async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;

      if (!email) {
        throw new ValidationError('邮箱地址是必需的');
      }

      const userRepo = new UserRepository(this.getServices().database.getDataSource());
      const user = await userRepo.findByEmail(email);

      // 为了安全，即使用户不存在也返回成功消息
      if (user) {
        // 生成密码重置令牌
        const resetToken = await this.getServices().passwordResetService.createPasswordResetRequest({
          userId: user.id,
          email: user.email,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        // 设置重置令牌到用户记录
        await userRepo.setPasswordResetToken(user.id, resetToken);

        // TODO: 发送密码重置邮件
        logger.info('密码重置令牌已生成', {
          userId: user.id,
          email: user.email,
          resetToken,
        });

        res.json({
          success: true,
          message: '如果该邮箱存在，密码重置链接已发送',
        });
      } else {
        // 用户不存在时的响应（避免泄露用户信息）
        res.json({
          success: true,
          message: '如果该邮箱存在，密码重置链接已发送',
        });
      }
    } catch (error) {
      logger.error('API error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      next(error);
    }
  }

  /**
   * 重置密码
   */
  public async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        throw new ValidationError('重置令牌和新密码都是必需的');
      }

      // 验证重置令牌
      const resetRequest = await this.getServices().passwordResetService.validateResetToken(token);
      const resetData = { userId: resetRequest.userId };
      const userRepo = new UserRepository(this.getServices().database.getDataSource());

      const user = await userRepo.findById(resetData.userId);
      if (!user) {
        throw new NotFoundError('用户不存在');
      }

      // 验证令牌是否仍然有效
      if (!user.isPasswordResetTokenValid()) {
        throw new PasswordResetTokenExpiredError('重置链接已过期，请重新申请');
      }

      // 密码强度验证
      if (newPassword.length < 8) {
        throw new InvalidPasswordError('密码长度至少8个字符');
      }

      // 加密新密码
      const hashedPassword = await this.getServices().passwordService.hashPassword(newPassword);

      // 更新密码和相关信息
      await userRepo.updatePassword(user.id, hashedPassword);
      await userRepo.clearPasswordResetToken(user.id);

      // 增加令牌版本以使现有令牌失效
      // user.tokenVersion = (user.tokenVersion || 0) + 1;
      // await userRepo.save(user);

      // 使所有用户会话失效
      await this.getServices().sessionService.invalidateAllUserSessions(user.id);

      logger.info('密码重置成功', {
        userId: user.id,
        email: user.email,
        ip: req.ip,
      });

      res.json({
        success: true,
        message: '密码重置成功',
      });
    } catch (error) {
      logger.error('API error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      next(error);
    }
  }

  /**
   * 修改密码
   */
  public async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = req.userEntity;

      if (!user) {
        throw new UnauthorizedError('用户未登录');
      }

      if (!currentPassword || !newPassword) {
        throw new ValidationError('当前密码和新密码都是必需的');
      }

      // 验证当前密码
      const isCurrentPasswordValid = await this.getServices().passwordService.verifyPassword(
        currentPassword,
        user.password
      );

      if (!isCurrentPasswordValid) {
        throw new InvalidCredentialsError('当前密码错误');
      }

      // 新密码强度验证
      if (newPassword.length < 8) {
        throw new InvalidPasswordError('新密码长度至少8个字符');
      }

      // 检查新密码是否与当前密码相同
      const isSamePassword = await this.getServices().passwordService.verifyPassword(newPassword, user.password);
      if (isSamePassword) {
        throw new InvalidPasswordError('新密码不能与当前密码相同');
      }

      // 加密新密码
      const hashedNewPassword = await this.getServices().passwordService.hashPassword(newPassword);

      const userRepo = new UserRepository(this.getServices().database.getDataSource());
      await userRepo.updatePassword(user.id, hashedNewPassword);

      // 使所有用户会话失效（除了当前会话）
      await this.getServices().sessionService.invalidateAllUserSessions(user.id);

      logger.info('用户修改密码成功', {
        userId: user.id,
        email: user.email,
        ip: req.ip,
      });

      res.json({
        success: true,
        message: '密码修改成功',
      });
    } catch (error) {
      logger.error('API error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      next(error);
    }
  }

  /**
   * 获取用户资料
   */
  public async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.userEntity;

      if (!user) {
        throw new UnauthorizedError('用户未登录');
      }

      res.json({
        success: true,
        data: {
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
        }
      });
    } catch (error) {
      logger.error('API error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      next(error);
    }
  }

  /**
   * 更新用户资料
   */
  public async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = req.userEntity;
      const { firstName, lastName, bio, phone, avatar } = req.body;

      if (!user) {
        throw new UnauthorizedError('用户未登录');
      }

      const userRepo = new UserRepository(this.getServices().database.getDataSource());
      const updatedUser = await userRepo.updateProfile(user.id, {
        firstName,
        lastName,
        bio,
        phone,
        avatar,
      });

      if (!updatedUser) {
        throw new NotFoundError('用户更新失败');
      }

      logger.info('用户资料更新', {
        userId: user.id,
        updatedFields: { firstName, lastName, bio, phone, avatar },
      });

      res.json({
        success: true,
        message: '资料更新成功',
        data: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          firstName: updatedUser.firstName,
          lastName: updatedUser.lastName,
          bio: updatedUser.bio,
          phone: updatedUser.phone,
          avatar: updatedUser.avatar,
          role: updatedUser.role,
          updatedAt: updatedUser.updatedAt,
        }
      });
    } catch (error) {
      logger.error('API error:', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
      });
      next(error);
    }
  }
}

export const authController = new AuthController();

// Export individual functions for route handlers
export const register = authController.register.bind(authController);
export const login = authController.login.bind(authController);
export const refreshToken = authController.refreshToken.bind(authController);
export const logout = authController.logout.bind(authController);
export const getCurrentUser = authController.getProfile.bind(authController);
export const requestPasswordReset = authController.forgotPassword.bind(authController);
export const resetPassword = authController.resetPassword.bind(authController);
export const changePassword = authController.changePassword.bind(authController);