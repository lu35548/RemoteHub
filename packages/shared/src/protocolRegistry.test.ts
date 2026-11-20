// 票 #45 协议注册表：PROTOCOL_REGISTRY 完备性 + 默认端口表 + 按协议校验矩阵（每协议一正一反）
import { describe, it, expect } from 'vitest';
import { PROTOCOLS } from './enums.js';
import {
  PROTOCOL_REGISTRY,
  getProtocolRegistryEntry,
  validateProtocolAgainstRegistry,
} from './protocolRegistry.js';

describe('PROTOCOL_REGISTRY 完备性', () => {
  it('键集与 PROTOCOLS 十值严格一致（单一真相源，无多无漏）', () => {
    expect([...Object.keys(PROTOCOL_REGISTRY)].sort()).toEqual([...PROTOCOLS].sort());
  });

  it('每协议 defaultPort 与 spec 钦定一致（SSH 22 / HTTPS 443 / RDP 3389；裁量：HTTP 80 / VNC 5900；VPN 与设备码协议无默认）', () => {
    expect(PROTOCOL_REGISTRY.SSH.defaultPort).toBe(22);
    expect(PROTOCOL_REGISTRY.HTTPS.defaultPort).toBe(443);
    expect(PROTOCOL_REGISTRY.RDP.defaultPort).toBe(3389);
    expect(PROTOCOL_REGISTRY.HTTP.defaultPort).toBe(80);
    expect(PROTOCOL_REGISTRY.VNC.defaultPort).toBe(5900);
    expect(PROTOCOL_REGISTRY.VPN.defaultPort).toBeNull();
    expect(PROTOCOL_REGISTRY.TODESK.defaultPort).toBeNull();
    expect(PROTOCOL_REGISTRY.SUNLOGIN.defaultPort).toBeNull();
    expect(PROTOCOL_REGISTRY.TEAMVIEWER.defaultPort).toBeNull();
    expect(PROTOCOL_REGISTRY.ANYDESK.defaultPort).toBeNull();
  });

  it('直连动作分派与 lead 预裁决一致（RDP 文件 / SSH+四设备码命令串 / VPN+HTTP+HTTPS URL / VNC unsupported）', () => {
    expect(PROTOCOL_REGISTRY.RDP.launchAction).toBe('rdp_file');
    expect(PROTOCOL_REGISTRY.SSH.launchAction).toBe('command');
    expect(PROTOCOL_REGISTRY.TODESK.launchAction).toBe('command');
    expect(PROTOCOL_REGISTRY.SUNLOGIN.launchAction).toBe('command');
    expect(PROTOCOL_REGISTRY.TEAMVIEWER.launchAction).toBe('command');
    expect(PROTOCOL_REGISTRY.ANYDESK.launchAction).toBe('command');
    expect(PROTOCOL_REGISTRY.VPN.launchAction).toBe('url');
    expect(PROTOCOL_REGISTRY.HTTP.launchAction).toBe('url');
    expect(PROTOCOL_REGISTRY.HTTPS.launchAction).toBe('url');
    expect(PROTOCOL_REGISTRY.VNC.launchAction).toBe('unsupported');
  });

  it('设备码四协议：port/username 均为 none、host 语义 device_id；主机形态协议 host 语义 address', () => {
    for (const p of ['TODESK', 'SUNLOGIN', 'TEAMVIEWER', 'ANYDESK'] as const) {
      expect(PROTOCOL_REGISTRY[p].fields.port).toBe('none');
      expect(PROTOCOL_REGISTRY[p].fields.username).toBe('none');
      expect(PROTOCOL_REGISTRY[p].hostSemantics).toBe('device_id');
    }
    for (const p of ['RDP', 'SSH', 'VNC', 'HTTP', 'HTTPS', 'VPN'] as const) {
      expect(PROTOCOL_REGISTRY[p].hostSemantics).toBe('address');
      expect(PROTOCOL_REGISTRY[p].fields.host).toBe('required');
    }
  });
});

describe('getProtocolRegistryEntry', () => {
  it('已知协议返回条目；未知协议返回 undefined', () => {
    expect(getProtocolRegistryEntry('SSH')?.defaultPort).toBe(22);
    expect(getProtocolRegistryEntry('NOT_A_PROTOCOL')).toBeUndefined();
  });
});

// ─── 校验矩阵：每协议一正一反（AC）───
// 正 = 该协议合规字段集通过（[]）；反 = 该协议违规字段集被拒（非空 errors）。
describe('validateProtocolAgainstRegistry 矩阵（每协议一正一反）', () => {
  it('RDP：正（host+port+username 全可选域合规）；反（host 空——registry 层 host 必填）', () => {
    expect(validateProtocolAgainstRegistry('RDP', { host: '10.0.0.1', port: 3390, username: 'admin' })).toEqual([]);
    expect(validateProtocolAgainstRegistry('RDP', { host: '', port: 3389 })).not.toEqual([]);
  });

  it('SSH：正；反（host 空）', () => {
    expect(validateProtocolAgainstRegistry('SSH', { host: 'srv.example.com', port: 22, username: 'root' })).toEqual([]);
    expect(validateProtocolAgainstRegistry('SSH', { host: '', port: 22 })).not.toEqual([]);
  });

  it('VNC：正；反（host 空）', () => {
    expect(validateProtocolAgainstRegistry('VNC', { host: '10.0.0.2', port: 5900 })).toEqual([]);
    expect(validateProtocolAgainstRegistry('VNC', { host: '' })).not.toEqual([]);
  });

  it('HTTP：正（port/username 不传均合规）；反（host 空）', () => {
    expect(validateProtocolAgainstRegistry('HTTP', { host: 'web.example.com', port: 8080 })).toEqual([]);
    expect(validateProtocolAgainstRegistry('HTTP', { host: '' })).not.toEqual([]);
  });

  it('HTTPS：正；反（host 空）', () => {
    expect(validateProtocolAgainstRegistry('HTTPS', { host: 'secure.example.com', port: 443 })).toEqual([]);
    expect(validateProtocolAgainstRegistry('HTTPS', { host: null })).not.toEqual([]);
  });

  it('VPN：正（host+可选 port）；反（host 空）', () => {
    expect(validateProtocolAgainstRegistry('VPN', { host: 'vpn.example.com', port: 443 })).toEqual([]);
    expect(validateProtocolAgainstRegistry('VPN', { host: '' })).not.toEqual([]);
  });

  it('TODESK：正（设备码入 host、port 显式 null 合规）；反（传非 null port——协议无端口概念）', () => {
    expect(validateProtocolAgainstRegistry('TODESK', { host: '123456789', port: null })).toEqual([]);
    expect(validateProtocolAgainstRegistry('TODESK', { host: '123456789', port: 3389 })).not.toEqual([]);
  });

  it('SUNLOGIN：正；反（传 port）', () => {
    expect(validateProtocolAgainstRegistry('SUNLOGIN', { host: '987654321' })).toEqual([]);
    expect(validateProtocolAgainstRegistry('SUNLOGIN', { host: '987654321', port: 80 })).not.toEqual([]);
  });

  it('TEAMVIEWER：正；反（传 port）', () => {
    expect(validateProtocolAgainstRegistry('TEAMVIEWER', { host: '401 234 567' })).toEqual([]);
    expect(validateProtocolAgainstRegistry('TEAMVIEWER', { host: '401 234 567', port: 5939 })).not.toEqual([]);
  });

  it('ANYDESK：正；反（传 port）', () => {
    expect(validateProtocolAgainstRegistry('ANYDESK', { host: '721 465 813' })).toEqual([]);
    expect(validateProtocolAgainstRegistry('ANYDESK', { host: '721 465 813', port: 7070 })).not.toEqual([]);
  });

  it('port:none 协议的 port 违规错误定位到 port 字段', () => {
    const errors = validateProtocolAgainstRegistry('TODESK', { host: '123456789', port: 3389 });
    expect(errors.some((e) => e.field === 'port')).toBe(true);
  });

  it('未知协议 → protocol 字段错误（防御兜底；上层 validateProtocol 已先行拦截）', () => {
    const errors = validateProtocolAgainstRegistry('BOGUS', { host: 'x' });
    expect(errors.some((e) => e.field === 'protocol')).toBe(true);
  });

  it('宽松兼容语义：未传入的键不校验（undefined = 未提供；update 只查 client 传入字段）', () => {
    // SSH 只查 host，port/username 未传不校验
    expect(validateProtocolAgainstRegistry('SSH', { host: 'srv.example.com' })).toEqual([]);
    // host 未传（undefined）也不校验——供 update 局部更新复用（host 必填由 create 全量链兜底）
    expect(validateProtocolAgainstRegistry('SSH', { port: 22 })).toEqual([]);
  });
});
