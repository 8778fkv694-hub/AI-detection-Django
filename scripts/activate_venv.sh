#!/bin/bash
# 激活项目虚拟环境脚本

echo "🔌 激活AI检测项目虚拟环境..."

# 进入项目目录
cd "/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django"

# 检查虚拟环境是否存在
if [ ! -d "venv" ]; then
    echo "❌ 虚拟环境不存在，请先运行: ./setup_environment.sh"
    exit 1
fi

# 激活虚拟环境
source venv/bin/activate

echo "✅ 虚拟环境已激活"
echo "📍 Python路径: $(which python)"
echo "🐍 Python版本: $(python --version)"
echo ""
echo "💡 现在可以运行项目了："
echo "   ./启动AI检测项目.command"
echo ""
echo "🛑 退出虚拟环境: deactivate"
