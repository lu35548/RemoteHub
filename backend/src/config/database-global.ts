import { MockDatabaseService } from './database-mock';

// Global instance to persist between requests
let globalMockDatabase: MockDatabaseService | null = null;

export function getGlobalMockDatabase(): MockDatabaseService {
  if (!globalMockDatabase) {
    globalMockDatabase = MockDatabaseService.getInstance();
  }
  return globalMockDatabase;
}