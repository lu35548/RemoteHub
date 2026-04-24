import { DataSource, DataSourceOptions, Repository } from 'typeorm';
import { config } from './config';
import { logger } from '@/utils/logger';
import { MockDatabaseService } from './database-mock';

// TypeORM configuration
const dataSourceOptions: DataSourceOptions = {
  type: config.database.type,
  host: config.database.host || undefined,
  port: config.database.port || undefined,
  username: config.database.username || undefined,
  password: config.database.password || undefined,
  database: config.database.database,
  
  // Connection pool settings (only for non-SQLite databases)
  ...(config.database.type && config.database.type !== 'sqlite' ? {
    extra: {
      connectionLimit: config.database.connectionPool.max,
      acquireTimeout: config.database.connectionPool.acquireTimeoutMillis,
      timeout: config.database.connectionPool.createTimeoutMillis,
    },
  } : {}),
  
  // Entity and migration settings
  entities: [
    'src/models/BaseEntity.ts',
    'src/models/User.ts',
    'src/models/Project.ts',
    'src/models/Connection.ts',
    'src/models/RemoteConnection.ts',
    'src/models/AuditLog.ts',
  ],
  migrations: ['src/database/migrations/**/*.ts'],
  synchronize: config.database.synchronize,
  logging: config.database.logging,
  migrationsRun: config.database.migrationsRun,
  
  // Additional TypeORM settings
  timezone: 'Z', // UTC
  charset: 'utf8mb4',
  // For MySQL specific settings
  ...(config.database.type === 'mysql' && {
    driver: 'mysql2',
  }),
  // For SQL Server specific settings
  ...(config.database.type === 'mssql' && {
    driver: 'mssql',
    options: {
      encrypt: false,
      trustServerCertificate: true,
    },
  }),
};

export class DatabaseServiceClass {
  private static instance: DatabaseServiceClass;
  private dataSource: DataSource | null = null;
  private usingMock = false;

  /**
   * 获取数据库类型（支持环境变量覆盖）
   */
  private getDatabaseType(): string {
    // 优先使用环境变量
    if (process.env.DB_TYPE) {
      return process.env.DB_TYPE.toLowerCase();
    }
    // 其次使用配置文件
    return config.database.type;
  }

  /**
   * 判断是否使用Mock数据库
   */
  private shouldUseMock(): boolean {
    // 1. 环境变量强制指定
    if (process.env.USE_MOCK_DB !== undefined) {
      return process.env.USE_MOCK_DB.toLowerCase() === 'true';
    }

    // 2. 开发环境默认使用Mock（除非有环境变量）
    const env = process.env.NODE_ENV || 'development';
    if (env === 'development' || env === 'test') {
      // 检查是否有数据库配置
      const hasDbConfig = config.database.host && config.database.database;
      if (!hasDbConfig) {
        logger.info('No database configuration found, using mock database');
        return true;
      }
    }

    return false;
  }

  private constructor() {}

  public static getInstance(): DatabaseServiceClass {
    if (!DatabaseServiceClass.instance) {
      DatabaseServiceClass.instance = new DatabaseServiceClass();
    }
    return DatabaseServiceClass.instance;
  }

  public async initialize(): Promise<any> {
    try {
      // 检查是否应该使用Mock数据库
      if (this.shouldUseMock()) {
        logger.info('Using mock database for development/testing');
        this.usingMock = true;
        const mockDb = MockDatabaseService.getInstance();
        await mockDb.initialize();
        return mockDb;
      }

      if (this.dataSource && this.dataSource.isInitialized) {
        logger.info('Database connection already initialized');
        return this.dataSource;
      }

      logger.info('Initializing database connection...', {
        type: config.database.type,
        host: config.database.host,
        port: config.database.port,
        database: config.database.database,
      });

      this.dataSource = new DataSource(dataSourceOptions);

      await this.dataSource.initialize();

      logger.info('Database connection established successfully');

      // Test the connection
      await this.testConnection();

      return this.dataSource;
    } catch (error) {
      // Check if this is a SQLite driver not installed error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('SQLite package has not been found installed')) {
        logger.warn('SQLite driver not available, falling back to mock database for development', {
          error: errorMessage,
        });

        this.usingMock = true;
        return this;
      }

      logger.error('Failed to initialize database connection', {
        error: errorMessage,
        config: {
          type: config.database.type,
          host: config.database.host,
          port: config.database.port,
          database: config.database.database,
        },
      });
      throw error;
    }
  }

  public async testConnection(): Promise<void> {
    try {
      if (!this.dataSource) {
        throw new Error('Database not initialized');
      }

      await this.dataSource.query('SELECT 1');
      logger.info('Database connection test successful');
    } catch (error) {
      logger.error('Database connection test failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public async close(): Promise<void> {
    try {
      if (this.dataSource && this.dataSource.isInitialized) {
        await this.dataSource.destroy();
        this.dataSource = null;
        logger.info('Database connection closed');
      }
    } catch (error) {
      logger.error('Error closing database connection', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  public getDataSource(): any {
    if (this.usingMock) {
      return MockDatabaseService.getInstance().getDataSource();
    }

    if (!this.dataSource) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.dataSource;
  }

  public async healthCheck(): Promise<{ status: string; details?: any }> {
    try {
      // If using mock database, always return connected
      if (this.usingMock) {
        return {
          status: 'connected',
          details: {
            type: 'mock',
            host: 'mock',
            database: 'mock',
            connected: true,
            note: 'Using mock database for development',
          },
        };
      }

      if (!this.dataSource) {
        return { status: 'disconnected', details: 'Database not initialized' };
      }

      if (!this.dataSource.isInitialized) {
        return { status: 'disconnected', details: 'Database connection not initialized' };
      }

      // Test connection with a simple query
      await this.dataSource.query('SELECT 1');

      return {
        status: 'connected',
        details: {
          type: config.database.type,
          host: config.database.host,
          database: config.database.database,
          connected: true,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        details: {
          type: this.usingMock ? 'mock' : config.database.type,
          host: this.usingMock ? 'mock' : config.database.host,
          database: this.usingMock ? 'mock' : config.database.database,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }

  // Helper method to get repository
  public getRepository<T extends Record<string, any>>(entity: new () => T): Repository<T> | any {
    if (this.usingMock) {
      return this.getDataSource().getRepository(entity);
    }

    if (!this.dataSource) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.dataSource.getRepository<T>(entity);
  }

  /**
   * 执行原生SQL查询
   * 这个方法是为了兼容需要query方法的服务
   */
  public async query(sql: string, parameters?: any[]): Promise<any> {
    if (this.usingMock) {
      // Mock数据库的查询实现
      logger.debug('Mock database query', { sql, parameters });
      // 返回模拟结果
      return [];
    }

    if (!this.dataSource) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    try {
      const result = await this.dataSource.query(sql, parameters);
      return result;
    } catch (error) {
      logger.error('Database query failed', {
        sql,
        parameters,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

// Export singleton instance
export const DatabaseService = DatabaseServiceClass.getInstance();
export default DatabaseService;

// Export AppDataSource for TypeORM repositories - 延迟初始化
let _AppDataSource: DataSource | null = null;

export const AppDataSource = {
  get instance() {
    if (!_AppDataSource) {
      // 检查是否使用Mock数据库
      const dbService = DatabaseServiceClass.getInstance();
      if (dbService['usingMock']) {
        // 返回Mock数据源
        return MockDatabaseService.getInstance().getDataSource();
      }
      _AppDataSource = new DataSource(dataSourceOptions);
    }
    return _AppDataSource;
  },
  initialize: () => {
    return AppDataSource.instance.initialize();
  },
  getRepository: (entity: any) => {
    return (AppDataSource.instance as DataSource).getRepository(entity);
  }
};