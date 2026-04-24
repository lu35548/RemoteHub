import { Router } from 'express';
import { DatabaseService } from '@/config/database';
import { DatabaseTester } from '@/utils/db-test';
import { logger } from '@/utils/logger';

const router = Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                   description: Server uptime in seconds
 */
router.get('/', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: Detailed health check including database status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: OK
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 uptime:
 *                   type: number
 *                 database:
 *                   type: object
 *                   properties:
 *                     status:
 *                       type: string
 *                       enum: [connected, disconnected, error]
 *                     details:
 *                       type: object
 *                 memory:
 *                   type: object
 *                   properties:
 *                     used:
 *                       type: string
 *                     total:
 *                       type: string
 *                     percentage:
 *                       type: number
 */
router.get('/detailed', async (req, res) => {
  try {
    const [dbHealth, memUsage] = await Promise.all([
      DatabaseService.healthCheck(),
      getMemoryUsage(),
    ]);

    const overallStatus = dbHealth.status === 'connected' ? 'OK' : 'DEGRADED';

    res.status(200).json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: dbHealth,
      memory: memUsage,
    });
  } catch (error) {
    logger.error('Health check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      memory: getMemoryUsage(),
    });
  }
});

/**
 * @swagger
 * /health/database:
 *   get:
 *     summary: Test database connection
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Database connection test results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 mysql:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     message:
 *                       type: string
 *                     details:
 *                       type: object
 *                 mssql:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                     message:
 *                       type: string
 *                     details:
 *                       type: object
 */
router.get('/database', async (req, res) => {
  try {
    const results = await DatabaseTester.testBothDatabases();
    
    res.status(200).json({
      timestamp: new Date().toISOString(),
      ...results,
    });
  } catch (error) {
    logger.error('Database health check failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    
    res.status(500).json({
      timestamp: new Date().toISOString(),
      mysql: null,
      mssql: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * @swagger
 * /health/database/config:
 *   get:
 *     summary: Validate database configuration
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Database configuration validation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 issues:
 *                   type: array
 *                   items:
 *                     type: string
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get('/database/config', async (req, res) => {
  try {
    const validation = await DatabaseTester.validateDatabaseConfiguration();
    
    res.status(200).json({
      timestamp: new Date().toISOString(),
      ...validation,
    });
  } catch (error) {
    logger.error('Database configuration validation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    
    res.status(500).json({
      timestamp: new Date().toISOString(),
      valid: false,
      issues: ['Configuration validation failed'],
      recommendations: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

function getMemoryUsage() {
  const usage = process.memoryUsage();
  const used = Math.round(usage.heapUsed / 1024 / 1024);
  const total = Math.round(usage.heapTotal / 1024 / 1024);
  const percentage = Math.round((used / total) * 100);

  return {
    used: `${used}MB`,
    total: `${total}MB`,
    percentage,
    raw: {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
    },
  };
}

export default router;