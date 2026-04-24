// 导出所有安全相关的中间件
export {
  createRateLimiter,
  apiRateLimit,
  strictRateLimit,
  authRateLimit,
  passwordResetRateLimit,
  uploadRateLimit,
  searchRateLimit,
  createProjectRateLimit,
  batchOperationRateLimit,
  connectionTestRateLimit,
  createDynamicRateLimiter,
  dynamicApiRateLimit,
  createUserBasedRateLimiter,
  userBasedApiRateLimit,
} from './rateLimiter';

export {
  createCSRFProtection,
  csrfProtection,
  apiCSRFProtection,
  formCSRFProtection,
  getCSRFToken,
  validateCSRFToken,
  websocketCSRFProtection,
} from './csrf';

// 导出输入清理中间件
export {
  createSanitizationMiddleware,
  sanitizeInput,
  xssProtection,
  injectionProtection,
  sanitizeFilePath,
  sanitizeSearchQuery,
  sanitizeUserContent,
} from './sanitization';

// 导出 Helmet 安全中间件
export {
  dynamicCSPMiddleware,
  apiSecurityMiddleware,
  defaultSecurityMiddleware,
  productionSecurityMiddleware,
  developmentSecurityMiddleware,
  environmentBasedSecurityMiddleware,
} from './helmetSecurity';

// 导入必要的错误类
export {
  TooManyRequestsError,
  ValidationError,
} from '@/utils/errors';

// 导入 helmet 默认导出
import helmet from 'helmet';
import { sanitizeInput } from './sanitization';
import { csrfProtection } from './csrf';
import { authRateLimit, apiRateLimit, passwordResetRateLimit, uploadRateLimit } from './rateLimiter';

/**
 * 组合安全中间件 - 推荐的生产环境配置
 */
export const productionSecurityStack = [
  helmet, // Helmet 安全头
  // sanitizeInput, // 输入清理
  // csrfProtection, // CSRF 保护
  // authRateLimit, // 认证速率限制
  // apiRateLimit, // API 速率限制
];

/**
 * 最小安全中间件 - 仅最基本的安全措施
 */
export const minimalSecurityStack = [
  helmet, // 仅 Helmet 安全头
  // sanitizeInput, // 仅输入清理
];

/**
 * 完整安全中间件 - 所有安全措施
 */
export const fullSecurityStack = [
  helmet, // Helmet 安全头
  sanitizeInput, // 输入清理
  csrfProtection, // CSRF 保护
  authRateLimit, // 认证速率限制
  apiRateLimit, // API 速率限制
  passwordResetRateLimit, // 密码重置限制
  uploadRateLimit, // 上传限制
];