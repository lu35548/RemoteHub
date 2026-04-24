import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { User } from './User';
import { Project } from './Project';
import { DatabaseEncryption } from '../utils/database';

/**
 * 前端远程协议枚举 - 与RemoteHub/types.ts保持一致
 */
export enum RemoteProtocol {
  RDP = 'rdp',
  SSH = 'ssh',
  VNC = 'vnc',
  HTTP = 'http',
  HTTPS = 'https',
  TODESK = 'todesk',
  SUNLOGIN = 'sunlogin',
  TEAMVIEWER = 'teamviewer',
  ANYDESK = 'anydesk',
  VPN = 'vpn'
}

/**
 * VPN类型枚举 - 与前端保持一致
 */
export enum VpnType {
  WEB = 'web',
  CLIENT = 'client',
  OPENVPN = 'openvpn',
  L2TP = 'l2tp',
  WIREGUARD = 'wireguard'
}

/**
 * RemoteConnection entity - 存储前端远程连接信息
 * 这是RemoteHub平台的核心业务实体
 */
@Entity('remote_connections')
@Index(['ownerId'])
@Index(['protocol'])
@Index(['projectId'])
@Index(['createdAt'])
export class RemoteConnection extends BaseEntity {
  id!: string;

  @Column({ length: 255 })
  @Index()
  name: string;

  @Column({
    type: 'enum',
    enum: RemoteProtocol,
  })
  @Index()
  protocol: RemoteProtocol;

  @Column({ length: 255 })
  host: string;

  @Column({ type: 'int', nullable: true })
  port?: number;

  @Column({ length: 100, nullable: true })
  username?: string;

  // 加密密码存储
  @Column({ type: 'text', nullable: true })
  _encryptedPassword?: string;

  // VPN相关字段
  @Column({
    type: 'enum',
    enum: VpnType,
    nullable: true,
  })
  vpnType?: VpnType;

  @Column({ length: 500, nullable: true })
  vpnLoginUrl?: string;

  @Column({ length: 100, nullable: true })
  requiredVpnId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'json', nullable: true })
  connectionParams?: Record<string, any>;

  // 审计字段 - 与前端保持一致
  @Column({ length: 255, nullable: true })
  createdBy?: string;

  @Column({ type: 'uuid', nullable: true })
  createdById?: string;

  @Column({ length: 255, nullable: true })
  updatedBy?: string;

  @Column({ type: 'uuid', nullable: true })
  updatedById?: string;

  // 使用统计
  @Column({ type: 'datetime', nullable: true })
  lastAccessed?: string;

  @Column({ type: 'int', default: 0 })
  accessCount: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  // 兼容性字段 - 标签存储
  @Column({ type: 'json', nullable: true })
  tags?: string[];

  // 外键
  @Column({ type: 'uuid' })
  @Index()
  ownerId: string;

  @Column({ type: 'uuid' })
  @Index()
  projectId: string;

  // 关系
  @ManyToOne(() => User, user => user.connections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @ManyToOne(() => Project, project => project.connections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  // 密码加密/解密方法
  public setPassword(password: string, encryptionKey?: string): void {
    const key = encryptionKey || process.env.CONNECTION_ENCRYPTION_KEY || 'default-key';
    this._encryptedPassword = DatabaseEncryption.encrypt(password, key);
  }

  public getPassword(encryptionKey?: string): string {
    if (!this._encryptedPassword) return '';
    const key = encryptionKey || process.env.CONNECTION_ENCRYPTION_KEY || 'default-key';
    return DatabaseEncryption.decrypt(this._encryptedPassword, key);
  }

  public hasPassword(): boolean {
    return !!this._encryptedPassword;
  }

  public clearPassword(): void {
    this._encryptedPassword = undefined;
  }

  // 协议特定的默认端口
  public get defaultPort(): number {
    const defaultPorts = {
      [RemoteProtocol.RDP]: 3389,
      [RemoteProtocol.SSH]: 22,
      [RemoteProtocol.VNC]: 5900,
      [RemoteProtocol.HTTP]: 80,
      [RemoteProtocol.HTTPS]: 443,
      [RemoteProtocol.TODESK]: 0, // 动态端口
      [RemoteProtocol.SUNLOGIN]: 0, // 动态端口
      [RemoteProtocol.TEAMVIEWER]: 0, // 动态端口
      [RemoteProtocol.ANYDESK]: 0, // 动态端口
      [RemoteProtocol.VPN]: 0, // 取决于VPN类型
    };
    return defaultPorts[this.protocol] || 0;
  }

  // 连接验证
  public get isValidConfiguration(): boolean {
    // 基本验证
    if (!this.name || !this.host || !this.protocol) {
      return false;
    }

    // 协议特定验证
    switch (this.protocol) {
      case RemoteProtocol.RDP:
      case RemoteProtocol.SSH:
      case RemoteProtocol.VNC:
        return !!this.host && (!!this.port || this.port === this.defaultPort);

      case RemoteProtocol.HTTP:
      case RemoteProtocol.HTTPS:
        return !!this.host;

      case RemoteProtocol.VPN:
        return !!this.vpnType && (!!this.vpnLoginUrl || !!this.requiredVpnId);

      case RemoteProtocol.TODESK:
      case RemoteProtocol.SUNLOGIN:
      case RemoteProtocol.TEAMVIEWER:
      case RemoteProtocol.ANYDESK:
        return !!this.host; // 远程ID或连接地址

      default:
        return false;
    }
  }

  // 标签管理
  public get tagArray(): string[] {
    // tags字段是string[]类型，直接返回
    if (this.tags && Array.isArray(this.tags)) {
      return this.tags;
    }

    return this.tags || [];
  }

  public set tagArray(tags: string[]) {
    this.tags = tags.filter(tag => tag.length > 0);
  }

  public hasTag(tag: string): boolean {
    return this.tagArray.includes(tag);
  }

  public addTag(tag: string): void {
    const tags = this.tagArray;
    if (!tags.includes(tag)) {
      tags.push(tag);
      this.tagArray = tags;
    }
  }

  public removeTag(tag: string): void {
    const tags = this.tagArray;
    const index = tags.indexOf(tag);
    if (index > -1) {
      tags.splice(index, 1);
      this.tagArray = tags;
    }
  }

  // 连接URL生成
  public generateConnectionUrl(): string {
    const port = this.port || this.defaultPort;
    const auth = this.hasPassword() && this.username ? `${this.username}:${this.getPassword()}@` : this.username ? `${this.username}@` : '';

    switch (this.protocol) {
      case RemoteProtocol.RDP:
        return `rdp://${auth}${this.host}${port ? `:${port}` : ''}`;
      case RemoteProtocol.SSH:
        return `ssh://${auth}${this.host}${port ? `:${port}` : ''}`;
      case RemoteProtocol.VNC:
        return `vnc://${auth}${this.host}${port ? `:${port}` : ''}`;
      case RemoteProtocol.HTTP:
        return `http://${this.host}${port ? `:${port}` : ''}`;
      case RemoteProtocol.HTTPS:
        return `https://${this.host}${port ? `:${port}` : ''}`;
      case RemoteProtocol.VPN:
        if (this.vpnLoginUrl) {
          return this.vpnLoginUrl;
        }
        return `${this.protocol}://${this.host}`;
      default:
        return `${this.protocol}://${this.host}`;
    }
  }

  // 访问统计
  public recordAccess(): void {
    this.lastAccessed = new Date().toISOString();
    this.accessCount += 1;
  }

  // 协议显示名称
  public get protocolDisplayName(): string {
    const displayNames = {
      [RemoteProtocol.RDP]: '桌面远程 (RDP)',
      [RemoteProtocol.SSH]: 'SSH (Linux)',
      [RemoteProtocol.VNC]: 'VNC / VDI',
      [RemoteProtocol.HTTP]: 'Web HTTP',
      [RemoteProtocol.HTTPS]: 'Web HTTPS',
      [RemoteProtocol.TODESK]: 'ToDesk',
      [RemoteProtocol.SUNLOGIN]: '向日葵 (Sunlogin)',
      [RemoteProtocol.TEAMVIEWER]: 'TeamViewer',
      [RemoteProtocol.ANYDESK]: 'AnyDesk',
      [RemoteProtocol.VPN]: 'VPN',
    };
    return displayNames[this.protocol] || this.protocol;
  }

  // 协议图标
  public get protocolIcon(): string {
    const icons = {
      [RemoteProtocol.RDP]: '🖥️',
      [RemoteProtocol.SSH]: '💻',
      [RemoteProtocol.VNC]: '🖥️',
      [RemoteProtocol.HTTP]: '🌐',
      [RemoteProtocol.HTTPS]: '🔒',
      [RemoteProtocol.TODESK]: '🔗',
      [RemoteProtocol.SUNLOGIN]: '☀️',
      [RemoteProtocol.TEAMVIEWER]: '👥',
      [RemoteProtocol.ANYDESK]: '🪑',
      [RemoteProtocol.VPN]: '🌐',
    };
    return icons[this.protocol] || '🔗';
  }

  // 克隆方法
  public clone(newName?: string): RemoteConnection {
    const clone = new RemoteConnection();
    clone.name = newName || `${this.name} (副本)`;
    clone.protocol = this.protocol;
    clone.host = this.host;
    clone.port = this.port;
    clone.username = this.username;
    clone.vpnType = this.vpnType;
    clone.vpnLoginUrl = this.vpnLoginUrl;
    clone.requiredVpnId = this.requiredVpnId;
    clone.notes = this.notes;
    clone.tags = this.tags ? [...this.tags] : undefined;
    clone.connectionParams = this.connectionParams ? { ...this.connectionParams } : undefined;
    clone.projectId = this.projectId;
    clone.ownerId = this.ownerId;

    // 复制加密密码
    if (this._encryptedPassword) {
      clone._encryptedPassword = this._encryptedPassword;
    }

    return clone;
  }

  // 序列化时排除敏感信息
  public toJSON(): Partial<this> {
    const {
      _encryptedPassword,
      ...connectionWithoutSensitiveData
    } = this;

    return {
      ...connectionWithoutSensitiveData,
      hasPassword: this.hasPassword(),
      protocolDisplayName: this.protocolDisplayName,
      protocolIcon: this.protocolIcon,
      defaultPort: this.defaultPort,
      isValidConfiguration: this.isValidConfiguration,
    } as any;
  }

  // 导出配置（不包含敏感数据）
  public exportConfig(): any {
    return {
      id: this.id,
      name: this.name,
      protocol: this.protocol,
      protocolDisplayName: this.protocolDisplayName,
      host: this.host,
      port: this.port,
      username: this.username,
      vpnType: this.vpnType,
      vpnLoginUrl: this.vpnLoginUrl,
      requiredVpnId: this.requiredVpnId,
      notes: this.notes,
      tags: this.tagArray,
      connectionParams: this.connectionParams,
      isActive: this.isActive,
      accessCount: this.accessCount,
      lastAccessed: this.lastAccessed,
      // 注意：密码和敏感信息不被导出
    };
  }
}

// RemoteProtocol和VpnType已经通过export enum导出