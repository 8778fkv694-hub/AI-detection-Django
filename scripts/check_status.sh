#!/bin/bash

echo "🔍 检查AI检测项目服务状态..."
echo ""

# 检查Django后端
echo "🔧 Django后端状态："
if curl -s http://localhost:8000/api/sync/status/ > /dev/null; then
    echo "   ✅ 运行正常 (端口8000)"
    echo "   📊 API状态: http://localhost:8000/api/sync/status/"
else
    echo "   ❌ 未运行或无法访问"
fi
echo ""

# 检查React前端
echo "🎨 React前端状态："
if curl -s http://localhost:3303 > /dev/null; then
    echo "   ✅ 运行正常 (端口3303)"
    echo "   🌐 访问地址: http://localhost:3303"
else
    echo "   ❌ 未运行或无法访问"
fi
echo ""

# 检查端口占用
echo "🔌 端口占用情况："
echo "   端口8000 (Django):"
lsof -i :8000 2>/dev/null | head -2 || echo "     未占用"
echo "   端口3303 (React):"
lsof -i :3303 2>/dev/null | head -2 || echo "     未占用"
echo ""

# 检查进程状态
echo "📊 进程状态："
DJANGO_PID=$(lsof -ti :8000 2>/dev/null)
if [ ! -z "$DJANGO_PID" ]; then
    echo "   Django后端: 运行中 (PID: $DJANGO_PID)"
else
    echo "   Django后端: 未运行"
fi

REACT_PID=$(lsof -ti :3303 2>/dev/null)
if [ ! -z "$REACT_PID" ]; then
    echo "   React前端:  运行中 (PID: $REACT_PID)"
else
    echo "   React前端:  未运行"
fi
echo ""

# 检查日志文件
echo "📝 日志文件状态："
if [ -f "django.log" ]; then
    echo "   Django日志: 存在 (django.log)"
else
    echo "   Django日志: 不存在"
fi

if [ -f "react.log" ]; then
    echo "   React日志:  存在 (react.log)"
else
    echo "   React日志:  不存在"
fi
echo ""

# 总结
echo "📋 状态总结："
if [ ! -z "$DJANGO_PID" ] && [ ! -z "$REACT_PID" ]; then
    echo "   🎉 所有服务运行正常！"
    echo "   💡 现在可以访问 http://localhost:3303"
elif [ ! -z "$DJANGO_PID" ]; then
    echo "   ⚠️  Django后端运行正常，但React前端未运行"
    echo "   💡 运行 ./start_full_project.sh 启动完整项目"
elif [ ! -z "$REACT_PID" ]; then
    echo "   ⚠️  React前端运行正常，但Django后端未运行"
    echo "   💡 运行 ./start_django_only.sh 启动后端"
else
    echo "   ❌ 所有服务都未运行"
    echo "   💡 运行 ./start_full_project.sh 启动完整项目"
fi
echo ""

echo "🛠️  常用命令："
echo "   启动完整项目: ./start_full_project.sh"
echo "   只启动后端:   ./start_django_only.sh"
echo "   停止所有服务: ./stop_services.sh"
echo "   清理Node.js:   ./cleanup_nodejs.sh"
echo ""
