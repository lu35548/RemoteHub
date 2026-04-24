import { DataSource, Repository } from 'typeorm';
import { User, UserRole, UserStatus } from '../models/User';

export class UserRepository {
  constructor(private dataSource: DataSource) {}

  private get repository(): Repository<User> {
    return this.dataSource.getRepository(User);
  }

  /**
   * 根据邮箱查找用户
   */
  public async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({ where: { email } });
  }

  /**
   * 根据用户名查找用户
   */
  public async findByUsername(username: string): Promise<User | null> {
    return this.repository.findOne({ where: { username } });
  }

  /**
   * 根据ID查找用户
   */
  public async findById(id: string): Promise<User | null> {
    return this.repository.findOne({ where: { id } });
  }

  /**
   * 根据邮箱或用户名查找用户
   */
  public async findByEmailOrUsername(emailOrUsername: string): Promise<User | null> {
    return this.repository.findOne({
      where: [
        { email: emailOrUsername },
        { username: emailOrUsername }
      ]
    });
  }

  /**
   * 创建新用户
   */
  public async createUser(userData: {
    username: string;
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
    role?: UserRole;
    emailVerified?: boolean;
    status?: UserStatus;
  }): Promise<User> {
    const user = this.repository.create({
      ...userData,
      status: userData.status || UserStatus.ACTIVE,  // 确保新用户状态为激活
      emailVerified: userData.emailVerified || false,
    });
    return this.repository.save(user);
  }

  /**
   * 更新用户密码
   */
  public async updatePassword(userId: string, hashedPassword: string): Promise<boolean> {
    const result = await this.repository.update(userId, {
      password: hashedPassword,
      passwordChangedAt: new Date(),
      // 使用数据库的原生自增功能来更新token版本
      // 移除了有问题的lambda表达式
    });

    return (result.affected || 0) > 0;
  }

  /**
   * 更新用户最后登录信息
   */
  public async updateLastLogin(userId: string, ip?: string): Promise<boolean> {
    const result = await this.repository.update(userId, {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
      loginAttempts: 0,
      lockedUntil: undefined,
    });

    return (result.affected || 0) > 0;
  }

  /**
   * 增加登录失败次数
   */
  public async incrementLoginAttempts(userId: string): Promise<User | null> {
    const user = await this.findById(userId);
    if (!user) return null;

    user.incrementLoginAttempts();
    return this.repository.save(user);
  }

  /**
   * 重置登录失败次数
   */
  public async resetLoginAttempts(userId: string): Promise<boolean> {
    const result = await this.repository.update(userId, {
      loginAttempts: 0,
      lockedUntil: undefined,
    });

    return (result.affected || 0) > 0;
  }

  /**
   * 锁定用户账户
   */
  public async lockUser(userId: string, lockDurationMinutes: number = 15): Promise<boolean> {
    const lockedUntil = new Date(Date.now() + lockDurationMinutes * 60 * 1000);

    const result = await this.repository.update(userId, {
      status: UserStatus.SUSPENDED,
      lockedUntil,
    });

    return (result.affected || 0) > 0;
  }

  /**
   * 解锁用户账户
   */
  public async unlockUser(userId: string): Promise<boolean> {
    const result = await this.repository.update(userId, {
      status: UserStatus.ACTIVE,
      lockedUntil: undefined,
      loginAttempts: 0,
    });

    return (result.affected || 0) > 0;
  }

  /**
   * 更新用户状态
   */
  public async updateUserStatus(userId: string, status: UserStatus): Promise<boolean> {
    const result = await this.repository.update(userId, { status });
    return (result.affected || 0) > 0;
  }

  /**
   * 获取用户数据用于导出
   */
  public async findUsersForExport(filters: {
    role?: UserRole;
    status?: UserStatus;
    search?: string;
    startDate?: Date;
    endDate?: Date;
  }, limit: number = 1000): Promise<User[]> {
    const queryBuilder = this.repository.createQueryBuilder('user');

    // 应用过滤器
    if (filters.role) {
      queryBuilder.andWhere('user.role = :role', { role: filters.role });
    }

    if (filters.status) {
      queryBuilder.andWhere('user.status = :status', { status: filters.status });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(user.username LIKE :search OR user.email LIKE :search OR user.firstName LIKE :search OR user.lastName LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.startDate) {
      queryBuilder.andWhere('user.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters.endDate) {
      queryBuilder.andWhere('user.createdAt <= :endDate', { endDate: filters.endDate });
    }

    return queryBuilder
      .orderBy('user.createdAt', 'DESC')
      .limit(limit)
      .getMany();
  }

  /**
   * 验证邮箱
   */
  public async verifyEmail(userId: string): Promise<boolean> {
    const result = await this.repository.update(userId, {
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });

    return (result.affected || 0) > 0;
  }

  /**
   * 设置密码重置令牌
   */
  public async setPasswordResetToken(userId: string, token: string, expiresInHours: number = 1): Promise<boolean> {
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const result = await this.repository.update(userId, {
      passwordResetToken: token,
      passwordResetExpiresAt: expiresAt,
      passwordResetRequestedAt: new Date(),
    });

    return (result.affected || 0) > 0;
  }

  /**
   * 根据密码重置令牌查找用户
   */
  public async findByPasswordResetToken(token: string): Promise<User | null> {
    return this.repository.findOne({
      where: {
        passwordResetToken: token,
        passwordResetExpiresAt: {
          $gt: new Date(),
        } as any,
      },
    });
  }

  /**
   * 清除密码重置令牌
   */
  public async clearPasswordResetToken(userId: string): Promise<boolean> {
    const result = await this.repository.update(userId, {
      passwordResetToken: null as any,
      passwordResetExpiresAt: null as any,
      passwordResetRequestedAt: null as any,
    });

    return (result.affected || 0) > 0;
  }

  /**
   * 更新用户资料
   */
  public async updateProfile(userId: string, updates: {
    firstName?: string;
    lastName?: string;
    bio?: string;
    phone?: string;
    avatar?: string;
  }): Promise<User | null> {
    await this.repository.update(userId, updates);
    return this.findById(userId);
  }

  /**
   * 更新用户偏好设置
   */
  public async updatePreferences(userId: string, preferences: Record<string, any>): Promise<boolean> {
    const result = await this.repository.update(userId, { preferences });
    return (result.affected || 0) > 0;
  }

  /**
   * 检查邮箱是否已存在
   */
  public async emailExists(email: string): Promise<boolean> {
    const count = await this.repository.count({ where: { email } });
    return count > 0;
  }

  /**
   * 检查用户名是否已存在
   */
  public async usernameExists(username: string): Promise<boolean> {
    const count = await this.repository.count({ where: { username } });
    return count > 0;
  }

  /**
   * 获取活跃用户数量
   */
  public async getActiveUserCount(): Promise<number> {
    return this.repository.count({ where: { status: UserStatus.ACTIVE } });
  }

  /**
   * 获取管理员用户
   */
  public async getAdminUsers(): Promise<User[]> {
    return this.repository.find({ where: { role: UserRole.ADMIN } });
  }

  /**
   * 分页获取用户
   */
  public async getUsersPaginated(page: number = 1, limit: number = 10, filters?: {
    status?: UserStatus;
    role?: UserRole;
    search?: string;
  }): Promise<{ users: User[]; total: number; page: number; totalPages: number }> {
    const skip = (page - 1) * limit;

    let query = this.repository.createQueryBuilder('user');

    // Apply filters
    if (filters?.status) {
      query = query.andWhere('user.status = :status', { status: filters.status });
    }

    if (filters?.role) {
      query = query.andWhere('user.role = :role', { role: filters.role });
    }

    if (filters?.search) {
      query = query.andWhere(
        '(user.username LIKE :search OR user.email LIKE :search OR user.firstName LIKE :search OR user.lastName LIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    const [users, total] = await query
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * 获取最近登录的用户
   */
  public async getRecentlyActiveUsers(days: number = 7): Promise<User[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    return this.repository.find({
      where: {
        lastLoginAt: {
          $gte: cutoffDate,
        } as any,
      },
      order: {
        lastLoginAt: 'DESC',
      },
    });
  }

  // Helper method to get repository for legacy compatibility
  public getRepository() {
    return this.repository;
  }
}