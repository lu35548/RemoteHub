import { logger } from '@/utils/logger';
import { getServices } from './container';
import { compressToGzip, decompressFromGzip } from '@/utils/compression';
import { encryptData, decryptData } from '@/utils/encryption';
import * as fs from 'fs/promises';
import * as path from 'path';
import { User } from '@/models/User';
import { Project } from '@/models/Project';
import { Connection } from '@/models/Connection';
import { AuditLog } from '@/models/AuditLog';

interface BackupOptions {
  includeUsers?: boolean;
  includeProjects?: boolean;
  includeConnections?: boolean;
  includeAuditLogs?: boolean;
  compress?: boolean;
  encrypt?: boolean;
  encryptionKey?: string;
  outputFormat?: 'json' | 'sql';
}

interface RestoreOptions {
  overwriteExisting?: boolean;
  validateData?: boolean;
  encryptionKey?: string;
  skipEntities?: string[];
}

interface BackupMetadata {
  id: string;
  version: string;
  createdAt: Date;
  createdBy: string;
  description?: string;
  entities: {
    users?: { count: number; lastBackup: Date };
    projects?: { count: number; lastBackup: Date };
    connections?: { count: number; lastBackup: Date };
    auditLogs?: { count: number; lastBackup: Date };
  };
  options: BackupOptions;
  stats: {
    totalRecords: number;
    compressedSize?: number;
    originalSize?: number;
  };
}

interface BackupData {
  metadata: BackupMetadata;
  data: {
    users?: any[];
    projects?: any[];
    connections?: any[];
    auditLogs?: any[];
  };
}

export class BackupService {
  private static readonly BACKUP_DIR = process.env.BACKUP_DIR || './backups';
  private static readonly MAX_BACKUPS = parseInt(process.env.MAX_BACKUPS || '10');

  /**
   * 创建完整数据备份
   */
  public static async createBackup(
    userId: string,
    options: BackupOptions = {},
    description?: string
  ): Promise<{ backupId: string; filePath: string; metadata: BackupMetadata }> {
    const services = getServices();
    const backupId = `backup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date();

    logger.info('开始创建数据备份', {
      backupId,
      userId,
      options,
      description,
    });

    try {
      // 确保备份目录存在
      await this.ensureBackupDirectory();

      // 设置默认选项
      const backupOptions: BackupOptions = {
        includeUsers: true,
        includeProjects: true,
        includeConnections: true,
        includeAuditLogs: true,
        compress: true,
        encrypt: false,
        outputFormat: 'json',
        ...options,
      };

      // 收集数据
      const data: any = {};
      let totalRecords = 0;
      const entities: BackupMetadata['entities'] = {};

      if (backupOptions.includeUsers) {
        const users = await services.database.query('SELECT * FROM users');
        data.users = users;
        entities.users = { count: users.length, lastBackup: timestamp };
        totalRecords += users.length;
      }

      if (backupOptions.includeProjects) {
        const projects = await services.database.query('SELECT * FROM projects');
        data.projects = projects;
        entities.projects = { count: projects.length, lastBackup: timestamp };
        totalRecords += projects.length;
      }

      if (backupOptions.includeConnections) {
        const connections = await services.database.query('SELECT * FROM connections');
        data.connections = connections;
        entities.connections = { count: connections.length, lastBackup: timestamp };
        totalRecords += connections.length;
      }

      if (backupOptions.includeAuditLogs) {
        const auditLogs = await services.database.query('SELECT * FROM audit_logs LIMIT 10000'); // 限制审计日志数量
        data.auditLogs = auditLogs;
        entities.auditLogs = { count: auditLogs.length, lastBackup: timestamp };
        totalRecords += auditLogs.length;
      }

      // 创建备份元数据
      const metadata: BackupMetadata = {
        id: backupId,
        version: '1.0',
        createdAt: timestamp,
        createdBy: userId,
        description,
        entities,
        options: backupOptions,
        stats: {
          totalRecords,
        },
      };

      const backupData: BackupData = {
        metadata,
        data,
      };

      let serializedData = JSON.stringify(backupData, null, 2);
      const originalSize = Buffer.byteLength(serializedData, 'utf8');

      // 加密数据
      if (backupOptions.encrypt && backupOptions.encryptionKey) {
        serializedData = await encryptData(serializedData, backupOptions.encryptionKey);
        logger.info('备份数据已加密', { backupId });
      }

      // 压缩数据
      if (backupOptions.compress) {
        serializedData = await compressToGzip(serializedData);
        metadata.stats.compressedSize = Buffer.byteLength(serializedData, 'utf8');
      }

      metadata.stats.originalSize = originalSize;

      // 保存备份文件
      const fileName = `${backupId}.backup${backupOptions.compress ? '.gz' : ''}${backupOptions.encrypt ? '.enc' : ''}`;
      const filePath = path.join(this.BACKUP_DIR, fileName);

      await fs.writeFile(filePath, serializedData, 'utf8');

      // 清理旧备份
      await this.cleanupOldBackups();

      logger.info('数据备份创建成功', {
        backupId,
        filePath,
        totalRecords,
        originalSize: metadata.stats.originalSize,
        compressedSize: metadata.stats.compressedSize,
      });

      return { backupId, filePath, metadata };

    } catch (error: any) {
      logger.error('创建数据备份失败:', {
        backupId,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`创建备份失败: ${error.message}`);
    }
  }

  /**
   * 从备份恢复数据
   */
  public static async restoreFromBackup(
    backupFilePath: string,
    userId: string,
    options: RestoreOptions = {}
  ): Promise<{ success: boolean; restoredEntities: string[]; errors: string[] }> {
    const services = getServices();
    const restoredEntities: string[] = [];
    const errors: string[] = [];

    logger.info('开始从备份恢复数据', {
      backupFilePath,
      userId,
      options,
    });

    try {
      // 读取备份文件
      let backupDataStr = await fs.readFile(backupFilePath, 'utf8');

      // 解密数据
      if (backupFilePath.endsWith('.enc') && options.encryptionKey) {
        backupDataStr = await decryptData(backupDataStr, options.encryptionKey);
        logger.info('备份数据已解密', { backupFilePath });
      }

      // 解压缩数据
      if (backupFilePath.endsWith('.gz')) {
        backupDataStr = await decompressFromGzip(backupDataStr);
      }

      const backupData: BackupData = JSON.parse(backupDataStr);
      const { metadata, data } = backupData;

      logger.info('解析备份元数据', {
        backupId: metadata.id,
        version: metadata.version,
        createdAt: metadata.createdAt,
        totalRecords: metadata.stats.totalRecords,
      });

      // 验证备份数据
      if (options.validateData) {
        const validationErrors = await this.validateBackupData(backupData);
        if (validationErrors.length > 0) {
          throw new Error(`备份数据验证失败: ${validationErrors.join(', ')}`);
        }
      }

      const skipEntities = options.skipEntities || [];

      // 恢复用户数据
      if (data.users && !skipEntities.includes('users')) {
        try {
          await this.restoreUsers(services.database, data.users, options.overwriteExisting);
          restoredEntities.push(`用户 (${data.users.length} 条记录)`);
        } catch (error: any) {
          errors.push(`恢复用户数据失败: ${error.message}`);
        }
      }

      // 恢复项目数据
      if (data.projects && !skipEntities.includes('projects')) {
        try {
          await this.restoreProjects(services.database, data.projects, options.overwriteExisting);
          restoredEntities.push(`项目 (${data.projects.length} 条记录)`);
        } catch (error: any) {
          errors.push(`恢复项目数据失败: ${error.message}`);
        }
      }

      // 恢复连接数据
      if (data.connections && !skipEntities.includes('connections')) {
        try {
          await this.restoreConnections(services.database, data.connections, options.overwriteExisting);
          restoredEntities.push(`连接 (${data.connections.length} 条记录)`);
        } catch (error: any) {
          errors.push(`恢复连接数据失败: ${error.message}`);
        }
      }

      // 恢复审计日志
      if (data.auditLogs && !skipEntities.includes('auditLogs')) {
        try {
          await this.restoreAuditLogs(services.database, data.auditLogs, options.overwriteExisting);
          restoredEntities.push(`审计日志 (${data.auditLogs.length} 条记录)`);
        } catch (error: any) {
          errors.push(`恢复审计日志失败: ${error.message}`);
        }
      }

      // 记录恢复操作
      logger.info('数据恢复完成', {
        backupId: metadata.id,
        restoredEntities,
        errors,
        restoredBy: userId,
      });

      return {
        success: errors.length === 0,
        restoredEntities,
        errors,
      };

    } catch (error: any) {
      logger.error('恢复数据失败:', {
        backupFilePath,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`恢复数据失败: ${error.message}`);
    }
  }

  /**
   * 获取备份列表
   */
  public static async getBackupList(): Promise<Array<{
    id: string;
    fileName: string;
    filePath: string;
    createdAt: Date;
    size: number;
    metadata?: BackupMetadata;
  }>> {
    try {
      await this.ensureBackupDirectory();
      const files = await fs.readdir(this.BACKUP_DIR);
      const backupFiles = files.filter(file => file.endsWith('.backup') || file.endsWith('.backup.gz') || file.endsWith('.backup.gz.enc'));

      const backupList = [];

      for (const fileName of backupFiles) {
        const filePath = path.join(this.BACKUP_DIR, fileName);
        const stats = await fs.stat(filePath);

        let metadata: BackupMetadata | undefined;

        // 尝试读取元数据（不加载整个备份）
        if (fileName.endsWith('.backup') && !fileName.endsWith('.gz') && !fileName.endsWith('.enc')) {
          try {
            const content = await fs.readFile(filePath, 'utf8');
            const backupData: BackupData = JSON.parse(content);
            metadata = backupData.metadata;
          } catch (e) {
            // 忽略元数据读取错误
          }
        }

        backupList.push({
          id: fileName.replace(/\.(backup|gz|enc)$/g, ''),
          fileName,
          filePath,
          createdAt: stats.mtime,
          size: stats.size,
          metadata,
        });
      }

      // 按创建时间倒序排列
      backupList.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      return backupList;

    } catch (error: any) {
      logger.error('获取备份列表失败:', error);
      throw new Error(`获取备份列表失败: ${error.message}`);
    }
  }

  /**
   * 删除备份
   */
  public static async deleteBackup(backupId: string): Promise<boolean> {
    try {
      const backupList = await this.getBackupList();
      const backup = backupList.find(b => b.id === backupId || b.fileName.includes(backupId));

      if (!backup) {
        throw new Error('备份文件不存在');
      }

      await fs.unlink(backup.filePath);
      logger.info('备份文件已删除', { backupId, filePath: backup.filePath });

      return true;

    } catch (error: any) {
      logger.error('删除备份失败:', { backupId, error: error.message });
      throw new Error(`删除备份失败: ${error.message}`);
    }
  }

  /**
   * 确保备份目录存在
   */
  private static async ensureBackupDirectory(): Promise<void> {
    try {
      await fs.access(this.BACKUP_DIR);
    } catch (error) {
      await fs.mkdir(this.BACKUP_DIR, { recursive: true });
      logger.info('创建备份目录', { directory: this.BACKUP_DIR });
    }
  }

  /**
   * 清理旧备份
   */
  private static async cleanupOldBackups(): Promise<void> {
    try {
      const backupList = await this.getBackupList();

      if (backupList.length > this.MAX_BACKUPS) {
        const backupsToDelete = backupList.slice(this.MAX_BACKUPS);

        for (const backup of backupsToDelete) {
          await fs.unlink(backup.filePath);
          logger.info('删除旧备份文件', {
            backupId: backup.id,
            fileName: backup.fileName,
            createdAt: backup.createdAt
          });
        }
      }

    } catch (error: any) {
      logger.error('清理旧备份失败:', error);
    }
  }

  /**
   * 验证备份数据
   */
  private static async validateBackupData(backupData: BackupData): Promise<string[]> {
    const errors: string[] = [];

    if (!backupData.metadata) {
      errors.push('缺少备份元数据');
    }

    if (!backupData.data) {
      errors.push('缺少备份数据');
    }

    if (backupData.metadata?.version !== '1.0') {
      errors.push(`不支持的备份版本: ${backupData.metadata?.version}`);
    }

    // 验证数据结构
    if (backupData.data) {
      const requiredFields = ['id', 'createdAt', 'updatedAt'];

      if (backupData.data.users) {
        for (const user of backupData.data.users) {
          for (const field of requiredFields) {
            if (!user[field]) {
              errors.push(`用户数据缺少必需字段: ${field}`);
            }
          }
        }
      }

      if (backupData.data.projects) {
        for (const project of backupData.data.projects) {
          for (const field of requiredFields) {
            if (!project[field]) {
              errors.push(`项目数据缺少必需字段: ${field}`);
            }
          }
        }
      }
    }

    return errors;
  }

  /**
   * 恢复用户数据
   */
  private static async restoreUsers(
    database: any,
    users: any[],
    overwrite?: boolean
  ): Promise<void> {
    if (overwrite) {
      await database.query('DELETE FROM users');
    }

    for (const user of users) {
      // 移除自增ID，让数据库重新生成
      const { id, ...userData } = user;

      await database.query(`
        INSERT INTO users (${Object.keys(userData).join(', ')})
        VALUES (${Object.keys(userData).map(() => '?').join(', ')})
      `, Object.values(userData));
    }
  }

  /**
   * 恢复项目数据
   */
  private static async restoreProjects(
    database: any,
    projects: any[],
    overwrite?: boolean
  ): Promise<void> {
    if (overwrite) {
      await database.query('DELETE FROM projects');
    }

    for (const project of projects) {
      const { id, ...projectData } = project;

      await database.query(`
        INSERT INTO projects (${Object.keys(projectData).join(', ')})
        VALUES (${Object.keys(projectData).map(() => '?').join(', ')})
      `, Object.values(projectData));
    }
  }

  /**
   * 恢复连接数据
   */
  private static async restoreConnections(
    database: any,
    connections: any[],
    overwrite?: boolean
  ): Promise<void> {
    if (overwrite) {
      await database.query('DELETE FROM connections');
    }

    for (const connection of connections) {
      const { id, ...connectionData } = connection;

      await database.query(`
        INSERT INTO connections (${Object.keys(connectionData).join(', ')})
        VALUES (${Object.keys(connectionData).map(() => '?').join(', ')})
      `, Object.values(connectionData));
    }
  }

  /**
   * 恢复审计日志
   */
  private static async restoreAuditLogs(
    database: any,
    auditLogs: any[],
    overwrite?: boolean
  ): Promise<void> {
    if (overwrite) {
      await database.query('DELETE FROM audit_logs');
    }

    // 批量插入审计日志
    const batchSize = 1000;
    for (let i = 0; i < auditLogs.length; i += batchSize) {
      const batch = auditLogs.slice(i, i + batchSize);

      for (const log of batch) {
        const { id, ...logData } = log;

        await database.query(`
          INSERT INTO audit_logs (${Object.keys(logData).join(', ')})
          VALUES (${Object.keys(logData).map(() => '?').join(', ')})
        `, Object.values(logData));
      }
    }
  }

  /**
   * 计划备份任务
   */
  public static async scheduleBackup(
    userId: string,
    schedule: 'daily' | 'weekly' | 'monthly',
    options: BackupOptions = {},
    description?: string
  ): Promise<string> {
    const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 这里应该使用任务调度器（如node-cron）
    // 暂时记录到日志中
    logger.info('计划备份任务已创建', {
      scheduleId,
      userId,
      schedule,
      options,
      description,
    });

    // 实际实现应该：
    // 1. 将调度信息保存到数据库
    // 2. 使用cron或其他调度器设置定时任务
    // 3. 在指定时间执行备份

    return scheduleId;
  }
}