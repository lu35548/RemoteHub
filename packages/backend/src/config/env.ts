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
  ADMIN_PASSWORD: requireEnv('ADMIN_PASSWORD'),
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  RATE_LIMIT_LOGIN_MAX: parseInt(process.env.RATE_LIMIT_LOGIN_MAX || '5', 10),
  RATE_LIMIT_REGISTER_MAX: parseInt(process.env.RATE_LIMIT_REGISTER_MAX || '3', 10),
  RATE_LIMIT_REFRESH_MAX: parseInt(process.env.RATE_LIMIT_REFRESH_MAX || '20', 10),
  RATE_LIMIT_GENERAL_MAX: parseInt(process.env.RATE_LIMIT_GENERAL_MAX || '200', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '',
  // 下界 1：0/负保留期会让每日清理删光审计日志
  AUDIT_RETENTION_DAYS: Math.max(1, parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10)),
} as const;

// 密钥格式校验（fail-fast，启动时即暴露配置错误，避免运行时才报 ERR_CRYPTO_INVALID_KEYLEN）
if (Buffer.from(env.ENCRYPTION_KEY, 'base64').length !== 32) {
  throw new Error('ENCRYPTION_KEY 必须是 base64 编码且解码后为 32 字节（AES-256-GCM）');
}
if (env.JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET 长度至少 32 字符');
}
