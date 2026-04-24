/**
 * localStorage到数据库的数据迁移工具
 * 支持从浏览器的localStorage读取远程连接数据并迁移到后端数据库
 */

import { RemoteConnectionRepository } from '@/repositories/RemoteConnectionRepository';
import { RemoteConnection, RemoteProtocol } from '@/models/RemoteConnection';
import { DatabaseService } from '@/config/database';
import { logger } from '@/utils/logger';

export interface LocalStorageConnection {
  id: string;
  name: string;
  protocol: string;
  host: string;
  port?: number;
  username?: string;
  password?: string;
  vpnType?: string;
  vpnLoginUrl?: string;
  requiredVpnId?: string;
  notes?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MigrationOptions {
  userId: string;
  projectId?: string;
  overwriteExisting?: boolean;
  validateOnly?: boolean;
  skipPasswords?: boolean;
  batchSize?: number;
}

export interface MigrationResult {
  totalConnections: number;
  migratedConnections: number;
  skippedConnections: number;
  errorConnections: number;
  errors: Array<{
    connectionName: string;
    error: string;
  }>;
  details: {
    migratedIds: string[];
    skippedIds: string[];
  };
}

export class LocalStorageMigrationTool {
  private remoteConnectionRepository: RemoteConnectionRepository;

  constructor() {
    this.remoteConnectionRepository = new RemoteConnectionRepository();
  }

  /**
   * 解析协议字符串到RemoteProtocol枚举
   */
  private parseProtocol(protocol: string): RemoteProtocol {
    const protocolMap: Record<string, RemoteProtocol> = {
      'rdp': RemoteProtocol.RDP,
      'ssh': RemoteProtocol.SSH,
      'vnc': RemoteProtocol.VNC,
      'http': RemoteProtocol.HTTP,
      'https': RemoteProtocol.HTTPS,
      'todesk': RemoteProtocol.TODESK,
      'sunlogin': RemoteProtocol.SUNLOGIN,
      'teamviewer': RemoteProtocol.TEAMVIEWER,
      'anydesk': RemoteProtocol.ANYDESK,
      'vpn': RemoteProtocol.VPN
    };

    return protocolMap[protocol.toLowerCase()] || RemoteProtocol.RDP;
  }

  /**
   * 验证localStorage连接数据
   */
  private validateConnection(connection: LocalStorageConnection): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!connection.name || connection.name.trim().length === 0) {
      errors.push('连接名称不能为空');
    }

    if (!connection.host || connection.host.trim().length === 0) {
      errors.push('主机地址不能为空');
    }

    if (!connection.protocol) {
      errors.push('协议类型不能为空');
    }

    try {
      this.parseProtocol(connection.protocol);
    } catch {
      errors.push('无效的协议类型');
    }

    if (connection.port && (connection.port < 1 || connection.port > 65535)) {
      errors.push('端口号必须在1-65535范围内');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 转换localStorage连接到RemoteConnection实体
   */
  private convertConnection(
    connection: LocalStorageConnection,
    userId: string,
    projectId?: string
  ): RemoteConnection {
    const remoteConnection = new RemoteConnection();

    remoteConnection.name = connection.name;
    remoteConnection.protocol = this.parseProtocol(connection.protocol);
    remoteConnection.host = connection.host;
    remoteConnection.port = connection.port || remoteConnection.defaultPort;
    remoteConnection.username = connection.username;
    remoteConnection.vpnLoginUrl = connection.vpnLoginUrl;
    remoteConnection.requiredVpnId = connection.requiredVpnId;
    remoteConnection.notes = connection.notes;
    remoteConnection.tags = connection.tags || [];
    remoteConnection.projectId = projectId || 'default-project';
    remoteConnection.ownerId = userId;
    remoteConnection.createdBy = 'Migration';
    remoteConnection.createdById = userId;
    remoteConnection.updatedBy = userId;
    remoteConnection.updatedById = userId;
    remoteConnection.isActive = true;

    // 设置密码（如果有）
    if (connection.password && !process.env.SKIP_PASSWORDS) {
      remoteConnection.setPassword(connection.password);
    }

    // 保持原始时间戳
    if (connection.createdAt) {
      remoteConnection.createdAt = new Date(connection.createdAt);
    }
    if (connection.updatedAt) {
      remoteConnection.updatedAt = new Date(connection.updatedAt);
    }

    return remoteConnection;
  }

  /**
   * 从JSON字符串导入连接数据
   */
  private async importFromJson(
    jsonData: string,
    options: MigrationOptions
  ): Promise<MigrationResult> {
    try {
      const connections: LocalStorageConnection[] = JSON.parse(jsonData);
      return await this.migrateConnections(connections, options);
    } catch (error) {
      logger.error('解析JSON数据失败:', error);
      throw new Error(`JSON解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 批量迁移连接数据
   */
  public async migrateConnections(
    connections: LocalStorageConnection[],
    options: MigrationOptions
  ): Promise<MigrationResult> {
    const result: MigrationResult = {
      totalConnections: connections.length,
      migratedConnections: 0,
      skippedConnections: 0,
      errorConnections: 0,
      errors: [],
      details: {
        migratedIds: [],
        skippedIds: []
      }
    };

    const batchSize = options.batchSize || 50;

    logger.info(`开始迁移 ${connections.length} 个连接，批次大小: ${batchSize}`);

    // 分批处理连接
    for (let i = 0; i < connections.length; i += batchSize) {
      const batch = connections.slice(i, i + batchSize);

      logger.info(`处理批次 ${Math.floor(i / batchSize) + 1}/${Math.ceil(connections.length / batchSize)}`);

      for (const connection of batch) {
        try {
          // 验证连接数据
          const validation = this.validateConnection(connection);
          if (!validation.isValid) {
            result.errors.push({
              connectionName: connection.name || 'Unknown',
              error: validation.errors.join(', ')
            });
            result.errorConnections++;
            continue;
          }

          // 转换连接数据
          const remoteConnection = this.convertConnection(
            connection,
            options.userId,
            options.projectId
          );

          // 如果只是验证模式，不实际迁移
          if (options.validateOnly) {
            result.migratedConnections++;
            result.details.migratedIds.push(connection.id);
            continue;
          }

          // 检查是否已存在同名连接
          const existingConnections = await this.remoteConnectionRepository.search({
            userId: options.userId,
            query: connection.name,
            limit: 1
          });

          if (existingConnections.connections.length > 0 && !options.overwriteExisting) {
            logger.warn(`跳过已存在的连接: ${connection.name}`);
            result.skippedConnections++;
            result.details.skippedIds.push(connection.id);
            continue;
          }

          // 保存连接
          if (options.overwriteExisting && existingConnections.connections.length > 0) {
            // 更新现有连接
            await this.remoteConnectionRepository.update(
              existingConnections.connections[0].id,
              remoteConnection
            );
            result.details.migratedIds.push(existingConnections.connections[0].id);
          } else {
            // 创建新连接
            const saved = await this.remoteConnectionRepository.create(remoteConnection);
            result.details.migratedIds.push(saved.id);
          }

          result.migratedConnections++;
          logger.info(`成功迁移连接: ${connection.name}`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '未知错误';
          logger.error(`迁移连接失败: ${connection.name}`, error);

          result.errors.push({
            connectionName: connection.name || 'Unknown',
            error: errorMessage
          });
          result.errorConnections++;
        }
      }
    }

    logger.info(`迁移完成: 总数=${result.totalConnections}, 成功=${result.migratedConnections}, 跳过=${result.skippedConnections}, 错误=${result.errorConnections}`);

    return result;
  }

  /**
   * 生成迁移报告
   */
  public generateMigrationReport(result: MigrationResult): string {
    const report = [
      '# RemoteHub 数据迁移报告',
      '',
      `**迁移时间**: ${new Date().toLocaleString()}`,
      `**总连接数**: ${result.totalConnections}`,
      `**成功迁移**: ${result.migratedConnections}`,
      `**跳过连接**: ${result.skippedConnections}`,
      `**错误连接**: ${result.errorConnections}`,
      '',
      '## 迁移统计',
      `- 成功率: ${((result.migratedConnections / result.totalConnections) * 100).toFixed(2)}%`,
      `- 跳过率: ${((result.skippedConnections / result.totalConnections) * 100).toFixed(2)}%`,
      `- 错误率: ${((result.errorConnections / result.totalConnections) * 100).toFixed(2)}%`,
      ''
    ];

    if (result.errors.length > 0) {
      report.push('## 错误详情');
      result.errors.forEach(error => {
        report.push(`- **${error.connectionName}**: ${error.error}`);
      });
      report.push('');
    }

    if (result.details.migratedIds.length > 0) {
      report.push('## 成功迁移的连接ID');
      result.details.migratedIds.forEach(id => {
        report.push(`- ${id}`);
      });
      report.push('');
    }

    if (result.details.skippedIds.length > 0) {
      report.push('## 跳过的连接ID');
      result.details.skippedIds.forEach(id => {
        report.push(`- ${id}`);
      });
      report.push('');
    }

    return report.join('\n');
  }

  /**
   * 从浏览器localStorage导出数据模板
   */
  public static generateBrowserExportScript(): string {
    return `
// RemoteHub 数据导出脚本
// 在浏览器控制台中运行此脚本来导出localStorage中的连接数据

function exportRemoteHubConnections() {
  try {
    // 获取所有localStorage键
    const keys = Object.keys(localStorage);

    // 查找连接数据相关的键
    const connectionKeys = keys.filter(key =>
      key.includes('connection') ||
      key.includes('remote') ||
      key.includes('rdp') ||
      key.includes('ssh') ||
      key.includes('vnc')
    );

    const connections = [];

    // 导出每个连接
    connectionKeys.forEach(key => {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          const parsed = JSON.parse(data);
          if (parsed && typeof parsed === 'object') {
            parsed.storageKey = key;
            connections.push(parsed);
          }
        }
      } catch (e) {
        console.warn('解析键失败:', key, e);
      }
    });

    // 创建下载链接
    const blob = new Blob([JSON.stringify(connections, null, 2)], {
      type: 'application/json'
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'remotehub-connections-export.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log(\`已导出 \${connections.length} 个连接\`);
    return connections;

  } catch (error) {
    console.error('导出失败:', error);
    return [];
  }
}

// 运行导出
const exportedConnections = exportRemoteHubConnections();
    `;
  }
}