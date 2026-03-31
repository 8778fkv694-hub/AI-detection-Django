#!/bin/bash

echo "🚀 启动完整的AI检测项目..."

# 检查Python3是否安装
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装，请先安装Python3"
    exit 1
fi

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装Node.js"
    exit 1
fi

echo "✅ 环境检查通过"

# 停止可能正在运行的服务
echo "🛑 停止可能正在运行的服务..."
pkill -f "manage.py runserver" 2>/dev/null || true
pkill -f "nodemon" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

# 等待端口释放
sleep 2

# 启动Django后端
echo "🔧 启动Django后端..."
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

# 启动Django后端（后台运行）
echo "🚀 启动Django后端服务器..."
python3 manage.py runserver 0.0.0.0:8000 > ../django.log 2>&1 &
DJANGO_PID=$!
echo $DJANGO_PID > ../django.pid

# 等待Django启动
echo "⏳ 等待Django后端启动..."
sleep 8

# 检查Django是否启动成功
if ! curl -s http://localhost:8000/api/standards/ > /dev/null; then
    echo "❌ Django后端启动失败，请检查日志: django.log"
    exit 1
fi

echo "✅ Django后端启动成功，运行在 http://localhost:8000"

# 返回项目根目录
cd ..

# 启动React前端和Node.js服务器
echo "🎨 启动前端服务..."
npm run dev > frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > frontend.pid

# 等待前端启动
echo "⏳ 等待前端服务启动..."
sleep 10

# 检查前端是否启动成功
if ! curl -s http://localhost:3303 > /dev/null; then
    echo "⚠️  前端可能启动失败，请检查日志: frontend.log"
else
    echo "✅ 前端启动成功，运行在 http://localhost:3303"
fi

echo ""
echo "🎉 项目启动完成！"
echo ""
echo "📱 访问地址："
echo "   前端界面: http://localhost:3303"
echo "   后端API:  http://localhost:8000/api/"
echo "   管理后台: http://localhost:8000/admin"
echo ""
echo "📝 日志文件："
echo "   Django后端: django.log"
echo "   前端服务:   frontend.log"
echo ""
echo "🛑 停止服务: ./stop_services.sh"
echo ""

# 显示进程状态
echo "🔍 当前运行状态："
if [ -f "django.pid" ]; then
    DJANGO_PID=$(cat django.pid)
    if ps -p $DJANGO_PID > /dev/null; then
        echo "   Django后端: 运行中 (PID: $DJANGO_PID)"
    else
        echo "   Django后端: 已停止"
    fi
fi

if [ -f "frontend.pid" ]; then
    FRONTEND_PID=$(cat frontend.pid)
    if ps -p $FRONTEND_PID > /dev/null; then
        echo "   前端服务:  运行中 (PID: $FRONTEND_PID)"
    else
        echo "   前端服务:  已停止"
    fi
fi

echo ""
echo "💡 提示："
echo "   1. 首次访问前端可能需要接受HTTPS证书"
echo "   2. 如果遇到问题，请检查日志文件"
echo "   3. 数据会自动同步，无需手动操作"
echo ""
