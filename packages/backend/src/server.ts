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
  // heartbeat/online 白名单（T8 核实 spec Further Notes）：限流按 IP 计，内网 NAT 多用户共享出口 IP
  // 约 8 人即耗尽 200/min 配额，429 被前端静默跳过 → 心跳断写 → 5 分钟窗口后全员被误判离线。
  // 两端点均有 authMiddleware 保护且客户端 5s 固定节奏轮询，无限流滥用敞口。
  // 注意 req.path 相对于挂载点 app.use('/api/v1/')（前缀已剥），全路径匹配恒 false——
  // 原代码 '/api/v1/health' 写法从未生效（预存在 bug 一并修正）
  skip: (req) => ['/health', '/auth/heartbeat', '/auth/online'].includes(req.path),
});

// 5. CORS
if (env.CORS_ORIGIN) {
  app.use(cors({
    origin: env.CORS_ORIGIN.split(','),
    credentials: true,
  }));
}

// 6. Trust proxy
app.set('trust proxy', 1); // 单跳反代（Caddy），防 X-Forwarded-For 伪造绕过速率限制

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
  next(createAppError('SYS_002'));
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

// ─── Start server（async bootstrap：WAL → seed → cleaner → listen）§1.8 ───
import { prisma } from './utils/prisma.js';
import { seedAdmin } from './utils/seedAdmin.js';

async function ensureAdminSeed() {
  const adminCount = await prisma.user.count({ where: { role: 'admin' } });
  if (adminCount > 0) {
    logger.info('Admin user exists, skipping seed');
    return;
  }
  logger.info('No admin user found, running seed...');
  const admin = await seedAdmin(prisma);
  logger.info(`Seeded admin user "${admin.username}" (${admin.id})`);
}

async function bootstrap() {
  const PORT = env.PORT;

  // 1. WAL（任何 DB 操作前；$queryRaw 带断言，切不成必须知道）§1.3/D4
  const [wal] = await prisma.$queryRaw<Array<{ journal_mode: string }>>`PRAGMA journal_mode = WAL`;
  if (wal?.journal_mode !== 'wal') {
    throw new Error(`SQLite WAL 切换失败: ${JSON.stringify(wal)}`);
  }
  logger.info('SQLite WAL 已启用');

  // 2. seed 检测（缺 admin 则建；用已开 WAL 的 prisma 单例）§1.9/D3
  await ensureAdminSeed();

  // 3. session cleaner（cron，启动不立即写，放 WAL 后一致）
  startSessionCleaner();

  // 4. listen（DB 就绪后才接请求）
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} (${env.NODE_ENV})`);
  });
}

// 集成测试（supertest）import app 不得触发 listen/seed/cleaner——NODE_ENV guard（票 #16）
if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    logger.error('启动失败', { error: err.message, stack: err.stack });
    process.exit(1);
  });
}

export { app };
