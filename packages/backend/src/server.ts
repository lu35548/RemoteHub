import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { AppError, createAppError } from './utils/appError.js';
import { startSessionCleaner } from './utils/sessionCleaner.js';
import type { Request, Response, NextFunction } from 'express';

const app: Express = express();

// ─── Global middleware stack (in order) ───

// 1. JSON body parser
app.use(express.json({ limit: '1mb' }));

// 2. Cookie parser
app.use(cookieParser());

// 3. Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
}));

// 4. Rate limiters
const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_LOGIN_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } },
  skip: (req) => req.path === '/api/v1/health',
});

const registerLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_REGISTER_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } },
});

const refreshLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_REFRESH_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } },
});

const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: env.RATE_LIMIT_GENERAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: '请求过于频繁，请稍后重试' } },
  skip: (req) => req.path === '/api/v1/health',
});

// 5. CORS
if (env.CORS_ORIGIN) {
  app.use(cors({
    origin: env.CORS_ORIGIN.split(','),
    credentials: true,
  }));
}

// 6. Trust proxy
app.set('trust proxy', true);

// ─── Rate limiters applied to routes ───
app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth/register', registerLimiter);
app.use('/api/v1/auth/refresh', refreshLimiter);
app.use('/api/v1/', generalLimiter);

// ─── Route registration ───
import { healthRoutes } from './routes/healthRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { userRoutes } from './routes/userRoutes.js';
import { projectRoutes } from './routes/projectRoutes.js';
import { memberRoutes } from './routes/memberRoutes.js';
import { connectionRoutes } from './routes/connectionRoutes.js';

app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/projects/:id/members', memberRoutes);
app.use('/api/v1/connections', connectionRoutes);

// ─── 404 ───
app.use((_req: Request, _res: Response, next: NextFunction) => {
  next(createAppError('SYS_001'));
});

// ─── Global error handler ───
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) {
    const response: {
      success: false;
      error: { code: string; message: string; details?: Array<{ field: string; message: string }> };
    } = {
      success: false,
      error: { code: err.code, message: err.message },
    };
    if (err.details) response.error.details = err.details;
    res.status(err.statusCode).json(response);
    return;
  }

  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: { code: 'SYS_001', message: '内部服务器错误' },
  });
});

// ─── Start server ───
const PORT = env.PORT;
startSessionCleaner();
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} (${env.NODE_ENV})`);
});

export { app };
