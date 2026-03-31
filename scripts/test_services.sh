#!/bin/bash

echo "🧪 WYL检测法服务测试脚本"
echo "=================================================="
echo "测试所有服务是否正常工作"
echo ""

# 获取本机局域网IP地址
LAN_IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)
if [ -z "$LAN_IP" ]; then
    LAN_IP="192.168.1.100"  # 默认IP
fi

echo "🌐 检测到局域网IP: $LAN_IP"
echo ""

# 测试1: Django后端API
echo "🔍 测试1: Django后端API"
echo "   地址: http://localhost:8000/api/"
if curl -s http://localhost:8000/api/ > /dev/null; then
    echo "   ✅ Django后端API正常"
else
    echo "   ❌ Django后端API异常"
fi
echo ""

# 测试2: HTTPS服务器API
echo "🔍 测试2: HTTPS服务器API"
echo "   地址: https://localhost:8443/api/"
if curl -k -s https://localhost:8443/api/ > /dev/null; then
    echo "   ✅ HTTPS服务器API正常"
else
    echo "   ❌ HTTPS服务器API异常"
fi
echo ""

# 测试3: 前端页面
echo "🔍 测试3: 前端页面"
echo "   地址: https://localhost:8443/"
if curl -k -s https://localhost:8443/ | grep -q "WYL 视觉质检系统"; then
    echo "   ✅ 前端页面正常"
else
    echo "   ❌ 前端页面异常"
fi
echo ""

# 测试4: 静态资源
echo "🔍 测试4: 静态资源"
echo "   地址: https://localhost:8443/assets/index-CEjFmpv8.css"
if curl -k -s https://localhost:8443/assets/index-CEjFmpv8.css | grep -q "tailwind"; then
    echo "   ✅ CSS文件正常"
else
    echo "   ❌ CSS文件异常"
fi
echo ""

# 测试5: 端口监听状态
echo "🔍 测试5: 端口监听状态"
echo "   检查端口8000和8443是否在监听"
if netstat -an | grep -q ":8000.*LISTEN" && netstat -an | grep -q ":8443.*LISTEN"; then
    echo "   ✅ 端口监听正常"
    echo "   📍 端口8000: Django后端"
    echo "   📍 端口8443: HTTPS服务器"
else
    echo "   ❌ 端口监听异常"
fi
echo ""

# 测试6: 进程状态
echo "🔍 测试6: 进程状态"
echo "   检查Django和HTTPS服务器进程"
DJANGO_COUNT=$(ps aux | grep "manage.py runserver" | grep -v grep | wc -l)
HTTPS_COUNT=$(ps aux | grep "https-server.js" | grep -v grep | wc -l)

if [ $DJANGO_COUNT -gt 0 ] && [ $HTTPS_COUNT -gt 0 ]; then
    echo "   ✅ 进程状态正常"
    echo "   📍 Django进程数: $DJANGO_COUNT"
    echo "   📍 HTTPS进程数: $HTTPS_COUNT"
else
    echo "   ❌ 进程状态异常"
    echo "   📍 Django进程数: $DJANGO_COUNT"
    echo "   📍 HTTPS进程数: $HTTPS_COUNT"
fi
echo ""

# 测试7: 局域网访问测试
echo "🔍 测试7: 局域网访问测试"
echo "   测试局域网IP访问"
if curl -k -s "https://$LAN_IP:8443/api/" > /dev/null; then
    echo "   ✅ 局域网访问正常"
    echo "   🌐 局域网地址: https://$LAN_IP:8443/"
else
    echo "   ❌ 局域网访问异常"
    echo "   💡 可能原因：防火墙设置、网络配置"
fi
echo ""

echo "=================================================="
echo "🎯 测试完成！"
echo ""
echo "💡 如果所有测试都通过，说明服务运行正常"
echo "🌐 你现在可以："
echo "   1. 在浏览器中访问: https://localhost:8443/"
echo "   2. 在其他设备上访问: https://$LAN_IP:8443/"
echo "   3. 使用摄像头功能进行检测"
echo ""
echo "🔒 注意：首次访问HTTPS页面时，浏览器会显示安全警告"
echo "   点击'高级' → '继续访问'即可"
