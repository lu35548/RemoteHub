/**
 * Mock better-sqlite3 module
 * 用于避免在开发环境中安装原生依赖
 * 当使用Mock数据库时，此模块提供兼容的接口
 */

class MockDatabase {
  private data: Map<string, any[]> = new Map();

  prepare(sql: string) {
    return new MockStatement(this.data, sql);
  }

  exec(sql: string): void {
    console.log(`[Mock SQLite] Exec: ${sql}`);
  }

  close(): void {
    this.data.clear();
  }
}

class MockStatement {
  private data: Map<string, any[]>;
  private sql: string;

  constructor(data: Map<string, any[]>, sql: string) {
    this.data = data;
    this.sql = sql;
  }

  run(...params: any[]): { lastInsertRowid: number, changes: number } {
    console.log(`[Mock SQLite] Run: ${this.sql}`, params);
    return { lastInsertRowid: Math.floor(Math.random() * 1000), changes: 1 };
  }

  get(...params: any[]): any {
    console.log(`[Mock SQLite] Get: ${this.sql}`, params);
    return null;
  }

  all(...params: any[]): any[] {
    console.log(`[Mock SQLite] All: ${this.sql}`, params);
    return [];
  }

  iterate(...params: any[]): Iterable<any> {
    console.log(`[Mock SQLite] Iterate: ${this.sql}`, params);
    return [];
  }
}

// 导出兼容的接口
export function Database(filename: string): MockDatabase {
  console.log(`[Mock SQLite] Opening database: ${filename}`);
  return new MockDatabase();
}

export const OPEN_READONLY = 1;
export const OPEN_READWRITE = 2;
export const OPEN_CREATE = 4;

export default {
  Database,
  OPEN_READONLY,
  OPEN_READWRITE,
  OPEN_CREATE
};