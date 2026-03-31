#!/bin/bash

# AI检测项目桌面启动脚本
# 作者: AI Assistant
# 日期: $(date +%Y-%m-%d)

echo "🚀 AI检测项目启动器"
echo "===================="
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📁 项目目录: $SCRIPT_DIR"
echo ""

# 检查启动脚本是否存在
if [ ! -f "start_full_project.sh" ]; then
    echo "❌ 找不到启动脚本 start_full_project.sh"
    echo "请确保在正确的项目目录中运行此脚本"
    exit 1
fi

# 给启动脚本添加执行权限
chmod +x start_full_project.sh
chmod +x stop_services.sh

echo "🔧 设置脚本权限..."
echo ""

# 显示菜单
echo "请选择操作："
echo "1) 🚀 启动完整项目 (Node.js后端 + Django后端 + React前端)"
echo "2) 🔧 仅启动Django后端"
echo "3) 🎨 仅启动React前端"
echo "4) 📡 仅启动Node.js后端"
echo "5) 🛑 停止所有服务"
echo "6) 📊 查看服务状态"
echo "7) ❌ 退出"
echo ""

read -p "请输入选项 (1-7): " choice

case $choice in
    1)
        echo "🚀 启动完整项目 (Node.js + Django + React)..."
        ./start_full_project.sh
        ;;
    2)
        echo "🔧 启动Django后端..."
        ./start_django_only.sh
        ;;
    3)
        echo "🎨 启动React前端..."
        ./start_lan_frontend.sh
        ;;
    4)
        echo "📡 启动Node.js后端..."
        echo "启动Node.js后端服务器..."
        npm run dev:server > nodejs.log 2>&1 &
        NODEJS_PID=$!
        echo $NODEJS_PID > nodejs.pid
        echo "✅ Node.js后端启动成功，运行在 http://localhost:3001"
        ;;
    5)
        echo "🛑 停止所有服务..."
        ./stop_services.sh
        ;;
    6)
        echo "📊 查看服务状态..."
        echo ""
        echo "Node.js后端状态:"
        if [ -f "nodejs.pid" ]; then
            NODEJS_PID=$(cat nodejs.pid)
            if ps -p $NODEJS_PID > /dev/null; then
                echo "  ✅ 运行中 (PID: $NODEJS_PID)"
                echo "  🌐 访问地址: http://localhost:3001"
            else
                echo "  ❌ 已停止"
            fi
        else
            echo "  ❌ 未运行"
        fi
        
        echo ""
        echo "Django后端状态:"
        if [ -f "django.pid" ]; then
            DJANGO_PID=$(cat django.pid)
            if ps -p $DJANGO_PID > /dev/null; then
                echo "  ✅ 运行中 (PID: $DJANGO_PID)"
                echo "  🌐 访问地址: http://localhost:8000"
            else
                echo "  ❌ 已停止"
            fi
        else
            echo "  ❌ 未运行"
        fi
        
        echo ""
        echo "React前端状态:"
        if [ -f "react.pid" ]; then
            REACT_PID=$(cat react.pid)
            if ps -p $REACT_PID > /dev/null; then
                echo "  ✅ 运行中 (PID: $REACT_PID)"
                echo "  🌐 访问地址: http://localhost:3303"
            else
                echo "  ❌ 已停止"
            fi
        else
            echo "  ❌ 未运行"
        fi
        ;;
    7)
        echo "👋 再见！"
        exit 0
        ;;
    *)
        echo "❌ 无效选项，请重新运行脚本"
        exit 1
        ;;
esac

echo ""
echo "💡 提示："
echo "  - React前端: http://localhost:3303"
echo "  - Node.js后端: http://localhost:3001"
echo "  - Django后端: http://localhost:8000"
echo "  - 管理后台: http://localhost:8000/admin"
echo "  - 停止服务: ./stop_services.sh"
echo ""

# 如果选择了启动选项，等待用户按任意键
if [[ "$choice" == "1" || "$choice" == "2" || "$choice" == "3" ]]; then
    echo "按任意键继续..."
    read -n 1 -s
fi
