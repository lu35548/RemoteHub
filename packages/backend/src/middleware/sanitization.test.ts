import '../test/helpers/env.js'; // 环境前置第一个 import（仓库范式：unit 也可能经 import 链拉起 requireEnv）
import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});

import {
  SANITIZATION_EXCLUDED_FIELDS,
  sanitizeValue,
  sanitizationMiddleware,
} from './sanitization.js';

/** 构造最小 req（仅净化中间件消费的 body/query 面） */
function fakeReq(body: unknown, query: Record<string, unknown> = {}) {
  return { body, query } as unknown as Request;
}
function fakeRes() {
  return {} as Response;
}

/** 断言回调以 VAL_001 AppError 拒绝 */
function expectVal001(fn: () => unknown) {
  try {
    fn();
    expect.fail('应拒绝（抛 VAL_001）');
  } catch (err) {
    expect((err as { code?: string }).code).toBe('VAL_001');
    expect((err as { statusCode?: number }).statusCode).toBe(422);
  }
}

describe('sanitizeValue - XSS 剥离（不拒绝，整段/属性/协议移除）', () => {
  it('script 标签连同内容整段移除', () => {
    expect(sanitizeValue('<script>alert(1)</script>标记')).toBe('标记');
  });

  it('事件属性（on*=）移除，标签本体保留', () => {
    expect(sanitizeValue('<img src=x onerror="alert(1)">')).toBe('<img src=x >');
  });

  it('javascript: 协议移除', () => {
    expect(sanitizeValue('javascript:alert(1)')).toBe('alert(1)');
  });

  it('剥离后无注入残留的混合形态', () => {
    expect(sanitizeValue('<script>a</script>ok<script>b</script>')).toBe('ok');
  });
});

describe('sanitizeValue - 注入模式拒绝（VAL_001 422）', () => {
  it('SQL：引号+关键字（OR）', () => {
    expectVal001(() => sanitizeValue("' OR 1=1 --"));
  });

  it('SQL：引号+关键字（UNION SELECT）', () => {
    expectVal001(() => sanitizeValue("' UNION SELECT * FROM users --"));
  });

  it('SQL：-- 注释', () => {
    expectVal001(() => sanitizeValue("admin'--"));
  });

  it('NoSQL：$ 开头操作符 key', () => {
    expectVal001(() => sanitizeValue({ $ne: null }));
    expectVal001(() => sanitizeValue({ filter: { $where: '1' } }));
  });

  it('路径遍历：../ 与 ..\\', () => {
    expectVal001(() => sanitizeValue('../../etc/passwd'));
    expectVal001(() => sanitizeValue('..\\windows\\system32'));
  });

  it('命令注入：&& / 反引号 / $() / rm -rf', () => {
    expectVal001(() => sanitizeValue('a && b'));
    expectVal001(() => sanitizeValue('`id`'));
    expectVal001(() => sanitizeValue('$(whoami)'));
    expectVal001(() => sanitizeValue('rm -rf /'));
  });
});

describe('sanitizeValue - 排除字段与递归', () => {
  it('SANITIZATION_EXCLUDED_FIELDS 五字段（票面三键 + change-password 双键）', () => {
    expect(SANITIZATION_EXCLUDED_FIELDS).toEqual([
      'password', 'encryptedPass', 'notes', 'oldPassword', 'newPassword',
    ]);
  });

  it('排除字段原样透传（含注入模式）', () => {
    expect(sanitizeValue("' OR 1=1 --", true)).toBe("' OR 1=1 --");
  });

  it('change-password 双键豁免：合法密码含注入样字符不被拒绝或剥离', () => {
    // 双轴 review 修正：oldPassword/newPassword 不豁免 → 改密 422 或剥离后入库致无法登录
    const pwd = "P@ss w0rd'&&`$(x)--<b>1";
    expect(sanitizeValue(pwd, true)).toBe(pwd);
    expect(sanitizeValue({ oldPassword: pwd, newPassword: pwd })).toEqual({
      oldPassword: pwd,
      newPassword: pwd,
    });
  });

  it('嵌套对象：顶层净化、排除字段层级无关豁免', () => {
    const input = {
      name: '<script>x</script>项目',
      notes: 'ssh user@host && ls -la',
      meta: {
        password: 'P@ss<word>&&1',
        url: '<script>y</script>https://a.b',
      },
    };
    const out = sanitizeValue(input) as typeof input;
    expect(out.name).toBe('项目');
    expect(out.notes).toBe('ssh user@host && ls -la'); // 任意层级键名豁免
    expect(out.meta.password).toBe('P@ss<word>&&1');
    expect(out.meta.url).toBe('https://a.b');
  });

  it('数组元素递归净化', () => {
    const out = sanitizeValue({ tags: ['a<script>x</script>', 'b'] }) as { tags: string[] };
    expect(out.tags).toEqual(['a', 'b']);
  });
});

describe('sanitizeValue - 安全串原样（误杀防线）', () => {
  it('「Select 演示」（裸词无引号前缀）放行', () => {
    expect(sanitizeValue('Select 演示')).toBe('Select 演示');
  });

  it('「A and B」（裸 and 无引号组合）放行', () => {
    expect(sanitizeValue('A and B')).toBe('A and B');
  });

  it('普通中文与含连字符文本放行', () => {
    expect(sanitizeValue('生产环境-v2 项目 A')).toBe('生产环境-v2 项目 A');
  });

  it('http(s) URL 与 email 放行', () => {
    expect(sanitizeValue('https://example.com/a?b=1')).toBe('https://example.com/a?b=1');
    expect(sanitizeValue('user@example.com')).toBe('user@example.com');
  });
});

describe('sanitizationMiddleware', () => {
  it('净化 body 与 query 后放行 next()', () => {
    const req = fakeReq(
      { name: '<script>x</script>项目', notes: 'rm -rf / 仅供 notes' },
      { q: 'javascript:evil' },
    );
    let nextCalled = false;
    sanitizationMiddleware(req, fakeRes(), () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
    expect((req.body as { name: string }).name).toBe('项目');
    expect((req.body as { notes: string }).notes).toBe('rm -rf / 仅供 notes');
    expect((req.query as { q: unknown }).q).toBe('evil');
  });

  it('注入模式拒绝 → next(err) 透传 VAL_001（422）', () => {
    const req = fakeReq({ name: "' OR 1=1 --" });
    let captured: unknown;
    sanitizationMiddleware(req, fakeRes(), ((err?: unknown) => { captured = err; }) as NextFunction);
    expect((captured as { code?: string }).code).toBe('VAL_001');
    expect((captured as { statusCode?: number }).statusCode).toBe(422);
  });
});
