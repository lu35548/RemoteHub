import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { User } from './User';
import { ProjectConnection } from './Project';
import {
  ConnectionType,
  ConnectionStatus,
  ConnectionSecurityLevel,
  ConnectionCategory,
} from '../enums/ConnectionEnums';
import { DatabaseEncryption } from '../utils/database';

/**
 * Connection entity representing database connections in RemoteHub
 */
@Entity('connections')
@Index(['ownerId'])
@Index(['type'])
@Index(['status'])
@Index(['category'])
@Index(['createdAt'])
export class Connection extends BaseEntity {
  id!: string;

  @Column({ length: 255 })
  @Index()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ length: 100, nullable: true })
  avatar?: string;

  @Column({
    type: 'enum',
    enum: ConnectionType,
  })
  @Index()
  type: ConnectionType;

  @Column({
    type: 'enum',
    enum: ConnectionStatus,
    default: ConnectionStatus.INACTIVE,
  })
  @Index()
  status: ConnectionStatus;

  @Column({
    type: 'enum',
    enum: ConnectionSecurityLevel,
    default: ConnectionSecurityLevel.NONE,
  })
  securityLevel: ConnectionSecurityLevel;

  @Column({
    type: 'enum',
    enum: ConnectionCategory,
    default: ConnectionCategory.DEVELOPMENT,
  })
  @Index()
  category: ConnectionCategory;

  @Column({ length: 255, nullable: true })
  host?: string;

  @Column({ type: 'int', nullable: true })
  port?: number;

  @Column({ length: 100, nullable: true })
  database?: string;

  @Column({ length: 255, nullable: true })
  username?: string;

  // Encrypted password storage
  @Column({ type: 'text', nullable: true })
  _encryptedPassword?: string;

  @Column({ length: 500, nullable: true })
  connectionString?: string; // Alternative full connection string

  // SSL/TLS Configuration
  @Column({ type: 'json', nullable: true })
  sslConfig?: {
    enabled: boolean;
    ca?: string;
    cert?: string;
    key?: string;
    rejectUnauthorized?: boolean;
    checkServerIdentity?: boolean;
  };

  // SSH Tunnel Configuration
  @Column({ type: 'json', nullable: true })
  sshConfig?: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    password?: string; // Encrypted
    privateKey?: string; // Encrypted
    passphrase?: string; // Encrypted
  };

  // Additional connection parameters
  @Column({ type: 'json', nullable: true })
  connectionParams?: Record<string, any>;

  @Column({ length: 1000, nullable: true })
  tags?: string; // Comma-separated tags

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  // Health and monitoring
  @Column({ type: 'timestamp', nullable: true })
  lastTestedAt?: Date;

  @Column({ length: 20, nullable: true })
  lastTestStatus?: string; // 'passed', 'failed', 'timeout'

  @Column({ type: 'text', nullable: true })
  lastTestResult?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastConnectedAt?: Date;

  @Column({ type: 'int', default: 0 })
  connectionCount: number;

  @Column({ type: 'int', default: 0 })
  failureCount: number;

  @Column({ type: 'timestamp', nullable: true })
  nextHealthCheck?: Date;

  // Foreign Keys
  @Column({ type: 'uuid' })
  @Index()
  ownerId: string;

  // Relationships
  @ManyToOne(() => User, user => user.connections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;

  @OneToMany(() => ProjectConnection, projectConnection => projectConnection.connection)
  projectAssociations: ProjectConnection[];

  // Helper methods for password encryption/decryption
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

  // Helper methods for SSH config encryption
  public setSSHPassword(password: string, encryptionKey?: string): void {
    if (!this.sshConfig) this.sshConfig = { enabled: false, host: '', port: 22, username: '' };
    const key = encryptionKey || process.env.CONNECTION_ENCRYPTION_KEY || 'default-key';
    this.sshConfig.password = DatabaseEncryption.encrypt(password, key);
  }

  public getSSHPassword(encryptionKey?: string): string {
    if (!this.sshConfig?.password) return '';
    const key = encryptionKey || process.env.CONNECTION_ENCRYPTION_KEY || 'default-key';
    return DatabaseEncryption.decrypt(this.sshConfig.password, key);
  }

  public setSSHPrivateKey(privateKey: string, encryptionKey?: string): void {
    if (!this.sshConfig) this.sshConfig = { enabled: false, host: '', port: 22, username: '' };
    const key = encryptionKey || process.env.CONNECTION_ENCRYPTION_KEY || 'default-key';
    this.sshConfig.privateKey = DatabaseEncryption.encrypt(privateKey, key);
  }

  public getSSHPrivateKey(encryptionKey?: string): string {
    if (!this.sshConfig?.privateKey) return '';
    const key = encryptionKey || process.env.CONNECTION_ENCRYPTION_KEY || 'default-key';
    return DatabaseEncryption.decrypt(this.sshConfig.privateKey, key);
  }

  public setSSHPassphrase(passphrase: string, encryptionKey?: string): void {
    if (!this.sshConfig) this.sshConfig = { enabled: false, host: '', port: 22, username: '' };
    const key = encryptionKey || process.env.CONNECTION_ENCRYPTION_KEY || 'default-key';
    this.sshConfig.passphrase = DatabaseEncryption.encrypt(passphrase, key);
  }

  public getSSHPassphrase(encryptionKey?: string): string {
    if (!this.sshConfig?.passphrase) return '';
    const key = encryptionKey || process.env.CONNECTION_ENCRYPTION_KEY || 'default-key';
    return DatabaseEncryption.decrypt(this.sshConfig.passphrase, key);
  }

  // Connection validation helpers
  public get isValidConfiguration(): boolean {
    const config = {
      [ConnectionType.MYSQL]: () => !!this.host && !!this.username && !!this.database,
      [ConnectionType.POSTGRESQL]: () => !!this.host && !!this.username && !!this.database,
      [ConnectionType.SQLITE]: () => !!this.database,
      [ConnectionType.SQLSERVER]: () => !!this.host && !!this.username && !!this.database,
      [ConnectionType.ORACLE]: () => !!this.host && !!this.username && !!this.database,
      [ConnectionType.MONGODB]: () => !!this.host,
      [ConnectionType.REDIS]: () => !!this.host,
    };

    const validator = config[this.type];
    return validator ? validator() : false;
  }

  public get requiresAuthentication(): boolean {
    const authRequiredTypes = [
      ConnectionType.MYSQL,
      ConnectionType.POSTGRESQL,
      ConnectionType.SQLSERVER,
      ConnectionType.ORACLE,
      ConnectionType.MONGODB,
    ];

    return authRequiredTypes.includes(this.type);
  }

  public get supportsSSL(): boolean {
    const sslSupportedTypes = [
      ConnectionType.MYSQL,
      ConnectionType.POSTGRESQL,
      ConnectionType.SQLSERVER,
      ConnectionType.MONGODB,
      ConnectionType.REDIS,
    ];

    return sslSupportedTypes.includes(this.type);
  }

  public get supportsSSH(): boolean {
    const sshSupportedTypes = [
      ConnectionType.MYSQL,
      ConnectionType.POSTGRESQL,
      ConnectionType.SQLSERVER,
      ConnectionType.ORACLE,
    ];

    return sshSupportedTypes.includes(this.type);
  }

  // Connection status helpers
  public get isActive(): boolean {
    return this.status === ConnectionStatus.ACTIVE;
  }

  public get hasErrors(): boolean {
    return this.status === ConnectionStatus.ERROR;
  }

  public get isHealthy(): boolean {
    return this.lastTestStatus === 'passed' && this.failureCount === 0;
  }

  public get requiresAttention(): boolean {
    return this.hasErrors || this.requiresTesting;
  }

  public get requiresTesting(): boolean {
    const hoursSinceTest = this.lastTestedAt
      ? (Date.now() - this.lastTestedAt.getTime()) / (1000 * 60 * 60)
      : Infinity;

    return hoursSinceTest > 24 || this.lastTestStatus !== 'passed';
  }

  public get reliability(): number {
    if (this.connectionCount === 0) return 100; // 100% for untested connections
    const successRate = ((this.connectionCount - this.failureCount) / this.connectionCount) * 100;
    return Math.max(0, Math.min(100, successRate));
  }

  // Connection management helpers
  public recordTestAttempt(status: string, result?: string): void {
    this.lastTestedAt = new Date();
    this.lastTestStatus = status;
    this.lastTestResult = result;

    if (status === 'passed') {
      this.failureCount = 0;
      if (this.status !== ConnectionStatus.ACTIVE) {
        this.status = ConnectionStatus.ACTIVE;
      }
    } else {
      this.failureCount += 1;
      if (this.failureCount >= 3 && this.status !== ConnectionStatus.ERROR) {
        this.status = ConnectionStatus.ERROR;
      }
    }
  }

  public recordConnection(success: boolean): void {
    this.connectionCount += 1;
    if (success) {
      this.lastConnectedAt = new Date();
      this.failureCount = 0;
    } else {
      this.failureCount += 1;
    }
  }

  public resetHealthStatus(): void {
    this.connectionCount = 0;
    this.failureCount = 0;
    this.lastTestStatus = undefined;
    this.lastTestResult = undefined;
    this.lastConnectedAt = undefined;
  }

  // Tag management helpers
  public get tagArray(): string[] {
    if (!this.tags) return [];
    return this.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }

  public set tagArray(tags: string[]) {
    this.tags = tags.filter(tag => tag.length > 0).join(',');
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

  // Connection string generation
  public generateConnectionString(): string {
    const config = {
      [ConnectionType.MYSQL]: () => {
        const port = this.port || 3306;
        const auth = this.hasPassword() ? `${this.username}:${this.getPassword()}@` : `${this.username}@`;
        return `mysql://${auth}${this.host}:${port}/${this.database}`;
      },
      [ConnectionType.POSTGRESQL]: () => {
        const port = this.port || 5432;
        const auth = this.hasPassword() ? `${this.username}:${this.getPassword()}@` : `${this.username}@`;
        return `postgresql://${auth}${this.host}:${port}/${this.database}`;
      },
      [ConnectionType.SQLITE]: () => {
        return `sqlite:${this.database}`;
      },
      [ConnectionType.SQLSERVER]: () => {
        const port = this.port || 1433;
        const auth = this.hasPassword() ? `${this.username};Password=${this.getPassword()}` : `User Id=${this.username}`;
        return `Server=${this.host},${port};Database=${this.database};${auth}`;
      },
      [ConnectionType.MONGODB]: () => {
        const port = this.port || 27017;
        const auth = this.hasPassword() ? `${this.username}:${this.getPassword()}@` : `${this.username}@`;
        return `mongodb://${auth}${this.host}:${port}/${this.database}`;
      },
      [ConnectionType.REDIS]: () => {
        const port = this.port || 6379;
        const auth = this.hasPassword() ? `:${this.getPassword()}@` : '';
        return `redis://${auth}${this.host}:${port}`;
      },
      [ConnectionType.ORACLE]: () => {
        const port = this.port || 1521;
        const auth = this.hasPassword() ? `${this.username}:${this.getPassword()}@` : '';
        return `oracle://${auth}${this.host}:${port}/${this.database}`;
      },
      };

    const generator = config[this.type];
    return generator ? generator() : '';
  }

  // Security helpers
  public get isSecure(): boolean {
    return this.securityLevel !== ConnectionSecurityLevel.NONE;
  }

  public get securityLevelScore(): number {
    const scores = {
      [ConnectionSecurityLevel.NONE]: 0,
      [ConnectionSecurityLevel.SSL]: 1,
      [ConnectionSecurityLevel.SSH]: 2,
      [ConnectionSecurityLevel.VPN]: 3,
    };

    return scores[this.securityLevel] || 0;
  }

  public enhanceSecurity(level: ConnectionSecurityLevel): void {
    this.securityLevel = level;

    if (level === ConnectionSecurityLevel.SSL && this.supportsSSL) {
      if (!this.sslConfig) {
        this.sslConfig = {
          enabled: true,
          rejectUnauthorized: true,
          checkServerIdentity: true,
        };
      }
    }
  }

  // Clone method for creating copies
  public clone(newName?: string): Connection {
    const clone = new Connection();
    clone.name = newName || `${this.name} (Copy)`;
    clone.description = this.description;
    clone.type = this.type;
    clone.securityLevel = this.securityLevel;
    clone.category = ConnectionCategory.DEVELOPMENT;
    clone.host = this.host;
    clone.port = this.port;
    clone.database = this.database;
    clone.username = this.username;
    clone.connectionString = this.connectionString;
    clone.sslConfig = this.sslConfig ? { ...this.sslConfig } : undefined;
    clone.sshConfig = this.sshConfig ? { ...this.sshConfig } : undefined;
    clone.connectionParams = this.connectionParams ? { ...this.connectionParams } : undefined;
    clone.tags = this.tags;
    clone.metadata = this.metadata ? { ...this.metadata } : undefined;

    // Copy encrypted password
    if (this._encryptedPassword) {
      clone._encryptedPassword = this._encryptedPassword;
    }

    return clone;
  }

  // Don't expose sensitive information when serializing
  public toJSON(): Partial<this> {
    const {
      _encryptedPassword,
      sshConfig,
      projectAssociations,
      ...connectionWithoutSensitiveData
    } = this;

    // Remove sensitive fields from SSH config
    const sanitizedSshConfig = sshConfig ? {
      ...sshConfig,
      password: sshConfig.password ? '[ENCRYPTED]' : undefined,
      privateKey: sshConfig.privateKey ? '[ENCRYPTED]' : undefined,
      passphrase: sshConfig.passphrase ? '[ENCRYPTED]' : undefined,
    } : undefined;

    return {
      ...connectionWithoutSensitiveData,
      sshConfig: sanitizedSshConfig,
      hasPassword: this.hasPassword(),
    } as any;
  }

  // Export connection configuration (without sensitive data)
  public exportConfig(): any {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      category: this.category,
      host: this.host,
      port: this.port,
      database: this.database,
      username: this.username,
      securityLevel: this.securityLevel,
      sslConfig: this.sslConfig,
      connectionParams: this.connectionParams,
      tags: this.tagArray,
      metadata: this.metadata,
      // Note: Password and SSH credentials are not exported
    };
  }
}

// Export enums for use in other files
export {
  ConnectionType,
  ConnectionStatus,
  ConnectionSecurityLevel,
  ConnectionCategory
} from '../enums/ConnectionEnums';