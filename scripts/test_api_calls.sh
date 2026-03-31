#!/bin/bash

echo "🔌 测试API调用功能"
echo "=================="
echo "测试前端是否能正确调用本地Django后端API"
echo ""

# 获取本机局域网IP地址
LAN_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
if [ -z "$LAN_IP" ]; then
    LAN_IP="192.168.1.100"  # 默认IP
fi

echo "🌐 检测到局域网IP: $LAN_IP"
echo ""

# 测试本地Django API
echo "🔍 测试本地Django API..."
echo "1. 测试API根路径..."
if curl -s http://127.0.0.1:8000/api/ > /dev/null; then
    echo "✅ 本地Django API可访问"
else
    echo "❌ 本地Django API无法访问"
    echo "请确保Django后端正在运行"
    exit 1
fi

# 测试检测结果API
echo "2. 测试检测结果API..."
if curl -s http://127.0.0.1:8000/api/results/ > /dev/null; then
    echo "✅ 检测结果API可访问"
else
    echo "❌ 检测结果API无法访问"
fi

# 测试同步状态API
echo "3. 测试同步状态API..."
if curl -s http://127.0.0.1:8000/api/sync/status/ > /dev/null; then
    echo "✅ 同步状态API可访问"
else
    echo "❌ 同步状态API无法访问"
fi

echo ""
echo "🔍 测试前端代理配置..."
echo "1. 测试本机前端..."
if curl -s http://localhost:3002 > /dev/null; then
    echo "✅ 本机前端可访问"
else
    echo "❌ 本机前端无法访问"
    echo "请确保前端服务正在运行"
    exit 1
fi

echo "2. 测试局域网前端..."
if curl -s http://$LAN_IP:3002 > /dev/null; then
    echo "✅ 局域网前端可访问"
else
    echo "❌ 局域网前端无法访问"
fi

echo ""
echo "🧪 API调用测试完成！"
echo "=================="
echo "💡 测试说明:"
echo "   - 前端在局域网运行"
echo "   - API请求通过代理转发到本地Django"
echo "   - 所有数据操作都在本地Django后端"
echo ""
echo "🌐 访问地址:"
echo "   本机前端: http://localhost:3002"
echo "   局域网前端: http://$LAN_IP:3002"
echo "   本地Django API: http://127.0.0.1:8000/api/"
echo ""
echo "🔧 下一步测试:"
echo "1. 在局域网设备上打开前端页面"
echo "2. 尝试进行一些操作（如查看检测结果）"
echo "3. 检查浏览器开发者工具中的网络请求"
echo "4. 确认API请求都指向本地Django后端"
