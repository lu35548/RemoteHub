import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateProjectsTable1640000000002 implements MigrationInterface {
  name = 'CreateProjectsTable1640000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'projects',
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
            name: 'status',
            type: 'enum',
            enum: ['draft', 'active', 'archived', 'suspended'],
            default: "'draft'",
          },
          {
            name: 'visibility',
            type: 'enum',
            enum: ['private', 'team', 'public'],
            default: "'private'",
          },
          {
            name: 'priority',
            type: 'enum',
            enum: ['low', 'medium', 'high', 'urgent'],
            default: "'medium'",
          },
          {
            name: 'tags',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'settings',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'metadata',
            type: 'json',
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
      'projects',
      new Index('IDX_projects_ownerId', ['ownerId']),
    );

    await queryRunner.createIndex(
      'projects',
      new Index('IDX_projects_status', ['status']),
    );

    await queryRunner.createIndex(
      'projects',
      new Index('IDX_projects_visibility', ['visibility']),
    );

    await queryRunner.createIndex(
      'projects',
      new Index('IDX_projects_priority', ['priority']),
    );

    await queryRunner.createIndex(
      'projects',
      new Index('IDX_projects_createdAt', ['createdAt']),
    );

    await queryRunner.createIndex(
      'projects',
      new Index('IDX_projects_name', ['name']),
    );

    // Add foreign key constraint for owner
    await queryRunner.createForeignKey(
      'projects',
      {
        name: 'FK_projects_owner',
        columnNames: ['ownerId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      },
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('projects', 'FK_projects_owner');
    await queryRunner.dropTable('projects');
  }
}