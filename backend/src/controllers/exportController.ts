import { Request, Response } from 'express';
import { ExportService } from '../services/exportService';
import { logger } from '../utils/logger';

interface RequestWithUser extends Request {
  user?: any;
}

export class ExportController {
  /**
   * 导出数据
   */
  static async exportData(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { format, entityType, filters, fields, limit } = req.query;

      // 验证必需参数
      if (!format || !entityType) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: '格式和实体类型是必需的'
          }
        });
        return;
      }

      // 验证格式
      const supportedFormats = ['json', 'csv', 'xlsx'];
      if (!supportedFormats.includes(format as string)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FORMAT',
            message: `不支持的格式。支持的格式: ${supportedFormats.join(', ')}`
          }
        });
        return;
      }

      // 验证实体类型
      const supportedEntities = ['users', 'projects', 'connections', 'audit-logs'];
      if (!supportedEntities.includes(entityType as string)) {
        res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_ENTITY_TYPE',
            message: `不支持的实体类型。支持的类型: ${supportedEntities.join(', ')}`
          }
        });
        return;
      }

      // 验证导出权限
      if (!ExportService.validateExportPermission(req.user, entityType as string)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '没有权限导出此类型的数据'
          }
        });
        return;
      }

      // 准备导出选项
      const exportOptions: any = {
        format,
        entityType,
        limit: limit ? parseInt(limit as string) : undefined
      };

      // 处理过滤器
      if (filters) {
        try {
          exportOptions.filters = typeof filters === 'string' ? JSON.parse(filters as string) : filters;
        } catch (error) {
          res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_FILTERS',
              message: '过滤器格式无效，请提供有效的JSON'
            }
          });
          return;
        }

        // 转换日期字符串
        if (exportOptions.filters.startDate) {
          exportOptions.filters.startDate = new Date(exportOptions.filters.startDate);
        }
        if (exportOptions.filters.endDate) {
          exportOptions.filters.endDate = new Date(exportOptions.filters.endDate);
        }
      }

      // 处理字段选择
      if (fields) {
        try {
          exportOptions.fields = typeof fields === 'string' ? JSON.parse(fields as string) : fields;
        } catch (error) {
          res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_FIELDS',
              message: '字段选择格式无效，请提供有效的JSON数组'
            }
          });
          return;
        }
      }

      // 执行导出
      const { stream, filename, contentType } = await ExportService.exportData(req, exportOptions);

      // 设置响应头
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Pragma', 'no-cache');

      // 发送文件流
      stream.pipe(res);

      logger.info('Data export initiated', {
        format,
        entityType,
        requestedBy: req.user?.id,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

    } catch (error) {
      logger.error('Export data failed:', {
        error: error.message,
        stack: error.stack,
        requestedBy: req.user?.id,
        entityType: req.query.entityType,
        format: req.query.format
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'EXPORT_FAILED',
          message: '数据导出失败'
        }
      });
    }
  }

  /**
   * 获取导出配置
   */
  static async getExportConfig(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const config = ExportService.getExportConfig();

      res.status(200).json({
        success: true,
        data: config
      });
    } catch (error) {
      logger.error('Failed to get export config:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取导出配置失败'
        }
      });
    }
  }

  /**
   * 获取导出历史
   */
  static async getExportHistory(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { limit } = req.query;
      const exportLimit = limit ? parseInt(limit as string) : 50;

      const history = await ExportService.getExportHistory(req.user?.id, exportLimit);

      res.status(200).json({
        success: true,
        data: history
      });
    } catch (error) {
      logger.error('Failed to get export history:', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '获取导出历史失败'
        }
      });
    }
  }

  /**
   * 预览导出数据
   */
  static async previewExportData(req: RequestWithUser, res: Response): Promise<void> {
    try {
      const { entityType, filters, limit = 100 } = req.query;

      // 验证必需参数
      if (!entityType) {
        res.status(400).json({
          success: false,
          error: {
            code: 'MISSING_PARAMETERS',
            message: '实体类型是必需的'
          }
        });
        return;
      }

      // 验证导出权限
      if (!ExportService.validateExportPermission(req.user, entityType as string)) {
        res.status(403).json({
          success: false,
          error: {
            code: 'INSUFFICIENT_PERMISSIONS',
            message: '没有权限预览此类型的数据'
          }
        });
        return;
      }

      // 限制预览数量
      const previewLimit = Math.min(parseInt(limit as string), 100);

      // 准备导出选项（只获取少量数据用于预览）
      const exportOptions: any = {
        format: 'json',
        entityType,
        limit: previewLimit
      };

      // 处理过滤器
      if (filters) {
        try {
          exportOptions.filters = typeof filters === 'string' ? JSON.parse(filters as string) : filters;
        } catch (error) {
          res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_FILTERS',
              message: '过滤器格式无效'
            }
          });
          return;
        }

        if (exportOptions.filters.startDate) {
          exportOptions.filters.startDate = new Date(exportOptions.filters.startDate);
        }
        if (exportOptions.filters.endDate) {
          exportOptions.filters.endDate = new Date(exportOptions.filters.endDate);
        }
      }

      // 执行导出预览
      const { stream } = await ExportService.exportData(req, exportOptions);

      // 收集数据用于预览
      const chunks: any[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString());

      res.status(200).json({
        success: true,
        data: {
          preview: data.data.slice(0, 10), // 只返回前10条用于预览
          totalCount: data.data.length,
          fields: data.data.length > 0 ? Object.keys(data.data[0]) : [],
          exportOptions
        }
      });

    } catch (error) {
      logger.error('Preview export data failed:', {
        error: error.message,
        stack: error.stack,
        requestedBy: req.user?.id,
        entityType: req.query.entityType
      });

      res.status(500).json({
        success: false,
        error: {
          code: 'PREVIEW_FAILED',
          message: '预览数据失败'
        }
      });
    }
  }
}