// packages/backend/src/middleware/archivedWriteGate.ts
// 批 13b 票 A1（OQ 批 10 挂账）：归档项目连接域端点级写禁制。
// 拦截语义（lead 裁决）：目标项目 status=archived → 连接写入操作一律 409 CONN_007，
// **admin 不豁免**（「一律」语义——权限直通≠归档豁免，归档=冻结语义对全角色生效）；
// 读端点（list/get/stats/launch/decrypt-password）不拦——归档=只读展示+消费语义。
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { createAppError, type AppError } from '../utils/appError.js';
import { maskIp } from './audit.js';
import { logger } from '../utils/logger.js';

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
 * create/update/delete 三 op 依赖前置 auditMiddleware 的 res.json patch 捕获错误 envelope 落行
 * （create 拒绝行 resourceId=null；id 路由取 params.id）——**integration 实证三 op 拒绝行均落**。
 * **clone 例外（实测分裂，根因挂 OQ）**：同构路由同构 gate，clone 409 的 patch 通道实测不落行
 * （无 logger error、201 成功路径落行正常、create 裸 POST 409 落行正常）——clone 分支抛错前
 * **程序化补行**（await 落行再 throw，形状与 patch 行逐字段对齐，waitForAudit 断言同构可锁）；
 * 失败仅 logger.error 不传播（主 409 响应不受影响）。
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
        // clone 分支程序化留痕（patch 通道对 clone 409 实测不落行，见头部注释）；
        // update/delete 经 patch 通道已实证落行，程序化会双写，故仅 clone 补行
        if (op === 'clone') {
          try {
            await prisma.auditLog.create({
              data: {
                userId: req.user?.id ?? null,
                action: 'CONNECTION_CREATE', // 路由注解口径（枚举无 CLONE）
                resource: 'connection',
                resourceId: paramId,
                result: 'failure',
                detail: JSON.stringify({ reason: 'CONN_007' }),
                ip: maskIp(req.ip),
                userAgent: (typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined)?.slice(0, 500) ?? null,
              },
            });
          } catch (auditErr) {
            logger.error('归档门 clone 拒绝审计落库失败（不传播，主 409 响应不受影响）', {
              action: 'CONNECTION_CREATE',
              error: auditErr instanceof Error ? auditErr.message : String(auditErr),
            });
          }
        }
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
