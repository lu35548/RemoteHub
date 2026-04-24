/**
 * Connection-related enums for the RemoteHub application
 */

export enum ConnectionType {
  MYSQL = 'mysql',
  POSTGRESQL = 'postgresql',
  SQLITE = 'sqlite',
  SQLSERVER = 'sqlserver',
  ORACLE = 'oracle',
  MONGODB = 'mongodb',
  REDIS = 'redis',
}

export enum ConnectionStatus {
  ACTIVE = 'active',           // Connection is working
  INACTIVE = 'inactive',       // Connection is disabled
  ERROR = 'error',            // Connection has errors
  TESTING = 'testing',        // Currently testing connection
  PENDING = 'pending',        // Connection is being set up
}

export enum ConnectionSecurityLevel {
  NONE = 'none',             // No encryption
  SSL = 'ssl',              // SSL/TLS encryption
  SSH = 'ssh',              // SSH tunnel
  VPN = 'vpn',              // VPN connection
}

export enum ConnectionCategory {
  DEVELOPMENT = 'development',   // Development database
  STAGING = 'staging',          // Staging environment
  PRODUCTION = 'production',     // Production database
  TESTING = 'testing',          // Testing database
  BACKUP = 'backup',           // Backup database
}

/**
 * Default ports for different connection types
 */
export const DefaultPorts = {
  mysql: 3306,
  postgresql: 5432,
  sqlite: 0,    // File-based, no port
  sqlserver: 1433,
  oracle: 1521,
  mongodb: 27017,
  redis: 6379,
} as const;

/**
 * Connection type configurations
 */
export const ConnectionTypeConfig = {
  [ConnectionType.MYSQL]: {
    name: 'MySQL',
    description: 'MySQL/MariaDB database',
    defaultPort: DefaultPorts.mysql,
    requiresHost: true,
    requiresPort: true,
    requiresDatabase: true,
    supportsSSL: true,
    icon: '🐬',
  },
  [ConnectionType.POSTGRESQL]: {
    name: 'PostgreSQL',
    description: 'PostgreSQL database',
    defaultPort: DefaultPorts.postgresql,
    requiresHost: true,
    requiresPort: true,
    requiresDatabase: true,
    supportsSSL: true,
    icon: '🐘',
  },
  [ConnectionType.SQLITE]: {
    name: 'SQLite',
    description: 'SQLite file database',
    defaultPort: DefaultPorts.sqlite,
    requiresHost: false,
    requiresPort: false,
    requiresDatabase: true,
    supportsSSL: false,
    icon: '📁',
  },
  [ConnectionType.SQLSERVER]: {
    name: 'SQL Server',
    description: 'Microsoft SQL Server',
    defaultPort: DefaultPorts.sqlserver,
    requiresHost: true,
    requiresPort: true,
    requiresDatabase: true,
    supportsSSL: true,
    icon: '🟦',
  },
  [ConnectionType.ORACLE]: {
    name: 'Oracle',
    description: 'Oracle Database',
    defaultPort: DefaultPorts.oracle,
    requiresHost: true,
    requiresPort: true,
    requiresDatabase: true,
    supportsSSL: true,
    icon: '🟠',
  },
  [ConnectionType.MONGODB]: {
    name: 'MongoDB',
    description: 'MongoDB NoSQL database',
    defaultPort: DefaultPorts.mongodb,
    requiresHost: true,
    requiresPort: true,
    requiresDatabase: true,
    supportsSSL: true,
    icon: '🍃',
  },
  [ConnectionType.REDIS]: {
    name: 'Redis',
    description: 'Redis in-memory database',
    defaultPort: DefaultPorts.redis,
    requiresHost: true,
    requiresPort: true,
    requiresDatabase: false, // Redis uses databases, but not in the same way
    supportsSSL: true,
    icon: '🔴',
  },
} as const;

/**
 * Helper functions for connection enums
 */
export const ConnectionTypeHelper = {
  getConfig(type: ConnectionType) {
    return ConnectionTypeConfig[type];
  },

  getDefaultPort(type: ConnectionType): number {
    return DefaultPorts[type];
  },

  requiresHost(type: ConnectionType): boolean {
    return ConnectionTypeConfig[type].requiresHost;
  },

  requiresPort(type: ConnectionType): boolean {
    return ConnectionTypeConfig[type].requiresPort;
  },

  requiresDatabase(type: ConnectionType): boolean {
    return ConnectionTypeConfig[type].requiresDatabase;
  },

  supportsSSL(type: ConnectionType): boolean {
    return ConnectionTypeConfig[type].supportsSSL;
  },

  getDisplayName(type: ConnectionType): string {
    return ConnectionTypeConfig[type].name;
  },

  getDescription(type: ConnectionType): string {
    return ConnectionTypeConfig[type].description;
  },

  getIcon(type: ConnectionType): string {
    return ConnectionTypeConfig[type].icon;
  },

  getAllTypes(): ConnectionType[] {
    return Object.values(ConnectionType);
  },

  getFilteredTypes(criteria: {
    requiresHost?: boolean;
    requiresPort?: boolean;
    supportsSSL?: boolean;
  }): ConnectionType[] {
    return Object.values(ConnectionType).filter(type => {
      const config = ConnectionTypeConfig[type];

      if (criteria.requiresHost !== undefined && config.requiresHost !== criteria.requiresHost) {
        return false;
      }

      if (criteria.requiresPort !== undefined && config.requiresPort !== criteria.requiresPort) {
        return false;
      }

      if (criteria.supportsSSL !== undefined && config.supportsSSL !== criteria.supportsSSL) {
        return false;
      }

      return true;
    });
  },
};

export const ConnectionStatusHelper = {
  isActive(status: ConnectionStatus): boolean {
    return status === ConnectionStatus.ACTIVE;
  },

  canConnect(status: ConnectionStatus): boolean {
    return [ConnectionStatus.ACTIVE, ConnectionStatus.ERROR].includes(status);
  },

  requiresAttention(status: ConnectionStatus): boolean {
    return [ConnectionStatus.ERROR, ConnectionStatus.PENDING].includes(status);
  },

  getLabel(status: ConnectionStatus): string {
    const labels = {
      [ConnectionStatus.ACTIVE]: '活跃',
      [ConnectionStatus.INACTIVE]: '未激活',
      [ConnectionStatus.ERROR]: '错误',
      [ConnectionStatus.TESTING]: '测试中',
      [ConnectionStatus.PENDING]: '待配置',
    };
    return labels[status] || status;
  },

  getColor(status: ConnectionStatus): string {
    const colors = {
      [ConnectionStatus.ACTIVE]: '#10b981',   // green
      [ConnectionStatus.INACTIVE]: '#6b7280', // gray
      [ConnectionStatus.ERROR]: '#ef4444',    // red
      [ConnectionStatus.TESTING]: '#f59e0b',  // amber
      [ConnectionStatus.PENDING]: '#3b82f6',  // blue
    };
    return colors[status] || '#6b7280';
  },

  getAllStatuses(): ConnectionStatus[] {
    return Object.values(ConnectionStatus);
  },
};

export const ConnectionSecurityLevelHelper = {
  getLevel(security: ConnectionSecurityLevel): number {
    const levels = {
      [ConnectionSecurityLevel.NONE]: 0,
      [ConnectionSecurityLevel.SSL]: 1,
      [ConnectionSecurityLevel.SSH]: 2,
      [ConnectionSecurityLevel.VPN]: 3,
    };
    return levels[security] || 0;
  },

  isSecure(security: ConnectionSecurityLevel): boolean {
    return security !== ConnectionSecurityLevel.NONE;
  },

  getLabel(security: ConnectionSecurityLevel): string {
    const labels = {
      [ConnectionSecurityLevel.NONE]: '无加密',
      [ConnectionSecurityLevel.SSL]: 'SSL/TLS',
      [ConnectionSecurityLevel.SSH]: 'SSH隧道',
      [ConnectionSecurityLevel.VPN]: 'VPN连接',
    };
    return labels[security] || security;
  },

  getDescription(security: ConnectionSecurityLevel): string {
    const descriptions = {
      [ConnectionSecurityLevel.NONE]: '未加密连接，仅适用于开发环境',
      [ConnectionSecurityLevel.SSL]: '使用SSL/TLS加密数据传输',
      [ConnectionSecurityLevel.SSH]: '通过SSH隧道建立安全连接',
      [ConnectionSecurityLevel.VPN]: '通过VPN网络进行连接',
    };
    return descriptions[security] || '';
  },

  getAllSecurityLevels(): ConnectionSecurityLevel[] {
    return Object.values(ConnectionSecurityLevel);
  },
};

export const ConnectionCategoryHelper = {
  getProductionLevel(category: ConnectionCategory): number {
    const levels = {
      [ConnectionCategory.DEVELOPMENT]: 1,
      [ConnectionCategory.TESTING]: 2,
      [ConnectionCategory.STAGING]: 3,
      [ConnectionCategory.BACKUP]: 4,
      [ConnectionCategory.PRODUCTION]: 5,
    };
    return levels[category] || 0;
  },

  isProduction(category: ConnectionCategory): boolean {
    return category === ConnectionCategory.PRODUCTION;
  },

  isDevelopment(category: ConnectionCategory): boolean {
    return [ConnectionCategory.DEVELOPMENT, ConnectionCategory.TESTING].includes(category);
  },

  getLabel(category: ConnectionCategory): string {
    const labels = {
      [ConnectionCategory.DEVELOPMENT]: '开发环境',
      [ConnectionCategory.TESTING]: '测试环境',
      [ConnectionCategory.STAGING]: '预发布环境',
      [ConnectionCategory.PRODUCTION]: '生产环境',
      [ConnectionCategory.BACKUP]: '备份环境',
    };
    return labels[category] || category;
  },

  getColor(category: ConnectionCategory): string {
    const colors = {
      [ConnectionCategory.DEVELOPMENT]: '#3b82f6',   // blue
      [ConnectionCategory.TESTING]: '#f59e0b',       // amber
      [ConnectionCategory.STAGING]: '#8b5cf6',       // purple
      [ConnectionCategory.PRODUCTION]: '#ef4444',    // red
      [ConnectionCategory.BACKUP]: '#10b981',        // green
    };
    return colors[category] || '#6b7280';
  },

  getAllCategories(): ConnectionCategory[] {
    return Object.values(ConnectionCategory);
  },
};