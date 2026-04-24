import { DataSource } from 'typeorm';
import { config } from '@/config/config';
import { logger } from '@/utils/logger';

export interface DatabaseTestResult {
  success: boolean;
  message: string;
  details?: any;
  error?: string;
}

export class DatabaseTester {
  static async testConnection(
    type: 'mysql' | 'mssql' | 'sqlite' = config.database.type,
    host: string = config.database.host,
    port: number = config.database.port,
    username: string = config.database.username,
    password: string = config.database.password,
    database: string = config.database.database
  ): Promise<DatabaseTestResult> {
    const testConfig = {
      type,
      host,
      port,
      username,
      password,
      database,
      synchronize: false,
      logging: false,
      migrationsRun: false,
      entities: [],
      migrations: [],
      
      // Type-specific configurations
      ...(type === 'mysql' && {
        driver: 'mysql2',
        charset: 'utf8mb4',
        timezone: 'Z',
      }),
      ...(type === 'mssql' && {
        driver: 'mssql',
        options: {
          encrypt: false,
          trustServerCertificate: true,
        },
      }),
    };

    let dataSource: DataSource | null = null;

    try {
      logger.info(`Testing database connection...`, {
        type,
        host,
        port,
        database,
        username,
      });

      dataSource = new DataSource(testConfig as any);
      await dataSource.initialize();

      // Test basic connectivity
      const result = await dataSource.query('SELECT 1 as test');
      
      // Test database existence and permissions
      const dbInfo = await this.getDatabaseInfo(dataSource, type);
      
      await dataSource.destroy();

      logger.info(`Database connection test successful`, {
        type,
        host,
        port,
        database,
        ...dbInfo,
      });

      return {
        success: true,
        message: `Successfully connected to ${type} database`,
        details: {
          type,
          host,
          port,
          database,
          username,
          ...dbInfo,
        },
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error(`Database connection test failed`, {
        type,
        host,
        port,
        database,
        username,
        error: errorMessage,
      });

      if (dataSource && dataSource.isInitialized) {
        try {
          await dataSource.destroy();
        } catch (destroyError) {
          logger.error('Error destroying test connection', {
            error: destroyError instanceof Error ? destroyError.message : 'Unknown error',
          });
        }
      }

      return {
        success: false,
        message: `Failed to connect to ${type} database`,
        error: errorMessage,
        details: {
          type,
          host,
          port,
          database,
          username,
        },
      };
    }
  }

  private static async getDatabaseInfo(dataSource: DataSource, type: string): Promise<any> {
    try {
      let info: any = {};

      switch (type) {
        case 'mysql':
          const mysqlVersion = await dataSource.query('SELECT VERSION() as version');
          const mysqlCharset = await dataSource.query(
            'SELECT DEFAULT_CHARACTER_SET_NAME as charset FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?',
            [config.database.database]
          );
          
          info = {
            version: mysqlVersion[0]?.version,
            charset: mysqlCharset[0]?.charset || 'utf8mb4',
          };
          break;

        case 'mssql':
          const sqlServerVersion = await dataSource.query('SELECT @@VERSION as version');
          const sqlServerInfo = await dataSource.query(`
            SELECT 
              DATABASEPROPERTYEX(DB_NAME(), 'Collation') as collation,
              (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE') as tableCount
          `);
          
          info = {
            version: sqlServerVersion[0]?.version,
            collation: sqlServerInfo[0]?.collation,
            tableCount: sqlServerInfo[0]?.tableCount,
          };
          break;
      }

      return info;
    } catch (error) {
      logger.warn('Could not retrieve database info', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {};
    }
  }

  static async testBothDatabases(): Promise<{
    mysql: DatabaseTestResult | null;
    mssql: DatabaseTestResult | null;
  }> {
    const results = {
      mysql: null as DatabaseTestResult | null,
      mssql: null as DatabaseTestResult | null,
    };

    // Test MySQL if configured
    if (config.database.type === 'mysql' || process.env.TEST_MYSQL === 'true') {
      results.mysql = await this.testConnection('mysql');
    }

    // Test SQL Server if configured
    if (config.database.type === 'mssql' || process.env.TEST_MSSQL === 'true') {
      results.mssql = await this.testConnection('mssql');
    }

    return results;
  }

  static async validateDatabaseConfiguration(): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check required fields
    if (!config.database.host) {
      issues.push('Database host is not configured');
    }

    if (!config.database.username) {
      issues.push('Database username is not configured');
    }

    if (!config.database.database) {
      issues.push('Database name is not configured');
    }

    // Check security recommendations
    if (config.database.username === 'root') {
      recommendations.push('Consider using a dedicated database user instead of root');
    }

    if (config.database.password.length < 8) {
      recommendations.push('Database password should be at least 8 characters long');
    }

    // Check port configuration
    if (config.database.type === 'mysql' && config.database.port !== 3306) {
      recommendations.push('MySQL is typically configured on port 3306');
    }

    if (config.database.type === 'mssql' && config.database.port !== 1433) {
      recommendations.push('SQL Server is typically configured on port 1433');
    }

    return {
      valid: issues.length === 0,
      issues,
      recommendations,
    };
  }
}

export default DatabaseTester;