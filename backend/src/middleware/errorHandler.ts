import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import {
  AppError,
  ValidationError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  DatabaseError,
} from '@/utils/errors';
import { MonitoringController } from '@/controllers/monitoringController';

// Error response interface
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    path?: string;
    method?: string;
    requestId?: string;
  };
}

// Error handling middleware
export const errorHandler = (
  error: Error | AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'Internal server error';
  let details: any = undefined;

  // Handle custom application errors
  if (error instanceof AppError) {
    statusCode = error.statusCode;
    errorCode = error.code || 'APP_ERROR';
    message = error.message;
    details = (error as any).details;
  }
  // Handle TypeORM errors
  else if (error.name === 'QueryFailedError') {
    statusCode = 500;
    errorCode = 'DATABASE_QUERY_ERROR';
    message = 'Database query failed';
    details = {
      query: (error as any).query,
      parameters: (error as any).parameters,
    };
  }
  // Handle validation errors (like from express-validator)
  else if (error.name === 'ValidationError') {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = (error as any).details || (error as any).errors;
  }
  // Handle JWT errors
  else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  }
  else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
    details = {
      expiredAt: (error as any).expiredAt,
    };
  }
  // Handle other common errors
  else if (error.name === 'CastError') {
    statusCode = 400;
    errorCode = 'INVALID_ID';
    message = 'Invalid ID format';
  }
  else if (error.message.includes('ENOENT')) {
    statusCode = 404;
    errorCode = 'FILE_NOT_FOUND';
    message = 'File not found';
  }
  else if (error.message.includes('EACCES')) {
    statusCode = 403;
    errorCode = 'PERMISSION_DENIED';
    message = 'Permission denied';
  }

  // Log the error
  const logLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
  
  const logMessage = `HTTP ${statusCode} - ${errorCode}: ${message}`;
  const logData = {
      path: req.path,
      method: req.method,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      body: req.body,
      params: req.params,
      query: req.query,
      stack: error.stack,
      details,
      isOperational: error instanceof AppError ? error.isOperational : false,
    };

  if (logLevel === 'error') {
    logger.error(logMessage, logData);
  } else if (logLevel === 'warn') {
    logger.warn(logMessage, logData);
  } else {
    logger.info(logMessage, logData);
  }

  // Prepare error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
      details: process.env.NODE_ENV === 'development' ? details : undefined,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      requestId: req.headers['x-request-id'] as string,
    },
  };

  // 记录错误监控指标
  try {
    MonitoringController.recordErrorMetrics(error, req);
  } catch (monitoringError) {
    logger.error('记录错误监控指标失败:', monitoringError);
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

// Async error wrapper
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.method} ${req.path}`);
  next(error);
};

// Re-export everything from utils/errors for convenience
export * from '@/utils/errors';

export default errorHandler;