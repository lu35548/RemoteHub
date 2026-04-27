// packages/backend/src/services/projectService.ts
import { prisma } from '../utils/prisma.js';
import { createAppError, handlePrismaUniqueViolation } from '../utils/appError.js';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, validateProjectName } from '@remotehub/shared';

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

/** 项目列表 §4 — admin 全部，非 admin 已加入 */
export async function listProjects(userId: string, userRole: string, page: number = 1, pageSize: number = DEFAULT_PAGE_SIZE) {
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  const where = userRole === 'admin'
    ? {}
    : { members: { some: { userId } } };

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      select: {
        id: true, name: true, icon: true,
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

/** 创建项目（事务：项目 + owner）§4.2, §5.1 */
export async function createProject(userId: string, data: { name: string; description?: string; icon?: string }) {
  const v = validateProjectName(data.name);
  if (!v.valid) throw createAppError('VAL_001', [{ field: 'name', message: v.message }]);

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
  if (data.name !== undefined) {
    const v = validateProjectName(data.name);
    if (!v.valid) throw createAppError('VAL_001', [{ field: 'name', message: v.message }]);
  }

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
    if (error instanceof Error && (error as any).code === 'P2025') {
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
    if (error instanceof Error && (error as any).code === 'P2025') {
      throw createAppError('PROJ_002');
    }
    throw error;
  }
}

function toProjectDetail(p: {
  id: string; name: string; description: string | null; icon: string;
  createdBy: string; updatedBy: string; createdAt: Date; updatedAt: Date;
}, userMap: UserRefMap) {
  return {
    id: p.id, name: p.name, description: p.description, icon: p.icon,
    createdBy: getUserRef(userMap, p.createdBy),
    updatedBy: getUserRef(userMap, p.updatedBy),
    createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
  };
}
