#!/bin/bash

# 停止AI检测项目服务 (Conda环境版本)

echo "🛑 停止AI检测项目服务..."
echo "=========================="

# 停止Django后端
if [ -f django.pid ]; then
    DJANGO_PID=$(cat django.pid)
    if kill -0 $DJANGO_PID 2>/dev/null; then
        kill $DJANGO_PID
        echo "✅ Django后端已停止 (PID: $DJANGO_PID)"
    else
        echo "⚠️ Django后端进程不存在"
    fi
    rm -f django.pid
else
    echo "⚠️ Django PID文件不存在"
fi

# 停止React前端
if [ -f react.pid ]; then
    REACT_PID=$(cat react.pid)
    if kill -0 $REACT_PID 2>/dev/null; then
        kill $REACT_PID
        echo "✅ React前端已停止 (PID: $REACT_PID)"
    else
        echo "⚠️ React前端进程不存在"
    fi
    rm -f react.pid
else
    echo "⚠️ React PID文件不存在"
fi

# 停止Node.js后端
if [ -f nodejs.pid ]; then
    NODE_PID=$(cat nodejs.pid)
    if kill -0 $NODE_PID 2>/dev/null; then
        kill $NODE_PID
        echo "✅ Node.js后端已停止 (PID: $NODE_PID)"
    else
        echo "⚠️ Node.js后端进程不存在"
    fi
    rm -f nodejs.pid
else
    echo "⚠️ Node.js PID文件不存在"
fi

# 停止RPA服务器
if [ -f rpa.pid ]; then
    RPA_PID=$(cat rpa.pid)
    if kill -0 $RPA_PID 2>/dev/null; then
        kill $RPA_PID
        echo "✅ RPA服务器已停止 (PID: $RPA_PID)"
    else
        echo "⚠️ RPA服务器进程不存在"
    fi
    rm -f rpa.pid
else
    echo "⚠️ RPA PID文件不存在"
fi

# 停止Ollama代理
if [ -f ollama-proxy.pid ]; then
    PROXY_PID=$(cat ollama-proxy.pid)
    if kill -0 $PROXY_PID 2>/dev/null; then
        kill $PROXY_PID
        echo "✅ Ollama代理已停止 (PID: $PROXY_PID)"
    else
        echo "⚠️ Ollama代理进程不存在"
    fi
    rm -f ollama-proxy.pid
else
    echo "⚠️ Ollama代理PID文件不存在"
fi

# 停止Ollama服务
if [ -f ollama.pid ]; then
    OLLAMA_PID=$(cat ollama.pid)
    if kill -0 $OLLAMA_PID 2>/dev/null; then
        kill $OLLAMA_PID
        echo "✅ Ollama服务已停止 (PID: $OLLAMA_PID)"
    else
        echo "⚠️ Ollama服务进程不存在"
    fi
    rm -f ollama.pid
else
    echo "⚠️ Ollama PID文件不存在"
fi

# 强制清理可能残留的进程
echo "🧹 清理残留进程..."
pkill -f "python.*manage.py.*runserver" 2>/dev/null && echo "✅ 清理Django进程" || true
pkill -f "node.*vite" 2>/dev/null && echo "✅ 清理Vite进程" || true
pkill -f "node.*nodemon" 2>/dev/null && echo "✅ 清理Nodemon进程" || true
pkill -f "node.*deploy.js" 2>/dev/null && echo "✅ 清理Node.js部署进程" || true
pkill -f "node.*rpa-server.js" 2>/dev/null && echo "✅ 清理RPA进程" || true
pkill -f "node.*ollama-proxy.js" 2>/dev/null && echo "✅ 清理Ollama代理进程" || true
pkill -f "ollama serve" 2>/dev/null && echo "✅ 清理Ollama服务进程" || true

echo ""
echo "🎉 所有服务已停止！"
echo ""
echo "💡 提示："
echo "   1. 所有PID文件已清理"
echo "   2. 残留进程已强制清理"
echo "   3. 可以重新运行启动脚本"
echo ""
