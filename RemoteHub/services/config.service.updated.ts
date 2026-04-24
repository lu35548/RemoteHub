// Updated Configuration Service with Feature Flags Integration
// Centralized configuration management with feature flag support
// Handles environment variables, application settings, and feature toggles

import { featureFlags } from './featureFlags.service';

export interface AppConfig {
  api: {
    useApi: boolean;
    baseURL: string;
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
  };
  app: {
    title: string;
    version: string;
    environment: 'development' | 'production' | 'test';
  };
  features: {
    databaseConfig: boolean;
    connectionTesting: boolean;
    adminPanel: boolean;
    // 新增的功能开关相关配置
    enhancedAuth: boolean;
    loadingStates: boolean;
    databaseConfigModal: boolean;
    enhancedConfig: boolean;
    debugMode: boolean;
  };
  security: {
    tokenRefreshThreshold: number; // minutes before expiry to refresh
    maxSessionAge: number; // minutes
  };
}

class ConfigService {
  private config: AppConfig;
  private initialized = false;

  constructor() {
    this.config = this.loadConfiguration();
    this.initialized = true;
    this.setupFeatureFlagListeners();
  }

  private loadConfiguration(): AppConfig {
    const baseConfig = {
      api: {
        useApi: import.meta.env.VITE_USE_API === 'true',
        baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1',
        timeout: parseInt(import.meta.env.VITE_API_TIMEOUT || '10000'),
        retryAttempts: parseInt(import.meta.env.VITE_API_RETRY_ATTEMPTS || '3'),
        retryDelay: parseInt(import.meta.env.VITE_API_RETRY_DELAY || '1000'),
      },
      app: {
        title: import.meta.env.VITE_APP_TITLE || 'RemoteHub - 团队远程协作平台',
        version: import.meta.env.VITE_APP_VERSION || '1.0.0',
        environment: (import.meta.env.VITE_ENVIRONMENT as 'development' | 'production' | 'test') || 'development',
      },
      features: {
        databaseConfig: import.meta.env.VITE_ENABLE_DATABASE_CONFIG === 'true',
        connectionTesting: import.meta.env.VITE_ENABLE_CONNECTION_TESTING === 'true',
        adminPanel: import.meta.env.VITE_ENABLE_ADMIN_PANEL === 'true',
        // 新增功能开关，初始值来自环境变量，但会被功能开关覆盖
        enhancedAuth: import.meta.env.VITE_USE_ENHANCED_AUTH === 'true',
        loadingStates: import.meta.env.VITE_USE_LOADING_STATES === 'true',
        databaseConfigModal: import.meta.env.VITE_USE_DATABASE_CONFIG === 'true',
        enhancedConfig: import.meta.env.VITE_USE_ENHANCED_CONFIG === 'true',
        debugMode: import.meta.env.VITE_ENABLE_DEBUG_MODE === 'true',
      },
      security: {
        tokenRefreshThreshold: 5, // Refresh token 5 minutes before expiry
        maxSessionAge: 24 * 60, // 24 hours in minutes
      },
    };

    // 根据功能开关更新配置
    return this.applyFeatureFlags(baseConfig);
  }

  private applyFeatureFlags(baseConfig: AppConfig): AppConfig {
    return {
      ...baseConfig,
      features: {
        ...baseConfig.features,
        // 功能开关值覆盖环境变量值
        enhancedAuth: featureFlags.isEnabled('useEnhancedAuth'),
        loadingStates: featureFlags.isEnabled('useLoadingStates'),
        databaseConfigModal: featureFlags.isEnabled('useDatabaseConfig'),
        enhancedConfig: featureFlags.isEnabled('useEnhancedConfig'),
        debugMode: featureFlags.isEnabled('enableDebugMode'),
      },
      api: {
        ...baseConfig.api,
        useApi: featureFlags.isEnabled('useApiStorage') ? true : baseConfig.api.useApi,
      },
    };
  }

  private setupFeatureFlagListeners(): void {
    // 监听功能开关变化，实时更新配置
    const updateConfig = () => {
      const oldConfig = { ...this.config };
      this.config = this.applyFeatureFlags(this.config);

      // 记录配置变化（如果在调试模式）
      if (this.config.features.debugMode) {
        console.group('[ConfigService] Configuration Updated');
        console.log('Previous:', oldConfig);
        console.log('Current:', this.config);
        console.groupEnd();
      }
    };

    // 监听相关的功能开关
    featureFlags.addListener('useEnhancedAuth', updateConfig);
    featureFlags.addListener('useLoadingStates', updateConfig);
    featureFlags.addListener('useDatabaseConfig', updateConfig);
    featureFlags.addListener('useApiStorage', updateConfig);
    featureFlags.addListener('useEnhancedConfig', updateConfig);
    featureFlags.addListener('enableDebugMode', updateConfig);
  }

  // 获取完整配置
  getConfig(): AppConfig {
    return { ...this.config };
  }

  // 获取特定配置部分
  getApiConfig() {
    return { ...this.config.api };
  }

  getAppConfig() {
    return { ...this.config.app };
  }

  getFeatureConfig() {
    return { ...this.config.features };
  }

  getSecurityConfig() {
    return { ...this.config.security };
  }

  // 更新配置
  updateApiConfig(newConfig: Partial<AppConfig['api']>): void {
    this.config.api = { ...this.config.api, ...newConfig };
  }

  updateFeatureConfig(newConfig: Partial<AppConfig['features']>): void {
    this.config.features = { ...this.config.features, ...newConfig };
  }

  // 功能开关相关便捷方法
  isEnhancedAuthEnabled(): boolean {
    return this.config.features.enhancedAuth;
  }

  isLoadingStatesEnabled(): boolean {
    return this.config.features.loadingStates;
  }

  isDatabaseConfigModalEnabled(): boolean {
    return this.config.features.databaseConfigModal;
  }

  isEnhancedConfigEnabled(): boolean {
    return this.config.features.enhancedConfig;
  }

  isDebugModeEnabled(): boolean {
    return this.config.features.debugMode;
  }

  // 原有方法保持兼容
  isDevelopmentMode(): boolean {
    return this.config.app.environment === 'development';
  }

  isProductionMode(): boolean {
    return this.config.app.environment === 'production';
  }

  shouldUseApi(): boolean {
    return this.config.api.useApi;
  }

  isDatabaseConfigEnabled(): boolean {
    return this.config.features.databaseConfig;
  }

  isConnectionTestingEnabled(): boolean {
    return this.config.features.connectionTesting;
  }

  isAdminPanelEnabled(): boolean {
    return this.config.features.adminPanel;
  }

  // 验证配置
  validateConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // API配置验证
    if (this.config.api.useApi && !this.config.api.baseURL) {
      errors.push('API启用时必须提供基础URL');
    }

    if (this.config.api.timeout <= 0) {
      errors.push('API超时时间必须为正数');
    }

    // 功能开关一致性检查
    if (this.config.features.databaseConfigModal && !this.config.features.enhancedAuth) {
      errors.push('数据库配置需要增强认证功能');
    }

    if (this.config.features.enhancedConfig && !this.isDevelopmentMode() && this.config.features.debugMode) {
      errors.push('生产环境建议关闭调试模式');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // 获取配置摘要
  getSummary(): string {
    const enabledFeatures = Object.entries(this.config.features)
      .filter(([_, value]) => value)
      .map(([key, _]) => key);

    return `Features: ${enabledFeatures.join(', ')} | Mode: ${this.config.app.environment}`;
  }

  // 导出配置
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  // 导入配置
  importConfig(configJson: string): { success: boolean; errors?: string[] } {
    try {
      const newConfig = JSON.parse(configJson);

      // 验证配置结构
      if (!newConfig.api || !newConfig.app || !newConfig.features) {
        throw new Error('配置结构无效');
      }

      this.config = { ...this.config, ...newConfig };
      return { success: true };
    } catch (error) {
      return {
        success: false,
        errors: [`配置导入失败: ${error instanceof Error ? error.message : '未知错误'}`]
      };
    }
  }

  // 重置为默认值
  resetToDefaults(): void {
    this.config = this.loadConfiguration();
    if (this.config.features.debugMode) {
      console.log('[ConfigService] Reset to defaults');
    }
  }

  // 初始化检查
  isInitialized(): boolean {
    return this.initialized;
  }

  // 获取功能开关服务实例（便捷访问）
  getFeatureFlags() {
    return featureFlags;
  }

  // 开发环境辅助方法
  logCurrentState(): void {
    if (this.config.features.debugMode) {
      console.group('[ConfigService] Current Configuration');
      console.log('API:', this.config.api);
      console.log('App:', this.config.app);
      console.log('Features:', this.config.features);
      console.log('Security:', this.config.security);
      console.groupEnd();
    }
  }
}

// 导出单例实例
export const config = new ConfigService();

// 导出类型定义
export type { AppConfig };

// 开发环境下的全局访问（仅用于调试）
if (typeof window !== 'undefined' && import.meta.env.DEV) {
  (window as any).config = config;
  (window as any).featureFlags = featureFlags;
}