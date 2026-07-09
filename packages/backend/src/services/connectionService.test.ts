import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock 外部依赖 ──

vi.mock('../utils/prisma.js', () => ({
  prisma: {
    connection: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../utils/encryption.js', () => ({
  encrypt: vi.fn((p: string) => `encrypted:${p}`),
  decrypt: vi.fn((p: string) => p.replace('encrypted:', '')),
}));

vi.mock('../utils/appError.js', () => ({
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
}));

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
} from './connectionService.js';

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
  });
});
