import { logger } from '@/utils/logger';
import { getServices } from './container';
import * as os from 'os';
import * as fs from 'fs/promises';

interface SystemMetrics {
  cpu: {
    usage: number; // CPU使用率 (0-100)
    loadAverage: number[]; // 负载平均值 [1m, 5m, 15m]
    cores: number; // CPU核心数
  };
  memory: {
    total: number; // 总内存 (bytes)
    free: number; // 空闲内存 (bytes)
    used: number; // 已使用内存 (bytes)
    usage: number; // 内存使用率 (0-100)
    heapUsed: number; // Node.js堆使用量
    heapTotal: number; // Node.js堆总量
  };
  disk: {
    total: number; // 总磁盘空间 (bytes)
    free: number; // 空闲磁盘空间 (bytes)
    used: number; // 已使用磁盘空间 (bytes)
    usage: number; // 磁盘使用率 (0-100)
  };
  uptime: number; // 系统运行时间 (seconds)
  nodeVersion: string; // Node.js版本
  platform: string; // 操作系统平台
}

interface DatabaseMetrics {
  connection: {
    status: 'connected' | 'disconnected' | 'error';
    responseTime: number; // 响应时间 (ms)
    activeConnections: number;
    totalConnections: number;
  };
  performance: {
    queryCount: number;
    avgQueryTime: number;
    slowQueries: number;
    errors: number;
  };
  tables: {
    [tableName: string]: {
      rowCount: number;
      size: number;
      indexSize: number;
    };
  };
}

interface ApplicationMetrics {
  requests: {
    total: number;
    successful: number;
    failed: number;
    avgResponseTime: number;
    requestsPerMinute: number;
  };
  sessions: {
    active: number;
    total: number;
    authenticated: number;
  };
  errors: {
    total: number;
    rate: number; // 错误率 (errors/requests)
    lastError?: {
      message: string;
      timestamp: Date;
      stack?: string;
    };
  };
  cache: {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
  };
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: {
      status: 'pass' | 'fail' | 'warn';
      responseTime: number;
      details?: string;
    };
    memory: {
      status: 'pass' | 'fail' | 'warn';
      usage: number;
      threshold: number;
    };
    cpu: {
      status: 'pass' | 'fail' | 'warn';
      usage: number;
      threshold: number;
    };
    disk: {
      status: 'pass' | 'fail' | 'warn';
      usage: number;
      threshold: number;
    };
    [key: string]: any;
  };
  metrics: {
    system: SystemMetrics;
    database: DatabaseMetrics;
    application: ApplicationMetrics;
  };
}

export class MonitoringService {
  private static requestMetrics: Array<{
    timestamp: Date;
    method: string;
    path: string;
    statusCode: number;
    responseTime: number;
  }> = [];

  private static errorMetrics: Array<{
    timestamp: Date;
    error: Error;
    request?: any;
  }> = [];

  private static startTime = Date.now();

  /**
   * 获取系统指标
   */
  public static async getSystemMetrics(): Promise<SystemMetrics> {
    const cpus = os.cpus();
    const loadAvg = os.loadavg();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    // 获取磁盘使用情况
    const diskStats = await this.getDiskStats();

    // 获取Node.js内存使用情况
    const memUsage = process.memoryUsage();

    return {
      cpu: {
        usage: await this.getCPUUsage(),
        loadAverage: loadAvg,
        cores: cpus.length,
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem,
        usage: (usedMem / totalMem) * 100,
        heapUsed: memUsage.heapUsed,
        heapTotal: memUsage.heapTotal,
      },
      disk: diskStats,
      uptime: os.uptime(),
      nodeVersion: process.version,
      platform: os.platform(),
    };
  }

  /**
   * 获取数据库指标
   */
  public static async getDatabaseMetrics(): Promise<DatabaseMetrics> {
    const services = getServices();
    const startTime = Date.now();

    try {
      // 测试数据库连接
      await services.database.query('SELECT 1');
      const responseTime = Date.now() - startTime;

      // 获取连接统计（取决于具体的数据库实现）
      const connectionStats = await this.getConnectionStats(services.database);

      // 获取表统计信息
      const tableStats = await this.getTableStats(services.database);

      return {
        connection: {
          status: 'connected',
          responseTime,
          activeConnections: connectionStats.activeConnections,
          totalConnections: connectionStats.totalConnections,
        },
        performance: {
          queryCount: this.requestMetrics.length,
          avgQueryTime: this.requestMetrics.reduce((sum, req) => sum + req.responseTime, 0) / Math.max(1, this.requestMetrics.length),
          slowQueries: this.requestMetrics.filter(req => req.responseTime > 1000).length,
          errors: this.errorMetrics.length,
        },
        tables: tableStats,
      };

    } catch (error: any) {
      logger.error('数据库指标获取失败:', error);
      return {
        connection: {
          status: 'error',
          responseTime: Date.now() - startTime,
          activeConnections: 0,
          totalConnections: 0,
        },
        performance: {
          queryCount: 0,
          avgQueryTime: 0,
          slowQueries: 0,
          errors: 1,
        },
        tables: {},
      };
    }
  }

  /**
   * 获取应用指标
   */
  public static getApplicationMetrics(): ApplicationMetrics {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;

    // 计算最近一分钟的请求数
    const recentRequests = this.requestMetrics.filter(req => req.timestamp.getTime() > oneMinuteAgo);
    const successfulRequests = this.requestMetrics.filter(req => req.statusCode < 400);
    const failedRequests = this.requestMetrics.filter(req => req.statusCode >= 400);

    return {
      requests: {
        total: this.requestMetrics.length,
        successful: successfulRequests.length,
        failed: failedRequests.length,
        avgResponseTime: this.requestMetrics.reduce((sum, req) => sum + req.responseTime, 0) / Math.max(1, this.requestMetrics.length),
        requestsPerMinute: recentRequests.length,
      },
      sessions: {
        active: 0, // 这里应该从会话存储中获取
        total: 0,
        authenticated: 0,
      },
      errors: {
        total: this.errorMetrics.length,
        rate: this.requestMetrics.length > 0 ? (failedRequests.length / this.requestMetrics.length) * 100 : 0,
        lastError: this.errorMetrics.length > 0 ? {
          message: this.errorMetrics[this.errorMetrics.length - 1].error.message,
          timestamp: this.errorMetrics[this.errorMetrics.length - 1].timestamp,
          stack: this.errorMetrics[this.errorMetrics.length - 1].error.stack,
        } : undefined,
      },
      cache: {
        hits: 0, // 这里应该从缓存服务中获取
        misses: 0,
        hitRate: 0,
        size: 0,
      },
    };
  }

  /**
   * 执行健康检查
   */
  public static async performHealthCheck(): Promise<HealthCheckResult> {
    const now = new Date();
    const uptime = Math.floor((now.getTime() - this.startTime) / 1000);

    try {
      const [systemMetrics, databaseMetrics, applicationMetrics] = await Promise.all([
        this.getSystemMetrics(),
        this.getDatabaseMetrics(),
        Promise.resolve(this.getApplicationMetrics()),
      ]);

      const checks: HealthCheckResult['checks'] = {
        database: {
          status: databaseMetrics.connection.status === 'connected' ? 'pass' : 'fail',
          responseTime: databaseMetrics.connection.responseTime,
          details: databaseMetrics.connection.status === 'error' ? '数据库连接失败' : undefined,
        },
        memory: {
          status: systemMetrics.memory.usage > 90 ? 'fail' : systemMetrics.memory.usage > 75 ? 'warn' : 'pass',
          usage: systemMetrics.memory.usage,
          threshold: 90,
        },
        cpu: {
          status: systemMetrics.cpu.usage > 90 ? 'fail' : systemMetrics.cpu.usage > 75 ? 'warn' : 'pass',
          usage: systemMetrics.cpu.usage,
          threshold: 90,
        },
        disk: {
          status: systemMetrics.disk.usage > 95 ? 'fail' : systemMetrics.disk.usage > 80 ? 'warn' : 'pass',
          usage: systemMetrics.disk.usage,
          threshold: 95,
        },
      };

      // 确定总体健康状态
      const failedChecks = Object.values(checks).filter(check => check.status === 'fail');
      const warnChecks = Object.values(checks).filter(check => check.status === 'warn');

      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (failedChecks.length > 0) {
        status = 'unhealthy';
      } else if (warnChecks.length > 0) {
        status = 'degraded';
      } else {
        status = 'healthy';
      }

      return {
        status,
        timestamp: now,
        uptime,
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        checks,
        metrics: {
          system: systemMetrics,
          database: databaseMetrics,
          application: applicationMetrics,
        },
      };

    } catch (error: any) {
      logger.error('健康检查失败:', error);
      return {
        status: 'unhealthy',
        timestamp: now,
        uptime,
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        checks: {
          database: {
            status: 'fail',
            responseTime: 0,
            details: '健康检查执行失败',
          },
          memory: {
            status: 'fail',
            usage: 0,
            threshold: 90,
          },
          cpu: {
            status: 'fail',
            usage: 0,
            threshold: 90,
          },
          disk: {
            status: 'fail',
            usage: 0,
            threshold: 95,
          },
        },
        metrics: {
          system: {
            cpu: { usage: 0, loadAverage: [0, 0, 0], cores: 0 },
            memory: { total: 0, free: 0, used: 0, usage: 0, heapUsed: 0, heapTotal: 0 },
            disk: { total: 0, free: 0, used: 0, usage: 0 },
            uptime: 0,
            nodeVersion: process.version,
            platform: os.platform(),
          },
          database: {
            connection: { status: 'error', responseTime: 0, activeConnections: 0, totalConnections: 0 },
            performance: { queryCount: 0, avgQueryTime: 0, slowQueries: 0, errors: 0 },
            tables: {},
          },
          application: this.getApplicationMetrics(),
        },
      };
    }
  }

  /**
   * 记录请求指标
   */
  public static recordRequest(
    method: string,
    path: string,
    statusCode: number,
    responseTime: number
  ): void {
    this.requestMetrics.push({
      timestamp: new Date(),
      method,
      path,
      statusCode,
      responseTime,
    });

    // 限制内存中的指标数量
    if (this.requestMetrics.length > 10000) {
      this.requestMetrics = this.requestMetrics.slice(-5000);
    }
  }

  /**
   * 记录错误指标
   */
  public static recordError(error: Error, request?: any): void {
    this.errorMetrics.push({
      timestamp: new Date(),
      error,
      request,
    });

    // 限制内存中的错误数量
    if (this.errorMetrics.length > 1000) {
      this.errorMetrics = this.errorMetrics.slice(-500);
    }
  }

  /**
   * 获取CPU使用率
   */
  private static async getCPUUsage(): Promise<number> {
    return new Promise((resolve) => {
      const startMeasure = this.cpuAverage();
      setTimeout(() => {
        const endMeasure = this.cpuAverage();
        const idleDifference = endMeasure.idle - startMeasure.idle;
        const totalDifference = endMeasure.total - startMeasure.total;
        const percentageCPU = 100 - ~~(100 * idleDifference / totalDifference);
        resolve(percentageCPU);
      }, 100);
    });
  }

  /**
   * 计算CPU平均值
   */
  private static cpuAverage(): { idle: number; total: number } {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (let cpu of cpus) {
      for (let type in cpu.times) {
        totalTick += (cpu.times as any)[type];
      }
      totalIdle += cpu.times.idle;
    }

    return {
      idle: totalIdle / cpus.length,
      total: totalTick / cpus.length,
    };
  }

  /**
   * 获取磁盘使用情况
   */
  private static async getDiskStats(): Promise<{ total: number; free: number; used: number; usage: number }> {
    try {
      const stats = await fs.stat('.');
      // 这里应该使用更准确的磁盘使用检测库
      // 简化实现，返回模拟数据
      const total = 100 * 1024 * 1024 * 1024; // 100GB
      const free = 30 * 1024 * 1024 * 1024; // 30GB
      const used = total - free;
      const usage = (used / total) * 100;

      return { total, free, used, usage };
    } catch (error) {
      return { total: 0, free: 0, used: 0, usage: 0 };
    }
  }

  /**
   * 获取连接统计信息
   */
  private static async getConnectionStats(database: any): Promise<{
    activeConnections: number;
    totalConnections: number;
  }> {
    try {
      // 这里应该根据具体的数据库实现获取连接统计
      // 简化实现
      return {
        activeConnections: 1,
        totalConnections: 10,
      };
    } catch (error) {
      return {
        activeConnections: 0,
        totalConnections: 0,
      };
    }
  }

  /**
   * 获取表统计信息
   */
  private static async getTableStats(database: any): Promise<DatabaseMetrics['tables']> {
    try {
      const tables = ['users', 'projects', 'connections', 'audit_logs'];
      const stats: DatabaseMetrics['tables'] = {};

      for (const table of tables) {
        try {
          const result = await database.query(`SELECT COUNT(*) as count FROM ${table}`);
          stats[table] = {
            rowCount: result[0]?.count || 0,
            size: 0, // 这里应该获取实际的表大小
            indexSize: 0,
          };
        } catch (error) {
          stats[table] = {
            rowCount: 0,
            size: 0,
            indexSize: 0,
          };
        }
      }

      return stats;
    } catch (error) {
      return {};
    }
  }

  /**
   * 清理旧指标数据
   */
  public static cleanupMetrics(olderThanHours: number = 24): void {
    const cutoffTime = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    this.requestMetrics = this.requestMetrics.filter(
      metric => metric.timestamp > cutoffTime
    );

    this.errorMetrics = this.errorMetrics.filter(
      metric => metric.timestamp > cutoffTime
    );

    logger.info('清理旧监控指标数据', {
      olderThanHours,
      requestMetricsRemaining: this.requestMetrics.length,
      errorMetricsRemaining: this.errorMetrics.length,
    });
  }

  /**
   * 获取性能报告
   */
  public static getPerformanceReport(): {
    period: string;
    summary: {
      totalRequests: number;
      avgResponseTime: number;
      errorRate: number;
      throughput: number;
    };
    slowestRequests: Array<{
      path: string;
      method: string;
      responseTime: number;
      timestamp: Date;
    }>;
    mostErrors: Array<{
      path: string;
      errorCount: number;
      lastError: string;
    }>;
  } {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentRequests = this.requestMetrics.filter(req => req.timestamp > oneHourAgo);
    const recentErrors = this.errorMetrics.filter(err => err.timestamp > oneHourAgo);

    // 最慢的请求
    const slowestRequests = recentRequests
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, 10)
      .map(req => ({
        path: req.path,
        method: req.method,
        responseTime: req.responseTime,
        timestamp: req.timestamp,
      }));

    // 错误最多的路径
    const errorCounts: Record<string, { count: number; lastError: string }> = {};
    recentErrors.forEach(err => {
      const path = err.request?.path || 'unknown';
      if (!errorCounts[path]) {
        errorCounts[path] = { count: 0, lastError: err.error.message };
      }
      errorCounts[path].count++;
      errorCounts[path].lastError = err.error.message;
    });

    const mostErrors = Object.entries(errorCounts)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 10)
      .map(([path, data]) => ({
        path,
        errorCount: data.count,
        lastError: data.lastError,
      }));

    return {
      period: '最近1小时',
      summary: {
        totalRequests: recentRequests.length,
        avgResponseTime: recentRequests.reduce((sum, req) => sum + req.responseTime, 0) / Math.max(1, recentRequests.length),
        errorRate: recentRequests.length > 0 ? (recentErrors.length / recentRequests.length) * 100 : 0,
        throughput: recentRequests.length, // 每小时请求数
      },
      slowestRequests,
      mostErrors,
    };
  }
}