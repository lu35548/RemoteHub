import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';
import { randomBytes } from 'crypto';

interface CSRFOptions {
  cookieName?: string;
  headerName?: string;
  cookieOptions?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    domain?: string;
    path?: string;
  };
  ignoreMethods?: string[];
  getValueFromCookie?: boolean;
}

const defaultOptions: Required<CSRFOptions> = {
  cookieName: 'x-csrf-token',
  headerName: 'x-csrf-token',
  cookieOptions: {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
  getValueFromCookie: true,
};

/**
 * 生成CSRF令牌
 */
function generateCSRFToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * 验证CSRF令牌格式
 */
function isValidCSRFToken(token: string): boolean {
  return /^[a-f0-9]{64}$/i.test(token);
}

/**
 * 创建CSRF保护中间件
 */
export const createCSRFProtection = (options: CSRFOptions = {}) => {
  const opts = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction): void => {
    // 跳过指定的HTTP方法
    if (opts.ignoreMethods.includes(req.method)) {
      return next();
    }

    // 从请求中获取CSRF令牌
    let token: string | undefined;

    if (opts.getValueFromCookie) {
      // 从Cookie获取令牌（双重提交Cookie方法）
      token = req.cookies[opts.cookieName];
    } else {
      // 从Header获取令牌
      token = req.get(opts.headerName);
    }

    // 如果没有令牌，生成新的
    if (!token) {
      token = generateCSRFToken();

      // 设置Cookie
      res.cookie(opts.cookieName, token, opts.cookieOptions);

      // 在响应头中也返回令牌（方便前端使用）
      res.set(opts.headerName, token);

      logger.debug('CSRF token generated', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
      });

      return next();
    }

    // 验证令牌格式
    if (!isValidCSRFToken(token)) {
      logger.warn('Invalid CSRF token format', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        path: req.path,
        method: req.method,
        token,
      });

      throw new ValidationError('无效的CSRF令牌格式');
    }

    // 对于需要CSRF保护的方法，验证令牌
    if (!opts.ignoreMethods.includes(req.method)) {
      // 获取请求中的令牌进行对比
      const requestToken = req.get(opts.headerName);
      const bodyToken = req.body && req.body[opts.cookieName];

      let comparisonToken: string | undefined;

      if (opts.getValueFromCookie) {
        // 双重提交Cookie：从Header或Body获取令牌进行对比
        comparisonToken = requestToken || bodyToken;
      } else {
        // 从Header获取：从Cookie获取令牌进行对比
        comparisonToken = req.cookies[opts.cookieName] || bodyToken;
      }

      if (!comparisonToken) {
        logger.warn('Missing CSRF token in request', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method,
          hasHeader: !!requestToken,
          hasBody: !!bodyToken,
          hasCookie: !!req.cookies[opts.cookieName],
        });

        throw new ValidationError('请求中缺少CSRF令牌');
      }

      // 验证令牌匹配
      if (token !== comparisonToken) {
        logger.warn('CSRF token mismatch', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          path: req.path,
          method: req.method,
          expectedToken: token.substring(0, 8) + '...',
          receivedToken: comparisonToken.substring(0, 8) + '...',
        });

        throw new ValidationError('CSRF令牌不匹配');
      }
    }

    // 重新设置令牌（可选，增加安全性）
    if (Math.random() < 0.1) { // 10%的概率重新生成令牌
      const newToken = generateCSRFToken();
      res.cookie(opts.cookieName, newToken, opts.cookieOptions);
      res.set(opts.headerName, newToken);
    }

    next();
  };
};

// 默认CSRF保护中间件
export const csrfProtection = createCSRFProtection();

/**
 * 为API端点提供的轻量级CSRF保护
 * 只检查Header，不使用Cookie
 */
export const apiCSRFProtection = createCSRFProtection({
  cookieName: 'api-csrf-token',
  headerName: 'x-api-csrf-token',
  getValueFromCookie: false,
  cookieOptions: {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'none',
    path: '/api',
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
});

/**
 * 为表单提交提供的CSRF保护
 */
export const formCSRFProtection = createCSRFProtection({
  cookieName: '_csrf',
  headerName: 'x-csrf-token',
  getValueFromCookie: true,
  cookieOptions: {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  },
  ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
});

/**
 * 获取CSRF令牌的端点处理器
 */
export const getCSRFToken = (req: Request, res: Response): void => {
  const token = generateCSRFToken();

  res.cookie(defaultOptions.cookieName, token, defaultOptions.cookieOptions);
  res.set(defaultOptions.headerName, token);

  res.json({
    success: true,
    data: {
      token,
      headerName: defaultOptions.headerName,
    },
  });
};

/**
 * 验证CSRF令牌的中间件（用于特定路由）
 */
export const validateCSRFToken = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.get(defaultOptions.headerName);
  const cookieToken = req.cookies[defaultOptions.cookieName];
  const bodyToken = req.body && req.body[defaultOptions.cookieName];

  if (!token && !cookieToken && !bodyToken) {
    throw new ValidationError('请求中缺少CSRF令牌');
  }

  const comparisonToken = token || cookieToken || bodyToken;

  if (!isValidCSRFToken(comparisonToken!)) {
    throw new ValidationError('无效的CSRF令牌格式');
  }

  // 如果提供了多个令牌，验证它们是否匹配
  const tokens = [token, cookieToken, bodyToken].filter(Boolean);
  if (tokens.length > 1 && new Set(tokens).size > 1) {
    throw new ValidationError('CSRF令牌不匹配');
  }

  next();
};

/**
 * 用于WebSocket连接的CSRF保护
 */
export const websocketCSRFProtection = (req: Request, res: Response, next: NextFunction): void => {
  const token = req.query.csrf as string || req.get('x-csrf-token');

  if (!token) {
    throw new ValidationError('WebSocket连接需要CSRF令牌');
  }

  if (!isValidCSRFToken(token)) {
    throw new ValidationError('无效的CSRF令牌格式');
  }

  // 将令牌附加到请求对象，供WebSocket服务器使用
  (req as any).csrfToken = token;

  next();
};

export default csrfProtection;