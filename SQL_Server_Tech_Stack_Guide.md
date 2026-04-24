# SQL Server 技术栈集成指南
*RemoteHub 项目数据库支持文档*

## 概述

本文档提供 RemoteHub 项目集成 Microsoft SQL Server 所需的技术栈信息，包括最新的包版本、配置方法和最佳实践。

## 技术栈选择

### 1. TypeORM - ORM 框架
- **官方仓库**: [typeorm/typeorm](https://github.com/typeorm/typeorm)
- **Context7 ID**: `/typeorm/typeorm`
- **当前推荐版本**: ^0.3.20
- **SQL Server 支持**: 完整支持，基于 tedious 驱动

### 2. node-mssql - SQL Server 驱动
- **官方仓库**: [tediousjs/node-mssql](https://github.com/tediousjs/node-mssql)
- **Context7 ID**: `/tediousjs/node-mssql`
- **当前推荐版本**: ^10.0.2
- **特性**:
  - 完整的 SQL Server 功能支持
  - 连接池管理
  - 事务支持
  - 流式查询
  - Azure SQL 兼容

### 3. tedious - 底层 TDS 协议实现
- **自动依赖**: node-mssql 的依赖项
- **无需单独安装**: 通过 node-mssql 自动管理
- **特性**:
  - TDS 协议完整实现
  - Windows 认证支持
  - SSL/TLS 加密
  - 故障转移支持

## 安装命令

```bash
# TypeORM 核心
npm install typeorm@^0.3.20

# SQL Server 驱动
npm install mssql@^10.0.2

# TypeScript 支持（如果还未安装）
npm install -D @types/node
```

## 配置详解

### TypeORM 数据源配置

```typescript
import { DataSource } from "typeorm";

export const AppDataSource = new DataSource({
    type: "mssql",  // 数据库类型
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT) || 1433,
    username: process.env.DB_USERNAME || "sa",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "RemoteHub",

    // Schema 设置
    schema: "dbo",  // 默认 schema

    // 连接选项
    options: {
        encrypt: true,  // Azure 需要，本地开发可设为 false
        trustServerCertificate: false,  // 生产环境应保持 false
        enableArithAbort: true,
        useUTC: false,  // 使用本地时区

        // 连接超时设置
        connectionTimeout: 15000,
        requestTimeout: 15000,

        // 调试选项（开发环境）
        debug: false,
        packetSize: 4096,

        // TDS 版本
        tdsVersion: "7_4",

        // 应用程序名称
        appName: "RemoteHub",

        // 只读意图（用于 Always On 可用性组）
        readOnlyIntent: false,

        // 多子网故障转移（用于 Always On 可用性组）
        multiSubnetFailover: false,
    },

    // 连接池配置
    pool: {
        max: 10,  // 最大连接数
        min: 2,   // 最小连接数
        acquireTimeoutMillis: 30000,
        idleTimeoutMillis: 30000,
    },

    // 实体和迁移
    entities: ["src/models/**/*.ts"],
    migrations: ["src/migrations/**/*.ts"],
    subscribers: ["src/subscribers/**/*.ts"],

    // 同步设置（仅开发环境）
    synchronize: process.env.NODE_ENV === "development",

    // 日志设置
    logging: process.env.NODE_ENV === "development" ? ["query", "error"] : ["error"],

    // 其他选项
    migrationsRun: false,
    dropSchema: false,
});
```

### 环境变量配置

创建 `.env` 文件：

```env
# SQL Server 配置
DB_TYPE=mssql
DB_HOST=localhost
DB_PORT=1433
DB_USERNAME=sa
DB_PASSWORD=YourStrongPassword!
DB_NAME=RemoteHub
DB_SCHEMA=dbo

# 连接选项
DB_ENCRYPT=false
DB_TRUST_CERTIFICATE=false

# 应用环境
NODE_ENV=development
```

## 支持的 SQL Server 版本

- **SQL Server 2019** - 完全支持
- **SQL Server 2022** - 完全支持，推荐使用
- **Azure SQL Database** - 完全支持，需要配置加密
- **SQL Server 2017** - 支持，但不推荐用于新项目
- **SQL Server 2016 及更早** - 基础支持

## 连接字符串格式

TypeORM 支持多种连接方式：

### 1. 配置对象方式（推荐）

```typescript
const config = {
    type: "mssql",
    host: "localhost",
    port: 1433,
    username: "sa",
    password: "password",
    database: "RemoteHub",
};
```

### 2. 连接字符串方式

```typescript
const config = "mssql://sa:password@localhost:1433/RemoteHub?encrypt=false";
```

### 3. Windows 认证

```typescript
const config = {
    type: "mssql",
    host: "localhost",
    port: 1433,
    database: "RemoteHub",
    domain: "YOUR_DOMAIN",  // Windows 域
    options: {
        trustedConnection: true,  // 使用 Windows 认证
    },
};
```

## 实体定义示例

```typescript
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

@Entity("users")
export class User {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "nvarchar", length: 100, unique: true })
    email: string;

    @Column({ type: "nvarchar", length: 100 })
    name: string;

    @Column({ type: "nvarchar", length: 255, select: false })
    password: string;

    @Column({ type: "nvarchar", length: 20, default: "user" })
    role: string;

    @Column({ type: "bit", default: true })
    isActive: boolean;

    @CreateDateColumn({ type: "datetime2" })
    createdAt: Date;

    @UpdateDateColumn({ type: "datetime2" })
    updatedAt: Date;
}
```

## SQL Server 特定数据类型映射

| TypeScript | SQL Server | TypeORM 装饰器 |
|------------|------------|----------------|
| string | nvarchar(max) | `@Column({ type: "nvarchar" })` |
| string(100) | nvarchar(100) | `@Column({ type: "nvarchar", length: 100 })` |
| number | int | `@Column({ type: "int" })` |
| number (大数) | bigint | `@Column({ type: "bigint" })` |
| boolean | bit | `@Column({ type: "bit" })` |
| Date | datetime2 | `@Column({ type: "datetime2" })` |
| Buffer | varbinary(max) | `@Column({ type: "varbinary" })` |
| JSON | nvarchar(max) | `@Column({ type: "nvarchar" })` (需序列化) |
| UUID | uniqueidentifier | `@Column({ type: "uniqueidentifier" })` |

## 高级配置

### 1. 连接池优化

```typescript
pool: {
    max: 20,  // 高并发环境可增加
    min: 5,   // 保持一定数量的热连接
    acquireTimeoutMillis: 60000,  // 获取连接超时
    idleTimeoutMillis: 300000,    // 空闲超时（5分钟）
    createTimeoutMillis: 30000,   // 创建连接超时
    destroyTimeoutMillis: 5000,   // 销毁连接超时
}
```

### 2. 事务隔离级别

```typescript
import { DataSource } from "typeorm";

const dataSource = new DataSource({
    // ... 其他配置
    options: {
        isolationLevel: "READ_COMMITTED",  // 默认
        // 可选值: READ_UNCOMMITTED, READ_COMMITTED, REPEATABLE_READ, SERIALIZABLE, SNAPSHOT
    }
});
```

### 3. 重试和故障转移

```typescript
const config = {
    type: "mssql",
    host: "primary-server",
    // 配置故障转移伙伴
    replication: {
        master: {
            host: "primary-server",
            // ... 主服务器配置
        },
        slaves: [
            {
                host: "secondary-server",
                // ... 从服务器配置
            }
        ],
        failover: true,
    },
};
```

## 性能优化建议

### 1. 查询优化

```typescript
// 使用索引提示
const users = await userRepository
    .createQueryBuilder("user")
    .useIndex("IX_User_Email")
    .where("user.email = :email", { email })
    .getMany();

// 批量操作
await userRepository
    .createQueryBuilder()
    .insert()
    .into(User)
    .values(userArray)
    .execute();
```

### 2. 连接池监控

```typescript
// 获取连接池状态
const pool = AppDataSource.driver.master.pool;
console.log("Active connections:", pool.numUsed());
console.log("Idle connections:", pool.numFree());
console.log("Waiting clients:", pool.numPendingAcquires());
```

## 常见问题解决

### 1. 连接超时

```typescript
// 增加超时时间
options: {
    connectionTimeout: 60000,  // 60秒
    requestTimeout: 60000,     // 60秒
}
```

### 2. 加密连接问题

```typescript
// 开发环境禁用加密
options: {
    encrypt: false,
    trustServerCertificate: true,  // 仅用于开发环境
}
```

### 3. Windows 认证

```typescript
// 使用 Windows 集成认证
const config = {
    type: "mssql",
    host: "localhost",
    database: "RemoteHub",
    options: {
        trustedConnection: true,
        domain: process.env.USERDOMAIN,  // 自动获取域
    },
};
```

## 安全最佳实践

### 1. 参数化查询

```typescript
// ✅ 正确：使用参数化查询
const user = await userRepository
    .createQueryBuilder()
    .where("email = :email", { email })
    .getOne();

// ❌ 错误：直接拼接 SQL
const query = `SELECT * FROM users WHERE email = '${email}'`;
```

### 2. 密码加密

```typescript
import bcrypt from 'bcryptjs';

// 加密存储
const hashedPassword = await bcrypt.hash(password, 10);

// 验证密码
const isValid = await bcrypt.compare(plainPassword, hashedPassword);
```

### 3. 最小权限原则

```sql
-- 为应用创建专用用户，只授予必要权限
CREATE LOGIN RemoteHubApp WITH PASSWORD = 'StrongPassword!';
CREATE USER RemoteHubUser FROM LOGIN RemoteHubApp;

-- 授予必要权限
ALTER ROLE db_datareader ADD MEMBER RemoteHubUser;
ALTER ROLE db_datawriter ADD MEMBER RemoteHubUser;
```

## 部署注意事项

### 1. 生产环境配置

```typescript
const productionConfig = {
    type: "mssql",
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,

    options: {
        encrypt: true,  // 生产环境必须启用加密
        trustServerCertificate: false,
        enableArithAbort: true,

        // 连接池配置
        pool: {
            max: 50,
            min: 5,
            acquireTimeoutMillis: 30000,
            idleTimeoutMillis: 300000,
        },
    },

    // 关闭同步
    synchronize: false,

    // 只记录错误日志
    logging: ["error"],
};
```

### 2. Docker 部署

```dockerfile
# 使用官方 Node.js 镜像
FROM node:18-alpine

# 安装 SQL Server 客户端工具
RUN apk add --no-cache \
    py-pip \
    gcc \
    g++ \
    make \
    python3 \
    && pip3 install mssql-cli

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 暴露端口
EXPOSE 3000

# 启动命令
CMD ["npm", "start"]
```

## 监控和日志

### 1. 连接监控

```typescript
// 监听连接事件
AppDataSource.driver.master.pool.on('acquire', () => {
    console.log('Connection acquired');
});

AppDataSource.driver.master.pool.on('release', () => {
    console.log('Connection released');
});
```

### 2. 慢查询日志

```typescript
// 记录慢查询
const config = {
    // ... 其他配置
    logging: ["query", "error"],
    maxQueryExecutionTime: 1000,  // 超过1秒的查询记录日志
};
```

## 迁移指南

### 从 MySQL 迁移到 SQL Server

1. **数据类型转换**

```typescript
// MySQL -> SQL Server
VARCHAR -> NVARCHAR  // 支持Unicode
TEXT -> NVARCHAR(MAX)
LONGTEXT -> NVARCHAR(MAX)
DATETIME -> DATETIME2
TINYINT(1) -> BIT
```

2. **自增主键**

```typescript
// MySQL
@Column({ autoIncrement: true })
id: number;

// SQL Server
@PrimaryGeneratedColumn()
id: number;
```

3. **索引创建**

```sql
-- MySQL
CREATE INDEX idx_name ON table_name(column_name);

-- SQL Server
CREATE INDEX idx_name ON table_name(column_name);
```

## 测试配置

### Jest 测试数据库

```typescript
// test/database.ts
import { DataSource } from "typeorm";

export const testDataSource = new DataSource({
    type: "mssql",
    host: "localhost",
    port: 1433,
    username: "sa",
    password: "TestPassword123!",
    database: "RemoteHub_Test",
    entities: ["src/models/**/*.ts"],
    synchronize: true,  // 测试环境可以启用
    logging: false,
});

// 测试设置
beforeAll(async () => {
    await testDataSource.initialize();
});

afterAll(async () => {
    await testDataSource.destroy();
});

beforeEach(async () => {
    // 清理测试数据
    await testDataSource.query("DELETE FROM users");
    await testDataSource.query("DELETE FROM projects");
});
```

## 版本更新记录

### 重要更新（2024年）
- **TypeORM 0.3.20** (2024-06-24): 修复 MSSQL CVE 安全漏洞
- **mssql 10.0.2** (2024-07-01): 性能优化和新特性
- **tedious 最新版本**: 自动随 mssql 安装

### 升级建议

```bash
# 检查当前版本
npm list typeorm mssql

# 升级到最新版本
npm install typeorm@latest mssql@latest
```

## 参考资源

- [TypeORM 官方文档](https://typeorm.io/)
- [node-mssql GitHub](https://github.com/tediousjs/node-mssql)
- [Microsoft SQL Server 文档](https://docs.microsoft.com/en-us/sql/)
- [tedious 文档](https://tediousjs.github.io/node-mssql/)

## 总结

SQL Server 与 TypeORM 的集成提供了强大的企业级数据库支持。通过正确的配置和优化，可以构建高性能、可扩展的应用程序。建议在生产环境中使用最新稳定版本，并遵循安全最佳实践。

---

*最后更新：2024年12月*