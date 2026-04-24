/**
 * Remote Connection Service
 * 专门处理远程连接的API操作，使用新的RemoteConnection后端API
 */

import { getStorage, DB_KEYS } from './storage.adapter';
import type { Connection } from '../types';

export interface RemoteConnection {
  id: string;
  name: string;
  protocol: 'rdp' | 'ssh' | 'vnc' | 'http' | 'https' | 'todesk' | 'sunlogin' | 'teamviewer' | 'anydesk' | 'vpn';
  host: string;
  port?: number;
  username?: string;
  password?: string; // 加密存储
  vpnType?: 'web' | 'client' | 'openvpn' | 'l2tp' | 'wireguard';
  vpnLoginUrl?: string;
  requiredVpnId?: string;
  notes?: string;
  tags?: string[];
  isActive: boolean;
  accessCount: number;
  lastAccessed?: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  ownerId: string;
}

export interface ConnectionStats {
  total: number;
  byProtocol: Record<string, number>;
  active: number;
  recentlyAccessed: number;
}

export interface ProtocolInfo {
  protocol: string;
  displayName: string;
  icon: string;
  defaultPort: number;
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
  summary: {
    total: number;
    migrated: number;
    skipped: number;
    errors: number;
    successRate: string;
  };
  report: string;
}

export class RemoteConnectionService {
  private storage: any = null;

  constructor() {
    this.initializeStorage();
  }

  private async initializeStorage() {
    this.storage = await getStorage();
  }

  /**
   * 获取所有远程连接
   */
  async getConnections(options: {
    projectId?: string;
    protocol?: string;
    query?: string;
    tags?: string[];
    isActive?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<{ connections: RemoteConnection[]; total: number; page: number; totalPages: number }> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      // 构建查询参数
      const params = new URLSearchParams();
      if (options.projectId) params.append('projectId', options.projectId);
      if (options.protocol) params.append('protocol', options.protocol);
      if (options.query) params.append('query', options.query);
      if (options.tags) params.append('tags', options.tags.join(','));
      if (options.isActive !== undefined) params.append('isActive', options.isActive.toString());
      if (options.page) params.append('page', options.page.toString());
      if (options.limit) params.append('limit', options.limit.toString());

      const queryString = params.toString();
      const endpoint = `/remote-connections${queryString ? `?${queryString}` : ''}`;

      // 使用API适配器的专用方法
      const response = await (this.storage as any).makeRequestWithRetry(`/api/v1${endpoint}`, {
        method: 'GET',
        headers: {
          ...(this.storage as any).getAuthHeaders()
        }
      });

      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error?.message || '获取远程连接失败');
      }
    } catch (error) {
      console.error('获取远程连接失败:', error);
      // 降级到localStorage
      const connections = await this.storage.read<RemoteConnection[]>(DB_KEYS.REMOTE_CONNECTIONS, []);
      return {
        connections: connections.filter(conn => this.filterConnection(conn, options)),
        total: connections.length,
        page: options.page || 1,
        totalPages: 1
      };
    }
  }

  /**
   * 根据ID获取远程连接
   */
  async getConnectionById(id: string): Promise<RemoteConnection | null> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      const response = await (this.storage as any).makeRequestWithRetry(`/api/v1/remote-connections/${id}`, {
        method: 'GET',
        headers: {
          ...(this.storage as any).getAuthHeaders()
        }
      });

      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error?.message || '获取远程连接失败');
      }
    } catch (error) {
      console.error('获取远程连接失败:', error);
      // 降级到localStorage
      const connections = await this.storage.read<RemoteConnection[]>(DB_KEYS.REMOTE_CONNECTIONS, []);
      return connections.find(conn => conn.id === id) || null;
    }
  }

  /**
   * 创建新的远程连接
   */
  async createConnection(connectionData: Omit<RemoteConnection, 'id' | 'createdAt' | 'updatedAt' | 'accessCount'>): Promise<RemoteConnection> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      const response = await (this.storage as any).makeRequestWithRetry('/api/v1/remote-connections', {
        method: 'POST',
        headers: {
          ...(this.storage as any).getAuthHeaders()
        },
        body: JSON.stringify(connectionData)
      });

      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error?.message || '创建远程连接失败');
      }
    } catch (error) {
      console.error('创建远程连接失败:', error);
      // 降级到localStorage
      const connections = await this.storage.read<RemoteConnection[]>(DB_KEYS.REMOTE_CONNECTIONS, []);
      const newConnection: RemoteConnection = {
        ...connectionData,
        id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        accessCount: 0
      };
      connections.push(newConnection);
      await this.storage.write(DB_KEYS.REMOTE_CONNECTIONS, connections);
      return newConnection;
    }
  }

  /**
   * 更新远程连接
   */
  async updateConnection(id: string, updateData: Partial<RemoteConnection>): Promise<RemoteConnection> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      const response = await (this.storage as any).makeRequestWithRetry(`/api/v1/remote-connections/${id}`, {
        method: 'PUT',
        headers: {
          ...(this.storage as any).getAuthHeaders()
        },
        body: JSON.stringify(updateData)
      });

      if (response.success) {
        return response.data;
      } else {
        throw new Error(response.error?.message || '更新远程连接失败');
      }
    } catch (error) {
      console.error('更新远程连接失败:', error);
      // 降级到localStorage
      const connections = await this.storage.read<RemoteConnection[]>(DB_KEYS.REMOTE_CONNECTIONS, []);
      const index = connections.findIndex(conn => conn.id === id);
      if (index !== -1) {
        connections[index] = {
          ...connections[index],
          ...updateData,
          updatedAt: new Date().toISOString()
        };
        await this.storage.write(DB_KEYS.REMOTE_CONNECTIONS, connections);
        return connections[index];
      }
      throw new Error('连接不存在');
    }
  }

  /**
   * 删除远程连接
   */
  async deleteConnection(id: string): Promise<void> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      await (this.storage as any).deleteRemoteConnection(id);
    } catch (error) {
      console.error('删除远程连接失败:', error);
      // 降级到localStorage
      const connections = await this.storage.read<RemoteConnection[]>(DB_KEYS.REMOTE_CONNECTIONS, []);
      const filteredConnections = connections.filter(conn => conn.id !== id);
      await this.storage.write(DB_KEYS.REMOTE_CONNECTIONS, filteredConnections);
    }
  }

  /**
   * 批量删除远程连接
   */
  async bulkDeleteConnections(ids: string[]): Promise<void> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      await (this.storage as any).bulkDeleteConnections(ids);
    } catch (error) {
      console.error('批量删除远程连接失败:', error);
      // 降级到localStorage
      const connections = await this.storage.read<RemoteConnection[]>(DB_KEYS.REMOTE_CONNECTIONS, []);
      const filteredConnections = connections.filter(conn => !ids.includes(conn.id));
      await this.storage.write(DB_KEYS.REMOTE_CONNECTIONS, filteredConnections);
    }
  }

  /**
   * 记录连接访问
   */
  async recordAccess(id: string): Promise<void> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      await (this.storage as any).recordConnectionAccess(id);
    } catch (error) {
      console.error('记录连接访问失败:', error);
      // 降级到localStorage - 静默失败
    }
  }

  /**
   * 克隆连接
   */
  async cloneConnection(id: string, newName?: string): Promise<RemoteConnection> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      return await (this.storage as any).cloneConnection(id, newName);
    } catch (error) {
      console.error('克隆连接失败:', error);
      // 降级到localStorage实现
      const originalConnection = await this.getConnectionById(id);
      if (originalConnection) {
        const clonedConnection = await this.createConnection({
          ...originalConnection,
          name: newName || `${originalConnection.name} (副本)`
        });
        return clonedConnection;
      }
      throw new Error('原连接不存在');
    }
  }

  /**
   * 获取连接统计
   */
  async getConnectionStats(): Promise<ConnectionStats> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      return await (this.storage as any).getRemoteConnectionStats();
    } catch (error) {
      console.error('获取连接统计失败:', error);
      // 降级到localStorage实现
      const connections = await this.storage.read<RemoteConnection[]>(DB_KEYS.REMOTE_CONNECTIONS, []);
      const stats: ConnectionStats = {
        total: connections.length,
        byProtocol: {},
        active: connections.filter(c => c.isActive).length,
        recentlyAccessed: connections.filter(c => {
          if (!c.lastAccessed) return false;
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          return new Date(c.lastAccessed) > weekAgo;
        }).length
      };

      connections.forEach(conn => {
        stats.byProtocol[conn.protocol] = (stats.byProtocol[conn.protocol] || 0) + 1;
      });

      return stats;
    }
  }

  /**
   * 获取支持的协议类型
   */
  async getSupportedProtocols(): Promise<ProtocolInfo[]> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      return await (this.storage as any).getSupportedProtocols();
    } catch (error) {
      console.error('获取支持的协议类型失败:', error);
      // 降级到静态数据
      return [
        { protocol: 'rdp', displayName: '远程桌面协议', icon: '🖥️', defaultPort: 3389 },
        { protocol: 'ssh', displayName: '安全外壳协议', icon: '🔐', defaultPort: 22 },
        { protocol: 'vnc', displayName: '虚拟网络计算', icon: '🖼️', defaultPort: 5901 },
        { protocol: 'http', displayName: '超文本传输协议', icon: '🌐', defaultPort: 80 },
        { protocol: 'https', displayName: '安全HTTP协议', icon: '🔒', defaultPort: 443 },
        { protocol: 'todesk', displayName: 'ToDesk远程', icon: '📱', defaultPort: 0 },
        { protocol: 'sunlogin', displayName: '向日葵远程', icon: '☀️', defaultPort: 0 },
        { protocol: 'teamviewer', displayName: 'TeamViewer', icon: '👥', defaultPort: 0 },
        { protocol: 'anydesk', displayName: 'AnyDesk', icon: '🔄', defaultPort: 0 },
        { protocol: 'vpn', displayName: '虚拟专用网络', icon: '🌍', defaultPort: 0 }
      ];
    }
  }

  /**
   * 获取最近访问的连接
   */
  async getRecentlyAccessed(limit: number = 10): Promise<RemoteConnection[]> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      return await (this.storage as any).getRecentlyAccessedConnections();
    } catch (error) {
      console.error('获取最近访问的连接失败:', error);
      // 降级到localStorage实现
      const connections = await this.storage.read<RemoteConnection[]>(DB_KEYS.REMOTE_CONNECTIONS, []);
      return connections
        .filter(conn => conn.lastAccessed)
        .sort((a, b) => new Date(b.lastAccessed!).getTime() - new Date(a.lastAccessed!).getTime())
        .slice(0, limit);
    }
  }

  /**
   * 根据标签获取连接
   */
  async getConnectionsByTag(tag: string): Promise<RemoteConnection[]> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      return await (this.storage as any).getConnectionsByTag(tag);
    } catch (error) {
      console.error('根据标签获取连接失败:', error);
      // 降级到localStorage实现
      const connections = await this.storage.read<RemoteConnection[]>(DB_KEYS.REMOTE_CONNECTIONS, []);
      return connections.filter(conn => conn.tags?.includes(tag));
    }
  }

  /**
   * 本地过滤连接方法（降级使用）
   */
  private filterConnection(connection: RemoteConnection, options: any): boolean {
    if (options.projectId && connection.projectId !== options.projectId) return false;
    if (options.protocol && connection.protocol !== options.protocol) return false;
    if (options.query && !connection.name.toLowerCase().includes(options.query.toLowerCase()) &&
        !connection.host.toLowerCase().includes(options.query.toLowerCase())) return false;
    if (options.tags && options.tags.length > 0 && !options.tags.some(tag => connection.tags?.includes(tag))) return false;
    if (options.isActive !== undefined && connection.isActive !== options.isActive) return false;
    return true;
  }

  /**
   * 从localStorage格式迁移连接到新的RemoteConnection格式
   */
  async migrateFromLegacyFormat(legacyConnections: any[]): Promise<MigrationResult> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      return await (this.storage as any).executeMigration(legacyConnections, {
        overwriteExisting: false,
        skipPasswords: false
      });
    } catch (error) {
      console.error('迁移连接数据失败:', error);
      throw error;
    }
  }

  /**
   * 获取迁移信息
   */
  async getMigrationInfo(): Promise<any> {
    if (!this.storage) {
      await this.initializeStorage();
    }

    try {
      return await (this.storage as any).getMigrationInfo();
    } catch (error) {
      console.error('获取迁移信息失败:', error);
      throw error;
    }
  }
}

// 导出单例实例
export const remoteConnectionService = new RemoteConnectionService();