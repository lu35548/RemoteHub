// packages/backend/src/services/connectionService.ts
import { prisma } from '../utils/prisma.js';
import type { Prisma } from '@prisma/client';
import { createAppError, handlePrismaUniqueViolation } from '../utils/appError.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import {
  validateConnectionName, validateHost, validatePort,
  validateProtocol, validateVpnType, validateTags,
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
} from '@remotehub/shared';

// ─── Types ───

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
    }),
    prisma.connection.count({ where }),
  ]);

  return { data: connections.map(mapToListItem), pagination: { page, pageSize, total } };
}

/** 创建连接 */
export async function createConnection(userId: string, data: ConnectionCreateData) {
  // 验证字段
  validateConnectionFields(data);

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
    vpnType: data.vpnType ?? null,
    vpnLoginUrl: data.vpnLoginUrl ?? null,
    requiredVpnId: data.requiredVpnId ?? null,
    notes: data.notes ?? null,
    tags: data.tags ?? null,
    createdBy: userId,
    updatedBy: userId,
  };

  try {
    const connection = await prisma.connection.create({ data: createData });
    return toDetail(connection, false);
  } catch (error) {
    await handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** 连接详情 */
export async function getConnection(connectionId: string, userRole: string) {
  const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!connection) throw createAppError('CONN_002');

  return toDetail(connection, userRole === 'admin');
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
  };

  // 验证字段
  validateConnectionFields(merged);

  // VPN 一致性检查
  validateVpnConsistency(merged.protocol, {
    vpnType: merged.vpnType,
    requiredVpnId: updatePayload.requiredVpnId !== undefined ? updatePayload.requiredVpnId as string | null : current.requiredVpnId,
  });

  // protocol 从 VPN 改为非 VPN → 检查 dependents 并清空 VPN 字段
  if (current.protocol === 'VPN' && merged.protocol !== 'VPN') {
    const dependents = await prisma.connection.count({
      where: { requiredVpnId: connectionId },
    });
    if (dependents > 0) {
      throw createAppError('CONN_004');
    }
    // 清空 VPN 字段
    updatePayload.vpnType = null;
    updatePayload.vpnLoginUrl = null;
    updatePayload.requiredVpnId = null;
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
    } else if (typeof pw === 'string' && pw.length > 0) {
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
    return toDetail(connection, false);
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
  tags?: string | null;
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
}

async function validateVpnDependency(vpnId: string, projectId: string, selfId?: string) {
  // 禁止自引用
  if (selfId && vpnId === selfId) {
    throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: '不能依赖自身' }]);
  }

  // 目标必须存在且同项目
  const target = await prisma.connection.findUnique({ where: { id: vpnId } });
  if (!target) {
    throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: '依赖的 VPN 连接不存在' }]);
  }
  if (target.projectId !== projectId) {
    throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: '依赖的 VPN 连接不在同一项目' }]);
  }
  if (target.protocol !== 'VPN') {
    throw createAppError('VAL_001', [{ field: 'requiredVpnId', message: '依赖的连接必须是 VPN 协议' }]);
  }

  // 循环检测（depth < 10）
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
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: c.id,
    projectId: c.projectId,
    name: c.name,
    host: c.host,
    port: c.port,
    protocol: c.protocol,
    vpnType: c.vpnType,
    tags: c.tags,
    lastAccessed: c.lastAccessed?.toISOString() ?? null,
    createdBy: c.createdBy,
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
}, includeEncryptedPass: boolean) {
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
    createdBy: c.createdBy,
    updatedBy: c.updatedBy,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
