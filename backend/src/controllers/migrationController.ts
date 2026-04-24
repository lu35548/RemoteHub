/**
 * 数据迁移控制器
 * 提供localStorage到数据库的迁移API
 */

import { Request, Response } from 'express';

// 定义文件上传接口
interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination: string;
  filename: string;
  path: string;
  buffer: Buffer;
}

// 扩展Request类型以包含file属性
declare global {
  namespace Express {
    interface Request {
      file?: UploadedFile;
    }
  }
}
import { LocalStorageMigrationTool, MigrationOptions, MigrationResult } from '@/utils/migrationUtil';
import { logger } from '@/utils/logger';

export class MigrationController {
  private get migrationTool(): LocalStorageMigrationTool {
    // 延迟实例化，确保数据库已初始化
    const { LocalStorageMigrationTool } = require('@/utils/migrationUtil');
    return new LocalStorageMigrationTool();
  }

  /**
   * 获取迁移工具信息
   */
  public getMigrationInfo = async (req: Request, res: Response) => {
    try {
      const info = {
        version: '1.0.0',
        supportedProtocols: [
          'rdp', 'ssh', 'vnc', 'http', 'https',
          'todesk', 'sunlogin', 'teamviewer', 'anydesk', 'vpn'
        ],
        exportScript: LocalStorageMigrationTool.generateBrowserExportScript(),
        instructions: {
          steps: [
            '1. 在浏览器中打开RemoteHub前端应用',
            '2. 打开浏览器开发者控制台',
            '3. 粘贴并运行提供的导出脚本',
            '4. 下载导出的JSON文件',
            '5. 使用本API上传并迁移数据'
          ],
          notes: [
            '迁移过程会保留所有连接信息',
            '密码数据会被安全加密存储',
            '可以选择覆盖已存在的连接',
            '支持批量处理大量连接'
          ]
        }
      };

      res.json({
        success: true,
        data: info
      });
    } catch (error) {
      logger.error('获取迁移信息失败:', error);
      res.status(500).json({
        success: false,
        message: '获取迁移信息失败',
        error: error instanceof Error ? error.message : '未知错误'
      });
    }
  };

  /**
   * 验证迁移数据
   */
  public validateMigrationData = async (req: Request, res: Response) => {
    try {
      const { connections, userId, projectId } = req.body;

      if (!connections || !Array.isArray(connections)) {
        return res.status(400).json({
          success: false,
          message: '缺少连接数据或格式不正确'
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: '缺少用户ID'
        });
      }

      const options: MigrationOptions = {
        userId: req.user?.userId || userId,
        projectId: projectId || 'default-project',
        validateOnly: true,
        skipPasswords: false
      };

      const result = await this.migrationTool.migrateConnections(connections, options);

      res.json({
        success: true,
        data: {
          validation: result,
          summary: {
            total: result.totalConnections,
            valid: result.migratedConnections,
            invalid: result.errorConnections,
            warnings: result.skippedConnections
          }
        }
      });

    } catch (error) {
      logger.error('验证迁移数据失败:', error);
      res.status(500).json({
        success: false,
        message: '验证迁移数据失败',
        error: error instanceof Error ? error.message : '未知错误'
      });
    }
  };

  /**
   * 执行数据迁移
   */
  public executeMigration = async (req: Request, res: Response) => {
    try {
      const { connections, userId, projectId, overwriteExisting, skipPasswords, batchSize } = req.body;

      if (!connections || !Array.isArray(connections)) {
        return res.status(400).json({
          success: false,
          message: '缺少连接数据或格式不正确'
        });
      }

      if (!userId) {
        return res.status(400).json({
          success: false,
          message: '缺少用户ID'
        });
      }

      const options: MigrationOptions = {
        userId: req.user?.userId || userId,
        projectId: projectId || 'default-project',
        overwriteExisting: overwriteExisting || false,
        validateOnly: false,
        skipPasswords: skipPasswords || false,
        batchSize: batchSize || 50
      };

      logger.info(`开始用户 ${options.userId} 的数据迁移`, {
        totalConnections: connections.length,
        projectId: options.projectId,
        overwriteExisting: options.overwriteExisting
      });

      const result = await this.migrationTool.migrateConnections(connections, options);

      // 生成迁移报告
      const report = this.migrationTool.generateMigrationReport(result);

      // 记录审计日志
      logger.info('数据迁移完成', {
        userId: options.userId,
        result: {
          total: result.totalConnections,
          migrated: result.migratedConnections,
          skipped: result.skippedConnections,
          errors: result.errorConnections
        }
      });

      res.json({
        success: true,
        data: {
          migration: result,
          report: report,
          summary: {
            total: result.totalConnections,
            migrated: result.migratedConnections,
            skipped: result.skippedConnections,
            errors: result.errorConnections,
            successRate: ((result.migratedConnections / result.totalConnections) * 100).toFixed(2) + '%'
          }
        }
      });

    } catch (error) {
      logger.error('执行数据迁移失败:', error);
      res.status(500).json({
        success: false,
        message: '执行数据迁移失败',
        error: error instanceof Error ? error.message : '未知错误'
      });
    }
  };

  /**
   * 上传并解析迁移文件
   */
  public uploadMigrationFile = async (req: Request, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: '没有上传文件'
        });
      }

      // 验证文件类型
      if (!req.file.originalname.endsWith('.json')) {
        return res.status(400).json({
          success: false,
          message: '只支持JSON格式的文件'
        });
      }

      // 验证文件大小（限制为10MB）
      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: '文件大小不能超过10MB'
        });
      }

      // 解析JSON内容
      let connections;
      try {
        const fileContent = req.file.buffer.toString('utf8');
        connections = JSON.parse(fileContent);
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'JSON文件解析失败，请检查文件格式'
        });
      }

      // 验证数据格式
      if (!Array.isArray(connections)) {
        return res.status(400).json({
          success: false,
          message: 'JSON文件必须包含连接数组'
        });
      }

      // 基本数据验证
      const validConnections = connections.filter(conn => {
        return conn.name && conn.host && conn.protocol;
      });

      if (validConnections.length === 0) {
        return res.status(400).json({
          success: false,
          message: '没有找到有效的连接数据'
        });
      }

      res.json({
        success: true,
        data: {
          filename: req.file.originalname,
          size: req.file.size,
          totalConnections: connections.length,
          validConnections: validConnections.length,
          connections: validConnections,
          summary: {
            protocols: [...new Set(validConnections.map(c => c.protocol))],
            hasPasswords: validConnections.some(c => c.password),
            hasTags: validConnections.some(c => c.tags && c.tags.length > 0)
          }
        }
      });

    } catch (error) {
      logger.error('上传迁移文件失败:', error);
      res.status(500).json({
        success: false,
        message: '上传迁移文件失败',
        error: error instanceof Error ? error.message : '未知错误'
      });
    }
  };

  /**
   * 获取迁移历史记录
   */
  public getMigrationHistory = async (req: Request, res: Response) => {
    try {
      const userId = req.user?.userId;

      // 这里应该从数据库查询迁移历史
      // 目前返回模拟数据
      const history = [
        {
          id: 'migration_1',
          timestamp: new Date('2025-01-15'),
          status: 'completed',
          totalConnections: 25,
          migratedConnections: 23,
          skippedConnections: 2,
          errorConnections: 0
        },
        {
          id: 'migration_2',
          timestamp: new Date('2025-01-10'),
          status: 'completed',
          totalConnections: 15,
          migratedConnections: 15,
          skippedConnections: 0,
          errorConnections: 0
        }
      ];

      res.json({
        success: true,
        data: {
          history,
          summary: {
            totalMigrations: history.length,
            totalConnectionsMigrated: history.reduce((sum, h) => sum + h.migratedConnections, 0)
          }
        }
      });

    } catch (error) {
      logger.error('获取迁移历史失败:', error);
      res.status(500).json({
        success: false,
        message: '获取迁移历史失败',
        error: error instanceof Error ? error.message : '未知错误'
      });
    }
  };
}