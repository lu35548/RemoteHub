import { getServices } from './src/services/container';
import { UserRepository } from './src/repositories/UserRepository';
import { UserRole, UserStatus } from './src/models/User';
import { PasswordService } from './src/services/passwordService';

async function debugLogin() {
  console.log('=== 调试登录过程 ===');

  const services = getServices();
  const userRepo = new UserRepository(services.database.getDataSource());
  const passwordService = services.passwordService;

  // 1. 查找用户
  console.log('\n1. 查找用户 testuser...');
  const user = await userRepo.findByEmailOrUsername('testuser');

  if (!user) {
    console.log('用户不存在！');
    return;
  }

  console.log('找到用户:', {
    id: user.id,
    username: user.username,
    email: user.email,
    status: user.status,
    role: user.role,
    hasPassword: !!user.password,
    passwordLength: user.password?.length || 0
  });

  // 2. 验证密码
  console.log('\n2. 验证密码...');
  const isPasswordValid = await passwordService.verifyPassword('password123', user.password);
  console.log('密码验证结果:', isPasswordValid);

  // 3. 测试哈希
  console.log('\n3. 测试密码哈希...');
  const testHash = await passwordService.hashPassword('password123');
  console.log('生成的哈希:', testHash.substring(0, 50) + '...');

  const testVerify = await passwordService.verifyPassword('password123', testHash);
  console.log('新哈希验证结果:', testVerify);
}

debugLogin().catch(console.error);