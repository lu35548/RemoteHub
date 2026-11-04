// 票 #45 协议注册表（spec W3-11）：每协议字段形态 / 默认端口 / 直连动作分派。
// 单一真相源落在 shared——后端 create/update 校验与默认值填充、#46 前端表单动态渲染共用。
import { isProtocol, type Protocol } from './enums.js';

/** 直连动作类型（spec W3-11 三类分派 + unsupported）：
 * rdp_file = .rdp 文件下载（UTF-16 LE + BOM、application/x-rdp）；
 * command = 命令串生成（mstsc /v:、ssh user@host、设备码）；url = URL 返回（VPN/HTTP/HTTPS）；
 * unsupported = 该协议无定义直连动作（launch 返回 400 CONN_006，裁量记录见施工报告）。 */
export const LAUNCH_ACTIONS = ['rdp_file', 'command', 'url', 'unsupported'] as const;
export type LaunchAction = typeof LAUNCH_ACTIONS[number];

/** host 列的语义形态：address = 传统主机地址（IP/域名）；device_id = 远控设备码
 * （ToDesk 等——schema 无独立设备码列，host 列复用存设备 ID，v1 即此语义）。 */
export type HostSemantics = 'address' | 'device_id';

export interface ProtocolRegistryEntry {
  /** 协议字段形态（#46 前端表单按此动态渲染字段联动） */
  fields: {
    /** 全协议必填（设备码协议 = 设备码必填） */
    host: 'required';
    /** none = 协议无端口概念（写入侧拒绝非 null port） */
    port: 'optional' | 'none';
    /** none = 协议无用户名概念（声明性元数据，供表单渲染；写入侧不强制——宽松兼容裁量） */
    username: 'optional' | 'none';
  };
  /** create 时 port 缺省（null/undefined）填充的默认端口；null = 无默认不填充。
   * spec 钦定：SSH 22 / HTTPS 443 / RDP 3389；裁量补充：HTTP 80 / VNC 5900（常识默认值）。 */
  defaultPort: number | null;
  /** GET /connections/:id/launch 的动作分派 */
  launchAction: LaunchAction;
  /** host 列语义（表单 placeholder / 提示文案用） */
  hostSemantics: HostSemantics;
}

/** 协议注册表：十协议全覆盖（键集与 PROTOCOLS 严格一致，测试锁定）。
 * 直连分派裁决（lead 预裁决 #3）：RDP→文件；SSH/四设备码协议→命令串；VPN/HTTP/HTTPS→URL；
 * VNC→unsupported（v1 handleConnect 即无 VNC 分支，等价保留——OQ 挂 lead）。 */
export const PROTOCOL_REGISTRY: Record<Protocol, ProtocolRegistryEntry> = {
  RDP:        { fields: { host: 'required', port: 'optional', username: 'optional' }, defaultPort: 3389, launchAction: 'rdp_file',  hostSemantics: 'address' },
  SSH:        { fields: { host: 'required', port: 'optional', username: 'optional' }, defaultPort: 22,   launchAction: 'command',   hostSemantics: 'address' },
  VNC:        { fields: { host: 'required', port: 'optional', username: 'optional' }, defaultPort: 5900, launchAction: 'unsupported', hostSemantics: 'address' },
  HTTP:       { fields: { host: 'required', port: 'optional', username: 'none' },     defaultPort: 80,   launchAction: 'url',       hostSemantics: 'address' },
  HTTPS:      { fields: { host: 'required', port: 'optional', username: 'none' },     defaultPort: 443,  launchAction: 'url',       hostSemantics: 'address' },
  VPN:        { fields: { host: 'required', port: 'optional', username: 'optional' }, defaultPort: null, launchAction: 'url',       hostSemantics: 'address' },
  TODESK:     { fields: { host: 'required', port: 'none',     username: 'none' },     defaultPort: null, launchAction: 'command',   hostSemantics: 'device_id' },
  SUNLOGIN:   { fields: { host: 'required', port: 'none',     username: 'none' },     defaultPort: null, launchAction: 'command',   hostSemantics: 'device_id' },
  TEAMVIEWER: { fields: { host: 'required', port: 'none',     username: 'none' },     defaultPort: null, launchAction: 'command',   hostSemantics: 'device_id' },
  ANYDESK:    { fields: { host: 'required', port: 'none',     username: 'none' },     defaultPort: null, launchAction: 'command',   hostSemantics: 'device_id' },
};

/** 取协议注册表条目；未知协议返回 undefined（调用方防御兜底）。 */
export function getProtocolRegistryEntry(protocol: string): ProtocolRegistryEntry | undefined {
  return isProtocol(protocol) ? PROTOCOL_REGISTRY[protocol] : undefined;
}

/** 按协议注册表校验连接字段（#45）。
 * 宽松兼容语义：只校验**传入的键**——undefined 视为「未提供」不校验（update 局部更新只查
 * client 传入字段，存量行未触碰的字段不因 registry 规则被拒）；null/'' 视为「显式留空」。
 * 当前强制项：host 必填（全协议，与通用 validateHost 同语义——registry 单一真相源）+
 * port:none 协议拒绝非 null port；username:none 为声明性元数据不强制（裁量：避免旧客户端
 * 全量表单提交用户名被拒，见施工报告 Tradeoffs）。 */
export function validateProtocolAgainstRegistry(
  protocol: string,
  data: { host?: string | null; port?: number | null; username?: string | null },
): Array<{ field: string; message: string }> {
  const entry = getProtocolRegistryEntry(protocol);
  if (!entry) {
    return [{ field: 'protocol', message: '无效的连接协议' }];
  }

  const errors: Array<{ field: string; message: string }> = [];

  if (data.host !== undefined && (typeof data.host !== 'string' || data.host.length === 0)) {
    const label = entry.hostSemantics === 'device_id' ? '设备 ID' : '主机地址';
    errors.push({ field: 'host', message: `${label}不能为空` });
  }

  if (entry.fields.port === 'none' && data.port != null) {
    errors.push({ field: 'port', message: '该协议无端口字段，请勿填写端口' });
  }

  return errors;
}
