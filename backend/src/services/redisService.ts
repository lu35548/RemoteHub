import { logger } from '../utils/logger';
import { OnlineUser, OnlineUserRedisFormat, deserializeOnlineUser } from '../types/onlineUser';

// 使用 Mock Redis 服务避免依赖问题
class MockRedis {
  private data = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.data.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.data.delete(key);
  }

  async exists(key: string): Promise<number> {
    return this.data.has(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return Array.from(this.data.keys()).filter(key => regex.test(key));
  }

  async hget(key: string, field: string): Promise<string | null> {
    const data = this.data.get(key);
    if (!data) return null;
    const obj = JSON.parse(data);
    return obj[field] || null;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    let obj = {};
    const existing = this.data.get(key);
    if (existing) {
      obj = JSON.parse(existing);
    }
    obj[field] = value;
    this.data.set(key, JSON.stringify(obj));
  }

  async hdel(key: string, field: string): Promise<void> {
    const data = this.data.get(key);
    if (!data) return;
    const obj = JSON.parse(data);
    delete obj[field];
    this.data.set(key, JSON.stringify(obj));
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const data = this.data.get(key);
    return data ? JSON.parse(data) : {};
  }

  async hexists(key: string, field: string): Promise<number> {
    const data = this.data.get(key);
    if (!data) return 0;
    const obj = JSON.parse(data);
    return obj[field] ? 1 : 0;
  }

  async expire(key: string, seconds: number): Promise<void> {
    // Mock implementation - 实际环境中会设置过期时间
  }

  async sadd(key: string, member: string): Promise<void> {
    const existing = this.data.get(key) || '[]';
    const members = JSON.parse(existing);
    if (!members.includes(member)) {
      members.push(member);
      this.data.set(key, JSON.stringify(members));
    }
  }

  async srem(key: string, member: string): Promise<void> {
    const existing = this.data.get(key);
    if (existing) {
      const members = JSON.parse(existing);
      const index = members.indexOf(member);
      if (index > -1) {
        members.splice(index, 1);
        this.data.set(key, JSON.stringify(members));
      }
    }
  }

  async scard(key: string): Promise<number> {
    const existing = this.data.get(key);
    if (!existing) return 0;
    const members = JSON.parse(existing);
    return members.length;
  }

  async setex(key: string, seconds: number, value: string): Promise<void> {
    this.data.set(key, value);
  }

  async quit(): Promise<void> {
    this.data.clear();
  }
}

const Redis = MockRedis;

export class RedisService {
  private redis: InstanceType<typeof MockRedis>;
  private readonly ONLINE_USERS_KEY = 'online_users';
  private readonly USER_PREFIX = 'user:';

  constructor() {
    this.redis = new Redis();
    logger.info('使用 Mock Redis 服务');
  }

  async setOnlineUser(userId: string, user: OnlineUserRedisFormat): Promise<void> {
    try {
      const key = `${this.USER_PREFIX}${userId}`;
      const userWithTimestamp = user;

      // 存储用户详情
      await this.redis.hset(this.ONLINE_USERS_KEY, userId, JSON.stringify(userWithTimestamp));

      // 设置过期时间（2小时）
      await this.redis.expire(this.ONLINE_USERS_KEY, 7200);

      // 添加到在线用户集合
      await this.redis.sadd('online_user_ids', userId);
      await this.redis.expire('online_user_ids', 7200);

    } catch (error) {
      logger.error('设置在线用户失败:', error);
      throw error;
    }
  }

  async removeOnlineUser(userId: string): Promise<void> {
    try {
      // 从哈希表中删除
      await this.redis.hdel(this.ONLINE_USERS_KEY, userId);

      // 从集合中删除
      await this.redis.srem('online_user_ids', userId);

    } catch (error) {
      logger.error('移除在线用户失败:', error);
    }
  }

  async getOnlineUser(userId: string): Promise<OnlineUser | null> {
    try {
      const userData = await this.redis.hget(this.ONLINE_USERS_KEY, userId);
      if (userData) {
        const redisUser: OnlineUserRedisFormat = JSON.parse(userData);
        return deserializeOnlineUser(redisUser);
      }
      return null;
    } catch (error) {
      logger.error('获取在线用户失败:', error);
      return null;
    }
  }

  async getAllOnlineUsers(): Promise<OnlineUser[]> {
    try {
      const users = await this.redis.hgetall(this.ONLINE_USERS_KEY);
      const onlineUsers: OnlineUser[] = [];

      for (const [, userData] of Object.entries(users)) {
        try {
          const redisUser: OnlineUserRedisFormat = JSON.parse(userData as string);
          onlineUsers.push(deserializeOnlineUser(redisUser));
        } catch (parseError) {
          logger.error('解析用户数据失败:', parseError);
        }
      }

      return onlineUsers;
    } catch (error) {
      logger.error('获取所有在线用户失败:', error);
      return [];
    }
  }

  async isUserOnline(userId: string): Promise<boolean> {
    try {
      return await this.redis.hexists(this.ONLINE_USERS_KEY, userId) === 1;
    } catch (error) {
      logger.error('检查用户在线状态失败:', error);
      return false;
    }
  }

  async updateLastSeen(userId: string): Promise<void> {
    try {
      const userData = await this.redis.hget(this.ONLINE_USERS_KEY, userId);
      if (userData) {
        const user = JSON.parse(userData);
        user.lastSeen = new Date().toISOString();
        await this.redis.hset(this.ONLINE_USERS_KEY, userId, JSON.stringify(user));
      }
    } catch (error) {
      logger.error('更新最后在线时间失败:', error);
    }
  }

  async getOnlineUserCount(): Promise<number> {
    try {
      return await this.redis.scard('online_user_ids');
    } catch (error) {
      logger.error('获取在线用户数量失败:', error);
      return 0;
    }
  }

  async getOnlineUsersByRole(role: string): Promise<OnlineUser[]> {
    try {
      const allUsers = await this.getAllOnlineUsers();
      return allUsers.filter(user => user.role === role);
    } catch (error) {
      logger.error('根据角色获取在线用户失败:', error);
      return [];
    }
  }

  // 清理过期用户
  async cleanupExpiredUsers(): Promise<number> {
    try {
      const allUsers = await this.getAllOnlineUsers();
      const now = new Date();
      const expiredThreshold = 30 * 60 * 1000; // 30分钟
      let cleanedCount = 0;

      for (const user of allUsers) {
        if (now.getTime() - user.lastSeen.getTime() > expiredThreshold) {
          await this.removeOnlineUser(user.userId);
          cleanedCount++;
        }
      }

      return cleanedCount;
    } catch (error) {
      logger.error('清理过期用户失败:', error);
      return 0;
    }
  }

  // 获取用户会话信息
  async getUserSession(userId: string): Promise<any> {
    try {
      const sessionKey = `session:${userId}`;
      const sessionData = await this.redis.get(sessionKey);
      return sessionData ? JSON.parse(sessionData) : null;
    } catch (error) {
      logger.error('获取用户会话失败:', error);
      return null;
    }
  }

  // 设置用户会话
  async setUserSession(userId: string, sessionData: any, ttl: number = 3600): Promise<void> {
    try {
      const sessionKey = `session:${userId}`;
      await this.redis.setex(sessionKey, ttl, JSON.stringify(sessionData));
    } catch (error) {
      logger.error('设置用户会话失败:', error);
    }
  }

  // 删除用户会话
  async removeUserSession(userId: string): Promise<void> {
    try {
      const sessionKey = `session:${userId}`;
      await this.redis.del(sessionKey);
    } catch (error) {
      logger.error('删除用户会话失败:', error);
    }
  }

  // 获取在线统计
  async getOnlineStats(): Promise<any> {
    try {
      const allUsers = await this.getAllOnlineUsers();
      const stats = {
        total: allUsers.length,
        byRole: {} as Record<string, number>,
        byHour: {} as Record<string, number>
      };

      allUsers.forEach(user => {
        // 按角色统计
        stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;

        // 按小时统计
        const hour = user.lastSeen.getHours();
        stats.byHour[hour] = (stats.byHour[hour] || 0) + 1;
      });

      return stats;
    } catch (error) {
      logger.error('获取在线统计失败:', error);
      return {
        total: 0,
        byRole: {},
        byHour: {}
      };
    }
  }

  // 设置用户状态
  async setUserStatus(userId: string, status: string, ttl: number = 3600): Promise<void> {
    try {
      const statusKey = `status:${userId}`;
      await this.redis.setex(statusKey, ttl, status);
    } catch (error) {
      logger.error('设置用户状态失败:', error);
    }
  }

  // 获取用户状态
  async getUserStatus(userId: string): Promise<string | null> {
    try {
      const statusKey = `status:${userId}`;
      return await this.redis.get(statusKey);
    } catch (error) {
      logger.error('获取用户状态失败:', error);
      return null;
    }
  }

  // 关闭连接
  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}