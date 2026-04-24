import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateAuditLogsTable1640000000006 implements MigrationInterface {
  name = 'CreateAuditLogsTable1640000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isUnique: true,
          },
          {
            name: 'userId',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'action',
            type: 'enum',
            enum: ['create', 'update', 'delete', 'login', 'logout', 'access', 'export', 'import'],
          },
          {
            name: 'entityType',
            type: 'varchar',
            length: '100',
          },
          {
            name: 'entityId',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'entityName',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'details',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'userAgent',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'sessionId',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'isSensitive',
            type: 'boolean',
            default: false,
          },
          {
            name: 'isFailure',
            type: 'boolean',
            default: false,
          },
          {
            name: 'errorMessage',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'stackTrace',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_userId', ['userId']),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_action', ['action']),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_entityType', ['entityType']),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_entityId', ['entityId']),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_createdAt', ['createdAt']),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_isSensitive', ['isSensitive']),
    );

    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_isFailure', ['isFailure']),
    );

    // Create composite index for common queries
    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_user_action_entity', ['userId', 'action', 'entityType']),
    );

    // Create index for time-based queries
    await queryRunner.createIndex(
      'audit_logs',
      new Index('IDX_audit_logs_createdAt_action', ['createdAt', 'action']),
    );

    // Add foreign key constraint for user (optional, can be null for system actions)
    await queryRunner.createForeignKey(
      'audit_logs',
      {
        name: 'FK_audit_logs_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      },
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('audit_logs', 'FK_audit_logs_user');
    await queryRunner.dropTable('audit_logs');
  }
}