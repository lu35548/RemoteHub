// packages/backend/src/services/adminDataService.ts
// 票 #50 数据导入导出(spec §14):JSON 全量导出(projects 含 #47 status / connections 含密文 /
// members / users 白名单 select 不触碰 passwordHash / 审计不含)+ encryptionKeyFingerprint 校验导入。
// 导入 = 事务 upsert(id 保持,密文字文原样搬运,不重加密)。
import crypto from 'node:crypto';
import type { UserRole } from '@remotehub/shared';
import type { ExportData, ExportUser, ExportProject, ExportConnection, ExportMember, ImportResult } from '@remotehub/shared';
import { prisma } from '../utils/prisma.js';
import { createAppError, handlePrismaUniqueViolation } from '../utils/appError.js';
import { getKeyFingerprint } from '../utils/encryption.js';
import { hashPassword } from '../utils/password.js';
import { maskIp } from '../middleware/audit.js';
import { logger } from '../utils/logger.js';

// ─── 导出 ───

/** JSON 全量导出。users 显式字段白名单(select)——passwordHash 在 DB 层即不触碰,非取后剔除。
 * 审计日志表(AuditLog)不在导出范围(票面「审计不含」)。 */
export async function exportData(): Promise<ExportData> {
  const [users, projects, connections, members] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true, username: true, nickname: true, role: true, isActive: true,
        twoFactorEnabled: true, totpSecret: true, lastActiveAt: true,
        createdAt: true, updatedAt: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.project.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.connection.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.projectMember.findMany({ orderBy: { addedAt: 'asc' } }),
  ]);

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    encryptionKeyFingerprint: getKeyFingerprint(),
    users: users.map((u): ExportUser => ({
      id: u.id, username: u.username, nickname: u.nickname,
      role: u.role as UserRole,
      isActive: u.isActive, twoFactorEnabled: u.twoFactorEnabled,
      totpSecret: u.totpSecret,
      lastActiveAt: u.lastActiveAt?.toISOString() ?? null,
      createdAt: u.createdAt.toISOString(), updatedAt: u.updatedAt.toISOString(),
    })),
    projects: projects.map((p): ExportProject => ({
      id: p.id, name: p.name, description: p.description, icon: p.icon,
      status: p.status,
      createdBy: p.createdBy, updatedBy: p.updatedBy,
      createdAt: p.createdAt.toISOString(), updatedAt: p.updatedAt.toISOString(),
    })),
    connections: connections.map((c): ExportConnection => ({
      id: c.id, projectId: c.projectId, name: c.name, host: c.host, port: c.port,
      username: c.username,
      encryptedPass: c.encryptedPass, // 密文字文原样,不重加密(同 KEY 前提)
      protocol: c.protocol as ExportConnection['protocol'],
      vpnType: c.vpnType as ExportConnection['vpnType'],
      vpnLoginUrl: c.vpnLoginUrl,
      requiredVpnId: c.requiredVpnId,
      notes: c.notes, tags: c.tags,
      lastAccessed: c.lastAccessed?.toISOString() ?? null,
      createdBy: c.createdBy, updatedBy: c.updatedBy,
      createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
    })),
    members: members.map((m): ExportMember => ({
      id: m.id, projectId: m.projectId, userId: m.userId,
      role: m.role as ExportMember['role'],
      addedAt: m.addedAt.toISOString(),
    })),
  };
}

// ─── 导入 ───

/** 导入载荷运行时形状(元素级校验只锁 id 与引用键;其余字段靠 Prisma 类型收口,不做深度 schema 校验) */
interface ImportPayload {
  version: number;
  encryptionKeyFingerprint: string;
  users: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  connections: Array<Record<string, unknown>>;
  members: Array<Record<string, unknown>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 顶层形状 + 指纹 + 文件内引用完整性三道校验,全部通过才进事务(快速失败,零写入) */
function assertImportable(payload: unknown): asserts payload is ImportPayload {
  if (!isRecord(payload)) {
    throw createAppError('VAL_001', [{ field: 'body', message: '导入文件须为 JSON 对象' }]);
  }
  if (payload.version !== 1) {
    throw createAppError('VAL_001', [{ field: 'version', message: '不支持的导出文件版本,仅支持 version=1' }]);
  }
  for (const key of ['users', 'projects', 'connections', 'members'] as const) {
    if (!Array.isArray(payload[key])) {
      throw createAppError('VAL_001', [{ field: key, message: `导入文件缺少 ${key} 数组` }]);
    }
  }
  // 指纹校验(解码字节口径,与 getKeyFingerprint 同源):不匹配即拒绝——跨 KEY 密文不可解,
  // 导入等于写入垃圾,票面钦定 422
  if (payload.encryptionKeyFingerprint !== getKeyFingerprint()) {
    throw createAppError('VAL_001', [{ field: 'encryptionKeyFingerprint', message: '加密密钥指纹不匹配:导出文件来自不同的 ENCRYPTION_KEY,密文无法解密,导入拒绝' }]);
  }
  // 文件内引用完整性:悬空引用到 Prisma 层才炸会留下不可控异常,预校验快速失败
  const projectIds = new Set(
    (payload.projects as Array<Record<string, unknown>>).map((p) => p?.id).filter((v): v is string => typeof v === 'string'),
  );
  const connectionIds = new Set(
    (payload.connections as Array<Record<string, unknown>>).map((c) => c?.id).filter((v): v is string => typeof v === 'string'),
  );
  const userIds = new Set(
    (payload.users as Array<Record<string, unknown>>).map((u) => u?.id).filter((v): v is string => typeof v === 'string'),
  );
  for (const c of payload.connections as Array<Record<string, unknown>>) {
    if (typeof c?.projectId !== 'string' || !projectIds.has(c.projectId)) {
      throw createAppError('VAL_001', [{ field: 'connections', message: `连接 ${String(c?.id ?? '?')} 引用了文件中不存在的项目 ${String(c?.projectId ?? '?')}` }]);
    }
    if (c.requiredVpnId !== null && c.requiredVpnId !== undefined && (!connectionIds.has(c.requiredVpnId as string))) {
      throw createAppError('VAL_001', [{ field: 'connections', message: `连接 ${String(c?.id ?? '?')} 引用了文件中不存在的依赖连接 ${String(c.requiredVpnId)}` }]);
    }
  }
  for (const m of payload.members as Array<Record<string, unknown>>) {
    if (typeof m?.projectId !== 'string' || !projectIds.has(m.projectId) || typeof m?.userId !== 'string' || !userIds.has(m.userId)) {
      throw createAppError('VAL_001', [{ field: 'members', message: `成员 ${String(m?.id ?? '?')} 引用了文件中不存在的项目或用户` }]);
    }
  }
}

/** 大库导入事务兜底(逐条 upsert;Prisma $transaction 交互超时默认 5s,大用户量 bcrypt 占位
 * 哈希 + 连接两阶段会超——显式放宽,票面「直读写死」口径)。 */
const IMPORT_TX_TIMEOUT_MS = 120_000;

/**
 * 导入(事务 upsert,id 保持)。安全语义(票面盲区,lead 预授权裁量):
 * - users **update 分支不含 passwordHash**——既有用户密码永不因导入被覆盖(测试锁死);
 * - users create 分支(库中无此 id,典型=清库后重导)密码为 bcrypt 随机占位,
 *   username 进 usersRequirePasswordReset,admin 走既有重置流程恢复其访问;
 * - totpSecret(密文)与 twoFactorEnabled 同步搬运,2FA 状态等价。
 * 连接 requiredVpnId 两阶段回填(趟 1 置 null 建行,趟 2 update 回填),支持任意依赖图。
 */
export async function importData(payload: unknown): Promise<ImportResult> {
  assertImportable(payload);
  const data = payload;

  const usersRequirePasswordReset: string[] = [];
  let usersCreated = 0;
  let usersUpdated = 0;

  try {
    await prisma.$transaction(async (tx) => {
    // ── users:upsert by id;update 分支显式字段列表,不含 passwordHash ──
    for (const u of data.users) {
      const existing = await tx.user.findUnique({ where: { id: String(u.id) } });
      if (existing) {
        await tx.user.update({
          where: { id: String(u.id) },
          data: {
            username: String(u.username), nickname: String(u.nickname),
            role: String(u.role), isActive: Boolean(u.isActive),
            twoFactorEnabled: Boolean(u.twoFactorEnabled),
            totpSecret: (u.totpSecret ?? null) as string | null,
            lastActiveAt: u.lastActiveAt ? new Date(String(u.lastActiveAt)) : null,
            createdAt: new Date(String(u.createdAt)),
          },
        });
        usersUpdated++;
        continue;
      }
      // create:密码随机占位(bcrypt 12 rounds,任何已知密码都无法匹配)
      const placeholder = await hashPassword(crypto.randomBytes(24).toString('hex'));
      await tx.user.create({
        data: {
          id: String(u.id),
          username: String(u.username), nickname: String(u.nickname),
          passwordHash: placeholder,
          role: String(u.role), isActive: Boolean(u.isActive),
          twoFactorEnabled: Boolean(u.twoFactorEnabled),
          totpSecret: (u.totpSecret ?? null) as string | null,
          lastActiveAt: u.lastActiveAt ? new Date(String(u.lastActiveAt)) : null,
          createdAt: new Date(String(u.createdAt)),
        },
      });
      usersCreated++;
      usersRequirePasswordReset.push(String(u.username));
    }

    // ── projects:upsert by id(全字段含 status)──
    for (const p of data.projects) {
      await tx.project.upsert({
        where: { id: String(p.id) },
        create: {
          id: String(p.id),
          name: String(p.name), description: (p.description ?? null) as string | null,
          icon: String(p.icon ?? 'folder'), status: String(p.status ?? 'active'),
          createdBy: String(p.createdBy), updatedBy: String(p.updatedBy),
          createdAt: new Date(String(p.createdAt)),
        },
        update: {
          name: String(p.name), description: (p.description ?? null) as string | null,
          icon: String(p.icon ?? 'folder'), status: String(p.status ?? 'active'),
          createdBy: String(p.createdBy), updatedBy: String(p.updatedBy),
          createdAt: new Date(String(p.createdAt)),
        },
      });
    }

    // ── connections 趟 1:upsert(requiredVpnId 置 null),趟 2 回填依赖 ──
    for (const c of data.connections) {
      const shared = {
        projectId: String(c.projectId), name: String(c.name),
        host: String(c.host),
        port: (c.port ?? null) as number | null,
        username: (c.username ?? null) as string | null,
        encryptedPass: (c.encryptedPass ?? null) as string | null, // 密文字文原样
        protocol: String(c.protocol),
        vpnType: (c.vpnType ?? null) as string | null,
        vpnLoginUrl: (c.vpnLoginUrl ?? null) as string | null,
        notes: (c.notes ?? null) as string | null,
        tags: (c.tags ?? null) as string | null,
        lastAccessed: c.lastAccessed ? new Date(String(c.lastAccessed)) : null,
        createdBy: String(c.createdBy), updatedBy: String(c.updatedBy),
        createdAt: new Date(String(c.createdAt)),
      };
      await tx.connection.upsert({
        where: { id: String(c.id) },
        create: { id: String(c.id), ...shared, requiredVpnId: null },
        update: { ...shared, requiredVpnId: null },
      });
    }
    for (const c of data.connections) {
      if (c.requiredVpnId) {
        await tx.connection.update({
          where: { id: String(c.id) },
          data: { requiredVpnId: String(c.requiredVpnId) },
        });
      }
    }

    // ── members:upsert by id ──
    for (const m of data.members) {
      await tx.projectMember.upsert({
        where: { id: String(m.id) },
        create: {
          id: String(m.id), projectId: String(m.projectId), userId: String(m.userId),
          role: String(m.role ?? 'viewer'),
          addedAt: new Date(String(m.addedAt)),
        },
        update: {
          role: String(m.role ?? 'viewer'),
          addedAt: new Date(String(m.addedAt)),
        },
      });
    }
    }, { timeout: IMPORT_TX_TIMEOUT_MS });
  } catch (error) {
    // 文件内 id 与库中既有行不同键同值(username/name/复合 unique)的冲突映射为业务码
    await handlePrismaUniqueViolation(error);
    throw error;
  }

  return {
    projects: data.projects.length,
    connections: data.connections.length,
    members: data.members.length,
    usersCreated,
    usersUpdated,
    usersRequirePasswordReset,
  };
}

// ─── 审计(程序化落行,不挂 auditMiddleware)───

/** 导出/导入响应体不适合走 auditMiddleware envelope 通道:export 的响应 data 是全量导出 JSON
 * (数 MB 密文),middleware 会将其整体塞进审计 detail.after——审计行膨胀且密文入库。
 * 照 batchArchiveProjects 先例程序化落行:形状对齐 auditMiddleware.writeAuditLog
 * (ip 掩码 / detail JSON / userAgent 截断),await 落行后再响应(失败仅日志,不传播)。 */
export async function writeSystemAudit(params: {
  userId: string;
  action: 'SYSTEM_BACKUP' | 'SYSTEM_RESTORE';
  result: 'success' | 'failure';
  detail: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        resource: 'system',
        resourceId: null, // system 无实体(backupRoutes middleware 先例同值)
        result: params.result,
        detail: JSON.stringify(params.detail),
        ip: maskIp(params.ip) ?? null,
        userAgent: params.userAgent?.slice(0, 500) ?? null,
      },
    });
  } catch (err) {
    logger.error('导入导出审计落库失败(不传播,主请求不受影响)', {
      action: params.action,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
