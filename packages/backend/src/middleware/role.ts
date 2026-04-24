import type { Request, Response, NextFunction } from 'express';
import { createAppError } from '../utils/appError.js';
import type { UserRole } from '@remotehub/shared';

export function roleMiddleware(requiredRole: UserRole) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(createAppError('AUTH_002'));
      return;
    }
    if (req.user.role !== requiredRole && req.user.role !== 'admin') {
      next(createAppError('AUTH_003'));
      return;
    }
    next();
  };
}
