import { AuditLog } from '../models/AuditLog';
import { AuditAction } from '../enums/CommonEnums';

export class AuditLogRepository {
  private mockData: Partial<AuditLog>[] = [
    {
      id: '1',
      action: AuditAction.CREATE,
      entityType: 'user',
      entityId: 'user-1',
      entityName: 'admin',
      description: '创建用户',
      userId: '1',
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
      sessionId: 'session-1',
      metadata: {},
      isSensitive: false,
      isFailure: false,
      errorMessage: null,
      stackTrace: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];

  /**
   * 创建完整的 AuditLog 实例
   */
  private createAuditLogInstance(data: Partial<AuditLog>): AuditLog {
    const log = new AuditLog();
    Object.assign(log, data);
    return log;
  }

  /**
   * 查找用户的审计日志
   */
  async findByUserId(userId: string, limit: number = 50): Promise<AuditLog[]> {
    const logs = this.mockData
      .filter(log => log.userId === userId)
      .slice(0, limit);
    return logs.map(data => this.createAuditLogInstance(data));
  }

  /**
   * 查找实体的审计日志
   */
  async findByEntityType(entityType: string, entityId?: string, limit: number = 50): Promise<AuditLog[]> {
    const logs = this.mockData
      .filter(log => {
        if (log.entityType !== entityType) return false;
        if (entityId && log.entityId !== entityId) return false;
        return true;
      })
      .slice(0, limit);
    return logs.map(data => this.createAuditLogInstance(data));
  }

  /**
   * 查找敏感操作日志
   */
  async findSensitiveLogs(limit: number = 100): Promise<AuditLog[]> {
    const logs = this.mockData
      .filter(log => log.isSensitive)
      .slice(0, limit);
    return logs.map(data => this.createAuditLogInstance(data));
  }

  /**
   * 查找失败的操作日志
   */
  async findFailureLogs(limit: number = 100): Promise<AuditLog[]> {
    const logs = this.mockData
      .filter(log => log.isFailure)
      .slice(0, limit);
    return logs.map(data => this.createAuditLogInstance(data));
  }

  /**
   * 根据操作类型查找日志
   */
  async findByAction(action: AuditAction, limit: number = 100): Promise<AuditLog[]> {
    const logs = this.mockData
      .filter(log => log.action === action)
      .slice(0, limit);
    return logs.map(data => this.createAuditLogInstance(data));
  }

  /**
   * 根据日期范围查找日志
   */
  async findByDateRange(startDate: Date, endDate: Date, limit: number = 1000): Promise<AuditLog[]> {
    const logs = this.mockData
      .filter(log => {
        return log.createdAt && log.createdAt >= startDate && log.createdAt <= endDate;
      })
      .slice(0, limit);
    return logs.map(data => this.createAuditLogInstance(data));
  }

  /**
   * 创建审计日志
   */
  async createAuditLog(data: Partial<AuditLog>): Promise<AuditLog> {
    const auditLog = this.createAuditLogInstance({
      id: Date.now().toString(),
      action: data.action || AuditAction.CREATE,
      entityType: data.entityType || 'unknown',
      entityId: data.entityId || '',
      entityName: data.entityName || '',
      description: data.description || '',
      userId: data.userId || '',
      ipAddress: data.ipAddress || '',
      userAgent: data.userAgent || '',
      sessionId: data.sessionId || '',
      metadata: data.metadata || {},
      details: data.details || {},
      isSensitive: data.isSensitive || false,
      isFailure: data.isFailure || false,
      errorMessage: data.errorMessage || null,
      stackTrace: data.stackTrace || null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...data
    });

    this.mockData.push(auditLog);
    return auditLog;
  }

  /**
   * 软删除审计日志（标记为删除）
   */
  async softDeleteAuditLog(id: string): Promise<boolean> {
    const index = this.mockData.findIndex(log => log.id === id);
    if (index !== -1) {
      this.mockData.splice(index, 1);
      return true;
    }
    return false;
  }
}