import { logger } from './logger';

/**
 * 基础应用错误类
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly code?: string;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.code = code;

    Error.captureStackTrace(this, this.constructor);

    // 记录错误日志
    logger.error(message, {
      statusCode,
      isOperational,
      code,
      stack: this.stack,
    });
  }
}

/**
 * 400 Bad Request 错误
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Bad Request', code?: string) {
    super(message, 400, true, code);
  }
}

/**
 * 401 Unauthorized 错误
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized', code?: string) {
    super(message, 401, true, code);
  }
}

/**
 * 403 Forbidden 错误
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden', code?: string) {
    super(message, 403, true, code);
  }
}

/**
 * 404 Not Found 错误
 */
export class NotFoundError extends AppError {
  constructor(message: string = 'Not Found', code?: string) {
    super(message, 404, true, code);
  }
}

/**
 * 409 Conflict 错误
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Conflict', code?: string) {
    super(message, 409, true, code);
  }
}

/**
 * 422 Unprocessable Entity 错误
 */
export class UnprocessableEntityError extends AppError {
  constructor(message: string = 'Unprocessable Entity', code?: string) {
    super(message, 422, true, code);
  }
}

/**
 * 429 Too Many Requests 错误
 */
export class TooManyRequestsError extends AppError {
  constructor(message: string = 'Too Many Requests', code?: string) {
    super(message, 429, true, code);
  }
}

/**
 * 500 Internal Server Error
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Internal Server Error', code?: string) {
    super(message, 500, true, code);
  }
}

/**
 * 503 Service Unavailable 错误
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = 'Service Unavailable', code?: string) {
    super(message, 503, true, code);
  }
}

/**
 * 认证相关错误
 */
export class AuthenticationError extends UnauthorizedError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_FAILED');
  }
}

export class InvalidTokenError extends UnauthorizedError {
  constructor(message: string = 'Invalid token') {
    super(message, 'INVALID_TOKEN');
  }
}

export class ExpiredTokenError extends UnauthorizedError {
  constructor(message: string = 'Token expired') {
    super(message, 'TOKEN_EXPIRED');
  }
}

export class InvalidCredentialsError extends UnauthorizedError {
  constructor(message: string = 'Invalid credentials') {
    super(message, 'INVALID_CREDENTIALS');
  }
}

export class AccountLockedError extends UnauthorizedError {
  constructor(message: string = 'Account is locked') {
    super(message, 'ACCOUNT_LOCKED');
  }
}

export class EmailNotVerifiedError extends UnauthorizedError {
  constructor(message: string = 'Email not verified') {
    super(message, 'EMAIL_NOT_VERIFIED');
  }
}

/**
 * 授权相关错误
 */
export class InsufficientPermissionsError extends ForbiddenError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'INSUFFICIENT_PERMISSIONS');
  }
}

export class ResourceAccessDeniedError extends ForbiddenError {
  constructor(message: string = 'Access to resource denied') {
    super(message, 'RESOURCE_ACCESS_DENIED');
  }
}

/**
 * 用户相关错误
 */
export class UserNotFoundError extends NotFoundError {
  constructor(message: string = 'User not found') {
    super(message, 'USER_NOT_FOUND');
  }
}

export class UserAlreadyExistsError extends ConflictError {
  constructor(message: string = 'User already exists') {
    super(message, 'USER_ALREADY_EXISTS');
  }
}

export class EmailAlreadyExistsError extends ConflictError {
  constructor(message: string = 'Email already exists') {
    super(message, 'EMAIL_ALREADY_EXISTS');
  }
}

export class UsernameAlreadyExistsError extends ConflictError {
  constructor(message: string = 'Username already exists') {
    super(message, 'USERNAME_ALREADY_EXISTS');
  }
}

export class InvalidPasswordError extends BadRequestError {
  constructor(message: string = 'Invalid password') {
    super(message, 'INVALID_PASSWORD');
  }
}

export class WeakPasswordError extends BadRequestError {
  constructor(message: string = 'Password is too weak') {
    super(message, 'WEAK_PASSWORD');
  }
}

export class PasswordMismatchError extends BadRequestError {
  constructor(message: string = 'Passwords do not match') {
    super(message, 'PASSWORD_MISMATCH');
  }
}

/**
 * 会话相关错误
 */
export class SessionNotFoundError extends NotFoundError {
  constructor(message: string = 'Session not found') {
    super(message, 'SESSION_NOT_FOUND');
  }
}

export class SessionExpiredError extends UnauthorizedError {
  constructor(message: string = 'Session has expired') {
    super(message, 'SESSION_EXPIRED');
  }
}

export class InvalidSessionError extends UnauthorizedError {
  constructor(message: string = 'Invalid session') {
    super(message, 'INVALID_SESSION');
  }
}

/**
 * 密码重置相关错误
 */
export class PasswordResetTokenNotFoundError extends NotFoundError {
  constructor(message: string = 'Password reset token not found') {
    super(message, 'PASSWORD_RESET_TOKEN_NOT_FOUND');
  }
}

export class PasswordResetTokenExpiredError extends BadRequestError {
  constructor(message: string = 'Password reset token has expired') {
    super(message, 'PASSWORD_RESET_TOKEN_EXPIRED');
  }
}

export class InvalidPasswordResetTokenError extends BadRequestError {
  constructor(message: string = 'Invalid password reset token') {
    super(message, 'INVALID_PASSWORD_RESET_TOKEN');
  }
}

/**
 * 数据库相关错误
 */
export class DatabaseError extends InternalServerError {
  constructor(message: string = 'Database operation failed') {
    super(message, 'DATABASE_ERROR');
  }
}

export class DatabaseConnectionError extends ServiceUnavailableError {
  constructor(message: string = 'Database connection failed') {
    super(message, 'DATABASE_CONNECTION_ERROR');
  }
}

/**
 * 验证相关错误
 */
export class ValidationError extends BadRequestError {
  constructor(message: string = 'Validation failed') {
    super(message, 'VALIDATION_FAILED');
  }
}

export class RequiredFieldMissingError extends ValidationError {
  constructor(field: string) {
    super(`Required field missing: ${field}`);
    Object.defineProperty(this, 'code', {
      value: 'REQUIRED_FIELD_MISSING',
      writable: false,
      enumerable: true,
      configurable: true
    });
  }
}

export class InvalidEmailError extends ValidationError {
  constructor(message: string = 'Invalid email format') {
    super(message);
    Object.defineProperty(this, 'code', {
      value: 'INVALID_EMAIL',
      writable: false,
      enumerable: true,
      configurable: true
    });
  }
}

export class InvalidUsernameError extends ValidationError {
  constructor(message: string = 'Invalid username format') {
    super(message);
    Object.defineProperty(this, 'code', {
      value: 'INVALID_USERNAME',
      writable: false,
      enumerable: true,
      configurable: true
    });
  }
}

/**
 * 外部服务错误
 */
export class ExternalServiceError extends ServiceUnavailableError {
  constructor(service: string, message: string = 'External service error') {
    super(`${service}: ${message}`);
    Object.defineProperty(this, 'code', {
      value: 'EXTERNAL_SERVICE_ERROR',
      writable: false,
      enumerable: true,
      configurable: true
    });
  }
}

export class EmailServiceError extends ExternalServiceError {
  constructor(message: string = 'Email service error') {
    super('Email Service', message);
    Object.defineProperty(this, 'code', {
      value: 'EMAIL_SERVICE_ERROR',
      writable: false,
      enumerable: true,
      configurable: true
    });
  }
}

/**
 * 工具函数：将错误转换为标准化响应格式
 */
export const formatErrorResponse = (error: AppError) => {
  return {
    success: false,
    error: {
      message: error.message,
      code: error.code,
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
    },
    timestamp: new Date().toISOString(),
  };
};

/**
 * 工具函数：检查是否为应用错误
 */
export const isAppError = (error: any): error is AppError => {
  return error instanceof AppError;
};

/**
 * 工具函数：创建应用错误
 */
export const createAppError = (
  message: string,
  statusCode: number = 500,
  code?: string
): AppError => {
  return new AppError(message, statusCode, true, code);
};