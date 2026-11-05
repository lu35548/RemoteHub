// packages/backend/src/services/connectionService.ts
import { prisma } from '../utils/prisma.js';
import type { Prisma } from '@prisma/client';
import { createAppError, handlePrismaUniqueViolation, hasErrorCode } from '../utils/appError.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';
import { emitToProjectMembers } from './notificationService.js';
import {
  validateConnectionName, validateHost, validatePort,
  validateProtocol, validateVpnType, validateTags,
  validateNotes, validateVpnLoginUrl,
  validateProtocolAgainstRegistry, getProtocolRegistryEntry,
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE,
} from '@remotehub/shared';
import type { ConnectionListQuery, ConnectionStats } from '@remotehub/shared';

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

/** #41 连接列表过滤参数：tag 精确匹配 / q 三字段模糊 / sort=lastAccessed。
 * extends Pick 锁与 shared wire 形状（ConnectionListQuery）的字段级同步——shared 改字段名时此处编译期报错；
 * 职责仍分离：wire 形含 projectId/page/pageSize，service 侧分页与项目过滤走独立位置参数。 */
export interface ConnectionListFilters extends Pick<ConnectionListQuery, 'tag' | 'q' | 'sort'> {}

/** 连接列表 — admin 全部，非 admin 已加入项目的连接。
 * #41：tag 包夹法（四条件 OR，等价 SQL 「','||tags||',' LIKE '%,tag,%'」——防 test 命中 test2，
 * NULL tags 自然排除）；q 对 name/host/username contains；sort='lastAccessed' 时最近访问优先。
 * tag/q 匹配为 SQLite LIKE 家族——ASCII 大小写不敏感（语义详见 shared ConnectionListQuery 注释）。 */
export async function listConnections(
  userId: string,
  userRole: string,
  projectId?: string,
  page: number = 1,
  pageSize: number = DEFAULT_PAGE_SIZE,
  filters: ConnectionListFilters = {},
) {
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  const projectFilter = projectId ? { projectId } : {};

  const where: Prisma.ConnectionWhereInput = userRole === 'admin'
    ? projectFilter
    : { ...projectFilter, project: { members: { some: { userId } } } };

  // #41 过滤条件叠加（AND 组内各自 OR）
  const and: Prisma.ConnectionWhereInput[] = [];
  const tag = filters.tag?.trim();
  if (tag) {
    and.push({
      OR: [
        { tags: tag },
        { tags: { startsWith: `${tag},` } },
        { tags: { endsWith: `,${tag}` } },
        { tags: { contains: `,${tag},` } },
      ],
    });
  }
  const q = filters.q?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q } },
        { host: { contains: q } },
        { username: { contains: q } },
      ],
    });
  }
  if (and.length > 0) where.AND = and;

  // #41 排序：lastAccessed 优先（SQLite DESC 下 NULL 恒殿后 = 从未访问垫底）+ updatedAt 次序稳定；
  // sort 与 tag/q 同样 trim 归一（'?sort=%20lastAccessed' 不静默回退）；其他值宽容回退默认 updatedAt desc（不 400）
  const orderBy: Prisma.ConnectionOrderByWithRelationInput | Prisma.ConnectionOrderByWithRelationInput[] =
    filters.sort?.trim() === 'lastAccessed'
      ? [{ lastAccessed: 'desc' }, { updatedAt: 'desc' }]
      : { updatedAt: 'desc' };

  const [connections, total] = await Promise.all([
    prisma.connection.findMany({
      where,
      orderBy,
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

  // #45 协议注册表校验叠加（port:none 协议拒绝非 null port；host 校验为 validateHost 后的冗余兜底）
  const registryErrors = validateProtocolAgainstRegistry(data.protocol, {
    host: data.host, port: data.port, username: data.username,
  });
  if (registryErrors.length > 0) {
    throw createAppError('VAL_001', registryErrors);
  }

  // VPN 依赖检查
  if (data.requiredVpnId) {
    await validateVpnDependency(data.requiredVpnId, data.projectId);
  }

  // 构建创建数据（#45：port 缺省填 registry 默认——SSH 22 / HTTPS 443 / RDP 3389 等；
  // null/undefined 统一视为缺省填充，spec W3-11 钦定口径，测试锚定）
  const createData: Prisma.ConnectionUncheckedCreateInput = {
    projectId: data.projectId,
    name: data.name,
    host: data.host,
    port: data.port ?? getProtocolRegistryEntry(data.protocol)?.defaultPort ?? null,
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
    // #36：创建成功后通知项目全体成员（事务外 fire-and-forget；连接三操作统一
    // CONNECTION_UPDATED 以 action 区分，design §8.4；失败只记日志不破主流程）
    void emitToProjectMembers(data.projectId, {
      type: 'CONNECTION_UPDATED',
      payload: { projectId: data.projectId, connectionId: connection.id, action: 'created', name: connection.name },
    }).catch((err: Error) => logger.error('连接创建通知下发失败（不传播）', { projectId: data.projectId, connectionId: connection.id, error: err.message }));
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
  touchLastAccessed(connectionId);

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

  // #45 registry 宽松校验：只查 client 传入的字段（updatePayload 白名单拷贝自 body，
  // 未传入的键 undefined → registry 跳过——存量行未触碰的字段不因 registry 规则被拒，零破坏）。
  // protocol 用合并视图（切协议 + 传 port 的组合按目标协议拒绝）。
  const registryErrors = validateProtocolAgainstRegistry(merged.protocol, {
    host: updatePayload.host as string | undefined,
    port: updatePayload.port as number | null | undefined,
  });
  if (registryErrors.length > 0) {
    throw createAppError('VAL_001', registryErrors);
  }

  // #45 review 修复 4：显式切到 port:none 协议（设备码四协议/VNC）时强制清 port——设备码协议
  // port 无意义，清脏数据；限定「显式传 protocol」才触发（局部更新不动 client 未触碰的字段，
  // 存量行改 notes 不因此被写 port）。有 port 协议间切换（SSH→RDP 等）的残留维持 OQ1 交用户。
  if (updatePayload.protocol !== undefined) {
    const targetEntry = getProtocolRegistryEntry(merged.protocol);
    if (targetEntry?.fields.port === 'none') {
      updatePayload.port = null;
    }
  }

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
    // #36：更新成功后通知项目全体成员（fire-and-forget，失败只记日志）
    void emitToProjectMembers(connection.projectId, {
      type: 'CONNECTION_UPDATED',
      payload: { projectId: connection.projectId, connectionId, action: 'updated', name: connection.name },
    }).catch((err: Error) => logger.error('连接更新通知下发失败（不传播）', { projectId: connection.projectId, connectionId, error: err.message }));
    const userMap = await resolveUserRefs([connection.createdBy, connection.updatedBy]);
    return toDetail(connection, false, userMap);
  } catch (error) {
    if (hasErrorCode(error, 'P2025')) {
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
  // #36：删除成功后通知项目全体成员（projectId/name 取自删除前快照——删除后已不可查；
  // fire-and-forget，失败只记日志）
  void emitToProjectMembers(connection.projectId, {
    type: 'CONNECTION_UPDATED',
    payload: { projectId: connection.projectId, connectionId, action: 'deleted', name: connection.name },
  }).catch((err: Error) => logger.error('连接删除通知下发失败（不传播）', { projectId: connection.projectId, connectionId, error: err.message }));
  return { id: connectionId };
}

/** #43 克隆连接（POST /connections/:id/clone）。
 * v1 参照消费点（ConnectionRepository.ts:501-526），本票完成后 v1 backend/ 目录可删。
 *
 * 密文服务端复制（spec W3-9 / 票面 L52）：直查 prisma 原行拿 encryptedPass 原样落新行——
 * 不走 DTO 脱敏层、不 decrypt+encrypt（同 ENCRYPTION_KEY 下解密即一致），
 * 密码全程不过前端明文中转。
 * 权限差异（票面钦定，与 v1 owner-only 不同）：目标项目写权（路由层 projectRole('editor')）；
 * 权限拒绝由路由中间件短路，本函数只管数据边界（不存在 → CONN_002）。 */
export async function cloneConnection(userId: string, connectionId: string) {
  const original = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!original) throw createAppError('CONN_002');

  // 改名递增（@@unique([projectId,name]) 避让）+ 超长校验（复制语义下唯一新生成字段）
  const name = await resolveCloneName(original.projectId, original.name);
  const vName = validateConnectionName(name);
  if (!vName.valid) {
    throw createAppError('VAL_001', [{ field: 'name', message: vName.message }]);
  }

  try {
    const connection = await prisma.connection.create({
      data: {
        projectId: original.projectId,
        name,
        host: original.host,
        port: original.port,
        username: original.username,
        encryptedPass: original.encryptedPass,
        protocol: original.protocol,
        vpnType: original.vpnType,
        vpnLoginUrl: original.vpnLoginUrl,
        requiredVpnId: original.requiredVpnId,
        notes: original.notes,
        tags: original.tags,
        lastAccessed: null, // 新连接从未访问
        createdBy: userId,
        updatedBy: userId,
      },
    });
    // #36：克隆即新建，通知项目全体成员（fire-and-forget，失败只记日志——create 先例同款）
    void emitToProjectMembers(connection.projectId, {
      type: 'CONNECTION_UPDATED',
      payload: { projectId: connection.projectId, connectionId: connection.id, action: 'created', name: connection.name },
    }).catch((err: Error) => logger.error('连接克隆通知下发失败（不传播）', { projectId: connection.projectId, connectionId: connection.id, error: err.message }));
    const userMap = await resolveUserRefs([connection.createdBy, connection.updatedBy]);
    // clonedFrom 进响应体 → auditMiddleware 的 detail.after 从 envelope.data 自动携带（无自定义通道，留痕零成本）
    return { ...toDetail(connection, false, userMap), clonedFrom: connectionId };
  } catch (error) {
    await handlePrismaUniqueViolation(error);
    throw error;
  }
}

/** #43 克隆名递增（@@unique([projectId,name]) 避让，v1 RemoteConnection.clone 先例格式）：
 * 「X」→「X (副本)」→「X (副本) 2」→「X (副本) 3」…（半角括号 + 单半角空格，测试锁死）。
 * startsWith 收集后 Set 精确判等——「X (副本)A」前缀命中不占号；「X (副本)」空缺时
 * 即使「X (副本) 2」存在也回填（无冲突即用，票面三级规则）。 */
async function resolveCloneName(projectId: string, originalName: string): Promise<string> {
  const base = `${originalName} (副本)`;
  const siblings = await prisma.connection.findMany({
    where: { projectId, name: { startsWith: base } },
    select: { name: true },
  });
  const names = new Set(siblings.map((s) => s.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** #41 项目连接统计 — 按协议 groupBy 语义聚合计数 + 标签 JS 侧 split 计数。
 * tags 为逗号分隔单串（queryable-fields 约定不迁移 JSON），空片段剔除、字面匹配（不 trim 片段，
 * 与列表 tag 过滤的包夹法字面语义保持一致）；NULL tags 跳过。
 * 返回类型标注 shared ConnectionStats（对齐 monitoringService SystemHealth 先例，编译期锁契约）。 */
export async function getConnectionStats(projectId: string): Promise<ConnectionStats> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw createAppError('PROJ_002');

  const connections = await prisma.connection.findMany({
    where: { projectId },
    select: { protocol: true, tags: true },
  });

  const protocols: Record<string, number> = {};
  const tags: Record<string, number> = {};
  for (const c of connections) {
    protocols[c.protocol] = (protocols[c.protocol] ?? 0) + 1;
    if (!c.tags) continue;
    for (const fragment of c.tags.split(',')) {
      if (fragment === '') continue; // 空片段剔除（"a,,b"）
      tags[fragment] = (tags[fragment] ?? 0) + 1;
    }
  }

  return { protocols, tags };
}

/** 解密密码 */
export async function decryptPassword(connectionId: string) {
  const connection = await prisma.connection.findUnique({
    where: { id: connectionId },
    select: { encryptedPass: true },
  });
  if (!connection) throw createAppError('CONN_002');

  // C5: lastAccessed 节流更新
  touchLastAccessed(connectionId);

  if (!connection.encryptedPass) {
    return { password: '' };
  }
  return { password: decrypt(connection.encryptedPass) };
}

// ─── #45 直连分派（launch）───

/** launch 结果三形态：rdp_file 带文件体（controller 设 Content-Type/Disposition 后 Buffer 直发）；
 * command/url 即 shared LaunchJsonResponse 的 data 形状（包统一响应壳 JSON）。 */
export type LaunchResult =
  | { type: 'rdp_file'; filename: string; body: Buffer }
  | { type: 'command'; command: string }
  | { type: 'url'; url: string };

/** 生成 .rdp 文件字节（libcheck §3-§5 实证口径）：UTF-16 LE + BOM（0xFF 0xFE）、
 * CRLF 行尾、最小集五键——screen mode / desktop 分辨率 / full address（唯一必填，
 * port null 时裸 host 由 mstsc 自默认 3389）/ username（可选，无则整行省略）。
 * 内容纯 ASCII——中文连接名只进 Content-Disposition 文件名，不进文件体。 */
function buildRdpFileBody(host: string, port: number | null, username: string | null): Buffer {
  const lines = [
    'screen mode id:i:1',
    'desktopwidth:i:1280',
    'desktopheight:i:800',
    `full address:s:${host}${port != null ? `:${port}` : ''}`,
  ];
  if (username) {
    lines.push(`username:s:${username}`);
  }
  // 尾行也带 CRLF（Windows 工具链格式惯例——最后一行有无 CRLF mstsc 均可开，统一带）
  const content = `${lines.join('\r\n')}\r\n`;
  return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(content, 'utf16le')]);
}

/** URL 形态通用拼装：port 显式存在且非 registry 默认时拼接（默认端口省略） */
function buildUrl(scheme: 'http' | 'https', host: string, port: number | null, defaultPort: number | null): string {
  const suffix = port != null && port !== defaultPort ? `:${port}` : '';
  return `${scheme}://${host}${suffix}`;
}

/** GET /connections/:id/launch（票 #45）：按 PROTOCOL_REGISTRY 分派三类直连动作。
 * viewer 可见字段构成（无密码），敏感度低于 decrypt-password——路由权限门 projectRole('viewer')。 */
export async function launchConnection(connectionId: string): Promise<LaunchResult> {
  const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
  if (!connection) throw createAppError('CONN_002');

  const entry = getProtocolRegistryEntry(connection.protocol);
  if (!entry || entry.launchAction === 'unsupported') {
    throw createAppError('CONN_006');
  }

  // lastAccessed 节流更新（launch 语义 = 访问连接，与 getConnection/decryptPassword 同款）
  touchLastAccessed(connectionId);

  switch (entry.launchAction) {
    case 'rdp_file':
      return {
        type: 'rdp_file',
        filename: `${connection.name}.rdp`,
        body: buildRdpFileBody(connection.host, connection.port, connection.username),
      };
    case 'command': {
      // 设备码协议（hostSemantics=device_id）：command 即设备码本身（host 列复用存设备 ID）
      if (entry.hostSemantics === 'device_id') {
        return { type: 'command', command: connection.host };
      }
      // SSH：libcheck 钦定拼串口径——默认端口 22 省略 -p，非 22 加 -p；username 缺省裸 host
      const userPrefix = connection.username ? `${connection.username}@` : '';
      const portSuffix = connection.port != null && connection.port !== entry.defaultPort
        ? ` -p ${connection.port}`
        : '';
      return { type: 'command', command: `ssh ${userPrefix}${connection.host}${portSuffix}` };
    }
    case 'url': {
      // VPN：vpnLoginUrl 优先（无 scheme 补 https://），缺省回退 https://host[:port]
      if (connection.protocol === 'VPN') {
        if (connection.vpnLoginUrl) {
          const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(connection.vpnLoginUrl)
            ? connection.vpnLoginUrl
            : `https://${connection.vpnLoginUrl}`;
          return { type: 'url', url };
        }
        return { type: 'url', url: buildUrl('https', connection.host, connection.port, entry.defaultPort) };
      }
      // HTTP / HTTPS（HTTP 为自然延伸——http:// 语义与 https 同构，裁量记施工报告）
      return { type: 'url', url: buildUrl(connection.protocol === 'HTTP' ? 'http' : 'https', connection.host, connection.port, entry.defaultPort) };
    }
  }
}

// ─── Private Helpers ───

/** C5: lastAccessed 节流更新（fire-and-forget）——getConnection/decryptPassword/launch 三处共用语义收敛 */
function touchLastAccessed(connectionId: string) {
  const now = Date.now();
  const lastUpdate = lastAccessedUpdates.get(connectionId);
  if (!lastUpdate || now - lastUpdate > LAST_ACCESSED_THROTTLE_MS) {
    lastAccessedUpdates.set(connectionId, now);
    prisma.connection.update({
      where: { id: connectionId },
      data: { lastAccessed: new Date() },
    }).catch(() => {}); // fire-and-forget
  }
}

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
  username: string | null;
  encryptedPass: string | null;
  requiredVpnId: string | null;
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
    username: c.username,
    requiredVpnId: c.requiredVpnId,
    hasPassword: c.encryptedPass != null,
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
