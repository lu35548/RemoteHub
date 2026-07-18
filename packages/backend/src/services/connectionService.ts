// packages/backend/src/services/connectionService.ts
import { prisma } from '../utils/prisma.js';
import type { Prisma } from '@prisma/client';
import { createAppError, handlePrismaUniqueViolation } from '../utils/appError.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import {
  validateConnectionName, validateHost, validatePort,
  validateProtocol, validateVpnType, validateTags,
  validateNotes, validateVpnLoginUrl,
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
} from '@remotehub/shared';

// ─── lastAccessed 节流 ───

const lastAccessedUpdates = new Map<string, number>();
const LAST_ACCESSED_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

// ─── Types ───

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

interface ConnectionCreateData {
  projectId: string;
  name: string;
  host: string;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  protocol: string;
  vpnType?: string | null;
  vpnLoginUrl?: string | null;
  requiredVpnId?: string | null;
  notes?: string | null;
  tags?: string | null;
}

interface ConnectionUpdateData {
  name?: string;
  host?: string;
  port?: number | null;
  username?: string | null;
  password?: string | null | undefined;
  protocol?: string;
  vpnType?: string | null;
  vpnLoginUrl?: string | null;
  requiredVpnId?: string | null;
  notes?: string | null;
  tags?: string | null;
}

// ─── Public Functions ───

/** 连接列表 — admin 全部，非 admin 已加入项目的连接 */
export async function listConnections(
  userId: string,
  userRole: string,
  projectId?: string,
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE,
) {
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  const projectFilter = projectId ? { projectId } : {};

  const where = userRole === 'admin'
    ? projectFilter
    : { ...projectFilter, project: { members: { some: { userId } } } };

  const [connections, total] = await Promise.all([
    prisma.connection.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.connection.count({ where }),
  ]);

  const userIds = connections.flatMap(c => [c.createdBy, c.updatedBy]).filter(Boolean) as string[];
  const userMap = await resolveUserRefs(userIds);

  return { data: connections.map(c => mapToListItem(c, userMap)), pagination: { page, pageSize, total } };
}

/** 创建连接 */
export async function createConnection(userId: string, data: ConnectionCreateData) {
  // 验证字段
  validateConnectionFields(data);

  // password 长度校验 §3.1（加密前，防超长导致存储溢出）
  if (data.password && data.password.length > 200) {
    throw createAppError('VAL_001', [{ field: 'password', message: '密码长度不能超过 200 字符' }]);
  }

  // VPN 一致性检查
  validateVpnConsistency(data.protocol, data);

  // VPN 依赖检查
  if (data.requiredVpnId) {
    await validateVpnDependency(data.requiredVpnId, data.projectId);
  }

  // 构建创建数据
  const createData: Prisma.ConnectionUncheckedCreateInput = {
    projectId: data.projectId,
    name: data.name,
    host: data.host,
    port: data.port ?? null,
    username: data.username ?? null,
    encryptedPass: data.password ? encrypt(data.password) : null,
    protocol: data.protocol,
    vpnType: data.protocol === 'VPN' ? (data.vpnType ?? null) : null,
    vpnLoginUrl: data.protocol === 'VPN' ? (data.vpnLoginUrl ?? null) : null,
    requiredVpnId: data.requiredVpnId ?? null,
    notes: data.notes ?? null,
    tags: data.tags ?? null,
    createdBy: userId,
    updatedBy: userId,
  };

  try {
    const connection = await prisma.connection.create({ data: createData });
    const userMap = await resolveUserRefs([connection.createdBy, connection.updatedBy]);
    return toDetail(connection, false, userMap);
  } catch (error) {
    await handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** 连接详情 */
export async function getConnection(connectionId: string, userId: string, userGlobalRole: string) {
  const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!connection) throw createAppError('CONN_002');

  // 决定是否返回 encryptedPass：admin 全权；否则按项目角色（owner/editor 可见，viewer 不可）§4.2
  let includeEncryptedPass: boolean;
  if (userGlobalRole === 'admin') {
    includeEncryptedPass = true;
  } else {
    const member = await prisma.projectMember.findUnique({
      where: { projectId_userId: { projectId: connection.projectId, userId } },
    });
    includeEncryptedPass = member?.role === 'owner' || member?.role === 'editor';
  }

  // C5: lastAccessed 节流更新
  const now = Date.now();
  const lastUpdate = lastAccessedUpdates.get(connectionId);
  if (!lastUpdate || now - lastUpdate > LAST_ACCESSED_THROTTLE_MS) {
    lastAccessedUpdates.set(connectionId, now);
    prisma.connection.update({
      where: { id: connectionId },
      data: { lastAccessed: new Date() },
    }).catch(() => {}); // fire-and-forget
  }

  const userMap = await resolveUserRefs([connection.createdBy, connection.updatedBy]);
  return toDetail(connection, includeEncryptedPass, userMap);
}

/** 更新连接 */
export async function updateConnection(userId: string, connectionId: string, data: ConnectionUpdateData) {
  // 获取当前连接
  const current = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!current) throw createAppError('CONN_002');

  // 白名单过滤并构建 update payload
  const fields = new Set(['name', 'host', 'port', 'username', 'password', 'protocol', 'vpnType', 'vpnLoginUrl', 'requiredVpnId', 'notes', 'tags']);
  const updatePayload: Prisma.ConnectionUncheckedUpdateInput = {};
  for (const [key, value] of Object.entries(data)) {
    if (fields.has(key)) {
      (updatePayload as Record<string, unknown>)[key] = value;
    }
  }

  // 合并已有数据用于验证
  const merged = {
    name: (updatePayload.name as string | undefined) ?? current.name,
    host: (updatePayload.host as string | undefined) ?? current.host,
    port: updatePayload.port !== undefined ? updatePayload.port as number | null : current.port,
    protocol: (updatePayload.protocol as string | undefined) ?? current.protocol,
    vpnType: updatePayload.vpnType !== undefined ? updatePayload.vpnType as string | null : current.vpnType,
    tags: updatePayload.tags !== undefined ? updatePayload.tags as string | null : current.tags,
    notes: updatePayload.notes !== undefined ? updatePayload.notes as string | null : current.notes,
    vpnLoginUrl: updatePayload.vpnLoginUrl !== undefined ? updatePayload.vpnLoginUrl as string | null : current.vpnLoginUrl,
  };

  // 验证字段
  validateConnectionFields(merged);

  // VPN 一致性检查
  validateVpnConsistency(merged.protocol, {
    vpnType: merged.vpnType,
    requiredVpnId: updatePayload.requiredVpnId !== undefined ? updatePayload.requiredVpnId as string | null : current.requiredVpnId,
  });

  // protocol 非 VPN → 强制 vpn 字段为 null §3.1（含 VPN→非VPN 降级：先查 dependents）
  if (merged.protocol !== 'VPN') {
    if (current.protocol === 'VPN') {
      // 降级（VPN→非VPN）：检查 dependents + 清所有 VPN 字段
      const dependents = await prisma.connection.count({
        where: { requiredVpnId: connectionId },
      });
      if (dependents > 0) {
        throw createAppError('CONN_004');
      }
      updatePayload.vpnType = null;
      updatePayload.vpnLoginUrl = null;
      updatePayload.requiredVpnId = null;
    } else {
      // 非降级（非VPN→非VPN）：只清 vpnType/vpnLoginUrl，requiredVpnId 保留（非 VPN 可依赖 VPN）
      updatePayload.vpnType = null;
      updatePayload.vpnLoginUrl = null;
    }
  }

  // VPN 依赖检查
  const vpnId = updatePayload.requiredVpnId !== undefined ? updatePayload.requiredVpnId as string | null : current.requiredVpnId;
  if (vpnId) {
    await validateVpnDependency(vpnId, current.projectId, connectionId);
  }

  // 密码处理
  if ('password' in updatePayload) {
    const pw = updatePayload.password;
    if (pw === null || pw === '') {
      updatePayload.encryptedPass = null;
    } else if (typeof pw === 'string') {
      if (pw.length > 200) throw createAppError('VAL_001', [{ field: 'password', message: '密码长度不能超过 200 字符' }]);
      updatePayload.encryptedPass = encrypt(pw);
    }
    delete updatePayload.password;
  }

  // 构建 update data（只包含有变化的字段）
  const updateData: Prisma.ConnectionUncheckedUpdateInput = { ...updatePayload, updatedBy: userId };

  try {
    const connection = await prisma.connection.update({
      where: { id: connectionId },
      data: updateData,
    });
    const userMap = await resolveUserRefs([connection.createdBy, connection.updatedBy]);
    return toDetail(connection, false, userMap);
  } catch (error) {
    if (error instanceof Error && (error as unknown as { code: string }).code === 'P2025') {
      throw createAppError('CONN_002');
    }
    await handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** 删除连接 */
export async function deleteConnection(connectionId: string) {
  // VPN 删除保护
  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    include: { dependents: { select: { id: true } } },
  });

  if (!connection) throw createAppError('CONN_002');

  if (connection.protocol === 'VPN' && connection.dependents.length > 0) {
    throw createAppError('CONN_004');
  }

  await prisma.connection.delete({ where: { id: connectionId } });
  return { id: connectionId };
}

/** 解密密码 */
export async function decryptPassword(connectionId: string) {
  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    select: { encryptedPass: true },
  });
  if (!connection) throw createAppError('CONN_002');

  // C5: lastAccessed 节流更新
  const now = Date.now();
  const lastUpdate = lastAccessedUpdates.get(connectionId);
  if (!lastUpdate || now - lastUpdate > LAST_ACCESSED_THROTTLE_MS) {
    lastAccessedUpdates.set(connectionId, now);
    prisma.connection.update({
      where: { id: connectionId },
      data: { lastAccessed: new Date() },
    }).catch(() => {}); // fire-and-forget
  }

  if (!connection.encryptedPass) {
    return { password: '' };
  }
  return { password: decrypt(connection.encryptedPass) };
}

// ─── Private Helpers ───

function validateConnectionFields(data: {
  name: string;
  host: string;
  port?: number | null;
  protocol: string;
  vpnType?: string | null;
  vpnLoginUrl?: string | null;
  tags?: string | null;
  notes?: string | null;
}) {
  const errors: Array<{ field: string; message: string }> = [];

  const vName = validateConnectionName(data.name);
  if (!vName.valid) errors.push({ field: 'name', message: vName.message });

  const vHost = validateHost(data.host);
  if (!vHost.valid) errors.push({ field: 'host', message: vHost.message });

  const vPort = validatePort(data.port ?? null);
  if (!vPort.valid) errors.push({ field: 'port', message: vPort.message });

  const vProtocol = validateProtocol(data.protocol);
  if (!vProtocol.valid) errors.push({ field: 'protocol', message: vProtocol.message });

  if (data.vpnType !== undefined) {
    const vVpnType = validateVpnType(data.vpnType);
    if (!vVpnType.valid) errors.push({ field: 'vpnType', message: vVpnType.message });
  }

  if (data.tags !== undefined) {
    const vTags = validateTags(data.tags);
    if (!vTags.valid) errors.push({ field: 'tags', message: vTags.message });
  }

  if (data.notes !== undefined) {
    const vNotes = validateNotes(data.notes);
    if (!vNotes.valid) errors.push({ field: 'notes', message: vNotes.message });
  }
  if (data.vpnLoginUrl !== undefined) {
    const vUrl = validateVpnLoginUrl(data.vpnLoginUrl);
    if (!vUrl.valid) errors.push({ field: 'vpnLoginUrl', message: vUrl.message });
  }

  if (errors.length > 0) {
    throw createAppError('VAL_001', errors);
  }
}

function validateVpnConsistency(
  protocol: string,
  data: { vpnType?: string | null; requiredVpnId?: string | null },
) {
  if (protocol === 'VPN') {
    if (!data.vpnType) {
      throw createAppError('VAL_001', [{ field: 'vpnType', message: 'VPN 协议必须指定 vpnType' }]);
    }
    if (data.requiredVpnId) {
      throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: 'VPN 连接不能依赖其他 VPN' }]);
    }
  }
  // protocol !== 'VPN' 的字段强制 null 在 createConnection/updateConnection 的 payload 构造中处理（自动置 null）
}

async function validateVpnDependency(vpnId: string, projectId: string, selfId?: string) {
  // 目标不存在先查（CONN_002）§3.1 第6条：此检查必须在其他约束之前执行
  const target = await prisma.connection.findUnique({ where: { id: vpnId } });
  if (!target) {
    throw createAppError('CONN_002');
  }

  // 禁止自引用
  if (selfId && vpnId === selfId) {
    throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: '不能依赖自身' }]);
  }

  // 同项目限制
  if (target.projectId !== projectId) {
    throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: '依赖的 VPN 连接不在同一项目' }]);
  }

  // 必须是 VPN 协议
  if (target.protocol !== 'VPN') {
    throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: '依赖的连接必须是 VPN 协议' }]);
  }

  // 循环检测（最大深度 10 层，超出 CONN_003）§3.1 第2条
  let current: { id: string; requiredVpnId: string | null } | null = target;
  let depth = 0;
  while (current?.requiredVpnId && depth < 10) {
    if (current.requiredVpnId === selfId) {
      throw createAppError('CONN_003');
    }
    current = await prisma.connection.findUnique({
      where: { id: current.requiredVpnId },
      select: { id: true, requiredVpnId: true },
    });
    depth++;
  }
  // depth 达 10 且链未到头 → 超出最大深度
  if (current?.requiredVpnId) {
    throw createAppError('CONN_003');
  }
}

function mapToListItem(c: {
  id: string;
  projectId: string;
  name: string;
  host: string;
  port: number | null;
  protocol: string;
  vpnType: string | null;
  tags: string | null;
  lastAccessed: Date | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  project?: { id: string; name: string } | null;
}, userMap: UserRefMap) {
  return {
    id: c.id,
    projectId: c.projectId,
    project: c.project ?? null,
    name: c.name,
    host: c.host,
    port: c.port,
    protocol: c.protocol,
    vpnType: c.vpnType,
    tags: c.tags,
    lastAccessed: c.lastAccessed?.toISOString() ?? null,
    createdBy: getUserRef(userMap, c.createdBy),
    updatedBy: getUserRef(userMap, c.updatedBy),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function toDetail(c: {
  id: string;
  projectId: string;
  name: string;
  host: string;
  port: number | null;
  username: string | null;
  encryptedPass: string | null;
  protocol: string;
  vpnType: string | null;
  vpnLoginUrl: string | null;
  requiredVpnId: string | null;
  notes: string | null;
  tags: string | null;
  lastAccessed: Date | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
}, includeEncryptedPass: boolean, userMap: UserRefMap) {
  return {
    id: c.id,
    projectId: c.projectId,
    name: c.name,
    host: c.host,
    port: c.port,
    username: c.username,
    ...(includeEncryptedPass && { encryptedPass: c.encryptedPass }),
    protocol: c.protocol,
    vpnType: c.vpnType,
    vpnLoginUrl: c.vpnLoginUrl,
    requiredVpnId: c.requiredVpnId,
    notes: c.notes,
    tags: c.tags,
    lastAccessed: c.lastAccessed?.toISOString() ?? null,
    createdBy: getUserRef(userMap, c.createdBy),
    updatedBy: getUserRef(userMap, c.updatedBy),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
