#!/bin/bash

# 启动本地AI服务（Ollama + 代理）
# 解决HTTPS页面访问HTTP Ollama服务的CORS问题

echo "=== 启动本地AI服务 ==="

# 检查依赖
if ! command -v node &> /dev/null; then
    echo "❌ Node.js未安装，请先安装Node.js"
    exit 1
fi

if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama未安装，请先安装Ollama"
    echo "安装命令:"
    echo "  macOS: brew install ollama"
    echo "  Linux: curl -fsSL https://ollama.ai/install.sh | sh"
    exit 1
fi

# 安装代理服务依赖
echo "📦 检查代理服务依赖..."
if [ ! -d "node_modules" ]; then
    echo "安装依赖包..."
    npm install express cors http-proxy-middleware
fi

# 启动Ollama服务
echo "🚀 启动Ollama服务..."
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama服务已在运行"
else
    nohup ollama serve > ollama.log 2>&1 &
    OLLAMA_PID=$!
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

# 启动代理服务
echo "🌐 启动代理服务..."
if curl -s http://localhost:11437/api/tags > /dev/null 2>&1; then
    echo "✅ 代理服务已在运行"
else
    nohup node ollama-proxy.js > ollama-proxy.log 2>&1 &
    PROXY_PID=$!
    echo "⏳ 等待代理服务启动..."
    for i in {1..10}; do
        if curl -s http://localhost:11437/api/tags > /dev/null 2>&1; then
            echo "✅ 代理服务启动成功!"
            break
        fi
        sleep 1
        echo -n "."
    done
fi

echo ""
echo "🎉 本地AI服务启动完成!"
echo "📡 Ollama服务: http://localhost:11434"
echo "🌐 代理服务: http://localhost:11437"
echo "💬 聊天接口: http://localhost:11437/api/chat"
echo "🔍 模型列表: http://localhost:11437/api/tags"
echo ""
echo "📝 日志文件:"
echo "  - Ollama: ollama.log"
echo "  - 代理: ollama-proxy.log"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 保持脚本运行
trap 'echo ""; echo "🛑 停止所有服务..."; kill $OLLAMA_PID $PROXY_PID 2>/dev/null; exit 0' INT

while true; do
    sleep 10
    # 检查服务是否还在运行
    if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "❌ Ollama服务意外停止"
        exit 1
    fi
    if ! curl -s http://localhost:11437/api/tags > /dev/null 2>&1; then
        echo "❌ 代理服务意外停止"
        exit 1
    fi
done
