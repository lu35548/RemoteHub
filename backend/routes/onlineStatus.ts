import { Router } from 'express';
import { WebSocketService } from '../services/websocketService';
import { createOnlineStatusMiddleware } from '../middleware/onlineStatus';
import { authenticateToken, requireRole } from '../middleware/auth';
import { validateRequest } from '../middleware/validation';

export const createOnlineStatusRoutes = (wsService: WebSocketService): Router => {
  const router = Router();
  const onlineStatusMiddleware = createOnlineStatusMiddleware(wsService);

  /**
   * GET /api/v1/online-status/users
   * 获取所有在线用户列表
   * 需要管理员权限
   */
  router.get(
    '/users',
    authenticateToken,
    requireRole('admin'),
    onlineStatusMiddleware.getOnlineUsers,
    (req, res) => {
      const onlineUsers = res.locals.onlineUsers || [];

      res.status(200).json({
        success: true,
        data: {
          users: onlineUsers,
          total: onlineUsers.length
        }
      });
    }
  );

  /**
   * GET /api/v1/online-status/stats
   * 获取在线用户统计信息
   * 需要管理员权限
   */
  router.get(
    '/stats',
    authenticateToken,
    requireRole('admin'),
    onlineStatusMiddleware.getOnlineStats
  );

  /**
   * GET /api/v1/online-status/check/:userId
   * 检查指定用户是否在线
   * 需要管理员权限
   */
  router.get(
    '/check/:userId',
    authenticateToken,
    requireRole('admin'),
    onlineStatusMiddleware.checkUserOnline
  );

  /**
   * GET /api/v1/online-status/me
   * 获取当前用户的在线状态
   */
  router.get(
    '/me',
    authenticateToken,
    async (req, res) => {
      try {
        const userId = req.user.id;
        const isOnline = await wsService.isUserOnline(userId);

        // 获取用户详情
        const onlineUsers = await wsService.getOnlineUsers();
        const currentUser = onlineUsers.find(u => u.userId === userId);

        res.status(200).json({
          success: true,
          data: {
            isOnline,
            user: currentUser ? {
              lastSeen: currentUser.lastSeen,
              sessionId: currentUser.sessionId
            } : null
          }
        });
      } catch (error) {
        console.error('获取用户在线状态失败:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: '获取在线状态失败'
          }
        });
      }
    }
  );

  /**
   * POST /api/v1/online-status/heartbeat
   * 发送心跳包，保持在线状态
   */
  router.post(
    '/heartbeat',
    authenticateToken,
    async (req, res) => {
      try {
        const userId = req.user.id;
        const isOnline = await wsService.isUserOnline(userId);

        // 通过WebSocket发送心跳
        const success = await wsService.sendToUser(userId, 'heartbeat_request', {
          timestamp: new Date().toISOString()
        });

        res.status(200).json({
          success: true,
          data: {
            isOnline,
            heartbeatSent: success
          }
        });
      } catch (error) {
        console.error('发送心跳失败:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: '发送心跳失败'
          }
        });
      }
    }
  );

  /**
   * POST /api/v1/online-status/disconnect
   * 强制断开用户连接（管理员功能）
   */
  router.post(
    '/disconnect/:userId',
    authenticateToken,
    requireRole('admin'),
    validateRequest({
      params: {
        userId: {
          type: 'string',
          format: 'uuid'
        }
      }
    }),
    async (req, res) => {
      try {
        const { userId } = req.params;
        const reason = req.body.reason || '管理员操作';

        // 发送断开连接通知
        const success = await wsService.sendToUser(userId, 'force_disconnect', {
          reason,
          timestamp: new Date().toISOString()
        });

        if (success) {
          // 记录操作日志
          console.log(`管理员 ${req.user.email} 强制断开用户 ${userId} 的连接，原因：${reason}`);

          res.status(200).json({
            success: true,
            message: '用户已收到断开连接通知'
          });
        } else {
          res.status(404).json({
            success: false,
            error: {
              code: 'USER_NOT_ONLINE',
              message: '用户不在线或通知发送失败'
            }
          });
        }
      } catch (error) {
        console.error('强制断开用户连接失败:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: '断开连接操作失败'
          }
        });
      }
    }
  );

  /**
   * GET /api/v1/online-status/activity
   * 获取最近用户活动记录（简化版）
   */
  router.get(
    '/activity',
    authenticateToken,
    requireRole('admin'),
    async (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const onlineUsers = await wsService.getOnlineUsers();

        // 按最后活动时间排序
        const sortedUsers = onlineUsers
          .sort((a, b) => b.lastSeen.getTime() - a.lastSeen.getTime())
          .slice(0, limit)
          .map(user => ({
            userId: user.userId,
            email: user.email,
            name: user.name,
            role: user.role,
            lastSeen: user.lastSeen,
            sessionId: user.sessionId
          }));

        res.status(200).json({
          success: true,
          data: {
            activities: sortedUsers,
            total: sortedUsers.length
          }
        });
      } catch (error) {
        console.error('获取用户活动记录失败:', error);
        res.status(500).json({
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: '获取活动记录失败'
          }
        });
      }
    }
  );

  return router;
};