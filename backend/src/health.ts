/**
 * 健康检查脚本
 * 用于验证API服务状态
 */

import { DatabaseService } from './config/database';
import { logger } from './utils/logger';

async function checkHealth() {
  console.log('\n🔍 RemoteHub 后端API健康检查\n');

  try {
    // 检查数据库连接
    console.log('📊 检查数据库连接...');

    // 首先初始化数据库
    await DatabaseService.initialize();
    const dbHealth = await DatabaseService.healthCheck();

    if (dbHealth.status === 'connected') {
      console.log('✅ 数据库连接正常');
      console.log(`   类型: ${dbHealth.details?.type}`);
      console.log(`   状态: ${dbHealth.details?.connected ? '已连接' : '未连接'}`);
    } else {
      console.log('❌ 数据库连接异常');
      console.log(`   错误: ${dbHealth.details?.error || '未知错误'}`);
    }

    // 检查环境变量
    console.log('\n⚙️  检查环境配置...');
    const requiredEnvVars = ['NODE_ENV', 'PORT', 'JWT_SECRET'];
    const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

    if (missingVars.length === 0) {
      console.log('✅ 环境变量配置完整');
    } else {
      console.log('❌ 缺少环境变量:');
      missingVars.forEach(varName => console.log(`   - ${varName}`));
    }

    // 检查关键目录
    console.log('\n📁 检查目录结构...');
    const fs = require('fs');
    const requiredDirs = ['logs', 'backups', 'uploads'];

    requiredDirs.forEach(dir => {
      if (fs.existsSync(dir)) {
        console.log(`✅ ${dir}/ 目录存在`);
      } else {
        console.log(`❌ ${dir}/ 目录不存在`);
      }
    });

    // 检查端口可用性
    console.log('\n🌐 检查网络端口...');
    const port = process.env.PORT || 3001;

    try {
      const net = require('net');
      const server = net.createServer();

      server.listen(port, () => {
        console.log(`✅ 端口 ${port} 可用`);
        server.close();
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`⚠️  端口 ${port} 已被占用`);
        } else {
          console.log(`❌ 端口 ${port} 检查失败: ${err.message}`);
        }
      });
    } catch (error) {
      console.log(`❌ 网络检查失败: ${error}`);
    }

    console.log('\n📋 健康检查完成\n');

  } catch (error) {
    console.error('❌ 健康检查过程中发生错误:', error);
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  checkHealth().then(() => {
    process.exit(0);
  }).catch((error) => {
    console.error('健康检查失败:', error);
    process.exit(1);
  });
}

export { checkHealth };