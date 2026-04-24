import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  ManyToMany,
  JoinTable,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from './BaseEntity';
import { Connection } from './Connection';
import { AuditLog } from './AuditLog';

// Import entities for relationships (avoiding circular dependencies)
let Project: any;
let ProjectMember: any;
let ProjectConnection: any;

try {
  Project = require('./Project').Project;
} catch (e) {
  // Handle circular dependency
}

try {
  ProjectMember = require('./ProjectMember').ProjectMember;
} catch (e) {
  // Handle circular dependency
}

try {
  ProjectConnection = require('./ProjectConnection').ProjectConnection;
} catch (e) {
  // Handle circular dependency
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
}

@Entity('users')
@Index(['email'])
@Index(['username'])
export class User extends BaseEntity {
  id!: string;

  @Column({ length: 100 })
  @Index()
  username: string;

  @Column({ length: 255 })
  @Index()
  email: string;

  @Column({ length: 255 })
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ type: 'text', nullable: true })
  avatar?: string;

  @Column({ length: 100, nullable: true })
  firstName?: string;

  @Column({ length: 100, nullable: true })
  lastName?: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ length: 20, nullable: true })
  phone?: string;

  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  emailVerifiedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date;

  @Column({ length: 45, nullable: true })
  lastLoginIp?: string;

  @Column({ type: 'int', default: 0 })
  loginAttempts: number;

  @Column({ type: 'timestamp', nullable: true })
  lockedUntil?: Date;

  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  @Column({ type: 'json', nullable: true })
  preferences?: Record<string, any>;

  @Column({ type: 'timestamp', nullable: true })
  passwordChangedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetRequestedAt?: Date;

  @Column({ length: 255, nullable: true })
  passwordResetToken?: string;

  @Column({ type: 'timestamp', nullable: true })
  passwordResetExpiresAt?: Date;

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled: boolean;

  @Column({ length: 32, nullable: true })
  twoFactorSecret?: string;

  @Column({ type: 'json', nullable: true })
  backupCodes?: string[];

  // Online status fields
  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt?: Date;

  @Column({ length: 255, nullable: true })
  currentSessionId?: string;

  @Column({ length: 45, nullable: true })
  lastSeenIp?: string;

  @Column({ type: 'boolean', default: false })
  isOnline: boolean;

  @Column({ type: 'json', nullable: true })
  onlineStatus?: {
    status: 'online' | 'away' | 'busy' | 'offline';
    lastActivity: Date;
    currentDevice?: string;
    userAgent?: string;
  };

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relationships
  @OneToMany('Project', 'owner')
  ownedProjects: any[];

  @OneToMany('ProjectMember', 'user')
  projectMemberships: any[];

  @ManyToMany('Project', 'projectUsers')
  @JoinTable({
    name: 'project_members',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'projectId', referencedColumnName: 'id' },
  })
  projects: any[];

  @OneToMany(() => Connection, connection => connection.owner)
  connections: Connection[];

  @OneToMany('ProjectConnection', 'addedByUser')
  addedConnections: any[];

  @OneToMany(() => AuditLog, auditLog => auditLog.user)
  auditLogs: AuditLog[];

  // Helper methods
  public get fullName(): string {
    if (this.firstName && this.lastName) {
      return `${this.firstName} ${this.lastName}`;
    }
    return this.username;
  }

  public get isActive(): boolean {
    return this.status === UserStatus.ACTIVE;
  }

  public get isLocked(): boolean {
    return this.lockedUntil ? this.lockedUntil > new Date() : false;
  }

  public get isEmailVerified(): boolean {
    return this.emailVerified;
  }

  public get hasTwoFactorEnabled(): boolean {
    return this.twoFactorEnabled;
  }

  // Method to check if user can attempt login
  public canAttemptLogin(): boolean {
    if (this.isLocked) {
      return false;
    }

    const maxAttempts = 5; // This should come from config
    return this.loginAttempts < maxAttempts;
  }

  // Method to increment login attempts
  public incrementLoginAttempts(): void {
    this.loginAttempts += 1;

    const maxAttempts = 5;
    const lockoutTime = 15 * 60 * 1000; // 15 minutes

    if (this.loginAttempts >= maxAttempts) {
      this.lockedUntil = new Date(Date.now() + lockoutTime);
    }
  }

  // Method to reset login attempts
  public resetLoginAttempts(): void {
    this.loginAttempts = 0;
    this.lockedUntil = undefined;
  }

  // Method to update last login
  public updateLastLogin(ip?: string): void {
    this.lastLoginAt = new Date();
    if (ip) {
      this.lastLoginIp = ip;
    }
    this.resetLoginAttempts();
  }

  // Method to check if password reset token is valid
  public isPasswordResetTokenValid(): boolean {
    if (!this.passwordResetToken || !this.passwordResetExpiresAt) {
      return false;
    }

    return new Date() < this.passwordResetExpiresAt;
  }

  // Method to clear password reset fields
  public clearPasswordResetFields(): void {
    this.passwordResetToken = undefined;
    this.passwordResetExpiresAt = undefined;
    this.passwordResetRequestedAt = undefined;
  }

  
  // Project-related helper methods
  public get ownedProjectsCount(): number {
    return this.ownedProjects?.length || 0;
  }

  public get projectMembershipsCount(): number {
    return this.projectMemberships?.length || 0;
  }

  public get activeProjectsCount(): number {
    return this.projects?.filter(project => project.isActive).length || 0;
  }

  public get connectionsCount(): number {
    return this.connections?.length || 0;
  }

  public get activeConnectionsCount(): number {
    return this.connections?.filter(connection => connection.isActive).length || 0;
  }

  public isProjectMember(projectId: string): boolean {
    return this.projects?.some(project => project.id === projectId) || false;
  }

  public isProjectOwner(projectId: string): boolean {
    return this.ownedProjects?.some(project => project.id === projectId) || false;
  }

  public getProjectRole(projectId: string): string | null {
    const membership = this.projectMemberships?.find(member => member.projectId === projectId && member.isActive);
    return membership?.role || null;
  }

  public canAccessProject(projectId: string): boolean {
    return this.isProjectOwner(projectId) || this.isProjectMember(projectId);
  }

  public canManageProject(projectId: string): boolean {
    return this.isProjectOwner(projectId) ||
           ['owner', 'admin'].includes(this.getProjectRole(projectId) || '');
  }

  // Online status methods
  public updateOnlineStatus(isOnline: boolean, sessionId?: string, ip?: string, userAgent?: string): void {
    this.isOnline = isOnline;
    this.lastSeenAt = new Date();

    if (sessionId) {
      this.currentSessionId = sessionId;
    }

    if (ip) {
      this.lastSeenIp = ip;
    }

    // Update online status details
    if (this.onlineStatus) {
      this.onlineStatus.status = isOnline ? 'online' : 'offline';
      this.onlineStatus.lastActivity = new Date();
      if (userAgent) {
        this.onlineStatus.userAgent = userAgent;
      }
    } else {
      this.onlineStatus = {
        status: isOnline ? 'online' : 'offline',
        lastActivity: new Date(),
        userAgent
      };
    }
  }

  public setOnlineStatus(status: 'online' | 'away' | 'busy'): void {
    if (this.onlineStatus) {
      this.onlineStatus.status = status;
      this.onlineStatus.lastActivity = new Date();
    } else {
      this.onlineStatus = {
        status,
        lastActivity: new Date()
      };
    }
  }

  public getOnlineStatusForJSON(): any {
    return {
      isOnline: this.isOnline,
      lastSeenAt: this.lastSeenAt,
      status: this.onlineStatus?.status || 'offline',
      lastActivity: this.onlineStatus?.lastActivity
    };
  }

  // Check if user is considered online based on last seen time
  public isConsideredOnline(timeoutMinutes: number = 5): boolean {
    if (this.isOnline && this.lastSeenAt) {
      const now = new Date();
      const diff = now.getTime() - this.lastSeenAt.getTime();
      return diff < (timeoutMinutes * 60 * 1000);
    }
    return false;
  }

  // Don't expose sensitive information when serializing
  public toJSON(): Partial<this> {
    const {
      password,
      twoFactorSecret,
      backupCodes,
      passwordResetToken,
      ...userWithoutSensitiveData
    } = this;
    return userWithoutSensitiveData as Partial<this>;
  }
}

// Export enums for use in other files
// Note: Enums are already declared above with export keyword