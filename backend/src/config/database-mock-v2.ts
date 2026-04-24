import { logger } from '../utils/logger';

/**
 * Mock Database Service - Repository Pattern Implementation
 *
 * 这个实现遵循以下原则：
 * 1. 真实模拟TypeORM Repository接口
 * 2. 支持事务和关系
 * 3. 数据持久化在内存中
 * 4. 支持复杂的查询操作
 */
export class MockDatabaseServiceV2 {
  private static instance: MockDatabaseServiceV2;
  private data: Map<string, any[]> = new Map();
  private relations: Map<string, Map<string, any[]>> = new Map();
  private initialized = false;
  private idCounters: Map<string, number> = new Map();

  private constructor() {}

  public static getInstance(): MockDatabaseServiceV2 {
    if (!MockDatabaseServiceV2.instance) {
      MockDatabaseServiceV2.instance = new MockDatabaseServiceV2();
    }
    return MockDatabaseServiceV2.instance;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing Mock Database Service V2');

    // 初始化用户数据
    await this.initializeUsers();

    // 初始化项目数据
    await this.initializeProjects();

    // 初始化连接数据
    await this.initializeConnections();

    this.initialized = true;
  }

  private async initializeUsers(): Promise<void> {
    const users = this.data.get('users') || [];

    if (users.length === 0) {
      // 默认管理员用户
      const adminUser = {
        id: '1',
        username: 'admin',
        email: 'admin@example.com',
        password: '$2b$10$L3v7t3GIHblgkL8H7QGpwOH38JMOkzHUxTOkJeEpUXjVwqhBWdU2S',
        firstName: 'System',
        lastName: 'Administrator',
        role: 'admin',
        status: 'ACTIVE',
        emailVerified: true,
        avatar: null,
        bio: null,
        phone: null,
        loginAttempts: 0,
        lockedUntil: null,
        tokenVersion: 0,
        preferences: null,
        twoFactorEnabled: false,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
        passwordChangedAt: null,
        passwordResetToken: null,
        passwordResetExpiresAt: null,
        passwordResetRequestedAt: null,
        twoFactorSecret: null,
        backupCodes: null
      };

      users.push(adminUser);
      this.data.set('users', users);
      this.idCounters.set('users', 2);

      logger.info('Created default admin user (admin / admin123)');
    }
  }

  private async initializeProjects(): Promise<void> {
    const projects = this.data.get('projects') || [];
    if (projects.length === 0) {
      this.data.set('projects', projects);
      this.idCounters.set('projects', 1);
    }
  }

  private async initializeConnections(): Promise<void> {
    const connections = this.data.get('connections') || [];
    if (connections.length === 0) {
      this.data.set('connections', connections);
      this.idCounters.set('connections', 1);
    }
  }

  // Repository接口实现
  public getRepository(entity: any) {
    const entityName = this.getEntityName(entity);

    return {
      // 查找方法
      find: async (options?: any) => {
        const data = this.data.get(entityName) || [];
        let result = [...data];

        // 应用where条件
        if (options?.where) {
          result = result.filter(item => {
            return this.matchWhere(item, options.where);
          });
        }

        // 应用排序
        if (options?.order) {
          result = this.applyOrder(result, options.order);
        }

        // 应用分页
        if (options?.skip || options?.take) {
          const skip = options.skip || 0;
          const take = options.take || result.length;
          result = result.slice(skip, skip + take);
        }

        // 应用select
        if (options?.select) {
          result = result.map(item => {
            const selected: any = {};
            options.select.forEach((field: string) => {
              if (field in item) {
                selected[field] = item[field];
              }
            });
            return selected;
          });
        }

        return result;
      },

      // 查找单个
      findOne: async (options?: any) => {
        const data = this.data.get(entityName) || [];
        let result = null;

        if (options?.where) {
          result = data.find(item => {
            return this.matchWhere(item, options.where);
          });
        } else if (data.length > 0) {
          result = data[0];
        }

        return result || null;
      },

      // 查找并计数
      findAndCount: async (options?: any) => {
        const data = this.data.get(entityName) || [];
        let result = [...data];

        // 应用where条件
        if (options?.where) {
          result = result.filter(item => {
            return this.matchWhere(item, options.where);
          });
        }

        const total = result.length;

        // 应用排序
        if (options?.order) {
          result = this.applyOrder(result, options.order);
        }

        // 应用分页
        if (options?.skip || options?.take) {
          const skip = options.skip || 0;
          const take = options.take || result.length;
          result = result.slice(skip, skip + take);
        }

        return [result, total];
      },

      // 创建
      create: (data: any) => {
        const tableName = entityName;
        const counter = this.idCounters.get(tableName) || 1;

        const item = {
          ...data,
          id: data.id || counter.toString(),
          createdAt: new Date(),
          updatedAt: new Date()
        };

        // 更新计数器
        this.idCounters.set(tableName, counter + 1);

        return item;
      },

      // 保存
      save: async (entity: any) => {
        const tableName = entityName;
        const data = this.data.get(tableName) || [];

        if (entity.id) {
          // 更新现有记录
          const index = data.findIndex(item => item.id === entity.id);
          if (index >= 0) {
            data[index] = {
              ...data[index],
              ...entity,
              updatedAt: new Date()
            };
          } else {
            // 新记录
            const newItem = {
              ...entity,
              createdAt: new Date(),
              updatedAt: new Date()
            };
            data.push(newItem);
          }
        } else {
          // 新记录
          const counter = this.idCounters.get(tableName) || 1;
          const newItem = {
            ...entity,
            id: counter.toString(),
            createdAt: new Date(),
            updatedAt: new Date()
          };
          data.push(newItem);
          this.idCounters.set(tableName, counter + 1);
        }

        this.data.set(tableName, data);
        return entity;
      },

      // 更新
      update: async (id: string, data: any) => {
        const tableName = entityName;
        const items = this.data.get(tableName) || [];
        const index = items.findIndex(item => item.id === id);

        if (index >= 0) {
          items[index] = {
            ...items[index],
            ...data,
            updatedAt: new Date()
          };
          this.data.set(tableName, items);
          return { affected: 1 };
        }

        return { affected: 0 };
      },

      // 删除
      remove: async (entity: any) => {
        const tableName = entityName;
        const data = this.data.get(tableName) || [];
        const index = data.findIndex(item => item.id === entity.id);

        if (index >= 0) {
          data.splice(index, 1);
          this.data.set(tableName, data);
        }

        return entity;
      },

      // 计数
      count: async (options?: any) => {
        const data = this.data.get(entityName) || [];
        let result = data;

        if (options?.where) {
          result = result.filter(item => {
            return this.matchWhere(item, options.where);
          });
        }

        return result.length;
      }
    };
  }

  private getEntityName(entity: any): string {
    // TypeORM实体名称映射
    const entityMap: Record<string, string> = {
      'User': 'users',
      'Project': 'projects',
      'Connection': 'connections',
      'ProjectConnection': 'project_connections',
      'ProjectMember': 'project_members',
      'AuditLog': 'audit_logs'
    };

    // 获取实体名称
    if (typeof entity === 'string') {
      return entityMap[entity] || entity.toLowerCase();
    }

    const name = entity.name || entity.constructor?.name;
    return entityMap[name] || name?.toLowerCase() || 'unknown';
  }

  private matchWhere(item: any, where: any): boolean {
    if (!where) return true;

    for (const [key, value] of Object.entries(where)) {
      if (typeof value === 'object' && value !== null) {
        // 处理特殊操作符
        if ('$eq' in value) {
          if (item[key] !== value.$eq) return false;
        } else if ('$ne' in value) {
          if (item[key] === value.$ne) return false;
        } else if ('$in' in value) {
          if (!Array.isArray(value.$in) || !value.$in.includes(item[key])) return false;
        } else if ('$nin' in value) {
          if (!Array.isArray(value.$nin) || value.$nin.includes(item[key])) return false;
        } else if ('$gt' in value) {
          if (item[key] <= value.$gt) return false;
        } else if ('$gte' in value) {
          if (item[key] < value.$gte) return false;
        } else if ('$lt' in value) {
          if (item[key] >= value.$lt) return false;
        } else if ('$lte' in value) {
          if (item[key] > value.$lte) return false;
        } else if ('$like' in value) {
          if (typeof value.$like !== 'string') return false;
          const regex = new RegExp(value.$like.replace(/%/g, '.*'), 'i');
          if (!regex.test(String(item[key]))) return false;
        } else if ('$ilike' in value) {
          if (typeof value.$ilike !== 'string') return false;
          const regex = new RegExp(value.$ilike.replace(/%/g, '.*'), 'i');
          if (!regex.test(String(item[key]))) return false;
        } else if ('$between' in value) {
          if (!Array.isArray(value.$between) || value.$between.length !== 2) return false;
          const [min, max] = value.$between;
          if (item[key] < min || item[key] > max) return false;
        }
      } else {
        // 简单相等比较
        if (item[key] !== value) return false;
      }
    }

    return true;
  }

  private applyOrder(data: any[], order: string): any[] {
    const [field, direction] = order.split(' ');
    const isAsc = direction.toUpperCase() === 'ASC';

    return data.sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (aVal < bVal) return isAsc ? -1 : 1;
      if (aVal > bVal) return isAsc ? 1 : -1;
      return 0;
    });
  }

  // 健康检查
  public async healthCheck(): Promise<{ status: string; details?: any }> {
    return {
      status: 'ok',
      details: {
        initialized: this.initialized,
        tables: Array.from(this.data.keys()),
        recordCounts: Object.fromEntries(
          Array.from(this.data.entries()).map(([key, value]) => [key, value.length])
        )
      }
    };
  }

  // 重置数据
  public async reset(): Promise<void> {
    this.data.clear();
    this.relations.clear();
    this.idCounters.clear();
    this.initialized = false;
    await this.initialize();
  }
}

// 导出单例实例
export const mockDatabase = MockDatabaseServiceV2.getInstance();