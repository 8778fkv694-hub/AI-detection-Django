#!/bin/bash

echo "🐳 开始构建AI检测系统Docker镜像（阿里云源优化版）..."

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker未安装，请先安装Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose未安装，请先安装Docker Compose"
    exit 1
fi

# 设置环境变量
export COMPOSE_FILE=docker-compose.aliyun.yml
export COMPOSE_PROJECT_NAME=wyl-ai-detection

# 停止现有容器
echo "🛑 停止现有容器..."
docker-compose -f docker-compose.aliyun.yml down

# 清理旧镜像（可选）
read -p "是否清理旧的Docker镜像？(y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🧹 清理旧镜像..."
    docker system prune -f
    docker image prune -f
fi

# 构建镜像
echo "🔨 构建Docker镜像..."
docker-compose -f docker-compose.aliyun.yml build --no-cache

# 检查构建结果
if [ $? -eq 0 ]; then
    echo "✅ Docker镜像构建成功！"
    
    # 显示镜像信息
    echo ""
    echo "📦 构建的镜像："
    docker images | grep wyl-ai-detection
    
    # 询问是否启动服务
    read -p "是否立即启动服务？(y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🚀 启动服务..."
        docker-compose -f docker-compose.aliyun.yml up -d
        
        echo ""
        echo "🎉 服务启动完成！"
        echo ""
        echo "📱 访问地址："
        echo "   前端界面: http://localhost"
        echo "   后端API:  http://localhost:8012/api/"
        echo "   管理后台: http://localhost:8012/admin"
        echo ""
        echo "📊 服务状态："
        docker-compose -f docker-compose.aliyun.yml ps
    fi
else
    echo "❌ Docker镜像构建失败！"
    exit 1
fi
