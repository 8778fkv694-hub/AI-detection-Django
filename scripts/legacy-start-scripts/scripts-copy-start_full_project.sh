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

# 检查npm是否安装
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装，请先安装npm"
    exit 1
fi

echo "✅ 环境检查通过"

# 清理可能存在的旧进程
echo "🧹 清理可能存在的旧进程..."
if [ -f "django.pid" ]; then
    OLD_PID=$(cat django.pid)
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo "🛑 停止旧的Django进程 (PID: $OLD_PID)"
        kill $OLD_PID 2>/dev/null || true
    fi
    rm -f django.pid
fi

if [ -f "react.pid" ]; then
    OLD_PID=$(cat react.pid)
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo "🛑 停止旧的React进程 (PID: $OLD_PID)"
        kill $OLD_PID 2>/dev/null || true
    fi
    rm -f react.pid
fi

if [ -f "nodejs.pid" ]; then
    OLD_PID=$(cat nodejs.pid)
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo "🛑 停止旧的Node.js进程 (PID: $OLD_PID)"
        kill $OLD_PID 2>/dev/null || true
    fi
    rm -f nodejs.pid
fi

if [ -f "rpa.pid" ]; then
    OLD_PID=$(cat rpa.pid)
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo "🛑 停止旧的RPA进程 (PID: $OLD_PID)"
        kill $OLD_PID 2>/dev/null || true
    fi
    rm -f rpa.pid
fi

# 等待进程完全停止
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

# 检查Django是否启动成功（多次重试）
echo "🔍 检查Django后端状态..."
DJANGO_STARTED=false
for i in {1..10}; do
    if curl -s http://localhost:8000/api/standards/ > /dev/null 2>&1; then
        echo "✅ Django后端启动成功，运行在 http://localhost:8000"
        DJANGO_STARTED=true
        break
    elif curl -s http://localhost:8000/ > /dev/null 2>&1; then
        echo "✅ Django后端启动成功，运行在 http://localhost:8000"
        DJANGO_STARTED=true
        break
    else
        echo "⏳ 等待Django启动... ($i/10)"
        sleep 3
    fi
done

if [ "$DJANGO_STARTED" = false ]; then
    echo "❌ Django后端启动失败，请检查日志文件: django.log"
    echo "📝 最后几行日志："
    tail -10 ../django.log
    echo ""
    echo "💡 建议："
    echo "   1. 检查端口8000是否被占用: lsof -i :8000"
    echo "   2. 检查Django配置是否正确"
    echo "   3. 手动启动Django: cd backend && python3 manage.py runserver 0.0.0.0:8000"
    exit 1
fi

# 返回项目根目录
cd ..

# 启动React前端
echo "🎨 启动React前端..."
# 确保在项目根目录
cd "/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django"

# 检查依赖是否安装
if [ ! -d "node_modules" ]; then
    echo "📥 安装Node.js依赖..."
    npm install
fi

# 启动React前端（后台运行）
echo "🚀 启动React前端服务器..."
npm run dev > react.log 2>&1 &
REACT_PID=$!
echo $REACT_PID > react.pid

# 等待React启动
echo "⏳ 等待React前端启动..."
sleep 10

# 检查React是否启动成功
echo "🔍 检查React前端状态..."
REACT_STARTED=false
for i in {1..5}; do
    if curl -s http://localhost:3303 > /dev/null 2>&1; then
        echo "✅ React前端启动成功，运行在 http://localhost:3303"
        REACT_STARTED=true
        break
    else
        echo "⏳ 等待React启动... ($i/5)"
        sleep 3
    fi
done

if [ "$REACT_STARTED" = false ]; then
    echo "⚠️  React前端可能启动失败，请检查日志: react.log"
else
    echo "🌐 自动打开前端页面: http://localhost:3303"
    open "http://localhost:3303" > /dev/null 2>&1 || true
fi

# 启动Node.js后端
echo "📡 启动Node.js后端..."
# 确保在项目根目录
cd "/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django"

if [ ! -d "node_modules" ]; then
    echo "📥 安装Node.js依赖..."
    npm install
fi

# 启动Node.js后端（后台运行）
echo "🚀 启动Node.js后端服务器..."
npm run dev:server > nodejs.log 2>&1 &
NODEJS_PID=$!
echo $NODEJS_PID > nodejs.pid

# 等待Node.js启动
echo "⏳ 等待Node.js后端启动..."
sleep 5

# 检查Node.js是否启动成功
echo "🔍 检查Node.js后端状态..."
NODEJS_STARTED=false
for i in {1..5}; do
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo "✅ Node.js后端启动成功，运行在 http://localhost:3001"
        NODEJS_STARTED=true
        break
    else
        echo "⏳ 等待Node.js启动... ($i/5)"
        sleep 3
    fi
done

if [ "$NODEJS_STARTED" = false ]; then
    echo "⚠️  Node.js后端可能启动失败，请检查日志: nodejs.log"
fi

# 启动RPA服务器
echo "📁 启动RPA文件管理服务器..."
node rpa-server.js > rpa.log 2>&1 &
RPA_PID=$!
echo $RPA_PID > rpa.pid

# 等待RPA服务器启动
echo "⏳ 等待RPA服务器启动..."
sleep 3

# 检查RPA服务器是否启动成功
echo "🔍 检查RPA服务器状态..."
RPA_STARTED=false
for i in {1..3}; do
    if curl -s http://localhost:3002/api/rpa/open-temp-folder > /dev/null 2>&1; then
        echo "✅ RPA服务器启动成功，运行在 http://localhost:3002"
        RPA_STARTED=true
        break
    else
        echo "⏳ 等待RPA服务器启动... ($i/3)"
        sleep 2
    fi
done

if [ "$RPA_STARTED" = false ]; then
    echo "⚠️  RPA服务器可能启动失败，请检查日志: rpa.log"
fi

echo ""
echo "🎉 项目启动完成！"
echo ""
echo "📱 访问地址："
echo "   前端界面: http://localhost:3303"
echo "   Node.js后端: http://localhost:3001"
echo "   Django后端API:  http://localhost:8000/api/"
echo "   RPA文件管理: http://localhost:3002"
echo "   管理后台: http://localhost:8000/admin"
echo ""
echo "📊 数据同步状态: http://localhost:8000/api/sync/status/"
echo ""
echo "📝 日志文件："
echo "   Django后端: django.log"
echo "   React前端:  react.log"
echo "   Node.js后端: nodejs.log"
echo "   RPA服务器: rpa.log"
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

if [ -f "react.pid" ]; then
    REACT_PID=$(cat react.pid)
    if ps -p $REACT_PID > /dev/null; then
        echo "   React前端:  运行中 (PID: $REACT_PID)"
    else
        echo "   React前端:  已停止"
    fi
fi

if [ -f "nodejs.pid" ]; then
    NODEJS_PID=$(cat nodejs.pid)
    if ps -p $NODEJS_PID > /dev/null; then
        echo "   Node.js后端: 运行中 (PID: $NODEJS_PID)"
    else
        echo "   Node.js后端: 已停止"
    fi
fi

if [ -f "rpa.pid" ]; then
    RPA_PID=$(cat rpa.pid)
    if ps -p $RPA_PID > /dev/null; then
        echo "   RPA服务器: 运行中 (PID: $RPA_PID)"
    else
        echo "   RPA服务器: 已停止"
    fi
fi

echo ""
echo "💡 提示："
echo "   1. 首次访问前端可能需要接受HTTPS证书"
echo "   2. 如果遇到问题，请检查日志文件"
echo "   3. 数据会自动同步，无需手动操作"
echo "   4. 前端端口已更改为3303"
echo ""
