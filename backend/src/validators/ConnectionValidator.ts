import { ValidationRules } from './EntityValidator';
import { ConnectionType, ConnectionStatus, ConnectionSecurityLevel, ConnectionCategory } from '../enums/ConnectionEnums';

/**
 * Connection entity validator
 */
export class ConnectionValidator {
  /**
   * Validate connection creation data
   */
  public static async validateCreation(connectionData: {
    name: string;
    type: ConnectionType;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    connectionString?: string;
    sslConfig?: any;
    sshConfig?: any;
    category?: ConnectionCategory;
    tags?: string[];
    ownerId: string;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate name
    if (!connectionData.name) {
      errors.push('Connection name is required');
    } else if (!ValidationRules.isValidLength(connectionData.name, 1, 255)) {
      errors.push('Connection name must be between 1 and 255 characters');
    }

    // Validate type
    if (!connectionData.type) {
      errors.push('Connection type is required');
    } else if (!ValidationRules.isValidEnumValue(connectionData.type, ConnectionType)) {
      errors.push('Invalid connection type');
    }

    // Validate type-specific requirements
    const typeValidation = this.validateConnectionType(connectionData.type, connectionData);
    if (!typeValidation.isValid) {
      errors.push(...typeValidation.errors);
    }

    // Validate host
    if (connectionData.host !== undefined && connectionData.host) {
      if (!ValidationRules.isValidHost(connectionData.host)) {
        errors.push('Invalid hostname or IP address');
      }
    }

    // Validate port
    if (connectionData.port !== undefined && connectionData.port !== null) {
      if (!ValidationRules.isValidPort(connectionData.port)) {
        errors.push('Port must be between 1 and 65535');
      }
    }

    // Validate database name
    if (connectionData.database !== undefined && connectionData.database) {
      if (!ValidationRules.isValidDatabaseName(connectionData.database)) {
        errors.push('Invalid database name format');
      }
    }

    // Validate username
    if (connectionData.username && !ValidationRules.isValidLength(connectionData.username, 1, 255)) {
      errors.push('Username must be between 1 and 255 characters');
    }

    // Validate password
    if (connectionData.password && !ValidationRules.isValidLength(connectionData.password, 1, 255)) {
      errors.push('Password must be between 1 and 255 characters');
    }

    // Validate connection string
    if (connectionData.connectionString && !ValidationRules.isValidLength(connectionData.connectionString, 1, 500)) {
      errors.push('Connection string must be between 1 and 500 characters');
    }

    // Validate SSL config
    if (connectionData.sslConfig) {
      const sslValidation = this.validateSSLConfig(connectionData.sslConfig);
      if (!sslValidation.isValid) {
        errors.push(...sslValidation.errors);
      }
    }

    // Validate SSH config
    if (connectionData.sshConfig) {
      const sshValidation = this.validateSSHConfig(connectionData.sshConfig);
      if (!sshValidation.isValid) {
        errors.push(...sshValidation.errors);
      }
    }

    // Validate category
    if (connectionData.category && !ValidationRules.isValidEnumValue(connectionData.category, ConnectionCategory)) {
      errors.push('Invalid connection category');
    }

    // Validate tags
    if (connectionData.tags) {
      if (!Array.isArray(connectionData.tags)) {
        errors.push('Tags must be an array');
      } else if (connectionData.tags.length > 20) {
        errors.push('Maximum 20 tags allowed');
      } else {
        for (const tag of connectionData.tags) {
          if (typeof tag !== 'string' || tag.length > 50) {
            errors.push('Each tag must be a string of max 50 characters');
            break;
          }
        }
      }
    }

    // Validate owner ID
    if (!connectionData.ownerId) {
      errors.push('Connection owner is required');
    } else if (!ValidationRules.isValidUUID(connectionData.ownerId)) {
      errors.push('Invalid owner ID format');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate connection update data
   */
  public static async validateUpdate(connectionData: {
    name?: string;
    status?: ConnectionStatus;
    securityLevel?: ConnectionSecurityLevel;
    category?: ConnectionCategory;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    tags?: string[];
    sslConfig?: any;
    sshConfig?: any;
  }): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];

    // Validate name
    if (connectionData.name !== undefined) {
      if (!connectionData.name) {
        errors.push('Connection name cannot be empty');
      } else if (!ValidationRules.isValidLength(connectionData.name, 1, 255)) {
        errors.push('Connection name must be between 1 and 255 characters');
      }
    }

    // Validate status
    if (connectionData.status && !ValidationRules.isValidEnumValue(connectionData.status, ConnectionStatus)) {
      errors.push('Invalid connection status');
    }

    // Validate security level
    if (connectionData.securityLevel && !ValidationRules.isValidEnumValue(connectionData.securityLevel, ConnectionSecurityLevel)) {
      errors.push('Invalid security level');
    }

    // Validate category
    if (connectionData.category && !ValidationRules.isValidEnumValue(connectionData.category, ConnectionCategory)) {
      errors.push('Invalid connection category');
    }

    // Validate host
    if (connectionData.host !== undefined && connectionData.host) {
      if (!ValidationRules.isValidHost(connectionData.host)) {
        errors.push('Invalid hostname or IP address');
      }
    }

    // Validate port
    if (connectionData.port !== undefined && connectionData.port !== null) {
      if (!ValidationRules.isValidPort(connectionData.port)) {
        errors.push('Port must be between 1 and 65535');
      }
    }

    // Validate database name
    if (connectionData.database !== undefined && connectionData.database) {
      if (!ValidationRules.isValidDatabaseName(connectionData.database)) {
        errors.push('Invalid database name format');
      }
    }

    // Validate username
    if (connectionData.username && !ValidationRules.isValidLength(connectionData.username, 1, 255)) {
      errors.push('Username must be between 1 and 255 characters');
    }

    // Validate password
    if (connectionData.password && !ValidationRules.isValidLength(connectionData.password, 1, 255)) {
      errors.push('Password must be between 1 and 255 characters');
    }

    // Validate tags
    if (connectionData.tags !== undefined) {
      if (!Array.isArray(connectionData.tags)) {
        errors.push('Tags must be an array');
      } else if (connectionData.tags.length > 20) {
        errors.push('Maximum 20 tags allowed');
      } else {
        for (const tag of connectionData.tags) {
          if (typeof tag !== 'string' || tag.length > 50) {
            errors.push('Each tag must be a string of max 50 characters');
            break;
          }
        }
      }
    }

    // Validate SSL config
    if (connectionData.sslConfig) {
      const sslValidation = this.validateSSLConfig(connectionData.sslConfig);
      if (!sslValidation.isValid) {
        errors.push(...sslValidation.errors);
      }
    }

    // Validate SSH config
    if (connectionData.sshConfig) {
      const sshValidation = this.validateSSHConfig(connectionData.sshConfig);
      if (!sshValidation.isValid) {
        errors.push(...sshValidation.errors);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate connection type specific requirements
   */
  private static validateConnectionType(type: ConnectionType, data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Requirements for different connection types
    const requirements = {
      [ConnectionType.MYSQL]: {
        requiresHost: true,
        requiresPort: false, // Optional, has default
        requiresDatabase: true,
        requiresAuth: true,
      },
      [ConnectionType.POSTGRESQL]: {
        requiresHost: true,
        requiresPort: false, // Optional, has default
        requiresDatabase: true,
        requiresAuth: true,
      },
      [ConnectionType.SQLITE]: {
        requiresHost: false,
        requiresPort: false,
        requiresDatabase: true, // File path
        requiresAuth: false,
      },
      [ConnectionType.SQLSERVER]: {
        requiresHost: true,
        requiresPort: false, // Optional, has default
        requiresDatabase: true,
        requiresAuth: true,
      },
      [ConnectionType.ORACLE]: {
        requiresHost: true,
        requiresPort: false, // Optional, has default
        requiresDatabase: true,
        requiresAuth: true,
      },
      [ConnectionType.MONGODB]: {
        requiresHost: true,
        requiresPort: false, // Optional, has default
        requiresDatabase: false, // Optional
        requiresAuth: true,
      },
      [ConnectionType.REDIS]: {
        requiresHost: true,
        requiresPort: false, // Optional, has default
        requiresDatabase: false,
        requiresAuth: false, // Optional
      },
    };

    const requirement = requirements[type as keyof typeof requirements];
    if (!requirement) {
      errors.push('Unsupported connection type');
      return { isValid: false, errors };
    }

    // Check host requirement
    if (requirement.requiresHost && !data.host) {
      errors.push(`Host is required for ${type} connections`);
    }

    // Check database requirement
    if (requirement.requiresDatabase && !data.database) {
      errors.push(`Database name is required for ${type} connections`);
    }

    // Check authentication requirement
    if (requirement.requiresAuth && (!data.username || (!data.password && !data.connectionString))) {
      errors.push(`Authentication credentials are required for ${type} connections`);
    }

    // Check port conflicts with type defaults
    if (data.port) {
      const defaultPorts = {
        [ConnectionType.MYSQL]: 3306,
        [ConnectionType.POSTGRESQL]: 5432,
        [ConnectionType.SQLSERVER]: 1433,
        [ConnectionType.ORACLE]: 1521,
        [ConnectionType.MONGODB]: 27017,
        [ConnectionType.REDIS]: 6379,
      };

      if (defaultPorts[type as keyof typeof defaultPorts] && data.port < 1) {
        errors.push(`Invalid port for ${type} connections`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate SSL configuration
   */
  private static validateSSLConfig(sslConfig: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof sslConfig !== 'object' || sslConfig === null) {
      return { isValid: false, errors: ['SSL config must be a valid object'] };
    }

    // Validate enabled field
    if (sslConfig.enabled !== undefined && typeof sslConfig.enabled !== 'boolean') {
      errors.push('SSL enabled must be a boolean');
    }

    // Validate ca field
    if (sslConfig.ca !== undefined && typeof sslConfig.ca !== 'string') {
      errors.push('SSL CA certificate must be a string');
    }

    // Validate cert field
    if (sslConfig.cert !== undefined && typeof sslConfig.cert !== 'string') {
      errors.push('SSL certificate must be a string');
    }

    // Validate key field
    if (sslConfig.key !== undefined && typeof sslConfig.key !== 'string') {
      errors.push('SSL key must be a string');
    }

    // Validate rejectUnauthorized field
    if (sslConfig.rejectUnauthorized !== undefined && typeof sslConfig.rejectUnauthorized !== 'boolean') {
      errors.push('SSL rejectUnauthorized must be a boolean');
    }

    // Validate checkServerIdentity field
    if (sslConfig.checkServerIdentity !== undefined && typeof sslConfig.checkServerIdentity !== 'boolean') {
      errors.push('SSL checkServerIdentity must be a boolean');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate SSH configuration
   */
  private static validateSSHConfig(sshConfig: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof sshConfig !== 'object' || sshConfig === null) {
      return { isValid: false, errors: ['SSH config must be a valid object'] };
    }

    // Validate enabled field
    if (sshConfig.enabled !== undefined && typeof sshConfig.enabled !== 'boolean') {
      errors.push('SSH enabled must be a boolean');
    }

    // Validate host field
    if (sshConfig.host && !ValidationRules.isValidHost(sshConfig.host)) {
      errors.push('SSH host must be a valid hostname or IP address');
    }

    // Validate port field
    if (sshConfig.port !== undefined && !ValidationRules.isValidPort(sshConfig.port)) {
      errors.push('SSH port must be between 1 and 65535');
    }

    // Validate username field
    if (sshConfig.username && !ValidationRules.isValidLength(sshConfig.username, 1, 255)) {
      errors.push('SSH username must be between 1 and 255 characters');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate connection test
   */
  public static validateConnectionTest(connectionType: ConnectionType, testConfig: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!connectionType) {
      errors.push('Connection type is required for testing');
      return { isValid: false, errors };
    }

    if (!testConfig || typeof testConfig !== 'object') {
      errors.push('Test configuration must be a valid object');
      return { isValid: false, errors };
    }

    // Basic validation for test config
    const typeValidation = this.validateConnectionType(connectionType, testConfig);
    if (!typeValidation.isValid) {
      errors.push(...typeValidation.errors);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate connection search filters
   */
  public static validateSearchFilters(filters: {
    ownerId?: string;
    type?: ConnectionType;
    status?: ConnectionStatus;
    category?: ConnectionCategory;
    search?: string;
    tags?: string[];
    page?: number;
    limit?: number;
  }): { isValid: boolean; errors: string[]; sanitizedFilters: any } {
    const errors: string[] = [];
    const sanitized: any = {};

    // Validate owner filter
    if (filters.ownerId !== undefined) {
      if (!ValidationRules.isValidUUID(filters.ownerId)) {
        errors.push('Invalid owner ID format');
      } else {
        sanitized.ownerId = filters.ownerId;
      }
    }

    // Validate type filter
    if (filters.type !== undefined) {
      if (!ValidationRules.isValidEnumValue(filters.type, ConnectionType)) {
        errors.push('Invalid connection type filter');
      } else {
        sanitized.type = filters.type;
      }
    }

    // Validate status filter
    if (filters.status !== undefined) {
      if (!ValidationRules.isValidEnumValue(filters.status, ConnectionStatus)) {
        errors.push('Invalid status filter');
      } else {
        sanitized.status = filters.status;
      }
    }

    // Validate category filter
    if (filters.category !== undefined) {
      if (!ValidationRules.isValidEnumValue(filters.category, ConnectionCategory)) {
        errors.push('Invalid category filter');
      } else {
        sanitized.category = filters.category;
      }
    }

    // Validate search term
    if (filters.search !== undefined) {
      if (filters.search && filters.search.length > 100) {
        errors.push('Search term must be less than 100 characters');
      } else {
        sanitized.search = filters.search;
      }
    }

    // Validate tags filter
    if (filters.tags !== undefined) {
      if (!Array.isArray(filters.tags)) {
        errors.push('Tags filter must be an array');
      } else if (filters.tags.length > 10) {
        errors.push('Maximum 10 tags allowed in filter');
      } else {
        sanitized.tags = filters.tags;
      }
    }

    // Validate pagination
    if (filters.page !== undefined) {
      if (!Number.isInteger(filters.page) || filters.page < 1) {
        errors.push('Page must be a positive integer');
      } else {
        sanitized.page = filters.page;
      }
    }

    if (filters.limit !== undefined) {
      if (!Number.isInteger(filters.limit) || filters.limit < 1 || filters.limit > 100) {
        errors.push('Limit must be an integer between 1 and 100');
      } else {
        sanitized.limit = filters.limit;
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedFilters: sanitized,
    };
  }

  /**
   * Validate connection security level compatibility
   */
  public static validateSecurityLevelCompatibility(type: ConnectionType, securityLevel: ConnectionSecurityLevel): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check if the connection type supports the requested security level
    const supportedSecurityLevels = {
      [ConnectionType.MYSQL]: [ConnectionSecurityLevel.NONE, ConnectionSecurityLevel.SSL, ConnectionSecurityLevel.SSH],
      [ConnectionType.POSTGRESQL]: [ConnectionSecurityLevel.NONE, ConnectionSecurityLevel.SSL, ConnectionSecurityLevel.SSH],
      [ConnectionType.SQLITE]: [ConnectionSecurityLevel.NONE],
      [ConnectionType.SQLSERVER]: [ConnectionSecurityLevel.NONE, ConnectionSecurityLevel.SSL, ConnectionSecurityLevel.SSH],
      [ConnectionType.ORACLE]: [ConnectionSecurityLevel.NONE, ConnectionSecurityLevel.SSL, ConnectionSecurityLevel.SSH],
      [ConnectionType.MONGODB]: [ConnectionSecurityLevel.NONE, ConnectionSecurityLevel.SSL],
      [ConnectionType.REDIS]: [ConnectionSecurityLevel.NONE, ConnectionSecurityLevel.SSL],
    };

    const supportedLevels = supportedSecurityLevels[type as keyof typeof supportedSecurityLevels];
    if (!supportedLevels || !supportedLevels.includes(securityLevel)) {
      errors.push(`Connection type ${type} does not support security level ${securityLevel}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}