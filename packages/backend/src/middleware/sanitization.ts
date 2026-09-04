import type { NextFunction, Request, Response } from 'express';
import { createAppError } from '../utils/appError.js';

/**
 * 输入净化中间件（P0-4 / 票 #18）。
 *
 * 作用对象：req.body 与 req.query（路由 params 由路径模式限定，无注入面）。
 * - XSS 剥离（不拒绝）：script 标签整段、on*= 事件属性、javascript: 协议
 * - 注入模式拒绝（VAL_001 / 422）：SQL、NoSQL（$ 开头 key）、路径遍历、命令注入
 * - 排除字段：任意层级键名匹配即原样透传。票面钦定三键之外追加 oldPassword/newPassword
 *   （双轴 review 修正：change-password 端点的键名不命中 password 精确匹配，而密码合法
 *   含注入样字符——不豁免会导致改密被 422 拒绝，或剥离后入库使改密成功即无法登录）
 */
export const SANITIZATION_EXCLUDED_FIELDS = [
  'password',
  'encryptedPass',
  'notes',
  'oldPassword',
  'newPassword',
] as const;

// ─── XSS 剥离（剥离而非拒绝：正常内容混入标记时保留业务文本）───
// script 标签连同内容整段移除（跨行、属性变体、大小写）
const SCRIPT_TAG_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
// 事件属性 on*=（引号包裹与无引号三形态）。\b 防 song= 等词中 on 误伤；仅剥离不拒绝，宁多勿漏
const EVENT_ATTR_RE = /\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;
// javascript: 协议（剥离，大小写变体一并覆盖）
const JS_PROTOCOL_RE = /javascript\s*:/gi;

// ─── 注入模式拒绝 ───
// SQL：引号 + 空白 + 关键字（误杀防线：要求引号组合，裸词「Select 演示」「A and B」放行）。
// \b 防 'oracle' 类正常词误杀（or 后必须是非词字符）
const SQLI_RE = /'\s*(or|and|union|select|insert|update|delete|drop)\b/i;
// SQL 行内注释
const SQL_COMMENT_RE = /--/;
// 路径遍历 ../ 与 ..\
const PATH_TRAVERSAL_RE = /\.\.[/\\]/;
// 命令注入：&& 连接、反引号替换、$() 替换、rm -rf
const CMDI_RE = /&&|`|\$\(|rm\s+-rf/i;
// NoSQL：$ 开头操作符 key（对象键层面）
const NOSQL_KEY_RE = /^\$/;

/** 对单个字符串执行剥离与拒绝检测（拒绝时抛 VAL_001 AppError，由全局 error handler 落 422） */
function sanitizeString(value: string): string {
  if (SQLI_RE.test(value) || SQL_COMMENT_RE.test(value) || PATH_TRAVERSAL_RE.test(value) || CMDI_RE.test(value)) {
    throw createAppError('VAL_001');
  }
  return value
    .replace(SCRIPT_TAG_RE, '')
    .replace(EVENT_ATTR_RE, '')
    .replace(JS_PROTOCOL_RE, '');
}

/**
 * 递归净化（纯函数：输入 → 输出或 VAL_001 异常，无副作用）。
 * 对象键：$ 开头拒绝（NoSQL）；键名命中排除清单则整棵子树原样透传。
 */
export function sanitizeValue(value: unknown, isExcluded = false): unknown {
  if (isExcluded) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (NOSQL_KEY_RE.test(key)) throw createAppError('VAL_001');
      out[key] = sanitizeValue(child, (SANITIZATION_EXCLUDED_FIELDS as readonly string[]).includes(key));
    }
    return out;
  }
  return value;
}

/**
 * 全局净化中间件（挂载：限流器之后、路由注册之前——净化 CPU 消耗处于限流保护之内）。
 *
 * Express 5 的 req.query 是 prototype getter（无缓存、每次访问重新解析返回新对象）：
 * 实例赋值抛 TypeError、原地 mutate 被丢弃——必须 defineProperty 以实例 value 属性覆写，
 * 后续路由/控制器读取 req.query 才会命中净化后的对象。
 */
export function sanitizationMiddleware(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (req.body !== null && typeof req.body === 'object') {
      req.body = sanitizeValue(req.body) as typeof req.body;
    }
    const query = req.query;
    if (query !== null && typeof query === 'object') {
      const sanitized = sanitizeValue(query) as typeof query;
      Object.defineProperty(req, 'query', {
        value: sanitized,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
    next();
  } catch (err) {
    next(err);
  }
}
