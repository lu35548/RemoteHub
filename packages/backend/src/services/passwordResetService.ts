// packages/backend/src/services/passwordResetService.ts
// 密码重置域（P1-1，票 #28，design §6 修正后）：
// - token 1h / 每用户 ≤3 有效 / 用后标记 usedAt 不物理删（§6.5）
// - 自助流统一成功响应，不暴露用户存在性：用户不存在 / 已停用 / 已届上限时静默返回
// - admin 代重置共用 token 表，上限届满抛 RESET_003（admin 已知用户存在，无枚举泄漏面）
import { prisma } from '../utils/prisma.js';
import { hashPassword } from '../utils/password.js';
import { generatePasswordResetToken, hashPasswordResetToken } from '../utils/jwt.js';
import { createAppError } from '../utils/appError.js';
import { validatePassword as validatePwd } from '@remotehub/shared';
import { env } from '../config/env.js';

/** 有效 token 判定：未使用且未过期（usedAt 语义照 design §6.1，与 Session consumedAt 同族） */
function activeWhere(userId: string) {
  return { userId, usedAt: null, expiresAt: { gt: new Date() } };
}

/** token 落库单点（review 修复：两流逐字重复块抽此）：raw token 生成 + SHA-256 落库 + 1h 过期；
 * ip/UA 在此单层截断归一（controller 原样透传，缺省入库 null）。
 */
async function createResetToken(userId: string, ip?: string | null, userAgent?: string | null): Promise<string> {
  const token = generatePasswordResetToken();
  await prisma.passwordResetToken.create({
    data: {
      userId,
      tokenHash: hashPasswordResetToken(token),
      expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TOKEN_EXPIRES_HOURS * 3_600_000),
      ip: ip?.slice(0, 45) ?? null,
      userAgent: userAgent?.slice(0, 500) ?? null,
    },
  });
  return token;
}

/** 自助流第一步：POST /auth/forgot-password（公开）§6.3-1
 * 统一 200 { success: true }；不建 token 的情形（用户不存在 / 已停用 / 已届上限）同样静默成功。
 */
export async function requestPasswordReset(
  username: string,
  ip?: string | null,
  userAgent?: string | null,
): Promise<void> {
  // isActive 过滤：停用用户不发 token；admin 代重置（createResetLink）不过滤——admin 明确指定用户
  const user = await prisma.user.findUnique({ where: { username, isActive: true } });
  if (!user) return;

  const activeCount = await prisma.passwordResetToken.count({ where: activeWhere(user.id) });
  if (activeCount >= env.PASSWORD_RESET_MAX_PER_USER) return;

  await createResetToken(user.id, ip, userAgent);
}

/** 自助流第二步：POST /auth/reset-password（公开）§6.3-3
 * 验 token → 事务[改密 + 标记 usedAt + 撤全部 session]。无效/过期/复用一律 RESET_001。
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  const p = validatePwd(newPassword);
  if (!p.valid) throw createAppError('VAL_001', [{ field: 'newPassword', message: p.message }]);

  const tokenHash = hashPasswordResetToken(token);
  const resetToken = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null },
  });
  if (!resetToken || resetToken.expiresAt <= new Date()) throw createAppError('RESET_001');

  const user = await prisma.user.findUnique({ where: { id: resetToken.userId } });
  if (!user || !user.isActive) throw createAppError('RESET_001');

  const passwordHash = await hashPassword(newPassword);
  // CAS 原子守卫（review 修复）：find→update 两步在并发下有同 token「双成功」洞（两请求都见 usedAt=null）；
  // 条件 updateMany 把占用判定压进单条 UPDATE——仅抢到唯一推进权（count===1）的请求继续改密+撤 session。
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: resetToken.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) throw createAppError('RESET_001');
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: user.id } });
  });
}

/** admin 代重置：POST /admin/users/:id/reset-link（design §6.4「管理员手动告知」形态）
 * 上限届满显式抛 RESET_003；FRONTEND_URL 未配置时返回同源相对链接（可用但建议配置）。
 */
export async function createResetLink(
  userId: string,
  ip?: string | null,
  userAgent?: string | null,
): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw createAppError('USER_002');


  const activeCount = await prisma.passwordResetToken.count({ where: activeWhere(user.id) });
  if (activeCount >= env.PASSWORD_RESET_MAX_PER_USER) throw createAppError('RESET_003');

  const token = await createResetToken(user.id, ip, userAgent);
  return `${env.FRONTEND_URL}/reset-password?token=${token}`;
}
