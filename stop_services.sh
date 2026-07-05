#!/bin/bash

echo "🛑 停止AI检测项目服务..."

# 停止Django后端
if [ -f "django.pid" ]; then
    DJANGO_PID=$(cat django.pid)
    if ps -p $DJANGO_PID > /dev/null; then
        echo "🛑 停止Django后端 (PID: $DJANGO_PID)..."
        kill $DJANGO_PID
        rm django.pid
    else
        echo "Django后端未运行"
        rm -f django.pid
    fi
else
    echo "Django后端未运行"
fi

# 停止Node.js后端
if [ -f "nodejs.pid" ]; then
    NODEJS_PID=$(cat nodejs.pid)
    if ps -p $NODEJS_PID > /dev/null; then
        echo "🛑 停止Node.js后端 (PID: $NODEJS_PID)..."
        kill $NODEJS_PID
        rm nodejs.pid
    else
        echo "Node.js后端未运行"
        rm -f nodejs.pid
    fi
else
    echo "Node.js后端未运行"
fi

# 停止React前端
if [ -f "react.pid" ]; then
    REACT_PID=$(cat react.pid)
    if ps -p $REACT_PID > /dev/null; then
        echo "🛑 停止React前端 (PID: $REACT_PID)..."
        kill $REACT_PID
        rm react.pid
    else
        echo "React前端未运行"
        rm -f react.pid
    fi
else
    echo "React前端未运行"
fi

# 停止Ollama代理服务
if [ -f "ollama-proxy.pid" ]; then
    PROXY_PID=$(cat ollama-proxy.pid)
    if ps -p $PROXY_PID > /dev/null; then
        echo "🛑 停止Ollama代理服务 (PID: $PROXY_PID)..."
        kill $PROXY_PID
        rm ollama-proxy.pid
    else
        echo "Ollama代理服务未运行"
        rm -f ollama-proxy.pid
    fi
else
    echo "Ollama代理服务未运行"
fi

# 停止Ollama服务
if [ -f "ollama.pid" ]; then
    OLLAMA_PID=$(cat ollama.pid)
    if ps -p $OLLAMA_PID > /dev/null; then
        echo "🛑 停止Ollama服务 (PID: $OLLAMA_PID)..."
        kill $OLLAMA_PID
        rm ollama.pid
    else
        echo "Ollama服务未运行"
        rm -f ollama.pid
    fi
else
    echo "Ollama服务未运行"
fi

# 停止RPA服务器
if [ -f "rpa.pid" ]; then
    RPA_PID=$(cat rpa.pid)
    if ps -p $RPA_PID > /dev/null; then
        echo "🛑 停止RPA服务器 (PID: $RPA_PID)..."
        kill $RPA_PID
        rm rpa.pid
    else
        echo "RPA服务器未运行"
        rm -f rpa.pid
    fi
else
    echo "RPA服务器未运行"
fi

# 停止SPA生产预览服务
if [ -f "spa.pid" ]; then
    SPA_PID=$(cat spa.pid)
    if ps -p $SPA_PID > /dev/null; then
        echo "🛑 停止SPA生产预览服务 (PID: $SPA_PID)..."
        kill $SPA_PID
        rm spa.pid
    else
        echo "SPA生产预览服务未运行"
        rm -f spa.pid
    fi
else
    echo "SPA生产预览服务未运行"
fi

# 停止Node流媒体服务
if [ -f "stream.pid" ]; then
    STREAM_PID=$(cat stream.pid)
    if ps -p $STREAM_PID > /dev/null; then
        echo "🛑 停止Node流媒体服务 (PID: $STREAM_PID)..."
        kill $STREAM_PID
        rm stream.pid
    else
        echo "Node流媒体服务未运行"
        rm -f stream.pid
    fi
else
    echo "Node流媒体服务未运行"
fi

# 强制停止相关进程
echo "🔧 强制停止相关进程..."
pkill -f "manage.py runserver" 2>/dev/null || true
pkill -f "nodemon" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true
pkill -f "ollama serve" 2>/dev/null || true
pkill -f "ollama-proxy.js" 2>/dev/null || true
pkill -f "rpa-server.js" 2>/dev/null || true
pkill -f "serve_spa.py" 2>/dev/null || true
pkill -f "nodejs-stream-service/src/index.js" 2>/dev/null || true

echo "✅ 所有服务已停止"
