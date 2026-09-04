// packages/backend/src/controllers/auditController.ts
import type { NextFunction, Request, Response } from 'express';
import type { AuditAction, AuditLogQuery, AuditResource, AuditResult } from '@remotehub/shared';
import { exportAuditLogsCsv, queryAuditLogs } from '../services/auditService.js';
import { qsParam } from '../utils/qs.js';

/** query string → AuditLogQuery（空串不设置，数值 NaN 不设置，service 层负责校验与 clamp）。 */
function parseAuditQuery(req: Request, omitPagination = false): AuditLogQuery {
  const q: AuditLogQuery = {};

  const userId = qsParam(req.query.userId, '');
  if (userId) q.userId = userId;
  const action = qsParam(req.query.action, '');
  if (action) q.action = action as AuditAction;
  const resource = qsParam(req.query.resource, '');
  if (resource) q.resource = resource as AuditResource;
  const result = qsParam(req.query.result, '');
  if (result) q.result = result as AuditResult;
  const startDate = qsParam(req.query.startDate, '');
  if (startDate) q.startDate = startDate;
  const endDate = qsParam(req.query.endDate, '');
  if (endDate) q.endDate = endDate;

  if (!omitPagination) {
    const page = Number.parseInt(qsParam(req.query.page, ''), 10);
    if (!Number.isNaN(page)) q.page = page;
    const pageSize = Number.parseInt(qsParam(req.query.pageSize, ''), 10);
    if (!Number.isNaN(pageSize)) q.pageSize = pageSize;
  }

  return q;
}

export async function listAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const { data, total, page, pageSize } = await queryAuditLogs(parseAuditQuery(req));
    res.json({ success: true, data, pagination: { page, pageSize, total } });
  } catch (err) {
    next(err);
  }
}

export async function exportAuditLogs(req: Request, res: Response, next: NextFunction) {
  try {
    const csv = await exportAuditLogsCsv(parseAuditQuery(req, true));
    const datestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${datestamp}.csv"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}
