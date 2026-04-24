import { Request, Response, NextFunction } from 'express';
import { jwtService, JWTPayload } from '../services/jwtService';
import { UserRepository } from '../repositories/UserRepository';
import { User, UserRole } from '../models/User';
import { UnauthorizedError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';

// 扩展Request接口以包含用户信息
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
      userEntity?: User;
    }
  }
}

/**
 * JWT认证中间件
 */
export const authenticateToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = jwtService.extractTokenFromHeader(authHeader);

    if (!token) {
      throw new UnauthorizedError('Access token required');
    }

    // 验证访问令牌
    const payload = jwtService.verifyAccessToken(token);

    // 这里应该从数据库获取最新的用户信息
    // 为了简化，我们先使用JWT payload中的信息
    req.user = payload;

    // Also set userEntity for compatibility
    req.userEntity = {
      id: payload.userId,
      username: payload.email?.split('@')[0] || payload.email,
      email: payload.email,
      role: payload.role,
      // Add other fields as needed
    } as any;

    logger.info(`Authenticated user: ${payload.userId} (${payload.email})`, {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      path: req.path,
      method: req.method,
    });

    next();
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      next(error);
    } else {
      next(new UnauthorizedError('Invalid or expired token'));
    }
  }
};

/**
 * 用户实体中间件 - 从数据库加载完整的用户信息
 */
export const loadUserEntity = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      throw new UnauthorizedError('User not authenticated');
    }

    // 这里需要获取UserRepository实例
    // 在实际应用中，应该通过依赖注入来获取
    // 为了演示，我们暂时跳过数据库查询
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 角色权限检查中间件工厂函数
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!roles.includes(req.user.role as UserRole)) {
      logger.warn(`Access denied for user ${req.user.userId}. Required roles: ${roles.join(', ')}, Current role: ${req.user.role}`);
      return next(new ForbiddenError('Insufficient permissions'));
    }

    next();
  };
};

/**
 * 管理员权限中间件
 */
export const requireAdmin = requireRole(UserRole.ADMIN);

/**
 * 普通用户权限中间件
 */
export const requireUser = requireRole(UserRole.USER, UserRole.ADMIN);

/**
 * 资源所有者检查中间件工厂函数
 */
export const requireOwnership = (resourceUserIdField: string = 'userId') => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];

    // 管理员可以访问所有资源
    if (req.user.role === UserRole.ADMIN) {
      return next();
    }

    // 检查是否为资源所有者
    if (req.user.userId !== resourceUserId) {
      logger.warn(`Access denied. User ${req.user.userId} trying to access resource of user ${resourceUserId}`);
      return next(new ForbiddenError('Access denied: not the resource owner'));
    }

    next();
  };
};

/**
 * 可选认证中间件 - 如果有token则验证，没有则继续
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = jwtService.extractTokenFromHeader(authHeader);

    if (token) {
      const payload = jwtService.verifyAccessToken(token);
      req.user = payload;
    }

    next();
  } catch (error) {
    // 可选认证失败时不抛出错误，只是不设置用户信息
    logger.debug('Optional authentication failed', { error: (error as Error).message });
    next();
  }
};

/**
 * 检查用户账户状态中间件
 */
export const checkUserStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    // 这里应该从数据库检查用户状态
    // 为了演示，我们假设用户状态总是正常的
    // 在实际应用中，需要检查：
    // - 用户是否被激活
    // - 用户是否被暂停
    // - 用户是否被锁定

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 会话验证中间件
 */
export const validateSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user) {
      return next(new UnauthorizedError('Authentication required'));
    }

    if (!req.user.sessionId) {
      return next(new UnauthorizedError('Invalid session'));
    }

    // 这里应该检查会话是否仍然有效
    // 例如检查Redis中的会话存储

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * API密钥认证中间件（可选）
 */
export const authenticateApiKey = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      return next(new UnauthorizedError('API key required'));
    }

    // 这里应该验证API密钥
    // 例如从数据库查找对应的API密钥

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * 速率限制检查中间件
 */
export const checkRateLimit = (maxRequests: number, windowMs: number) => {
  const requests = new Map<string, { count: number; resetTime: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.user?.userId || req.ip;
    const now = Date.now();

    if (!identifier) {
      return next();
    }

    const userRequests = requests.get(identifier);

    if (!userRequests || now > userRequests.resetTime) {
      requests.set(identifier, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (userRequests.count >= maxRequests) {
      const resetTime = Math.ceil((userRequests.resetTime - now) / 1000);
      res.set('Retry-After', resetTime.toString());
      return next(new ForbiddenError('Rate limit exceeded'));
    }

    userRequests.count++;
    next();
  };
};

/**
 * 登录速率限制中间件
 */
export const loginRateLimit = checkRateLimit(5, 15 * 60 * 1000); // 5次请求/15分钟

/**
 * 注册速率限制中间件
 */
export const registrationRateLimit = checkRateLimit(3, 60 * 60 * 1000); // 3次请求/1小时

/**
 * 密码重置速率限制中间件
 */
export const passwordResetRateLimit = checkRateLimit(3, 60 * 60 * 1000); // 3次请求/1小时