import { StorageInterface, LocalStorageAdapter, DB_KEYS } from './storage.adapter';
import { ApiAdapter } from './api.adapter';

// Re-export DB_KEYS for convenience
export { DB_KEYS };

export class StorageManager {
  private static instance: StorageManager;
  private adapter: StorageInterface;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  private constructor() {
    // Start with LocalStorage adapter
    this.adapter = new LocalStorageAdapter();
  }

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    if (this.initPromise) {
      await this.initPromise;
      return;
    }

    this.initPromise = this.doInitialize();
    await this.initPromise;
  }

  private async doInitialize(): Promise<void> {
    const useApi = import.meta.env.VITE_USE_API === 'true';
    console.log(`[StorageManager] Initializing with ${useApi ? 'API' : 'LocalStorage'} adapter`);

    if (useApi) {
      try {
        // Switch to API adapter
        this.adapter = new ApiAdapter();
        console.log('[StorageManager] Switched to API adapter');
      } catch (error) {
        console.error('[StorageManager] Failed to initialize API adapter:', error);
        // Keep using LocalStorage adapter as fallback
      }
    }

    this.isInitialized = true;
  }

  getAdapter(): StorageInterface {
    return this.adapter;
  }

  async read<T>(collection: string, defaultValue: T): Promise<T> {
    await this.initialize();
    return this.adapter.read(collection, defaultValue);
  }

  async write<T>(collection: string, data: T): Promise<void> {
    await this.initialize();
    return this.adapter.write(collection, data);
  }

  async remove(collection: string): Promise<void> {
    await this.initialize();
    return this.adapter.remove(collection);
  }
}

// Export the storage manager instance as the default storage interface
export const storage = StorageManager.getInstance();