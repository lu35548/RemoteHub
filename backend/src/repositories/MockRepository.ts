import { Repository, FindManyOptions, FindOneOptions, DeepPartial, EntityTarget, FindOptionsWhere, FindOptionsOrder, DeleteResult, UpdateResult, ObjectId } from 'typeorm';
import { logger } from '../utils/logger';

/**
 * Mock Repository Implementation
 *
 * 遵循TypeORM Repository接口规范
 * 支持完整的CRUD操作和复杂查询
 * 在内存中持久化数据
 */
export class MockRepository<T> implements Partial<Repository<T>> {
  private data: Map<string, T> = new Map();
  private entityName: string;
  private idCounter: number = 1;

  constructor(entityName: string) {
    this.entityName = entityName;
  }

  /**
   * 查找所有实体
   */
  async find(options?: FindManyOptions<T>): Promise<T[]> {
    logger.debug(`MockRepository[${this.entityName}] - Find called with options:`, options);

    let results = Array.from(this.data.values());

    // 应用where条件
    if (options?.where) {
      results = results.filter(item => this.matchesWhere(item, options.where));
    }

    // 应用排序
    if (options?.order) {
      results = this.applyOrder(results, options.order);
    }

    // 应用分页
    if (options?.skip || options?.take) {
      const skip = options.skip || 0;
      const take = options.take || results.length;
      results = results.slice(skip, skip + take);
    }

    // 应用select
    if (options?.select) {
      results = results.map(item => this.applySelect(item, options.select));
    }

    logger.debug(`MockRepository[${this.entityName}] - Found ${results.length} results`);
    return results;
  }

  /**
   * 查找单个实体
   */
  async findOne(options?: FindOneOptions<T>): Promise<T | null> {
    logger.debug(`MockRepository[${this.entityName}] - FindOne called with options:`, options);

    if (!options?.where) {
      return Array.from(this.data.values())[0] || null;
    }

    const results = Array.from(this.data.values()).filter(item =>
      this.matchesWhere(item, options.where!)
    );

    // 应用select
    if (options?.select) {
      return results.length > 0 ? this.applySelect(results[0], options.select) : null;
    }

    return results[0] || null;
  }

  /**
   * 根据条件查找
   */
  async findOneBy(where: FindOptionsWhere<T>): Promise<T | null> {
    const results = Array.from(this.data.values()).filter(item =>
      this.matchesWhere(item, where)
    );
    return results[0] || null;
  }

  /**
   * 查找并计数
   */
  async findAndCount(options?: FindManyOptions<T>): Promise<[T[], number]> {
    const entities = await this.find(options);
    const count = await this.count({ where: options?.where });
    return [entities, count];
  }

  /**
   * 创建实体实例
   */
  create(): T;
  create(entityLike: DeepPartial<T>): T;
  create(entityLikeArray: DeepPartial<T>[]): T[];
  create(data?: DeepPartial<T> | DeepPartial<T>[]): T | T[] {
    // 如果没有参数，返回空对象
    if (!data) {
      return {} as T;
    }

    // 如果是数组
    if (Array.isArray(data)) {
      return data.map(item => {
        const counter = this.idCounter++;
        return {
          ...item,
          id: (item as any).id || counter.toString(),
          createdAt: new Date(),
          updatedAt: new Date()
        } as T;
      });
    }

    // 单个对象
    const counter = this.idCounter++;
    const item = {
      ...data,
      id: (data as any).id || counter.toString(),
      createdAt: new Date(),
      updatedAt: new Date()
    } as T;
    return item;
  }

  /**
   * 保存实体（创建或更新）
   */
  async save<Entity extends DeepPartial<T>>(entity: Entity): Promise<Entity & T> {
    logger.debug(`MockRepository[${this.entityName}] - Save called with:`, { id: (entity as any).id });

    const entityWithId = entity as any;
    const isNew = !entityWithId.id;

    if (isNew) {
      // 创建新实体
      entityWithId.id = this.generateId();
      entityWithId.createdAt = new Date();
      entityWithId.updatedAt = new Date();

      this.data.set(String(entityWithId.id), entityWithId);
      logger.debug(`MockRepository[${this.entityName}] - Created entity with ID: ${entityWithId.id}`);
    } else {
      // 更新现有实体
      const existing = this.data.get(String(entityWithId.id));
      if (existing) {
        entityWithId.createdAt = (existing as any).createdAt;
        entityWithId.updatedAt = new Date();
      } else {
        entityWithId.createdAt = new Date();
        entityWithId.updatedAt = new Date();
      }

      this.data.set(String(entityWithId.id), { ...existing, ...entityWithId });
      logger.debug(`MockRepository[${this.entityName}] - Updated entity with ID: ${entityWithId.id}`);
    }

    return entityWithId as Entity & T;
  }

  /**
   * 根据条件删除实体
   */
  async delete(criteria: string | number | FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<DeleteResult> {
    let deletedCount = 0;

    if (typeof criteria === 'object' && criteria !== null && !Array.isArray(criteria)) {
      // 复杂条件删除
      const entities = await this.find({ where: criteria });
      for (const entity of entities) {
        if (this.data.delete(String((entity as any).id))) {
          deletedCount++;
        }
      }
    } else if (Array.isArray(criteria)) {
      // 数组条件删除
      for (const crit of criteria) {
        if (typeof crit === 'object' && crit !== null) {
          const entities = await this.find({ where: crit });
          for (const entity of entities) {
            if (this.data.delete(String((entity as any).id))) {
              deletedCount++;
            }
          }
        } else {
          if (this.data.delete(String(crit))) {
            deletedCount++;
          }
        }
      }
    } else {
      // 根据ID删除
      if (this.data.delete(String(criteria))) {
        deletedCount = 1;
      }
    }

    return {
      raw: [],
      affected: deletedCount
    };
  }

  /**
   * 根据条件软删除实体
   */
  async softDelete(criteria: string | number | FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<UpdateResult> {
    const entities = await this.find({ where: Array.isArray(criteria) ? criteria : criteria as any });
    let updatedCount = 0;

    for (const entity of entities) {
      const entityWithId = entity as any;
      entityWithId.deletedAt = new Date();
      entityWithId.updatedAt = new Date();
      this.data.set(String(entityWithId.id), entityWithId);
      updatedCount++;
    }

    return {
      raw: [],
      affected: updatedCount,
      generatedMaps: []
    };
  }

  /**
   * 恢复软删除的实体
   */
  async restore(criteria: string | number | FindOptionsWhere<T> | FindOptionsWhere<T>[]): Promise<UpdateResult> {
    const entities = await this.find({ where: Array.isArray(criteria) ? criteria : criteria as any });
    let updatedCount = 0;

    for (const entity of entities) {
      const entityWithId = entity as any;
      delete entityWithId.deletedAt;
      entityWithId.updatedAt = new Date();
      this.data.set(String(entityWithId.id), entityWithId);
      updatedCount++;
    }

    return {
      raw: [],
      affected: updatedCount,
      generatedMaps: []
    };
  }

  /**
   * 计算实体数量
   */
  async count(options?: FindOneOptions<T>): Promise<number> {
    if (!options?.where) {
      return this.data.size;
    }

    const entities = Array.from(this.data.values()).filter(item =>
      this.matchesWhere(item, options.where!)
    );
    return entities.length;
  }

  /**
   * 生成新ID
   */
  private generateId(): string {
    return String(this.idCounter++);
  }

  /**
   * 匹配where条件
   */
  private matchesWhere(item: any, where: any): boolean {
    if (!where) return true;

    for (const [key, value] of Object.entries(where)) {
      if (typeof value === 'object' && value !== null) {
        // 处理操作符
        if ('$eq' in value) {
          if (item[key] !== value.$eq) return false;
        } else if ('$ne' in value) {
          if (item[key] === value.$ne) return false;
        } else if ('$in' in value) {
          const arr = value.$in as any[];
          if (!Array.isArray(arr) || !arr.includes(item[key])) return false;
        } else if ('$nin' in value) {
          const arr = value.$nin as any[];
          if (Array.isArray(arr) && arr.includes(item[key])) return false;
        } else if ('$gt' in value) {
          if (item[key] <= value.$gt) return false;
        } else if ('$gte' in value) {
          if (item[key] < value.$gte) return false;
        } else if ('$lt' in value) {
          if (item[key] >= value.$lt) return false;
        } else if ('$lte' in value) {
          if (item[key] > value.$lte) return false;
        } else if ('$like' in value) {
          const regex = new RegExp(String(value.$like).replace(/%/g, '.*'), 'i');
          if (!regex.test(String(item[key]))) return false;
        } else if ('$ilike' in value) {
          const regex = new RegExp(String(value.$ilike).replace(/%/g, '.*'), 'i');
          if (!regex.test(String(item[key]))) return false;
        } else if ('$between' in value) {
          const [min, max] = value.$between as any[];
          if (item[key] < min || item[key] > max) return false;
        }
      } else {
        // 简单相等比较
        if (item[key] !== value) return false;
      }
    }

    return true;
  }

  /**
   * 应用排序
   */
  private applyOrder(items: T[], order: FindOptionsOrder<T>): T[] {
    // 简化实现，只处理第一个排序字段
    const firstKey = Object.keys(order)[0];
    if (!firstKey) return items;

    const direction = order[firstKey as keyof T];
    const isAsc = direction !== 'DESC';

    return items.sort((a, b) => {
      const aVal = (a as any)[firstKey];
      const bVal = (b as any)[firstKey];

      if (aVal < bVal) return isAsc ? -1 : 1;
      if (aVal > bVal) return isAsc ? 1 : -1;
      return 0;
    });
  }

  /**
   * 应用字段选择
   */
  private applySelect(item: T, select: any): any {
    if (Array.isArray(select)) {
      const selected: any = {};
      const itemObj = item as any;
      select.forEach(field => {
        if (field in itemObj) {
          selected[field] = itemObj[field];
        }
      });
      return selected;
    }
    return item;
  }

  /**
   * 清空所有数据
   */
  async clear(): Promise<void> {
    this.data.clear();
    this.idCounter = 1;
    logger.debug(`MockRepository[${this.entityName}] - Cleared all data`);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      entityName: this.entityName,
      count: this.data.size,
      nextId: this.idCounter
    };
  }
}

/**
 * Mock Repository 工厂
 */
export class MockRepositoryFactory {
  private static repositories = new Map<string, MockRepository<any>>();

  /**
   * 获取Repository实例
   */
  static getRepository<T>(entity: any): MockRepository<T> {
    const entityName = this.getEntityName(entity);

    if (!this.repositories.has(entityName)) {
      this.repositories.set(entityName, new MockRepository<T>(entityName));
    }

    return this.repositories.get(entityName) as MockRepository<T>;
  }

  /**
   * 获取实体名称
   */
  private static getEntityName(entity: any): string {
    // TypeORM实体名称映射
    const entityMap: Record<string, string> = {
      'User': 'User',
      'Project': 'Project',
      'Connection': 'Connection',
      'ProjectConnection': 'ProjectConnection',
      'ProjectMember': 'ProjectMember',
      'AuditLog': 'AuditLog'
    };

    // 获取实体名称
    if (typeof entity === 'string') {
      return entityMap[entity] || entity;
    }

    const name = entity.name || entity.constructor?.name;
    return entityMap[name] || name || 'Unknown';
  }

  /**
   * 清空所有Repository
   */
  static clearAll(): void {
    for (const [key, repo] of this.repositories.entries()) {
      repo.clear();
    }
    this.repositories.clear();
  }

  /**
   * 获取所有Repository的统计信息
   */
  static getAllStats() {
    const stats: any = {};
    for (const [key, repo] of this.repositories.entries()) {
      stats[key] = repo.getStats();
    }
    return stats;
  }
}