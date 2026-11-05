import { describe, it, expect, vi, beforeEach } from 'vitest';
import '../test/helpers/env.js'; // 环境前置（#36 起 connectionService 经 logger 拉起 config/env，CI 无 .env 必崩）

// ── Mock 外部依赖 ──

vi.mock('../utils/prisma.js', async () => {
  const { createPrismaMock } = await import('../test/helpers/prismaMock.js');
  return { prisma: createPrismaMock() };
});

vi.mock('../utils/encryption.js', () => ({
  encrypt: vi.fn((p: string) => `encrypted:${p}`),
  decrypt: vi.fn((p: string) => p.replace('encrypted:', '')),
}));

// #36：连接三操作成功路径 emit 项目成员通知（fire-and-forget）——mock 收口保持单测隔离。
// 工厂必须 mockResolvedValue：service 侧对返回值直接挂 .catch，undefined.catch 会同步炸。
vi.mock('./notificationService.js', () => ({
  emitNotification: vi.fn().mockResolvedValue(undefined),
  emitToAdmins: vi.fn().mockResolvedValue(undefined),
  emitToProjectMembers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/appError.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/appError.js')>();
  return {
    ...actual,
    createAppError: vi.fn((code: string, details?: Array<{ field: string; message: string }>) => {
      const error: any = new Error(`AppError:${code}`);
      error.code = code;
      error.statusCode = 422;
      error.details = details;
      error.name = 'AppError';
      return error;
    }),
    handlePrismaUniqueViolation: vi.fn((_error: unknown) => {
      throw _error;
    }),
  };
});

// ── 导入（在 mock 声明之后）──

import { prisma } from '../utils/prisma.js';
import { encrypt, decrypt } from '../utils/encryption.js';
import { createAppError } from '../utils/appError.js';
import {
  createConnection,
  updateConnection,
  deleteConnection,
  decryptPassword,
  listConnections,
  getConnection,
  getConnectionStats,
  launchConnection,
  cloneConnection,
} from './connectionService.js';
import { emitToProjectMembers } from './notificationService.js';

// ── Helpers ──

const mockConnection = {
  id: 'conn-1',
  projectId: 'proj-1',
  name: 'TestConn',
  host: '192.168.1.1',
  port: 22,
  username: 'root',
  encryptedPass: 'encrypted:s3cret',
  protocol: 'SSH',
  vpnType: null as string | null,
  vpnLoginUrl: null as string | null,
  requiredVpnId: null as string | null,
  notes: null as string | null,
  tags: null as string | null,
  lastAccessed: null as Date | null,
  createdBy: 'user-1',
  updatedBy: 'user-1',
  createdAt: new Date('2025-01-01T00:00:00Z'),
  updatedAt: new Date('2025-01-01T00:00:00Z'),
};

const mockVpnConnection = {
  ...mockConnection,
  id: 'vpn-1',
  name: 'MyVPN',
  protocol: 'VPN',
  vpnType: 'OPENVPN',
  vpnLoginUrl: 'https://vpn.example.com',
};

type MockFn = ReturnType<typeof vi.fn>;

function setupFindUnique(...values: any[]) {
  const fn = prisma.connection.findUnique as MockFn;
  fn.mockReset();
  values.forEach((v) => fn.mockResolvedValueOnce(v));
  // 默认返回 undefined（即 findUnique 未匹配时返回 null）
  if (values.length === 0) {
    fn.mockResolvedValue(null);
  }
}

// ── Tests ──

describe('connectionService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认 resolveUserRefs 返回用户昵称
    (prisma.user.findMany as MockFn).mockResolvedValue([
      { id: 'user-1', nickname: 'User One' },
      { id: 'admin-1', nickname: 'Admin' },
    ]);
  });

  // ────────────────────────────────────────────────
  // validateVpnConsistency（通过 createConnection 间接测试）
  // ────────────────────────────────────────────────

  describe('validateVpnConsistency', () => {
    it('protocol=VPN + 无 vpnType → 抛出 VAL_001', async () => {
      await expect(
        createConnection('user-1', {
          projectId: 'proj-1',
          name: 'VPNConn',
          host: 'vpn.example.com',
          protocol: 'VPN',
          vpnType: null,
        }),
      ).rejects.toThrow('AppError:VAL_001');

      expect(createAppError).toHaveBeenCalledWith('VAL_001', expect.arrayContaining([
        expect.objectContaining({ field: 'vpnType' }),
      ]));
    });

    it('protocol=VPN + 有 requiredVpnId → 抛出 VAL_001', async () => {
      await expect(
        createConnection('user-1', {
          projectId: 'proj-1',
          name: 'VPNConn',
          host: 'vpn.example.com',
          protocol: 'VPN',
          vpnType: 'OPENVPN',
          requiredVpnId: 'other-vpn-id',
        }),
      ).rejects.toThrow('AppError:VAL_001');

      expect(createAppError).toHaveBeenCalledWith('VAL_001', expect.arrayContaining([
        expect.objectContaining({ field: 'requiredVpnId' }),
      ]));
    });

    it('protocol=SSH + vpnType=null → 正常通过', async () => {
      (prisma.connection.create as MockFn).mockResolvedValue({
        ...mockConnection,
        encryptedPass: null,
      });

      await expect(
        createConnection('user-1', {
          projectId: 'proj-1',
          name: 'SSHConn',
          host: '192.168.1.1',
          protocol: 'SSH',
          vpnType: null,
        }),
      ).resolves.toBeDefined();

      expect(prisma.connection.create).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────
  // validateVpnDependency（通过 createConnection / updateConnection 间接测试）
  // ────────────────────────────────────────────────

  describe('validateVpnDependency', () => {
    it('自引用 → 抛出 VAL_001', async () => {
      const connId = 'conn-self';
      setupFindUnique(
        { ...mockConnection, id: connId, protocol: 'SSH' }, // updateConnection current
        { ...mockConnection, id: connId, protocol: 'SSH' }, // validateVpnDependency target（自己）
      );

      await expect(
        updateConnection('user-1', connId, { requiredVpnId: connId }),
      ).rejects.toThrow('AppError:VAL_001');

      expect(createAppError).toHaveBeenCalledWith('VAL_001', expect.arrayContaining([
        expect.objectContaining({ field: 'requiredVpnId', message: '不能依赖自身' }),
      ]));
    });

    it('目标 VPN 不存在 → 抛出 VAL_001（依赖的 VPN 连接不存在）', async () => {
      setupFindUnique(null);

      await expect(
        createConnection('user-1', {
          projectId: 'proj-1',
          name: 'SSHConn',
          host: '192.168.1.1',
          protocol: 'SSH',
          requiredVpnId: 'nonexistent-vpn',
        }),
      ).rejects.toThrow('AppError:CONN_002');

      expect(createAppError).toHaveBeenCalledWith('CONN_002');
    });

    it('目标跨项目 → 抛出 VAL_001（依赖的 VPN 连接不在同一项目）', async () => {
      setupFindUnique({ ...mockVpnConnection, projectId: 'other-project' });

      await expect(
        createConnection('user-1', {
          projectId: 'proj-1',
          name: 'SSHConn',
          host: '192.168.1.1',
          protocol: 'SSH',
          requiredVpnId: 'vpn-1',
        }),
      ).rejects.toThrow('AppError:VAL_001');

      expect(createAppError).toHaveBeenCalledWith('VAL_001', expect.arrayContaining([
        expect.objectContaining({ message: '依赖的 VPN 连接不在同一项目' }),
      ]));
    });

    it('目标不是 VPN 协议 → 抛出 VAL_001（依赖的连接必须是 VPN 协议）', async () => {
      setupFindUnique({ ...mockConnection, protocol: 'SSH' });

      await expect(
        createConnection('user-1', {
          projectId: 'proj-1',
          name: 'SSHConn',
          host: '192.168.1.1',
          protocol: 'SSH',
          requiredVpnId: 'conn-1',
        }),
      ).rejects.toThrow('AppError:VAL_001');

      expect(createAppError).toHaveBeenCalledWith('VAL_001', expect.arrayContaining([
        expect.objectContaining({ message: '依赖的连接必须是 VPN 协议' }),
      ]));
    });

    it('循环依赖 → 抛出 CONN_003', async () => {
      const connA = 'conn-A';
      const vpnB = 'vpn-B';

      setupFindUnique(
        { ...mockConnection, id: connA, protocol: 'SSH' }, // updateConnection 获取 current
        { ...mockVpnConnection, id: vpnB, protocol: 'VPN', requiredVpnId: connA }, // validateVpnDependency target
      );

      await expect(
        updateConnection('user-1', connA, { requiredVpnId: vpnB }),
      ).rejects.toThrow('AppError:CONN_003');

      expect(createAppError).toHaveBeenCalledWith('CONN_003');
    });
  });

  // ────────────────────────────────────────────────
  // createConnection
  // ────────────────────────────────────────────────

  describe('createConnection', () => {
    it('正常创建（含密码加密）', async () => {
      (prisma.connection.create as MockFn).mockResolvedValue({
        ...mockConnection,
        encryptedPass: 'encrypted:MyP@ss',
      });

      const result = await createConnection('user-1', {
        projectId: 'proj-1',
        name: 'MyConn',
        host: '10.0.0.1',
        port: 22,
        username: 'admin',
        password: 'MyP@ss',
        protocol: 'SSH',
      });

      expect(encrypt).toHaveBeenCalledWith('MyP@ss');
      expect(prisma.connection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          encryptedPass: 'encrypted:MyP@ss',
          protocol: 'SSH',
          createdBy: 'user-1',
          updatedBy: 'user-1',
        }),
      });
      expect(result).not.toHaveProperty('encryptedPass');
    });

    it('#36 创建成功 → emit CONNECTION_UPDATED action=created', async () => {
      (prisma.connection.create as MockFn).mockResolvedValue({
        ...mockConnection,
        id: 'conn-new',
        name: 'MyConn',
      });

      await createConnection('user-1', {
        projectId: 'proj-1',
        name: 'MyConn',
        host: '10.0.0.1',
        port: 22,
        protocol: 'SSH',
      });

      expect(emitToProjectMembers).toHaveBeenCalledTimes(1);
      expect(emitToProjectMembers).toHaveBeenCalledWith('proj-1', {
        type: 'CONNECTION_UPDATED',
        payload: { projectId: 'proj-1', connectionId: 'conn-new', action: 'created', name: 'MyConn' },
      });
    });

    it('验证失败（无效字段）', async () => {
      await expect(
        createConnection('user-1', {
          projectId: 'proj-1',
          name: '',
          host: '',
          protocol: 'INVALID_PROTOCOL',
        }),
      ).rejects.toThrow('AppError:VAL_001');
    });

    it('VPN 一致性失败（protocol=VPN 但无 vpnType）', async () => {
      await expect(
        createConnection('user-1', {
          projectId: 'proj-1',
          name: 'VPNConn',
          host: 'vpn.example.com',
          protocol: 'VPN',
          vpnType: null,
        }),
      ).rejects.toThrow('AppError:VAL_001');
    });

    it('无密码时 encryptedPass 为 null', async () => {
      (prisma.connection.create as MockFn).mockResolvedValue({
        ...mockConnection,
        encryptedPass: null,
      });

      await createConnection('user-1', {
        projectId: 'proj-1',
        name: 'NoPassConn',
        host: '10.0.0.1',
        protocol: 'SSH',
      });

      expect(encrypt).not.toHaveBeenCalled();
      expect(prisma.connection.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ encryptedPass: null }),
      });
    });
  });

  // ────────────────────────────────────────────────
  // updateConnection
  // ────────────────────────────────────────────────

  describe('updateConnection', () => {
    it('正常更新', async () => {
      setupFindUnique({ ...mockConnection, id: 'conn-1' });
      (prisma.connection.update as MockFn).mockResolvedValue({
        ...mockConnection,
        id: 'conn-1',
        name: 'UpdatedConn',
      });

      const result = await updateConnection('user-1', 'conn-1', { name: 'UpdatedConn' });

      expect(prisma.connection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: expect.objectContaining({
          name: 'UpdatedConn',
          updatedBy: 'user-1',
        }),
      });
      expect(result.name).toBe('UpdatedConn');
    });

    it('password=null → 清空加密密码', async () => {
      setupFindUnique({ ...mockConnection, id: 'conn-1', encryptedPass: 'old-encrypted' });
      (prisma.connection.update as MockFn).mockResolvedValue({
        ...mockConnection,
        id: 'conn-1',
        encryptedPass: null,
      });

      await updateConnection('user-1', 'conn-1', { password: null });

      expect(prisma.connection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: expect.objectContaining({
          encryptedPass: null,
          updatedBy: 'user-1',
        }),
      });
      const callArgs = (prisma.connection.update as MockFn).mock.calls[0]![0]!;
      expect(callArgs.data).not.toHaveProperty('password');
    });

    it("password='newpass' → 重新加密", async () => {
      setupFindUnique({ ...mockConnection, id: 'conn-1', encryptedPass: 'old-encrypted' });
      (prisma.connection.update as MockFn).mockResolvedValue({
        ...mockConnection,
        id: 'conn-1',
        encryptedPass: 'encrypted:newpass',
      });

      await updateConnection('user-1', 'conn-1', { password: 'newpass' });

      expect(encrypt).toHaveBeenCalledWith('newpass');
      expect(prisma.connection.update).toHaveBeenCalledWith({
        where: { id: 'conn-1' },
        data: expect.objectContaining({
          encryptedPass: 'encrypted:newpass',
          updatedBy: 'user-1',
        }),
      });
      const callArgs = (prisma.connection.update as MockFn).mock.calls[0]![0]!;
      expect(callArgs.data).not.toHaveProperty('password');
    });

    it('protocol 从 VPN 改为 SSH + 有 dependents → 抛出 CONN_004', async () => {
      setupFindUnique({ ...mockVpnConnection, id: 'vpn-1' });
      (prisma.connection.count as MockFn).mockResolvedValue(3);

      await expect(
        updateConnection('user-1', 'vpn-1', { protocol: 'SSH' }),
      ).rejects.toThrow('AppError:CONN_004');

      expect(createAppError).toHaveBeenCalledWith('CONN_004');
    });

    it('protocol 从 VPN 改为 SSH + 无 dependents → 自动清空 VPN 字段', async () => {
      setupFindUnique({ ...mockVpnConnection, id: 'vpn-1' });
      (prisma.connection.count as MockFn).mockResolvedValue(0);
      (prisma.connection.update as MockFn).mockResolvedValue({
        ...mockConnection,
        id: 'vpn-1',
        protocol: 'SSH',
        vpnType: null,
        vpnLoginUrl: null,
        requiredVpnId: null,
      });

      const result = await updateConnection('user-1', 'vpn-1', { protocol: 'SSH' });

      expect(prisma.connection.update).toHaveBeenCalledWith({
        where: { id: 'vpn-1' },
        data: expect.objectContaining({
          protocol: 'SSH',
          vpnType: null,
          vpnLoginUrl: null,
          requiredVpnId: null,
          updatedBy: 'user-1',
        }),
      });
      expect(result.protocol).toBe('SSH');
    });

    it('连接不存在 → 抛出 CONN_002', async () => {
      setupFindUnique(null);

      await expect(
        updateConnection('user-1', 'nonexistent', { name: 'X' }),
      ).rejects.toThrow('AppError:CONN_002');
    });

    it('P2025 Prisma 错误 → 抛出 CONN_002', async () => {
      setupFindUnique({ ...mockConnection, id: 'conn-1' });
      const prismaError = Object.assign(new Error('Record not found'), { code: 'P2025' });
      (prisma.connection.update as MockFn).mockRejectedValue(prismaError);

      await expect(
        updateConnection('user-1', 'conn-1', { name: 'X' }),
      ).rejects.toThrow('AppError:CONN_002');

      expect(createAppError).toHaveBeenCalledWith('CONN_002');
    });
  });

  // ────────────────────────────────────────────────
  // deleteConnection
  // ────────────────────────────────────────────────

  describe('deleteConnection', () => {
    it('VPN + 有 dependents → 抛出 CONN_004', async () => {
      setupFindUnique({
        ...mockVpnConnection,
        dependents: [{ id: 'dep-1' }, { id: 'dep-2' }],
      });

      await expect(deleteConnection('vpn-1')).rejects.toThrow('AppError:CONN_004');
      expect(createAppError).toHaveBeenCalledWith('CONN_004');
    });

    it('VPN + 无 dependents → 成功', async () => {
      setupFindUnique({ ...mockVpnConnection, dependents: [] });
      (prisma.connection.delete as MockFn).mockResolvedValue(mockVpnConnection);

      const result = await deleteConnection('vpn-1');

      expect(prisma.connection.delete).toHaveBeenCalledWith({ where: { id: 'vpn-1' } });
      expect(result).toEqual({ id: 'vpn-1' });
    });

    it('非 VPN → 成功', async () => {
      setupFindUnique({ ...mockConnection, dependents: [] });
      (prisma.connection.delete as MockFn).mockResolvedValue(mockConnection);

      const result = await deleteConnection('conn-1');

      expect(prisma.connection.delete).toHaveBeenCalledWith({ where: { id: 'conn-1' } });
      expect(result).toEqual({ id: 'conn-1' });
    });

    it('不存在 → 抛出 CONN_002', async () => {
      setupFindUnique(null);

      await expect(deleteConnection('nonexistent')).rejects.toThrow('AppError:CONN_002');
      expect(createAppError).toHaveBeenCalledWith('CONN_002');
    });

    it('#36 删除成功 → emit CONNECTION_UPDATED action=deleted（projectId 取自删除前快照）', async () => {
      setupFindUnique({ ...mockConnection, dependents: [] });
      (prisma.connection.delete as MockFn).mockResolvedValue(mockConnection);

      await deleteConnection('conn-1');

      expect(emitToProjectMembers).toHaveBeenCalledTimes(1);
      expect(emitToProjectMembers).toHaveBeenCalledWith('proj-1', {
        type: 'CONNECTION_UPDATED',
        payload: { projectId: 'proj-1', connectionId: 'conn-1', action: 'deleted', name: 'TestConn' },
      });
    });

    it('#36 emit 失败不破主流程：删除照常返回（调用侧 catch 收口）', async () => {
      setupFindUnique({ ...mockConnection, dependents: [] });
      (prisma.connection.delete as MockFn).mockResolvedValue(mockConnection);
      (emitToProjectMembers as MockFn).mockRejectedValueOnce(new Error('notify down'));

      await expect(deleteConnection('conn-1')).resolves.toEqual({ id: 'conn-1' });
    });
  });

  // ────────────────────────────────────────────────
  // decryptPassword
  // ────────────────────────────────────────────────

  describe('decryptPassword', () => {
    it('有密码 → 解密返回', async () => {
      setupFindUnique({ encryptedPass: 'encrypted:s3cret' });

      const result = await decryptPassword('conn-1');

      expect(decrypt).toHaveBeenCalledWith('encrypted:s3cret');
      expect(result).toEqual({ password: 's3cret' });
    });

    it('无密码 → 返回空字符串', async () => {
      setupFindUnique({ encryptedPass: null });

      const result = await decryptPassword('conn-1');

      expect(decrypt).not.toHaveBeenCalled();
      expect(result).toEqual({ password: '' });
    });

    it('不存在 → 抛出 CONN_002', async () => {
      setupFindUnique(null);

      await expect(decryptPassword('nonexistent')).rejects.toThrow('AppError:CONN_002');
      expect(createAppError).toHaveBeenCalledWith('CONN_002');
    });
  });

  // ────────────────────────────────────────────────
  // listConnections
  // ────────────────────────────────────────────────

  describe('listConnections', () => {
    it('admin 无 projectId → 查全部', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([mockConnection]);
      (prisma.connection.count as MockFn).mockResolvedValue(1);

      const result = await listConnections('admin-1', 'admin');

      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} }),
      );
      expect(result.pagination.total).toBe(1);
    });

    it('非 admin → 按项目成员过滤', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([mockConnection]);
      (prisma.connection.count as MockFn).mockResolvedValue(1);

      await listConnections('user-1', 'user');

      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { project: { members: { some: { userId: 'user-1' } } } },
        }),
      );
    });

    it('有 projectId → 按项目过滤', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([]);
      (prisma.connection.count as MockFn).mockResolvedValue(0);

      await listConnections('admin-1', 'admin', 'proj-1');

      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { projectId: 'proj-1' } }),
      );
    });

    it('非 admin + projectId → 合并过滤', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([]);
      (prisma.connection.count as MockFn).mockResolvedValue(0);

      await listConnections('user-1', 'user', 'proj-1');

      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            projectId: 'proj-1',
            project: { members: { some: { userId: 'user-1' } } },
          },
        }),
      );
    });

    it('分页参数正常传递', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([]);
      (prisma.connection.count as MockFn).mockResolvedValue(50);

      const result = await listConnections('admin-1', 'admin', undefined, 3, 10);

      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 10 }),
      );
      expect(result.pagination).toEqual({ page: 3, pageSize: 10, total: 50 });
    });

    it('T5：list item 含 username/requiredVpnId/hasPassword（v1 卡片渲染等价字段）', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([
        { ...mockConnection, requiredVpnId: 'vpn-1' },
      ]);
      (prisma.connection.count as MockFn).mockResolvedValue(1);

      const result = await listConnections('admin-1', 'admin');

      expect(result.data[0]).toMatchObject({
        username: 'root',
        requiredVpnId: 'vpn-1',
        hasPassword: true,
      });
    });

    // ── #41 连接金矿：tag / q / sort 过滤 ──

    it("#41 tag 过滤 → 包夹法四条件 OR（等价 SQL 包夹法「,||tags||, LIKE %,tag,%」，防 test 命中 test2）", async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([]);
      (prisma.connection.count as MockFn).mockResolvedValue(0);

      await listConnections('admin-1', 'admin', undefined, 1, 20, { tag: 'test' });

      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{
              OR: [
                { tags: 'test' },
                { tags: { startsWith: 'test,' } },
                { tags: { endsWith: ',test' } },
                { tags: { contains: ',test,' } },
              ],
            }],
          }),
        }),
      );
      // count 与 findMany 共用同一 where（total 语义一致）
      expect(prisma.connection.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{
              OR: [
                { tags: 'test' },
                { tags: { startsWith: 'test,' } },
                { tags: { endsWith: ',test' } },
                { tags: { contains: ',test,' } },
              ],
            }],
          }),
        }),
      );
    });

    it('#41 q 模糊 → name/host/username 三字段 OR contains', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([]);
      (prisma.connection.count as MockFn).mockResolvedValue(0);

      await listConnections('admin-1', 'admin', undefined, 1, 20, { q: 'web' });

      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            AND: [{
              OR: [
                { name: { contains: 'web' } },
                { host: { contains: 'web' } },
                { username: { contains: 'web' } },
              ],
            }],
          }),
        }),
      );
    });

    it('#41 tag + q 叠加 → AND 两组条件并存', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([]);
      (prisma.connection.count as MockFn).mockResolvedValue(0);

      await listConnections('admin-1', 'admin', undefined, 1, 20, { tag: 'prod', q: 'web' });

      const call = (prisma.connection.findMany as MockFn).mock.calls[0]![0]!;
      expect(call.where.AND).toHaveLength(2);
      expect(call.where.AND[0].OR[0]).toEqual({ tags: 'prod' });
      expect(call.where.AND[1].OR).toEqual([
        { name: { contains: 'web' } },
        { host: { contains: 'web' } },
        { username: { contains: 'web' } },
      ]);
    });

    it('#41 过滤参数与既有权限/项目过滤合并（非 admin + projectId + tag）', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([]);
      (prisma.connection.count as MockFn).mockResolvedValue(0);

      await listConnections('user-1', 'user', 'proj-1', 1, 20, { tag: 'test' });

      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            projectId: 'proj-1',
            project: { members: { some: { userId: 'user-1' } } },
            AND: [{ OR: expect.any(Array) }],
          }),
        }),
      );
    });

    it('#41 sort=lastAccessed → lastAccessed desc 优先 + updatedAt desc 次序（null 殿后由 SQLite DESC 语义保证，integration 锁行为）', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([]);
      (prisma.connection.count as MockFn).mockResolvedValue(0);

      await listConnections('admin-1', 'admin', undefined, 1, 20, { sort: 'lastAccessed' });

      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ lastAccessed: 'desc' }, { updatedAt: 'desc' }],
        }),
      );
    });

    it('#41 review：sort 带首尾空格（%20lastAccessed）→ trim 归一后仍生效，不静默回退默认序', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([]);
      (prisma.connection.count as MockFn).mockResolvedValue(0);

      await listConnections('admin-1', 'admin', undefined, 1, 20, { sort: '  lastAccessed  ' });

      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ lastAccessed: 'desc' }, { updatedAt: 'desc' }],
        }),
      );
    });

    it('#41 sort 缺省/未知值 → 维持 updatedAt desc 默认序（宽容回退，不 400）', async () => {
      (prisma.connection.findMany as MockFn).mockResolvedValue([]);
      (prisma.connection.count as MockFn).mockResolvedValue(0);

      await listConnections('admin-1', 'admin', undefined, 1, 20, { sort: 'bogus' });
      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: 'desc' } }),
      );

      await listConnections('admin-1', 'admin');
      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { updatedAt: 'desc' } }),
      );
    });
  });

  // ── #41 连接金矿：项目连接统计 ──

  describe('getConnectionStats', () => {
    it('按协议聚合计数 + tags JS 侧拆分计数（空片段剔除、null 跳过）', async () => {
      (prisma.project.findUnique as MockFn).mockResolvedValue({ id: 'proj-1' });
      (prisma.connection.findMany as MockFn).mockResolvedValue([
        { protocol: 'SSH', tags: 'prod,web' },
        { protocol: 'SSH', tags: 'prod' },
        { protocol: 'RDP', tags: null },
        { protocol: 'VPN', tags: 'vpn,,prod' }, // 空片段剔除
      ]);

      const result = await getConnectionStats('proj-1');

      expect(result).toEqual({
        protocols: { SSH: 2, RDP: 1, VPN: 1 },
        tags: { prod: 3, web: 1, vpn: 1 },
      });
      expect(prisma.connection.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { projectId: 'proj-1' },
          select: { protocol: true, tags: true },
        }),
      );
    });

    it('无连接项目 → 空聚合（protocols/tags 均空对象）', async () => {
      (prisma.project.findUnique as MockFn).mockResolvedValue({ id: 'proj-1' });
      (prisma.connection.findMany as MockFn).mockResolvedValue([]);

      const result = await getConnectionStats('proj-1');

      expect(result).toEqual({ protocols: {}, tags: {} });
    });

    it('项目不存在 → PROJ_002', async () => {
      (prisma.project.findUnique as MockFn).mockResolvedValue(null);

      await expect(getConnectionStats('nope')).rejects.toMatchObject({ code: 'PROJ_002' });
    });
  });
});

describe('validateConnectionFields - notes/vpnLoginUrl', () => {
  it('超长 notes 返回 VAL_001', async () => {
    await expect(createConnection('user-1', {
      projectId: 'proj-1',
      name: 'c1', host: 'h', protocol: 'SSH',
      notes: 'a'.repeat(2001),
    })).rejects.toMatchObject({ code: 'VAL_001' });
  });
  it('超长 vpnLoginUrl 返回 VAL_001', async () => {
    await expect(createConnection('user-1', {
      projectId: 'proj-1',
      name: 'c1', host: 'h', protocol: 'VPN', vpnType: 'OPENVPN',
      vpnLoginUrl: 'a'.repeat(501),
    })).rejects.toMatchObject({ code: 'VAL_001' });
  });
});

describe('getConnection - B-4 encryptedPass 权限', () => {
  const fakeConnection = {
    ...mockConnection,
    encryptedPass: 'enc-secret',
  };

  beforeEach(() => { vi.clearAllMocks(); });

  it('admin 拿到 encryptedPass', async () => {
    (prisma.connection.findUnique as MockFn).mockResolvedValue(fakeConnection);
    (prisma.user.findMany as MockFn).mockResolvedValue([]);
    const r = await getConnection('conn-1', 'admin-1', 'admin');
    expect(r.encryptedPass).toBe('enc-secret');
  });

  it('owner 拿到 encryptedPass', async () => {
    (prisma.connection.findUnique as MockFn).mockResolvedValue(fakeConnection);
    (prisma.projectMember.findUnique as MockFn).mockResolvedValue({ role: 'owner' });
    (prisma.user.findMany as MockFn).mockResolvedValue([]);
    const r = await getConnection('conn-1', 'owner-1', 'user');
    expect(r.encryptedPass).toBe('enc-secret');
  });

  it('editor 拿到 encryptedPass', async () => {
    (prisma.connection.findUnique as MockFn).mockResolvedValue(fakeConnection);
    (prisma.projectMember.findUnique as MockFn).mockResolvedValue({ role: 'editor' });
    (prisma.user.findMany as MockFn).mockResolvedValue([]);
    const r = await getConnection('conn-1', 'editor-1', 'user');
    expect(r.encryptedPass).toBe('enc-secret');
  });

  it('viewer 拿不到 encryptedPass（B-4）', async () => {
    (prisma.connection.findUnique as MockFn).mockResolvedValue(fakeConnection);
    (prisma.projectMember.findUnique as MockFn).mockResolvedValue({ role: 'viewer' });
    (prisma.user.findMany as MockFn).mockResolvedValue([]);
    const r = await getConnection('conn-1', 'viewer-1', 'user');
    expect(r).not.toHaveProperty('encryptedPass');
  });

  it('连接不存在抛 CONN_002', async () => {
    (prisma.connection.findUnique as MockFn).mockResolvedValue(null);
    await expect(getConnection('nope', 'u1', 'user')).rejects.toMatchObject({ code: 'CONN_002' });
  });
});

// ────────────────────────────────────────────────
// #45 协议注册表：create 默认端口填充 + port:none 拒绝
// ────────────────────────────────────────────────

describe('#45 createConnection - registry 默认端口填充', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findMany as MockFn).mockResolvedValue([]);
    // create mock 回显入参 data——默认端口填充经 create 收到的 data 断言（写入侧真相）
    (prisma.connection.create as MockFn).mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockConnection, ...data }),
    );
  });

  it.each([
    ['SSH', 22],
    ['HTTPS', 443],
    ['RDP', 3389],
    ['HTTP', 80],
    ['VNC', 5900],
  ] as const)('protocol=%s 不传 port → 填 registry 默认 %i（lead 预裁决 #4：填充只在 create 写入侧）', async (protocol, port) => {
    await createConnection('user-1', {
      projectId: 'proj-1', name: `c-${protocol}`, host: 'h.example.com', protocol,
    });
    expect(prisma.connection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ port }) }),
    );
  });

  it.each([
    ['VPN'], ['TODESK'], ['SUNLOGIN'], ['TEAMVIEWER'], ['ANYDESK'],
  ] as const)('protocol=%s 不传 port → 保持 null（registry 无默认）', async (protocol) => {
    await createConnection('user-1', {
      projectId: 'proj-1', name: `c-${protocol}`, host: '123456789', protocol,
      ...(protocol === 'VPN' ? { vpnType: 'OPENVPN' } : {}), // 既有 VPN 一致性链：VPN 必须 vpnType
    });
    expect(prisma.connection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ port: null }) }),
    );
  });

  it('显式传 port → 不被默认值覆盖（SSH 传 2222 落库 2222）', async () => {
    await createConnection('user-1', {
      projectId: 'proj-1', name: 'c', host: 'h.example.com', protocol: 'SSH', port: 2222,
    });
    expect(prisma.connection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ port: 2222 }) }),
    );
  });

  it('显式传 port=null → 同样填默认（票面钦定缺省语义：null/undefined 统一视为缺省填充，spec W3-11）', async () => {
    await createConnection('user-1', {
      projectId: 'proj-1', name: 'c', host: 'h.example.com', protocol: 'SSH', port: null,
    });
    expect(prisma.connection.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ port: 22 }) }),
    );
  });
});

describe('#45 createConnection - registry port:none 拒绝（每协议一反）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findMany as MockFn).mockResolvedValue([]);
  });

  it.each([
    ['TODESK'], ['SUNLOGIN'], ['TEAMVIEWER'], ['ANYDESK'],
  ] as const)('protocol=%s 传非 null port → VAL_001（field=port，协议无端口概念）', async (protocol) => {
    await expect(createConnection('user-1', {
      projectId: 'proj-1', name: 'c', host: '123456789', protocol, port: 3389,
    })).rejects.toMatchObject({
      code: 'VAL_001',
      details: expect.arrayContaining([expect.objectContaining({ field: 'port' })]),
    });
    expect(prisma.connection.create).not.toHaveBeenCalled();
  });

  it('TODESK 传 port=null → 通过（显式留空合规）', async () => {
    (prisma.connection.create as MockFn).mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockConnection, ...data }),
    );
    await expect(createConnection('user-1', {
      projectId: 'proj-1', name: 'c', host: '123456789', protocol: 'TODESK', port: null,
    })).resolves.toBeTruthy();
  });

  it('设备码协议 host 空 → validateHost 通用校验先行拦截（防御层关系：registry host 校验为冗余兜底）', async () => {
    await expect(createConnection('user-1', {
      projectId: 'proj-1', name: 'c', host: '', protocol: 'TODESK',
    })).rejects.toMatchObject({
      code: 'VAL_001',
      details: expect.arrayContaining([expect.objectContaining({ field: 'host' })]),
    });
  });
});

describe('#45 updateConnection - registry 宽松兼容（存量数据零破坏 AC）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findMany as MockFn).mockResolvedValue([]);
    (prisma.connection.update as MockFn).mockImplementation(({ data }: any) =>
      Promise.resolve({ ...mockConnection, ...data }),
    );
  });

  it('老连接（TODESK 存量）只改 notes → 通过（registry 不因存量形状拒局部更新）', async () => {
    setupFindUnique({ ...mockConnection, id: 'conn-todesk', protocol: 'TODESK', host: '123456789', port: null, username: null });
    const r = await updateConnection('user-1', 'conn-todesk', { notes: '新备注' });
    expect(r.notes).toBe('新备注');
  });

  it('老连接（SSH 存量 port=null）只改 name → 通过（不因元数据不全被拒）', async () => {
    setupFindUnique({ ...mockConnection, protocol: 'SSH', port: null });
    const r = await updateConnection('user-1', 'conn-1', { name: '改名' });
    expect(r.name).toBe('改名');
    // update 不做默认值填充：port 保持 null 不被回填（lead 预裁决 #4：存量行不回填）
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ port: expect.anything() }) }),
    );
  });

  it('TODESK 连接显式传非 null port → VAL_001（field=port）', async () => {
    setupFindUnique({ ...mockConnection, protocol: 'TODESK', host: '123456789', port: null });
    await expect(updateConnection('user-1', 'conn-1', { port: 3389 })).rejects.toMatchObject({
      code: 'VAL_001',
      details: expect.arrayContaining([expect.objectContaining({ field: 'port' })]),
    });
  });

  it('SSH 存量 port=22 传 port=2222 → 通过（address 形态协议端口自由）', async () => {
    setupFindUnique({ ...mockConnection, protocol: 'SSH', port: 22 });
    await updateConnection('user-1', 'conn-1', { port: 2222 });
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ port: 2222 }) }),
    );
  });

  it('SSH→TODESK 切协议但不传 port → 通过且强制清 port（review 修复 4：port:none 目标协议清脏数据）', async () => {
    setupFindUnique({ ...mockConnection, protocol: 'SSH', port: 22 });
    await expect(updateConnection('user-1', 'conn-1', { protocol: 'TODESK' })).resolves.toBeTruthy();
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ port: null, protocol: 'TODESK' }) }),
    );
  });

  it('TODESK 存量行改 notes（protocol 未传）→ 不触发 port 强制清（局部更新不动未触碰字段）', async () => {
    setupFindUnique({ ...mockConnection, protocol: 'TODESK', port: null });
    await updateConnection('user-1', 'conn-1', { notes: 'x' });
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.not.objectContaining({ port: expect.anything() }) }),
    );
  });

  it('SSH→TODESK 切协议同时传 port → VAL_001（合并后协议无端口概念）', async () => {
    setupFindUnique({ ...mockConnection, protocol: 'SSH', port: 22 });
    await expect(updateConnection('user-1', 'conn-1', { protocol: 'TODESK', port: 22 })).rejects.toMatchObject({
      code: 'VAL_001',
    });
  });
});

// ────────────────────────────────────────────────
// #45 launch：直连三类分派（rdp_file / command / url）+ .rdp 字节级
// ────────────────────────────────────────────────

describe('#45 launchConnection - 直连分派矩阵', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (prisma.user.findMany as MockFn).mockResolvedValue([]);
  });

  /** 造指定形态连接 + launch 便捷函数 */
  const launchWith = (overrides: Record<string, unknown>) => {
    (prisma.connection.findUnique as MockFn).mockReset();
    (prisma.connection.findUnique as MockFn).mockResolvedValue({ ...mockConnection, ...overrides });
    return launchConnection('conn-1');
  };

  // ── RDP → .rdp 文件 ──

  it('RDP → rdp_file：返回 Buffer 文件体 + 连接名文件名', async () => {
    const r = await launchWith({ protocol: 'RDP', host: '192.168.1.100', port: 3389, username: 'admin', name: '跳板机' });
    expect(r.type).toBe('rdp_file');
    if (r.type !== 'rdp_file') return;
    expect(r.filename).toBe('跳板机.rdp');
    expect(Buffer.isBuffer(r.body)).toBe(true);
  });

  it('.rdp 字节级：BOM FF FE + UTF-16 LE 回读内容 + full address host:port + CRLF 行尾 + 最小集（libcheck §3-§5）', async () => {
    const r = await launchWith({ protocol: 'RDP', host: '192.168.1.100', port: 3389, username: 'admin', name: '跳板机' });
    if (r.type !== 'rdp_file') throw new Error('期望 rdp_file');
    // BOM：UTF-16 LE BOM = FF FE
    expect(r.body[0]).toBe(0xff);
    expect(r.body[1]).toBe(0xfe);
    // UTF-16 LE 回读（跳过 BOM 2 字节）
    const text = r.body.subarray(2).toString('utf16le');
    // 行级断言（CRLF 惯例——Windows 工具链格式）
    expect(text).toBe(
      'screen mode id:i:1\r\n' +
      'desktopwidth:i:1280\r\n' +
      'desktopheight:i:800\r\n' +
      'full address:s:192.168.1.100:3389\r\n' +
      'username:s:admin\r\n',
    );
  });

  it('.rdp port null（存量行未存端口）→ full address 裸 host（mstsc 自默认 3389）', async () => {
    const r = await launchWith({ protocol: 'RDP', host: '10.0.0.5', port: null, username: null });
    if (r.type !== 'rdp_file') throw new Error('期望 rdp_file');
    const text = r.body.subarray(2).toString('utf16le');
    expect(text).toContain('full address:s:10.0.0.5\r\n');
    expect(text).not.toContain('username:s:'); // username null → 无该行
  });

  it('.rdp port 非 3389 → full address 显式 host:port', async () => {
    const r = await launchWith({ protocol: 'RDP', host: '10.0.0.5', port: 3390, username: null });
    if (r.type !== 'rdp_file') throw new Error('期望 rdp_file');
    expect(r.body.subarray(2).toString('utf16le')).toContain('full address:s:10.0.0.5:3390\r\n');
  });

  it('.rdp 内容纯 ASCII（中文名只进 Content-Disposition，不进文件体）', async () => {
    const r = await launchWith({ protocol: 'RDP', name: '中文跳板', host: '10.0.0.5', port: null, username: null });
    if (r.type !== 'rdp_file') throw new Error('期望 rdp_file');
    const text = r.body.subarray(2).toString('utf16le');
    expect(text).not.toMatch(/[\u0080-￿]/); // 全 ASCII
    expect(r.filename).toBe('中文跳板.rdp'); // 中文只在文件名
  });

  // ── SSH → 命令串 ──

  it('SSH + username + port 22 → ssh root@host（默认端口省略 -p，libcheck 钦定）', async () => {
    const r = await launchWith({ protocol: 'SSH', host: 'srv.example.com', port: 22, username: 'root' });
    expect(r).toEqual({ type: 'command', command: 'ssh root@srv.example.com' });
  });

  it('SSH + port 2222 → ssh root@host -p 2222（非默认端口加 -p）', async () => {
    const r = await launchWith({ protocol: 'SSH', host: 'srv.example.com', port: 2222, username: 'root' });
    expect(r).toEqual({ type: 'command', command: 'ssh root@srv.example.com -p 2222' });
  });

  it('SSH + username null → ssh host（无 user 形态）', async () => {
    const r = await launchWith({ protocol: 'SSH', host: 'srv.example.com', port: null, username: null });
    expect(r).toEqual({ type: 'command', command: 'ssh srv.example.com' });
  });

  // ── 设备码四协议 → 命令串（command = 设备码本身，shared types 注释钦定）──

  it.each([['TODESK'], ['SUNLOGIN'], ['TEAMVIEWER'], ['ANYDESK']] as const)(
    '%s → command = 设备码（host 列复用存设备 ID）',
    async (protocol) => {
      const r = await launchWith({ protocol, host: '123 456 789', port: null, username: null });
      expect(r).toEqual({ type: 'command', command: '123 456 789' });
    },
  );

  // ── URL 类 ──

  it('VPN + vpnLoginUrl → url = vpnLoginUrl 原样', async () => {
    const r = await launchWith({ protocol: 'VPN', host: 'vpn.example.com', port: null, vpnLoginUrl: 'https://portal.example.com/login' });
    expect(r).toEqual({ type: 'url', url: 'https://portal.example.com/login' });
  });

  it('VPN + vpnLoginUrl 无 scheme → 补 https://', async () => {
    const r = await launchWith({ protocol: 'VPN', host: 'vpn.example.com', port: null, vpnLoginUrl: 'portal.example.com/login' });
    expect(r).toEqual({ type: 'url', url: 'https://portal.example.com/login' });
  });

  it('VPN 无 vpnLoginUrl → 回退 https://host:port（port 有值拼接）', async () => {
    const r = await launchWith({ protocol: 'VPN', host: 'vpn.example.com', port: 4430, vpnLoginUrl: null });
    expect(r).toEqual({ type: 'url', url: 'https://vpn.example.com:4430' });
  });

  it('VPN 无 vpnLoginUrl + port null → https://host', async () => {
    const r = await launchWith({ protocol: 'VPN', host: 'vpn.example.com', port: null, vpnLoginUrl: null });
    expect(r).toEqual({ type: 'url', url: 'https://vpn.example.com' });
  });

  it('HTTP port null → http://host；port 80 省略；port 8080 拼接（默认端口省略规则）', async () => {
    expect(await launchWith({ protocol: 'HTTP', host: 'web.example.com', port: null })).toEqual({ type: 'url', url: 'http://web.example.com' });
    expect(await launchWith({ protocol: 'HTTP', host: 'web.example.com', port: 80 })).toEqual({ type: 'url', url: 'http://web.example.com' });
    expect(await launchWith({ protocol: 'HTTP', host: 'web.example.com', port: 8080 })).toEqual({ type: 'url', url: 'http://web.example.com:8080' });
  });

  it('HTTPS port null → https://host；port 8443 → host:8443', async () => {
    expect(await launchWith({ protocol: 'HTTPS', host: 's.example.com', port: null })).toEqual({ type: 'url', url: 'https://s.example.com' });
    expect(await launchWith({ protocol: 'HTTPS', host: 's.example.com', port: 8443 })).toEqual({ type: 'url', url: 'https://s.example.com:8443' });
  });

  // ── VNC / 缺失 ──

  it('VNC → CONN_006（该协议不支持直连，registry unsupported）', async () => {
    await expect(launchWith({ protocol: 'VNC', host: '10.0.0.9', port: 5900 })).rejects.toMatchObject({ code: 'CONN_006' });
  });

  it('连接不存在 → CONN_002', async () => {
    (prisma.connection.findUnique as MockFn).mockReset();
    (prisma.connection.findUnique as MockFn).mockResolvedValue(null);
    await expect(launchConnection('nope')).rejects.toMatchObject({ code: 'CONN_002' });
  });

  it('launch 触发 lastAccessed 节流更新（与 getConnection/decryptPassword 同款语义）', async () => {
    (prisma.connection.findUnique as MockFn).mockReset();
    (prisma.connection.findUnique as MockFn).mockResolvedValue({ ...mockConnection, id: 'conn-fresh', protocol: 'SSH', host: 's', port: 22, username: 'root' });
    (prisma.connection.update as MockFn).mockClear();
    // 用未被前序用例写过节流 Map 的 id——模块级 Map 单例，conn-1 已在 5 分钟窗口内被节流
    await launchConnection('conn-fresh');
    expect(prisma.connection.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'conn-fresh' }, data: { lastAccessed: expect.any(Date) } }),
    );
  });
});

// ────────────────────────────────────────────────
// cloneConnection（#43 克隆：密文服务端复制 + 重名递增）
// ────────────────────────────────────────────────

describe('cloneConnection（#43 克隆）', () => {
  beforeEach(() => {
    // 本 describe 位于顶层 describe 外（追加在文件尾），顶层 beforeEach（clearAllMocks +
    // user.findMany 编排）不覆盖此处——自持 mock 卫生（调用计数跨用例累积教训）
    vi.clearAllMocks();
    (prisma.user.findMany as MockFn).mockResolvedValue([
      { id: 'user-1', nickname: 'User One' },
      { id: 'admin-1', nickname: 'Admin' },
    ]);
  });

  /** 克隆场景脚手架：findUnique 返回原行；create 回显 data（幂等构造新行形状，id 固定 conn-clone） */
  function setupClone(original: Record<string, unknown>) {
    (prisma.connection.findUnique as MockFn).mockResolvedValue(original);
    (prisma.connection.create as MockFn).mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...original,
      ...data,
      id: 'conn-clone',
      createdAt: new Date('2025-01-02T00:00:00Z'),
      updatedAt: new Date('2025-01-02T00:00:00Z'),
    }));
  }

  it('无重名冲突 → 名「原名 (副本)」+ 密文原样复制（encrypt 不经过）+ lastAccessed 置 null', async () => {
    setupClone(mockConnection);
    (prisma.connection.findMany as MockFn).mockResolvedValue([]);

    const result = await cloneConnection('user-1', 'conn-1');

    expect(prisma.connection.findUnique).toHaveBeenCalledWith({ where: { id: 'conn-1' } });
    // 重名查询形状：同项目内基名 startsWith 收集 + 侧精确判等（unit 锁 where 形状惯例，listConnections 先例）
    expect(prisma.connection.findMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-1', name: { startsWith: 'TestConn (副本)' } },
      select: { name: true },
    });
    expect(prisma.connection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectId: 'proj-1',
        name: 'TestConn (副本)',
        host: '192.168.1.1',
        port: 22,
        username: 'root',
        encryptedPass: 'encrypted:s3cret', // 密文原样复制（不 decrypt+encrypt），同 ENCRYPTION_KEY 下解密即一致
        protocol: 'SSH',
        createdBy: 'user-1',
        updatedBy: 'user-1',
        lastAccessed: null, // 新连接从未访问，置 null
      }),
    });
    expect(encrypt).not.toHaveBeenCalled(); // 密文复制不过加解密层（票面 L52：密码不经前端明文中转、服务端不重加密）
    expect(result.clonedFrom).toBe('conn-1'); // 审计 after 快照经响应体自动携带来源 id
    expect(result).not.toHaveProperty('password'); // 明文不回传
    expect(result.encryptedPass).toBeUndefined(); // includeEncryptedPass=false，与既有 detail 同形状
  });

  it('三级递增：「原名 (副本)」存在 → 「原名 (副本) 2」', async () => {
    setupClone(mockConnection);
    (prisma.connection.findMany as MockFn).mockResolvedValue([{ name: 'TestConn (副本)' }]);

    await cloneConnection('user-1', 'conn-1');

    expect(prisma.connection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'TestConn (副本) 2' }),
    });
  });

  it('三级递增：「原名 (副本) 2」存在 → 「原名 (副本) 3」', async () => {
    setupClone(mockConnection);
    (prisma.connection.findMany as MockFn).mockResolvedValue([
      { name: 'TestConn (副本)' },
      { name: 'TestConn (副本) 2' },
    ]);

    await cloneConnection('user-1', 'conn-1');

    expect(prisma.connection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'TestConn (副本) 3' }),
    });
  });

  it('前缀字面陷阱：「TestConn (副本)A」startsWith 命中但不占号（精确判等才递增）', async () => {
    setupClone(mockConnection);
    (prisma.connection.findMany as MockFn).mockResolvedValue([{ name: 'TestConn (副本)A' }]);

    await cloneConnection('user-1', 'conn-1');

    expect(prisma.connection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'TestConn (副本)' }),
    });
  });

  it('空缺回填：「TestConn (副本) 2」存在但「TestConn (副本)」空缺 → 回填「TestConn (副本)」（无冲突即用，票面三级规则）', async () => {
    setupClone(mockConnection);
    (prisma.connection.findMany as MockFn).mockResolvedValue([{ name: 'TestConn (副本) 2' }]);

    await cloneConnection('user-1', 'conn-1');

    expect(prisma.connection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'TestConn (副本)' }),
    });
  });

  it('连接不存在 → CONN_002', async () => {
    (prisma.connection.findUnique as MockFn).mockResolvedValue(null);

    await expect(cloneConnection('user-1', 'nope')).rejects.toMatchObject({ code: 'CONN_002' });
  });

  it('克隆名超长（原名 200 字符 + 副本后缀 > 上限 200）→ VAL_001 且不落库', async () => {
    setupClone({ ...mockConnection, name: 'A'.repeat(200) });
    (prisma.connection.findMany as MockFn).mockResolvedValue([]);

    await expect(cloneConnection('user-1', 'conn-1')).rejects.toMatchObject({ code: 'VAL_001' });
    expect(prisma.connection.create).not.toHaveBeenCalled();
  });

  it('克隆成功 → emitToProjectMembers created 通知（#36 语义：clone=新建连接，列表实时刷新）', async () => {
    setupClone(mockConnection);
    (prisma.connection.findMany as MockFn).mockResolvedValue([]);
    await cloneConnection('user-1', 'conn-1');

    expect(emitToProjectMembers).toHaveBeenCalledWith('proj-1', {
      type: 'CONNECTION_UPDATED',
      payload: { projectId: 'proj-1', connectionId: 'conn-clone', action: 'created', name: 'TestConn (副本)' },
    });
  });
});
