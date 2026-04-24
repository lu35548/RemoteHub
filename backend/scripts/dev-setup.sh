#!/bin/bash

# 开发环境设置脚本

echo "🚀 设置RemoteHub后端开发环境..."

# 检查Node.js版本
echo "📋 检查Node.js版本..."
node_version=$(node -v)
echo "当前Node.js版本: $node_version"

if ! [[ $node_version =~ ^v1[8-9]|^v2[0-9] ]]; then
    echo "⚠️  警告: 建议使用Node.js 18+版本"
fi

# 检查npm版本
npm_version=$(npm -v)
echo "当前npm版本: $npm_version"

# 安装依赖
echo "📦 安装依赖包..."
npm install

# 创建必要的目录
echo "📁 创建必要的目录..."
mkdir -p logs
mkdir -p backups
mkdir -p uploads
mkdir -p dist

# 检查环境文件
if [ ! -f .env.development ]; then
    echo "❌ 错误: .env.development 文件不存在"
    exit 1
fi

# 复制开发环境配置
echo "⚙️  设置开发环境配置..."
cp .env.development .env.local

# 构建项目
echo "🔨 构建项目..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ 构建成功!"
else
    echo "❌ 构建失败!"
    exit 1
fi

# 运行健康检查
echo "🔍 检查API健康状态..."
npm run health

echo "🎉 开发环境设置完成!"
echo "📝 可用命令:"
echo "   npm run dev     - 启动开发服务器"
echo "   npm run build   - 构建项目"
echo "   npm start       - 启动生产服务器"
echo ""
echo "🌐 API将在 http://localhost:3001 启动"
echo "📊 API文档将在 http://localhost:3001/api-docs 可用"