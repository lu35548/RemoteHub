import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateConnectionsTable1640000000003 implements MigrationInterface {
  name = 'CreateConnectionsTable1640000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'connections',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isUnique: true,
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'description',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'avatar',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'type',
            type: 'enum',
            enum: ['mysql', 'postgresql', 'sqlite', 'sqlserver', 'oracle', 'mongodb', 'redis'],
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'inactive', 'error', 'testing', 'pending'],
            default: "'inactive'",
          },
          {
            name: 'securityLevel',
            type: 'enum',
            enum: ['none', 'ssl', 'ssh', 'vpn'],
            default: "'none'",
          },
          {
            name: 'category',
            type: 'enum',
            enum: ['development', 'testing', 'staging', 'production', 'backup'],
            default: "'development'",
          },
          {
            name: 'host',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'port',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'database',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'username',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: '_encryptedPassword',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'connectionString',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'sslConfig',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'sshConfig',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'connectionParams',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'tags',
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
            name: 'lastTestedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastTestStatus',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'lastTestResult',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'lastConnectedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'connectionCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'failureCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'nextHealthCheck',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'ownerId',
            type: 'varchar',
            length: '36',
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
      'connections',
      new Index('IDX_connections_ownerId', ['ownerId']),
    );

    await queryRunner.createIndex(
      'connections',
      new Index('IDX_connections_type', ['type']),
    );

    await queryRunner.createIndex(
      'connections',
      new Index('IDX_connections_status', ['status']),
    );

    await queryRunner.createIndex(
      'connections',
      new Index('IDX_connections_category', ['category']),
    );

    await queryRunner.createIndex(
      'connections',
      new Index('IDX_connections_createdAt', ['createdAt']),
    );

    await queryRunner.createIndex(
      'connections',
      new Index('IDX_connections_name', ['name']),
    );

    // Add foreign key constraint for owner
    await queryRunner.createForeignKey(
      'connections',
      {
        name: 'FK_connections_owner',
        columnNames: ['ownerId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      },
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('connections', 'FK_connections_owner');
    await queryRunner.dropTable('connections');
  }
}