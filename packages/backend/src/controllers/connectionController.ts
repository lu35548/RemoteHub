// packages/backend/src/controllers/connectionController.ts
import type { Request, Response, NextFunction } from 'express';
import * as connectionService from '../services/connectionService.js';
import type { ConnectionListFilters } from '../services/connectionService.js';

function qsParam(val: unknown, fallback: string): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return fallback;
}

export async function listConnections(req: Request, res: Response, next: NextFunction) {
  try {
    const projectId = qsParam(req.query.projectId, '');
    const page = Math.max(1, parseInt(qsParam(req.query.page, '1')) || 1);
    const pageSize = parseInt(qsParam(req.query.pageSize, '20')) || 20;
    // #41 连接金矿：tags/q/sort 透传 service（只含有值键；空串归一为不传，service 侧 trim 后亦不生效；
    // 批 13b-A2 tag → tags 多值串——controller 原样透传逗号分隔串，OR 解析在 service）
    const filters: ConnectionListFilters = {};
    const tags = qsParam(req.query.tags, '');
    const q = qsParam(req.query.q, '');
    const sort = qsParam(req.query.sort, '');
    if (tags) filters.tags = tags;
    if (q) filters.q = q;
    if (sort) filters.sort = sort;
    const result = await connectionService.listConnections(
      req.user.id,
      req.user.role,
      projectId || undefined,
      page,
      pageSize,
      filters,
    );
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
}

/** #41 项目连接统计（GET /projects/:id/connections/stats，权限由 projectRoutes 的 projectRole('viewer') 门） */
export async function getProjectConnectionStats(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const data = await connectionService.getConnectionStats(id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function createConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await connectionService.createConnection(req.user.id, req.body);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function getConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const data = await connectionService.getConnection(id, req.user.id, req.user.role);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function updateConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    // #44 第 4 参透传全局角色：service 层目标项目写权校验的 admin 直通判定用
    const data = await connectionService.updateConnection(req.user.id, id, req.body, req.user.role);
    res.json({ success: true, data });
  } catch (err) { next(err); }
}

export async function deleteConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const result = await connectionService.deleteConnection(id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

/** #43 克隆连接（POST /connections/:id/clone，editor 门）：克隆即新建 → 201。
 * 密文在 service 层服务端复制；响应 detail.clonedFrom 携带来源 id
 * （审计 detail.after 经 envelope.data 自动留痕，无自定义通道）。 */
export async function cloneConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const data = await connectionService.cloneConnection(req.user.id, id);
    res.status(201).json({ success: true, data });
  } catch (err) { next(err); }
}

export async function decryptPassword(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const result = await connectionService.decryptPassword(id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

/** #45 直连分派：RDP → .rdp 文件流（Buffer 直发不落盘，不走 res.download）；
 * 命令串/URL → JSON 统一响应壳（shared LaunchJsonResponse）。
 * 文件名 RFC 5987 双写：filename* UTF-8 中文原名 + filename ASCII 兜底（非 ASCII 名降级 connection-<id>.rdp）。 */
export async function launchConnection(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params['id'];
    if (typeof id !== 'string') throw new Error('缺少 id');
    const result = await connectionService.launchConnection(id);
    if (result.type === 'rdp_file') {
      const asciiFallback = /^[\x20-\x7E]+$/.test(result.filename)
        ? result.filename.replace(/["\\]/g, '_')
        : `connection-${id}.rdp`;
      res.setHeader('Content-Type', 'application/x-rdp');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
      );
      res.send(result.body);
      return;
    }
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}
