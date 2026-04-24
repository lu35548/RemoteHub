import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { config } from '@/config/config';

/**
 * IP白名单中间件
 */
export const createIPWhitelist = (allowedIPs: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = req.ip || req.connection.remoteAddress;

    if (!allowedIPs.includes(clientIP as string)) {
      logger.warn('IP地址不在白名单中', {
        ip: clientIP,
        userAgent: req.get('User-Agent'),
        path: req.path,
      });

      res.status(403).json({
        success: false,
        error: {
          code: 'IP_NOT_ALLOWED',
          message: '您的IP地址无权访问此资源',
        },
      });
      return;
    }

    next();
  };
};

/**
 * 检测可疑活动的中间件
 */
export const suspiciousActivityDetector = (req: Request, res: Response, next: NextFunction): void => {
  const suspicious = {
    isSuspicious: false,
    reasons: [] as string[],
  };

  const userAgent = req.get('User-Agent') || '';
  const referer = req.get('Referer') || '';

  // 检测缺失或可疑的User-Agent
  if (!userAgent || userAgent.length < 10) {
    suspicious.isSuspicious = true;
    suspicious.reasons.push('缺失或无效的User-Agent');
  }

  // 检测常见的自动化工具
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
    /python/i,
    /java/i,
    /go-http/i,
  ];

  if (botPatterns.some(pattern => pattern.test(userAgent))) {
    suspicious.isSuspicious = true;
    suspicious.reasons.push('检测到自动化工具');
  }

  // 检测异常的请求头
  const expectedHeaders = ['accept', 'accept-language', 'accept-encoding'];
  const missingHeaders = expectedHeaders.filter(header => !req.get(header));
  if (missingHeaders.length > 1) {
    suspicious.isSuspicious = true;
    suspicious.reasons.push(`缺失关键请求头: ${missingHeaders.join(', ')}`);
  }

  // 检测请求时间间隔（使用内存存储简单记录）
  const key = req.ip;
  const now = Date.now();

  // 这里应该使用Redis或其他持久化存储
  // 暂时使用内存存储演示
  (req as any).suspiciousActivity = suspicious;

  if (suspicious.isSuspicious) {
    logger.warn('检测到可疑活动', {
      ip: req.ip,
      userAgent,
      path: req.path,
      reasons: suspicious.reasons,
    });

    // 可以添加额外的安全措施，如验证码、临时封禁等
  }

  next();
};

/**
 * 请求大小限制中间件
 */
export const createSizeLimit = (maxSize: number = 10 * 1024 * 1024) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const contentLength = parseInt(req.get('Content-Length') || '0');

    if (contentLength > maxSize) {
      res.status(413).json({
        success: false,
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: `请求体过大，最大允许 ${Math.round(maxSize / 1024 / 1024)}MB`,
        },
      });
      return;
    }

    next();
  };
};

/**
 * HTTP方法验证中间件
 */
export const validateHTTPMethods = (allowedMethods: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!allowedMethods.includes(req.method)) {
      logger.warn('不允许的HTTP方法', {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });

      res.status(405).json({
        success: false,
        error: {
          code: 'METHOD_NOT_ALLOWED',
          message: `不允许使用 ${req.method} 方法`,
        },
      });
      return;
    }

    next();
  };
};

/**
 * API版本控制中间件
 */
export const apiVersionControl = (supportedVersions: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const apiVersion = req.get('API-Version') || req.query.version || 'v1';

    if (!supportedVersions.includes(apiVersion as string)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_API_VERSION',
          message: `不支持的API版本: ${apiVersion}`,
          supportedVersions,
        },
      });
      return;
    }

    (req as any).apiVersion = apiVersion;
    next();
  };
};

/**
 * 安全响应头中间件
 */
export const securityHeaders = (req: Request, res: Response, next: NextFunction): void => {
  // 防止点击劫持
  res.setHeader('X-Frame-Options', 'DENY');

  // 防止MIME类型嗅探
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // XSS保护
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // 引用策略
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 权限策略
  res.setHeader('Permissions-Policy',
    'geolocation=(), ' +
    'microphone=(), ' +
    'camera=(), ' +
    'payment=(), ' +
    'usb=(), ' +
    'magnetometer=(), ' +
    'gyroscope=(), ' +
    'accelerometer=()'
  );

  // 自定义安全头
  res.setHeader('X-Powered-By', 'RemoteHub');
  res.setHeader('X-Request-ID', generateRequestId());

  next();
};

/**
 * 请求ID生成器
 */
function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 会话安全中间件
 */
export const sessionSecurity = (req: Request, res: Response, next: NextFunction): void => {
  // 检查会话是否超时
  const user = (req as any).user;
  if (user && user.lastActivity) {
    const now = Date.now();
    const sessionTimeout = 30 * 60 * 1000; // 30分钟
    const inactiveTime = now - new Date(user.lastActivity).getTime();

    if (inactiveTime > sessionTimeout) {
      logger.warn('会话超时', {
        userId: user.id,
        lastActivity: user.lastActivity,
        inactiveTime,
      });

      res.status(401).json({
        success: false,
        error: {
          code: 'SESSION_EXPIRED',
          message: '会话已过期，请重新登录',
        },
      });
      return;
    }

    // 更新最后活动时间
    (req as any).user.lastActivity = new Date();
  }

  next();
};

/**
 * 数据泄露防护中间件
 */
export const dataLeakagePrevention = (req: Request, res: Response, next: NextFunction): void => {
  // 拦截包含敏感信息的响应
  const originalJson = res.json;
  const originalSend = res.send;

  res.json = function(data: any) {
    if (data && typeof data === 'object') {
      data = removeSensitiveData(data);
    }
    return originalJson.call(this, data);
  };

  res.send = function(data: any) {
    if (data && typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        const cleaned = removeSensitiveData(parsed);
        data = JSON.stringify(cleaned);
      } catch (e) {
        // 不是JSON，不处理
      }
    }
    return originalSend.call(this, data);
  };

  next();
};

/**
 * 移除敏感数据
 */
function removeSensitiveData(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sensitiveFields = [
    'password',
    'passwordHash',
    'passwordSalt',
    'token',
    'secret',
    'apiKey',
    'privateKey',
    'creditCard',
    'ssn',
    'socialSecurityNumber',
  ];

  if (Array.isArray(obj)) {
    return obj.map(item => removeSensitiveData(item));
  }

  const cleaned = { ...obj };
  for (const field of sensitiveFields) {
    if (field in cleaned) {
      cleaned[field] = '***';
    }
  }

  // 递归处理嵌套对象
  for (const key in cleaned) {
    if (typeof cleaned[key] === 'object') {
      cleaned[key] = removeSensitiveData(cleaned[key]);
    }
  }

  return cleaned;
}

/**
 * 增强的CORS中间件
 */
export const enhancedCORS = (req: Request, res: Response, next: NextFunction): void => {
  const origin = req.get('Origin');
  const allowedOrigins = config.cors.origin === '*' ?
    ['*'] :
    Array.isArray(config.cors.origin) ?
      config.cors.origin :
      [config.cors.origin];

  if (allowedOrigins.includes('*') || (origin && allowedOrigins.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else if (origin) {
    logger.warn('不允许的CORS源', {
      origin,
      path: req.path,
      ip: req.ip,
    });
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'Content-Type, Authorization, X-Requested-With, API-Version, X-Request-ID'
  );
  res.setHeader('Access-Control-Max-Age', '86400'); // 24小时
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  next();
};

/**
 * 监控异常流量模式中间件
 */
const trafficMonitor = new Map<string, { count: number; resetTime: number; alerts: string[] }>();

export const trafficPatternMonitor = (req: Request, res: Response, next: NextFunction): void => {
  const key = req.ip;
  const now = Date.now();

  let record = trafficMonitor.get(key);
  if (!record || now > record.resetTime) {
    record = {
      count: 0,
      resetTime: now + 60 * 1000, // 1分钟窗口
      alerts: [],
    };
    trafficMonitor.set(key, record);
  }

  record.count++;

  // 检测异常流量
  if (record.count > 1000) { // 每分钟超过1000次请求
    const alert = `高频率请求检测: ${record.count} 次/分钟`;
    if (!record.alerts.includes(alert)) {
      record.alerts.push(alert);
      logger.error('检测到异常流量模式', {
        ip: req.ip,
        count: record.count,
        path: req.path,
      });
    }
  }

  res.on('finish', () => {
    // 如果响应成功，减少计数（可选）
    if (res.statusCode < 400) {
      record.count = Math.max(0, record.count - 1);
    }
  });

  next();
};

/**
 * 组合的安全增强中间件
 */
export const securityEnhancementStack = [
  suspiciousActivityDetector,
  trafficPatternMonitor,
  securityHeaders,
  sessionSecurity,
  dataLeakagePrevention,
  enhancedCORS,
];

/**
 * 生产环境安全增强
 */
export const productionSecurityEnhancements = [
  ...securityEnhancementStack,
  createSizeLimit(5 * 1024 * 1024), // 5MB限制
  validateHTTPMethods(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']),
];

/**
 * 开发环境安全增强（较宽松）
 */
export const developmentSecurityEnhancements = [
  securityHeaders,
  enhancedCORS,
  sessionSecurity,
];

/**
 * 环境感知的安全增强中间件
 */
export const environmentBasedSecurityEnhancements = () => {
  const env = config.env;

  switch (env) {
    case 'production':
      return productionSecurityEnhancements;
    case 'development':
      return developmentSecurityEnhancements;
    default:
      return securityEnhancementStack;
  }
};