const axios = require('axios');

async function testConnectionAPI() {
  const baseURL = 'http://localhost:3001/api/v1';

  try {
    // 1. 登录获取token
    console.log('1. 登录获取token...');
    const loginResponse = await axios.post(`${baseURL}/auth/login`, {
      emailOrUsername: 'admin',
      password: 'admin123'
    });

    const token = loginResponse.data.data.tokens.accessToken;
    console.log('登录成功，获取到token');

    // 2. 测试创建MySQL连接
    console.log('\n2. 测试创建MySQL连接...');
    const mysqlConnectionData = {
      name: 'Test MySQL Connection',
      type: 'mysql',
      host: 'localhost',
      port: 3306,
      database: 'testdb',
      username: 'root',
      password: 'password'
    };

    try {
      const mysqlResponse = await axios.post(`${baseURL}/connections`, mysqlConnectionData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('MySQL连接创建成功:', mysqlResponse.data);
    } catch (error) {
      console.log('MySQL连接创建失败:', error.response?.data || error.message);
    }

    // 3. 测试创建SQL Server连接（使用用户提供的连接字符串信息）
    console.log('\n3. 测试创建SQL Server连接...');
    const sqlServerConnectionData = {
      name: 'UFDATA数据库连接',
      type: 'sqlserver',
      host: '.',
      port: 1433,
      database: 'UFDATA_999_2014',
      username: 'sa',
      password: '123'
    };

    try {
      const sqlServerResponse = await axios.post(`${baseURL}/connections`, sqlServerConnectionData, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('SQL Server连接创建成功:', sqlServerResponse.data);
    } catch (error) {
      console.log('SQL Server连接创建失败:', error.response?.data || error.message);
    }

    // 4. 测试获取连接列表
    console.log('\n4. 测试获取连接列表...');
    try {
      const listResponse = await axios.get(`${baseURL}/connections`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      console.log('连接列表获取成功:', listResponse.data);
    } catch (error) {
      console.log('连接列表获取失败:', error.response?.data || error.message);
    }

  } catch (error) {
    console.error('测试过程中出错:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

// 等待一下让后端服务启动
setTimeout(() => {
  console.log('开始测试连接API...');
  testConnectionAPI();
}, 3000);