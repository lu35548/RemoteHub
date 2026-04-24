import { MigrationInterface, QueryRunner, Index } from 'typeorm';

export class CreatePerformanceIndexes1640000000007 implements MigrationInterface {
  name = 'CreatePerformanceIndexes1640000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Users table performance indexes
    await queryRunner.createIndex(
      'users',
      new Index('IDX_users_composite_status_role', ['status', 'role']),
    );

    await queryRunner.createIndex(
      'users',
      new Index('IDX_users_composite_email_verified', ['emailVerified', 'createdAt']),
    );

    await queryRunner.createIndex(
      'users',
      new Index('IDX_users_composite_last_login_created', ['lastLoginAt', 'createdAt']),
    );

    // Projects table performance indexes
    await queryRunner.createIndex(
      'projects',
      new Index('IDX_projects_composite_owner_status', ['ownerId', 'status']),
    );

    await queryRunner.createIndex(
      'projects',
      new Index('IDX_projects_composite_visibility_status', ['visibility', 'status']),
    );

    await queryRunner.createIndex(
      'projects',
      new Index('IDX_projects_composite_priority_status', ['priority', 'status']),
    );

    await queryRunner.createIndex(
      'projects',
      new Index('IDX_projects_composite_created_status', ['createdAt', 'status']),
    );

    // Connections table performance indexes
    await queryRunner.createIndex(
      'connections',
      new Index('IDX_connections_composite_owner_status', ['ownerId', 'status']),
    );

    await queryRunner.createIndex(
      'connections',
      new Index('IDX_connections_composite_type_status', ['type', 'status']),
    );

    await queryRunner.createIndex(
      'connections',
      new Index('IDX_connections_composite_category_status', ['category', 'status']),
    );

    await queryRunner.createIndex(
      'connections',
      new Index('IDX_connections_composite_health', ['status', 'lastTestedAt', 'failureCount']),
    );

    // Project members table performance indexes
    await queryRunner.createIndex(
      'project_members',
      new Index('IDX_project_members_composite_project_status', ['projectId', 'status']),
    );

    await queryRunner.createIndex(
      'project_members',
      new Index('IDX_project_members_composite_user_status', ['userId', 'status']),
    );

    await queryRunner.createIndex(
      'project_members',
      new Index('IDX_project_members_composite_role_status', ['role', 'status']),
    );

    await queryRunner.createIndex(
      'project_members',
      new Index('IDX_project_members_composite_joined_status', ['joinedAt', 'status']),
    );

    // Project connections table performance indexes
    await queryRunner.createIndex(
      'project_connections',
      new Index('IDX_project_connections_composite_project_status', ['projectId', 'status']),
    );

    await queryRunner.createIndex(
      'project_connections',
      new Index('IDX_project_connections_composite_connection_status', ['connectionId', 'status']),
    );

    await queryRunner.createIndex(
      'project_connections',
      new Index('IDX_project_connections_composite_added_status', ['addedBy', 'status']),
    );

    // Audit logs table performance indexes
    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_composite_user_action', ['userId', 'action']),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_composite_entity_action', ['entityType', 'action']),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_composite_created_action', ['createdAt', 'action']),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_composite_sensitive_created', ['isSensitive', 'createdAt']),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_composite_failure_created', ['isFailure', 'createdAt']),
    );

    // Try to create database-specific features (ignore errors if not supported)
    try {
      // Full-text search indexes (MySQL/PostgreSQL specific)
      await queryRunner.query(`
        CREATE FULLTEXT INDEX IF NOT EXISTS
        IDX_projects_fulltext_name_desc ON projects(name, description)
      `);

      await queryRunner.query(`
        CREATE FULLTEXT INDEX IF NOT EXISTS
        IDX_connections_fulltext_name_desc ON connections(name, description)
      `);
    } catch (error) {
      // Full-text indexes not supported, continue
    }

    try {
      // Partial indexes for better performance (PostgreSQL/MySQL 8.0+ specific)
      // Using basic syntax that works across most databases
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
        IDX_users_active ON users(status)
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
        IDX_projects_active ON projects(status)
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
        IDX_connections_active ON connections(status)
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
        IDX_project_members_active ON project_members(status, projectId)
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
        IDX_audit_logs_recent ON audit_logs(createdAt)
      `);
    } catch (error) {
      // Partial indexes not supported, continue
    }

    try {
      // Basic covering indexes for common queries
      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
        IDX_projects_covering_list ON projects(ownerId, status, createdAt, name)
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
        IDX_connections_covering_list ON connections(ownerId, type, status, lastTestedAt)
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
        IDX_users_covering_profile ON users(status, lastLoginAt, username, email)
      `);

      await queryRunner.query(`
        CREATE INDEX IF NOT EXISTS
        IDX_audit_logs_covering_list ON audit_logs(userId, action, entityType, createdAt, isFailure)
      `);
    } catch (error) {
      // Covering indexes not supported, continue
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop composite indexes
    const indexesToDrop = [
      // Users table
      'IDX_users_composite_status_role',
      'IDX_users_composite_email_verified',
      'IDX_users_composite_last_login_created',
      'IDX_users_covering_profile',
      'IDX_users_active',

      // Projects table
      'IDX_projects_composite_owner_status',
      'IDX_projects_composite_visibility_status',
      'IDX_projects_composite_priority_status',
      'IDX_projects_composite_created_status',
      'IDX_projects_covering_list',
      'IDX_projects_active',
      'IDX_projects_fulltext_name_desc',

      // Connections table
      'IDX_connections_composite_owner_status',
      'IDX_connections_composite_type_status',
      'IDX_connections_composite_category_status',
      'IDX_connections_composite_health',
      'IDX_connections_covering_list',
      'IDX_connections_active',
      'IDX_connections_fulltext_name_desc',

      // Project members table
      'IDX_project_members_composite_project_status',
      'IDX_project_members_composite_user_status',
      'IDX_project_members_composite_role_status',
      'IDX_project_members_composite_joined_status',
      'IDX_project_members_active',

      // Project connections table
      'IDX_project_connections_composite_project_status',
      'IDX_project_connections_composite_connection_status',
      'IDX_project_connections_composite_added_status',

      // Audit logs table
      'IDX_audit_logs_composite_user_action',
      'IDX_audit_logs_composite_entity_action',
      'IDX_audit_logs_composite_created_action',
      'IDX_audit_logs_composite_sensitive_created',
      'IDX_audit_logs_composite_failure_created',
      'IDX_audit_logs_recent',
      'IDX_audit_logs_covering_list',
    ];

    const tables = ['users', 'projects', 'connections', 'project_members', 'project_connections', 'audit_logs'];

    for (const indexName of indexesToDrop) {
      for (const table of tables) {
        try {
          await queryRunner.dropIndex(table, indexName);
        } catch (e) {
          // Index might not exist, continue
        }
      }
    }

    // Try to drop SQL-specific indexes
    try {
      await queryRunner.query(`DROP INDEX IF EXISTS IDX_projects_fulltext_name_desc`);
      await queryRunner.query(`DROP INDEX IF EXISTS IDX_connections_fulltext_name_desc`);
      await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_active`);
      await queryRunner.query(`DROP INDEX IF EXISTS IDX_projects_active`);
      await queryRunner.query(`DROP INDEX IF EXISTS IDX_connections_active`);
      await queryRunner.query(`DROP INDEX IF EXISTS IDX_project_members_active`);
      await queryRunner.query(`DROP INDEX IF EXISTS IDX_audit_logs_recent`);
      await queryRunner.query(`DROP INDEX IF EXISTS IDX_projects_covering_list`);
      await queryRunner.query(`DROP INDEX IF EXISTS IDX_connections_covering_list`);
      await queryRunner.query(`DROP INDEX IF EXISTS IDX_users_covering_profile`);
      await queryRunner.query(`DROP INDEX IF EXISTS IDX_audit_logs_covering_list`);
    } catch (e) {
      // Ignore errors when dropping non-existent indexes
    }
  }
}