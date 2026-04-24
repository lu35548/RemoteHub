import {
  Entity,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './User';
import { BaseEntity } from './BaseEntity';
import { AuditAction } from '../enums/CommonEnums';

/**
 * Audit log entity for tracking all important actions in the system
 */
@Entity('audit_logs')
@Index(['userId'])
@Index(['action'])
@Index(['entityType'])
@Index(['entityId'])
@Index(['createdAt'])
export class AuditLog extends BaseEntity {
  id!: string;

  @Column({ type: 'uuid', nullable: true })
  @Index()
  userId?: string;

  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  @Index()
  action: AuditAction;

  @Column({ length: 100 })
  @Index()
  entityType: string; // e.g., 'user', 'project', 'connection', 'project_member'

  @Column({ type: 'uuid', nullable: true })
  @Index()
  entityId?: string;

  @Column({ length: 255, nullable: true })
  entityName?: string; // Human-readable entity name

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'json', nullable: true })
  details?: {
    // Old values before change (for UPDATE actions)
    oldValues?: Record<string, any>;
    // New values after change (for CREATE/UPDATE actions)
    newValues?: Record<string, any>;
    // Changed fields (for UPDATE actions)
    changedFields?: string[];
    // Additional context
    context?: Record<string, any>;
    // Reason for the action
    reason?: string;
  };

  @Column({ length: 255, nullable: true })
  ipAddress?: string;

  @Column({ length: 500, nullable: true })
  userAgent?: string;

  @Column({ length: 100, nullable: true })
  sessionId?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  isSensitive: boolean; // Marks sensitive operations (like password changes)

  @Column({ type: 'boolean', default: false })
  isFailure: boolean; // Marks failed operations

  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ type: 'text', nullable: true })
  stackTrace?: string;

  @CreateDateColumn()
  createdAt: Date;

  // Relationships
  @ManyToOne(() => User, user => user.auditLogs, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user?: User;

  // Helper methods
  public get isCreateAction(): boolean {
    return this.action === AuditAction.CREATE;
  }

  public get isUpdateAction(): boolean {
    return this.action === AuditAction.UPDATE;
  }

  public get isDeleteAction(): boolean {
    return this.action === AuditAction.DELETE;
  }

  public get isAuthAction(): boolean {
    return [AuditAction.LOGIN, AuditAction.LOGOUT, AuditAction.ACCESS].includes(this.action);
  }

  public get isDataAction(): boolean {
    return [AuditAction.CREATE, AuditAction.UPDATE, AuditAction.DELETE, AuditAction.EXPORT, AuditAction.IMPORT].includes(this.action);
  }

  public get isSuccessful(): boolean {
    return !this.isFailure;
  }

  public get hasDetails(): boolean {
    return !!this.details && Object.keys(this.details).length > 0;
  }

  public get hasChanges(): boolean {
    return this.details?.changedFields?.length > 0;
  }

  public get changedFieldsList(): string[] {
    return this.details?.changedFields || [];
  }

  public get isUserAction(): boolean {
    return this.userId !== null && this.userId !== undefined;
  }

  public get isSystemAction(): boolean {
    return !this.isUserAction;
  }

  // Static factory methods for creating audit logs
  public static createLog(params: {
    userId?: string;
    action: AuditAction;
    entityType: string;
    entityId?: string;
    entityName?: string;
    description?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    metadata?: any;
    isSensitive?: boolean;
    isFailure?: boolean;
    errorMessage?: string;
    stackTrace?: string;
  }): AuditLog {
    const log = new AuditLog();
    log.userId = params.userId;
    log.action = params.action;
    log.entityType = params.entityType;
    log.entityId = params.entityId;
    log.entityName = params.entityName;
    log.description = params.description;
    log.details = params.details;
    log.ipAddress = params.ipAddress;
    log.userAgent = params.userAgent;
    log.sessionId = params.sessionId;
    log.metadata = params.metadata;
    log.isSensitive = params.isSensitive || false;
    log.isFailure = params.isFailure || false;
    log.errorMessage = params.errorMessage;
    log.stackTrace = params.stackTrace;

    return log;
  }

  public static createSuccessLog(params: {
    userId?: string;
    action: AuditAction;
    entityType: string;
    entityId?: string;
    entityName?: string;
    description?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    metadata?: any;
    isSensitive?: boolean;
  }): AuditLog {
    return AuditLog.createLog({
      ...params,
      isFailure: false,
    });
  }

  public static createFailureLog(params: {
    userId?: string;
    action: AuditAction;
    entityType: string;
    entityId?: string;
    entityName?: string;
    description?: string;
    errorMessage?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    metadata?: any;
    stackTrace?: string;
  }): AuditLog {
    return AuditLog.createLog({
      ...params,
      isFailure: true,
    });
  }

  // Static methods for specific action types
  public static createCreationLog(params: {
    userId?: string;
    entityType: string;
    entityId?: string;
    entityName?: string;
    newValues?: any;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }): AuditLog {
    return AuditLog.createSuccessLog({
      userId: params.userId,
      action: AuditAction.CREATE,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName,
      description: `Created ${params.entityType}: ${params.entityName || params.entityId}`,
      details: {
        newValues: params.newValues,
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      sessionId: params.sessionId,
    });
  }

  public static createUpdateLog(params: {
    userId?: string;
    entityType: string;
    entityId?: string;
    entityName?: string;
    oldValues?: any;
    newValues?: any;
    changedFields?: string[];
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }): AuditLog {
    return AuditLog.createSuccessLog({
      userId: params.userId,
      action: AuditAction.UPDATE,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName,
      description: `Updated ${params.entityType}: ${params.entityName || params.entityId}`,
      details: {
        oldValues: params.oldValues,
        newValues: params.newValues,
        changedFields: params.changedFields,
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      sessionId: params.sessionId,
    });
  }

  public static createDeletionLog(params: {
    userId?: string;
    entityType: string;
    entityId?: string;
    entityName?: string;
    oldValues?: any;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }): AuditLog {
    return AuditLog.createSuccessLog({
      userId: params.userId,
      action: AuditAction.DELETE,
      entityType: params.entityType,
      entityId: params.entityId,
      entityName: params.entityName,
      description: `Deleted ${params.entityType}: ${params.entityName || params.entityId}`,
      details: {
        oldValues: params.oldValues,
        reason: params.reason,
      },
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      sessionId: params.sessionId,
    });
  }

  public static createLoginLog(params: {
    userId?: string;
    success: boolean;
    errorMessage?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }): AuditLog {
    if (params.success) {
      return AuditLog.createSuccessLog({
        userId: params.userId,
        action: AuditAction.LOGIN,
        entityType: 'auth',
        description: 'User logged in successfully',
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        sessionId: params.sessionId,
      });
    } else {
      return AuditLog.createFailureLog({
        userId: params.userId,
        action: AuditAction.LOGIN,
        entityType: 'auth',
        description: 'Login attempt failed',
        errorMessage: params.errorMessage,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        sessionId: params.sessionId,
      });
    }
  }

  public static createLogoutLog(params: {
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }): AuditLog {
    return AuditLog.createSuccessLog({
      userId: params.userId,
      action: AuditAction.LOGOUT,
      entityType: 'auth',
      description: 'User logged out',
      ipAddress: params.ipAddress,
      userAgent: params.userAgent,
      sessionId: params.sessionId,
    });
  }

  public static createAccessLog(params: {
    userId?: string;
    entityType: string;
    entityId?: string;
    entityName?: string;
    success: boolean;
    errorMessage?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
  }): AuditLog {
    if (params.success) {
      return AuditLog.createSuccessLog({
        userId: params.userId,
        action: AuditAction.ACCESS,
        entityType: params.entityType,
        entityId: params.entityId,
        entityName: params.entityName,
        description: `Accessed ${params.entityType}: ${params.entityName || params.entityId}`,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        sessionId: params.sessionId,
      });
    } else {
      return AuditLog.createFailureLog({
        userId: params.userId,
        action: AuditAction.ACCESS,
        entityType: params.entityType,
        entityId: params.entityId,
        entityName: params.entityName,
        description: `Access denied for ${params.entityType}: ${params.entityName || params.entityId}`,
        errorMessage: params.errorMessage,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
        sessionId: params.sessionId,
      });
    }
  }

  // Method to get summary description
  public getSummary(): string {
    if (this.description) return this.description;

    const actionLabels = {
      [AuditAction.CREATE]: 'Created',
      [AuditAction.UPDATE]: 'Updated',
      [AuditAction.DELETE]: 'Deleted',
      [AuditAction.LOGIN]: 'Logged in',
      [AuditAction.LOGOUT]: 'Logged out',
      [AuditAction.ACCESS]: 'Accessed',
      [AuditAction.EXPORT]: 'Exported',
      [AuditAction.IMPORT]: 'Imported',
    };

    const actionLabel = actionLabels[this.action] || this.action;
    const entityDescription = this.entityName || `${this.entityType}:${this.entityId}`;

    return `${actionLabel} ${entityDescription}`;
  }

  // Don't expose sensitive information when serializing
  public toJSON(): Partial<this> {
    const { stackTrace, ...auditLogWithoutSensitiveData } = this;

    // Remove sensitive fields from details if this is a sensitive log
    if (this.isSensitive && this.details) {
      const sanitizedDetails = { ...this.details };

      // Remove password and sensitive fields
      const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential'];
      sensitiveKeys.forEach(key => {
        if (sanitizedDetails[key]) {
          sanitizedDetails[key] = '[REDACTED]';
        }
        if (sanitizedDetails.oldValues?.[key]) {
          sanitizedDetails.oldValues[key] = '[REDACTED]';
        }
        if (sanitizedDetails.newValues?.[key]) {
          sanitizedDetails.newValues[key] = '[REDACTED]';
        }
      });

      return {
        ...auditLogWithoutSensitiveData,
        details: sanitizedDetails,
      } as Partial<this>;
    }

    return auditLogWithoutSensitiveData as Partial<this>;
  }
}