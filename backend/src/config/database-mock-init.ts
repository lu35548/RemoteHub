import { MockRepositoryFactory } from '../repositories/MockRepository';
import { logger } from '../utils/logger';

/**
 * 初始化 Mock 数据库的数据
 */
export async function initializeMockData(): Promise<void> {
  logger.info('Initializing mock database data...');

  // 初始化用户数据
  await initializeUsers();

  // 初始化项目数据
  await initializeProjects();

  // 初始化连接数据
  await initializeConnections();

  logger.info('Mock database data initialized successfully');
}

async function initializeUsers(): Promise<void> {
  const userRepo = MockRepositoryFactory.getRepository('User');

  // 检查是否已有用户数据
  const existingUsers = await userRepo.find();
  if (existingUsers.length > 0) {
    logger.debug(`Users already initialized: ${existingUsers.length} users found`);
    return;
  }

  // 创建默认管理员用户
  const adminUser = {
    id: '1',
    username: 'admin',
    email: 'admin@example.com',
    password: '$2b$10$L3v7t3GIHblgkL8H7QGpwOH38JMOkzHUxTOkJeEpUXjVwqhBWdU2S', // admin123
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

  // 创建测试用户
  const testUser = {
    id: '2',
    username: 'testuser',
    email: 'testuser@example.com',
    password: '$2b$10$G6Qk8q93bIrc1tKh.3q9ROhAv1k8AHM3P/JHJsNqhKfE6/VQkPcWm', // password123
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
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

  await userRepo.save(adminUser);
  await userRepo.save(testUser);

  logger.info('Created default users: admin (admin123), testuser (password123)');
}

async function initializeProjects(): Promise<void> {
  const projectRepo = MockRepositoryFactory.getRepository('Project');

  // 检查是否已有项目数据
  const existingProjects = await projectRepo.find();
  if (existingProjects.length > 0) {
    logger.debug(`Projects already initialized: ${existingProjects.length} projects found`);
    return;
  }

  // 创建示例项目
  const sampleProject = {
    id: '1',
    name: '示例项目',
    description: '这是一个示例项目，用于演示系统功能',
    status: 'ACTIVE',
    visibility: 'PRIVATE',
    ownerId: '1', // admin用户
    settings: {
      allowMemberInvite: true,
      requireApprovalForJoin: false
    },
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z')
  };

  await projectRepo.save(sampleProject);
  logger.info('Created sample project');
}

async function initializeConnections(): Promise<void> {
  const connectionRepo = MockRepositoryFactory.getRepository('Connection');

  // 检查是否已有连接数据
  const existingConnections = await connectionRepo.find();
  if (existingConnections.length > 0) {
    logger.debug(`Connections already initialized: ${existingConnections.length} connections found`);
    return;
  }

  // 创建示例连接
  const sampleConnection = {
    id: '1',
    name: '示例服务器',
    type: 'SSH',
    host: 'example.com',
    port: 22,
    username: 'root',
    authMethod: 'password',
    status: 'ACTIVE',
    ownerId: '1', // admin用户
    projectId: '1', // 示例项目
    config: {
      timeout: 30000,
      keepAlive: true
    },
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    lastConnectedAt: null
  };

  await connectionRepo.save(sampleConnection);
  logger.info('Created sample connection');
}