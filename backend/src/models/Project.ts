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
import {
  ProjectStatus,
  ProjectVisibility,
  ProjectPriority,
} from '../enums/ProjectEnums';

/**
 * Project entity representing a project in RemoteHub
 */
@Entity('projects')
@Index(['ownerId'])
@Index(['status'])
@Index(['visibility'])
@Index(['createdAt'])
export class Project extends BaseEntity {
  id!: string;

  @Column({ length: 255 })
  @Index()
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ length: 255, nullable: true })
  avatar?: string;

  @Column({
    type: 'enum',
    enum: ProjectStatus,
    default: ProjectStatus.DRAFT,
  })
  @Index()
  status: ProjectStatus;

  @Column({
    type: 'enum',
    enum: ProjectVisibility,
    default: ProjectVisibility.PRIVATE,
  })
  @Index()
  visibility: ProjectVisibility;

  @Column({
    type: 'enum',
    enum: ProjectPriority,
    default: ProjectPriority.MEDIUM,
  })
  @Index()
  priority: ProjectPriority;

  @Column({ length: 100, nullable: true })
  tags?: string; // Comma-separated tags

  @Column({ type: 'json', nullable: true })
  settings?: {
    allowMemberInvitation: boolean;
    requireApprovalForJoin: boolean;
    maxMembers: number;
    defaultMemberRole: string;
    features: {
      enableChat: boolean;
      enableFileSharing: boolean;
      enableConnections: boolean;
      enableAuditing: boolean;
    };
    notifications: {
      emailNotifications: boolean;
      projectUpdates: boolean;
      memberChanges: boolean;
      connectionChanges: boolean;
    };
  };

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  // Foreign Keys
  @Column({ type: 'uuid' })
  @Index()
  ownerId: string;

  // Relationships
  @ManyToOne('User', 'ownedProjects', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: any;

  @OneToMany('ProjectMember', 'project', { cascade: true })
  members: any[];

  @OneToMany('ProjectConnection', 'project', { cascade: true })
  connections: any[];

  @ManyToMany('User', 'projects')
  @JoinTable({
    name: 'project_members',
    joinColumn: { name: 'projectId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'userId', referencedColumnName: 'id' },
  })
  projectUsers: any[];

  // Helper methods
  public get isActive(): boolean {
    return this.status === ProjectStatus.ACTIVE;
  }

  public get isPublic(): boolean {
    return this.visibility === ProjectVisibility.PUBLIC;
  }

  public get isPrivate(): boolean {
    return this.visibility === ProjectVisibility.PRIVATE;
  }

  public get canBeJoined(): boolean {
    return this.isActive && !this.isPrivate;
  }

  public get memberCount(): number {
    return this.members?.length || 0;
  }

  public get connectionCount(): number {
    return this.connections?.length || 0;
  }

  public get tagArray(): string[] {
    if (!this.tags) return [];
    return this.tags.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0);
  }

  public set tagArray(tags: string[]) {
    this.tags = tags.filter(tag => tag.length > 0).join(',');
  }

  public get hasCustomSettings(): boolean {
    return !!this.settings;
  }

  public get defaultSettings() {
    return {
      allowMemberInvitation: true,
      requireApprovalForJoin: false,
      maxMembers: 50,
      defaultMemberRole: 'viewer',
      features: {
        enableChat: true,
        enableFileSharing: true,
        enableConnections: true,
        enableAuditing: true,
      },
      notifications: {
        emailNotifications: true,
        projectUpdates: true,
        memberChanges: true,
        connectionChanges: true,
      },
    };
  }

  public getEffectiveSettings() {
    const defaults = this.defaultSettings;
    return {
      ...defaults,
      ...this.settings,
      features: {
        ...defaults.features,
        ...this.settings?.features,
      },
      notifications: {
        ...defaults.notifications,
        ...this.settings?.notifications,
      },
    };
  }

  // Method to check if user is member
  public isMember(userId: string): boolean {
    return this.members?.some(member => member.userId === userId && member.isActive) || false;
  }

  // Method to get user's role in project
  public getUserRole(userId: string): string | null {
    const member = this.members?.find(member => member.userId === userId && member.isActive);
    return member?.role || null;
  }

  // Method to check if user has specific permission
  public hasPermission(userId: string, requiredRole: string): boolean {
    const userRole = this.getUserRole(userId);
    if (!userRole) return false;

    const roleLevels = { owner: 4, admin: 3, editor: 2, viewer: 1 };
    return roleLevels[userRole as keyof typeof roleLevels] >= roleLevels[requiredRole as keyof typeof roleLevels];
  }

  // Method to check if user can edit project
  public canUserEdit(userId: string): boolean {
    if (this.ownerId === userId) return true;
    return this.hasPermission(userId, 'editor');
  }

  // Method to check if user can manage members
  public canUserManageMembers(userId: string): boolean {
    if (this.ownerId === userId) return true;
    return this.hasPermission(userId, 'admin');
  }

  // Method to check if user can delete project
  public canUserDelete(userId: string): boolean {
    return this.ownerId === userId;
  }

  // Method to check if user can manage connections in the project
  public canUserManageConnections(userId: string): boolean {
    // Owners and admins can manage connections
    if (this.ownerId === userId) return true;
    return this.hasPermission(userId, 'admin');
  }

  // Don't expose sensitive information when serializing
  public toJSON(): Partial<this> {
    const { members, connections, projectUsers, ...projectWithoutSensitiveData } = this;
    return projectWithoutSensitiveData as Partial<this>;
  }
}

/**
 * Project Member entity representing user membership in projects
 */
@Entity('project_members')
@Index(['projectId'])
@Index(['userId'])
@Index(['role'])
@Index(['status'])
export class ProjectMember extends BaseEntity {
  id!: string;

  @Column({ type: 'uuid' })
  @Index()
  projectId: string;

  @Column({ type: 'uuid' })
  @Index()
  userId: string;

  @Column({
    type: 'enum',
    enum: ['owner', 'admin', 'editor', 'viewer'],
    default: 'viewer',
  })
  @Index()
  role: string;

  @Column({
    type: 'enum',
    enum: ['active', 'pending', 'inactive', 'banned'],
    default: 'pending',
  })
  @Index()
  status: string;

  @Column({ type: 'timestamp', nullable: true })
  joinedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  lastAccessAt?: Date;

  @Column({ length: 500, nullable: true })
  invitationToken?: string;

  @Column({ type: 'timestamp', nullable: true })
  invitationExpiresAt?: Date;

  @Column({ length: 1000, nullable: true })
  notes?: string;

  @Column({ type: 'json', nullable: true })
  permissions?: {
    canManageMembers: boolean;
    canManageConnections: boolean;
    canManageSettings: boolean;
    canInviteMembers: boolean;
    customPermissions: Record<string, boolean>;
  };

  // Relationships
  @ManyToOne('Project', 'members', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: any;

  @ManyToOne('User', 'projectMemberships', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: any;

  // Helper methods
  public get isActive(): boolean {
    return this.status === 'active';
  }

  public get isPending(): boolean {
    return this.status === 'pending';
  }

  public get canAccessProject(): boolean {
    return ['active', 'pending'].includes(this.status);
  }

  public get canManageMembers(): boolean {
    return this.permissions?.canManageMembers || ['owner', 'admin'].includes(this.role);
  }

  public get canManageConnections(): boolean {
    return this.permissions?.canManageConnections || ['owner', 'admin', 'editor'].includes(this.role);
  }

  public get canManageSettings(): boolean {
    return this.permissions?.canManageSettings || ['owner', 'admin'].includes(this.role);
  }

  public get canInviteMembers(): boolean {
    return this.permissions?.canInviteMembers || ['owner', 'admin'].includes(this.role);
  }

  public get isValidInvitation(): boolean {
    return this.isPending &&
           this.invitationToken &&
           this.invitationExpiresAt &&
           new Date() < this.invitationExpiresAt;
  }

  public acceptInvitation(): void {
    this.status = 'active';
    this.joinedAt = new Date();
    this.lastAccessAt = new Date();
    this.invitationToken = null;
    this.invitationExpiresAt = null;
  }

  public rejectInvitation(): void {
    this.status = 'banned';
    this.invitationToken = null;
    this.invitationExpiresAt = null;
  }

  public updateLastAccess(): void {
    this.lastAccessAt = new Date();
  }
}

/**
 * Project Connection entity representing connections associated with projects
 */
@Entity('project_connections')
@Index(['projectId'])
@Index(['connectionId'])
@Index(['addedBy'])
export class ProjectConnection extends BaseEntity {
  id!: string;

  @Column({ type: 'uuid' })
  @Index()
  projectId: string;

  @Column({ type: 'uuid' })
  @Index()
  connectionId: string;

  @Column({ type: 'uuid' })
  @Index()
  addedBy: string;

  @Column({
    type: 'enum',
    enum: ['active', 'inactive'],
    default: 'active',
  })
  @Index()
  status: string;

  @Column({ length: 255, nullable: true })
  alias?: string; // Custom name for the connection within this project

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ length: 100, nullable: true })
  category?: string;

  @Column({ type: 'json', nullable: true })
  permissions?: {
    canView: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canTest: boolean;
    canExport: boolean;
  };

  @Column({ type: 'json', nullable: true })
  tags?: string[];

  @Column({ type: 'timestamp', nullable: true })
  lastTestedAt?: Date;

  @Column({ length: 20, nullable: true })
  testStatus?: string; // 'passed', 'failed', 'pending'

  @Column({ type: 'text', nullable: true })
  testResult?: string;

  // Relationships
  @ManyToOne(() => Project, project => project.connections, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  project: Project;

  @ManyToOne('Connection', 'projectAssociations', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'connectionId' })
  connection: any;

  @ManyToOne('User', 'addedConnections')
  @JoinColumn({ name: 'addedBy' })
  addedByUser: any;

  // Helper methods
  public get isActive(): boolean {
    return this.status === 'active';
  }

  public get isRecentlyTested(): boolean {
    if (!this.lastTestedAt) return false;
    const hoursSinceTest = (Date.now() - this.lastTestedAt.getTime()) / (1000 * 60 * 60);
    return hoursSinceTest < 24; // Consider recent if tested within last 24 hours
  }

  public get testPassed(): boolean {
    return this.testStatus === 'passed';
  }

  public get requiresTesting(): boolean {
    return !this.lastTestedAt || this.testStatus === 'failed';
  }

  public get defaultPermissions() {
    return {
      canView: true,
      canEdit: false,
      canDelete: false,
      canTest: true,
      canExport: false,
    };
  }

  public get effectivePermissions() {
    return {
      ...this.defaultPermissions,
      ...this.permissions,
    };
  }

  public canUserPerform(action: string): boolean {
    return this.effectivePermissions[action as keyof typeof this.effectivePermissions] || false;
  }

  public updateTestResult(status: string, result?: string): void {
    this.lastTestedAt = new Date();
    this.testStatus = status;
    this.testResult = result;
  }
}

// Export enums for use in other files
export {
  ProjectStatus,
  ProjectVisibility,
  ProjectPriority
} from '../enums/ProjectEnums';