import { Request, Response, NextFunction } from 'express';
import { TooManyRequestsError } from '@/utils/errors';
import { logger } from '@/utils/logger';

interface RateLimitOptions {
  windowMs: number; // 时间窗口（毫秒）
  maxRequests: number; // 最大请求数
  message?: string; // 自定义错误消息
  skipSuccessfulRequests?: boolean; // 是否跳过成功的请求
  skipFailedRequests?: boolean; // 是否跳过失败的请求
  keyGenerator?: (req: Request) => string; // 自定义键生成器
  standardHeaders?: boolean | 'draft-6'; // 是否使用标准速率限制头
  legacyHeaders?: boolean; // 是否使用旧版头
  skip?: (req: Request) => boolean; // 跳过限制的条件函数
}

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

// 内存存储的速率限制记录
const rateLimitStore = new Map<string, RateLimitRecord>();

// 清理过期记录
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetTime) {
      rateLimitStore.delete(key);
    }
  }
}, 60000); // 每分钟清理一次

const defaultRateLimitOptions: Required<Omit<RateLimitOptions, 'keyGenerator'>> = {
  skip: () => false,
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 100,
  message: '请求过于频繁，请稍后再试',
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
  standardHeaders: 'draft-6', // 使用新的标准头
  legacyHeaders: false, // 不使用旧版头
};

/**
 * 创建速率限制中间件
 */
export const createRateLimiter = (options: RateLimitOptions) => {
  const {
    windowMs = defaultRateLimitOptions.windowMs,
    maxRequests = defaultRateLimitOptions.maxRequests,
    message = defaultRateLimitOptions.message,
    skipSuccessfulRequests = defaultRateLimitOptions.skipSuccessfulRequests,
    skipFailedRequests = defaultRateLimitOptions.skipFailedRequests,
    standardHeaders = defaultRateLimitOptions.standardHeaders,
    legacyHeaders = defaultRateLimitOptions.legacyHeaders,
    keyGenerator = (req: Request) => {
      // 默认使用IP作为键
      return req.ip || req.connection.remoteAddress || 'unknown';
    },
    skip = defaultRateLimitOptions.skip,
  } = { ...defaultRateLimitOptions, ...options };

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator(req);
    const now = Date.now();

    // 获取或创建速率限制记录
    let record = rateLimitStore.get(key);
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, record);
    }

    // 增加请求计数
    record.count++;

    // 计算剩余请求数和重置时间
    const remainingRequests = Math.max(0, maxRequests - record.count);
    const resetTime = Math.ceil((record.resetTime - now) / 1000);

    // 设置响应头
    res.set({
      'X-RateLimit-Limit': maxRequests.toString(),
      'X-RateLimit-Remaining': remainingRequests.toString(),
      'X-RateLimit-Reset': record.resetTime.toString(),
    });

    // 检查是否超过限制
    if (record.count > maxRequests) {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        key,
        count: record.count,
        limit: maxRequests,
      });

      throw new TooManyRequestsError(message);
    }

    // 记录请求
    const originalEnd = res.end;
    const originalJson = res.json;
    let isSuccess = true;

    // 重写 end 方法以跟踪响应状态
    res.end = function(...args: any[]) {
      if (res.statusCode >= 400) {
        isSuccess = false;
      }
      return originalEnd.apply(this, args);
    };

    // 重写 json 方法以跟踪响应状态
    res.json = function(...args: any[]) {
      if (res.statusCode >= 400) {
        isSuccess = false;
      }
      return originalJson.apply(this, args);
    };

    // 在响应完成后决定是否减少计数
    res.on('finish', () => {
      if ((skipSuccessfulRequests && isSuccess) || (skipFailedRequests && !isSuccess)) {
        record.count = Math.max(0, record.count - 1);
      }
    });

    next();
  };
};

// 预定义的速率限制器

// 通用API限制（每分钟100次）
export const apiRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 100,
  message: 'API请求过于频繁，请1分钟后再试',
});

// 严格的API限制（每分钟20次）
export const strictRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 20,
  message: '请求过于频繁，请1分钟后再试',
});

// 认证相关的严格限制（每分钟5次）
export const authRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 5,
  message: '登录尝试过于频繁，请1分钟后再试',
  keyGenerator: (req: Request) => {
    // 对于认证请求，使用IP和邮箱的组合作为键
    const email = req.body.email || '';
    return `${req.ip}:${email}`;
  },
});

// 密码重置限制（每小时3次）
export const passwordResetRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1小时
  maxRequests: 3,
  message: '密码重置请求过于频繁，请1小时后再试',
  keyGenerator: (req: Request) => {
    const email = req.body.email || '';
    return `password-reset:${req.ip}:${email}`;
  },
});

// 文件上传限制（每分钟10次）
export const uploadRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 10,
  message: '文件上传过于频繁，请1分钟后再试',
});

// 搜索限制（每分钟60次）
export const searchRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 60,
  message: '搜索请求过于频繁，请1分钟后再试',
  skipSuccessfulRequests: true, // 成功的搜索不计入限制
});

// 创建项目限制（每分钟5次）
export const createProjectRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 5,
  message: '创建项目过于频繁，请1分钟后再试',
});

// 批量操作限制（每分钟10次）
export const batchOperationRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 10,
  message: '批量操作过于频繁，请1分钟后再试',
});

// 连接测试限制（每分钟30次）
export const connectionTestRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 30,
  message: '连接测试过于频繁，请1分钟后再试',
});

// 数据导出限制（每小时10次）
export const exportRateLimit = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1小时
  maxRequests: 10,
  message: '数据导出过于频繁，请1小时后再试',
  keyGenerator: (req: Request) => {
    const userId = (req as any).user?.id;
    return userId ? `export:${userId}` : `export:${req.ip}`;
  },
});

// 审计日志查询限制（每分钟30次）
export const auditLogRateLimit = createRateLimiter({
  windowMs: 60 * 1000, // 1分钟
  maxRequests: 30,
  message: '审计日志查询过于频繁，请1分钟后再试',
});

/**
 * 动态速率限制器
 * 根据用户角色调整限制
 */
export const createDynamicRateLimiter = (
  userRoleLimits: { [role: string]: { windowMs: number; maxRequests: number } }
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 假设用户信息已经通过认证中间件添加到请求中
    const userRole = (req as any).user?.role || 'anonymous';
    const limits = userRoleLimits[userRole] || userRoleLimits.anonymous || {
      windowMs: 60 * 1000,
      maxRequests: 10,
    };

    const limiter = createRateLimiter({
      windowMs: limits.windowMs,
      maxRequests: limits.maxRequests,
      keyGenerator: (req: Request) => {
        const userId = (req as any).user?.id || req.ip;
        return `${userRole}:${userId}`;
      },
    });

    limiter(req, res, next);
  };
};

// 预定义的动态限制器
export const dynamicApiRateLimit = createDynamicRateLimiter({
  admin: { windowMs: 60 * 1000, maxRequests: 200 },
  owner: { windowMs: 60 * 1000, maxRequests: 150 },
  editor: { windowMs: 60 * 1000, maxRequests: 100 },
  viewer: { windowMs: 60 * 1000, maxRequests: 50 },
  anonymous: { windowMs: 60 * 1000, maxRequests: 20 },
});

/**
 * 基于用户的速率限制器
 */
export const createUserBasedRateLimiter = (options: {
  windowMs: number;
  maxRequests: number;
  authenticatedBoost?: number; // 认证用户的额外请求数
}) => {
  const { windowMs, maxRequests, authenticatedBoost = 0 } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const isAuthenticated = !!(req as any).user;
    const actualMaxRequests = isAuthenticated ? maxRequests + authenticatedBoost : maxRequests;

    const limiter = createRateLimiter({
      windowMs,
      maxRequests: actualMaxRequests,
      keyGenerator: (req: Request) => {
        const userId = (req as any).user?.id;
        return userId ? `user:${userId}` : `ip:${req.ip}`;
      },
    });

    limiter(req, res, next);
  };
};

// 预定义的用户基础限制器
export const userBasedApiRateLimit = createUserBasedRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
  authenticatedBoost: 70, // 认证用户总共100次/分钟
});