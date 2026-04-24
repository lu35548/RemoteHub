import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateProjectConnectionsTable1640000000005 implements MigrationInterface {
  name = 'CreateProjectConnectionsTable1640000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'project_connections',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isUnique: true,
          },
          {
            name: 'projectId',
            type: 'varchar',
            length: '36',
          },
          {
            name: 'connectionId',
            type: 'varchar',
            length: '36',
          },
          {
            name: 'addedBy',
            type: 'varchar',
            length: '36',
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'inactive'],
            default: "'active'",
          },
          {
            name: 'alias',
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
            name: 'category',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'permissions',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'tags',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'lastTestedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'testStatus',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'testResult',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'createdBy',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'updatedBy',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'deletedBy',
            type: 'varchar',
            length: '36',
            isNullable: true,
          },
          {
            name: 'createdIp',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'updatedIp',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'deletedIp',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'version',
            type: 'varchar',
            length: '1000',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create indexes for performance
    await queryRunner.createIndex(
      'project_connections',
      new Index('IDX_project_connections_projectId', ['projectId']),
    );

    await queryRunner.createIndex(
      'project_connections',
      new Index('IDX_project_connections_connectionId', ['connectionId']),
    );

    await queryRunner.createIndex(
      'project_connections',
      new Index('IDX_project_connections_addedBy', ['addedBy']),
    );

    await queryRunner.createIndex(
      'project_connections',
      new Index('IDX_project_connections_status', ['status']),
    );

    // Create unique constraint to prevent duplicate associations
    await queryRunner.createIndex(
      'project_connections',
      new Index('UQ_project_connections_project_connection', ['projectId', 'connectionId']),
    );

    // Add foreign key constraints
    await queryRunner.createForeignKey(
      'project_connections',
      {
        name: 'FK_project_connections_project',
        columnNames: ['projectId'],
        referencedTableName: 'projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      },
    );

    await queryRunner.createForeignKey(
      'project_connections',
      {
        name: 'FK_project_connections_connection',
        columnNames: ['connectionId'],
        referencedTableName: 'connections',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      },
    );

    await queryRunner.createForeignKey(
      'project_connections',
      {
        name: 'FK_project_connections_addedBy',
        columnNames: ['addedBy'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      },
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('project_connections', 'FK_project_connections_project');
    await queryRunner.dropForeignKey('project_connections', 'FK_project_connections_connection');
    await queryRunner.dropForeignKey('project_connections', 'FK_project_connections_addedBy');
    await queryRunner.dropTable('project_connections');
  }
}