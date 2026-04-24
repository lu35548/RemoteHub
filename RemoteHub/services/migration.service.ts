/**
 * 渐进式迁移服务
 * 管理从localStorage到API的平滑过渡
 */

import { getStorage, DB_KEYS } from './storage.adapter';
import { remoteConnectionService } from './remoteConnection.service';

export interface MigrationPhase {
  name: string;
  description: string;
  completed: boolean;
  completedAt?: Date;
  error?: string;
}

export interface MigrationProgress {
  currentPhase: number;
  totalPhases: number;
  phases: MigrationPhase[];
  isCompleted: boolean;
  startedAt: Date;
  completedAt?: Date;
}

export interface SyncStatus {
  localStorage: boolean;
  api: boolean;
  lastSyncAt: Date;
  syncedRecords: number;
  totalRecords: number;
  conflicts: Array<{
    id: string;
    type: 'conflict' | 'missing' | 'corrupted';
    details: string;
  }>;
}

export class MigrationService {
  private static instance: MigrationService;
  private storage: any = null;

  private constructor() {}

  public static getInstance(): MigrationService {
    if (!MigrationService.instance) {
      MigrationService.instance = new MigrationService();
    }
    return MigrationService.instance;
  }

  private async initializeStorage() {
    if (!this.storage) {
      this.storage = await getStorage();
    }
  }

  /**
   * 检查迁移状态
   */
  async getMigrationProgress(): Promise<MigrationProgress> {
    await this.initializeStorage();

    const progressKey = 'rh_migration_progress';
    const stored = localStorage.getItem(progressKey);

    if (stored) {
      return JSON.parse(stored);
    }

    // 初始化迁移进度
    const initialProgress: MigrationProgress = {
      currentPhase: 0,
      totalPhases: 4,
      phases: [
        {
          name: 'phase_1_backup',
          description: '备份现有localStorage数据',
          completed: false
        },
        {
          name: 'phase_2_validate',
          description: '验证数据格式',
          completed: false
        },
        {
          name: 'phase_3_sync',
          description: '同步数据到API',
          completed: false
        },
        {
          name: 'phase_4_switch',
          description: '切换到API模式',
          completed: false
        }
      ],
      isCompleted: false,
      startedAt: new Date()
    };

    localStorage.setItem(progressKey, JSON.stringify(initialProgress));
    return initialProgress;
  }

  /**
   * 更新迁移进度
   */
  private async updateProgress(progress: MigrationProgress): Promise<void> {
    const progressKey = 'rh_migration_progress';
    localStorage.setItem(progressKey, JSON.stringify(progress));
  }

  /**
   * 开始迁移（兼容性方法，建议使用 ProgressiveMigrationManager）
   */
  async startMigration(): Promise<void> {
    // 检查是否已经安装了渐进式迁移管理器
    try {
      const { progressiveMigrationManager } = await import('./progressiveMigrationManager');
      console.log('🔄 使用渐进式迁移管理器启动迁移...');

      // 使用渐进式迁移管理器
      await progressiveMigrationManager.startMigration();
      return;

    } catch (error) {
      console.warn('渐进式迁移管理器不可用，使用传统迁移方法', error);
    }

    const progress = await this.getMigrationProgress();

    if (progress.isCompleted) {
      throw new Error('迁移已经完成');
    }

    console.log('🚀 开始渐进式迁移...');

    try {
      // 阶段1: 备份现有数据
      await this.executePhase1(progress);

      // 阶段2: 验证数据格式
      await this.executePhase2(progress);

      // 阶段3: 同步数据到API
      await this.executePhase3(progress);

      // 阶段4: 切换到API模式
      await this.executePhase4(progress);

      // 标记完成
      progress.isCompleted = true;
      progress.completedAt = new Date();
      await this.updateProgress(progress);

      console.log('✅ 迁移完成！');

    } catch (error) {
      console.error('❌ 迁移失败:', error);
      progress.phases[progress.currentPhase].error = error instanceof Error ? error.message : '未知错误';
      await this.updateProgress(progress);
      throw error;
    }
  }

  /**
   * 使用渐进式迁移管理器进行安全迁移
   */
  async startProgressiveMigration(config?: any): Promise<string> {
    const { progressiveMigrationManager } = await import('./progressiveMigrationManager');

    // 如果提供了配置，应用配置
    if (config) {
      progressiveMigrationManager.configure(config);
    }

    return await progressiveMigrationManager.startMigration();
  }

  /**
   * 获取迁移管理器状态
   */
  async getProgressiveMigrationStatus(): Promise<any> {
    try {
      const { progressiveMigrationManager } = await import('./progressiveMigrationManager');
      return progressiveMigrationManager.getCurrentStatus();
    } catch (error) {
      console.warn('无法获取渐进式迁移状态:', error);
      return null;
    }
  }

  /**
   * 获取迁移历史
   */
  async getMigrationHistory(): Promise<any[]> {
    try {
      const { progressiveMigrationManager } = await import('./progressiveMigrationManager');
      return progressiveMigrationManager.getMigrationHistory();
    } catch (error) {
      console.warn('无法获取迁移历史:', error);
      return [];
    }
  }

  /**
   * 阶段1: 备份现有localStorage数据
   */
  private async executePhase1(progress: MigrationProgress): Promise<void> {
    console.log('📦 阶段1: 备份现有localStorage数据...');

    const backupData: any = {};

    // 备份所有关键数据
    for (const key of Object.values(DB_KEYS)) {
      try {
        const data = localStorage.getItem(key);
        if (data) {
          backupData[key] = data;
        }
      } catch (error) {
        console.warn(`备份数据失败: ${key}`, error);
      }
    }

    // 保存备份数据
    const backupKey = `rh_backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    localStorage.setItem(backupKey, JSON.stringify(backupData));

    progress.phases[0].completed = true;
    progress.phases[0].completedAt = new Date();
    progress.currentPhase = 1;
    await this.updateProgress(progress);

    console.log('✅ 备份完成');
  }

  /**
   * 阶段2: 验证数据格式
   */
  private async executePhase2(progress: MigrationProgress): Promise<void> {
    console.log('🔍 阶段2: 验证数据格式...');

    let totalRecords = 0;
    let validRecords = 0;
    let errors: string[] = [];

    // 验证连接数据
    try {
      const connectionsData = localStorage.getItem(DB_KEYS.CONNECTIONS);
      if (connectionsData) {
        const connections = JSON.parse(connectionsData);
        if (Array.isArray(connections)) {
          totalRecords += connections.length;
          connections.forEach((conn, index) => {
            if (this.validateConnection(conn)) {
              validRecords++;
            } else {
              errors.push(`连接 ${index + 1}: 格式无效`);
            }
          });
        }
      }
    } catch (error) {
      errors.push(`连接数据解析失败: ${error}`);
    }

    // 验证项目数据
    try {
      const projectsData = localStorage.getItem(DB_KEYS.PROJECTS);
      if (projectsData) {
        const projects = JSON.parse(projectsData);
        if (Array.isArray(projects)) {
          totalRecords += projects.length;
          projects.forEach((proj, index) => {
            if (this.validateProject(proj)) {
              validRecords++;
            } else {
              errors.push(`项目 ${index + 1}: 格式无效`);
            }
          });
        }
      }
    } catch (error) {
      errors.push(`项目数据解析失败: ${error}`);
    }

    console.log(`验证结果: 总计 ${totalRecords} 条记录，有效 ${validRecords} 条，错误 ${errors.length} 条`);

    if (errors.length > 0) {
      console.warn('验证错误:', errors);
    }

    progress.phases[1].completed = true;
    progress.phases[1].completedAt = new Date();
    progress.currentPhase = 2;
    await this.updateProgress(progress);

    console.log('✅ 数据验证完成');
  }

  /**
   * 阶段3: 同步数据到API
   */
  private async executePhase3(progress: MigrationProgress): Promise<void> {
    console.log('🔄 阶段3: 同步数据到API...');

    // 检查API连接
    try {
      const healthCheck = await (this.storage as any).healthCheck();
      if (!healthCheck) {
        throw new Error('API服务不可用');
      }
    } catch (error) {
      console.warn('API健康检查失败，将跳过同步步骤');
    }

    // 同步连接数据
    let syncedConnections = 0;
    try {
      const connectionsData = localStorage.getItem(DB_KEYS.CONNECTIONS);
      if (connectionsData) {
        const connections = JSON.parse(connectionsData);
        if (Array.isArray(connections)) {
          for (const conn of connections) {
            try {
              if (this.validateConnection(conn)) {
                await remoteConnectionService.createConnection({
                  name: conn.name || '未命名连接',
                  protocol: conn.protocol || 'rdp',
                  host: conn.host || '',
                  port: conn.port,
                  username: conn.username,
                  password: conn.password, // 将在后端加密
                  vpnType: conn.vpnType,
                  vpnLoginUrl: conn.vpnLoginUrl,
                  requiredVpnId: conn.requiredVpnId,
                  notes: conn.notes,
                  tags: conn.tags || [],
                  isActive: conn.isActive !== false,
                  projectId: conn.projectId || 'default-project',
                  ownerId: 'current_user' // 应该从认证系统获取
                });
                syncedConnections++;
              }
            } catch (error) {
              console.warn(`同步连接失败: ${conn.name}`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('同步连接数据失败:', error);
    }

    console.log(`已同步 ${syncedConnections} 个连接到API`);

    progress.phases[2].completed = true;
    progress.phases[2].completedAt = new Date();
    progress.currentPhase = 3;
    await this.updateProgress(progress);

    console.log('✅ 数据同步完成');
  }

  /**
   * 阶段4: 切换到API模式
   */
  private async executePhase4(progress: MigrationProgress): Promise<void> {
    console.log('🔀 阶段4: 切换到API模式...');

    // 验证API模式工作正常
    try {
      const testConnection = await remoteConnectionService.getConnections({ limit: 1 });
      console.log('API模式测试通过，获取到数据:', testConnection.connections.length, '个连接');
    } catch (error) {
      console.error('API模式测试失败:', error);
      throw new Error('API模式不可用，无法切换');
    }

    progress.phases[3].completed = true;
    progress.phases[3].completedAt = new Date();
    progress.currentPhase = 4;
    await this.updateProgress(progress);

    console.log('✅ 已切换到API模式');
  }

  /**
   * 验证连接数据格式
   */
  private validateConnection(conn: any): boolean {
    return conn &&
           typeof conn === 'object' &&
           typeof conn.name === 'string' &&
           typeof conn.host === 'string' &&
           (conn.protocol === undefined || typeof conn.protocol === 'string');
  }

  /**
   * 验证项目数据格式
   */
  private validateProject(proj: any): boolean {
    return proj &&
           typeof proj === 'object' &&
           typeof proj.name === 'string';
  }

  /**
   * 获取同步状态
   */
  async getSyncStatus(): Promise<SyncStatus> {
    await this.initializeStorage();

    const status: SyncStatus = {
      localStorage: true, // localStorage总是可用的
      api: false,
      lastSyncAt: new Date(),
      syncedRecords: 0,
      totalRecords: 0,
      conflicts: []
    };

    // 检查API状态
    try {
      const healthCheck = await (this.storage as any).healthCheck();
      status.api = healthCheck;
    } catch (error) {
      status.api = false;
      status.conflicts.push({
        id: 'api_connection',
        type: 'corrupted',
        details: `API连接失败: ${error instanceof Error ? error.message : '未知错误'}`
      });
    }

    // 比较localStorage和API数据
    try {
      const localConnections = JSON.parse(localStorage.getItem(DB_KEYS.CONNECTIONS) || '[]');
      status.totalRecords = localConnections.length;

      if (status.api) {
        const apiConnections = await remoteConnectionService.getConnections();
        status.syncedRecords = apiConnections.connections.length;

        // 检查冲突
        const localIds = new Set(localConnections.map((c: any) => c.id));
        const apiIds = new Set(apiConnections.connections.map((c: any) => c.id));

        localIds.forEach(id => {
          if (!apiIds.has(id)) {
            status.conflicts.push({
              id,
              type: 'missing',
              details: 'localStorage中的连接在API中不存在'
            });
          }
        });

        apiIds.forEach(id => {
          if (!localIds.has(id)) {
            status.conflicts.push({
              id,
              type: 'conflict',
              details: 'API中的连接在localStorage中不存在'
            });
          }
        });
      }
    } catch (error) {
      console.error('获取同步状态失败:', error);
    }

    return status;
  }

  /**
   * 执行增量同步
   */
  async performIncrementalSync(): Promise<void> {
    console.log('🔄 执行增量同步...');

    const syncStatus = await this.getSyncStatus();

    if (!syncStatus.api) {
      throw new Error('API不可用，无法同步');
    }

    // 同步新增的连接
    try {
      const localConnections = JSON.parse(localStorage.getItem(DB_KEYS.CONNECTIONS) || '[]');
      const apiConnections = await remoteConnectionService.getConnections();
      const apiIds = new Set(apiConnections.connections.map((c: any) => c.id));

      let syncedCount = 0;
      for (const localConn of localConnections) {
        if (!apiIds.has(localConn.id)) {
          try {
            await remoteConnectionService.createConnection({
              name: localConn.name || '未命名连接',
              protocol: localConn.protocol || 'rdp',
              host: localConn.host || '',
              port: localConn.port,
              username: localConn.username,
              password: localConn.password,
              vpnType: localConn.vpnType,
              vpnLoginUrl: localConn.vpnLoginUrl,
              requiredVpnId: localConn.requiredVpnId,
              notes: localConn.notes,
              tags: localConn.tags || [],
              isActive: localConn.isActive !== false,
              projectId: localConn.projectId || 'default-project',
              ownerId: 'current_user'
            });
            syncedCount++;
          } catch (error) {
            console.warn(`同步连接失败: ${localConn.name}`, error);
          }
        }
      }

      console.log(`增量同步完成，同步了 ${syncedCount} 个新连接`);

    } catch (error) {
      console.error('增量同步失败:', error);
      throw error;
    }
  }

  /**
   * 回滚迁移
   */
  async rollbackMigration(): Promise<void> {
    console.log('🔙 开始回滚迁移...');

    try {
      // 禁用API模式
      localStorage.setItem('VITE_USE_API', 'false');

      // 恢复备份数据（如果存在）
      const backups = Object.keys(localStorage).filter(key => key.startsWith('rh_backup_'));
      if (backups.length > 0) {
        const latestBackup = backups[backups.length - 1];
        const backupData = JSON.parse(localStorage.getItem(latestBackup) || '{}');

        for (const [key, value] of Object.entries(backupData)) {
          localStorage.setItem(key, value as string);
        }

        console.log(`已恢复备份: ${latestBackup}`);
      }

      // 清除迁移进度
      localStorage.removeItem('rh_migration_progress');

      console.log('✅ 回滚完成');

    } catch (error) {
      console.error('❌ 回滚失败:', error);
      throw error;
    }
  }
}

// 导出单例实例
export const migrationService = MigrationService.getInstance();