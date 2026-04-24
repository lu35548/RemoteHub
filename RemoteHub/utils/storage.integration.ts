// Storage Integration Utility
// Provides utilities for migrating between localStorage and API storage methods
// and for switching between them seamlessly

import { storage, DB_KEYS } from '../services/storage.adapter';
import { apiStorage } from '../services/api.adapter';
import { config } from '../services/config.service';
import { User, Project, RemoteConnection } from '../types';

export interface MigrationResult {
  success: boolean;
  migrated: {
    users: number;
    projects: number;
    connections: number;
  };
  errors: string[];
}

export interface StorageBackup {
  timestamp: number;
  version: string;
  data: {
    users: User[];
    projects: Project[];
    connections: RemoteConnection[];
    sessions: string | null;
  };
}

export class StorageIntegration {
  // Check if localStorage has data that can be migrated
  static async hasLocalStorageData(): Promise<boolean> {
    try {
      const users = await storage.read<User[]>(DB_KEYS.USERS, []);
      const projects = await storage.read<Project[]>(DB_KEYS.PROJECTS, []);
      const connections = await storage.read<RemoteConnection[]>(DB_KEYS.CONNECTIONS, []);

      return users.length > 0 || projects.length > 0 || connections.length > 0;
    } catch (error) {
      console.error('Error checking localStorage data:', error);
      return false;
    }
  }

  // Create backup of localStorage data
  static async createBackup(): Promise<StorageBackup> {
    const users = await storage.read<User[]>(DB_KEYS.USERS, []);
    const projects = await storage.read<Project[]>(DB_KEYS.PROJECTS, []);
    const connections = await storage.read<RemoteConnection[]>(DB_KEYS.CONNECTIONS, []);
    const sessions = await storage.read<string | null>(DB_KEYS.SESSION, null);

    return {
      timestamp: Date.now(),
      version: '1.0.0',
      data: {
        users,
        projects,
        connections,
        sessions
      }
    };
  }

  // Download backup as JSON file
  static downloadBackup(backup: StorageBackup): void {
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `remotehub-backup-${new Date(backup.timestamp).toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Restore from backup
  static async restoreFromBackup(backupFile: File): Promise<{ success: boolean; errors: string[] }> {
    try {
      const text = await backupFile.text();
      const backup: StorageBackup = JSON.parse(text);

      const errors: string[] = [];

      // Validate backup structure
      if (!backup.data || typeof backup.data !== 'object') {
        errors.push('Invalid backup file structure');
        return { success: false, errors };
      }

      // Restore data to localStorage
      try {
        if (backup.data.users) {
          await storage.write(DB_KEYS.USERS, backup.data.users);
        }
        if (backup.data.projects) {
          await storage.write(DB_KEYS.PROJECTS, backup.data.projects);
        }
        if (backup.data.connections) {
          await storage.write(DB_KEYS.CONNECTIONS, backup.data.connections);
        }
        if (backup.data.sessions) {
          await storage.write(DB_KEYS.SESSION, backup.data.sessions);
        }
      } catch (error) {
        errors.push(`Failed to restore data: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      return {
        success: errors.length === 0,
        errors
      };
    } catch (error) {
      return {
        success: false,
        errors: [`Failed to parse backup file: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  // Migrate data from localStorage to API
  static async migrateToApi(): Promise<MigrationResult> {
    const result: MigrationResult = {
      success: true,
      migrated: { users: 0, projects: 0, connections: 0 },
      errors: []
    };

    try {
      // Check if API is available
      const isApiHealthy = await apiStorage.healthCheck();
      if (!isApiHealthy) {
        result.success = false;
        result.errors.push('API is not available for migration');
        return result;
      }

      // Create backup before migration
      const backup = await this.createBackup();
      this.downloadBackup(backup);

      // Migrate users
      try {
        const users = await storage.read<User[]>(DB_KEYS.USERS, []);
        for (const user of users) {
          // Remove password hash from frontend - server will handle it
          const { passwordHash, ...userWithoutPassword } = user;
          await apiStorage.write(DB_KEYS.USERS, userWithoutPassword);
          result.migrated.users++;
        }
      } catch (error) {
        result.errors.push(`Failed to migrate users: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Migrate projects
      try {
        const projects = await storage.read<Project[]>(DB_KEYS.PROJECTS, []);
        for (const project of projects) {
          await apiStorage.write(DB_KEYS.PROJECTS, project);
          result.migrated.projects++;
        }
      } catch (error) {
        result.errors.push(`Failed to migrate projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Migrate connections
      try {
        const connections = await storage.read<RemoteConnection[]>(DB_KEYS.CONNECTIONS, []);
        for (const connection of connections) {
          await apiStorage.write(DB_KEYS.CONNECTIONS, connection);
          result.migrated.connections++;
        }
      } catch (error) {
        result.errors.push(`Failed to migrate connections: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      result.success = result.errors.length === 0;
    } catch (error) {
      result.success = false;
      result.errors.push(`Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  // Switch storage method
  static async switchStorageMethod(useApi: boolean): Promise<{ success: boolean; message: string }> {
    try {
      if (useApi && !config.shouldUseApi()) {
        // Check if migration is needed
        const hasLocalStorageData = await this.hasLocalStorageData();

        if (hasLocalStorageData) {
          const confirmMessage =
            'You have data in localStorage that needs to be migrated to the API.\n' +
            'Would you like to migrate this data now?\n\n' +
            'A backup will be automatically created before migration.';

          if (!confirm(confirmMessage)) {
            return {
              success: false,
              message: 'Storage method change cancelled by user'
            };
          }

          const migrationResult = await this.migrateToApi();
          if (!migrationResult.success) {
            return {
              success: false,
              message: `Migration failed: ${migrationResult.errors.join(', ')}`
            };
          }
        }

        // Update configuration to use API
        config.updateApiConfig({ baseURL: config.getApiConfig().baseURL });
        config.updateFeatureConfig({ databaseConfig: true });

        return {
          success: true,
          message: `Successfully switched to API storage. Migrated ${await this.hasLocalStorageData() ? 'existing data' : 'with no existing data'}.`
        };
      } else if (!useApi && config.shouldUseApi()) {
        // Switch back to localStorage
        // Update configuration to use localStorage
        config.updateApiConfig({ useApi: false });

        return {
          success: true,
          message: 'Successfully switched to localStorage storage'
        };
      } else {
        return {
          success: true,
          message: `Already using ${useApi ? 'API' : 'localStorage'} storage`
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Failed to switch storage method: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Validate API configuration
  static async validateApiConfiguration(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    const apiConfig = config.getApiConfig();

    // Test API health
    try {
      const isHealthy = await apiStorage.healthCheck();
      if (!isHealthy) {
        errors.push('API health check failed');
      }
    } catch (error) {
      errors.push(`API health check error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate configuration
    const configValidation = config.validateApiConfig();
    if (!configValidation.isValid) {
      errors.push(...configValidation.errors);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  // Get storage status information
  static async getStorageStatus(): Promise<{
    currentMethod: 'localStorage' | 'api';
    localStorageDataExists: boolean;
    apiAvailable: boolean;
    lastBackup: StorageBackup | null;
  }> {
    const currentMethod = config.shouldUseApi() ? 'api' : 'localStorage';
    const localStorageDataExists = await this.hasLocalStorageData();
    const apiAvailable = await this.healthCheckApi();

    // Try to get last backup from localStorage
    let lastBackup: StorageBackup | null = null;
    try {
      const backupData = localStorage.getItem('remotehub_last_backup');
      if (backupData) {
        lastBackup = JSON.parse(backupData);
      }
    } catch (error) {
      console.error('Error reading last backup:', error);
    }

    return {
      currentMethod,
      localStorageDataExists,
      apiAvailable,
      lastBackup
    };
  }

  // Private helper method for API health check
  private static async healthCheckApi(): Promise<boolean> {
    try {
      return await apiStorage.healthCheck();
    } catch {
      return false;
    }
  }

  // Clear all data (with confirmation)
  static async clearAllData(confirm: boolean = false): Promise<{ success: boolean; message: string }> {
    if (!confirm) {
      const confirmed = window.confirm(
        'Are you sure you want to clear all data? This action cannot be undone.\n\n' +
        'It is recommended to create a backup first.'
      );
      if (!confirmed) {
        return {
          success: false,
          message: 'Data clearing cancelled by user'
        };
      }
    }

    try {
      // Clear localStorage
      await storage.remove(DB_KEYS.USERS);
      await storage.remove(DB_KEYS.PROJECTS);
      await storage.remove(DB_KEYS.CONNECTIONS);
      await storage.remove(DB_KEYS.SESSION);

      return {
        success: true,
        message: 'All data cleared successfully'
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to clear data: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  // Generate data statistics
  static async getDataStatistics(): Promise<{
    users: number;
    projects: number;
    connections: number;
    activeConnections: number;
    lastModified: number | null;
  }> {
    try {
      const users = await storage.read<User[]>(DB_KEYS.USERS, []);
      const projects = await storage.read<Project[]>(DB_KEYS.PROJECTS, []);
      const connections = await storage.read<RemoteConnection[]>(DB_KEYS.CONNECTIONS, []);

      // Calculate last modified timestamp
      const allTimestamps = [
        ...users.map(u => u.lastActiveAt),
        ...projects.map(p => new Date(p.updatedAt).getTime()),
        ...connections.map(c => c.lastAccessed ? new Date(c.lastAccessed).getTime() : 0)
      ];

      const lastModified = allTimestamps.length > 0 ? Math.max(...allTimestamps) : null;

      return {
        users: users.length,
        projects: projects.length,
        connections: connections.length,
        activeConnections: connections.filter(c => c.lastAccessed).length,
        lastModified
      };
    } catch (error) {
      console.error('Error getting data statistics:', error);
      return {
        users: 0,
        projects: 0,
        connections: 0,
        activeConnections: 0,
        lastModified: null
      };
    }
  }
}

// Export convenience functions for common operations
export const createStorageBackup = () => StorageIntegration.createBackup();
export const downloadStorageBackup = (backup: StorageBackup) => StorageIntegration.downloadBackup(backup);
export const migrateToApiStorage = () => StorageIntegration.migrateToApi();
export const switchStorageMethod = (useApi: boolean) => StorageIntegration.switchStorageMethod(useApi);
export const getStorageStatus = () => StorageIntegration.getStorageStatus();
export const getDataStatistics = () => StorageIntegration.getDataStatistics();