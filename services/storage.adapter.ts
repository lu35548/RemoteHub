
// Storage Adapter Pattern
// This allows switching between LocalStorage, REST API, or other persistence layers without changing business logic.
// Best Practice: Storage interface must be asynchronous to support future API/DB integration.

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
    // Simulate network latency for realism (optional, but good for testing loading states)
    // await new Promise(resolve => setTimeout(resolve, 50)); 
    try {
      const item = localStorage.getItem(collection);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error(`Error reading from storage (${collection}):`, error);
      return defaultValue;
    }
  }

  async write<T>(collection: string, data: T): Promise<void> {
    try {
      localStorage.setItem(collection, JSON.stringify(data));
    } catch (error) {
      console.error(`Error writing to storage (${collection}):`, error);
    }
  }

  async remove(collection: string): Promise<void> {
    localStorage.removeItem(collection);
  }
}

// Singleton instance
export const storage = new LocalStorageAdapter();
