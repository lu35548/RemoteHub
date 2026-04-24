import { logger } from '../utils/logger';

// Mock database implementation for testing when SQLite is not available
export class MockDatabaseService {
  private static instance: MockDatabaseService;
  // Make mockData and mockIdCounter static to persist between instances
  private static mockData: Map<string, any[]> = new Map();
  private static mockIdCounter: Map<string, number> = new Map();
  private initialized = false;

  private constructor() {}

  public static getInstance(): MockDatabaseService {
    if (!MockDatabaseService.instance) {
      MockDatabaseService.instance = new MockDatabaseService();
    }
    return MockDatabaseService.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing mock database service for development');

    // Initialize default admin user if not exists
    const users = MockDatabaseService.mockData.get('User') || [];
    if (users.length === 0) {
      const admin = {
        id: '1',
        username: 'admin',
        email: 'admin@example.com',
        password: '$2b$10$L3v7t3GIHblgkL8H7QGpwOH38JMOkzHUxTOkJeEpUXjVwqhBWdU2S', // admin123
        firstName: 'System',
        lastName: 'Administrator',
        role: 'admin',
        status: 'ACTIVE',
        emailVerified: true,
        loginAttempts: 0,
        tokenVersion: 0,
        // Online status fields
        lastSeenAt: null,
        currentSessionId: null,
        lastSeenIp: null,
        isOnline: false,
        onlineStatus: {
          status: 'offline',
          lastActivity: new Date()
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Add test user
      users.push({
        id: '2',
        username: 'testuser',
        email: 'testuser@example.com',
        password: '$2b$10$G6Qk8q93bIrc1tKh.3q9ROhAv1k8AHM3P/JHJsNqhKfE6/VQkPcWm', // password123
        firstName: 'Test',
        lastName: 'User',
        role: 'user',
        status: 'ACTIVE',
        emailVerified: true,
        loginAttempts: 0,
        tokenVersion: 0,
        // Online status fields
        lastSeenAt: null,
        currentSessionId: null,
        lastSeenIp: null,
        isOnline: false,
        onlineStatus: {
          status: 'offline',
          lastActivity: new Date()
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });
      users.push(admin);
      MockDatabaseService.mockData.set('User', users);
      logger.info('Created default admin user (admin / admin123)');
    }

    this.initialized = true;
  }

  public async close(): Promise<void> {
    logger.info('Mock database service closed');
    this.initialized = false;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  // Mock data source - this simulates TypeORM's DataSource
  public getDataSource(): any {
    const mockService = this;
    return {
      query: async (sql: string, params?: any[]) => {
        logger.debug(`Mock SQL query: ${sql}`, { params });
        // Return mock data based on the query
        if (sql.includes('SELECT 1')) {
          return [{ test: 1 }];
        }
        return [];
      },
      createEntityManager: () => {
        return {
          getRepository: (entity: any) => {
            return mockService.getDataSource().getRepository(entity);
          }
        };
      },
      getRepository: (entity: any) => {
        // Simple approach: always use 'User' for User entity
        const getEntityName = (entity: any): string => {
          // Direct comparison with User, Connection, and AuditLog classes
          const UserClass = require('../models/User').User;
          const ConnectionClass = require('../models/Connection').Connection;
          let AuditLogClass;

          try {
            AuditLogClass = require('../models/AuditLog').AuditLog;
          } catch (e) {
            // AuditLog might not exist yet
          }

          // Check multiple ways to identify User entity
          if (entity === UserClass) {
            return 'User';
          }

          // Check by constructor
          if (entity.constructor && entity.constructor.name === 'User') {
            return 'User';
          }

          // Check by name
          if (entity.name === 'User') {
            return 'User';
          }

          // Check prototype
          if (entity.prototype && entity.prototype.constructor &&
              entity.prototype.constructor.name === 'User') {
            return 'User';
          }

          // For function/class instances
          if (typeof entity === 'function' && entity.name === 'User') {
            return 'User';
          }

          // Special string comparison (TypeORM sometimes passes entity name)
          if (typeof entity === 'string' && entity.toLowerCase() === 'user') {
            return 'User';
          }

          // Check multiple ways to identify Connection entity
          if (entity === ConnectionClass) {
            return 'Connection';
          }

          // Check by constructor
          if (entity.constructor && entity.constructor.name === 'Connection') {
            return 'Connection';
          }

          // Check by name
          if (entity.name === 'Connection') {
            return 'Connection';
          }

          // Check prototype
          if (entity.prototype && entity.prototype.constructor &&
              entity.prototype.constructor.name === 'Connection') {
            return 'Connection';
          }

          // For function/class instances
          if (typeof entity === 'function' && entity.name === 'Connection') {
            return 'Connection';
          }

          // Special string comparison (TypeORM sometimes passes entity name)
          if (typeof entity === 'string' && entity.toLowerCase() === 'connection') {
            return 'Connection';
          }

          // Check multiple ways to identify AuditLog entity
          if (AuditLogClass) {
            if (entity === AuditLogClass) {
              return 'AuditLog';
            }

            // Check by constructor
            if (entity.constructor && entity.constructor.name === 'AuditLog') {
              return 'AuditLog';
            }

            // Check by name
            if (entity.name === 'AuditLog') {
              return 'AuditLog';
            }

            // Check prototype
            if (entity.prototype && entity.prototype.constructor &&
                entity.prototype.constructor.name === 'AuditLog') {
              return 'AuditLog';
            }

            // For function/class instances
            if (typeof entity === 'function' && entity.name === 'AuditLog') {
              return 'AuditLog';
            }

            // Special string comparison (TypeORM sometimes passes entity name)
            if (typeof entity === 'string' && entity.toLowerCase() === 'auditlog') {
              return 'AuditLog';
            }
          }

          // Log for debugging unknown entities
          if (entity !== UserClass && entity.constructor?.name !== 'User' &&
              entity !== ConnectionClass && entity.constructor?.name !== 'Connection' &&
              (!AuditLogClass || (entity !== AuditLogClass && entity.constructor?.name !== 'AuditLog'))) {
            logger.debug('Unknown entity:', {
              type: typeof entity,
              name: entity.name,
              constructor: entity.constructor?.name,
              prototype: entity.prototype?.constructor?.name
            });
          }

          return 'Unknown';
        };

        return {
          find: async (options?: any) => {
            const entityName = getEntityName(entity);
            const data = MockDatabaseService.mockData.get(entityName) || [];
            // Add entity-specific methods to returned objects
            if (entityName === 'User') {
              return data.map(user => MockDatabaseService.createUserWithMethods(user));
            }
            if (entityName === 'AuditLog') {
              return data.map(auditLog => MockDatabaseService.createAuditLogWithMethods(auditLog));
            }
            return data;
          },
          findOne: async (options?: any) => {
            const entityName = getEntityName(entity);
            const data = MockDatabaseService.mockData.get(entityName) || [];
            let result = null;

            if (options?.where) {
              // Handle TypeORM array format for OR conditions
              if (Array.isArray(options.where)) {
                for (const condition of options.where) {
                  result = data.find(item => {
                    for (const [key, value] of Object.entries(condition)) {
                      if (item[key] !== value) {
                        return false;
                      }
                    }
                    return true;
                  });
                  if (result) break; // Found a match, exit loop
                }
              } else {
                // Handle single condition object
                if (options.where?.id) {
                  result = data.find(item => item.id === options.where.id) || null;
                } else if (options.where?.email) {
                  result = data.find(item => item.email === options.where.email) || null;
                } else if (options.where?.username) {
                  result = data.find(item => item.username === options.where.username) || null;
                } else if (options.where?.emailOrUsername) {
                  result = data.find(item =>
                    item.email === options.where.emailOrUsername ||
                    item.username === options.where.emailOrUsername
                  ) || null;
                } else {
                  // Generic condition handling
                  result = data.find(item => {
                    for (const [key, value] of Object.entries(options.where)) {
                      if (item[key] !== value) {
                        return false;
                      }
                    }
                    return true;
                  }) || null;
                }
              }
            }

            // Debug log for User lookup
            if (entityName === 'User') {
              logger.debug('MockDatabase: User lookup', {
                entityName,
                options,
                totalUsers: MockDatabaseService.mockData.get('User')?.length || 0,
                found: !!result,
                resultId: result?.id,
                resultUsername: result?.username
              });
            }

            if (result && entityName === 'User') {
              // Add User class methods to the mock object
              return MockDatabaseService.createUserWithMethods(result);
            }

            if (result && entityName === 'AuditLog') {
              // Add AuditLog class methods to the mock object
              return MockDatabaseService.createAuditLogWithMethods(result);
            }

            // Add Connection methods to Connection entities
            if (result && entityName === 'Connection') {
              // Add required methods for Connection entities
              Object.defineProperty(result, 'isValidConfiguration', {
                get: function() {
                  const type = this.type;
                  if (!type) return false;

                  switch (type) {
                    case 'mysql':
                    case 'postgresql':
                    case 'sqlserver':
                    case 'oracle':
                      return !!(this.host && this.username && this.database);
                    case 'sqlite':
                      return !!this.database;
                    case 'mongodb':
                    case 'redis':
                      return !!this.host;
                    default:
                      return false;
                  }
                },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(result, 'hasPassword', {
                get: function() {
                  return !!this._encryptedPassword;
                },
                enumerable: false,
                configurable: false
              });

              result.toJSON = function() {
                const { _encryptedPassword, sshConfig, projectAssociations, ...connectionWithoutSensitiveData } = this;
                const sanitizedSshConfig = sshConfig ? {
                  ...sshConfig,
                  password: sshConfig.password ? '[ENCRYPTED]' : undefined,
                  privateKey: sshConfig.privateKey ? '[ENCRYPTED]' : undefined,
                  passphrase: sshConfig.passphrase ? '[ENCRYPTED]' : undefined,
                } : undefined;

                return {
                  ...connectionWithoutSensitiveData,
                  sshConfig: sanitizedSshConfig,
                  hasPassword: !!this._encryptedPassword,
                };
              };

              result.hasPassword = function() {
                return !!this._encryptedPassword;
              };

              result.setPassword = function(password: string) {
                const crypto = require('../utils/database');
                this._encryptedPassword = crypto.encrypt(password, process.env.ENCRYPTION_KEY || 'default-key');
              };
            }

            return result;
          },
          create: (data?: any): any => {
            const entityName = getEntityName(entity);
            // Handle multiple overloads like TypeORM
            if (!data) {
              return {} as any;
            }

            // Handle array case
            if (Array.isArray(data)) {
              return data.map(item => {
                const counter = MockDatabaseService.mockIdCounter.get(entityName) || 1;
                const id = counter.toString();
                MockDatabaseService.mockIdCounter.set(entityName, counter + 1);

                return {
                  ...item,
                  id,
                  createdAt: new Date(),
                  updatedAt: new Date()
                };
              });
            }

            // Handle single object
            const counter = MockDatabaseService.mockIdCounter.get(entityName) || 1;
            const id = counter.toString();
            MockDatabaseService.mockIdCounter.set(entityName, counter + 1);

            // Create instance with proper class
            let instance: any = {
              ...data,
              id,
              createdAt: new Date(),
              updatedAt: new Date()
            };

            // Add getter for isValidConfiguration for Connection entities
            if (entityName === 'Connection') {
              // Define the getter function with proper this binding
              const isValidConfigurationGetter = function() {
                // Basic validation based on type
                const type = this.type;
                console.log('[MockDB] Checking isValidConfiguration for type:', type);
                console.log('[MockDB] Data:', {
                  host: this.host,
                  database: this.database,
                  username: this.username,
                  port: this.port
                });
                if (!type) return false;

                // Simple validation rules
                switch (type) {
                  case 'mysql':
                  case 'postgresql':
                  case 'sqlserver':
                  case 'oracle':
                    return !!(this.host && this.username && this.database);
                  case 'sqlite':
                    return !!this.database;
                  case 'mongodb':
                  case 'redis':
                    return !!this.host;
                  default:
                    return false;
                }
              };

              Object.defineProperty(instance, 'isValidConfiguration', {
                get: isValidConfigurationGetter,
                enumerable: false,
                configurable: false
              });

              // Add hasPassword method
              Object.defineProperty(instance, 'hasPassword', {
                get: function() {
                  return !!this._encryptedPassword;
                },
                enumerable: false,
                configurable: false
              });

              // Add toJSON method
              instance.toJSON = function() {
                // Return a copy without sensitive information
                const result = { ...this };
                delete result._encryptedPassword;
                delete result.password;
                return result;
              };
            }

            // Add AuditLog specific getter methods and helper functions
            if (entityName === 'AuditLog') {
              // Add all BaseEntity helper methods
              instance.softDelete = function(deletedBy?: string, deletedIp?: string): Date {
                this.deletedAt = new Date();
                if (deletedBy) this.deletedBy = deletedBy;
                if (deletedIp) this.deletedIp = deletedIp;
                return this.deletedAt;
              };

              instance.restore = function(): void {
                this.deletedAt = undefined;
                this.deletedBy = undefined;
                this.deletedIp = undefined;
              };

              instance.isDeleted = function(): boolean {
                return this.deletedAt !== undefined;
              };

              instance.incrementVersion = function(): string {
                const currentVersion = parseInt(this.version || '0');
                const newVersion = (currentVersion + 1).toString();
                this.version = newVersion;
                return newVersion;
              };

              instance.getVersion = function(): number {
                return parseInt(this.version || '0');
              };

              instance.setMetadata = function(key: string, value: any): void {
                if (!this.metadata) this.metadata = {};
                this.metadata[key] = value;
              };

              instance.getMetadata = function(key: string): any {
                return this.metadata?.[key];
              };

              instance.hasMetadata = function(key: string): boolean {
                return this.metadata?.hasOwnProperty(key) || false;
              };

              instance.removeMetadata = function(key: string): void {
                if (this.metadata?.hasOwnProperty(key)) {
                  delete this.metadata[key];
                }
              };

              instance.clearMetadata = function(): void {
                this.metadata = undefined;
              };

              instance.setCreatedBy = function(userId: string, ip?: string): void {
                this.createdBy = userId;
                if (ip) this.createdIp = ip;
              };

              instance.setUpdatedBy = function(userId: string, ip?: string): void {
                this.updatedBy = userId;
                if (ip) this.updatedIp = ip;
              };

              instance.setDeletedBy = function(userId: string, ip?: string): void {
                this.deletedBy = userId;
                if (ip) this.deletedIp = ip;
              };

              instance.isCreatedBy = function(userId: string): boolean {
                return this.createdBy === userId;
              };

              instance.canBeModifiedBy = function(userId: string): boolean {
                return this.createdBy === userId || this.updatedBy === userId;
              };

              instance.getAgeInDays = function(): number {
                return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24));
              };

              instance.getDaysSinceLastUpdate = function(): number {
                return Math.floor((Date.now() - this.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
              };

              instance.isRecent = function(): boolean {
                return this.getAgeInDays() <= 30;
              };

              instance.isStale = function(): boolean {
                return this.getDaysSinceLastUpdate() > 90;
              };

              instance.toJSON = function(): Partial<any> {
                const { deletedAt, ...result } = this;
                return result as Partial<any>;
              };

              // Add AuditLog specific getter methods
              Object.defineProperty(instance, 'isCreateAction', {
                get: function() { return this.action === 'create'; },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(instance, 'isUpdateAction', {
                get: function() { return this.action === 'update'; },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(instance, 'isDeleteAction', {
                get: function() { return this.action === 'delete'; },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(instance, 'isAuthAction', {
                get: function() {
                  return ['login', 'logout', 'login_failed', 'token_refresh', 'password_reset'].includes(this.action);
                },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(instance, 'isPermissionAction', {
                get: function() {
                  return ['permission_granted', 'permission_revoked', 'role_change'].includes(this.action);
                },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(instance, 'isSecurityAction', {
                get: function() {
                  return ['security_violation', 'suspicious_activity', 'lockout', 'unlock'].includes(this.action);
                },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(instance, 'isDataAction', {
                get: function() {
                  return ['export', 'import', 'backup', 'restore'].includes(this.action);
                },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(instance, 'isConfigAction', {
                get: function() {
                  return ['config_change', 'system_update', 'maintenance'].includes(this.action);
                },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(instance, 'actionType', {
                get: function() {
                  if (this.isCreateAction) return 'create';
                  if (this.isUpdateAction) return 'update';
                  if (this.isDeleteAction) return 'delete';
                  if (this.isAuthAction) return 'auth';
                  if (this.isPermissionAction) return 'permission';
                  if (this.isSecurityAction) return 'security';
                  if (this.isDataAction) return 'data';
                  if (this.isConfigAction) return 'config';
                  return 'unknown';
                },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(instance, 'severity', {
                get: function() {
                  if (this.isFailure || this.isSecurityAction) return 'high';
                  if (this.isSensitive || this.isDeleteAction) return 'medium';
                  return 'low';
                },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(instance, 'summary', {
                get: function() {
                  return `${this.action.toUpperCase()} ${this.entityType} (${this.entityName}) - ${this.description}`;
                },
                enumerable: false,
                configurable: false
              });

              Object.defineProperty(instance, 'duration', {
                get: function() {
                  return this.completedAt ? this.completedAt.getTime() - this.createdAt.getTime() : null;
                },
                enumerable: false,
                configurable: false
              });
            }

            // Generate ID using entity's method if available
            if (typeof entity === 'function' && (entity as any).generateId) {
              return { ...instance, id: (entity as any).generateId() };
            }

            return instance;
          },
          save: async (data: any) => {
            const entityName = getEntityName(entity);
            const items = MockDatabaseService.mockData.get(entityName) || [];

            // Debug log for User creation
            if (entityName === 'User') {
              logger.debug('MockDatabase: Saving User', {
                hasPassword: !!data.password,
                passwordLength: data.password?.length || 0,
                username: data.username,
                id: data.id
              });
            }

            if (data.id) {
              // Update existing
              const index = items.findIndex(item => item.id === data.id);
              if (index >= 0) {
                items[index] = { ...items[index], ...data, updatedAt: new Date() };
              } else {
                items.push({ ...data, createdAt: new Date(), updatedAt: new Date() });
              }
            } else {
              // Create new
              const counter = MockDatabaseService.mockIdCounter.get(entityName) || 1;
              const id = counter.toString();
              MockDatabaseService.mockIdCounter.set(entityName, counter + 1);
              items.push({ ...data, id, createdAt: new Date(), updatedAt: new Date() });
            }

            MockDatabaseService.mockData.set(entityName, items);
            const savedItem = items[items.length - 1];
            // Add entity-specific methods and getters
            if (entityName === 'User') {
              return MockDatabaseService.createUserWithMethods(savedItem);
            }

            if (entityName === 'AuditLog') {
              return MockDatabaseService.createAuditLogWithMethods(savedItem);
            }

            // Add getter for isValidConfiguration for Connection entities
            if (entityName === 'Connection') {
              // Define the getter function with proper this binding
              const isValidConfigurationGetter = function() {
                // Basic validation based on type
                const type = this.type;
                console.log('[MockDB] Checking isValidConfiguration for type:', type);
                console.log('[MockDB] Data:', {
                  host: this.host,
                  database: this.database,
                  username: this.username,
                  port: this.port
                });
                if (!type) return false;

                // Simple validation rules
                switch (type) {
                  case 'mysql':
                  case 'postgresql':
                  case 'sqlserver':
                  case 'oracle':
                    return !!(this.host && this.username && this.database);
                  case 'sqlite':
                    return !!this.database;
                  case 'mongodb':
                  case 'redis':
                    return !!this.host;
                  default:
                    return false;
                }
              };

              Object.defineProperty(savedItem, 'isValidConfiguration', {
                get: isValidConfigurationGetter,
                enumerable: false,
                configurable: false
              });

              // Add hasPassword method
              Object.defineProperty(savedItem, 'hasPassword', {
                get: function() {
                  return !!this._encryptedPassword;
                },
                enumerable: false,
                configurable: false
              });

              // Add toJSON method
              savedItem.toJSON = function() {
                // Return a copy without sensitive information
                const result = { ...this };
                delete result._encryptedPassword;
                delete result.password;
                return result;
              };
            }

            return savedItem;
          },
          remove: async (data: any) => {
            const entityName = getEntityName(entity);
            const items = MockDatabaseService.mockData.get(entityName) || [];
            const index = items.findIndex(item => item.id === data.id);
            if (index >= 0) {
              items.splice(index, 1);
              MockDatabaseService.mockData.set(entityName, items);
            }
            return data;
          },
          update: async (id: string, data: any) => {
            const entityName = getEntityName(entity);
            const items = MockDatabaseService.mockData.get(entityName) || [];
            const index = items.findIndex(item => item.id === id);
            if (index >= 0) {
              items[index] = { ...items[index], ...data, updatedAt: new Date() };
              MockDatabaseService.mockData.set(entityName, items);
              return { affected: 1 };
            }
            return { affected: 0 };
          },
          count: async () => {
            const entityName = getEntityName(entity);
            const data = MockDatabaseService.mockData.get(entityName) || [];
            return data.length;
          },
          // Add TypeORM-like methods for UserController
          findAndCount: async (options?: any) => {
            const entityName = getEntityName(entity);
            const data = MockDatabaseService.mockData.get(entityName) || [];

            let filteredData = data;

            // Apply where conditions
            if (options?.where) {
              filteredData = data.filter(item => {
                for (const [key, value] of Object.entries(options.where)) {
                  if (item[key] !== value) {
                    return false;
                  }
                }
                return true;
              });
            }

            // Apply search filter for User entity
            if (entityName === 'User' && options?.where && typeof options.where === 'object') {
              const whereConditions = options.where;
              filteredData = data.filter(user => {
                // Handle OR conditions
                if (Array.isArray(whereConditions)) {
                  for (const condition of whereConditions) {
                    if (MockDatabaseService.matchesCondition(user, condition)) {
                      return true;
                    }
                  }
                  return false;
                }

                // Handle single condition
                return MockDatabaseService.matchesCondition(user, whereConditions);
              });
            }

            // Apply select
            if (options?.select && Array.isArray(options.select)) {
              filteredData = filteredData.map(item => {
                const selectedItem: any = {};
                options.select.forEach((field: string) => {
                  if (field in item) {
                    selectedItem[field] = item[field];
                  }
                });
                return MockDatabaseService.createUserWithMethods(selectedItem);
              });
            } else if (entityName === 'User') {
              filteredData = filteredData.map(user => MockDatabaseService.createUserWithMethods(user));
            } else if (entityName === 'AuditLog') {
              filteredData = filteredData.map(auditLog => MockDatabaseService.createAuditLogWithMethods(auditLog));
            }

            // Apply pagination
            const skip = options?.skip || 0;
            const take = options?.take || filteredData.length;
            const paginatedData = filteredData.slice(skip, skip + take);

            return [paginatedData, filteredData.length];
          },
          createQueryBuilder: (alias: string) => {
            return MockDatabaseService.createMockQueryBuilder(mockService, getEntityName(entity), alias);
          }
        };
      }
    };
  }

  /**
   * Mock QueryBuilder implementation
   */
  private static createMockQueryBuilder(
    dataSource: MockDatabaseService,
    entityName: string,
    alias: string
  ) {
    const mockService = dataSource;
    let queryData: any[] = [];
    let whereConditions: any[] = [];
    let selectFields: string[] = [];
    let joinConditions: any[] = [];
    let skipCount = 0;
    let takeCount: number | undefined;
    let orderByConditions: any[] = [];

    const builder = {
      leftJoinAndSelect(relation: string, alias: string) {
        joinConditions.push({ type: 'leftJoinAndSelect', relation, alias });
        return builder;
      },

      leftJoin(relation: string, alias: string) {
        joinConditions.push({ type: 'leftJoin', relation, alias });
        return builder;
      },

      where(condition: string, params?: any) {
        // Parse simple where conditions like "project.id = :id"
        whereConditions.push({ condition, params });
        return builder;
      },

      andWhere(condition: string, params?: any) {
        whereConditions.push({ condition, params });
        return builder;
      },

      select(fields: string | string[]) {
        if (typeof fields === 'string') {
          selectFields = [fields];
        } else {
          selectFields = fields;
        }
        return builder;
      },

      addSelect(fields: string | string[]) {
        if (typeof fields === 'string') {
          selectFields.push(fields);
        } else {
          selectFields.push(...fields);
        }
        return builder;
      },

      skip(count: number) {
        skipCount = count;
        return builder;
      },

      take(count: number) {
        takeCount = count;
        return builder;
      },

      orderBy(field: string, order: 'ASC' | 'DESC' = 'ASC') {
        orderByConditions.push({ field, order });
        return builder;
      },

      addOrderBy(field: string, order: 'ASC' | 'DESC' = 'ASC') {
        orderByConditions.push({ field, order });
        return builder;
      },

      async getOne(): Promise<any> {
        const data = await builder.getMany();
        return data.length > 0 ? data[0] : null;
      },

      async getMany(): Promise<any[]> {
        // Get base data based on entityName
        let baseData: any[] = [];

        // Map entity names to mock data collections
        switch (entityName) {
          case 'User':
          case 'user':
            baseData = MockDatabaseService.mockData.get('User') || [];
            break;
          case 'Project':
          case 'project':
            baseData = MockDatabaseService.mockData.get('Project') || [];
            break;
          case 'ProjectMember':
          case 'member':
            baseData = MockDatabaseService.mockData.get('ProjectMember') || [];
            break;
          case 'Connection':
          case 'connection':
            baseData = MockDatabaseService.mockData.get('Connection') || [];
            break;
          case 'ProjectConnection':
            baseData = MockDatabaseService.mockData.get('ProjectConnection') || [];
            break;
          default:
            baseData = MockDatabaseService.mockData.get(entityName) || [];
        }

        // Apply where conditions
        let filteredData = baseData.filter(item => {
          return whereConditions.every(whereCond => {
            if (whereCond.params && whereCond.condition.includes(':id')) {
              return item.id === whereCond.params.id;
            }
            if (whereCond.params && whereCond.condition.includes(':projectId')) {
              return item.projectId === whereCond.params.projectId;
            }
            return true; // Simplified - would need full condition parsing
          });
        });

        // Apply joins - properly handle TypeORM relation syntax
        if (joinConditions.length > 0) {
          filteredData = filteredData.map(item => {
            const enhancedItem = { ...item };
            joinConditions.forEach(join => {
              // Parse relation like "member.user" or "member.project"
              const parts = join.relation.split('.');
              const sourceAlias = parts[0];
              const targetEntity = parts[1];

              // Only process if this join is relevant to current entity
              if (sourceAlias === alias) {
                switch (targetEntity) {
                  case 'user':
                    // For ProjectMember -> User relation
                    if (item.userId) {
                      const users = MockDatabaseService.mockData.get('User') || [];
                      enhancedItem.user = users.find((u: any) => u.id === item.userId);
                    }
                    break;

                  case 'project':
                    // For ProjectMember -> Project or ProjectConnection -> Project relation
                    if (item.projectId) {
                      const projects = MockDatabaseService.mockData.get('Project') || [];
                      enhancedItem.project = projects.find((p: any) => p.id === item.projectId);
                    }
                    break;

                  case 'connection':
                    // For ProjectConnection -> Connection relation
                    if (item.connectionId) {
                      const connections = MockDatabaseService.mockData.get('Connection') || [];
                      enhancedItem.connection = connections.find((c: any) => c.id === item.connectionId);
                    }
                    break;

                  case 'members':
                    // For Project -> ProjectMember relation
                    enhancedItem.members = MockDatabaseService.mockData.get('ProjectMember')?.filter(
                      (m: any) => m.projectId === item.id
                    ) || [];
                    break;

                  case 'connections':
                    // For Project -> ProjectConnection relation
                    enhancedItem.connections = MockDatabaseService.mockData.get('ProjectConnection')?.filter(
                      (c: any) => c.projectId === item.id
                    ) || [];
                    break;

                  case 'addedByUser':
                    // For ProjectConnection -> User relation
                    if (item.addedBy) {
                      const users = MockDatabaseService.mockData.get('User') || [];
                      enhancedItem.addedByUser = users.find((u: any) => u.id === item.addedBy);
                    }
                    break;
                }
              }
            });
            return enhancedItem;
          });
        }

        // Apply sorting
        if (orderByConditions.length > 0) {
          filteredData.sort((a: any, b: any) => {
            for (const orderCond of orderByConditions) {
              let aValue: any = a;
              let bValue: any = b;

              // Handle field access (e.g., 'user.username' or 'member.createdAt')
              const fieldParts = orderCond.field.split('.');
              for (const part of fieldParts) {
                aValue = aValue?.[part];
                bValue = bValue?.[part];
              }

              // Compare values
              let comparison = 0;
              if (aValue < bValue) {
                comparison = -1;
              } else if (aValue > bValue) {
                comparison = 1;
              }

              // Apply order direction
              if (orderCond.order === 'DESC') {
                comparison = -comparison;
              }

              if (comparison !== 0) {
                return comparison;
              }
            }
            return 0;
          });
        }

        // Apply pagination
        const startIndex = skipCount;
        const endIndex = takeCount !== undefined ? startIndex + takeCount : filteredData.length;
        const paginatedData = filteredData.slice(startIndex, endIndex);

        return paginatedData;
      },

      getQuery(): string {
        // Return a mock SQL query string
        return `SELECT ${alias}.* FROM ${entityName} ${alias}`;
      },

      getParameters(): any {
        // Return mock parameters
        return {};
      },

      setParameters(params: any) {
        // Store parameters for future use
        return builder;
      },

      async getManyAndCount(): Promise<[any[], number]> {
        const data = await builder.getMany();
        const count = await builder.getCount();
        return [data, count];
      },

      async getCount(): Promise<number> {
        // Get base data based on entityName (same as getMany)
        let baseData: any[] = [];

        switch (entityName) {
          case 'User':
          case 'user':
            baseData = MockDatabaseService.mockData.get('User') || [];
            break;
          case 'Project':
          case 'project':
            baseData = MockDatabaseService.mockData.get('Project') || [];
            break;
          case 'ProjectMember':
          case 'member':
            baseData = MockDatabaseService.mockData.get('ProjectMember') || [];
            break;
          case 'Connection':
          case 'connection':
            baseData = MockDatabaseService.mockData.get('Connection') || [];
            break;
          case 'ProjectConnection':
            baseData = MockDatabaseService.mockData.get('ProjectConnection') || [];
            break;
          default:
            baseData = MockDatabaseService.mockData.get(entityName) || [];
        }

        // Apply where conditions (same logic as getMany)
        let filteredData = baseData.filter(item => {
          return whereConditions.every(whereCond => {
            if (whereCond.params && whereCond.condition.includes(':id')) {
              return item.id === whereCond.params.id;
            }
            if (whereCond.params && whereCond.condition.includes(':projectId')) {
              return item.projectId === whereCond.params.projectId;
            }
            return true;
          });
        });

        return filteredData.length;
      }
    };

    return builder;
  }

  /**
   * Helper method to check if item matches condition
   */
  private static matchesCondition(item: any, condition: any): boolean {
    for (const [key, value] of Object.entries(condition)) {
      if (typeof value === 'object' && value !== null) {
        // Handle special operators
        if ('$ilike' in value) {
          const itemValue = item[key] || '';
          const pattern = (value as any).$ilike.replace(/%/g, '.*').toLowerCase();
          if (!new RegExp(pattern).test(itemValue.toString().toLowerCase())) {
            return false;
          }
        } else if ('$gte' in value) {
          if (!(item[key] >= (value as any).$gte)) {
            return false;
          }
        }
      } else if (item[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Create a user object with all necessary methods
   */
  private static createUserWithMethods(user: any): any {
    if (!user || typeof user !== 'object') {
      return user;
    }

    return {
      ...user,
      password: user.password || user.passwordHash || '', // Ensure password field exists
      status: user.status || (user.isActive ? 'ACTIVE' : user.isLocked ? 'SUSPENDED' : 'ACTIVE'),
      isActive: user.status === 'ACTIVE',
      isLocked: user.status === 'SUSPENDED' && user.lockedUntil && new Date(user.lockedUntil) > new Date(),
      fullName: user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username,
      isEmailVerified: user.emailVerified || false,
      hasTwoFactorEnabled: user.twoFactorEnabled || false,
      canAttemptLogin() {
        if (this.isLocked) {
          return false;
        }
        const maxAttempts = 5;
        return (this.loginAttempts || 0) < maxAttempts;
      },
      incrementLoginAttempts() {
        this.loginAttempts = (this.loginAttempts || 0) + 1;
        const maxAttempts = 5;
        if (this.loginAttempts >= maxAttempts) {
          this.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
        }
      },
      resetLoginAttempts() {
        this.loginAttempts = 0;
        this.lockedUntil = undefined;
      },
      updateLastLogin(ip?: string) {
        this.lastLoginAt = new Date();
        if (ip) {
          this.lastLoginIp = ip;
        }
        this.resetLoginAttempts();
      },
      isPasswordResetTokenValid() {
        if (!this.passwordResetToken || !this.passwordResetExpiresAt) {
          return false;
        }
        return new Date() < this.passwordResetExpiresAt;
      },
      clearPasswordResetFields() {
        this.passwordResetToken = undefined;
        this.passwordResetExpiresAt = undefined;
        this.passwordResetRequestedAt = undefined;
      },
      toJSON() {
        const { password, twoFactorSecret, backupCodes, passwordResetToken, ...userWithoutSensitiveData } = this;
        return userWithoutSensitiveData;
      }
    };
  }

  // Helper method to add AuditLog methods
  private static createAuditLogWithMethods(auditLog: any): any {
    if (!auditLog || typeof auditLog !== 'object') {
      return auditLog;
    }

    const result = {
      ...auditLog,

      // BaseEntity helper methods
      softDelete(deletedBy?: string, deletedIp?: string): Date {
        this.deletedAt = new Date();
        if (deletedBy) this.deletedBy = deletedBy;
        if (deletedIp) this.deletedIp = deletedIp;
        return this.deletedAt;
      },

      restore(): void {
        this.deletedAt = undefined;
        this.deletedBy = undefined;
        this.deletedIp = undefined;
      },

      isDeleted(): boolean {
        return this.deletedAt !== undefined;
      },

      incrementVersion(): string {
        const currentVersion = parseInt(this.version || '0');
        const newVersion = (currentVersion + 1).toString();
        this.version = newVersion;
        return newVersion;
      },

      getVersion(): number {
        return parseInt(this.version || '0');
      },

      setMetadata(key: string, value: any): void {
        if (!this.metadata) this.metadata = {};
        this.metadata[key] = value;
      },

      getMetadata(key: string): any {
        return this.metadata?.[key];
      },

      hasMetadata(key: string): boolean {
        return this.metadata?.hasOwnProperty(key) || false;
      },

      removeMetadata(key: string): void {
        if (this.metadata?.hasOwnProperty(key)) {
          delete this.metadata[key];
        }
      },

      clearMetadata(): void {
        this.metadata = undefined;
      },

      setCreatedBy(userId: string, ip?: string): void {
        this.createdBy = userId;
        if (ip) this.createdIp = ip;
      },

      setUpdatedBy(userId: string, ip?: string): void {
        this.updatedBy = userId;
        if (ip) this.updatedIp = ip;
      },

      setDeletedBy(userId: string, ip?: string): void {
        this.deletedBy = userId;
        if (ip) this.deletedIp = ip;
      },

      isCreatedBy(userId: string): boolean {
        return this.createdBy === userId;
      },

      canBeModifiedBy(userId: string): boolean {
        return this.createdBy === userId || this.updatedBy === userId;
      },

      getAgeInDays(): number {
        return Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24));
      },

      getDaysSinceLastUpdate(): number {
        return Math.floor((Date.now() - this.updatedAt.getTime()) / (1000 * 60 * 60 * 24));
      },

      isRecent(): boolean {
        return this.getAgeInDays() <= 30;
      },

      isStale(): boolean {
        return this.getDaysSinceLastUpdate() > 90;
      },

      toJSON(): Partial<any> {
        const { deletedAt, ...result } = this;
        return result as Partial<any>;
      }
    };

    // Add AuditLog specific getter methods
    Object.defineProperty(result, 'isCreateAction', {
      get: function() { return this.action === 'create'; },
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(result, 'isUpdateAction', {
      get: function() { return this.action === 'update'; },
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(result, 'isDeleteAction', {
      get: function() { return this.action === 'delete'; },
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(result, 'isAuthAction', {
      get: function() {
        return ['login', 'logout', 'login_failed', 'token_refresh', 'password_reset'].includes(this.action);
      },
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(result, 'isPermissionAction', {
      get: function() {
        return ['permission_granted', 'permission_revoked', 'role_change'].includes(this.action);
      },
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(result, 'isSecurityAction', {
      get: function() {
        return ['security_violation', 'suspicious_activity', 'lockout', 'unlock'].includes(this.action);
      },
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(result, 'isDataAction', {
      get: function() {
        return ['export', 'import', 'backup', 'restore'].includes(this.action);
      },
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(result, 'isConfigAction', {
      get: function() {
        return ['config_change', 'system_update', 'maintenance'].includes(this.action);
      },
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(result, 'actionType', {
      get: function() {
        if (this.isCreateAction) return 'create';
        if (this.isUpdateAction) return 'update';
        if (this.isDeleteAction) return 'delete';
        if (this.isAuthAction) return 'auth';
        if (this.isPermissionAction) return 'permission';
        if (this.isSecurityAction) return 'security';
        if (this.isDataAction) return 'data';
        if (this.isConfigAction) return 'config';
        return 'unknown';
      },
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(result, 'severity', {
      get: function() {
        if (this.isFailure || this.isSecurityAction) return 'high';
        if (this.isSensitive || this.isDeleteAction) return 'medium';
        return 'low';
      },
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(result, 'summary', {
      get: function() {
        return `${this.action.toUpperCase()} ${this.entityType} (${this.entityName}) - ${this.description}`;
      },
      enumerable: false,
      configurable: false
    });

    Object.defineProperty(result, 'duration', {
      get: function() {
        return this.completedAt ? this.completedAt.getTime() - this.createdAt.getTime() : null;
      },
      enumerable: false,
      configurable: false
    });

    return result;
  }
}
// Mock Database Service