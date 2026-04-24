# Project Context

## Purpose
RemoteHub 是一个团队远程协作平台，旨在为企业和团队提供统一的远程连接管理解决方案。项目的主要目标是：

- 集中管理团队成员的远程连接资源（服务器、桌面、VPN等）
- 提供基于项目的资源组织和权限管理
- 支持多种远程协议和连接方式
- 实现用户认证和在线状态跟踪
- 提供直观易用的Web界面，支持快速资源访问
- 集成AI助手功能，提供智能辅助和建议

## Tech Stack
### 前端技术栈
- **React 19.2.0** - 主要UI框架
- **TypeScript 5.8.2** - 类型安全的JavaScript
- **Vite 6.2.0** - 构建工具和开发服务器
- **Tailwind CSS** - 样式框架（通过CDN或本地构建）

### UI组件和图标
- **Lucide React 0.554.0** - 现代化图标库
- 自定义UI组件系统（Toast、Modal、Confirmation等）

### AI集成
- **Google Gemini API (@google/genai 1.30.0)** - AI助手功能

### 开发工具
- **@vitejs/plugin-react 5.0.0** - React支持
- **@types/node 22.14.0** - Node.js类型定义

### 数据存储
- **浏览器本地存储** - 主要数据持久化方案
- **自定义存储适配器** - 统一的存储抽象层

### 运行环境
- **现代浏览器** - 支持ES2022特性
- **无需后端服务器** - 纯前端应用

## Project Conventions

### Code Style
#### 命名约定
- **文件命名**: 使用PascalCase命名组件文件（如 `ConnectionCard.tsx`），camelCase命名服务文件（如 `auth.service.ts`）
- **组件命名**: React组件使用PascalCase（如 `ConnectionModal`）
- **变量和函数**: 使用camelCase（如 `handleSaveConnection`）
- **常量**: 使用UPPER_SNAKE_CASE命名枚举和常量
- **接口和类型**: 使用PascalCase，以`I`或`Props`结尾的可选前缀

#### 代码组织
- **组件结构**: 按功能分组，每个组件一个文件
- **导入顺序**: React相关导入 → 第三方库 → 本地组件 → 服务 → 类型定义
- **导出方式**: 主要使用命名导出，默认导出用于主要组件

#### TypeScript规范
- 启用严格类型检查
- 使用接口定义数据结构（`types.ts`）
- 为所有函数参数和返回值指定类型
- 使用枚举表示固定选项集

### Architecture Patterns
#### 分层架构
- **表现层**: React组件和UI逻辑
- **服务层**: 业务逻辑和数据操作（`services/`）
- **存储层**: 数据持久化抽象（`storage.adapter.ts`）

#### 设计模式
- **服务层模式**: 使用静态类封装数据操作
- **适配器模式**: 存储适配器抽象本地存储操作
- **提供者模式**: UI上下文提供全局状态（Toast、Confirm）
- **守卫模式**: 认证守卫保护路由访问

#### 状态管理
- 使用React Hooks进行本地状态管理
- 无外部状态管理库
- 服务层处理数据同步

### Testing Strategy
#### 测试框架
- 目前项目未配置测试框架
- 建议使用Jest + React Testing Library进行单元测试
- 使用Vitest进行集成测试

#### 测试重点
- **服务层测试**: 数据操作和业务逻辑
- **组件测试**: 用户交互和UI渲染
- **认证流程**: 登录、权限验证、会话管理
- **数据持久化**: 本地存储读写操作

#### 测试约定
- 使用describe-it组织测试结构
- 测试文件命名: `*.test.ts` 或 `*.spec.ts`
- 覆盖率目标: 80%以上

### Git Workflow
#### 分支策略
- **main**: 生产环境分支
- **develop**: 开发环境分支
- **feature/功能名**: 功能开发分支
- **hotfix/修复名**: 紧急修复分支

#### 提交约定
使用中文提交信息，格式:
```
<类型>: <描述>

[可选的详细描述]
```

类型包括:
- `feat`: 新功能
- `fix`: 修复
- `docs`: 文档更新
- `style`: 样式调整
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建工具、依赖更新等

### Architecture Patterns
[Document your architectural decisions and patterns]

### Testing Strategy
[Explain your testing approach and requirements]

### Git Workflow
[Describe your branching strategy and commit conventions]

## Domain Context
### 远程连接管理领域
#### 支持的协议类型
- **RDP (远程桌面协议)**: Windows远程桌面连接
- **SSH**: Linux/Unix服务器安全连接
- **VNC**: 虚拟网络计算，跨平台桌面共享
- **HTTP/HTTPS**: Web应用访问
- **VPN**: 虚拟专用网络连接
- **远程工具**: ToDesk、向日葵、TeamViewer、AnyDesk等商业远程软件

#### 业务概念
- **项目**: 作为容器组织相关连接资源
- **连接**: 具体的远程连接配置，包含主机、端口、认证信息等
- **用户**: 系统使用者，支持管理员和普通用户角色
- **审计**: 数据变更的追踪记录（创建者、修改者、时间戳）
- **在线状态**: 用户活跃度跟踪，基于心跳机制

#### 数据模型
- **用户认证**: 基于本地存储的会话管理
- **权限控制**: 基于角色的访问控制（RBAC）
- **数据关系**: 项目与连接的一对多关系
- **依赖管理**: VPN连接之间的依赖关系

### UI/UX设计原则
- **现代化界面**: 深色主题（slate-950），强调对比度
- **响应式设计**: 支持不同屏幕尺寸的自适应布局
- **直观操作**: 拖拽、快捷键、上下文菜单
- **状态反馈**: 加载状态、成功/错误提示
- **国际化**: 支持中文界面，具备扩展多语言能力

## Important Constraints
### 技术约束
- **纯前端应用**: 无后端服务器支持，所有数据存储在浏览器本地
- **浏览器兼容性**: 需要支持现代浏览器的ES2022特性
- **数据持久化**: 依赖localStorage，有存储容量限制（通常5-10MB）
- **安全性**: 密码仅使用简单哈希，不适合存储敏感信息
- **同步机制**: 无实时数据同步，多用户间数据不共享

### 业务约束
- **单机部署**: 每个用户的数据独立存储，无法实现团队数据共享
- **用户管理**: 仅支持本地用户账户，无外部认证集成
- **审计要求**: 所有数据变更需要记录创建者、修改者和时间戳
- **数据备份**: 需要用户手动导出配置文件进行备份

### 法律和合规
- **数据隐私**: 所有数据存储在用户本地，符合数据隐私保护要求
- **开源协议**: 项目代码需要明确开源许可证
- **第三方API**: Gemini API使用需要遵守Google服务条款

## External Dependencies
### API服务
- **Google Gemini API**:
  - 用途: AI助手功能，提供智能建议和辅助
  - 认证: 通过API密钥认证
  - 配置: 环境变量 `GEMINI_API_KEY`
  - 依赖包: `@google/genai@1.30.0`

### 构建依赖
- **Vite构建工具**: 现代化前端构建工具
- **React插件**: 支持JSX和React开发
- **TypeScript编译器**: 类型检查和编译

### 运行时依赖
- **React运行时**: 组件渲染和状态管理
- **Lucide React**: 图标组件库
- **现代浏览器特性**: ES2022、ESModules、Web APIs

### 开发依赖
- **Node.js**: 运行开发环境和构建工具
- **TypeScript**: 类型定义和编译器
- **Vite**: 开发服务器和构建工具
