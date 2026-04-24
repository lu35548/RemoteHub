import { Router } from 'express';
import authRoutes from './auth';
import healthRoutes from './health';
import usersRoutes from './users';
import projectsRoutes from './projects';
import connectionsRoutes from './connections';
import remoteConnectionsRoutes from './remoteConnections';
import migrationRoutes from './migration';

const router = Router();

/**
 * @swagger
 * /:
 *   get:
 *     summary: API root endpoint
 *     tags: [API]
 *     responses:
 *       200:
 *         description: API information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                       example: RemoteHub API
 *                     version:
 *                       type: string
 *                       example: 1.0.0
 *                     status:
 *                       type: string
 *                       example: running
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      name: 'RemoteHub API',
      version: '1.0.0',
      status: 'running',
      timestamp: new Date().toISOString(),
    },
  });
});

// API v1 路由
const apiV1Router = Router();

// 认证路由（无需预先认证）
apiV1Router.use('/auth', authRoutes);

// 健康检查路由
apiV1Router.use('/health', healthRoutes);

// 需要认证的路由
apiV1Router.use('/users', usersRoutes);
apiV1Router.use('/projects', projectsRoutes);
apiV1Router.use('/connections', connectionsRoutes);
apiV1Router.use('/remote-connections', remoteConnectionsRoutes);
apiV1Router.use('/migration', migrationRoutes);

// 将 v1 路由挂载到 /api/v1 前缀
router.use('/api/v1', apiV1Router);

export default router;