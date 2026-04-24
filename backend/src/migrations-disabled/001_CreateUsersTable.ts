import { MigrationInterface, QueryRunner, Table, Index } from 'typeorm';

export class CreateUsersTable1640000000001 implements MigrationInterface {
  name = 'CreateUsersTable1640000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'varchar',
            length: '36',
            isPrimary: true,
            isUnique: true,
          },
          {
            name: 'username',
            type: 'varchar',
            length: '100',
            isUnique: true,
          },
          {
            name: 'email',
            type: 'varchar',
            length: '255',
            isUnique: true,
          },
          {
            name: 'password',
            type: 'varchar',
            length: '255',
          },
          {
            name: 'role',
            type: 'enum',
            enum: ['admin', 'user'],
            default: "'user'",
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['active', 'inactive', 'suspended', 'pending'],
            default: "'active'",
          },
          {
            name: 'avatar',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'firstName',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'lastName',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'bio',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'phone',
            type: 'varchar',
            length: '20',
            isNullable: true,
          },
          {
            name: 'emailVerified',
            type: 'boolean',
            default: false,
          },
          {
            name: 'emailVerifiedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastLoginAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'lastLoginIp',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'loginAttempts',
            type: 'int',
            default: 0,
          },
          {
            name: 'lockedUntil',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'tokenVersion',
            type: 'int',
            default: 0,
          },
          {
            name: 'preferences',
            type: 'json',
            isNullable: true,
          },
          {
            name: 'passwordChangedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'passwordResetRequestedAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'passwordResetToken',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'passwordResetExpiresAt',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'twoFactorEnabled',
            type: 'boolean',
            default: false,
          },
          {
            name: 'twoFactorSecret',
            type: 'varchar',
            length: '32',
            isNullable: true,
          },
          {
            name: 'backupCodes',
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
      'users',
      new Index('IDX_users_email', ['email']),
    );

    await queryRunner.createIndex(
      'users',
      new Index('IDX_users_username', ['username']),
    );

    await queryRunner.createIndex(
      'users',
      new Index('IDX_users_role', ['role']),
    );

    await queryRunner.createIndex(
      'users',
      new Index('IDX_users_status', ['status']),
    );

    await queryRunner.createIndex(
      'users',
      new Index('IDX_users_createdAt', ['createdAt']),
    );

    await queryRunner.createIndex(
      'users',
      new Index('IDX_users_emailVerified', ['emailVerified']),
    );

    await queryRunner.createIndex(
      'users',
      new Index('IDX_users_lastLoginAt', ['lastLoginAt']),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}