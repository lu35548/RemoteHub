import { Request, Response } from 'express';
import { BackupService } from '@/services/backupService';
import { logger } from '@/utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

interface RequestWithUser extends Request {
  user?: any;
}

export class BackupController {
  /**
   * 创建数据备份
   */
  static async createBackup(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以创建备份
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法创建备份',
          },
        });
        return;
      }

      const {
        includeUsers = true,
        includeProjects = true,
        includeConnections = true,
        includeAuditLogs = true,
        compress = true,
        encrypt = false,
        encryptionKey,
        outputFormat = 'json',
        description,
      } = req.body;

      if (encrypt && !encryptionKey) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_ENCRYPTION_KEY',
            message: '启用加密时必须提供加密密钥',
          },
        });
        return;
      }

      const options = {
        includeUsers,
        includeProjects,
        includeConnections,
        includeAuditLogs,
        compress,
        encrypt,
        encryptionKey,
        outputFormat,
      };

      const result = await BackupService.createBackup(
        req.user!.id,
        options,
        description
      );

      res.json({
        success: true,
        data: {
          backupId: result.backupId,
          metadata: result.metadata,
          message: '备份创建成功',
        },
      });

    } catch (error: any) {
      logger.error('创建备份失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BACKUP_CREATION_FAILED',
          message: '创建备份失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 获取备份列表
   */
  static async getBackupList(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以查看备份列表
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法查看备份列表',
          },
        });
        return;
      }

      const backupList = await BackupService.getBackupList();

      res.json({
        success: true,
        data: {
          backups: backupList.map(backup => ({
            id: backup.id,
            fileName: backup.fileName,
            createdAt: backup.createdAt,
            size: backup.size,
            description: backup.metadata?.description,
            totalRecords: backup.metadata?.stats.totalRecords,
            entities: Object.keys(backup.metadata?.entities || {}),
          })),
        },
      });

    } catch (error: any) {
      logger.error('获取备份列表失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BACKUP_LIST_FAILED',
          message: '获取备份列表失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 从备份恢复数据
   */
  static async restoreFromBackup(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以恢复数据
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法恢复数据',
          },
        });
        return;
      }

      const { backupId, overwriteExisting = false, validateData = true, encryptionKey, skipEntities = [] } = req.body;

      if (!backupId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_BACKUP_ID',
            message: '缺少备份ID',
          },
        });
        return;
      }

      // 查找备份文件
      const backupList = await BackupService.getBackupList();
      const backup = backupList.find(b => b.id === backupId || b.fileName.includes(backupId));

      if (!backup) {
        res.status(404).json({
          success: false,
          error: {
            code: 'BACKUP_NOT_FOUND',
            message: '备份文件不存在',
          },
        });
        return;
      }

      const options = {
        overwriteExisting,
        validateData,
        encryptionKey,
        skipEntities,
      };

      const result = await BackupService.restoreFromBackup(
        backup.filePath,
        req.user!.id,
        options
      );

      if (result.success) {
        res.json({
          success: true,
          data: {
            restoredEntities: result.restoredEntities,
            message: '数据恢复成功',
          },
        });
      } else {
        res.status(500).json({
          success: false,
          error: {
            code: 'PARTIAL_RESTORE_FAILED',
            message: '部分数据恢复失败',
            details: {
              restoredEntities: result.restoredEntities,
              errors: result.errors,
            },
          },
        });
      }

    } catch (error: any) {
      logger.error('恢复数据失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'RESTORE_FAILED',
          message: '恢复数据失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 删除备份
   */
  static async deleteBackup(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以删除备份
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法删除备份',
          },
        });
        return;
      }

      const { backupId } = req.params;

      if (!backupId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_BACKUP_ID',
            message: '缺少备份ID',
          },
        });
        return;
      }

      const success = await BackupService.deleteBackup(backupId);

      if (success) {
        res.json({
          success: true,
          message: '备份删除成功',
        });
      } else {
        res.status(404).json({
          success: false,
          error: {
            code: 'BACKUP_NOT_FOUND',
            message: '备份文件不存在',
          },
        });
      }

    } catch (error: any) {
      logger.error('删除备份失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BACKUP_DELETE_FAILED',
          message: '删除备份失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 下载备份文件
   */
  static async downloadBackup(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以下载备份
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法下载备份',
          },
        });
        return;
      }

      const { backupId } = req.params;

      if (!backupId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_BACKUP_ID',
            message: '缺少备份ID',
          },
        });
        return;
      }

      // 查找备份文件
      const backupList = await BackupService.getBackupList();
      const backup = backupList.find(b => b.id === backupId || b.fileName.includes(backupId));

      if (!backup) {
        res.status(404).json({
          success: false,
          error: {
            code: 'BACKUP_NOT_FOUND',
            message: '备份文件不存在',
          },
        });
        return;
      }

      // 检查文件是否存在
      try {
        await fs.access(backup.filePath);
      } catch (error) {
        res.status(404).json({
          success: false,
          error: {
            code: 'BACKUP_FILE_NOT_FOUND',
            message: '备份文件不存在于服务器上',
          },
        });
        return;
      }

      // 设置响应头
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(backup.fileName)}"`);
      res.setHeader('Content-Length', backup.size);

      // 发送文件
      const fileStream = require('fs').createReadStream(backup.filePath);
      fileStream.pipe(res);

      fileStream.on('error', (error: any) => {
        logger.error('下载备份文件失败:', error);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: {
              code: 'BACKUP_DOWNLOAD_FAILED',
              message: '下载备份文件失败',
              details: error.message,
            },
          });
        }
      });

    } catch (error: any) {
      logger.error('下载备份失败:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: {
            code: 'BACKUP_DOWNLOAD_FAILED',
            message: '下载备份失败',
            details: error.message,
          },
        });
      }
    }
  }

  /**
   * 获取备份详情
   */
  static async getBackupDetails(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以查看备份详情
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法查看备份详情',
          },
        });
        return;
      }

      const { backupId } = req.params;

      if (!backupId) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_BACKUP_ID',
            message: '缺少备份ID',
          },
        });
        return;
      }

      // 查找备份文件
      const backupList = await BackupService.getBackupList();
      const backup = backupList.find(b => b.id === backupId || b.fileName.includes(backupId));

      if (!backup) {
        res.status(404).json({
          success: false,
          error: {
            code: 'BACKUP_NOT_FOUND',
            message: '备份文件不存在',
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: backup.id,
          fileName: backup.fileName,
          createdAt: backup.createdAt,
          size: backup.size,
          metadata: backup.metadata,
        },
      });

    } catch (error: any) {
      logger.error('获取备份详情失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'BACKUP_DETAILS_FAILED',
          message: '获取备份详情失败',
          details: error.message,
        },
      });
    }
  }

  /**
   * 计划备份任务
   */
  static async scheduleBackup(req: RequestWithUser, res: Response): Promise<void> {
    try {
      // 只有管理员可以计划备份
      if (req.user?.role !== 'admin') {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '权限不足，无法计划备份',
          },
        });
        return;
      }

      const {
        schedule,
        includeUsers = true,
        includeProjects = true,
        includeConnections = true,
        includeAuditLogs = true,
        compress = true,
        encrypt = false,
        encryptionKey,
        description,
      } = req.body;

      if (!schedule || !['daily', 'weekly', 'monthly'].includes(schedule)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_SCHEDULE',
            message: '无效的备份计划，必须是: daily, weekly, monthly',
          },
        });
        return;
      }

      if (encrypt && !encryptionKey) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_ENCRYPTION_KEY',
            message: '启用加密时必须提供加密密钥',
          },
        });
        return;
      }

      const options = {
        includeUsers,
        includeProjects,
        includeConnections,
        includeAuditLogs,
        compress,
        encrypt,
        encryptionKey,
      };

      const scheduleId = await BackupService.scheduleBackup(
        req.user!.id,
        schedule,
        options,
        description
      );

      res.json({
        success: true,
        data: {
          scheduleId,
          message: '备份计划创建成功',
        },
      });

    } catch (error: any) {
      logger.error('创建备份计划失败:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'SCHEDULE_CREATION_FAILED',
          message: '创建备份计划失败',
          details: error.message,
        },
      });
    }
  }
}