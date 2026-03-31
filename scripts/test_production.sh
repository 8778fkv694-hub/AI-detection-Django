#!/bin/bash

echo "🧪 测试生产环境配置"
echo "=================================================="

# 检查端口是否可用
echo "🔍 检查端口可用性..."

# 检查80端口
if lsof -i :80 > /dev/null 2>&1; then
    echo "✅ 端口 80 已被占用 (正常)"
else
    echo "❌ 端口 80 未被占用"
fi

# 检查443端口
if lsof -i :443 > /dev/null 2>&1; then
    echo "✅ 端口 443 已被占用 (正常)"
else
    echo "❌ 端口 443 未被占用"
fi

# 检查8012端口
if lsof -i :8012 > /dev/null 2>&1; then
    echo "✅ 端口 8012 已被占用 (正常)"
else
    echo "❌ 端口 8012 未被占用"
fi

echo ""

# 测试服务连接
echo "🌐 测试服务连接..."

# 测试HTTP重定向
echo "测试HTTP重定向 (80 -> 443)..."
HTTP_REDIRECT=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:80/)
if [ "$HTTP_REDIRECT" = "301" ] || [ "$HTTP_REDIRECT" = "302" ]; then
    echo "✅ HTTP重定向正常"
else
    echo "❌ HTTP重定向异常 (状态码: $HTTP_REDIRECT)"
fi

# 测试HTTPS
echo "测试HTTPS服务 (443)..."
HTTPS_STATUS=$(curl -k -s -o /dev/null -w "%{http_code}" https://localhost:443/)
if [ "$HTTPS_STATUS" = "200" ]; then
    echo "✅ HTTPS服务正常"
else
    echo "❌ HTTPS服务异常 (状态码: $HTTPS_STATUS)"
fi

# 测试后端API
echo "测试后端API (8012)..."
API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8012/api/)
if [ "$API_STATUS" = "200" ]; then
    echo "✅ 后端API正常"
else
    echo "❌ 后端API异常 (状态码: $API_STATUS)"
fi

# 测试管理后台
echo "测试管理后台 (8012/admin/)..."
ADMIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8012/admin/)
if [ "$ADMIN_STATUS" = "200" ] || [ "$ADMIN_STATUS" = "302" ]; then
    echo "✅ 管理后台正常"
else
    echo "❌ 管理后台异常 (状态码: $ADMIN_STATUS)"
fi

echo ""

# 检查Docker容器状态
echo "🐳 检查Docker容器状态..."
if command -v docker-compose &> /dev/null; then
    docker-compose -f docker-compose.prod.yml ps
else
    echo "❌ Docker Compose 未安装"
fi

echo ""

# 检查日志
echo "📋 检查最近日志..."
if command -v docker-compose &> /dev/null; then
    echo "--- Nginx日志 ---"
    docker-compose -f docker-compose.prod.yml logs --tail=5 nginx
    echo ""
    echo "--- 应用日志 ---"
    docker-compose -f docker-compose.prod.yml logs --tail=5 app
    echo ""
    echo "--- 数据库日志 ---"
    docker-compose -f docker-compose.prod.yml logs --tail=5 db
else
    echo "❌ Docker Compose 未安装，无法查看日志"
fi

echo ""
echo "🎯 测试完成！"
echo "=================================================="
echo "如果所有测试都通过，说明生产环境配置正确"
echo "如果有测试失败，请检查相应的服务配置"
echo ""
