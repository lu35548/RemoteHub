// Configuration Service
// Centralized configuration management for RemoteHub
// Handles environment variables and application settings

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
  };
  security: {
    tokenRefreshThreshold: number; // minutes before expiry to refresh
    maxSessionAge: number; // minutes
  };
}

class ConfigService {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfiguration();
  }

  private loadConfiguration(): AppConfig {
    return {
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
      },
      security: {
        tokenRefreshThreshold: 5, // Refresh token 5 minutes before expiry
        maxSessionAge: 24 * 60, // 24 hours in minutes
      },
    };
  }

  // Get full configuration
  getConfig(): AppConfig {
    return { ...this.config };
  }

  // Get specific configuration sections
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

  // Update configuration at runtime
  updateApiConfig(newConfig: Partial<AppConfig['api']>): void {
    this.config.api = { ...this.config.api, ...newConfig };
  }

  updateFeatureConfig(newConfig: Partial<AppConfig['features']>): void {
    this.config.features = { ...this.config.features, ...newConfig };
  }

  // Utility methods
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

  // Validation methods
  validateApiConfig(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const { baseURL, timeout, retryAttempts, retryDelay } = this.config.api;

    if (!baseURL) {
      errors.push('API base URL is required');
    } else {
      try {
        new URL(baseURL);
      } catch {
        errors.push('API base URL is not a valid URL');
      }
    }

    if (timeout <= 0) {
      errors.push('API timeout must be positive');
    }

    if (retryAttempts < 0) {
      errors.push('API retry attempts cannot be negative');
    }

    if (retryDelay <= 0) {
      errors.push('API retry delay must be positive');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // Export configuration as JSON
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2);
  }

  // Import configuration from JSON
  importConfig(configJson: string): { success: boolean; errors?: string[] } {
    try {
      const newConfig = JSON.parse(configJson);
      this.config = { ...this.config, ...newConfig };
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        errors: [`Invalid configuration JSON: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  // Reset to defaults
  resetToDefaults(): void {
    this.config = this.loadConfiguration();
  }

  // Environment detection
  detectEnvironment(): 'development' | 'production' | 'test' {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'development';
    }
    
    if (hostname.includes('staging') || hostname.includes('test')) {
      return 'test';
    }
    
    return 'production';
  }

  // Auto-detect and set environment if not explicitly set
  autoDetectEnvironment(): void {
    if (!import.meta.env.VITE_ENVIRONMENT) {
      const detected = this.detectEnvironment();
      this.config.app.environment = detected;
    }
  }
}

// Export singleton instance
export const config = new ConfigService();

// Export type for TypeScript users
export type { AppConfig };