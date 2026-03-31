#!/bin/bash

echo "🧹 清理Node.js后端残留..."

# 停止所有Node.js相关进程
echo "🛑 停止Node.js进程..."
pkill -f "node.*server" 2>/dev/null
pkill -f "node.*https-server" 2>/dev/null
pkill -f "node.*api" 2>/dev/null
pkill -f "npm.*start" 2>/dev/null

# 检查是否还有Node.js进程
NODE_PROCESSES=$(ps aux | grep -E "(node|npm)" | grep -v grep | grep -v "Cursor" | grep -v "vscode")
if [ ! -z "$NODE_PROCESSES" ]; then
    echo "⚠️  发现以下Node.js进程，正在强制停止..."
    echo "$NODE_PROCESSES"
    pkill -9 -f "node.*server" 2>/dev/null
    pkill -9 -f "node.*https-server" 2>/dev/null
    pkill -9 -f "node.*api" 2>/dev/null
fi

# 检查端口占用
echo "🔍 检查端口占用情况..."
echo "端口3000 (Node.js):"
lsof -i :3000 2>/dev/null || echo "   未占用"
echo "端口8443 (Node.js HTTPS):"
lsof -i :8443 2>/dev/null || echo "   未占用"
echo "端口8000 (Django):"
lsof -i :8000 2>/dev/null || echo "   未占用"
echo "端口3002 (React):"
lsof -i :3002 2>/dev/null || echo "   未占用"

# 清理可能的残留文件
echo "🗑️  清理残留文件..."
if [ -f "server.pid" ]; then
    rm -f server.pid
    echo "   删除 server.pid"
fi

if [ -f "node.pid" ]; then
    rm -f node.pid
    echo "   删除 node.pid"
fi

# 检查server目录是否还存在
if [ -d "server" ]; then
    echo "⚠️  发现server目录，建议删除："
    echo "   rm -rf server"
    echo "   注意：这会删除所有Node.js后端文件"
fi

echo ""
echo "✅ Node.js后端清理完成！"
echo ""
echo "📊 当前状态："
echo "   Django后端: 运行在8000端口"
echo "   Node.js后端: 已完全清理"
echo "   React前端: 可启动在3002端口"
echo ""
echo "💡 下一步："
echo "   1. 启动完整项目: ./start_full_project.sh"
echo "   2. 或只启动Django: ./start_django_only.sh"
echo ""
