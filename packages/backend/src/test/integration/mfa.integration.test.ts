// packages/backend/src/test/integration/mfa.integration.test.ts
// 票 #30：2FA 全流程集成测试（supertest + 真实临时 SQLite，serverBootstrap 先例）。
// 覆盖 spec 安全三件套：① mfa token 访问业务 API 必 401 ② 无 aud/多值 aud 必被拒
// ③ enabled 用户单密码登录拿不到 access token。
// 限流抬升（本文件 process.env 注入，env.ts 动态快照时生效）：login 5/min、mfa/verify 5/min
// 会卡连续登录/多次验证的测试节奏。
process.env.RATE_LIMIT_LOGIN_MAX = '1000';
process.env.RATE_LIMIT_MFA_VERIFY_MAX = '1000';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import * as jose from 'jose';
import * as OTPAuth from 'otpauth';
import { setupServerWithDb, teardownServerWithDb, type ServerBootstrap } from '../helpers/serverBootstrap.js';

const TEST_JWT_SECRET = 'integration-test-jwt-secret-0123456789abcdef';

function buildTotp(secretBase32: string, username: string) {
  return new OTPAuth.TOTP({
    issuer: 'RemoteHub',
    label: username,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });
}

const b: Partial<ServerBootstrap> = {};
let adminToken = '';
let userId = '';
let mfaToken = '';
let boundSecret = '';
let recoveryCodes: string[] = [];

beforeAll(async () => {
  const boot = await setupServerWithDb();
  Object.assign(b, boot);
  adminToken = boot.adminToken;
}, 120_000);

afterAll(async () => {
  await teardownServerWithDb(b as ServerBootstrap);
});

describe('2FA 集成（票 #30 安全三件套 + 全流程）', () => {
  it('步骤 0：admin 建用户并开启 2FA', async () => {
    const reg = await request(b.app!)
      .post('/api/v1/auth/register')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'mfauser', nickname: 'MFA 用户', password: 'MfaUser123!', role: 'user' });
    expect(reg.status).toBe(201);
    const list = await request(b.app!)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    userId = list.body.data.find((u: { username: string }) => u.username === 'mfauser').id;
    const pat = await request(b.app!)
      .patch(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ twoFactorEnabled: true });
    expect(pat.status).toBe(200);
    expect(pat.body.data.twoFactorEnabled).toBe(true);
  });
  // ─── 安全三件套 ────────────────────────────────────────────────
  // ─── 安全三件套 ────────────────────────────────────────────────
  it('安全③ enabled 用户单密码登录 → mfaPending，无 accessToken、不建 session', async () => {
    const res = await request(b.app!)
      .post('/api/v1/auth/login')
      .send({ username: 'mfauser', password: 'MfaUser123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.mfaPending).toBe(true);
    expect(res.body.data.mfaStage).toBe('setup');
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.mfaToken).toBeTruthy();
    mfaToken = res.body.data.mfaToken;
    const sessions = await b.prisma!.session.count({ where: { userId } });
    expect(sessions).toBe(0);
  });
  it('安全① mfa token 访问业务 API → 401（users 列表与 /auth/me 双证）', async () => {
    const r1 = await request(b.app!)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${mfaToken}`);
    expect(r1.status).toBe(401);
    const r2 = await request(b.app!)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${mfaToken}`);
    expect(r2.status).toBe(401);
  });
  it('安全② 无 aud / 多值 aud token → 访问业务 API 必 401', async () => {
    const secret = new TextEncoder().encode(TEST_JWT_SECRET);
    const noAud = await new jose.SignJWT({ userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret);
    const multiAud = await new jose.SignJWT({ userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience(['access', 'mfa'])
      .setAudience(['access', 'mfa'])
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret);
    const r1 = await request(b.app!)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${noAud}`);
    expect(r1.status).toBe(401);
    const r2 = await request(b.app!)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${multiAud}`);
    expect(r2.status).toBe(401);
  });
  it('安全② 补充：多值 aud 冒充 mfa token 调 mfa/setup → 401', async () => {
    const secret = new TextEncoder().encode(TEST_JWT_SECRET);
    const multiAudMfa = await new jose.SignJWT({ userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience(['mfa'])
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(secret);
    const res = await request(b.app!)
      .post('/api/v1/auth/mfa/setup')
      .set('Authorization', `Bearer ${multiAudMfa}`);
    expect(res.status).toBe(401);
  });
  it('mfa/setup → secret + otpauth:// URI（不落库）', async () => {
    const res = await request(b.app!)
      .post('/api/v1/auth/mfa/setup')
      .set('Authorization', `Bearer ${mfaToken}`);
    expect(res.status).toBe(200);
    boundSecret = res.body.data.secret;
    expect(boundSecret).toMatch(/^[A-Z2-7]+=*$/);
    expect(res.body.data.otpauthUri).toContain(`otpauth://totp/RemoteHub:mfauser?`);
    const dbUser = await b.prisma!.user.findUnique({ where: { id: userId } });
    expect(dbUser!.totpSecret).toBeNull();
  });
  it('mfa/confirm 错码 → 400 MFA_001，零写库', async () => {
    const totp = buildTotp(boundSecret, 'mfauser');
    const bad = totp.generate() === '123456' ? '123457' : '123456';
    const res = await request(b.app!)
      .post('/api/v1/auth/mfa/confirm')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ secret: boundSecret, token: bad });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MFA_001');
    const dbUser = await b.prisma!.user.findUnique({ where: { id: userId } });
    expect(dbUser!.totpSecret).toBeNull();
    expect(await b.prisma!.twoFactorRecoveryCode.count({ where: { userId } })).toBe(0);
  });
  it('mfa/confirm 对码 → 10 恢复码一次性返回 + secret 密文落库', async () => {
    const totp = buildTotp(boundSecret, 'mfauser');
    const res = await request(b.app!)
      .post('/api/v1/auth/mfa/confirm')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ secret: boundSecret, token: totp.generate() });
    expect(res.status).toBe(200);
    recoveryCodes = res.body.data.recoveryCodes;
    expect(recoveryCodes).toHaveLength(10);
    const dbUser = await b.prisma!.user.findUnique({ where: { id: userId } });
    expect(dbUser!.totpSecret).not.toBeNull();
    expect(dbUser!.totpSecret).toMatch(/^v1:/);
    expect(await b.prisma!.twoFactorRecoveryCode.count({ where: { userId } })).toBe(10);
    const sess = await b.prisma!.session.count({ where: { userId } });
    expect(sess).toBe(0);
  });
  it('mfa/verify 错码 → 400 MFA_001', async () => {
    const totp = buildTotp(boundSecret, 'mfauser');
    const bad = totp.generate() === '123456' ? '123457' : '123456';
    const res = await request(b.app!)
      .post('/api/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ token: bad });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MFA_001');
  });
  it('mfa/verify 对码 → access token + user DTO + refresh cookie + session', async () => {
    const totp = buildTotp(boundSecret, 'mfauser');
    const res = await request(b.app!)
      .post('/api/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ token: totp.generate() });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(res.body.data.user.username).toBe('mfauser');
    expect(res.headers['set-cookie']).toBeTruthy();
    const sess = await b.prisma!.session.count({ where: { userId } });
    expect(sess).toBe(1);
    const me = await request(b.app!)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.data.username).toBe('mfauser');
  });
  it('二段登录 mfaStage=verify（绑定完成后）', async () => {
    const res = await request(b.app!)
      .post('/api/v1/auth/login')
      .send({ username: 'mfauser', password: 'MfaUser123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.mfaPending).toBe(true);
    expect(res.body.data.mfaStage).toBe('verify');
    mfaToken = res.body.data.mfaToken;
  });
  it('恢复码登录成功一次，复用 → 400', async () => {
    const v1 = await request(b.app!)
      .post('/api/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ recoveryCode: recoveryCodes[0] });
    expect(v1.status).toBe(200);
    expect(v1.body.data.accessToken).toBeTruthy();
    expect(await b.prisma!.session.count({ where: { userId } })).toBe(2);
    const reuse = await request(b.app!)
      .post('/api/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ recoveryCode: recoveryCodes[0] });
    expect(reuse.status).toBe(400);
    expect(reuse.body.error.code).toBe('MFA_001');
    expect(await b.prisma!.session.count({ where: { userId } })).toBe(2);
  });
  it('错误恢复码 → 400', async () => {
    const res = await request(b.app!)
      .post('/api/v1/auth/mfa/verify')
      .set('Authorization', `Bearer ${mfaToken}`)
      .send({ recoveryCode: 'ZZZZZ-ZZZZZ' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('MFA_001');
  });
  it('无效/过期 mfa token → 401 MFA_002', async () => {
    const garbage = await request(b.app!)
      .post('/api/v1/auth/mfa/setup')
      .set('Authorization', 'Bearer garbage-token');
    expect(garbage.status).toBe(401);
    expect(garbage.body.error.code).toBe('MFA_002');
    const secret = new TextEncoder().encode(TEST_JWT_SECRET);
    const expired = await new jose.SignJWT({ userId })
      .setProtectedHeader({ alg: 'HS256' })
      .setAudience('mfa')
      .setIssuedAt()
      .setExpirationTime('-1s')
      .sign(secret);
    const res = await request(b.app!)
      .post('/api/v1/auth/mfa/setup')
      .set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('MFA_002');
  });
  it('admin 关闭 2FA → 清 secret + 作废恢复码 + 登录回归单因子', async () => {
    const off = await request(b.app!)
      .patch(`/api/v1/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ twoFactorEnabled: false });
    expect(off.status).toBe(200);
    expect(off.body.data.twoFactorEnabled).toBe(false);
    expect(off.body.data.totpSecret).toBeUndefined();
    expect(await b.prisma!.twoFactorRecoveryCode.count({ where: { userId } })).toBe(0);
    const dbUser = await b.prisma!.user.findUnique({ where: { id: userId } });
    expect(dbUser!.totpSecret).toBeNull();
    const login = await request(b.app!)
      .post('/api/v1/auth/login')
      .send({ username: 'mfauser', password: 'MfaUser123!' });
    expect(login.status).toBe(200);
    expect(login.body.data.mfaPending).toBeUndefined();
    expect(login.body.data.accessToken).toBeTruthy();
  });
});
