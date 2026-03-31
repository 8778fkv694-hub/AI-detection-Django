#!/bin/bash

echo "🧪 测试局域网前端访问本地Django后端功能"
echo "=========================================="
echo "测试目标：前端在局域网运行，API调用本地Django后端"
echo ""

# 检查是否在正确的目录
if [ ! -f "package.json" ] || [ ! -d "backend" ]; then
    echo "❌ 错误：请在项目根目录运行此脚本"
    exit 1
fi

# 获取本机局域网IP地址
LAN_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
if [ -z "$LAN_IP" ]; then
    LAN_IP="192.168.1.100"  # 默认IP
fi

echo "🌐 检测到局域网IP: $LAN_IP"
echo ""

# 停止可能存在的进程
echo "🛑 停止现有进程..."
pkill -f "manage.py runserver" 2>/dev/null
pkill -f "vite" 2>/dev/null
pkill -f "nodemon" 2>/dev/null

# 启动本地Django后端
echo "🐍 启动本地Django后端..."
cd backend

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "❌ 虚拟环境不存在，请先创建"
    exit 1
fi

# 激活虚拟环境
source venv/bin/activate

# 启动Django（仅本地访问）
echo "启动Django后端（仅本地访问）..."
python manage.py runserver 127.0.0.1:8000 &
DJANGO_PID=$!

cd ..

# 等待Django启动
echo "等待Django后端启动..."
sleep 5

# 测试Django后端是否正常
echo "🔍 测试Django后端..."
if curl -s http://127.0.0.1:8000/api/ > /dev/null; then
    echo "✅ Django后端启动成功"
else
    echo "❌ Django后端启动失败"
    exit 1
fi

# 启动前端（支持局域网访问）
echo "⚛️ 启动前端服务（支持局域网访问）..."
npm run dev:client &
FRONTEND_PID=$!

# 等待前端启动
echo "等待前端服务启动..."
sleep 8

# 测试前端服务
echo "🔍 测试前端服务..."
if curl -s http://localhost:3002 > /dev/null; then
    echo "✅ 前端服务启动成功（本机访问）"
else
    echo "❌ 前端服务启动失败（本机访问）"
    exit 1
fi

# 测试局域网访问
echo "🔍 测试局域网访问..."
if curl -s http://$LAN_IP:3002 > /dev/null; then
    echo "✅ 前端服务启动成功（局域网访问）"
else
    echo "❌ 前端服务启动失败（局域网访问）"
fi

echo ""
echo "🧪 功能测试完成！"
echo "=========================================="
echo "🌐 访问地址:"
echo "   本机前端: http://localhost:3002"
echo "   局域网前端: http://$LAN_IP:3002"
echo "   本地Django API: http://127.0.0.1:8000/api/"
echo ""
echo "🔧 测试步骤:"
echo "1. 在本机打开 http://localhost:3002"
echo "2. 在局域网其他设备打开 http://$LAN_IP:3002"
echo "3. 在两个地址都进行一些操作（如查看检测结果）"
echo "4. 检查数据是否同步"
echo ""
echo "💡 预期结果:"
echo "   - 两个地址都能正常访问"
echo "   - 数据操作都通过本地Django后端"
echo "   - 数据完全同步"
echo ""
echo "按 Ctrl+C 停止所有服务"

# 等待用户中断
wait
