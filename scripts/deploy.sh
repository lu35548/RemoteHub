#!/bin/bash
set -e

echo "=== RemoteHub V2 部署脚本 ==="

if ! command -v docker &>/dev/null; then
  echo "错误：未安装 Docker"
  exit 1
fi

if ! command -v docker compose &>/dev/null; then
  echo "错误：未安装 Docker Compose"
  exit 1
fi

if [ ! -f .env ]; then
  echo "首次部署，创建 .env 文件..."
  cat > .env << 'ENVEOF'
NODE_ENV=production
PORT=3001
DATABASE_URL=mysql://remotehub:CHANGE_ME@db:3306/remotehub?connection_limit=30
DB_PASSWORD=CHANGE_ME
JWT_SECRET=CHANGE_ME_TO_RANDOM_64_CHARS
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
ENCRYPTION_KEY=CHANGE_ME_TO_BASE64_32BYTES
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin123
LOG_LEVEL=info
RATE_LIMIT_LOGIN_MAX=5
RATE_LIMIT_REGISTER_MAX=3
RATE_LIMIT_REFRESH_MAX=20
RATE_LIMIT_GENERAL_MAX=200
HOST=remotehub.example.com
ENVEOF
  echo ".env 文件已创建，请编辑后重新运行："
  echo "  vi .env"
  exit 0
fi

echo "构建并启动服务..."
docker compose up --build -d

echo ""
echo "=== 部署完成 ==="
echo "访问 https://$(grep HOST .env | cut -d= -f2)"
echo "默认管理员：$(grep ADMIN_USERNAME .env | cut -d= -f2)"
