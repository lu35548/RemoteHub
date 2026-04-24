import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateProjectMembersTable1640000000004 implements MigrationInterface {
  name = 'CreateProjectMembersTable1640000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'project_members',
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
            name: 'userId',
            type: 'varchar',
            length: '36',
          },
          {
            name: 'role',
            type: 'enum',
            enum: ['owner', 'admin', 'editor', 'viewer'],
            default: "'viewer'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'pending', 'inactive', 'banned'],
            default: "'pending'",
          },
          {
            name: 'joinedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastAccessAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'invitationToken',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'invitationExpiresAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'notes',
            type: 'varchar',
            length: '1000',
            isNullable: true,
          },
          {
            name: 'permissions',
            type: 'json',
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
      'project_members',
      new Index('IDX_project_members_projectId', ['projectId']),
    );

    await queryRunner.createIndex(
      'project_members',
      new Index('IDX_project_members_userId', ['userId']),
    );

    await queryRunner.createIndex(
      'project_members',
      new Index('IDX_project_members_role', ['role']),
    );

    await queryRunner.createIndex(
      'project_members',
      new Index('IDX_project_members_status', ['status']),
    );

    await queryRunner.createIndex(
      'project_members',
      new Index('IDX_project_members_joinedAt', ['joinedAt']),
    );

    // Create unique constraint to prevent duplicate memberships
    await queryRunner.createIndex(
      'project_members',
      new Index('UQ_project_members_project_user', ['projectId', 'userId']),
    );

    // Add foreign key constraints
    await queryRunner.createForeignKey(
      'project_members',
      {
        name: 'FK_project_members_project',
        columnNames: ['projectId'],
        referencedTableName: 'projects',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      },
    );

    await queryRunner.createForeignKey(
      'project_members',
      {
        name: 'FK_project_members_user',
        columnNames: ['userId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      },
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropForeignKey('project_members', 'FK_project_members_project');
    await queryRunner.dropForeignKey('project_members', 'FK_project_members_user');
    await queryRunner.dropTable('project_members');
  }
}