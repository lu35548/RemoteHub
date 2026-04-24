import { config } from './config';
import { DataSource } from 'typeorm';
import { User, UserRole, UserStatus } from '../models/User';
import { Project } from '../models/Project';
import { Connection } from '../models/Connection';
import { AuditLog } from '../models/AuditLog';

// Migration database configuration (could be different from main app config)
export const migrationConfig = {
  type: config.database.type,
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  entities: [User, Project, Connection, AuditLog],
  migrations: [
    'src/migrations/*.ts',
  ],
  synchronize: false,
  logging: config.database.logging,
};

// Create data source for migrations
export const migrationDataSource = new DataSource(migrationConfig as any);

/**
 * Run all pending migrations
 */
export async function runMigrations(): Promise<void> {
  try {
    await migrationDataSource.initialize();
    const migrations = await migrationDataSource.runMigrations();

    if (migrations.length > 0) {
      console.log(`Successfully ran ${migrations.length} migrations:`);
      migrations.forEach(migration => {
        console.log(`  - ${migration.name}`);
      });
    } else {
      console.log('No pending migrations found.');
    }

    await migrationDataSource.destroy();
  } catch (error) {
    console.error('Error running migrations:', error);
    await migrationDataSource.destroy();
    throw error;
  }
}

/**
 * Revert the last migration
 */
export async function revertLastMigration(): Promise<void> {
  try {
    await migrationDataSource.initialize();
    await migrationDataSource.undoLastMigration();
    console.log('Successfully reverted last migration.');
    await migrationDataSource.destroy();
  } catch (error) {
    console.error('Error reverting migration:', error);
    await migrationDataSource.destroy();
    throw error;
  }
}

/**
 * Show migration status
 */
export async function showMigrationStatus(): Promise<void> {
  try {
    await migrationDataSource.initialize();
    const executedMigrations = await migrationDataSource.query(
      'SELECT * FROM migrations ORDER BY id DESC'
    );

    console.log('Migration Status:');
    if (executedMigrations.length === 0) {
      console.log('  No migrations have been executed.');
    } else {
      console.log(`  ${executedMigrations.length} migrations executed:`);
      executedMigrations.forEach((migration: any, index: number) => {
        const executedAt = new Date(migration.timestamp).toISOString();
        console.log(`  ${index + 1}. ${migration.name} (${executedAt})`);
      });
    }

    await migrationDataSource.destroy();
  } catch (error) {
    console.error('Error checking migration status:', error);
    await migrationDataSource.destroy();
    throw error;
  }
}

/**
 * Create initial data (seed data)
 */
export async function createSeedData(): Promise<void> {
  try {
    await migrationDataSource.initialize();

    // Create default admin user if no users exist
    const userRepository = migrationDataSource.getRepository(User);
    const userCount = await userRepository.count();

    if (userCount === 0) {
      const adminUser = userRepository.create({
        username: 'admin',
        email: 'admin@remotehub.local',
        password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uO9G', // password: admin123
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        firstName: 'System',
        lastName: 'Administrator',
      });

      await userRepository.save(adminUser);
      console.log('Created default admin user (admin@remotehub.local / admin123)');
    }

    await migrationDataSource.destroy();
  } catch (error) {
    console.error('Error creating seed data:', error);
    await migrationDataSource.destroy();
    throw error;
  }
}

/**
 * Generate migration file name with timestamp
 */
export function generateMigrationName(description: string): string {
  const timestamp = Date.now().toString().padStart(13, '0');
  const cleanDescription = description.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `${timestamp}_${cleanDescription}`;
}

/**
 * Validate database connection before running migrations
 */
export async function validateDatabaseConnection(): Promise<boolean> {
  try {
    await migrationDataSource.initialize();
    await migrationDataSource.query('SELECT 1');
    await migrationDataSource.destroy();
    return true;
  } catch (error) {
    console.error('Database connection validation failed:', error);
    return false;
  }
}

// Export for CLI usage
export const migrationCommands = {
  run: runMigrations,
  revert: revertLastMigration,
  status: showMigrationStatus,
  seed: createSeedData,
  validate: validateDatabaseConnection,
};