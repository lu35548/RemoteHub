import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/jwtService';
import { WebSocketService } from '../services/websocketService';

interface RequestWithUser extends Request {
  user?: any;
}

export class OnlineStatusMiddleware {
  private wsService: WebSocketService;

  constructor(wsService: WebSocketService) {
    this.wsService = wsService;
  }

  /**
   * 更新用户最后活动时间
   */
  updateLastSeen = async (req: RequestWithUser, res: Response, next: NextFunction) => {
    try {
      // 只对已认证的请求更新
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = jwtService.verifyAccessToken(token);

        if (decoded && decoded.userId) {
          // 更新最后活动时间（异步，不阻塞请求）
          this.updateUserActivity(decoded.userId).catch(error => {
            console.error('更新用户活动失败:', error);
          });
        }
      }

      next();
    } catch (error) {
      // 不阻塞请求，只记录错误
      console.error('在线状态中间件错误:', error);
      next();
    }
  };

  /**
   * 获取在线用户列表的中间件
   */
  getOnlineUsers = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const onlineUsers = await this.wsService.getOnlineUsers();

      // 转换为响应格式
      const formattedUsers = onlineUsers.map(user => ({
        id: user.userId,
        email: user.email,
        name: user.name,
        role: user.role,
        lastSeen: user.lastSeen
      }));

      res.locals.onlineUsers = formattedUsers;
      next();
    } catch (error) {
      console.error('获取在线用户失败:', error);
      res.locals.onlineUsers = [];
      next();
    }
  };

  /**
   * 检查用户是否在线
   */
  checkUserOnline = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_PARAMETER',
            message: '用户ID是必需的'
          }
        });
      }

      const isOnline = await this.wsService.isUserOnline(userId);

      res.status(200).json({
        success: true,
        data: {
          userId,
          isOnline
        }
      });
    } catch (error) {
      console.error('检查用户在线状态失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '检查用户在线状态失败'
        }
      });
    }
  };

  /**
   * 获取在线用户统计
   */
  getOnlineStats = async (req: Request, res: Response) => {
    try {
      const stats = await this.wsService.getOnlineStats();

      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('获取在线统计失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取在线统计失败'
        }
      });
    }
  };

  /**
   * 实时更新用户活动
   */
  private async updateUserActivity(userId: string) {
    try {
      // 这里可以通过Redis或其他方式更新用户活动
      // 当前实现在WebSocket服务中处理

      // 可以触发WebSocket事件通知其他用户
      this.wsService.sendToUser(userId, 'activity_updated', {
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('更新用户活动失败:', error);
    }
  }
}

// 创建中间件实例的工厂函数
export const createOnlineStatusMiddleware = (wsService: WebSocketService) => {
  return new OnlineStatusMiddleware(wsService);
};