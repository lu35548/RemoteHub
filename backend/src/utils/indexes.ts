import { ConnectionType, ConnectionStatus, ConnectionCategory } from '../enums/ConnectionEnums';
import { ProjectStatus, ProjectVisibility, ProjectPriority } from '../enums/ProjectEnums';
import { UserRole, UserStatus } from '../models/User';

/**
 * Database index management utilities
 */
export class DatabaseIndexes {
  /**
   * Generate index name based on table and columns
   */
  public static generateIndexName(tableName: string, columns: string[], type: string = 'idx'): string {
    const columnList = columns.join('_');
    return `${type}_${tableName}_${columnList}`;
  }

  /**
   * Generate unique index name
   */
  public static generateUniqueIndexName(tableName: string, columns: string[]): string {
    return this.generateIndexName(tableName, columns, 'uk');
  }

  /**
   * Generate foreign key index name
   */
  public static generateForeignKeyIndexName(tableName: string, column: string, referencedTable: string): string {
    return `fk_${tableName}_${column}_${referencedTable}`;
  }

  /**
   * Get suggested indexes for a table
   */
  public static getTableIndexes(tableName: string): Array<{
    name: string;
    columns: string[];
    unique?: boolean;
    partial?: string;
    type?: string;
    description: string;
  }> {
    const indexes: Record<string, Array<{
      name: string;
      columns: string[];
      unique?: boolean;
      partial?: string;
      type?: string;
      description: string;
    }>> = {
      users: [
        {
          name: 'IDX_users_email_status',
          columns: ['email', 'status'],
          description: 'For user lookup and status filtering',
        },
        {
          name: 'IDX_users_composite_status_role',
          columns: ['status', 'role'],
          description: 'For filtering users by status and role',
        },
        {
          name: 'IDX_users_composite_last_login_created',
          columns: ['lastLoginAt', 'createdAt'],
          description: 'For finding recently active users',
        },
        {
          name: 'IDX_users_active_partial',
          columns: ['id'],
          partial: "status = 'active'",
          description: 'For fast active user lookups',
        },
      ],
      projects: [
        {
          name: 'IDX_projects_owner_status',
          columns: ['ownerId', 'status'],
          description: 'For filtering projects by owner and status',
        },
        {
          name: 'IDX_projects_composite_visibility_status',
          columns: ['visibility', 'status'],
          description: 'For public/private project filtering',
        },
        {
          name: 'IDX_projects_composite_priority_status',
          columns: ['priority', 'status'],
          description: 'For priority-based project filtering',
        },
        {
          name: 'IDX_projects_active_partial',
          columns: ['id'],
          partial: "status = 'active'",
          description: 'For fast active project lookups',
        },
      ],
      connections: [
        {
          name: 'IDX_connections_owner_status',
          columns: ['ownerId', 'status'],
          description: 'For filtering connections by owner and status',
        },
        {
          name: 'IDX_connections_composite_type_status',
          columns: ['type', 'status'],
          description: 'For filtering by connection type and status',
        },
        {
          name: 'IDX_connections_composite_health',
          columns: ['status', 'lastTestedAt', 'failureCount'],
          description: 'For health check queries',
        },
        {
          name: 'IDX_connections_active_partial',
          columns: ['id'],
          partial: "status = 'active'",
          description: 'For fast active connection lookups',
        },
      ],
      project_members: [
        {
          name: 'IDX_project_members_composite_project_status',
          columns: ['projectId', 'status'],
          description: 'For finding active project members',
        },
        {
          name: 'UQ_project_members_project_user',
          columns: ['projectId', 'userId'],
          unique: true,
          description: 'Prevent duplicate memberships',
        },
        {
          name: 'IDX_project_members_active_partial',
          columns: ['id', 'projectId'],
          partial: "status = 'active'",
          description: 'For fast active member lookups',
        },
      ],
      project_connections: [
        {
          name: 'UQ_project_connections_project_connection',
          columns: ['projectId', 'connectionId'],
          unique: true,
          description: 'Prevent duplicate associations',
        },
        {
          name: 'IDX_project_connections_project_status',
          columns: ['projectId', 'status'],
          description: 'For finding active project connections',
        },
      ],
      audit_logs: [
        {
          name: 'IDX_audit_logs_composite_user_action',
          columns: ['userId', 'action'],
          description: 'For user-specific audit queries',
        },
        {
          name: 'IDX_audit_logs_composite_entity_action',
          columns: ['entityType', 'action'],
          description: 'For entity-specific audit queries',
        },
        {
          name: 'IDX_audit_logs_composite_created_action',
          columns: ['createdAt', 'action'],
          description: 'For time-based audit filtering',
        },
        {
          name: 'IDX_audit_logs_recent_partial',
          columns: ['id'],
          partial: "createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)",
          description: 'For recent audit log queries',
        },
      ],
    };

    return indexes[tableName] || [];
  }

  /**
   * Get covering indexes for common query patterns
   */
  public static getCoveringIndexes(): Array<{
    name: string;
    table: string;
    columns: string[];
    includeColumns: string[];
    description: string;
  }> {
    return [
      {
        name: 'IDX_projects_covering_list',
        table: 'projects',
        columns: ['ownerId', 'status', 'createdAt'],
        includeColumns: ['name', 'updatedAt'],
        description: 'Covering index for project listings',
      },
      {
        name: 'IDX_connections_covering_list',
        table: 'connections',
        columns: ['ownerId', 'type', 'status'],
        includeColumns: ['name', 'lastTestedAt', 'failureCount'],
        description: 'Covering index for connection listings',
      },
      {
        name: 'IDX_users_covering_profile',
        table: 'users',
        columns: ['id', 'status', 'lastLoginAt'],
        includeColumns: ['username', 'email', 'createdAt'],
        description: 'Covering index for user profiles',
      },
    ];
  }

  /**
   * Get full-text search indexes
   */
  public static getFullTextIndexes(): Array<{
    name: string;
    table: string;
    columns: string[];
    description: string;
  }> {
    return [
      {
        name: 'IDX_projects_fulltext_search',
        table: 'projects',
        columns: ['name', 'description'],
        description: 'Full-text search for projects',
      },
      {
        name: 'IDX_connections_fulltext_search',
        table: 'connections',
        columns: ['name', 'description'],
        description: 'Full-text search for connections',
      },
    ];
  }

  /**
   * Get partial indexes for performance
   */
  public static getPartialIndexes(): Array<{
    name: string;
    table: string;
    condition: string;
    columns: string[];
    description: string;
  }> {
    return [
      {
        name: 'IDX_users_active',
        table: 'users',
        condition: "status = 'active'",
        columns: ['id'],
        description: 'Only index active users',
      },
      {
        name: 'IDX_projects_active',
        table: 'projects',
        condition: "status = 'active'",
        columns: ['id'],
        description: 'Only index active projects',
      },
      {
        name: 'IDX_connections_active',
        table: 'connections',
        condition: "status = 'active'",
        columns: ['id'],
        description: 'Only index active connections',
      },
      {
        name: 'IDX_audit_logs_recent',
        table: 'audit_logs',
        condition: "createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)",
        columns: ['id'],
        description: 'Only index recent audit logs',
      },
    ];
  }

  /**
   * Generate DDL for creating index
   */
  public static generateCreateIndexSQL(index: {
    name: string;
    table: string;
    columns: string[];
    unique?: boolean;
    partial?: string;
    type?: string;
    includeColumns?: string[];
  }): string {
    let sql = `CREATE`;

    if (index.unique) {
      sql += ' UNIQUE';
    }

    sql += ` INDEX ${index.name}`;

    if (index.type === 'FULLTEXT') {
      sql += ` FULLTEXT`;
    }

    sql += ` ON ${index.table} (${index.columns.join(', ')})`;

    if (index.partial) {
      sql += ` WHERE ${index.partial}`;
    }

    // Include syntax (MySQL 8.0+)
    if (index.includeColumns && index.includeColumns.length > 0) {
      sql += ` INCLUDE (${index.includeColumns.join(', ')})`;
    }

    return sql;
  }

  /**
   * Generate DDL for dropping index
   */
  public static generateDropIndexSQL(indexName: string, tableName?: string): string {
    if (tableName) {
      return `DROP INDEX ${indexName} ON ${tableName}`;
    }
    return `DROP INDEX ${indexName}`;
  }

  /**
   * Analyze index usage patterns
   */
  public static analyzeIndexUsage(queryPatterns: Array<{
    description: string;
    sql: string;
    frequency: 'high' | 'medium' | 'low';
  }>): Array<{
    table: string;
    columns: string[];
    benefit: 'high' | 'medium' | 'low';
    queryPattern: string;
  }> {
    const recommendations: Array<{
      table: string;
      columns: string[];
      benefit: 'high' | 'medium' | 'low';
      queryPattern: string;
    }> = [];

    // Analyze common query patterns
    queryPatterns.forEach(pattern => {
      const sql = pattern.sql.toLowerCase();

      // User queries
      if (sql.includes('users')) {
        if (sql.includes('email') && sql.includes('status')) {
          recommendations.push({
            table: 'users',
            columns: ['email', 'status'],
            benefit: 'high',
            queryPattern: pattern.description,
          });
        }
        if (sql.includes('role') && sql.includes('status')) {
          recommendations.push({
            table: 'users',
            columns: ['role', 'status'],
            benefit: 'high',
            queryPattern: pattern.description,
          });
        }
      }

      // Project queries
      if (sql.includes('projects')) {
        if (sql.includes('ownerid') && sql.includes('status')) {
          recommendations.push({
            table: 'projects',
            columns: ['ownerId', 'status'],
            benefit: 'high',
            queryPattern: pattern.description,
          });
        }
        if (sql.includes('visibility') && sql.includes('status')) {
          recommendations.push({
            table: 'projects',
            columns: ['visibility', 'status'],
            benefit: 'medium',
            queryPattern: pattern.description,
          });
        }
      }

      // Connection queries
      if (sql.includes('connections')) {
        if (sql.includes('ownerid') && sql.includes('status')) {
          recommendations.push({
            table: 'connections',
            columns: ['ownerId', 'status'],
            benefit: 'high',
            queryPattern: pattern.description,
          });
        }
        if (sql.includes('type') && sql.includes('status')) {
          recommendations.push({
            table: 'connections',
            columns: ['type', 'status'],
            benefit: 'medium',
            queryPattern: pattern.description,
          });
        }
      }
    });

    return recommendations;
  }

  /**
   * Get index maintenance recommendations
   */
  public static getMaintenanceRecommendations(): Array<{
    action: string;
    description: string;
    frequency: 'daily' | 'weekly' | 'monthly';
    sql: string;
  }> {
    return [
      {
        action: 'Analyze unused indexes',
        description: 'Find and remove indexes that are not being used',
        frequency: 'monthly',
        sql: `
          SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
          FROM pg_stat_user_indexes
          WHERE idx_scan < 10
          ORDER BY idx_scan ASC
        `,
      },
      {
        action: 'Update table statistics',
        description: 'Update statistics for query optimizer',
        frequency: 'weekly',
        sql: 'ANALYZE users, projects, connections, project_members, audit_logs',
      },
      {
        action: 'Rebuild fragmented indexes',
        description: 'Rebuild indexes that have become fragmented',
        frequency: 'monthly',
        sql: 'REINDEX INDEX CONCURRENTLY idx_users_email ON users',
      },
      {
        action: 'Monitor index size',
        description: 'Check index sizes to identify potential bloat',
        frequency: 'weekly',
        sql: `
          SELECT schemaname, tablename, indexname,
                 pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
                 pg_size_pretty(pg_relation_size(tablename)) AS table_size
          FROM pg_stat_user_indexes
          JOIN pg_tables ON schemaname = schemaname AND tablename = tablename
          ORDER BY pg_relation_size(indexrelid) DESC
        `,
      },
    ];
  }

  /**
   * Get index size estimation
   */
  public static estimateIndexSize(
    tableName: string,
    columns: string[],
    averageRowSize: number,
    estimatedRows: number
  ): {
    sizeBytes: number;
    sizeMB: number;
    indexType: string;
  } {
    // Simplified size estimation
    const columnSize = 20; // Average bytes per indexed column
    const indexOverhead = 100; // Overhead per index
    const rowCount = estimatedRows;

    const indexSizeBytes = (rowCount * (columns.length * columnSize)) + indexOverhead;
    const indexSizeMB = indexSizeBytes / (1024 * 1024);

    // Determine index type based on size and usage pattern
    let indexType = 'btree';
    if (columns.includes('email') || columns.includes('description')) {
      indexType = 'btree'; // Could be hash for exact matches
    }

    return {
      sizeBytes: Math.round(indexSizeBytes),
      sizeMB: Math.round(indexSizeMB * 100) / 100,
      indexType,
    };
  }

  /**
   * Get index optimization recommendations
   */
  public static getOptimizationRecommendations(): Array<{
    table: string;
    recommendation: string;
    reason: string;
    impact: 'high' | 'medium' | 'low';
    implementation: string;
  }> {
    return [
      {
        table: 'users',
        recommendation: 'Add composite index on (status, role)',
        reason: 'Frequent filtering on user status and role combinations',
        impact: 'high',
        implementation: 'CREATE INDEX IDX_users_status_role ON users(status, role)',
      },
      {
        table: 'projects',
        recommendation: 'Add partial index for active projects',
        reason: 'Most queries only need active projects',
        impact: 'high',
        implementation: 'CREATE INDEX IDX_projects_active ON projects(id) WHERE status = "active"',
      },
      {
        table: 'connections',
        recommendation: 'Add index on health status fields',
        reason: 'Health check queries are performance critical',
        impact: 'medium',
        implementation: 'CREATE INDEX IDX_connections_health ON connections(status, lastTestedAt, failureCount)',
      },
      {
        table: 'audit_logs',
        recommendation: 'Add partial index for recent logs',
        reason: 'Most audit queries are for recent activity',
        impact: 'medium',
        implementation: 'CREATE INDEX IDX_audit_logs_recent ON audit_logs(id) WHERE createdAt > DATE_SUB(NOW(), INTERVAL 30 DAY)',
      },
    ];
  }
}