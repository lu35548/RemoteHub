import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import swaggerUi from 'swagger-ui-express';
import rateLimit from 'express-rate-limit';

import { config } from '@/config/config';
import { getCorsConfig } from '@/config/cors';
import { swaggerSpec, swaggerUiOptions } from '@/config/swagger';
import { errorHandler, notFoundHandler } from '@/middleware/errorHandler';
import { environmentBasedSecurityEnhancements } from '@/middleware/securityEnhancements';
import { apiRateLimit, authRateLimit, uploadRateLimit, exportRateLimit } from '@/middleware/rateLimiter';
import { MonitoringController } from '@/controllers/monitoringController';

// Import routes
import healthRoutes from '@/routes/health';
import authRoutes from '@/routes/auth';
import userRoutes from '@/routes/users';
import projectRoutes from '@/routes/projects';
import connectionRoutes from '@/routes/connections';
import remoteConnectionsRoutes from '@/routes/remoteConnections';
import auditRoutes from '@/routes/audit';
import exportRoutes from '@/routes/export';
import securityRoutes from '@/routes/security';
import backupRoutes from '@/routes/backup';
import monitoringRoutes from '@/routes/monitoring';

const app = express();

// 应用安全增强中间件
const securityEnhancements = environmentBasedSecurityEnhancements();
securityEnhancements.forEach(middleware => app.use(middleware));

// 基础安全中间件
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
app.use(cors(getCorsConfig()));

// Rate limiting - 使用更宽松的配置
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
      timestamp: new Date().toISOString(),
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  // 对于成功的请求不计入限制（开发环境）
  skipSuccessfulRequests: config.env === 'development',
  keyGenerator: (req) => {
    // 对于认证用户，使用用户ID；否则使用IP
    const user = (req as any).user;
    return user ? `user:${user.id}` : req.ip;
  },
});
app.use('/api', limiter);

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req: any, res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (config.env !== 'test') {
  app.use(morgan('combined'));
}

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// 应用监控中间件
app.use(MonitoringController.requestMetricsMiddleware);

// Health check endpoint (before auth middleware)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: config.api.version,
    environment: config.env,
  });
});

// API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, swaggerUiOptions));

// API specification JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// API Routes with specific rate limiting
app.use(`${config.api.prefix}/health`, healthRoutes);
app.use(`${config.api.prefix}/auth`, authRateLimit, authRoutes); // 认证路由严格限制
app.use(`${config.api.prefix}/users`, apiRateLimit, userRoutes);
app.use(`${config.api.prefix}/projects`, apiRateLimit, projectRoutes);
app.use(`${config.api.prefix}/connections`, apiRateLimit, connectionRoutes); // 数据库连接
app.use(`${config.api.prefix}/remote-connections`, apiRateLimit, remoteConnectionsRoutes); // 远程连接
app.use(`${config.api.prefix}/audit-logs`, apiRateLimit, auditRoutes); // 审计日志查询限制
app.use(`${config.api.prefix}/export`, exportRateLimit, exportRoutes); // 导出功能限制
app.use(`${config.api.prefix}/security`, apiRateLimit, securityRoutes); // 安全监控路由
app.use(`${config.api.prefix}/backup`, authRateLimit, backupRoutes); // 备份功能限制
app.use(`${config.api.prefix}/monitoring`, apiRateLimit, monitoringRoutes); // 系统监控路由

// Kubernetes探针端点（无需认证）
app.get('/live', MonitoringController.livenessProbe);
app.get('/ready', MonitoringController.readinessProbe);
app.get('/startup', MonitoringController.startupProbe);

// API info endpoint
app.get(config.api.prefix, (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      name: 'RemoteHub API',
      version: config.api.version,
      environment: config.env,
      timestamp: new Date().toISOString(),
      endpoints: {
        health: `${config.api.prefix}/health`,
        auth: `${config.api.prefix}/auth`,
        users: `${config.api.prefix}/users`,
        projects: `${config.api.prefix}/projects`,
        connections: `${config.api.prefix}/connections`,
        // remoteConnections: `${config.api.prefix}/remote-connections`, // 暂时禁用
        auditLogs: `${config.api.prefix}/audit-logs`,
        export: `${config.api.prefix}/export`,
        security: `${config.api.prefix}/security`,
        backup: `${config.api.prefix}/backup`,
        monitoring: `${config.api.prefix}/monitoring`,
        documentation: '/api-docs',
        spec: '/api-docs.json',
      },
    },
  });
});

// 404 handler for API routes
app.use('*', notFoundHandler);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;