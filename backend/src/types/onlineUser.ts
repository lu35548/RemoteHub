/**
 * 统一的在线用户类型定义
 * 用于解决 websocket 和 redis 服务中的类型冲突
 */

export interface OnlineUser {
  userId: string;
  email: string;
  name: string;
  role: string;
  socketId: string;
  lastSeen: Date; // 统一使用 Date 类型
  sessionId: string;
}

/**
 * Redis 存储时使用的序列化格式
 */
export interface OnlineUserRedisFormat {
  userId: string;
  email: string;
  name: string;
  role: string;
  socketId: string;
  lastSeen: string; // Redis 存储时使用 ISO 字符串
  sessionId: string;
}

/**
 * 序列化 OnlineUser 为 Redis 格式
 */
export function serializeOnlineUser(user: OnlineUser): OnlineUserRedisFormat {
  return {
    ...user,
    lastSeen: user.lastSeen.toISOString(),
  };
}

/**
 * 反序列化 Redis 格式为 OnlineUser
 */
export function deserializeOnlineUser(redisUser: OnlineUserRedisFormat): OnlineUser {
  return {
    ...redisUser,
    lastSeen: new Date(redisUser.lastSeen),
  };
}