import { jwtService } from './jwtService';
import { logger } from '../utils/logger';

export interface SessionInfo {
  sessionId: string;
  userId: string;
  email: string;
  role: 'admin' | 'user';
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  lastAccessAt: Date;
  expiresAt: Date;
  isActive: boolean;
}

export interface SessionCreateOptions {
  userId: string;
  email: string;
  role: 'admin' | 'user';
  userAgent?: string;
  ipAddress?: string;
  rememberMe?: boolean;
}

export class SessionService {
  // 在实际应用中，这应该存储在Redis或数据库中
  private sessions: Map<string, SessionInfo> = new Map();
  private userSessions: Map<string, Set<string>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly maxSessions = 10000; // 最大会话数限制
  private readonly maxSessionsPerUser = 5; // 每用户最大会话数

  /**
   * 创建新会话
   */
  public async createSession(options: SessionCreateOptions): Promise<SessionInfo> {
    // 检查会话数量限制
    if (this.sessions.size >= this.maxSessions) {
      await this.cleanupExpiredSessions();
      if (this.sessions.size >= this.maxSessions) {
        throw new Error('Maximum session limit reached');
      }
    }

    // 检查用户的会话数量限制
    const userSessionSet = this.userSessions.get(options.userId);
    if (userSessionSet && userSessionSet.size >= this.maxSessionsPerUser) {
      // 移除该用户最旧的会话
      const oldestSessionId = Array.from(userSessionSet).reduce((oldest, current) => {
        const oldestSession = this.sessions.get(oldest);
        const currentSession = this.sessions.get(current);
        if (!oldestSession || !currentSession) return oldest;
        return oldestSession.createdAt < currentSession.createdAt ? oldest : current;
      });
      await this.removeSession(oldestSessionId);
    }

    const sessionId = jwtService.generateSessionId();
    const now = new Date();

    // 根据rememberMe设置过期时间
    const expiresAt = new Date(now.getTime() + (options.rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000);

    const sessionInfo: SessionInfo = {
      sessionId,
      userId: options.userId,
      email: options.email,
      role: options.role,
      userAgent: options.userAgent,
      ipAddress: options.ipAddress,
      createdAt: now,
      lastAccessAt: now,
      expiresAt,
      isActive: true,
    };

    // 存储会话信息
    this.sessions.set(sessionId, sessionInfo);

    // 维护用户的会话列表
    if (!this.userSessions.has(options.userId)) {
      this.userSessions.set(options.userId, new Set());
    }
    this.userSessions.get(options.userId)!.add(sessionId);

    logger.info(`Session created: ${sessionId}`, {
      sessionId,
      userId: options.userId,
      email: options.email,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      totalSessions: this.sessions.size,
    });

    return sessionInfo;
  }

  /**
   * 获取会话信息
   */
  public async getSession(sessionId: string): Promise<SessionInfo | null> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    // 检查会话是否过期
    if (this.isSessionExpired(session)) {
      await this.removeSession(sessionId);
      return null;
    }

    // 更新最后访问时间
    session.lastAccessAt = new Date();
    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * 验证会话是否有效
   */
  public async validateSession(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return false;
    }

    return session.userId === userId && session.isActive;
  }

  /**
   * 更新会话最后访问时间
   */
  public async updateSessionAccess(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);

    if (session && session.isActive) {
      session.lastAccessAt = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  /**
   * 使会话失效
   */
  public async invalidateSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return false;
    }

    session.isActive = false;
    session.lastAccessAt = new Date();
    this.sessions.set(sessionId, session);

    // 从用户的会话列表中移除
    const userSessionSet = this.userSessions.get(session.userId);
    if (userSessionSet) {
      userSessionSet.delete(sessionId);
    }

    logger.info(`Session invalidated: ${sessionId}`, {
      sessionId,
      userId: session.userId,
      email: session.email,
    });

    return true;
  }

  /**
   * 移除会话
   */
  public async removeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return false;
    }

    // 从用户的会话列表中移除
    const userSessionSet = this.userSessions.get(session.userId);
    if (userSessionSet) {
      userSessionSet.delete(sessionId);
    }

    // 删除会话
    this.sessions.delete(sessionId);

    logger.info(`Session removed: ${sessionId}`, {
      sessionId,
      userId: session.userId,
      email: session.email,
    });

    return true;
  }

  /**
   * 使用户的所有会话失效
   */
  public async invalidateAllUserSessions(userId: string): Promise<number> {
    const userSessionSet = this.userSessions.get(userId);

    if (!userSessionSet) {
      return 0;
    }

    let invalidatedCount = 0;

    for (const sessionId of userSessionSet) {
      const session = this.sessions.get(sessionId);
      if (session && session.isActive) {
        session.isActive = false;
        session.lastAccessAt = new Date();
        this.sessions.set(sessionId, session);
        invalidatedCount++;
      }
    }

    // 清空用户的会话列表
    userSessionSet.clear();

    logger.info(`All sessions invalidated for user: ${userId}`, {
      userId,
      invalidatedCount,
    });

    return invalidatedCount;
  }

  /**
   * 获取用户的所有活动会话
   */
  public async getUserSessions(userId: string): Promise<SessionInfo[]> {
    const userSessionSet = this.userSessions.get(userId);

    if (!userSessionSet) {
      return [];
    }

    const sessions: SessionInfo[] = [];

    for (const sessionId of userSessionSet) {
      const session = this.sessions.get(sessionId);
      if (session && session.isActive && !this.isSessionExpired(session)) {
        sessions.push(session);
      } else if (session && this.isSessionExpired(session)) {
        // 清理过期的会话
        await this.removeSession(sessionId);
      }
    }

    return sessions.sort((a, b) => b.lastAccessAt.getTime() - a.lastAccessAt.getTime());
  }

  /**
   * 获取会话数量
   */
  public async getSessionCount(userId?: string): Promise<number> {
    if (userId) {
      const sessions = await this.getUserSessions(userId);
      return sessions.length;
    }

    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.isActive && !this.isSessionExpired(session)) {
        count++;
      }
    }

    return count;
  }

  /**
   * 清理过期会话
   */
  public async cleanupExpiredSessions(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (this.isSessionExpired(session)) {
        await this.removeSession(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`Cleaned up ${cleanedCount} expired sessions`, {
        cleanedCount,
        timestamp: now.toISOString(),
      });
    }

    return cleanedCount;
  }

  /**
   * 检查会话是否过期
   */
  private isSessionExpired(session: SessionInfo): boolean {
    return new Date() > session.expiresAt;
  }

  /**
   * 获取会话统计信息
   */
  public async getSessionStats(): Promise<{
    totalSessions: number;
    activeSessions: number;
    expiredSessions: number;
    usersWithSessions: number;
  }> {
    const now = new Date();
    let activeCount = 0;
    let expiredCount = 0;

    for (const session of this.sessions.values()) {
      if (this.isSessionExpired(session)) {
        expiredCount++;
      } else if (session.isActive) {
        activeCount++;
      }
    }

    return {
      totalSessions: this.sessions.size,
      activeSessions: activeCount,
      expiredSessions: expiredCount,
      usersWithSessions: this.userSessions.size,
    };
  }

  /**
   * 强制用户下线（用于管理员）
   */
  public async forceUserOffline(userId: string, reason?: string): Promise<number> {
    const invalidatedCount = await this.invalidateAllUserSessions(userId);

    logger.warn(`User forced offline: ${userId}`, {
      userId,
      invalidatedCount,
      reason: reason || 'Admin action',
    });

    return invalidatedCount;
  }

  /**
   * 检查用户是否在线
   */
  public async isUserOnline(userId: string): Promise<boolean> {
    const sessions = await this.getUserSessions(userId);
    return sessions.length > 0;
  }

  /**
   * 获取在线用户数量
   */
  public async getOnlineUserCount(): Promise<number> {
    let onlineUsers = 0;

    for (const userId of this.userSessions.keys()) {
      const sessions = await this.getUserSessions(userId);
      if (sessions.length > 0) {
        onlineUsers++;
      }
    }

    return onlineUsers;
  }

  /**
   * 批量清理会话（定期任务）
   */
  public async scheduleSessionCleanup(): Promise<void> {
    // 避免重复创建定时器
    if (this.cleanupInterval) {
      logger.warn('Session cleanup scheduler already running');
      return;
    }

    // 每15分钟清理一次过期会话（提高清理频率）
    this.cleanupInterval = setInterval(async () => {
      try {
        const cleanedCount = await this.cleanupExpiredSessions();
        if (cleanedCount > 0) {
          logger.info(`Scheduled session cleanup completed`, {
            cleanedCount,
            totalSessions: this.sessions.size,
          });
        }
      } catch (error) {
        logger.error('Error during scheduled session cleanup', {
          error: (error as Error).message,
          stack: (error as Error).stack,
        });
      }
    }, 15 * 60 * 1000); // 15分钟

    logger.info('Session cleanup scheduler started');
  }

  /**
   * 停止会话清理定时器
   */
  public stopSessionCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('Session cleanup scheduler stopped');
    }
  }

  /**
   * 清理所有会话（用于关闭服务时）
   */
  public async cleanup(): Promise<void> {
    this.stopSessionCleanup();

    // 清理所有会话数据
    const sessionCount = this.sessions.size;
    this.sessions.clear();
    this.userSessions.clear();

    logger.info(`All sessions cleaned up`, {
      clearedSessions: sessionCount,
    });
  }
}

export const sessionService = new SessionService();