// API Adapter for Backend Integration
// Implements the same StorageInterface but uses HTTP API calls instead of localStorage
// This maintains compatibility with existing service code while enabling backend integration

import { StorageInterface, DB_KEYS, LocalStorageAdapter } from './storage.adapter';

export interface ApiConfig {
  baseURL: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface ApiErrorDetails {
  status: number;
  code: string;
  message: string;
  details?: any;
}

export class ApiAdapter implements StorageInterface {
  private config: ApiConfig;
  private baseURL: string;

  constructor(config?: Partial<ApiConfig>) {
    const defaultConfig: ApiConfig = {
      baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api/v1',
      timeout: 10000,
      retryAttempts: 3,
      retryDelay: 1000
    };

    this.config = { ...defaultConfig, ...config };
    this.baseURL = this.config.baseURL.replace(/\/$/, ''); // Remove trailing slash
  }

  private async makeRequest<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError({
          status: response.status,
          code: errorData.code || 'HTTP_ERROR',
          message: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          details: errorData.details
        });
      }

      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      if (error.name === 'AbortError') {
        throw new ApiError({
          status: 408,
          code: 'TIMEOUT',
          message: `Request timeout after ${this.config.timeout}ms`
        });
      }

      throw new ApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: error.message || 'Network error occurred'
      });
    }
  }

  private async makeRequestWithRetry<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await this.makeRequest<T>(endpoint, options);
      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on authentication errors or client errors (4xx)
        if (error instanceof ApiError && (error.status >= 400 && error.status < 500)) {
          throw error;
        }

        // If this is the last attempt, throw the error
        if (attempt === this.config.retryAttempts) {
          throw error;
        }

        // Wait before retrying with exponential backoff
        const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  private getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('rh_jwt_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async read<T>(collection: string, defaultValue: T): Promise<T> {
    try {
      let endpoint: string;
      
      switch (collection) {
        case DB_KEYS.USERS:
          endpoint = '/users';
          break;
        case DB_KEYS.PROJECTS:
          endpoint = '/projects';
          break;
        case DB_KEYS.CONNECTIONS:
          endpoint = '/connections';
          break;
        case DB_KEYS.REMOTE_CONNECTIONS:
          endpoint = '/remote-connections';
          break;
        case DB_KEYS.SESSION:
          endpoint = '/auth/current-user';
          break;
        default:
          console.warn(`Unknown collection: ${collection}, returning default value`);
          return defaultValue;
      }

      const response = await this.makeRequestWithRetry<ApiResponse<T>>(endpoint, {
        headers: {
          ...this.getAuthHeaders()
        }
      });

      if (response.success && response.data !== undefined) {
        return response.data;
      }

      return defaultValue;
    } catch (error) {
      console.error(`API Error reading from ${collection}:`, error);
      
      // For session errors, return null to indicate no authenticated user
      if (collection === DB_KEYS.SESSION) {
        return null as T;
      }

      return defaultValue;
    }
  }

  async write<T>(collection: string, data: T): Promise<void> {
    try {
      let endpoint: string;
      let method: string = 'POST';
      let payload: any = data;

      switch (collection) {
        case DB_KEYS.USERS:
          endpoint = '/users';
          // If data is an array (LocalStorage pattern), extract the last item for API
          if (Array.isArray(data)) {
            payload = data[data.length - 1];
          }
          // If data has an id, it's an update operation
          if (payload && typeof payload === 'object' && 'id' in payload && payload.id) {
            endpoint += `/${payload.id}`;
            method = 'PUT';
          }
          break;
        case DB_KEYS.PROJECTS:
          endpoint = '/projects';
          // If data is an array (LocalStorage pattern), extract the last item for API
          if (Array.isArray(data)) {
            payload = data[data.length - 1];
          }
          if (payload && typeof payload === 'object' && 'id' in payload && payload.id) {
            endpoint += `/${payload.id}`;
            method = 'PUT';
          }
          break;
        case DB_KEYS.CONNECTIONS:
          endpoint = '/connections';
          // If data is an array (LocalStorage pattern), extract the last item for API
          if (Array.isArray(data)) {
            payload = data[data.length - 1];
          }
          if (payload && typeof payload === 'object' && 'id' in payload && payload.id) {
            endpoint += `/${payload.id}`;
            method = 'PUT';
          }
          break;
        case DB_KEYS.REMOTE_CONNECTIONS:
          endpoint = '/remote-connections';
          // If data is an array (LocalStorage pattern), extract the last item for API
          if (Array.isArray(data)) {
            payload = data[data.length - 1];
          }
          if (payload && typeof payload === 'object' && 'id' in payload && payload.id) {
            endpoint += `/${payload.id}`;
            method = 'PUT';
          }
          break;
        case DB_KEYS.SESSION:
          // Session is managed through login/logout endpoints, not direct writes
          endpoint = '/auth/login';
          if (data && typeof data === 'object' && ('username' in data || 'emailOrUsername' in data)) {
            // Handle login case - support both username and emailOrUsername
            const loginData = 'emailOrUsername' in data ? data : { emailOrUsername: data.username, password: data.password };
            const loginResponse = await this.makeRequestWithRetry('/auth/login', {
              method: 'POST',
              body: JSON.stringify(loginData)
            });
            if (loginResponse.success && loginResponse.data?.tokens?.accessToken) {
              localStorage.setItem('rh_jwt_token', loginResponse.data.tokens.accessToken);
              localStorage.setItem('rh_refresh_token', loginResponse.data.tokens.refreshToken);
            }
            return;
          }
          throw new Error('Invalid session write operation');
        default:
          throw new Error(`Unknown collection: ${collection}`);
      }

      const response = await this.makeRequestWithRetry<ApiResponse<void>>(endpoint, {
        method,
        body: JSON.stringify(payload),
        headers: {
          ...this.getAuthHeaders()
        }
      });

      if (!response.success) {
        throw new Error(response.error?.message || 'Write operation failed');
      }
    } catch (error) {
      console.error(`API Error writing to ${collection}:`, error);
      throw error;
    }
  }

  async remove(collection: string): Promise<void> {
    try {
      let endpoint: string;

      switch (collection) {
        case DB_KEYS.USERS:
          // Users deletion requires specific user ID, not supported at collection level
          throw new Error('User deletion requires specific user ID');
        case DB_KEYS.PROJECTS:
          // Projects deletion requires specific project ID, not supported at collection level
          throw new Error('Project deletion requires specific project ID');
        case DB_KEYS.CONNECTIONS:
          // Connections deletion requires specific connection ID, not supported at collection level
          throw new Error('Connection deletion requires specific connection ID');
        case DB_KEYS.SESSION:
          endpoint = '/auth/logout';
          const response = await this.makeRequestWithRetry<ApiResponse<void>>(endpoint, {
            method: 'POST',
            headers: {
              ...this.getAuthHeaders()
            }
          });
          if (response.success) {
            localStorage.removeItem('rh_jwt_token');
          }
          break;
        default:
          throw new Error(`Unknown collection: ${collection}`);
      }
    } catch (error) {
      console.error(`API Error removing ${collection}:`, error);
      throw error;
    }
  }

  // Additional methods for specific operations that don't fit the read/write/remove pattern
  async deleteUser(userId: string): Promise<void> {
    const endpoint = `/users/${userId}`;
    await this.makeRequestWithRetry<ApiResponse<void>>(endpoint, {
      method: 'DELETE',
      headers: {
        ...this.getAuthHeaders()
      }
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    const endpoint = `/projects/${projectId}`;
    await this.makeRequestWithRetry<ApiResponse<void>>(endpoint, {
      method: 'DELETE',
      headers: {
        ...this.getAuthHeaders()
      }
    });
  }

  async deleteConnection(connectionId: string): Promise<void> {
    const endpoint = `/connections/${connectionId}`;
    await this.makeRequestWithRetry<ApiResponse<void>>(endpoint, {
      method: 'DELETE',
      headers: {
        ...this.getAuthHeaders()
      }
    });
  }

  // RemoteConnection specific methods
  async deleteRemoteConnection(connectionId: string): Promise<void> {
    const endpoint = `/remote-connections/${connectionId}`;
    await this.makeRequestWithRetry<ApiResponse<void>>(endpoint, {
      method: 'DELETE',
      headers: {
        ...this.getAuthHeaders()
      }
    });
  }

  async getRemoteConnectionStats(): Promise<any> {
    const endpoint = '/remote-connections/stats';
    const response = await this.makeRequestWithRetry<ApiResponse<any>>(endpoint, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders()
      }
    });
    return response.data;
  }

  async getSupportedProtocols(): Promise<any> {
    const endpoint = '/remote-connections/protocols';
    const response = await this.makeRequestWithRetry<ApiResponse<any>>(endpoint, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders()
      }
    });
    return response.data;
  }

  async getRecentlyAccessedConnections(): Promise<any> {
    const endpoint = '/remote-connections/recent';
    const response = await this.makeRequestWithRetry<ApiResponse<any>>(endpoint, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders()
      }
    });
    return response.data;
  }

  async getConnectionsByTag(tag: string): Promise<any> {
    const endpoint = `/remote-connections/by-tag/${encodeURIComponent(tag)}`;
    const response = await this.makeRequestWithRetry<ApiResponse<any>>(endpoint, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders()
      }
    });
    return response.data;
  }

  async recordConnectionAccess(connectionId: string): Promise<void> {
    const endpoint = `/remote-connections/${connectionId}/access`;
    await this.makeRequestWithRetry<ApiResponse<void>>(endpoint, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders()
      }
    });
  }

  async cloneConnection(connectionId: string, newName?: string): Promise<any> {
    const endpoint = `/remote-connections/${connectionId}/clone`;
    const response = await this.makeRequestWithRetry<ApiResponse<any>>(endpoint, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ name: newName })
    });
    return response.data;
  }

  async bulkDeleteConnections(connectionIds: string[]): Promise<void> {
    const endpoint = '/remote-connections/bulk-delete';
    await this.makeRequestWithRetry<ApiResponse<void>>(endpoint, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ connectionIds })
    });
  }

  // Migration methods
  async getMigrationInfo(): Promise<any> {
    const endpoint = '/migration/info';
    const response = await this.makeRequest<ApiResponse<any>>(endpoint, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders()
      }
    });
    return response.data;
  }

  async validateMigrationData(connections: any[]): Promise<any> {
    const endpoint = '/migration/validate';
    const response = await this.makeRequestWithRetry<ApiResponse<any>>(endpoint, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ connections })
    });
    return response.data;
  }

  async executeMigration(connections: any[], options: any = {}): Promise<any> {
    const endpoint = '/migration/execute';
    const response = await this.makeRequestWithRetry<ApiResponse<any>>(endpoint, {
      method: 'POST',
      headers: {
        ...this.getAuthHeaders()
      },
      body: JSON.stringify({ connections, ...options })
    });
    return response.data;
  }

  async getMigrationHistory(): Promise<any> {
    const endpoint = '/migration/history';
    const response = await this.makeRequestWithRetry<ApiResponse<any>>(endpoint, {
      method: 'GET',
      headers: {
        ...this.getAuthHeaders()
      }
    });
    return response.data;
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    try {
      const response = await this.makeRequest<ApiResponse<{ status: string }>>('/health', {
        method: 'GET'
      });
      return response.success && response.data?.status === 'ok';
    } catch (error) {
      console.error('Health check failed:', error);
      return false;
    }
  }

  // Get current configuration
  getConfig(): ApiConfig {
    return { ...this.config };
  }

  // Update configuration
  updateConfig(newConfig: Partial<ApiConfig>): void {
    this.config = { ...this.config, ...newConfig };
    if (newConfig.baseURL) {
      this.baseURL = newConfig.baseURL.replace(/\/$/, '');
    }
  }
}

// Custom Error class for API operations
export class ApiError extends Error {
  public status: number;
  public code: string;
  public details?: any;

  constructor({ status, code, message, details }: ApiErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Export singleton instance for direct API access
export const apiStorage = new ApiAdapter();