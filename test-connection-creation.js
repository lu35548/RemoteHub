const { DataSource } = require('typeorm');
const { ConnectionRepository } = require('./backend/src/repositories/ConnectionRepository');
const { Connection, ConnectionStatus, ConnectionCategory, ConnectionSecurityLevel } = require('./backend/src/models/Connection');

async function testConnectionCreation() {
  try {
    // 创建Mock数据源
    const mockDataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: false,
      logging: true
    });

    // 使用Mock数据库服务
    const MockDatabaseService = require('./backend/src/config/database-mock').default;
    const mockService = MockDatabaseService.getInstance();

    const connectionRepo = new ConnectionRepository(mockService.getDataSource());

    console.log('测试创建连接...');

    // 测试创建连接
    const connectionData = {
      name: 'UFDATA数据库连接',
      type: 'sqlserver',
      host: '.',
      port: 1433,
      database: 'UFDATA_999_2014',
      username: 'sa',
      password: '123',
      ownerId: '1'
    };

    // 验证连接配置
    const tempConnection = new Connection();
    Object.assign(tempConnection, connectionData);
    tempConnection.setPassword(connectionData.password);

    console.log('连接配置验证:', tempConnection.isValidConfiguration);
    console.log('连接数据:', JSON.stringify(connectionData, null, 2));

    const connection = await connectionRepo.createConnection(connectionData);
    console.log('创建成功:', connection);

  } catch (error) {
    console.error('测试失败:', error);
    console.error('错误栈:', error.stack);
  }
}

testConnectionCreation();