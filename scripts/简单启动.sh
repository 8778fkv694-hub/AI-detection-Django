#!/bin/bash

# 简单启动AI检测项目
echo "🚀 AI检测项目 - 简单启动"
echo "========================"

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📁 项目目录: $SCRIPT_DIR"
echo ""

# 检查并设置权限
chmod +x start_full_project.sh 2>/dev/null
chmod +x stop_services.sh 2>/dev/null

# 检查启动脚本是否存在
if [ ! -f "start_full_project.sh" ]; then
    echo "❌ 找不到启动脚本 start_full_project.sh"
    read -p "按任意键退出..."
    exit 1
fi

echo "🚀 正在启动项目..."
echo ""

# 启动完整项目
./start_full_project.sh

echo ""
echo "✅ 启动完成！"
echo ""
echo "📱 现在可以访问："
echo "   前端界面: http://localhost:3303"
echo "   后端API:  http://localhost:8000/api/"
echo "   管理后台: http://localhost:8000/admin"
echo ""

# 保持窗口打开
read -p "按任意键关闭此窗口..."
