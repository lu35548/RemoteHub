/**
 * 测试迁移功能的脚本
 * 用于验证localStorage到数据库的迁移功能
 */

import { LocalStorageMigrationTool, LocalStorageConnection } from '../src/utils/migrationUtil';
import { RemoteProtocol } from '../src/models/RemoteConnection';
import { DatabaseService } from '../src/config/database';

// 模拟localStorage连接数据
const mockConnections: LocalStorageConnection[] = [
  {
    id: 'conn_1',
    name: '开发服务器RDP',
    protocol: 'rdp',
    host: '192.168.1.100',
    port: 3389,
    username: 'admin',
    password: 'password123',
    tags: ['开发', '服务器'],
    notes: '主要开发环境服务器',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-15T00:00:00Z'
  },
  {
    id: 'conn_2',
    name: '生产环境SSH',
    protocol: 'ssh',
    host: 'prod.example.com',
    port: 22,
    username: 'root',
    password: 'securepassword',
    tags: ['生产', 'Linux'],
    notes: '生产环境主服务器',
    createdAt: '2025-01-02T00:00:00Z',
    updatedAt: '2025-01-16T00:00:00Z'
  },
  {
    id: 'conn_3',
    name: '测试VNC',
    protocol: 'vnc',
    host: '192.168.1.200',
    port: 5901,
    username: 'user',
    tags: ['测试'],
    notes: 'VNC测试连接'
  },
  {
    id: 'conn_4',
    name: '公司VPN',
    protocol: 'vpn',
    host: 'vpn.company.com',
    vpnType: 'openvpn',
    vpnLoginUrl: 'https://vpn.company.com/login',
    requiredVpnId: 'corp_vpn',
    tags: ['VPN', '公司'],
    notes: '公司VPN访问'
  },
  {
    id: 'conn_5',
    name: 'ToDesk远程',
    protocol: 'todesk',
    host: '123456789',
    tags: ['远程支持'],
    notes: 'ToDesk远程支持连接'
  }
];

async function testMigration() {
  console.log('🚀 开始测试数据迁移功能...\n');

  try {
    // 初始化数据库
    console.log('📊 初始化数据库...');
    await DatabaseService.initialize();
    console.log('✅ 数据库初始化完成');

    // 初始化迁移工具
    const migrationTool = new LocalStorageMigrationTool();

    // 测试1: 验证连接数据
    console.log('📋 测试1: 验证连接数据');
    console.log('总连接数:', mockConnections.length);

    let validCount = 0;
    let invalidCount = 0;

    for (const conn of mockConnections) {
      const validation = migrationTool['validateConnection'](conn);
      if (validation.isValid) {
        validCount++;
        console.log(`✅ ${conn.name} - 验证通过`);
      } else {
        invalidCount++;
        console.log(`❌ ${conn.name} - 验证失败: ${validation.errors.join(', ')}`);
      }
    }

    console.log(`验证结果: 有效 ${validCount}, 无效 ${invalidCount}\n`);

    // 测试2: 协议解析
    console.log('🔄 测试2: 协议解析');
    const protocolTests = ['rdp', 'ssh', 'vnc', 'http', 'https', 'todesk', 'vpn'];
    protocolTests.forEach(protocol => {
      try {
        const parsed = migrationTool['parseProtocol'](protocol);
        console.log(`✅ ${protocol} -> ${parsed}`);
      } catch (error) {
        console.log(`❌ ${protocol} -> 解析失败`);
      }
    });
    console.log('');

    // 测试3: 模拟迁移（仅验证模式）
    console.log('🔍 测试3: 模拟迁移（验证模式）');
    const mockUserId = 'test_user_001';
    const mockProjectId = 'test_project_001';

    const migrationOptions = {
      userId: mockUserId,
      projectId: mockProjectId,
      validateOnly: true,
      overwriteExisting: false,
      skipPasswords: false,
      batchSize: 3
    };

    const result = await migrationTool.migrateConnections(mockConnections, migrationOptions);

    console.log('迁移结果:');
    console.log(`- 总连接数: ${result.totalConnections}`);
    console.log(`- 成功迁移: ${result.migratedConnections}`);
    console.log(`- 跳过连接: ${result.skippedConnections}`);
    console.log(`- 错误连接: ${result.errorConnections}`);

    if (result.errors.length > 0) {
      console.log('\n错误详情:');
      result.errors.forEach(error => {
        console.log(`- ${error.connectionName}: ${error.error}`);
      });
    }

    console.log('');

    // 测试4: 生成迁移报告
    console.log('📊 测试4: 生成迁移报告');
    const report = migrationTool.generateMigrationReport(result);
    console.log('迁移报告:');
    console.log(report);

    // 测试5: 生成浏览器导出脚本
    console.log('\n🌐 测试5: 浏览器导出脚本');
    const browserScript = LocalStorageMigrationTool.generateBrowserExportScript();
    console.log('已生成浏览器导出脚本（长度:', browserScript.length, '字符）');

    console.log('\n🎉 所有迁移功能测试完成！');

  } catch (error) {
    console.error('❌ 测试失败:', error);
    process.exit(1);
  }
}

// 运行测试
testMigration().catch(error => {
  console.error('测试执行失败:', error);
  process.exit(1);
});