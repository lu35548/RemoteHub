@echo off
echo === 测试后端API ===
echo.

REM 1. 健康检查
echo 1. 健康检查：
curl -s http://localhost:3001/api/v1/health
echo.
echo.

REM 2. 管理员登录
echo 2. 管理员登录：
curl -s -X POST http://localhost:3001/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"emailOrUsername\":\"admin\",\"password\":\"admin123\"}"
echo.
echo.

REM 3. 测试新用户登录
echo 3. 新用户登录：
curl -s -X POST http://localhost:3001/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"emailOrUsername\":\"testuser\",\"password\":\"password123\"}"
echo.
echo.

REM 4. 错误测试 - 错误密码
echo 4. 错误密码测试：
curl -s -X POST http://localhost:3001/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"emailOrUsername\":\"admin\",\"password\":\"wrongpassword\"}"
echo.
echo.

REM 5. 错误测试 - 不存在的用户
echo 5. 不存在的用户测试：
curl -s -X POST http://localhost:3001/api/v1/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"emailOrUsername\":\"nonexistent\",\"password\":\"password123\"}"
echo.
echo.

echo === 测试完成 ===