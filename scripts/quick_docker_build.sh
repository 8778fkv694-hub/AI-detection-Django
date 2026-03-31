#!/bin/bash

echo "🚀 快速构建AI检测系统Docker镜像（阿里云源）"

# 检查Docker
if ! command -v docker &> /dev/null; then
    echo "❌ 请先安装Docker"
    exit 1
fi

# 构建镜像
echo "🔨 构建镜像..."
docker build -f Dockerfile.aliyun -t wyl-ai-detection:latest .

if [ $? -eq 0 ]; then
    echo "✅ 构建成功！"
    echo ""
    echo "🐳 镜像信息："
    docker images | grep wyl-ai-detection
    echo ""
    echo "💡 使用方法："
    echo "   docker run -p 8012:8000 wyl-ai-detection:latest"
    echo "   或使用: ./docker_manage.sh start"
else
    echo "❌ 构建失败！"
    exit 1
fi
