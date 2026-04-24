// 服务适配器层
// 根据功能开关动态选择新旧实现
// 保持向后兼容性，支持渐进式功能启用

import { config } from '../config.service';
import { featureFlags } from '../featureFlags.service';

// 导入原始服务
import { AuthService as OriginalAuthService } from '../auth.service';
import { DataService as OriginalDataService } from '../data.service';
import { storage as OriginalStorage } from '../storage.adapter';

// 导入增强服务（新实现）
import { AuthService as EnhancedAuthService } from '../auth.service.updated';
import { apiStorage } from '../api.adapter';
import { LoadingButton, LoadingSpinner, FullScreenLoading } from '../../components/LoadingStates';
import { DatabaseConfigModal } from '../../components/DatabaseConfigModal';

// 认证服务适配器
export class AuthServiceAdapter {
  private static originalService = OriginalAuthService;
  private static enhancedService = EnhancedAuthService;

  // 初始化认证服务
  static async initialize(): Promise<void> {
    if (config.isEnhancedAuthEnabled()) {
      if (config.isDebugModeEnabled()) {
        console.log('[AuthServiceAdapter] Using enhanced authentication service');
      }
      return this.enhancedService.initialize();
    } else {
      if (config.isDebugModeEnabled()) {
        console.log('[AuthServiceAdapter] Using original authentication service');
      }
      return this.originalService.initialize();
    }
  }

  // 登录
  static async login(username: string, password: string): Promise<any> {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.login(username, password);
    } else {
      return this.originalService.login(username, password);
    }
  }

  // 登出
  static async logout(): Promise<void> {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.logout();
    } else {
      return this.originalService.logout();
    }
  }

  // 获取当前用户
  static async getCurrentUser(): Promise<any> {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.getCurrentUser();
    } else {
      return this.originalService.getCurrentUser();
    }
  }

  // 获取所有用户
  static async getAllUsers(): Promise<any[]> {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.getAllUsers();
    } else {
      return this.originalService.getAllUsers();
    }
  }

  // 创建用户
  static async createUser(newUser: any, creator: any): Promise<any> {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.createUser(newUser, creator);
    } else {
      return this.originalService.createUser(newUser, creator);
    }
  }

  // 删除用户
  static async deleteUser(targetUserId: string, admin: any): Promise<void> {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.deleteUser(targetUserId, admin);
    } else {
      return this.originalService.deleteUser(targetUserId, admin);
    }
  }

  // 修改密码
  static async changeMyPassword(userId: string, oldPass: string, newPass: string): Promise<void> {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.changeMyPassword(userId, oldPass, newPass);
    } else {
      return this.originalService.changeMyPassword(userId, oldPass, newPass);
    }
  }

  // 重置密码
  static async resetPassword(targetUserId: string, admin: any): Promise<void> {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.resetPassword(targetUserId, admin);
    } else {
      return this.originalService.resetPassword(targetUserId, admin);
    }
  }

  // 获取在线用户数
  static async getOnlineCount(): Promise<number> {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.getOnlineCount();
    } else {
      return this.originalService.getOnlineCount();
    }
  }

  // 获取在线用户
  static async getOnlineUsers(): Promise<any[]> {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.getOnlineUsers();
    } else {
      return this.originalService.getOnlineUsers();
    }
  }

  // 心跳
  static async heartbeat(): Promise<void> {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.heartbeat();
    } else {
      return this.originalService.heartbeat();
    }
  }

  // 检查是否已认证
  static isAuthenticated(): boolean {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.isAuthenticated();
    } else {
      return !!localStorage.getItem('rh_current_user_id');
    }
  }

  // 获取访问令牌
  static getAccessToken(): string | null {
    if (config.isEnhancedAuthEnabled()) {
      return this.enhancedService.getAccessToken();
    } else {
      return null; // 原始实现不支持令牌
    }
  }
}

// 数据服务适配器
export class DataServiceAdapter {
  // 获取项目
  static async getProjects(): Promise<any[]> {
    const storage = config.shouldUseApi() ? apiStorage : OriginalStorage;
    try {
      return await storage.read('rh_db_projects', []);
    } catch (error) {
      console.error('Failed to get projects:', error);
      return [];
    }
  }

  // 保存项目
  static async saveProject(projectInput: any, user: any): Promise<any> {
    const storage = config.shouldUseApi() ? apiStorage : OriginalStorage;

    try {
      const projects = await this.getProjects();
      const idx = projects.findIndex(p => p.id === projectInput.id);

      const currentTimestamp = new Date().toISOString();
      const audit = {
        createdBy: idx !== -1 ? projects[idx].createdBy : user.nickname,
        createdById: idx !== -1 ? projects[idx].createdById : user.id,
        createdAt: idx !== -1 ? projects[idx].createdAt : currentTimestamp,
        updatedBy: user.nickname,
        updatedById: user.id,
        updatedAt: currentTimestamp
      };

      const fullProject = { ...projectInput, ...audit };

      if (idx === -1) {
        projects.push(fullProject);
      } else {
        projects[idx] = fullProject;
      }

      await storage.write('rh_db_projects', projects);
      return fullProject;
    } catch (error) {
      console.error('Failed to save project:', error);
      throw error;
    }
  }

  // 删除项目
  static async deleteProject(id: string): Promise<void> {
    const storage = config.shouldUseApi() ? apiStorage : OriginalStorage;

    try {
      // 删除项目
      const projects = await this.getProjects();
      const newProjects = projects.filter(p => p.id !== id);
      await storage.write('rh_db_projects', newProjects);

      // 级联删除连接
      const connections = await this.getConnections();
      const newConnections = connections.filter(c => c.projectId !== id);
      await storage.write('rh_db_connections', newConnections);
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  }

  // 获取连接
  static async getConnections(): Promise<any[]> {
    const storage = config.shouldUseApi() ? apiStorage : OriginalStorage;

    try {
      return await storage.read('rh_db_connections', []);
    } catch (error) {
      console.error('Failed to get connections:', error);
      return [];
    }
  }

  // 保存连接
  static async saveConnection(connInput: any, user: any): Promise<any> {
    const storage = config.shouldUseApi() ? apiStorage : OriginalStorage;

    try {
      const connections = await this.getConnections();
      const idx = connections.findIndex(c => c.id === connInput.id);

      const currentTimestamp = new Date().toISOString();
      const audit = {
        createdBy: idx !== -1 ? connections[idx].createdBy : user.nickname,
        createdById: idx !== -1 ? connections[idx].createdById : user.id,
        createdAt: idx !== -1 ? connections[idx].createdAt : currentTimestamp,
        updatedBy: user.nickname,
        updatedById: user.id,
        updatedAt: currentTimestamp
      };

      const fullConn = { ...connInput, ...audit };

      if (idx === -1) {
        connections.push(fullConn);
      } else {
        connections[idx] = fullConn;
      }

      await storage.write('rh_db_connections', connections);
      return fullConn;
    } catch (error) {
      console.error('Failed to save connection:', error);
      throw error;
    }
  }

  // 删除连接
  static async deleteConnection(id: string): Promise<void> {
    const storage = config.shouldUseApi() ? apiStorage : OriginalStorage;

    try {
      const connections = await this.getConnections();
      const remainingConns = connections.filter(c => c.id !== id);

      // 清理引用关系
      const cleanConns = remainingConns.map(c => {
        if (c.requiredVpnId === id) {
          const { requiredVpnId, ...rest } = c;
          return { ...rest, requiredVpnId: undefined };
        }
        return c;
      });

      await storage.write('rh_db_connections', cleanConns);
    } catch (error) {
      console.error('Failed to delete connection:', error);
      throw error;
    }
  }
}

// UI组件适配器
export class UIComponentsAdapter {
  // 获取加载按钮组件
  static getLoadingButton() {
    if (config.isLoadingStatesEnabled()) {
      return LoadingButton;
    }
    // 返回原始按钮组件（需要创建或使用现有的）
    return null; // 暂时返回null，实际应该返回原始按钮
  }

  // 获取加载指示器组件
  static getLoadingSpinner() {
    if (config.isLoadingStatesEnabled()) {
      return LoadingSpinner;
    }
    // 返回原始加载指示器
    return null;
  }

  // 获取全屏加载组件
  static getFullScreenLoading() {
    if (config.isLoadingStatesEnabled()) {
      return FullScreenLoading;
    }
    return null;
  }

  // 获取数据库配置模态框
  static getDatabaseConfigModal() {
    if (config.isDatabaseConfigModalEnabled()) {
      return DatabaseConfigModal;
    }
    return null;
  }

  // 检查是否应该使用增强UI
  static shouldUseEnhancedUI(): boolean {
    return config.isLoadingStatesEnabled() || config.isDatabaseConfigModalEnabled();
  }
}

// 存储适配器（统一存储接口）
export class StorageAdapter {
  // 读取数据
  static async read<T>(key: string, defaultValue: T): Promise<T> {
    const storage = config.shouldUseApi() ? apiStorage : OriginalStorage;

    try {
      // 映射DB_KEYS到实际的存储键
      const mappedKey = this.mapStorageKey(key);
      return await storage.read(mappedKey, defaultValue);
    } catch (error) {
      console.error(`Failed to read from storage (${key}):`, error);
      return defaultValue;
    }
  }

  // 写入数据
  static async write<T>(key: string, data: T): Promise<void> {
    const storage = config.shouldUseApi() ? apiStorage : OriginalStorage;

    try {
      const mappedKey = this.mapStorageKey(key);
      await storage.write(mappedKey, data);
    } catch (error) {
      console.error(`Failed to write to storage (${key}):`, error);
      throw error;
    }
  }

  // 删除数据
  static async remove(key: string): Promise<void> {
    const storage = config.shouldUseApi() ? apiStorage : OriginalStorage;

    try {
      const mappedKey = this.mapStorageKey(key);
      await storage.remove(mappedKey);
    } catch (error) {
      console.error(`Failed to remove from storage (${key}):`, error);
    }
  }

  // 映射存储键
  private static mapStorageKey(key: string): string {
    const keyMap: Record<string, string> = {
      'users': 'rh_db_users',
      'projects': 'rh_db_projects',
      'connections': 'rh_db_connections',
      'session': 'rh_current_user_id',
      'DB_KEYS.USERS': 'rh_db_users',
      'DB_KEYS.PROJECTS': 'rh_db_projects',
      'DB_KEYS.CONNECTIONS': 'rh_db_connections',
      'DB_KEYS.SESSION': 'rh_current_user_id'
    };

    return keyMap[key] || key;
  }

  // 健康检查
  static async healthCheck(): Promise<boolean> {
    if (config.shouldUseApi()) {
      return await apiStorage.healthCheck();
    } else {
      return true; // localStorage总是可用的
    }
  }
}

// 导出便捷的服务别名
export const AuthService = AuthServiceAdapter;
export const DataService = DataServiceAdapter;
export const UIComponents = UIComponentsAdapter;
export const StorageService = StorageAdapter;