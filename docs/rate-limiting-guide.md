# API 速率限制配置指南

## 概述

RemoteHub API 实现了灵活的速率限制机制，以防止滥用并确保系统稳定性。本指南将帮助您根据团队规模配置合适的速率限制。

## 配置参数

### 环境变量

在 `.env` 文件中配置以下变量：

```bash
# 时间窗口（毫秒）
RATE_LIMIT_WINDOW_MS=60000

# 最大请求数
RATE_LIMIT_MAX_REQUESTS=1000
```

### 配置建议

| 团队规模 | 每分钟请求数 | 说明 |
|---------|------------|------|
| 1-5人 | 300-500 | 小团队，较低的请求量 |
| 6-20人 | 500-1000 | 中等团队，正常请求量 |
| 21-50人 | 1000-2000 | 大团队，较高请求量 |
| 50+人 | 2000+ | 企业级团队，需要专门优化 |

## 速率限制特性

### 1. 基于用户的限制
- **认证用户**：使用用户ID作为限制键
- **匿名用户**：使用IP地址作为限制键
- 这意味着每个认证用户都有独立的限制配额

### 2. 开发环境优化
- 成功的请求不计入限制（`skipSuccessfulRequests`）
- 仅在开发环境中启用此优化

### 3. 动态调整
可以通过修改 `config/config.ts` 来实现更复杂的限制逻辑：

```typescript
// 示例：基于用户角色的动态限制
const getRateLimitForRole = (role: string) => {
  switch(role) {
    case 'admin': return 2000;
    case 'owner': return 1500;
    case 'editor': return 1000;
    case 'viewer': return 500;
    default: return 300;
  }
};
```

## 监控和调试

### 查看当前限制状态

每个API响应都包含速率限制相关的头：

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1640995200000
```

### 日志记录

当请求超过限制时，系统会记录警告日志：

```json
{
  "level": "warn",
  "message": "Rate limit exceeded",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "path": "/api/v1/projects",
  "method": "POST",
  "count": 1001,
  "limit": 1000
}
```

## 常见问题

### Q: 如何临时禁用速率限制？
A: 在开发环境中，可以将 `maxRequests` 设置为一个非常大的数字，或者在 `app.ts` 中注释掉速率限制中间件。

### Q: 不同端点可以有不同限制吗？
A: 可以。在 `app.ts` 中为特定路由添加额外的限制器：

```typescript
// 示例：为上传功能设置更严格的限制
app.use('/api/v1/upload', rateLimit({
  windowMs: 60000,
  max: 10,
  message: '上传过于频繁，请稍后再试'
}));
```

### Q: 如何处理突发流量？
A: 可以实现令牌桶算法，允许短时间的突发请求：

```typescript
import { RateLimiterMemory } from 'rate-limiter-flexible';

const rateLimiter = new RateLimiterMemory({
  keyPrefix: 'api_limit',
  points: 1000, // 总积分
  duration: 60, // 持续时间（秒）
  blockDuration: 60, // 阻塞时间（秒）
});
```

## 最佳实践

1. **监控使用情况**：定期检查API使用日志，了解实际需求
2. **分级限制**：为不同功能的API设置不同的限制
3. **告警机制**：当某个用户接近限制时发送通知
4. **白名单机制**：为系统维护或批处理任务创建白名单
5. **定期评估**：随着团队增长，定期评估和调整限制值

## 生产环境建议

1. 使用 Redis 存储速率限制数据，支持分布式部署
2. 实现用户级别的限流，而不仅仅是IP级别
3. 添加请求优先级机制
4. 实现动态调整机制，根据系统负载自动调整限制