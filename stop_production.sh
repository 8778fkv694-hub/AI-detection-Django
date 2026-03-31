#!/bin/bash

# 停止生产环境服务脚本

echo "🛑 停止生产环境服务..."

# 停止前端服务
if [ -f "frontend.pid" ]; then
    FRONTEND_PID=$(cat frontend.pid)
    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "🛑 停止前端HTTP服务 (PID: $FRONTEND_PID)"
        kill $FRONTEND_PID
        rm -f frontend.pid
    fi
fi

if [ -f "frontend_https.pid" ]; then
    FRONTEND_HTTPS_PID=$(cat frontend_https.pid)
    if kill -0 $FRONTEND_HTTPS_PID 2>/dev/null; then
        echo "🛑 停止前端HTTPS服务 (PID: $FRONTEND_HTTPS_PID)"
        kill $FRONTEND_HTTPS_PID
        rm -f frontend_https.pid
    fi
fi

# 停止后端服务
echo "🛑 停止后端服务..."
pkill -f "gunicorn" 2>/dev/null || true
pkill -f "python.*http.server" 2>/dev/null || true

# 等待进程完全停止
sleep 2

echo "✅ 所有服务已停止"
