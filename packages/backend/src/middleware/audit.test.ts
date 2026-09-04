import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { buildBeforeQuery, maskIp, redactDetail } from './audit.js';

// 票 #16 unit 契约：maskIp / redactDetail / resource→model 映射（映射见 buildBeforeQuery describe）
// IP 掩码规则：IPv4 点分末段置 *（spec 修正表 #6 补 IPv6 后缀掩码，dev 直连 ::1 场景）

describe('maskIp', () => {
  it('IPv4 末段置 *', () => {
    expect(maskIp('1.2.3.4')).toBe('1.2.3.*');
    expect(maskIp('10.0.0.255')).toBe('10.0.0.*');
  });

  it('IPv6 末组掩码（dev 直连 ::1 场景）', () => {
    expect(maskIp('::1')).toBe('::*');
    expect(maskIp('2001:db8::1')).toBe('2001:db8::*');
  });

  it('IPv4-mapped IPv6 掩 v4 末段', () => {
    expect(maskIp('::ffff:127.0.0.1')).toBe('::ffff:127.0.0.*');
  });

  it('空值返回 null', () => {
    expect(maskIp(null)).toBeNull();
    expect(maskIp(undefined)).toBeNull();
    expect(maskIp('')).toBeNull();
  });

  it('非 IP 格式返回 null（不存明文垃圾）', () => {
    expect(maskIp('not-an-ip')).toBeNull();
  });
});

describe('redactDetail', () => {
  it('SENSITIVE_FIELDS 值替换为 [REDACTED]，其余字段保留', () => {
    expect(redactDetail({ name: 'vpn-a', passwordHash: 'x', encryptedPass: 'y' }))
      .toEqual({ name: 'vpn-a', passwordHash: '[REDACTED]', encryptedPass: '[REDACTED]' });
  });

  it('password 键脱敏（decrypt-password 端点 after 含明文密码，必须不落审计表）', () => {
    expect(redactDetail({ password: '明文密码', connectionId: 'c1' }))
      .toEqual({ password: '[REDACTED]', connectionId: 'c1' });
  });

  it('嵌套对象递归脱敏', () => {
    expect(redactDetail({ user: { nickname: '张三', tokenHash: 'secret' } }))
      .toEqual({ user: { nickname: '张三', tokenHash: '[REDACTED]' } });
  });

  it('数组内对象递归脱敏', () => {
    expect(redactDetail({ list: [{ encryptedPass: 'e' }, { name: 'n' }] }))
      .toEqual({ list: [{ encryptedPass: '[REDACTED]' }, { name: 'n' }] });
  });

  it('原对象不被修改（纯函数）', () => {
    const input = { passwordHash: 'secret', nested: { token: 't' } };
    const copy = structuredClone(input);
    redactDetail(input);
    expect(input).toEqual(copy);
  });
});

describe('buildBeforeQuery', () => {
  const req = (method: string, params: Record<string, string>) => ({ method, params } as unknown as Request);

  it('user/project/connection 映射到对应 prisma model，where 按 id', () => {
    expect(buildBeforeQuery('user', req('PATCH', { id: 'u1' }))).toEqual({ model: 'user', where: { id: 'u1' } });
    expect(buildBeforeQuery('project', req('DELETE', { id: 'p1' }))).toEqual({ model: 'project', where: { id: 'p1' } });
    expect(buildBeforeQuery('connection', req('PATCH', { id: 'c1' }))).toEqual({ model: 'connection', where: { id: 'c1' } });
  });

  it('member 映射 projectMember，where 复合键 projectId_userId（挂载点 :id + 子路由 :uid）', () => {
    expect(buildBeforeQuery('member', req('PATCH', { id: 'p1', uid: 'u1' }))).toEqual({
      model: 'projectMember',
      where: { projectId_userId: { projectId: 'p1', userId: 'u1' } },
    });
  });

  it('POST 不快照（创建无 before；decrypt-password 类带 id 的 POST 也不快照）', () => {
    expect(buildBeforeQuery('project', req('POST', {}))).toBeNull();
    expect(buildBeforeQuery('connection', req('POST', { id: 'c1' }))).toBeNull();
  });

  it('GET 不快照', () => {
    expect(buildBeforeQuery('project', req('GET', { id: 'p1' }))).toBeNull();
  });

  it('system/security 无 model 映射，不快照', () => {
    expect(buildBeforeQuery('security', req('POST', {}))).toBeNull();
    expect(buildBeforeQuery('system', req('PATCH', { id: 'x' }))).toBeNull();
  });

  it('无法定位资源 id 时不快照', () => {
    expect(buildBeforeQuery('user', req('PATCH', {}))).toBeNull();
    expect(buildBeforeQuery('member', req('DELETE', { id: 'p1' }))).toBeNull(); // 缺 uid
  });
});
