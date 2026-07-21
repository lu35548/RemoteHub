export class AppError extends Error {
  /** authController 据此在响应中清除 refreshToken cookie（禁用用户/重置密码场景） */
  clearCookie?: boolean;

  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    public readonly message: string,
    public readonly details?: Array<{ field: string; message: string }>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ERROR_CODES: Record<string, number> = {
  AUTH_001: 401,
  AUTH_002: 401,
  AUTH_003: 403,
  AUTH_004: 401,
  AUTH_005: 403,
  USER_001: 409,
  USER_002: 404,
  CONN_002: 404,
  CONN_003: 400,
  CONN_004: 409,
  CONN_005: 409,
  PROJ_001: 409,
  PROJ_002: 404,
  MEMBER_001: 409,
  MEMBER_002: 403,
  MEMBER_003: 409,
  VAL_001: 422,
  SYS_001: 500,
  SYS_002: 404,
};

export const ERROR_MESSAGES: Record<string, string> = {
  AUTH_001: '用户名或密码错误',
  AUTH_002: '令牌已过期',
  AUTH_003: '权限不足',
  AUTH_004: '刷新令牌无效或已消耗',
  AUTH_005: '用户已被禁用',
  USER_001: '用户名已存在',
  USER_002: '用户不存在',
  CONN_002: '连接不存在',
  CONN_003: 'VPN 依赖循环',
  CONN_004: 'VPN 仍被其他连接依赖',
  CONN_005: '同项目内连接名称已存在',
  PROJ_001: '项目名称冲突',
  PROJ_002: '项目不存在',
  MEMBER_001: '成员已存在于项目中',
  MEMBER_002: '不能变更/移除最后的项目owner',
  MEMBER_003: '用户是项目唯一owner，无法删除',
  VAL_001: '输入验证失败',
  SYS_001: '内部服务器错误',
  SYS_002: '路由不存在',
};

export function createAppError(code: string, details?: Array<{ field: string; message: string }>): AppError {
  return new AppError(code, ERROR_CODES[code] || 500, ERROR_MESSAGES[code] || code, details);
}

/** 带错误码的错误形状（Prisma 已知错误 / AppError 共有 code 字段） */
export type ErrorWithCode = { code?: string };

/** 判断捕获的错误是否为指定 Prisma/业务错误码（统一收口 `as { code?: string }` 散落断言） */
export function hasErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && (error as ErrorWithCode).code === code;
}

/**
 * refresh 端点是否应清除 refreshToken cookie：错误带 clearCookie 标记，
 * 或为 AUTH_004（无效/已消耗）/AUTH_002（过期）。属性判定，不依赖 instanceof（兼容 mock）。
 */
export function shouldClearRefreshCookie(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const e = error as Error & { clearCookie?: boolean };
  return e.clearCookie === true || hasErrorCode(error, 'AUTH_004') || hasErrorCode(error, 'AUTH_002');
}

/**
 * 将 Prisma P2002 唯一约束冲突映射为业务错误码 §11.2
 */
export async function handlePrismaUniqueViolation(error: unknown): Promise<never> {
  const { Prisma } = await import('@prisma/client');
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    const target = (error.meta?.target as string[])?.join(',');
    if (target === 'username') throw createAppError('USER_001');
    if (target === 'name') throw createAppError('PROJ_001');
    if (target === 'projectId,name') throw createAppError('CONN_005');
    if (target === 'projectId,userId') throw createAppError('MEMBER_001');
    if (target === 'tokenHash') throw createAppError('SYS_001');
  }
  throw error;
}
