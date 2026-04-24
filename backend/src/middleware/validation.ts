import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@/utils/errors';

// Import express-validator
const expressValidator = require('express-validator');
const { body, param, query, validationResult } = expressValidator;
type ValidationChain = any; // 简化类型定义

/**
 * 验证中间件工厂函数
 * @param validators 验证器数组
 * @returns 验证中间件函数
 */
export const validateRequest = (validators: ValidationChain[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // 运行所有验证器
    await Promise.all(validators.map(validator => validator.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // 格式化验证错误
      const formattedErrors = errors.array().map((error: any) => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value,
        location: error.location,
      }));

      // 根据错误类型进行分类
      const errorGroups: { [key: string]: typeof formattedErrors } = {};
      formattedErrors.forEach(error => {
        const key = error.field;
        if (!errorGroups[key]) {
          errorGroups[key] = [];
        }
        errorGroups[key].push(error);
      });

      // 创建详细的错误消息
      const errorMessages = Object.keys(errorGroups).map(field => {
        const fieldErrors = errorGroups[field];
        if (fieldErrors.length === 1) {
          return `${field}: ${fieldErrors[0].message}`;
        } else {
          return `${field}: ${fieldErrors.map(e => e.message).join(', ')}`;
        }
      });

      const message = `验证失败: ${errorMessages.join('; ')}`;

      throw new ValidationError(message);
    }

    next();
  };
};

/**
 * 处理分页参数的验证器
 */
export const validatePagination = [
  // 验证页码
  (req: Request, res: Response, next: NextFunction): void => {
    const page = parseInt(req.query.page as string) || 1;
    if (page < 1) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '页码必须大于0',
        },
      });
      return;
    }
    (req as any).pagination = { ...(req as any).pagination, page };
    next();
  },

  // 验证每页数量
  (req: Request, res: Response, next: NextFunction): void => {
    const limit = parseInt(req.query.limit as string) || 10;
    if (limit < 1 || limit > 100) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '每页数量必须在1-100之间',
        },
      });
      return;
    }
    (req as any).pagination = { ...(req as any).pagination, limit };
    next();
  },
];

/**
 * 处理排序参数的验证器
 */
export const validateSorting = (allowedFields: string[]) => [
  // 验证排序字段
  (req: Request, res: Response, next: NextFunction): void => {
    const { sortBy, sortOrder } = req.query;

    if (sortBy && !allowedFields.includes(sortBy as string)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `排序字段无效，允许的字段: ${allowedFields.join(', ')}`,
        },
      });
      return;
    }

    if (sortOrder && !['ASC', 'DESC', 'asc', 'desc'].includes(sortOrder as string)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '排序方向必须是 ASC 或 DESC',
        },
      });
      return;
    }

    (req as any).sorting = {
      sortBy: sortBy || 'createdAt',
      sortOrder: (sortOrder as string)?.toUpperCase() || 'DESC',
    };
    next();
  },
];

/**
 * 处理搜索参数的验证器
 */
export const validateSearch = [
  (req: Request, res: Response, next: NextFunction): void => {
    const { search } = req.query;

    if (search && typeof search === 'string' && search.length > 100) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '搜索关键词不能超过100个字符',
        },
      });
      return;
    }

    next();
  },
];

/**
 * 验证日期范围
 */
export const validateDateRange = (startParam: string, endParam: string) => [
  (req: Request, res: Response, next: NextFunction): void => {
    const start = req.query[startParam] as string;
    const end = req.query[endParam] as string;

    if (start && isNaN(Date.parse(start))) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `${startParam} 必须是有效的日期`,
        },
      });
      return;
    }

    if (end && isNaN(Date.parse(end))) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `${endParam} 必须是有效的日期`,
        },
      });
      return;
    }

    if (start && end) {
      const startDate = new Date(start);
      const endDate = new Date(end);

      if (startDate >= endDate) {
        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: `${startParam} 必须早于 ${endParam}`,
          },
        });
        return;
      }
    }

    next();
  },
];

/**
 * 验证UUID参数
 */
export const validateUUID = (paramName: string) => [
  param(paramName).isUUID().withMessage(`${paramName} 必须是有效的UUID`),
];

/**
 * 验证邮箱
 */
export const validateEmail = [
  body('email').isEmail().withMessage('邮箱格式无效'),
];

/**
 * 验证密码
 */
export const validatePassword = [
  body('password').isLength({ min: 8 }).withMessage('密码至少8个字符'),
  body('password').matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('密码必须包含大小写字母和数字'),
];

/**
 * 验证用户名
 */
export const validateUsername = [
  body('username').isLength({ min: 3, max: 50 }).withMessage('用户名长度必须在3-50之间'),
  body('username').matches(/^[a-zA-Z0-9_-]+$/).withMessage('用户名只能包含字母、数字、下划线和连字符'),
];

/**
 * 验证项目名称
 */
export const validateProjectName = [
  body('name').isLength({ min: 1, max: 255 }).withMessage('项目名称长度必须在1-255之间'),
];

/**
 * 验证连接名称
 */
export const validateConnectionName = [
  body('name').isLength({ min: 1, max: 255 }).withMessage('连接名称长度必须在1-255之间'),
];

/**
 * 验证文件上传
 */
export const validateFileUpload = (allowedTypes: string[], maxSize: number) => [
  (req: Request, res: Response, next: NextFunction): void => {
    const file = (req as any).file;

    if (!file) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '没有上传文件',
        },
      });
      return;
    }

    // 验证文件类型
    if (!allowedTypes.includes(file.mimetype)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `文件类型不允许，允许的类型: ${allowedTypes.join(', ')}`,
        },
      });
      return;
    }

    // 验证文件大小
    if (file.size > maxSize) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `文件大小超过限制，最大允许: ${maxSize / 1024 / 1024}MB`,
        },
      });
      return;
    }

    next();
  },
];

/**
 * 验证角色参数
 */
export const validateRole = (allowedRoles: string[]) => [
  body('role').isIn(allowedRoles).withMessage(`角色必须是以下值之一: ${allowedRoles.join(', ')}`),
];

/**
 * 验证状态参数
 */
export const validateStatus = (allowedStatuses: string[]) => [
  body('status').isIn(allowedStatuses).withMessage(`状态必须是以下值之一: ${allowedStatuses.join(', ')}`),
];

/**
 * 清理和验证请求体
 * @param requiredFields 必需字段
 * @param optionalFields 可选字段
 * @param maxBodySize 最大请求体大小（字节）
 */
export const validateRequestBody = (
  requiredFields: string[] = [],
  optionalFields: string[] = [],
  maxBodySize: number = 10 * 1024 * 1024 // 10MB
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // 检查请求体大小
    const contentLength = parseInt(req.get('content-length') || '0');
    if (contentLength > maxBodySize) {
      res.status(413).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '请求体过大',
        },
      });
      return;
    }

    // 验证必需字段
    const missingFields = requiredFields.filter(field => !(req.body && req.body[field] !== undefined));
    if (missingFields.length > 0) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: `缺少必需字段: ${missingFields.join(', ')}`,
        },
      });
      return;
    }

    // 过滤掉不允许的字段
    const allowedFields = [...requiredFields, ...optionalFields];
    const filteredBody: any = {};

    if (req.body) {
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          filteredBody[field] = req.body[field];
        }
      }
    }

    // 使用过滤后的请求体
    req.body = filteredBody;
    next();
  };
};

// 验证器组合
export const commonValidators = {
  pagination: validatePagination,
  sorting: (fields: string[]) => validateSorting(fields),
  search: validateSearch,
  dateRange: (start: string, end: string) => validateDateRange(start, end),
  uuid: (param: string) => validateUUID(param),
  email: validateEmail,
  password: validatePassword,
  username: validateUsername,
  projectName: validateProjectName,
  connectionName: validateConnectionName,
  fileUpload: (types: string[], size: number) => validateFileUpload(types, size),
  role: (roles: string[]) => validateRole(roles),
  status: (statuses: string[]) => validateStatus(statuses),
  requestBody: (required?: string[], optional?: string[], maxBodySize?: number) =>
    validateRequestBody(required, optional, maxBodySize),
};

// Re-export express-validator functions for convenience
export { body, param, query, validationResult };
export type { ValidationChain };

export default validateRequest;