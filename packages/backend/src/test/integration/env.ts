// 集成测试环境前置（vitest 不加载 .env）。必须以本目录任何测试文件的**第一个 import** 出现，
// 先于 server 链上 config/env.ts 的 import 期快照构建。
// DATABASE_URL 在此为占位值：audit.middleware.test.ts 动态 import server 前会覆盖为
// setupTestDb 的临时库 URL；此处仅保证 requireEnv/密钥校验不在 import 期崩。
process.env.NODE_ENV ||= 'test';
process.env.DATABASE_URL ||= 'file:./test-placeholder.db';
process.env.JWT_SECRET ||= 'integration-test-jwt-secret-0123456789abcdef';
// 合法 32 字节 base64（AES-256-GCM 解码长度校验用，全零字节无敏感价值）
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');
process.env.ADMIN_USERNAME ||= 'admin';
process.env.ADMIN_PASSWORD ||= 'Admin123456!';
