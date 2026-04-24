// Patched Storage Adapter with Enhanced Error Handling
// This replaces the original storage.adapter.ts to provide better error handling
// while maintaining localStorage functionality

export interface StorageInterface {
  read<T>(collection: string, defaultValue: T): Promise<T>;
  write<T>(collection: string, data: T): Promise<void>;
  remove(collection: string): Promise<void>;
}

export const DB_KEYS = {
  USERS: 'rh_db_users',
  PROJECTS: 'rh_db_projects',
  CONNECTIONS: 'rh_db_connections',
  SESSION: 'rh_current_user_id'
};

export class LocalStorageAdapter implements StorageInterface {
  async read<T>(collection: string, defaultValue: T): Promise<T> {
    try {
      const item = localStorage.getItem(collection);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`Error reading from storage (${collection}):`, error);
      // Try to clear corrupted data
      try {
        localStorage.removeItem(collection);
      } catch (clearError) {
        console.error('Failed to clear corrupted data:', clearError);
      }
      return defaultValue;
    }
  }

  async write<T>(collection: string, data: T): Promise<void> {
    try {
      localStorage.setItem(collection, JSON.stringify(data));
    } catch (error) {
      console.error(`Error writing to storage (${collection}):`, error);
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        throw new Error('存储空间不足，请清理数据后重试');
      }
      throw new Error('数据保存失败，请检查浏览器存储设置');
    }
  }

  async remove(collection: string): Promise<void> {
    try {
      localStorage.removeItem(collection);
    } catch (error) {
      console.error(`Error removing from storage (${collection}):`, error);
    }
  }

  // Check if localStorage is available
  static isAvailable(): boolean {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  // Get storage usage information
  static getStorageInfo(): { used: number; available: number; percentage: number } {
    let used = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        used += localStorage[key].length + key.length;
      }
    }
    // Approximate 5MB limit for localStorage
    const available = 5 * 1024 * 1024;
    return {
      used,
      available,
      percentage: (used / available) * 100
    };
  }
}

// Enhanced singleton with error checking
export const storage = new LocalStorageAdapter();

// Export a wrapper that provides better error messages
export const safeStorage = {
  async read<T>(collection: string, defaultValue: T): Promise<T> {
    if (!LocalStorageAdapter.isAvailable()) {
      console.warn('localStorage is not available, returning default value');
      return defaultValue;
    }
    return storage.read(collection, defaultValue);
  },

  async write<T>(collection: string, data: T): Promise<void> {
    if (!LocalStorageAdapter.isAvailable()) {
      throw new Error('localStorage 不可用，无法保存数据');
    }
    return storage.write(collection, data);
  },

  async remove(collection: string): Promise<void> {
    if (!LocalStorageAdapter.isAvailable()) {
      console.warn('localStorage is not available, cannot remove data');
      return;
    }
    return storage.remove(collection);
  },

  getStorageInfo: () => LocalStorageAdapter.getStorageInfo()
};