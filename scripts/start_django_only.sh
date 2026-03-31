#!/bin/bash

echo "🔧 启动Django后端服务..."

# 检查Python3是否安装
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装，请先安装Python3"
    exit 1
fi

# 进入backend目录
cd backend

# 检查虚拟环境是否存在
if [ ! -d "venv" ]; then
    echo "📦 创建Python虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
echo "🔌 激活Python虚拟环境..."
source venv/bin/activate

# 安装依赖
echo "📥 安装Python依赖..."
pip install -r requirements.txt

# 检查数据库迁移
echo "🗄️ 检查数据库迁移..."
python3 manage.py makemigrations
python3 manage.py migrate

# 启动Django后端
echo "🚀 启动Django后端服务器..."
echo "📱 前端可以通过 http://localhost:8000 访问API"
echo "📊 管理后台: http://localhost:8000/admin"
echo ""
echo "按 Ctrl+C 停止服务..."

python3 manage.py runserver 0.0.0.0:8000
