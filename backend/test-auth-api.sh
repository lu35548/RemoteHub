#!/bin/bash

echo "=== 测试后端API ==="
echo ""

# 1. 健康检查
echo "1. 健康检查："
curl -s http://localhost:3001/api/v1/health | jq '.'
echo ""

# 2. 管理员登录
echo "2. 管理员登录："
ADMIN_RESPONSE=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emailOrUsername":"admin","password":"admin123"}')

echo $ADMIN_RESPONSE | jq '.'
ADMIN_TOKEN=$(echo $ADMIN_RESPONSE | jq -r '.data.tokens.accessToken')
echo ""
echo "Admin Token: $ADMIN_TOKEN"
echo ""

# 3. 使用管理员token获取用户列表
echo "3. 获取用户列表："
curl -s -X GET http://localhost:3001/api/v1/users \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
echo ""

# 4. 创建新用户
echo "4. 创建新用户："
curl -s -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser2",
    "email": "testuser2@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User2"
  }' | jq '.'
echo ""

# 5. 测试新用户登录
echo "5. 新用户登录："
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emailOrUsername":"testuser2","password":"password123"}' | jq '.'
echo ""

# 6. 错误测试 - 错误密码
echo "6. 错误密码测试："
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emailOrUsername":"admin","password":"wrongpassword"}' | jq '.'
echo ""

# 7. 错误测试 - 不存在的用户
echo "7. 不存在的用户测试："
curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"emailOrUsername":"nonexistent","password":"password123"}' | jq '.'
echo ""

# 8. 获取当前用户信息
echo "8. 获取当前用户信息："
curl -s -X GET http://localhost:3001/api/v1/auth/current-user \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
echo ""

# 9. 登出
echo "9. 登出："
curl -s -X POST http://localhost:3001/api/v1/auth/logout \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq '.'
echo ""