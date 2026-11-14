// packages/backend/src/middleware/archivedWriteGate.ts
// 批 13b 票 A1（OQ 批 10 挂账）：归档项目连接域端点级写禁制。
// 拦截语义（lead 裁决）：目标项目 status=archived → 连接写入操作一律 409 CONN_007，
// **admin 不豁免**（「一律」语义——权限直通≠归档豁免，归档=冻结语义对全角色生效）；
// 读端点（list/get/stats/launch/decrypt-password）不拦——归档=只读展示+消费语义。
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { createAppError, type AppError } from '../utils/appError.js';

/** 拒绝响应与审计行的原因对位信息（AppError details → 响应 error.details；审计行 reason=CONN_007） */
function archivedReject(projectId: string): AppError {
  return createAppError('CONN_007', [{ field: 'projectId', message: projectId }]);
}

/** 项目状态查询（缺失项目不拦——存在性语义维持现状，gate 只管 archived 判定） */
async function projectStatusOf(projectId: string): Promise<string | undefined> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { status: true } });
  return p?.status;
}

/** 连接及其所属项目状态（连接不存在返回 undefined——存在性由 role 门/ service 数据边界负责） */
async function connectionWithProjectStatus(connectionId: string): Promise<{ projectId: string; status?: string } | undefined> {
  const conn = await prisma.connection.findUnique({
    where: { id: connectionId },
    select: { projectId: true, project: { select: { status: true } } },
  });
  if (!conn) return undefined;
  return { projectId: conn.projectId, status: conn.project?.status };
}

export type ArchivedGateOp = 'create' | 'update' | 'delete' | 'clone';

/**
 * 归档项目连接写禁制门（与 projectRoleMiddleware 同构的路由级策略门，挂其**之后**：
 * 先权限后状态——无权限者 403 不泄露项目归档状态，有权限者才进入 409 状态判定）。
 *
 * 各操作检查面：
 * - create：body.projectId → 项目 archived → 拒；
 * - update：连接当前项目（源侧）archived → 拒；body.projectId 显式且 ≠ 当前 → 目标项目 archived → 拒；
 *   body.requiredVpnId 显式 truthy → 依赖 VPN 所在项目 archived → 拒（依赖侧；防御性显式检查——
 *   现状 validateVpnDependency 同项目约束使该侧被项目侧检查传递覆盖，此处不依赖该传递性，
 *   未来约束放松时不静默失守）；
 * - delete / clone：连接所属项目 archived → 拒。
 *
 * 审计留痕（import 403 留痕先例的意图复用）：被拒写操作落 failure 审计行（reason=CONN_007）。
 * **不程序化双写**——connection 四写路由的 auditMiddleware 挂在本门之前，res.json patch 捕获
 * 全局 error handler 的错误 envelope 自动落行（detail.reason=CONN_007，resourceId 对 id 路由
 * 取 params.id）；import 路由需程序化是因为其根本未挂 auditMiddleware，此处通道已存在，
 * 双写只会污染审计轨迹。create 拒绝行 resourceId=null（连接实体尚不存在）。
 */
export function archivedProjectWriteGate(op: ArchivedGateOp): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (op === 'create') {
        const projectId = typeof req.body?.projectId === 'string' ? req.body.projectId : undefined;
        if (projectId && (await projectStatusOf(projectId)) === 'archived') {
          throw archivedReject(projectId);
        }
        // 依赖侧：显式依赖指向归档项目 VPN 亦拒（同 update 依赖侧语义）
        const requiredVpnId = typeof req.body?.requiredVpnId === 'string' && req.body.requiredVpnId !== ''
          ? req.body.requiredVpnId : undefined;
        if (requiredVpnId) {
          const vpn = await connectionWithProjectStatus(requiredVpnId);
          if (vpn?.status === 'archived') {
            throw archivedReject(vpn.projectId);
          }
        }
        next();
        return;
      }

      // id 路由三形态：连接所属项目（源侧）为公共检查面
      const paramId = typeof req.params.id === 'string' ? req.params.id : undefined;
      if (!paramId) {
        next();
        return;
      }
      const conn = await connectionWithProjectStatus(paramId);
      if (!conn) {
        next(); // 连接不存在：维持现状语义（非 admin 已被 role 门拦为 403；admin 落 service CONN_002 404）
        return;
      }
      if (conn.status === 'archived') {
        throw archivedReject(conn.projectId);
      }

      if (op === 'update') {
        // 目标侧：显式换项目（#44 语义——显式传且 ≠ 当前值才算移动，同值/缺省不触发）
        const targetProjectId = typeof req.body?.projectId === 'string' ? req.body.projectId : undefined;
        if (targetProjectId && targetProjectId !== conn.projectId
          && (await projectStatusOf(targetProjectId)) === 'archived') {
          throw archivedReject(targetProjectId);
        }
        // 依赖侧：显式设置依赖（显式传 null/缺省不触发——清依赖与不动依赖均无新增引用语义）
        const requiredVpnId = typeof req.body?.requiredVpnId === 'string' && req.body.requiredVpnId !== ''
          ? req.body.requiredVpnId : undefined;
        if (requiredVpnId) {
          const vpn = await connectionWithProjectStatus(requiredVpnId);
          if (vpn?.status === 'archived') {
            throw archivedReject(vpn.projectId);
          }
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
