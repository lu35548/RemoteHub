import { Request, Response, NextFunction } from 'express';
import helmet, { HelmetOptions } from 'helmet';
import { logger } from '@/utils/logger';

/**
 * 动态生成 CSP nonce
 */
function generateCSPNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 动态 CSP 中间件（支持 nonce）
 */
export const dynamicCSPMiddleware = (options: Partial<HelmetOptions> = {}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 生成 nonce
    const nonce = generateCSPNonce();

    // 将 nonce附加到请求对象，供视图模板使用
    (req as any).cspNonce = nonce;

    // 配置 helmet
    const helmetOptions: HelmetOptions = {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", `'nonce-${nonce}'`],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          childSrc: ["'none'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
        },
        reportOnly: process.env.NODE_ENV === 'development',
      },
      ...options,
    };

    helmet(helmetOptions)(req, res, next);
  };
};

/**
 * API 专用的安全中间件（限制性 CSP）
 */
export const apiSecurityMiddleware = helmet({
  contentSecurityPolicy: false, // API 不需要 CSP
  hsts: false, // API 通常不需要预加载
  noSniff: true,
  referrerPolicy: { policy: "no-referrer" },
  permittedCrossDomainPolicies: false,
  hidePoweredBy: true,
  ieNoOpen: true,
});

/**
 * 默认的安全中间件
 */
export const defaultSecurityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      childSrc: ["'none'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: false,
  },
});

/**
 * 生产环境安全中间件（最严格的安全策略）
 */
export const productionSecurityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      childSrc: ["'none'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  permittedCrossDomainPolicies: false,
  hidePoweredBy: true,
  ieNoOpen: true,
});

/**
 * 开发环境安全中间件（较为宽松）
 */
export const developmentSecurityMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      childSrc: ["'none'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
    },
    reportOnly: true,
  },
  hsts: false,
  noSniff: true,
  referrerPolicy: false,
  permittedCrossDomainPolicies: false,
  hidePoweredBy: false,
  ieNoOpen: true,
});

/**
 * 根据环境自动选择安全中间件
 */
export const environmentBasedSecurityMiddleware = (): ((req: Request, res: Response, next: NextFunction) => void) => {
  const env = process.env.NODE_ENV || 'development';

  switch (env) {
    case 'production':
      return productionSecurityMiddleware;
    case 'development':
      return developmentSecurityMiddleware;
    default:
      return defaultSecurityMiddleware;
  }
};

// 默认导出
export default defaultSecurityMiddleware;