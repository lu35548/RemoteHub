# RemoteHub Backend API

一个功能完整的企业级后端API，为RemoteHub远程协作平台提供用户管理、项目管理、连接管理、安全监控、数据备份等核心功能。

## 🚀 功能特性

### ✅ 已完成功能

#### 核心功能
- **用户管理**: 完整的用户注册、认证、权限管理系统
- **项目管理**: 项目CRUD操作、成员管理、权限控制
- **连接管理**: 多协议连接支持、分组管理、连接测试
- **审计日志**: 完整的操作审计、数据变更追踪

#### 高级功能 (Task 6.1-6.6)
- **🔗 用户在线状态跟踪**: 实时WebSocket连接、在线状态广播
- **📊 审计日志系统**: 自动数据变更记录、合规性支持
- **📤 数据导出功能**: 多格式导出(JSON/CSV/XLSX)、流式处理
- **🛡️ 速率限制和安全增强**: 多层安全防护、智能威胁检测
- **💾 备份和恢复功能**: 加密备份、选择性恢复、自动化计划
- **📈 监控和健康检查**: 系统监控、性能分析、K8s探针支持

## 🏗️ 技术架构

### 技术栈
- **运行时**: Node.js + TypeScript
- **框架**: Express.js
- **数据库**: TypeORM + SQL Server/MySQL/PostgreSQL
- **认证**: JWT + bcrypt
- **实时通信**: Socket.IO
- **文档**: OpenAPI 3.0 (Swagger)
- **日志**: Winston
- **监控**: 自定义监控系统

### 架构设计
```
┌─────────────────────────────────────────┐
│                API Gateway              │
│        (Express + Middleware)           │
├─────────────────────────────────────────┤
│  Security  │  Rate Limit  │  Monitoring  │
├─────────────────────────────────────────┤
│            Business Logic               │
│    (Services + Controllers)             │
├─────────────────────────────────────────┤
│          Data Access Layer              │
│      (TypeORM + Repositories)           │
├─────────────────────────────────────────┤
│            Database Layer                │
│    (SQL Server/MySQL/PostgreSQL)        │
└─────────────────────────────────────────┘
```

## 📋 API 端点

### 核心API
- **认证**: `/api/v1/auth/*` - 登录、注册、令牌管理
- **用户管理**: `/api/v1/users/*` - 用户CRUD、角色管理
- **项目管理**: `/api/v1/projects/*` - 项目CRUD、成员管理
- **连接管理**: `/api/v1/connections/*` - 连接CRUD、分组管理

### 高级功能API
- **在线状态**: `/api/v1/online-status/*` - 用户在线状态管理
- **审计日志**: `/api/v1/audit-logs/*` - 审计日志查询和过滤
- **数据导出**: `/api/v1/export/*` - 数据导出和下载
- **安全管理**: `/api/v1/security/*` - 安全事件监控和管理
- **备份恢复**: `/api/v1/backup/*` - 数据备份和恢复操作
- **系统监控**: `/api/v1/monitoring/*` - 系统指标和健康检查

### 探针端点 (Kubernetes)
- `/health` - 基础健康检查
- `/live` - 存活探针
- `/ready` - 就绪探针
- `/startup` - 启动探针

### API文档
- **Swagger UI**: `/api-docs` - 交互式API文档
- **API规范**: `/api-docs.json` - OpenAPI规范文件

## 🔧 环境配置

### 必需环境变量
```bash
# 数据库配置
DATABASE_URL=sqlserver://username:password@localhost:1433/database
DB_TYPE=sqlserver

# JWT配置
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d

# 应用配置
PORT=3001
NODE_ENV=development
API_VERSION=v1
API_PREFIX=/api/v1

# 日志配置
LOG_LEVEL=info
LOG_FILE=logs/app.log

# 备份配置
BACKUP_DIR=./backups
MAX_BACKUPS=10
```

### 可选环境变量
```bash
# CORS配置
CORS_ORIGIN=http://localhost:3000

# 速率限制
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# 加密配置
ENCRYPTION_KEY=your-encryption-key-for-backups

# 监控配置
METRICS_ENABLED=true
HEALTH_CHECK_INTERVAL=30000
```

## 🚀 快速开始

### Prerequisites
- Node.js 18+
- MySQL or SQL Server database
- npm or yarn

### Installation

1. Clone the repository and navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment configuration:
```bash
cp .env.example .env
```

4. Configure your `.env` file with your database settings.

5. Build the project:
```bash
npm run build
```

6. Start the development server:
```bash
npm run dev
```

### 访问API
- **API基础地址**: http://localhost:3001/api/v1
- **API文档**: http://localhost:3001/api-docs
- **健康检查**: http://localhost:3001/health

## 📁 项目结构

```
backend/
├── src/
│   ├── app.ts                 # Express应用入口
│   ├── app-init.ts           # 应用初始化和启动
│   ├── config/               # 配置文件
│   │   ├── config.ts        # 应用配置
│   │   ├── database.ts      # 数据库配置
│   │   ├── cors.ts          # CORS配置
│   │   └── swagger.ts       # API文档配置
│   ├── controllers/          # API控制器
│   │   ├── authController.ts
│   │   ├── userController.ts
│   │   ├── projectController.ts
│   │   ├── connectionController.ts
│   │   ├── auditController.ts
│   │   ├── exportController.ts
│   │   ├── securityController.ts
│   │   ├── backupController.ts
│   │   └── monitoringController.ts
│   ├── middleware/           # 中间件
│   │   ├── auth.ts          # 认证中间件
│   │   ├── validation.ts    # 数据验证
│   │   ├── errorHandler.ts  # 错误处理
│   │   ├── rateLimiter.ts   # 速率限制
│   │   ├── securityEnhancements.ts
│   │   ├── onlineStatus.ts
│   │   └── audit.ts
│   ├── models/               # 数据模型
│   │   ├── User.ts
│   │   ├── Project.ts
│   │   ├── Connection.ts
│   │   └── AuditLog.ts
│   ├── repositories/         # 数据访问层
│   │   ├── UserRepository.ts
│   │   ├── ProjectRepository.ts
│   │   ├── ConnectionRepository.ts
│   │   └── AuditLogRepository.ts
│   ├── services/             # 业务逻辑层
│   │   ├── authService.ts
│   │   ├── userService.ts
│   │   ├── projectService.ts
│   │   ├── connectionService.ts
│   │   ├── auditService.ts
│   │   ├── exportService.ts
│   │   ├── securityMonitoringService.ts
│   │   ├── backupService.ts
│   │   ├── monitoringService.ts
│   │   └── container.ts      # 依赖注入容器
│   ├── routes/               # 路由定义
│   │   ├── auth.ts
│   │   ├── users.ts
│   │   ├── projects.ts
│   │   ├── connections.ts
│   │   ├── audit.ts
│   │   ├── export.ts
│   │   ├── security.ts
│   │   ├── backup.ts
│   │   ├── monitoring.ts
│   │   └── health.ts
│   ├── utils/                # 工具函数
│   │   ├── logger.ts
│   │   ├── errors.ts
│   │   ├── encryption.ts
│   │   ├── compression.ts
│   │   └── validation.ts
│   └── types/                # TypeScript类型定义
│       ├── index.ts
│       └── api.ts
├── tests/                     # 测试文件
├── logs/                      # 日志文件
├── backups/                   # 备份文件
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## 🧪 测试

### 运行测试
```bash
# 运行所有测试
npm test

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监视模式运行测试
npm run test:watch
```

### 测试结构
```
tests/
├── unit/                      # 单元测试
│   ├── services/
│   ├── controllers/
│   └── utils/
├── integration/               # 集成测试
│   ├── auth/
│   ├── users/
│   └── projects/
├── fixtures/                  # 测试数据
└── helpers/                   # 测试辅助工具
```

## 🔒 安全特性

### 认证和授权
- JWT令牌认证，支持访问令牌和刷新令牌
- 基于角色的访问控制 (RBAC)
- 密码强度验证和bcrypt加密
- 会话管理和自动过期

### 数据保护
- 敏感数据自动加密存储
- SQL注入防护
- XSS和CSRF攻击防护
- 输入验证和清理

### API安全
- 多层速率限制
- IP白名单和黑名单
- 可疑活动检测
- 实时威胁监控

### 合规性
- 完整的审计日志
- 数据访问控制
- 隐私数据保护
- GDPR合规支持

## 📊 监控和日志

### 应用监控
- 实时系统指标监控 (CPU、内存、磁盘)
- 应用性能指标 (响应时间、错误率)
- 数据库连接和查询性能监控
- 业务指标统计

### 健康检查
- 多层次健康检查
- Kubernetes探针支持
- 依赖服务状态检查
- 自动故障恢复

### 日志管理
- 结构化日志记录
- 多级别日志输出
- 日志轮转和归档
- 错误追踪和报警

## 🔧 运维和部署

### 开发环境
```bash
npm run dev          # 启动开发服务器
npm run build        # 构建生产版本
npm start            # 启动生产服务器
```

### 生产部署
- Docker容器化支持
- 环境变量配置
- 健康检查集成
- 优雅关闭处理

### 数据库管理
```bash
npm run migration:create    # 创建迁移文件
npm run migration:run       # 运行迁移
npm run migration:revert    # 回滚迁移
npm run seed:run           # 运行种子数据
```

## 🤝 贡献指南

1. Fork项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🆘 支持

如果您遇到任何问题或有任何疑问，请：

1. 查看 [API文档](http://localhost:3001/api-docs)
2. 检查 [故障排除指南](docs/troubleshooting.md)
3. 提交 [Issue](https://github.com/your-repo/issues)
4. 联系维护团队

## 🔗 相关链接

- [前端应用](../RemoteHub/README.md)
- [API文档](http://localhost:3001/api-docs)
- [技术实施总结](../TECHNICAL_IMPLEMENTATION_SUMMARY.md)
- [项目规范](../openspec/)