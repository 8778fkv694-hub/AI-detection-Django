#!/bin/bash

echo "🚀 启动AI检测系统生产环境"
echo "=================================================="
echo "端口配置："
echo "  前端HTTPS: 443"
echo "  前端HTTP:  80"
echo "  后端API:   8012"
echo "  数据库:    5432"
echo "  Redis:     6379"
echo "=================================================="

# 检查是否在正确的目录
if [ ! -f "docker-compose.prod.yml" ] || [ ! -d "production" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装Docker Compose"
    exit 1
fi

echo "✅ 环境检查通过"

# 检查环境变量文件
if [ ! -f "production/.env" ]; then
    echo "📝 创建生产环境配置文件..."
    cp production/env.example production/.env
    echo "⚠️  请编辑 production/.env 文件配置您的环境变量"
    echo "   特别是 SECRET_KEY, POSTGRES_PASSWORD, REDIS_PASSWORD"
    read -p "按回车键继续..."
fi

# 构建前端
echo "🎨 构建前端应用..."
if [ ! -d "node_modules" ]; then
    echo "📥 安装前端依赖..."
    npm install
fi

echo "🔨 构建前端..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ 前端构建失败"
    exit 1
fi

echo "✅ 前端构建完成"

# 停止现有容器
echo "🛑 停止现有容器..."
docker-compose -f docker-compose.prod.yml down

# 启动生产环境
echo "🚀 启动生产环境..."
docker-compose -f docker-compose.prod.yml up -d

# 等待服务启动
echo "⏳ 等待服务启动..."
sleep 30

# 检查服务状态
echo "🔍 检查服务状态..."

# 检查数据库
if docker-compose -f docker-compose.prod.yml exec -T db pg_isready -U qainspect -d qainspect > /dev/null 2>&1; then
    echo "✅ 数据库服务正常"
else
    echo "❌ 数据库服务异常"
fi

# 检查Redis
if docker-compose -f docker-compose.prod.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis服务正常"
else
    echo "❌ Redis服务异常"
fi

# 检查后端API
if curl -s http://localhost:8012/api/ > /dev/null 2>&1; then
    echo "✅ 后端API服务正常 (端口 8012)"
else
    echo "❌ 后端API服务异常"
fi

# 检查前端HTTPS
if curl -k -s https://localhost:443/ > /dev/null 2>&1; then
    echo "✅ 前端HTTPS服务正常 (端口 443)"
else
    echo "❌ 前端HTTPS服务异常"
fi

# 检查前端HTTP
if curl -s http://localhost:80/ > /dev/null 2>&1; then
    echo "✅ 前端HTTP服务正常 (端口 80)"
else
    echo "❌ 前端HTTP服务异常"
fi

echo ""
echo "🎉 生产环境启动完成！"
echo "=================================================="
echo "🌐 访问地址："
echo "   前端界面 (HTTPS): https://localhost:443"
echo "   前端界面 (HTTP):  http://localhost:80"
echo "   后端API:          http://localhost:8012/api/"
echo "   管理后台:         http://localhost:8012/admin/"
echo ""
echo "🔧 管理命令："
echo "   查看日志: docker-compose -f docker-compose.prod.yml logs -f"
echo "   停止服务: docker-compose -f docker-compose.prod.yml down"
echo "   重启服务: docker-compose -f docker-compose.prod.yml restart"
echo ""
echo "📊 服务状态："
docker-compose -f docker-compose.prod.yml ps
echo ""
echo "💡 提示："
echo "   1. 首次访问可能需要接受HTTPS证书"
echo "   2. 确保防火墙开放端口 80, 443, 8012"
echo "   3. 生产环境使用PostgreSQL数据库"
echo "   4. 所有数据持久化存储在Docker卷中"
echo ""
