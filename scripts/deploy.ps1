$ErrorActionPreference = "Stop"

Write-Host "=== RemoteHub V2 部署脚本 ==="

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "错误：未安装 Docker" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path .env)) {
  Write-Host "首次部署，创建 .env 文件..."
  @"
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
HOST=remotehub.example.com
"@ | Out-File -FilePath .env -Encoding utf8
  Write-Host ".env 文件已创建，请编辑后重新运行"
  exit 0
}

Write-Host "构建并启动服务..."
docker compose up --build -d

Write-Host "`n=== 部署完成 ==="
