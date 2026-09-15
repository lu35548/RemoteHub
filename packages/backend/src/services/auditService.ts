// packages/backend/src/services/auditService.ts
// 审计日志查询/导出：消费 P0-1 的 AuditLogQuery DTO 与分页常量。
// AuditLog 同名约定：DB 行类型一律 Prisma.* 命名空间引用（middleware/audit.ts 顶部注释先例）。
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  isAuditAction,
  isAuditResource,
  isAuditResult,
} from '@remotehub/shared';
import type {
  AuditAction,
  AuditLog,
  AuditLogDetail,
  AuditLogQuery,
  AuditResource,
  AuditResult,
} from '@remotehub/shared';
import { AppError, createAppError } from '../utils/appError.js';
import { prisma } from '../utils/prisma.js';

type AuditLogRow = Prisma.AuditLogGetPayload<Record<string, never>>;

const CSV_HEADER = 'id,action,resource,resourceId,userId,ip,userAgent,detail,createdAt';
const CSV_EXPORT_LIMIT = 10000;

/** 解析查询参数为 where 条件；无效枚举/日期抛 AUDIT_001。 */
function buildWhere(q: Partial<AuditLogQuery>): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (q.userId) where.userId = q.userId;
  if (q.action) {
    if (!isAuditAction(q.action)) throw createAppError('AUDIT_001');
    where.action = q.action;
  }
  if (q.resource) {
    if (!isAuditResource(q.resource)) throw createAppError('AUDIT_001');
    where.resource = q.resource;
  }
  if (q.result) {
    if (!isAuditResult(q.result)) throw createAppError('AUDIT_001');
    where.result = q.result;
  }

  const createdAt: Prisma.DateTimeFilter = {};
  if (q.startDate) createdAt.gte = parseDate(q.startDate);
  if (q.endDate) createdAt.lte = parseEndDate(q.endDate);
  if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;

  return where;
}

function parseDate(value: string): Date {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw createAppError('AUDIT_001');
  return d;
}

/** date-only（YYYY-MM-DD）的 endDate 按当天末尾截止，避免漏掉当天数据。 */
function parseEndDate(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T23:59:59.999Z`);
    if (Number.isNaN(d.getTime())) throw createAppError('AUDIT_001');
    return d;
  }
  return parseDate(value);
}

/** DB 行 → shared AuditLog DTO：detail JSON 宽容解析（非法 JSON 落 null）。 */
/** 批量取操作人 username 映射（id→username）：列表/仪表盘 DTO join 共用（P0-9 审计页复用） */
export async function fetchUsernameMap(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, username: true },
  });
  return new Map(users.map((u) => [u.id, u.username]));
}

export function toDTO(row: AuditLogRow, username: string | null): AuditLog {
  let detail: AuditLogDetail | null = null;
  if (row.detail) {
    try {
      const parsed: unknown = JSON.parse(row.detail);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        detail = parsed as AuditLogDetail;
      }
    } catch {
      detail = null;
    }
  }

  return {
    id: row.id,
    username,
    userId: row.userId,
    action: row.action as AuditAction,
    resource: row.resource as AuditResource,
    resourceId: row.resourceId,
    result: row.result as AuditResult,
    detail,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function queryAuditLogs(q: AuditLogQuery): Promise<{
  data: AuditLog[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const page = Math.max(1, Math.trunc(q.page ?? 1));
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.trunc(q.pageSize ?? DEFAULT_PAGE_SIZE)));
  const where = buildWhere(q);

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: pageSize,
    skip: (page - 1) * pageSize,
  });
  const total = await prisma.auditLog.count({ where });

  // 操作人 username 批量 join（去重 userId；行→DTO 时按 id 取名，查不到兜底 null）
  const userIds = [...new Set(rows.map((r) => r.userId).filter((v): v is string => v !== null))];
  const nameById = await fetchUsernameMap(userIds);

  return {
    data: rows.map((r) => toDTO(r, r.userId === null ? null : nameById.get(r.userId) ?? null)),
    total,
    page,
    pageSize,
  };
}

export async function exportAuditLogsCsv(q: Omit<AuditLogQuery, 'page' | 'pageSize'>): Promise<string> {
  try {
    const where = buildWhere(q);
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: CSV_EXPORT_LIMIT, // 上限 10000 条截断
    });

    const lines: string[] = [CSV_HEADER];
    for (const row of rows) {
      lines.push(
        [
          row.id,
          row.action,
          row.resource,
          row.resourceId ?? '',
          row.userId ?? '',
          row.ip ?? '',
          row.userAgent ?? '',
          row.detail ?? '',
          row.createdAt.toISOString(),
        ]
          .map(csvEscape)
          .join(','),
      );
    }
    return lines.join('\n');
  } catch (err) {
    if (err instanceof AppError) throw err; // AUDIT_001 等业务错误透传
    throw createAppError('AUDIT_002'); // 导出过程非预期失败包装
  }
}

/** CSV 值转义：含逗号/引号/换行的值用引号包裹，内部引号翻倍（RFC 4180）。 */
function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
