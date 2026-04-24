
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
  REMOTE_CONNECTIONS: 'rh_db_remote_connections',
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

// Cache Promise to avoid multiple initializations
let storageInstancePromise: Promise<StorageInterface> | null = null;

// Factory function to create appropriate adapter based on configuration
async function createStorageAdapterAsync(): Promise<StorageInterface> {
  // If we already have a cached Promise, return it
  if (storageInstancePromise) {
    return storageInstancePromise;
  }

  // Create and cache initialization Promise
  storageInstancePromise = (async () => {
    // Check if we should use API adapter or localStorage
    const useApi = import.meta.env.VITE_USE_API === 'true';
    console.log(`[Storage] Using ${useApi ? 'API' : 'LocalStorage'} adapter (VITE_USE_API=${import.meta.env.VITE_USE_API})`);

    if (useApi) {
      // Dynamic import to avoid circular dependency
      const { ApiAdapter } = await import('./api.adapter');
      return new ApiAdapter();
    } else {
      return new LocalStorageAdapter();
    }
  })();

  return storageInstancePromise;
}

// Export a wrapper that ensures adapter is initialized when used
export const getStorage = async (): Promise<StorageInterface> => {
  return await createStorageAdapterAsync();
};

// For backward compatibility, export a Promise that resolves to the storage instance
export const storage = createStorageAdapterAsync();
