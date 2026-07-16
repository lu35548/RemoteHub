// packages/backend/src/services/authService.ts
import { prisma } from '../utils/prisma.js';
import { verifyPassword, hashPassword } from '../utils/password.js';
import { signAccessToken, generateRefreshToken, hashRefreshToken } from '../utils/jwt.js';
import { createAppError, handlePrismaUniqueViolation } from '../utils/appError.js';
import { validateUsername, validateNickname, validatePassword as validatePwd } from '@remotehub/shared';
import { REFRESH_CONCURRENT_WINDOW_SEC } from '@remotehub/shared';
import type { UserPublic } from '@remotehub/shared';

/** 数据库 User → 公开 DTO（strip passwordHash, updatedAt）§4.1 */
function toUserPublic(user: { id: string; username: string; nickname: string; role: string; isActive: boolean; lastActiveAt: Date | null; createdAt: Date }): UserPublic {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    role: user.role as 'admin' | 'user',
    isActive: user.isActive,
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

/** 登录 §5.1 — 全程 AUTH_001 防止用户名枚举 */
export async function login(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) throw createAppError('AUTH_001');

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw createAppError('AUTH_001');

  if (!user.isActive) throw createAppError('AUTH_001');

  const accessToken = await signAccessToken(user.id);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);

  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash,
      userAgent: null, // Controller 层传入
      ip: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  return {
    accessToken,
    refreshToken,
    user: toUserPublic(user),
  };
}

/** 注册（仅 admin 调用）§4 */
export async function register(callerRole: string, data: { username: string; nickname: string; password: string; role?: string }) {
  // 验证
  const errors: Array<{ field: string; message: string }> = [];
  const u = validateUsername(data.username);
  if (!u.valid) errors.push({ field: 'username', message: u.message });
  const n = validateNickname(data.nickname);
  if (!n.valid) errors.push({ field: 'nickname', message: n.message });
  const p = validatePwd(data.password);
  if (!p.valid) errors.push({ field: 'password', message: p.message });
  if (data.role && data.role !== 'admin' && data.role !== 'user') {
    errors.push({ field: 'role', message: '无效的用户角色' });
  }
  if (errors.length > 0) throw createAppError('VAL_001', errors);

  const role = data.role || 'user';
  const passwordHash = await hashPassword(data.password);

  try {
    const user = await prisma.user.create({
      data: { username: data.username, nickname: data.nickname, passwordHash, role, isActive: true },
    });
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
    };
  } catch (error) {
    await handlePrismaUniqueViolation(error);
    throw error; // 不会到达
  }
}

/** Refresh token 轮换 §5.1 */
export async function refresh(oldRefreshToken: string) {
  const tokenHash = hashRefreshToken(oldRefreshToken);

  // 待事务外执行的清理（禁用删 session / 重用撤销所有 session）—— 确保生效，不被事务 throw 回滚
  let postAction: (() => Promise<void>) | null = null;
  const runAction = async () => {
    if (postAction) await postAction();
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 原子标记 consumedAt（事务内：create 失败则回滚 consumedAt，token 仍有效）§5.1
      const marked = await tx.session.updateMany({
        where: { tokenHash, consumedAt: null },
        data: { consumedAt: new Date() },
      });

      if (marked.count === 0) {
        // token 已被消费 → 区分重用 vs 并发 vs 无效
        const session = await tx.session.findUnique({ where: { tokenHash }, include: { user: true } });
        if (!session) throw createAppError('AUTH_004');

        if (!session.user.isActive) {
          postAction = async () => {
            await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
          };
          const error = createAppError('AUTH_004');
          (error as any).clearCookie = true;
          throw error;
        }

        // 并发 refresh：30s 内
        if (session.consumedAt && Date.now() - session.consumedAt.getTime() < REFRESH_CONCURRENT_WINDOW_SEC * 1000) {
          if (session.expiresAt <= new Date()) throw createAppError('AUTH_002');
          const accessToken = await signAccessToken(session.user.id);
          const newRefreshToken = generateRefreshToken();
          const newTokenHash = hashRefreshToken(newRefreshToken);
          await tx.session.create({
            data: { userId: session.user.id, tokenHash: newTokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
          });
          return { accessToken, refreshToken: newRefreshToken, clearCookie: false };
        }

        // 重用攻击：撤销所有 session（事务外执行确保生效）
        postAction = async () => {
          await prisma.session.deleteMany({ where: { userId: session.userId } });
        };
        throw createAppError('AUTH_004');
      }

      // 正常情况：检查 token 有效性和用户状态
      const session = await tx.session.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!session) throw createAppError('AUTH_004');
      if (session.expiresAt <= new Date()) throw createAppError('AUTH_002');

      if (!session.user.isActive) {
        postAction = async () => {
          await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
        };
        const error = createAppError('AUTH_004');
        (error as any).clearCookie = true;
        throw error;
      }

      const accessToken = await signAccessToken(session.user.id);
      const newRefreshToken = generateRefreshToken();
      const newTokenHash = hashRefreshToken(newRefreshToken);
      await tx.session.create({
        data: { userId: session.user.id, tokenHash: newTokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
      });
      return { accessToken, refreshToken: newRefreshToken, clearCookie: false };
    });

    await runAction();
    return result;
  } catch (err) {
    // 事务 throw（禁用/重用/过期）：回滚后执行清理（确保 delete/deleteMany 生效）
    await runAction();
    throw err;
  }
}

/** Logout §5.1 */
export async function logout(refreshToken: string | undefined) {
  if (!refreshToken) return;
  const tokenHash = hashRefreshToken(refreshToken);
  await prisma.session.deleteMany({ where: { tokenHash } }).catch(() => {});
}

/** 修改密码 §5.1 */
export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createAppError('AUTH_001');

  const valid = await verifyPassword(oldPassword, user.passwordHash);
  if (!valid) throw createAppError('AUTH_001');

  const p = validatePwd(newPassword);
  if (!p.valid) throw createAppError('VAL_001', [{ field: 'newPassword', message: p.message }]);

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
}

/** 获取当前用户信息 */
export async function getMe(userId: string): Promise<UserPublic> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createAppError('AUTH_002');
  return toUserPublic(user);
}

/** 更新资料 §4 */
export async function updateProfile(userId: string, nickname: string): Promise<UserPublic> {
  const n = validateNickname(nickname);
  if (!n.valid) throw createAppError('VAL_001', [{ field: 'nickname', message: n.message }]);

  const user = await prisma.user.update({
    where: { id: userId },
    data: { nickname },
  });
  return toUserPublic(user);
}
