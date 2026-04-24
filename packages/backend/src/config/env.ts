function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少必需的环境变量: ${name}`);
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3001', 10),
  DATABASE_URL: requireEnv('DATABASE_URL'),
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  ENCRYPTION_KEY: requireEnv('ENCRYPTION_KEY'),
  ENCRYPTION_KEY_OLD: process.env.ENCRYPTION_KEY_OLD || null,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || 'Admin123',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  RATE_LIMIT_LOGIN_MAX: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5', 10),
  RATE_LIMIT_REGISTER_MAX: parseInt(process.env.RATE_LIMIT_REGISTER_MAX || '3', 10),
  RATE_LIMIT_REFRESH_MAX: parseInt(process.env.RATE_LIMIT_REFRESH_MAX || '20', 10),
  RATE_LIMIT_GENERAL_MAX: parseInt(process.env.RATE_LIMIT_GENERAL_MAX || '200', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
} as const;
