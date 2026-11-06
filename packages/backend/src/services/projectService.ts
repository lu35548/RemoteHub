// packages/backend/src/services/projectService.ts
import { prisma } from '../utils/prisma.js';
import { createAppError, handlePrismaUniqueViolation, hasErrorCode } from '../utils/appError.js';
import { logger } from '../utils/logger.js';
import { emitToProjectMembers } from './notificationService.js';
import { maskIp } from '../middleware/audit.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, validateProjectName, validateDescription, validateIcon } from '@remotehub/shared';

// ─── 用户关联解析 ───

type UserRef = { id: string; nickname: string };
type UserRefMap = Map<string, UserRef>;

async function resolveUserRefs(ids: string[]): Promise<UserRefMap> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, nickname: true },
  });
  return new Map(users.map(u => [u.id, { id: u.id, nickname: u.nickname }]));
}

function getUserRef(userMap: UserRefMap, id: string): UserRef {
  return userMap.get(id) ?? { id, nickname: '已删除用户' };
}

/** 项目列表 §4 — admin 全部，非 admin 已加入。
 * #47 归档过滤：缺省/false=仅 active（默认列表不显归档）；archived=true=仅归档项目（归档视图专用）。 */
export async function listProjects(userId: string, userRole: string, page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE, archived: boolean = false) {
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  const where = {
    status: archived ? 'archived' : 'active',
    ...(userRole === 'admin' ? {} : { members: { some: { userId } } }),
  };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      select: {
        id: true, name: true, icon: true, status: true,
        createdBy: true, updatedBy: true,
        createdAt: true, updatedAt: true,
        members: { where: { userId }, select: { role: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.project.count({ where }),
  ]);

  // 附加 currentUserRole + 解析用户引用
  const userIds = projects.flatMap(p => [p.createdBy, p.updatedBy]).filter(Boolean) as string[];
  const userMap = await resolveUserRefs(userIds);

  const data = projects.map((p) => {
    const { members, ...rest } = p;
    return {
      ...rest,
      currentUserRole: members[0]?.role ?? null,
      createdBy: getUserRef(userMap, p.createdBy),
      updatedBy: getUserRef(userMap, p.updatedBy),
    };
  });

  return { data, pagination: { page, pageSize, total } };
}

/** 校验项目字段（name/description/icon；undefined 跳过，createProject 传必填 name）§4 */
function validateProjectFields(data: { name?: string; description?: string; icon?: string }) {
  if (data.name !== undefined) {
    const v = validateProjectName(data.name);
    if (!v.valid) throw createAppError('VAL_001', [{ field: 'name', message: v.message }]);
  }
  if (data.description !== undefined) {
    const vd = validateDescription(data.description);
    if (!vd.valid) throw createAppError('VAL_001', [{ field: 'description', message: vd.message }]);
  }
  if (data.icon !== undefined) {
    const vi = validateIcon(data.icon);
    if (!vi.valid) throw createAppError('VAL_001', [{ field: 'icon', message: vi.message }]);
  }
}

/** 创建项目（事务：项目 + owner）§4.2, §5.1 */
export async function createProject(userId: string, data: { name: string; description?: string; icon?: string }) {
  validateProjectFields({ name: data.name, description: data.description, icon: data.icon });

  try {
    const project = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: data.name,
          description: data.description || null,
          icon: data.icon || 'folder',
          createdBy: userId,
          updatedBy: userId,
        },
      });

      await tx.projectMember.create({
        data: { projectId: project.id, userId, role: 'owner' },
      });

      return project;
    });

    const userMap = await resolveUserRefs([project.createdBy, project.updatedBy]);
    return toProjectDetail(project, userMap);
  } catch (error) {
    await handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** 项目详情 §4.1 */
export async function getProject(projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw createAppError('PROJ_002');
  const userMap = await resolveUserRefs([project.createdBy, project.updatedBy]);
  return toProjectDetail(project, userMap);
}

/** 更新项目 §4 */
export async function updateProject(userId: string, projectId: string, data: { name?: string; description?: string; icon?: string }) {
  validateProjectFields(data);

  try {
    const project = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.icon !== undefined && { icon: data.icon }),
        updatedBy: userId,
      },
    });
    const userMap = await resolveUserRefs([project.createdBy, project.updatedBy]);
    return toProjectDetail(project, userMap);
  } catch (error) {
    if (hasErrorCode(error, 'P2025')) {
      throw createAppError('PROJ_002');
    }
    await handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** 删除项目 §4.2 */
export async function deleteProject(projectId: string) {
  try {
    await prisma.project.delete({ where: { id: projectId } });
    return { id: projectId };
  } catch (error) {
    if (hasErrorCode(error, 'P2025')) {
      throw createAppError('PROJ_002');
    }
    throw error;
  }
}

function toProjectDetail(p: {
  id: string; name: string; description: string | null; icon: string; status: string;
  createdBy: string; updatedBy: string; createdAt: Date; updatedAt: Date;
}, userMap: UserRefMap) {
  return {
    id: p.id, name: p.name, description: p.description, icon: p.icon, status: p.status,
    createdBy: getUserRef(userMap, p.createdBy),
    updatedBy: getUserRef(userMap, p.updatedBy),
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
  };
}

// ─── #47 项目管理增强：归档/恢复/复制/转让/批量归档 ───

/** status 值域（spec §12：active/archived 纯 string，SQLite 方言禁 VarChar） */
type ProjectStatus = 'active' | 'archived';

/** 归档/恢复（写权=owner+admin，design §17；权限拒绝由路由 projectRole('owner') 短路，本函数只管数据边界）。
 * 已归档再归档 / 已 active 再恢复 = 幂等成功（status 原样写回）。 */
async function setProjectStatus(userId: string, projectId: string, status: ProjectStatus) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw createAppError('PROJ_002');
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: { status, updatedBy: userId },
  });
  const userMap = await resolveUserRefs([updated.createdBy, updated.updatedBy]);
  return toProjectDetail(updated, userMap);
}

export async function archiveProject(userId: string, projectId: string) {
  return setProjectStatus(userId, projectId, 'archived');
}

export async function restoreProject(userId: string, projectId: string) {
  return setProjectStatus(userId, projectId, 'active');
}

/** 复制项目（design §10 深拷贝：项目 + 全部连接密文服务端**原样复制不重加密**；成员不复制，产出 owner=操作者；
 * 改名「X (副本)」递增避 Project.name @unique（connectionService.resolveCloneName 同款语义，scope 全表）。
 * 副本恒 active（复制归档项目=变相恢复语义，裁量记录在案）。连接内 VPN 依赖重映射到副本内对应连接（自包含深拷贝）。 */
export async function copyProject(userId: string, projectId: string) {
  const original = await prisma.project.findUnique({ where: { id: projectId } });
  if (!original) throw createAppError('PROJ_002');

  // 改名递增（Project.name @unique 全表避让）：「X」→「X (副本)」→「X (副本) 2」…
  const base = `${original.name} (副本)`;
  const siblings = await prisma.project.findMany({ where: { name: { startsWith: base } }, select: { name: true } });
  const names = new Set(siblings.map((s) => s.name));
  let name: string;
  if (!names.has(base)) {
    name = base;
  } else {
    let n = 2;
    while (names.has(`${base} ${n}`)) n++;
    name = `${base} ${n}`;
  }
  // 超长校验（复制语义下唯一新生成字段，cloneConnection 先例同款口径）
  const vName = validateProjectName(name);
  if (!vName.valid) throw createAppError('VAL_001', [{ field: 'name', message: vName.message }]);

  const result = await prisma.$transaction(async (tx) => {
    const copy = await tx.project.create({
      data: {
        name, description: original.description, icon: original.icon,
        status: 'active',
        createdBy: userId, updatedBy: userId,
      },
    });
    await tx.projectMember.create({
      data: { projectId: copy.id, userId, role: 'owner' },
    });

    // 趟 1：深拷贝全部连接（密文原样复制；lastAccessed 不继承——新连接从未访问；
    // requiredVpnId 暂保留原值，趟 2 对同项目内依赖重映射）
    const conns = await tx.connection.findMany({ where: { projectId } });
    const idMap = new Map<string, string>();
    for (const c of conns) {
      const created = await tx.connection.create({
        data: {
          projectId: copy.id,
          name: c.name, host: c.host, port: c.port, username: c.username,
          encryptedPass: c.encryptedPass,
          protocol: c.protocol, vpnType: c.vpnType, vpnLoginUrl: c.vpnLoginUrl,
          requiredVpnId: c.requiredVpnId,
          notes: c.notes, tags: c.tags,
          lastAccessed: null,
          createdBy: userId, updatedBy: userId,
        },
      });
      idMap.set(c.id, created.id);
    }
    // 趟 2：同项目内 VPN 依赖重映射（跨项目依赖 idMap 无键即保留原值，不动）
    for (const c of conns) {
      if (c.requiredVpnId) {
        const mapped = idMap.get(c.requiredVpnId);
        if (mapped) {
          await tx.connection.update({
            where: { id: idMap.get(c.id) },
            data: { requiredVpnId: mapped },
          });
        }
      }
    }

    return { copy, connectionCount: conns.length };
  });

  const userMap = await resolveUserRefs([result.copy.createdBy, result.copy.updatedBy]);
  // clonedFrom 进响应体 → auditMiddleware detail.after 自动携带（connectionService.cloneConnection 先例）
  return {
    ...toProjectDetail(result.copy, userMap),
    clonedFrom: projectId,
    connectionCount: result.connectionCount,
  };
}

/** 转让所有权（design §10：owner 变更、原 owner 降 editor——MEMBER_ROLES 无 admin）。
 * 权限门=路由 projectRole('owner')（owner 或全局 admin 短路）。专用事务：**先升新 owner 后降原 owner**——
 * 降级执行时 owner count 已为 2，天然绕开 updateMemberRole 的 last-owner 保护 MEMBER_002
 * （若复用 updateMemberRole 逐角色变更，唯一 owner 先降会直接被拦）。 */
export async function transferProjectOwnership(projectId: string, newOwnerUserId: string) {
  if (typeof newOwnerUserId !== 'string' || newOwnerUserId.length === 0) {
    throw createAppError('VAL_001', [{ field: 'userId', message: 'userId 不能为空' }]);
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw createAppError('PROJ_002');

  const { fromUserId } = await prisma.$transaction(async (tx) => {
    // 目标必须是项目现有成员（转让=项目内交付，不造外部 owner）
    const target = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: newOwnerUserId } },
    });
    if (!target) throw createAppError('MEMBER_001');
    if (target.role === 'owner') {
      throw createAppError('VAL_001', [{ field: 'userId', message: '不能转让给当前 owner' }]);
    }

    // 当前 owner（正常恒 1 行；多 owner 数据异常时取最早加入者，操作仍安全）
    const currentOwner = await tx.projectMember.findFirst({
      where: { projectId, role: 'owner' },
      orderBy: { addedAt: 'asc' },
    });
    if (!currentOwner) throw createAppError('MEMBER_001');

    // 先升后降（顺序即 last-owner 边界的兑现证据）
    await tx.projectMember.update({ where: { id: target.id }, data: { role: 'owner' } });
    await tx.projectMember.update({ where: { id: currentOwner.id }, data: { role: 'editor' } });

    return { fromUserId: currentOwner.userId };
  });

  // 通知双发（事务外 fire-and-forget，memberService 先例：失败只记日志不破主流程）
  void emitToProjectMembers(projectId, {
    type: 'MEMBER_ROLE_UPDATED',
    payload: { projectId, userId: newOwnerUserId, role: 'owner' },
  }).catch((err: Error) => logger.error('转让通知（新 owner）下发失败（不传播）', { projectId, userId: newOwnerUserId, error: err.message }));
  void emitToProjectMembers(projectId, {
    type: 'MEMBER_ROLE_UPDATED',
    payload: { projectId, userId: fromUserId, role: 'editor' },
  }).catch((err: Error) => logger.error('转让通知（原 owner 降 editor）下发失败（不传播）', { projectId, userId: fromUserId, error: err.message }));

  return { projectId, fromUserId, toUserId: newOwnerUserId };
}

/** 批量归档上限（对齐 design §10 批量语义 ≤50——members/batch 同源口径） */
const BATCH_ARCHIVE_MAX = 50;

export interface BatchArchiveParams {
  operatorUserId: string;
  operatorRole: string;
  ip?: string;
  userAgent?: string;
  ids: unknown;
}

export interface BatchArchiveResult {
  archived: string[];
  skipped: string[]; // 无权 / 不存在 / 已归档（幂等跳过）——不区分原因，避免响应体膨胀
}

/** 批量归档（body { ids: string[] }，尽力而为语义：无权/不存在/已归档逐项 skipped，不整体 404）。
 * 权限逐项目判定（design §17 batch=owner+admin：全局 admin 直通，否则须该项目 owner）。
 * 审计逐项目落行——middleware envelope 通道单请求只能落一行，无法逐项目 resourceId；
 * 程序化写入形状对齐 auditMiddleware.writeAuditLog（ip 掩码 / detail JSON / result success），事务内原子。 */
export async function batchArchiveProjects(params: BatchArchiveParams): Promise<BatchArchiveResult> {
  const { operatorUserId, operatorRole, ip, userAgent, ids } = params;
  if (
    !Array.isArray(ids) || ids.length === 0 || ids.length > BATCH_ARCHIVE_MAX ||
    ids.some((id) => typeof id !== 'string')
  ) {
    throw createAppError('VAL_001', [{ field: 'ids', message: `ids 须为 1-${BATCH_ARCHIVE_MAX} 个项目 id 的数组` }]);
  }

  const uniqueIds = [...new Set(ids as string[])];
  const archived: string[] = [];
  const skipped: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const id of uniqueIds) {
      const project = await tx.project.findUnique({ where: { id } });
      if (!project) {
        skipped.push(id);
        continue;
      }
      if (operatorRole !== 'admin') {
        const member = await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId: id, userId: operatorUserId } },
        });
        if (!member || member.role !== 'owner') {
          skipped.push(id);
          continue;
        }
      }
      if (project.status === 'archived') {
        skipped.push(id); // 幂等跳过（零重复审计行）
        continue;
      }
      await tx.project.update({
        where: { id },
        data: { status: 'archived', updatedBy: operatorUserId },
      });
      await tx.auditLog.create({
        data: {
          userId: operatorUserId,
          action: 'PROJECT_ARCHIVE',
          resource: 'project',
          resourceId: id,
          result: 'success',
          detail: JSON.stringify({ after: { status: 'archived', batch: true } }),
          ip: maskIp(ip) ?? null,
          userAgent: userAgent?.slice(0, 500) ?? null,
        },
      });
      archived.push(id);
    }
  });

  return { archived, skipped };
}
