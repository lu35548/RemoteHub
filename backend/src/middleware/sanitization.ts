import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@/utils/errors';
import { logger } from '@/utils/logger';

interface SanitizationOptions {
  // XSS防护
  preventXSS?: boolean;
  allowedHTMLTags?: string[];
  allowedHTMLAttributes?: string[];

  // SQL注入防护
  preventSQLInjection?: boolean;
  suspiciousPatterns?: RegExp[];

  // NoSQL注入防护
  preventNoSQLInjection?: boolean;
  noSQLPatterns?: RegExp[];

  // 路径遍历防护
  preventPathTraversal?: boolean;

  // 命令注入防护
  preventCommandInjection?: boolean;
  commandPatterns?: RegExp[];

  // 自定义清理函数
  customSanitizers?: Array<(value: any, key: string, req: Request) => any>;

  // 排除的字段
  excludeFields?: string[];

  // 是否清理嵌套对象
  deepSanitize?: boolean;
}

const defaultOptions: Required<SanitizationOptions> = {
  preventXSS: true,
  allowedHTMLTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li'],
  allowedHTMLAttributes: ['href', 'title', 'target'],
  preventSQLInjection: true,
  suspiciousPatterns: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
    /(--|;|\/\*|\*\/|'|")/,
    /(\b(OR|AND)\s+\d+\s*=\s*\d+)/i,
  ],
  preventNoSQLInjection: true,
  noSQLPatterns: [
    /\$where/i,
    /\$ne/i,
    /\$in/i,
    /\$nin/i,
    /\$gt/i,
    /\$gte/i,
    /\$lt/i,
    /\$lte/i,
    /\$regex/i,
    /\{.*\$.*\}/,
  ],
  preventPathTraversal: true,
  preventCommandInjection: true,
  commandPatterns: [
    /(&&|;|\||`|\$\(|\${|<|>)/,
    /(rm\s+-rf|del\s+\/|format\s+c:)/i,
  ],
  customSanitizers: [],
  excludeFields: ['password', '_encryptedPassword', 'token', 'secret'],
  deepSanitize: true,
};

/**
 * 清理HTML内容，防止XSS攻击（简化版本）
 * 移除所有HTML标签，只保留文本内容
 */
function sanitizeHTML(html: string, options: SanitizationOptions): string {
  if (typeof html !== 'string') {
    return html;
  }

  // 如果允许HTML标签，使用简单的清理
  if (options.allowedHTMLTags && options.allowedHTMLTags.length > 0) {
    // 只移除脚本标签和危险属性
    let sanitized = html
      // 移除 script 标签及其内容
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // 移除事件处理器（onclick, onload等）
      .replace(/\bon\w+\s*=/gi, '')
      // 移除 javascript: 协议
      .replace(/javascript:/gi, '')
      // 移除 data: URL
      .replace(/data:(?!image\/)/gi, 'data-blocked:');

    return sanitized;
  }

  // 完全移除所有HTML标签
  return html.replace(/<[^>]*>/g, '');
}

/**
 * 检测SQL注入模式
 */
function detectSQLInjection(value: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(value));
}

/**
 * 检测NoSQL注入模式
 */
function detectNoSQLInjection(value: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(value));
}

/**
 * 检测路径遍历
 */
function detectPathTraversal(value: string): boolean {
  const patterns = [
    /\.\./g,  // 目录遍历
    /[\\/]/g, // 路径分隔符
    /^[a-zA-Z]:/g, // Windows驱动器路径
  ];

  return patterns.some(pattern => pattern.test(value));
}

/**
 * 检测命令注入
 */
function detectCommandInjection(value: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(value));
}

/**
 * 递归清理对象
 */
function sanitizeObject(
  obj: any,
  options: SanitizationOptions,
  path: string = ''
): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  // 处理数组
  if (Array.isArray(obj)) {
    return obj.map((item, index) =>
      sanitizeObject(item, options, `${path}[${index}]`)
    );
  }

  // 处理对象
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;

    // 检查是否应该排除此字段
    if (options.excludeFields.includes(key)) {
      sanitized[key] = value;
      continue;
    }

    // 应用自定义清理器
    let sanitizedValue = value;
    for (const sanitizer of options.customSanitizers) {
      sanitizedValue = sanitizer(sanitizedValue, key, { body: obj } as Request);
    }

    // 如果值是字符串，应用各种清理
    if (typeof sanitizedValue === 'string') {
      // XSS防护
      if (options.preventXSS) {
        sanitizedValue = sanitizeHTML(sanitizedValue, options);
      }

      // SQL注入检测
      if (options.preventSQLInjection && detectSQLInjection(String(sanitizedValue), options.suspiciousPatterns)) {
        logger.warn('Potential SQL injection detected', {
          path: currentPath,
          value: String(sanitizedValue).substring(0, 100),
          ip: 'request', // 在实际中间件中会从req获取
        });
        throw new ValidationError(`检测到潜在的SQL注入攻击: ${currentPath}`);
      }

      // NoSQL注入检测
      if (options.preventNoSQLInjection && detectNoSQLInjection(String(sanitizedValue), options.noSQLPatterns)) {
        logger.warn('Potential NoSQL injection detected', {
          path: currentPath,
          value: String(sanitizedValue).substring(0, 100),
          ip: 'request',
        });
        throw new ValidationError(`检测到潜在的NoSQL注入攻击: ${currentPath}`);
      }

      // 路径遍历检测
      if (options.preventPathTraversal && detectPathTraversal(String(sanitizedValue))) {
        logger.warn('Potential path traversal detected', {
          path: currentPath,
          value: String(sanitizedValue),
          ip: 'request',
        });
        throw new ValidationError(`检测到潜在的路径遍历攻击: ${currentPath}`);
      }

      // 命令注入检测
      if (options.preventCommandInjection && detectCommandInjection(String(sanitizedValue), options.commandPatterns)) {
        logger.warn('Potential command injection detected', {
          path: currentPath,
          value: String(sanitizedValue).substring(0, 100),
          ip: 'request',
        });
        throw new ValidationError(`检测到潜在的命令注入攻击: ${currentPath}`);
      }

      // 基本字符串清理
      sanitizedValue = String(sanitizedValue).trim();
    }

    // 深度清理嵌套对象
    if (options.deepSanitize && typeof sanitizedValue === 'object' && sanitizedValue !== null) {
      sanitizedValue = sanitizeObject(sanitizedValue, options, currentPath);
    }

    sanitized[key] = sanitizedValue;
  }

  return sanitized;
}

/**
 * 创建数据清理中间件
 */
export const createSanitizationMiddleware = (options: SanitizationOptions = {}) => {
  const opts = { ...defaultOptions, ...options };

  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      // 清理请求体
      if (req.body && typeof req.body === 'object') {
        req.body = sanitizeObject(req.body, opts, 'body');
      }

      // 清理查询参数
      if (req.query && typeof req.query === 'object') {
        req.query = sanitizeObject(req.query, opts, 'query');
      }

      // 清理路径参数
      if (req.params && typeof req.params === 'object') {
        req.params = sanitizeObject(req.params, opts, 'params');
      }

      next();
    } catch (error) {
      if (error instanceof ValidationError) {
        res.status(400).json({
          success: false,
          error: {
            code: 'SANITIZATION_ERROR',
            message: error.message,
          },
        });
        return;
      }

      logger.error('Sanitization error', {
        error: error instanceof Error ? error.message : '未知错误',
        path: req.path,
        method: req.method,
      });

      next(error);
    }
  };
};

// 预定义的清理中间件

// 通用清理中间件
export const sanitizeInput = createSanitizationMiddleware();

// 仅XSS防护的中间件
export const xssProtection = createSanitizationMiddleware({
  preventXSS: true,
  preventSQLInjection: false,
  preventNoSQLInjection: false,
  preventPathTraversal: false,
  preventCommandInjection: false,
  allowedHTMLTags: [],
  allowedHTMLAttributes: [],
});

// 仅数据库注入防护的中间件
export const injectionProtection = createSanitizationMiddleware({
  preventXSS: false,
  preventSQLInjection: true,
  preventNoSQLInjection: true,
  preventPathTraversal: false,
  preventCommandInjection: false,
});

// 文件上传路径清理
export const sanitizeFilePath = createSanitizationMiddleware({
  preventXSS: false,
  preventSQLInjection: false,
  preventNoSQLInjection: false,
  preventPathTraversal: true,
  preventCommandInjection: false,
  excludeFields: ['*'], // 只清理特定字段
  customSanitizers: [
    (value, key) => {
      if (key.toLowerCase().includes('path') || key.toLowerCase().includes('file')) {
        if (typeof value === 'string') {
          // 移除危险字符
          return value.replace(/[<>:"|?*]/g, '').replace(/\.\./g, '');
        }
      }
      return value;
    },
  ],
});

// 搜索查询清理（允许更多HTML标签）
export const sanitizeSearchQuery = createSanitizationMiddleware({
  preventXSS: true,
  preventSQLInjection: true,
  preventNoSQLInjection: true,
  allowedHTMLTags: ['b', 'i', 'em', 'strong', 'mark'],
  allowedHTMLAttributes: [],
  customSanitizers: [
    (value, key) => {
      if (key.toLowerCase().includes('search') && typeof value === 'string') {
        // 允许搜索查询中的特殊字符，但限制长度
        return value.substring(0, 500);
      }
      return value;
    },
  ],
});

// 用户生成内容清理（允许更多HTML标签）
export const sanitizeUserContent = createSanitizationMiddleware({
  preventXSS: true,
  preventSQLInjection: false,
  preventNoSQLInjection: false,
  allowedHTMLTags: [
    'p', 'br', 'b', 'i', 'em', 'strong', 'u', 'ol', 'ul', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre',
    'a', 'img', 'div', 'span'
  ],
  allowedHTMLAttributes: ['href', 'title', 'target', 'alt', 'src', 'class'],
});

export default sanitizeInput;