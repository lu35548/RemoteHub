import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface DatabaseConfig {
  type: 'mysql' | 'mssql' | 'sqlite';
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  connectionPool: {
    min: number;
    max: number;
    acquireTimeoutMillis: number;
    createTimeoutMillis: number;
    destroyTimeoutMillis: number;
    idleTimeoutMillis: number;
    reapIntervalMillis: number;
    createRetryIntervalMillis: number;
  };
  synchronize: boolean;
  logging: boolean;
  migrationsRun: boolean;
}

interface JWTConfig {
  secret: string;
  accessExpiresIn: string;
  refreshExpiresIn: string;
}

interface CORSConfig {
  origin: string;
  credentials: boolean;
}

interface LoggingConfig {
  level: 'error' | 'warn' | 'info' | 'debug';
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  database: DatabaseConfig;
  jwt: JWTConfig;
  cors: CORSConfig;
  logging: LoggingConfig;
  rateLimit: RateLimitConfig;
  api: {
    prefix: string;
    version: string;
  };
  security: {
    passwordMinLength: number;
    maxLoginAttempts: number;
    lockoutTime: number;
  };
}

// Validate required environment variables
const requiredEnvVars = ['JWT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// Export configuration object
export const config: Config = {
  env: (process.env.NODE_ENV as 'development' | 'test' | 'production') || 'development',
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || 'localhost',
  
  database: {
    type: (process.env.DATABASE_TYPE as 'mysql' | 'mssql' | 'sqlite') || 'sqlite',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306', 10),
    username: process.env.DATABASE_USERNAME || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_DATABASE || 'remotehub',
    
    // Connection pool settings
    connectionPool: {
      min: 2,
      max: 10,
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    },
    
    // TypeORM specific settings
    synchronize: process.env.NODE_ENV === 'development',
    logging: process.env.NODE_ENV === 'development',
    migrationsRun: process.env.NODE_ENV === 'production',
  },
  
  jwt: {
    secret: process.env.JWT_SECRET!,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: process.env.CORS_CREDENTIALS === 'true',
  },
  
  logging: {
    level: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 改为1分钟
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10), // 改为1000次/分钟
  },
  
  // Application settings
  api: {
    prefix: '/api/v1',
    version: '1.0.0',
  },
  
  // Security settings
  security: {
    passwordMinLength: 8,
    maxLoginAttempts: 5,
    lockoutTime: 15 * 60 * 1000, // 15 minutes
  },
};

export default config;