#!/bin/bash

# AI检测项目 - Conda环境启动脚本
# 使用Conda环境启动完整项目

echo "🚀 启动AI检测项目 (Conda环境)"
echo "================================"

# 检查Conda是否安装
if ! command -v conda &> /dev/null; then
    echo "❌ 错误: Conda未安装或未在PATH中"
    exit 1
fi

# 初始化Conda
echo "📦 初始化Conda环境..."
source $(conda info --base)/etc/profile.d/conda.sh

# 激活Conda环境
echo "🔌 激活Conda环境: ai-detection"
conda activate ai-detection

# 检查环境是否激活成功
if [[ "$CONDA_DEFAULT_ENV" != "ai-detection" ]]; then
    echo "❌ 错误: 无法激活ai-detection环境"
    echo "请先创建环境: conda create -n ai-detection python=3.11"
    exit 1
fi

echo "✅ Conda环境已激活: $CONDA_DEFAULT_ENV"
echo "🐍 Python版本: $(python --version)"
echo "📁 工作目录: $(pwd)"

# 检查必要的包
echo "🔍 检查依赖包..."
python -c "
import sys
try:
    import cv2, torch, numpy, django, paddleocr, ultralytics
    print('✅ 所有依赖包检查通过')
    print('OpenCV:', cv2.__version__)
    print('PyTorch:', torch.__version__)
    print('Django:', django.get_version())
except ImportError as e:
    print(f'❌ 依赖包检查失败: {e}')
    print('请运行: pip install -r backend/requirements.txt')
    sys.exit(1)
"

if [ $? -ne 0 ]; then
    echo "❌ 依赖包检查失败，请重新安装"
    exit 1
fi

# 清理可能存在的旧进程
echo "🧹 清理可能存在的旧进程..."
pkill -f "python.*manage.py.*runserver" 2>/dev/null || true
pkill -f "node.*vite" 2>/dev/null || true
pkill -f "node.*nodemon" 2>/dev/null || true
pkill -f "ollama" 2>/dev/null || true

# 等待进程完全停止
sleep 2

echo ""
echo "🎯 启动服务..."

# 跳过Ollama服务启动（手动启动）
echo "⏭️ 跳过Ollama服务启动（需要时请手动启动）"
echo "💡 手动启动Ollama: ollama serve"
echo "💡 手动启动Ollama代理: node ollama-proxy.js"

# 启动Django后端
echo "🔧 启动Django后端..."
cd backend
python manage.py migrate --noinput
python manage.py runserver 0.0.0.0:8000 > ../django.log 2>&1 &
DJANGO_PID=$!
echo $DJANGO_PID > ../django.pid
cd ..
echo "✅ Django后端已启动 (PID: $DJANGO_PID)"

# 等待Django启动
echo "⏳ 等待Django后端启动..."
sleep 5

# 检查Django状态
echo "🔍 检查Django后端状态..."
if curl -s http://localhost:8000 > /dev/null; then
    echo "✅ Django后端启动成功，运行在 http://localhost:8000"
else
    echo "⚠️ Django后端可能还在启动中..."
fi

# 启动React前端
echo "🎨 启动React前端..."
npm run dev > react.log 2>&1 &
REACT_PID=$!
echo $REACT_PID > react.pid
echo "✅ React前端已启动 (PID: $REACT_PID)"

# 等待React启动
echo "⏳ 等待React前端启动..."
sleep 8

# 检查React状态
echo "🔍 检查React前端状态..."
if curl -s http://localhost:3303 > /dev/null; then
    echo "✅ React前端启动成功，运行在 http://localhost:3303"
else
    echo "⚠️ React前端可能还在启动中..."
fi

# 启动Node.js后端
echo "📡 启动Node.js后端..."
node deploy.js > nodejs.log 2>&1 &
NODE_PID=$!
echo $NODE_PID > nodejs.pid
echo "✅ Node.js后端已启动 (PID: $NODE_PID)"

# 等待Node.js启动
echo "⏳ 等待Node.js后端启动..."
sleep 5

# 检查Node.js状态
echo "🔍 检查Node.js后端状态..."
if curl -s http://localhost:3001 > /dev/null; then
    echo "✅ Node.js后端启动成功，运行在 http://localhost:3001"
else
    echo "⚠️ Node.js后端可能还在启动中..."
fi

# 启动RPA服务器
echo "📁 启动RPA文件管理服务器..."
node rpa-server.js > rpa.log 2>&1 &
RPA_PID=$!
echo $RPA_PID > rpa.pid
echo "✅ RPA服务器已启动 (PID: $RPA_PID)"

# 等待RPA启动
echo "⏳ 等待RPA服务器启动..."
sleep 3

# 检查RPA状态
echo "🔍 检查RPA服务器状态..."
if curl -s http://localhost:3002 > /dev/null; then
    echo "✅ RPA服务器启动成功，运行在 http://localhost:3002"
else
    echo "⚠️ RPA服务器可能还在启动中..."
fi

echo ""
echo "🎉 项目启动完成！"
echo ""
echo "📱 访问地址："
echo "   前端界面: http://localhost:3303"
echo "   Node.js后端: http://localhost:3001"
echo "   Django后端API: http://localhost:8000/api/"
echo "   RPA文件管理: http://localhost:3002"
echo "   管理后台: http://localhost:8000/admin"
echo ""
echo "🤖 Ollama服务（需要时手动启动）："
echo "   Ollama服务: http://localhost:11434"
echo "   Ollama代理: http://localhost:11437"
echo ""
echo "📝 日志文件："
echo "   Django后端: django.log"
echo "   React前端: react.log"
echo "   Node.js后端: nodejs.log"
echo "   RPA服务器: rpa.log"
echo ""
echo "🛑 停止服务: ./stop_services.sh"
echo ""
echo "💡 提示："
echo "   1. 使用Conda环境: ai-detection"
echo "   2. 如果遇到问题，请检查日志文件"
echo "   3. 数据会自动同步，无需手动操作"
echo ""

# 自动打开前端页面
echo "🌐 自动打开前端页面..."
if command -v open &> /dev/null; then
    open http://localhost:3303
elif command -v xdg-open &> /dev/null; then
    xdg-open http://localhost:3303
fi

echo "按任意键关闭..."
read -n 1 -s
