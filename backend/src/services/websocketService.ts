// import { Server as SocketIOServer } from 'socket.io'; // 暂时禁用
import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { AppDataSource } from '../config/database';
import { User } from '../models/User';
import { RedisService } from './redisService';
import { OnlineUser, serializeOnlineUser } from '../types/onlineUser';

// Mock Socket.IO 服务
class MockSocketIOServer {
  public emit(event: string, data: any): void {
    console.log(`[Mock WebSocket] Event: ${event}`, data);
  }

  public to(roomId: string): MockSocketIOServer {
    console.log(`[Mock WebSocket] To room: ${roomId}`);
    return this;
  }

  public sockets: any = {
    sockets: {
      keys: (): string[] => []
    }
  };
}

class MockSocket {
  public id: string;
  public data: any = {};

  constructor(id: string) {
    this.id = id;
  }
}

export class WebSocketService {
  private io: MockSocketIOServer;
  private onlineUsers = new Map<string, OnlineUser>();
  private userSockets = new Map<string, string>(); // userId -> socketId
  private redisService: RedisService;

  constructor(httpServer: HttpServer) {
    this.io = new MockSocketIOServer();
    this.redisService = new RedisService();
    console.log('使用 Mock WebSocket 服务');
  }

  // 暂时禁用 WebSocket 功能
  // private async initialize() {
  //   // Mock implementation
  // }

  private async handleConnection(socket: any) {
    const user = socket.data.user;
    const sessionId = socket.data.sessionId;

    // 移除同一用户的其他连接（单点登录）
    await this.removeUserSessions(user.id);

    // 创建在线用户对象
    const onlineUser: OnlineUser = {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      socketId: socket.id,
      lastSeen: new Date(),
      sessionId
    };

    // 存储在线用户
    this.onlineUsers.set(socket.id, onlineUser);
    this.userSockets.set(user.id, socket.id);

    // 同步到Redis
    await this.redisService.setOnlineUser(user.id, serializeOnlineUser(onlineUser));

    console.log(`用户 ${user.email} 已上线 (Socket: ${socket.id})`);

    // 广播用户上线
    this.io.emit('user_online', {
      userId: user.id,
      name: user.name,
      role: user.role
    });

    // 发送当前在线用户列表
    socket.emit('online_users', await this.getOnlineUsers());

    // 处理断开连接
    socket.on('disconnect', () => {
      this.handleDisconnection(socket);
    });

    // 处理心跳
    socket.on('heartbeat', async () => {
      await this.updateLastSeen(socket.id);
      socket.emit('heartbeat_ack');
    });

    // 处理加入房间（项目房间）
    socket.on('join_project', async (projectId: string) => {
      socket.join(`project_${projectId}`);
      socket.emit('joined_project', projectId);
    });

    // 处理离开房间
    socket.on('leave_project', (projectId: string) => {
      socket.leave(`project_${projectId}`);
      socket.emit('left_project', projectId);
    });
  }

  private async handleDisconnection(socket: any) {
    const onlineUser = this.onlineUsers.get(socket.id);

    if (onlineUser) {
      console.log(`用户 ${onlineUser.email} 已离线`);

      // 从内存中移除
      this.onlineUsers.delete(socket.id);
      this.userSockets.delete(onlineUser.userId);

      // 从Redis中移除
      await this.redisService.removeOnlineUser(onlineUser.userId);

      // 广播用户离线（延迟5分钟，避免频繁切换）
      setTimeout(() => {
        const stillOffline = !this.userSockets.has(onlineUser.userId);
        if (stillOffline) {
          this.io.emit('user_offline', {
            userId: onlineUser.userId,
            name: onlineUser.name
          });
        }
      }, 5 * 60 * 1000); // 5分钟
    }
  }

  private async removeUserSessions(userId: string) {
    const existingSocketId = this.userSockets.get(userId);
    if (existingSocketId) {
      const existingSocket = this.io.sockets.sockets.get(existingSocketId);
      if (existingSocket) {
        existingSocket.emit('session_conflict', '您已在其他地方登录');
        existingSocket.disconnect();
      }
    }
  }

  private async updateLastSeen(socketId: string) {
    const onlineUser = this.onlineUsers.get(socketId);
    if (onlineUser) {
      onlineUser.lastSeen = new Date();
      await this.redisService.setOnlineUser(onlineUser.userId, serializeOnlineUser(onlineUser));
    }
  }

  async getOnlineUsers(): Promise<OnlineUser[]> {
    try {
      // 优先从Redis获取
      const redisUsers = await this.redisService.getAllOnlineUsers();
      if (redisUsers.length > 0) {
        return redisUsers;
      }

      // 降级到内存
      return Array.from(this.onlineUsers.values());
    } catch (error) {
      console.error('获取在线用户失败:', error);
      return Array.from(this.onlineUsers.values());
    }
  }

  async isUserOnline(userId: string): Promise<boolean> {
    try {
      return await this.redisService.isUserOnline(userId) || this.userSockets.has(userId);
    } catch (error) {
      console.error('检查用户在线状态失败:', error);
      return this.userSockets.has(userId);
    }
  }

  async getUserSocketId(userId: string): Promise<string | null> {
    return this.userSockets.get(userId) || null;
  }

  // 发送私人消息
  async sendToUser(userId: string, event: string, data: any) {
    const socketId = await this.getUserSocketId(userId);
    if (socketId) {
      this.io.to(socketId).emit(event, data);
      return true;
    }
    return false;
  }

  // 发送到项目房间
  sendToProject(projectId: string, event: string, data: any) {
    this.io.to(`project_${projectId}`).emit(event, data);
  }

  // 广播消息
  broadcast(event: string, data: any) {
    this.io.emit(event, data);
  }

  // 获取在线用户统计
  async getOnlineStats() {
    const onlineUsers = await this.getOnlineUsers();
    const stats = {
      total: onlineUsers.length,
      byRole: {} as Record<string, number>,
      bySession: {} as Record<string, number>
    };

    onlineUsers.forEach(user => {
      stats.byRole[user.role] = (stats.byRole[user.role] || 0) + 1;
    });

    return stats;
  }

  // 清理过期会话
  async cleanupExpiredSessions() {
    const now = new Date();
    const expiredThreshold = 30 * 60 * 1000; // 30分钟

    for (const [socketId, user] of this.onlineUsers.entries()) {
      if (now.getTime() - user.lastSeen.getTime() > expiredThreshold) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect();
        }
      }
    }
  }
}