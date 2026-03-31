#!/bin/bash

echo "🔍 检查localhost和局域网端数据同步状态"
echo "=========================================="

# 获取本机局域网IP地址
LAN_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
if [ -z "$LAN_IP" ]; then
    LAN_IP="192.168.1.100"  # 默认IP
fi

echo "🌐 检测到局域网IP: $LAN_IP"
echo ""

# 检查Django后端是否运行
echo "📋 检查Django后端状态..."
if pgrep -f "manage.py runserver" > /dev/null; then
    echo "✅ Django后端正在运行"
else
    echo "❌ Django后端未运行"
    echo "请先启动Django后端"
    exit 1
fi

# 检查前端是否运行
echo "📋 检查前端状态..."
if pgrep -f "vite" > /dev/null; then
    echo "✅ 前端服务正在运行"
else
    echo "❌ 前端服务未运行"
    echo "请先启动前端服务"
    exit 1
fi

# 检查端口监听状态
echo "📋 检查端口监听状态..."
echo "Django后端端口8000:"
if lsof -i :8000 > /dev/null 2>&1; then
    echo "✅ 端口8000正在监听"
    lsof -i :8000 | grep LISTEN
else
    echo "❌ 端口8000未监听"
fi

echo ""
echo "前端端口3002:"
if lsof -i :3002 > /dev/null 2>&1; then
    echo "✅ 端口3002正在监听"
    lsof -i :3002 | grep LISTEN
else
    echo "❌ 端口3002未监听"
fi

echo ""
echo "🌐 测试访问地址:"
echo "本机访问:"
echo "  Django: http://localhost:8000/api/"
echo "  前端: http://localhost:3002"
echo ""
echo "局域网访问:"
echo "  Django: http://$LAN_IP:8000/api/"
echo "  前端: http://$LAN_IP:3002"

echo ""
echo "🔧 数据同步检查建议:"
echo "1. 确保两个地址都能正常访问"
echo "2. 检查浏览器控制台是否有错误"
echo "3. 检查网络请求是否正常"
echo "4. 如果仍有问题，请重启服务"

echo ""
echo "💡 重启服务命令:"
echo "停止服务: ./stop_services.sh"
echo "启动局域网服务: ./start_lan_results.sh"
