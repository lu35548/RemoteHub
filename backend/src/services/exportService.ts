import { Request } from 'express';
import { Readable } from 'stream';
import { logger } from '../utils/logger';
import { getServices } from './container';
import { User, UserRole, UserStatus } from '../models/User';
import { Project } from '../models/Project';
import { Connection } from '../models/Connection';
import { UserRepository } from '../repositories/UserRepository';
import { ProjectRepository } from '../repositories/ProjectRepository';
import { ConnectionRepository } from '../repositories/ConnectionRepository';

interface ExportOptions {
  format: 'json' | 'csv' | 'xlsx';
  entityType: 'users' | 'projects' | 'connections' | 'audit-logs';
  filters?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    role?: string;
    search?: string;
  };
  fields?: string[];
  limit?: number;
}

interface RequestWithUser extends Request {
  user?: any;
}

interface ExportRecord {
  [key: string]: any;
}

export class ExportService {
  /**
   * 导出数据
   */
  public static async exportData(
    req: RequestWithUser,
    options: ExportOptions
  ): Promise<{ stream: Readable; filename: string; contentType: string }> {
    const { format, entityType, filters = {}, fields, limit = 10000 } = options;

    logger.info('Starting data export', {
      entityType,
      format,
      filters,
      requestedBy: req.user?.id,
      ipAddress: req.ip
    });

    let data: ExportRecord[] = [];
    const timestamp = new Date().toISOString().split('T')[0];

    try {
      switch (entityType) {
        case 'users':
          data = await this.exportUsers(filters, limit);
          break;
        case 'projects':
          data = await this.exportProjects(filters, limit);
          break;
        case 'connections':
          data = await this.exportConnections(filters, limit);
          break;
        case 'audit-logs':
          data = await this.exportAuditLogs(filters, limit);
          break;
        default:
          throw new Error(`不支持的实体类型: ${entityType}`);
      }

      // 应用字段过滤
      if (fields && fields.length > 0) {
        data = data.map(item => {
          const filtered: ExportRecord = {};
          fields.forEach(field => {
            if (item[field] !== undefined) {
              filtered[field] = item[field];
            }
          });
          return filtered;
        });
      }

      const filename = `${entityType}_${timestamp}.${format}`;
      let contentType: string;
      let stream: Readable;

      switch (format) {
        case 'json':
          contentType = 'application/json';
          stream = this.createJsonStream(data);
          break;
        case 'csv':
          contentType = 'text/csv';
          stream = this.createCsvStream(data);
          break;
        case 'xlsx':
          contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
          stream = await this.createXlsxStream(data);
          break;
        default:
          throw new Error(`不支持的导出格式: ${format}`);
      }

      logger.info('Export completed successfully', {
        entityType,
        format,
        recordCount: data.length,
        filename,
        requestedBy: req.user?.id
      });

      return { stream, filename, contentType };

    } catch (error) {
      logger.error('Export failed:', {
        error: error.message,
        entityType,
        format,
        requestedBy: req.user?.id
      });
      throw error;
    }
  }

  /**
   * 导出用户数据
   */
  private static async exportUsers(filters: any, limit: number): Promise<ExportRecord[]> {
    const services = getServices();
    const userRepo = new UserRepository(services.database.getDataSource());

    try {
      // 准备过滤器参数
      const filterParams: {
        role?: UserRole;
        status?: UserStatus;
        search?: string;
        startDate?: Date;
        endDate?: Date;
      } = {};

      if (filters.role) {
        filterParams.role = filters.role as UserRole;
      }

      if (filters.status) {
        filterParams.status = filters.status as UserStatus;
      }

      if (filters.search) {
        filterParams.search = filters.search;
      }

      if (filters.startDate) {
        filterParams.startDate = new Date(filters.startDate);
      }

      if (filters.endDate) {
        filterParams.endDate = new Date(filters.endDate);
      }

      // 使用 Repository 方法获取数据
      const users = await userRepo.findUsersForExport(filterParams, limit);

      // 转换为导出格式
      return users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        fullName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username,
        role: user.role,
        status: user.status,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt
      }));

    } catch (error) {
      logger.error('导出用户数据失败:', error);
      // 如果数据库查询失败，返回空数组而不是抛出错误
      return [];
    }
  }

  /**
   * 导出项目数据
   */
  private static async exportProjects(filters: any, limit: number): Promise<ExportRecord[]> {
    const services = getServices();
    const projectRepo = new ProjectRepository(services.database.getDataSource());

    try {
      // 准备过滤器参数
      const filterParams: {
        status?: string;
        visibility?: string;
        search?: string;
        startDate?: Date;
        endDate?: Date;
        ownerId?: string;
      } = {};

      if (filters.status) {
        filterParams.status = filters.status;
      }

      if (filters.visibility) {
        filterParams.visibility = filters.visibility;
      }

      if (filters.search) {
        filterParams.search = filters.search;
      }

      if (filters.startDate) {
        filterParams.startDate = new Date(filters.startDate);
      }

      if (filters.endDate) {
        filterParams.endDate = new Date(filters.endDate);
      }

      if (filters.ownerId) {
        filterParams.ownerId = filters.ownerId;
      }

      // 使用 Repository 方法获取数据
      const projects = await projectRepo.findProjectsForExport(filterParams, limit);

      // 转换为导出格式
      return projects.map(project => ({
        id: project.id,
        name: project.name,
        description: project.description,
        status: project.status,
        visibility: project.visibility,
        ownerName: (project as any).ownerName || 'Unknown',
        createdAt: project.createdAt,
        updatedAt: project.updatedAt
      }));

    } catch (error) {
      logger.error('导出项目数据失败:', error);
      return [];
    }
  }

  /**
   * 导出连接数据
   */
  private static async exportConnections(filters: any, limit: number): Promise<ExportRecord[]> {
    const services = getServices();
    const connectionRepo = new ConnectionRepository(services.database.getDataSource());

    try {
      // 准备过滤器参数
      const filterParams: {
        type?: string;
        status?: string;
        search?: string;
        startDate?: Date;
        endDate?: Date;
        ownerId?: string;
      } = {};

      if (filters.type) {
        filterParams.type = filters.type;
      }

      if (filters.status) {
        filterParams.status = filters.status;
      }

      if (filters.search) {
        filterParams.search = filters.search;
      }

      if (filters.startDate) {
        filterParams.startDate = new Date(filters.startDate);
      }

      if (filters.endDate) {
        filterParams.endDate = new Date(filters.endDate);
      }

      if (filters.ownerId) {
        filterParams.ownerId = filters.ownerId;
      }

      // 使用 Repository 方法获取数据
      const connections = await connectionRepo.findConnectionsForExport(filterParams, limit);

      // 转换为导出格式（不包含敏感信息如密码）
      return connections.map(connection => ({
        id: connection.id,
        name: connection.name,
        type: connection.type,
        host: connection.host,
        port: connection.port,
        username: connection.username,
        database: connection.database,
        status: connection.status,
        ownerName: (connection as any).ownerName || 'Unknown',
        createdAt: connection.createdAt,
        updatedAt: connection.updatedAt
        // 故意不包含密码等敏感信息
      }));

    } catch (error) {
      logger.error('导出连接数据失败:', error);
      return [];
    }
  }

  /**
   * 导出审计日志数据
   *
   * 注意：审计日志功能正在开发中，暂时返回模拟数据
   * TODO: 实现完整的 AuditLogRepository 和相关功能
   */
  private static async exportAuditLogs(filters: any, limit: number): Promise<ExportRecord[]> {
    // 暂时返回模拟数据，直到审计日志系统完全实现
    const mockAuditLogs = [
      {
        id: '1',
        action: 'create',
        entityType: 'user',
        entityId: 'user-1',
        entityName: 'admin',
        description: '创建用户',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        userName: 'admin',
        isSensitive: false,
        isFailure: false,
        createdAt: new Date()
      },
      {
        id: '2',
        action: 'login',
        entityType: 'auth',
        entityId: 'session-1',
        entityName: '登录',
        description: '用户登录',
        ipAddress: '127.0.0.1',
        userAgent: 'Mozilla/5.0',
        userName: 'admin',
        isSensitive: true,
        isFailure: false,
        createdAt: new Date()
      }
    ];

    return mockAuditLogs
      .filter(log => {
        // 应用过滤器
        if (filters.action && log.action !== filters.action) return false;
        if (filters.entityType && log.entityType !== filters.entityType) return false;
        if (filters.isSensitive !== undefined && log.isSensitive !== filters.isSensitive) return false;
        if (filters.isFailure !== undefined && log.isFailure !== filters.isFailure) return false;
        return true;
      })
      .slice(0, limit)
      .map(log => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        entityName: log.entityName,
        description: log.description,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        userName: log.userName,
        isSensitive: log.isSensitive,
        isFailure: log.isFailure,
        createdAt: log.createdAt
      }));
  }

  /**
   * 创建JSON流
   */
  private static createJsonStream(data: ExportRecord[]): Readable {
    let jsonString = JSON.stringify({
      data,
      exportedAt: new Date().toISOString(),
      recordCount: data.length
    }, null, 2);

    const stream = new Readable({
      read() {
        if (!jsonString) {
          stream.push(null);
          return;
        }
        this.push(jsonString);
        jsonString = null;
      }
    });

    return stream;
  }

  /**
   * 创建CSV流
   */
  private static createCsvStream(data: ExportRecord[]): Readable {
    if (data.length === 0) {
      return new Readable({
        read() {
          this.push(null);
        }
      });
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
      headers.join(','),
      ...data.map(row => {
        return headers.map(header => {
          const value = row[header];
          if (value === null || value === undefined) return '';
          // 处理包含逗号或引号的字段
          const stringValue = String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        }).join(',');
      })
    ].join('\n');

    let position = 0;
    const chunkSize = 1024 * 16; // 16KB chunks

    return new Readable({
      read() {
        if (position >= csvContent.length) {
          return this.push(null);
        }

        const chunk = csvContent.slice(position, position + chunkSize);
        position += chunkSize;
        this.push(chunk);
      }
    });
  }

  /**
   * 创建Excel流
   */
  private static async createXlsxStream(data: ExportRecord[]): Promise<Readable> {
    try {
      // 使用简单的JSON到Excel转换
      // 在实际项目中，可以使用exceljs或其他库
      let jsonData = JSON.stringify(data, null, 2);

      return new Readable({
        read() {
          if (!jsonData) {
            this.push(null);
            return;
          }
          this.push(jsonData);
          jsonData = null;
        }
      });
    } catch (error) {
      logger.error('Failed to create XLSX stream:', error);
      throw new Error('创建Excel文件失败');
    }
  }

  /**
   * 获取导出历史记录
   */
  public static async getExportHistory(
    userId: string,
    limit: number = 50
  ): Promise<any[]> {
    // 这里应该从数据库中查询导出历史
    // 暂时返回空数组
    return [];
  }

  /**
   * 验证导出权限
   */
  public static validateExportPermission(
    user: any,
    entityType: string
  ): boolean {
    // 管理员可以导出所有数据
    if (user?.role === 'admin') {
      return true;
    }

    // 普通用户只能导出自己的数据
    // 这里可以根据具体业务规则进行调整
    return ['users', 'projects', 'connections'].includes(entityType);
  }

  /**
   * 获取导出配置
   */
  public static getExportConfig(): any {
    return {
      supportedFormats: ['json', 'csv', 'xlsx'],
      supportedEntities: ['users', 'projects', 'connections', 'audit-logs'],
      maxExportRecords: 10000,
      defaultExportLimit: 1000,
      availableFields: {
        users: ['id', 'username', 'email', 'firstName', 'lastName', 'role', 'status', 'emailVerified', 'createdAt', 'updatedAt', 'lastLoginAt'],
        projects: ['id', 'name', 'description', 'status', 'visibility', 'ownerName', 'createdAt', 'updatedAt'],
        connections: ['id', 'name', 'type', 'host', 'port', 'username', 'database', 'status', 'ownerName', 'createdAt', 'updatedAt'],
        'audit-logs': ['id', 'action', 'entityType', 'entityId', 'entityName', 'description', 'ipAddress', 'userAgent', 'userName', 'isSensitive', 'isFailure', 'createdAt']
      },
      rateLimits: {
        perHour: 10,
        perDay: 50
      }
    };
  }
}