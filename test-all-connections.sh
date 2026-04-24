#!/bin/bash

# 获取新的token（因为之前的可能已过期）
echo "=== 获取访问令牌 ==="
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"emailOrUsername\":\"admin\",\"password\":\"admin123\"}")

# 提取token
TOKEN=$(echo $LOGIN_RESPONSE | jq -r '.data.tokens.accessToken')
echo "Token: $TOKEN"

# 设置认证头
AUTH_HEADER="Authorization: Bearer $TOKEN"
CONTENT_TYPE="Content-Type: application/json"

echo -e "\n========== 数据库连接测试 =========="

# 1. MySQL连接
echo -e "\n1. 创建MySQL连接"
curl -X POST http://localhost:3001/api/v1/connections \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE" \
  -d '{
    "name": "MySQL测试连接",
    "type": "mysql",
    "host": "localhost",
    "port": 3306,
    "database": "test_db",
    "username": "root",
    "password": "password"
  }' | jq .

# 2. PostgreSQL连接
echo -e "\n2. 创建PostgreSQL连接"
curl -X POST http://localhost:3001/api/v1/connections \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE" \
  -d '{
    "name": "PostgreSQL测试连接",
    "type": "postgresql",
    "host": "localhost",
    "port": 5432,
    "database": "test_db",
    "username": "postgres",
    "password": "password"
  }' | jq .

# 3. MongoDB连接
echo -e "\n3. 创建MongoDB连接"
curl -X POST http://localhost:3001/api/v1/connections \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE" \
  -d '{
    "name": "MongoDB测试连接",
    "type": "mongodb",
    "host": "localhost",
    "port": 27017,
    "database": "test_db",
    "username": "admin",
    "password": "password"
  }' | jq .

# 4. Redis连接
echo -e "\n4. 创建Redis连接"
curl -X POST http://localhost:3001/api/v1/connections \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE" \
  -d '{
    "name": "Redis测试连接",
    "type": "redis",
    "host": "localhost",
    "port": 6379,
    "password": "password"
  }' | jq .

# 5. SQLite连接
echo -e "\n5. 创建SQLite连接"
curl -X POST http://localhost:3001/api/v1/connections \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE" \
  -d '{
    "name": "SQLite测试连接",
    "type": "sqlite",
    "database": "/path/to/database.db"
  }' | jq .

echo -e "\n========== 尝试远程连接类型测试（可能失败）=========="

# 6. 尝试创建RDP连接（应该失败，因为后端不支持）
echo -e "\n6. 尝试创建RDP连接（预期失败）"
curl -X POST http://localhost:3001/api/v1/connections \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE" \
  -d '{
    "name": "Windows远程桌面",
    "type": "rdp",
    "host": "192.168.1.100",
    "port": 3389,
    "username": "administrator",
    "password": "password"
  }' | jq .

# 7. 尝试创建SSH连接（应该失败）
echo -e "\n7. 尝试创建SSH连接（预期失败）"
curl -X POST http://localhost:3001/api/v1/connections \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE" \
  -d '{
    "name": "Linux SSH连接",
    "type": "ssh",
    "host": "192.168.1.101",
    "port": 22,
    "username": "root",
    "password": "password"
  }' | jq .

# 8. 尝试创建VNC连接（应该失败）
echo -e "\n8. 尝试创建VNC连接（预期失败）"
curl -X POST http://localhost:3001/api/v1/connections \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE" \
  -d '{
    "name": "VNC远程桌面",
    "type": "vnc",
    "host": "192.168.1.102",
    "port": 5900,
    "password": "password"
  }' | jq .

# 9. 尝试创建ToDesk连接（应该失败）
echo -e "\n9. 尝试创建ToDesk连接（预期失败）"
curl -X POST http://localhost:3001/api/v1/connections \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE" \
  -d '{
    "name": "ToDesk远程连接",
    "type": "todesk",
    "host": "192.168.1.103",
    "remoteCode": "123456789",
    "password": "password"
  }' | jq .

# 10. 尝试创建向日葵连接（应该失败）
echo -e "\n10. 尝试创建向日葵连接（预期失败）"
curl -X POST http://localhost:3001/api/v1/connections \
  -H "$AUTH_HEADER" \
  -H "$CONTENT_TYPE" \
  -d '{
    "name": "向日葵远程连接",
    "type": "sunlogin",
    "host": "192.168.1.104",
    "remoteCode": "987654321",
    "password": "password"
  }' | jq .

echo -e "\n========== 获取连接列表测试 =========="
echo -e "\n11. 获取所有连接列表"
curl -H "$AUTH_HEADER" http://localhost:3001/api/v1/connections | jq .

echo -e "\n========== 测试连接功能 =========="

# 测试已创建的连接（如果存在）
echo -e "\n12. 测试连接（使用第一个连接）"
# 首先获取连接列表
CONNECTIONS=$(curl -s -H "$AUTH_HEADER" http://localhost:3001/api/v1/connections)
if echo "$CONNECTIONS" | jq -e '.success' > /dev/null 2>&1; then
  # 获取第一个连接的ID
  FIRST_CONN_ID=$(echo "$CONNECTIONS" | jq -r '.data.connections[0].id // empty')
  if [ -n "$FIRST_CONN_ID" ] && [ "$FIRST_CONN_ID" != "null" ]; then
    echo "测试连接ID: $FIRST_CONN_ID"
    curl -X POST http://localhost:3001/api/v1/connections/$FIRST_CONN_ID/test \
      -H "$AUTH_HEADER" | jq .
  else
    echo "没有可用的连接进行测试"
  fi
else
  echo "获取连接列表失败"
fi

echo -e "\n========== 完成 =========="