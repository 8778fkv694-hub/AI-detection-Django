#!/bin/bash

# 快速启动脚本 - 使用Docker运行本地大模型

echo "=== 本地大模型快速启动 ==="

# 检查Docker是否安装
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装，请先安装 Docker Desktop"
    echo "下载地址: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# 检查Docker Compose是否安装
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装，请先安装 Docker Compose"
    exit 1
fi

echo "✅ Docker 环境检查通过"

# 创建模型缓存目录
mkdir -p models

echo "🚀 正在启动 Qwen2.5-VL-7B-Instruct 模型服务..."
echo "📡 服务地址: http://localhost:8000"
echo "⏹️  按 Ctrl+C 停止服务"
echo ""

# 启动Docker服务
docker-compose up --build

echo ""
echo "🛑 服务已停止"
