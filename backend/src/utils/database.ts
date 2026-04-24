import * as crypto from 'crypto';

/**
 * Database encryption utilities for sensitive data
 */
export class DatabaseEncryption {
  private static readonly algorithm = 'aes-256-cbc';
  private static readonly keyLength = 32; // 256 bits
  private static readonly ivLength = 16;  // 128 bits

  /**
   * Encrypt sensitive data for database storage
   */
  public static encrypt(data: string, key: string): string {
    try {
      // Generate a consistent key from the provided key
      const keyBuffer = crypto.createHash('sha256').update(key).digest();

      // Generate random IV
      const iv = crypto.randomBytes(this.ivLength);

      // Create cipher with IV (using createCipheriv for CBC mode)
      const cipher = crypto.createCipheriv(this.algorithm, keyBuffer, iv);

      // Encrypt the data
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Combine IV + encrypted data
      const result = iv.toString('hex') + ':' + encrypted;

      return result;
    } catch (error) {
      throw new Error('Encryption failed: ' + (error as Error).message);
    }
  }

  /**
   * Decrypt data from database storage
   */
  public static decrypt(encryptedData: string, key: string): string {
    try {
      // Generate a consistent key from the provided key
      const keyBuffer = crypto.createHash('sha256').update(key).digest();

      // Parse the encrypted data
      const parts = encryptedData.split(':');
      if (parts.length !== 2) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];

      // Create decipher with IV (using createDecipheriv for CBC mode)
      const decipher = crypto.createDecipheriv(this.algorithm, keyBuffer, iv);

      // Decrypt the data
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error('Decryption failed: ' + (error as Error).message);
    }
  }

  /**
   * Generate a secure encryption key
   */
  public static generateKey(): string {
    return crypto.randomBytes(this.keyLength).toString('hex');
  }

  /**
   * Hash sensitive data (for passwords, not for encryption)
   */
  public static hash(data: string, salt?: string): string {
    const actualSalt = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(data, actualSalt, 100000, 64, 'sha512');
    return actualSalt + ':' + hash.toString('hex');
  }

  /**
   * Verify hashed data
   */
  public static verifyHash(data: string, hashedData: string): boolean {
    const [salt, hash] = hashedData.split(':');
    const computedHash = crypto.pbkdf2Sync(data, salt, 100000, 64, 'sha512').toString('hex');
    return hash === computedHash;
  }
}

/**
 * Database validation utilities
 */
export class DatabaseValidation {
  /**
   * Validate email format
   */
  public static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate UUID format
   */
  public static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  /**
   * Validate database name
   */
  public static isValidDatabaseName(name: string): boolean {
    // Database names should be alphanumeric with underscores, no spaces, 1-64 characters
    const dbNameRegex = /^[a-zA-Z0-9_]{1,64}$/;
    return dbNameRegex.test(name);
  }

  /**
   * Validate hostname
   */
  public static isValidHostname(hostname: string): boolean {
    // IPv4 address
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Regex.test(hostname)) {
      const parts = hostname.split('.');
      return parts.every(part => parseInt(part, 10) >= 0 && parseInt(part, 10) <= 255);
    }

    // IPv6 address (basic validation)
    const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    if (ipv6Regex.test(hostname)) {
      return true;
    }

    // Domain name
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(hostname) && hostname.length <= 253;
  }

  /**
   * Validate port number
   */
  public static isValidPort(port: number): boolean {
    return Number.isInteger(port) && port >= 1 && port <= 65535;
  }

  /**
   * Validate table name
   */
  public static isValidTableName(name: string): boolean {
    // Table names should be alphanumeric with underscores, no spaces, 1-64 characters
    const tableNameRegex = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
    return tableNameRegex.test(name);
  }

  /**
   * Validate column name
   */
  public static isValidColumnName(name: string): boolean {
    // Column names should be alphanumeric with underscores, no spaces, 1-64 characters
    const columnNameRegex = /^[a-zA-Z][a-zA-Z0-9_]{0,63}$/;
    return columnNameRegex.test(name);
  }

  /**
   * Sanitize string for SQL injection prevention
   */
  public static sanitizeString(input: string): string {
    return input.replace(/['";\\]/g, '');
  }

  /**
   * Validate JSON string
   */
  public static isValidJSON(jsonString: string): boolean {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Database connection testing utilities
 */
export class DatabaseConnectionTest {
  /**
   * Test database connection parameters
   */
  public static testConnectionParams(params: {
    type: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Host validation (skip for file-based databases)
    if (params.type !== 'sqlite' && params.type !== 'mongodb') {
      if (!params.host) {
        errors.push('Host is required');
      } else if (!DatabaseValidation.isValidHostname(params.host)) {
        errors.push('Invalid hostname format');
      }
    }

    // Port validation
    if (params.port && !DatabaseValidation.isValidPort(params.port)) {
      errors.push('Invalid port number (must be 1-65535)');
    }

    // Database name validation
    if (params.database && !DatabaseValidation.isValidDatabaseName(params.database)) {
      errors.push('Invalid database name (alphanumeric and underscores only, 1-64 characters)');
    }

    // Username validation
    if (!params.username) {
      errors.push('Username is required');
    } else if (params.username.length > 255) {
      errors.push('Username is too long (max 255 characters)');
    }

    // Password validation
    if (!params.password) {
      errors.push('Password is required');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate test query for different database types
   */
  public static generateTestQuery(type: string): string {
    const testQueries = {
      mysql: 'SELECT 1 as test',
      postgresql: 'SELECT 1 as test',
      sqlite: 'SELECT 1 as test',
      sqlserver: 'SELECT 1 as test',
      oracle: 'SELECT 1 FROM DUAL',
      mongodb: 'db.runCommand({ ping: 1 })',
      redis: 'PING',
    };

    return testQueries[type as keyof typeof testQueries] || 'SELECT 1';
  }
}

/**
 * Database migration utilities
 */
export class DatabaseMigration {
  /**
   * Generate migration name with timestamp
   */
  public static generateMigrationName(description: string): string {
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
    const cleanDescription = description.toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `${timestamp}_${cleanDescription}`;
  }

  /**
   * Generate table name with prefix
   */
  public static generateTableName(baseName: string, prefix?: string): string {
    return prefix ? `${prefix}_${baseName}` : baseName;
  }

  /**
   * Generate foreign key name
   */
  public static generateForeignKeyName(
    tableName: string,
    columnName: string,
    referencedTableName: string
  ): string {
    return `fk_${tableName}_${columnName}_${referencedTableName}`;
  }

  /**
   * Generate index name
   */
  public static generateIndexName(
    tableName: string,
    columns: string[],
    unique: boolean = false
  ): string {
    const columnList = columns.join('_');
    const prefix = unique ? 'uk' : 'idx';
    return `${prefix}_${tableName}_${columnList}`;
  }
}

/**
 * Database performance utilities
 */
export class DatabasePerformance {
  /**
   * Generate table statistics query
   */
  public static generateStatsQuery(tableType: string): string {
    const statsQueries = {
      mysql: `SELECT
        table_name as name,
        table_rows as estimatedRows,
        data_length as dataSize,
        index_length as indexSize,
        (data_length + index_length) as totalSize
        FROM information_schema.tables
        WHERE table_schema = DATABASE()`,

      postgresql: `SELECT
        schemaname || '.' || tablename as name,
        n_tup_ins + n_tup_upd + n_tup_del as estimatedRows,
        pg_total_relation_size(schemaname||'.'||tablename) as totalSize
        FROM pg_stat_user_tables`,

      sqlite: `SELECT
        name as name,
        (SELECT COUNT(*) FROM {table}) as estimatedRows
        FROM sqlite_master
        WHERE type='table' AND name='{table}'`,

      sqlserver: `SELECT
        t.name as name,
        p.rows as estimatedRows,
        SUM(a.total_pages) * 8 * 1024 as totalSize
        FROM sys.tables t
        INNER JOIN sys.indexes i ON t.object_id = i.object_id
        INNER JOIN sys.partitions p ON i.object_id = p.object_id AND i.index_id = p.index_id
        INNER JOIN sys.allocation_units a ON p.partition_id = a.container_id
        GROUP BY t.name, p.rows`,
    };

    return statsQueries[tableType as keyof typeof statsQueries] || '';
  }

  /**
   * Suggest indexes based on common query patterns
   */
  public static suggestIndexes(tableName: string): string[] {
    const commonIndexes = [
      // Foreign key columns
      `CREATE INDEX idx_${tableName}_created_at ON ${tableName}(created_at)`,
      `CREATE INDEX idx_${tableName}_updated_at ON ${tableName}(updated_at)`,

      // Common search patterns
      `CREATE INDEX idx_${tableName}_status ON ${tableName}(status)`,
      `CREATE INDEX idx_${tableName}_is_active ON ${tableName}(is_active)`,

      // Email lookups
      `CREATE INDEX idx_${tableName}_email ON ${tableName}(email) WHERE email IS NOT NULL`,

      // Name searches
      `CREATE INDEX idx_${tableName}_name ON ${tableName}(name) WHERE name IS NOT NULL`,
    ];

    return commonIndexes;
  }
}