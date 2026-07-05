#!/bin/bash

echo "🚀 启动完整的AI检测项目（包含Ollama代理服务）..."

# 检查依赖
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装，请先安装Python3"
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装，请先安装Node.js"
    exit 1
fi

if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama 未安装，请先安装Ollama"
    echo "安装命令:"
    echo "  macOS: brew install ollama"
    echo "  Linux: curl -fsSL https://ollama.ai/install.sh | sh"
    exit 1
fi

echo "✅ 环境检查通过"

# 1. 启动Ollama服务
echo "🤖 启动Ollama服务..."
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama服务已在运行"
else
    echo "🚀 启动Ollama服务..."
    nohup ollama serve > ollama.log 2>&1 &
    OLLAMA_PID=$!
    echo $OLLAMA_PID > ollama.pid
    
    # 等待Ollama启动
    echo "⏳ 等待Ollama服务启动..."
    for i in {1..30}; do
        if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo "✅ Ollama服务启动成功!"
            break
        fi
        sleep 1
        echo -n "."
    done
fi

# 2. 启动Ollama代理服务
echo "🌐 启动Ollama代理服务..."
if curl -s http://localhost:11437/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama代理服务已在运行"
else
    echo "🚀 启动Ollama代理服务..."
    nohup node ollama-proxy.js > ollama-proxy.log 2>&1 &
    PROXY_PID=$!
    echo $PROXY_PID > ollama-proxy.pid
    
    # 等待代理服务启动
    echo "⏳ 等待代理服务启动..."
    for i in {1..10}; do
        if curl -s http://localhost:11437/api/tags > /dev/null 2>&1; then
            echo "✅ Ollama代理服务启动成功!"
            break
        fi
        sleep 1
        echo -n "."
    done
fi

# 3. 启动Django后端
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
sleep 5

# 检查Django是否启动成功
if ! curl -s http://localhost:8000/api/standards/ > /dev/null; then
    echo "❌ Django后端启动失败"
    exit 1
fi

echo "✅ Django后端启动成功，运行在 http://localhost:8000"

# 返回项目根目录
cd ..

# 4. 启动React前端
echo "🎨 启动React前端..."
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
if ! curl -s http://localhost:3303 > /dev/null; then
    echo "⚠️  React前端可能启动失败，请检查日志"
else
    echo "✅ React前端启动成功，运行在 http://localhost:3303"
fi

# 5. 启动Node.js后端
echo "📡 启动Node.js后端..."
# 启动Node.js后端（后台运行）
echo "🚀 启动Node.js后端服务器..."
npm run dev:server > nodejs.log 2>&1 &
NODEJS_PID=$!
echo $NODEJS_PID > nodejs.pid

# 等待Node.js启动
echo "⏳ 等待Node.js后端启动..."
sleep 5

# 检查Node.js是否启动成功
if ! curl -s http://localhost:3001/health > /dev/null; then
    echo "⚠️  Node.js后端可能启动失败，请检查日志"
else
    echo "✅ Node.js后端启动成功，运行在 http://localhost:3001"
fi

echo ""
echo "🎉 所有服务启动完成！"
echo ""
echo "📱 访问地址："
echo "   前端界面: http://localhost:3303"
echo "   Node.js后端: http://localhost:3001"
echo "   Django后端API: http://localhost:8000/api/"
echo "   Ollama服务: http://localhost:11434"
echo "   Ollama代理: http://localhost:11437"
echo "   管理后台: http://localhost:8000/admin"
echo ""
echo "📊 数据同步状态: http://localhost:8000/api/sync/status/"
echo ""
echo "📝 日志文件："
echo "   Django后端: django.log"
echo "   React前端: react.log"
echo "   Node.js后端: nodejs.log"
echo "   Ollama服务: ollama.log"
echo "   Ollama代理: ollama-proxy.log"
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

if [ -f "ollama.pid" ]; then
    OLLAMA_PID=$(cat ollama.pid)
    if ps -p $OLLAMA_PID > /dev/null; then
        echo "   Ollama服务: 运行中 (PID: $OLLAMA_PID)"
    else
        echo "   Ollama服务: 已停止"
    fi
fi

if [ -f "ollama-proxy.pid" ]; then
    PROXY_PID=$(cat ollama-proxy.pid)
    if ps -p $PROXY_PID > /dev/null; then
        echo "   Ollama代理: 运行中 (PID: $PROXY_PID)"
    else
        echo "   Ollama代理: 已停止"
    fi
fi

echo ""
echo "💡 提示："
echo "   1. 首次访问前端可能需要接受HTTPS证书"
echo "   2. 如果遇到问题，请检查日志文件"
echo "   3. 数据会自动同步，无需手动操作"
echo "   4. 本地模型现在可以通过代理服务正常访问"
echo "   5. 使用 ./stop_services.sh 停止所有服务"
echo ""
