#!/bin/bash

# 测试桌面启动功能
echo "🧪 测试桌面启动功能"
echo "=================="
echo ""

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📁 当前目录: $SCRIPT_DIR"
echo ""

# 检查文件权限
echo "🔍 检查文件权限:"
echo "桌面文件 (.desktop):"
ls -la "AI检测项目.desktop"
echo ""

echo "桌面启动脚本:"
ls -la "桌面启动.sh"
echo ""

echo "macOS 应用程序:"
ls -la "AI检测项目.app/Contents/MacOS/AI检测项目"
echo ""

# 检查桌面文件内容
echo "📄 桌面文件内容:"
cat "AI检测项目.desktop"
echo ""

echo "✅ 测试完成！"
echo ""
echo "📋 使用方法："
echo "1. 双击桌面上的 'AI检测项目.desktop' 文件"
echo "2. 或者双击桌面上的 'AI检测项目.app' 应用程序"
echo "3. 或者直接运行: ./桌面启动.sh"
echo ""
