@echo off
echo 🚀 设置RemoteHub后端开发环境...

REM 检查Node.js版本
echo 📋 检查Node.js版本...
node -v

REM 检查npm版本
echo 📋 检查npm版本...
npm -v

REM 安装依赖
echo 📦 安装依赖包...
call npm install

REM 创建必要的目录
echo 📁 创建必要的目录...
if not exist logs mkdir logs
if not exist backups mkdir backups
if not exist uploads mkdir uploads
if not exist dist mkdir dist

REM 检查环境文件
if not exist .env.development (
    echo ❌ 错误: .env.development 文件不存在
    pause
    exit /b 1
)

REM 复制开发环境配置
echo ⚙️  设置开发环境配置...
copy .env.development .env.local

REM 构建项目
echo 🔨 构建项目...
call npm run build

if %errorlevel% equ 0 (
    echo ✅ 构建成功!
) else (
    echo ❌ 构建失败!
    pause
    exit /b 1
)

echo 🎉 开发环境设置完成!
echo 📝 可用命令:
echo    npm run dev     - 启动开发服务器
echo    npm run build   - 构建项目
echo    npm start       - 启动生产服务器
echo.
echo 🌐 API将在 http://localhost:3001 启动
echo 📊 API文档将在 http://localhost:3001/api-docs 可用
pause