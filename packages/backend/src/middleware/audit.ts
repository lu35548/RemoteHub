import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AuditAction, AuditResource, AuditLogDetail } from '@remotehub/shared';
import { SENSITIVE_FIELDS } from '@remotehub/shared';
import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';

/**
 * 审计中间件（P0-2，票 #16）。路由级挂载，res.json monkey-patch 捕获响应后
 * setImmediate 异步落库；成败都记（2xx = success，否则 failure + detail.reason=错误码）。
 *
 * 命名约定（票 #15 OQ 裁决）：shared 的 `AuditLog` 是 API DTO（detail 为对象、
 * createdAt 为 ISO string）；Prisma model 同名不同形（detail 为 JSON 字符串、
 * createdAt 为 Date）。本文件只消费 shared 枚举/常量与 Prisma 实例，不同时导入
 * 两侧裸名；如需引用 DB 行类型一律走 `Prisma.*` 命名空间，避免同名冲突。
 */

export interface AuditConfig {
  action: AuditAction;
  resource: AuditResource;
  getResourceId?: (req: Request) => string | undefined;
}

type BeforeModel = 'user' | 'project' | 'connection' | 'projectMember';

/** resource → prisma model 映射（before 快照自治用）。system/security 无实体，不映射。 */
const RESOURCE_MODELS: Partial<Record<AuditResource, BeforeModel>> = {
  user: 'user',
  project: 'project',
  connection: 'connection',
  member: 'projectMember',
};

/**
 * before 快照查询构造（纯函数）：仅 PATCH/DELETE 且 resource 有 model 映射且能定位资源时
 * 返回 { model, where }。member 走复合键（挂载点 :id=projectId + 子路由 :uid=userId）。
 */
export function buildBeforeQuery(
  resource: AuditResource,
  req: Pick<Request, 'method' | 'params'>,
): { model: BeforeModel; where: Record<string, unknown> } | null {
  const model = RESOURCE_MODELS[resource];
  if (!model || (req.method !== 'PATCH' && req.method !== 'DELETE')) return null;

  if (resource === 'member') {
    const projectId = req.params.id;
    const userId = req.params.uid;
    if (!projectId || !userId) return null;
    return { model, where: { projectId_userId: { projectId, userId } } };
  }

  const id = req.params.id;
  return id ? { model, where: { id } } : null;
}

/** IP 掩码：IPv4 点分末段置 `*`；IPv6 末组掩码（IPv4-mapped 掩 v4 末段）。非法输入返回 null（不存明文垃圾）。 */
export function maskIp(ip: string | null | undefined): string | null {
  if (!ip) return null;

  // IPv6（含 ':' 优先判断，IPv4-mapped 如 ::ffff:127.0.0.1 也走此路径）
  if (ip.includes(':')) {
    const groups = ip.split(':');
    const last: string | undefined = groups[groups.length - 1];
    if (last === undefined || last === '') return null;
    // IPv4-mapped IPv6（如 ::ffff:127.0.0.1）：末组是 v4 地址，掩其末段
    if (last.includes('.')) {
      const masked = maskIp(last);
      return masked === null ? null : [...groups.slice(0, -1), masked].join(':');
    }
    if (!/^[0-9a-fA-F]*$/.test(last)) return null;
    groups[groups.length - 1] = '*';
    return groups.join(':');
  }

  // 纯 IPv4：点分末段置 *
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length !== 4 || parts.some((p) => !/^\d+$/.test(p))) return null;
    return [...parts.slice(0, 3), '*'].join('.');
  }

  return null;
}

/** detail 脱敏：SENSITIVE_FIELDS 值替换为 '[REDACTED]'（保留字段名标识变更），递归处理嵌套对象与数组。纯函数，不改原对象。 */
export function redactDetail(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_FIELDS.has(key)) {
      out[key] = '[REDACTED]';
      continue;
    }
    out[key] = redactValue(value);
  }
  return out;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    return redactDetail(value as Record<string, unknown>);
  }
  return value;
}

// ─── 审计中间件本体 ───

/**
 * 审计中间件（路由级）：挂载在写操作路由，**authMiddleware 之后、role/projectRole 之前**
 * （权限拒绝 403 同样记 failure——「谁试图做什么」与「做成了什么」同等重要）。
 * res.json monkey-patch 捕获响应体后 setImmediate 异步落库；审计任何失败仅
 * logger.error，不传播（主请求不受影响）。design §3.5.2 流程。
 */
export function auditMiddleware(config: AuditConfig): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // before 快照（PATCH/DELETE 自治查询；失败降级为无 before，不阻塞主请求）
    let before: Record<string, unknown> | null = null;
    const query = buildBeforeQuery(config.resource, req);
    if (query) {
      try {
        const row = await (prisma[query.model] as unknown as {
          findUnique: (args: { where: Record<string, unknown> }) => Promise<unknown>;
        }).findUnique({ where: query.where });
        if (isRecord(row)) before = row;
      } catch (err) {
        logger.error('审计 before 快照失败（降级为无 before）', {
          action: config.action,
          error: (err as Error).message,
        });
      }
    }

    // res.json patch：捕获响应体 → setImmediate 异步落库 → 透传原调用
    const originalJson = res.json;
    res.json = ((body?: unknown) => {
      writeAuditLog(config, req, res, before, body);
      return (originalJson as (b?: unknown) => unknown).call(res, body);
    }) as typeof res.json;

    next();
  };
}

function writeAuditLog(
  config: AuditConfig,
  req: Request,
  res: Response,
  before: Record<string, unknown> | null,
  body: unknown,
): void {
  setImmediate(() => {
    try {
      const envelope = isRecord(body) ? body : {};
      const success = res.statusCode >= 200 && res.statusCode < 300;

      const detail: AuditLogDetail = {};
      if (before) detail.before = redactDetail(before);
      if (success && isRecord(envelope.data)) detail.after = redactDetail(envelope.data);
      if (!success && isRecord(envelope.error) && typeof envelope.error.code === 'string') {
        detail.reason = envelope.error.code;
      }

      const ua = req.headers['user-agent'];
      prisma.auditLog
        .create({
          data: {
            userId: req.user?.id ?? null, // login 未认证为 null（spec 口径）
            action: config.action,
            resource: config.resource,
            resourceId: resolveResourceId(config, req, before, envelope),
            result: success ? 'success' : 'failure',
            detail: Object.keys(detail).length > 0 ? JSON.stringify(detail) : null,
            ip: maskIp(req.ip),
            userAgent: (typeof ua === 'string' ? ua : undefined)?.slice(0, 500) ?? null,
          },
        })
        .catch((err: Error) => {
          logger.error('审计落库失败（不传播，主请求不受影响）', {
            action: config.action,
            error: err.message,
          });
        });
    } catch (err) {
      logger.error('审计写入异常（不传播）', { action: config.action, error: (err as Error).message });
    }
  });
}

function resolveResourceId(
  config: AuditConfig,
  req: Request,
  before: Record<string, unknown> | null,
  envelope: Record<string, unknown>,
): string | null {
  // member 的 before.id 是 projectMember 行 id；user/project/connection 与 params.id 同值
  if (before && typeof before.id === 'string') return before.id;
  const explicit = config.getResourceId?.(req);
  if (explicit) return explicit;
  // 响应体 data.id 优先于 params：member POST 挂载在 /projects/:id/members 嵌套路径，
  // params.id 是父资源 projectId，真 id 只在响应体（projectMember 行 id）
  const data = envelope.data;
  if (isRecord(data) && typeof data.id === 'string') return data.id;
  // params 兜底仅取 params.id（decrypt-password 的 data 无 id）：不取 params.uid——
  // member 的 uid 是 userId，before 快照降级时会把 userId 误记为 resourceId（review 修复）
  const paramId = req.params.id;
  if (typeof paramId === 'string' && paramId) return paramId;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
