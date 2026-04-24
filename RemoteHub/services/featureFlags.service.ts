// 功能开关管理器
// 统一管理所有新功能的启用/禁用状态
// 提供专业的功能开关控制机制

export interface FeatureFlags {
  // 认证功能开关
  useEnhancedAuth: boolean;           // 使用新的认证服务（JWT支持）

  // UI组件功能开关
  useLoadingStates: boolean;          // 使用新的加载状态组件
  useDatabaseConfig: boolean;        // 启用数据库配置模态框

  // 存储功能开关
  useApiStorage: boolean;             // 使用API存储适配器

  // 配置功能开关
  useEnhancedConfig: boolean;        // 使用增强的配置服务

  // 开发模式开关
  enableDebugMode: boolean;           // 启用调试模式和日志
}

class FeatureFlagsService {
  private flags: FeatureFlags;
  private listeners: Map<keyof FeatureFlags, ((value: boolean) => void)[]> = new Map();

  constructor() {
    this.flags = this.loadFromEnvironment();
    this.setupListenerDefaults();
  }

  private loadFromEnvironment(): FeatureFlags {
    return {
      useEnhancedAuth: import.meta.env.VITE_USE_ENHANCED_AUTH === 'true',
      useLoadingStates: import.meta.env.VITE_USE_LOADING_STATES === 'true',
      useDatabaseConfig: import.meta.env.VITE_USE_DATABASE_CONFIG === 'true',
      useApiStorage: import.meta.env.VITE_USE_API_STORAGE === 'true',
      useEnhancedConfig: import.meta.env.VITE_USE_ENHANCED_CONFIG === 'true',
      enableDebugMode: import.meta.env.VITE_ENABLE_DEBUG_MODE === 'true',
    };
  }

  private setupListenerDefaults(): void {
    Object.keys(this.flags).forEach(key => {
      this.listeners.set(key as keyof FeatureFlags, []);
    });
  }

  // 获取功能开关状态
  isEnabled<K extends keyof FeatureFlags>(flag: K): boolean {
    return this.flags[flag];
  }

  // 设置功能开关状态（运行时动态切换）
  setFlag<K extends keyof FeatureFlags>(flag: K, value: boolean): void {
    const oldValue = this.flags[flag];
    this.flags[flag] = value;

    if (this.enableDebugMode) {
      console.log(`[FeatureFlag] ${flag}: ${oldValue} -> ${value}`);
    }

    // 通知所有监听器
    const listeners = this.listeners.get(flag);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(value);
        } catch (error) {
          console.error(`Error in feature flag listener for ${flag}:`, error);
        }
      });
    }
  }

  // 添加功能开关监听器
  addListener<K extends keyof FeatureFlags>(
    flag: K,
    listener: (value: boolean) => void
  ): () => void {
    const listeners = this.listeners.get(flag);
    if (listeners) {
      listeners.push(listener);
    }

    // 返回移除监听器的函数
    return () => {
      const currentListeners = this.listeners.get(flag);
      if (currentListeners) {
        const index = currentListeners.indexOf(listener);
        if (index > -1) {
          currentListeners.splice(index, 1);
        }
      }
    };
  }

  // 获取所有功能开关状态
  getAllFlags(): FeatureFlags {
    return { ...this.flags };
  }

  // 重置为环境配置中的默认值
  resetToDefaults(): void {
    this.flags = this.loadFromEnvironment();
    if (this.enableDebugMode) {
      console.log('[FeatureFlag] Reset to environment defaults');
    }
  }

  // 启用所有功能开关（用于测试）
  enableAllFeatures(): void {
    Object.keys(this.flags).forEach(key => {
      (this.flags as any)[key] = true;
    });
    if (this.enableDebugMode) {
      console.log('[FeatureFlag] All features enabled');
    }
  }

  // 禁用所有功能开关（回退到原始实现）
  disableAllFeatures(): void {
    this.flags = {
      useEnhancedAuth: false,
      useLoadingStates: false,
      useDatabaseConfig: false,
      useApiStorage: false,
      useEnhancedConfig: false,
      enableDebugMode: this.flags.enableDebugMode, // 保留调试模式状态
    };
    if (this.enableDebugMode) {
      console.log('[FeatureFlag] All features disabled');
    }
  }

  // 获取功能开关配置摘要
  getSummary(): string {
    const enabledFlags = Object.entries(this.flags)
      .filter(([_, value]) => value)
      .map(([key, _]) => key);

    const totalFlags = Object.keys(this.flags).length;

    return `Enabled ${enabledFlags.length}/${totalFlags} features: ${enabledFlags.join(', ')}`;
  }

  // 验证功能开关配置
  validateConfiguration(): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // 检查依赖关系
    if (this.flags.useApiStorage && !this.flags.useEnhancedConfig) {
      warnings.push('建议启用 useEnhancedConfig 以获得更好的 API 存储体验');
    }

    if (this.flags.useDatabaseConfig && !this.flags.useEnhancedAuth) {
      warnings.push('建议启用 useEnhancedAuth 以配合数据库配置功能');
    }

    if (this.flags.useLoadingStates && !this.flags.useEnhancedConfig) {
      warnings.push('建议启用 useEnhancedConfig 以获得更好的加载状态管理');
    }

    // 检查开发模式
    if (this.enableDebugMode && import.meta.env.PROD) {
      warnings.push('生产环境建议关闭调试模式');
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }

  // 导出当前配置为 JSON
  exportConfiguration(): string {
    return JSON.stringify(this.flags, null, 2);
  }

  // 从 JSON 导入配置
  importConfiguration(configJson: string): { success: boolean; errors?: string[] } {
    try {
      const config = JSON.parse(configJson);
      const validFlags: Partial<FeatureFlags> = {};

      Object.keys(this.flags).forEach(key => {
        if (key in config && typeof config[key as keyof FeatureFlags] === 'boolean') {
          (validFlags as any)[key] = config[key as keyof FeatureFlags];
        }
      });

      this.flags = { ...this.flags, ...validFlags };
      return { success: true };
    } catch (error) {
      return {
        success: false,
        errors: [`配置导入失败: ${error instanceof Error ? error.message : '未知错误'}`]
      };
    }
  }

  // 调试模式开关
  private get enableDebugMode(): boolean {
    return this.flags.enableDebugMode;
  }

  // 开发环境辅助方法
  logCurrentState(): void {
    if (this.enableDebugMode) {
      console.group('[FeatureFlags] Current State');
      Object.entries(this.flags).forEach(([key, value]) => {
        console.log(`${key}: ${value ? '✅ ENABLED' : '❌ DISABLED'}`);
      });
      console.groupEnd();
    }
  }
}

// 导出单例实例
export const featureFlags = new FeatureFlagsService();

// 导出类型定义
export type { FeatureFlags };

// 便捷方法
export const isEnabled = <K extends keyof FeatureFlags>(flag: K): boolean => {
  return featureFlags.isEnabled(flag);
};

export const setFlag = <K extends keyof FeatureFlags>(flag: K, value: boolean): void => {
  featureFlags.setFlag(flag, value);
};

export const addFlagListener = <K extends keyof FeatureFlags>(
  flag: K,
  listener: (value: boolean) => void
): (() => void) => {
  return featureFlags.addListener(flag, listener);
};