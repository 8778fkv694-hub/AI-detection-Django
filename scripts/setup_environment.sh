#!/bin/bash
# AI检测项目环境设置脚本

echo "🚀 设置AI检测项目环境..."

# 检查Python版本
python_version=$(python3.11 --version 2>&1 | cut -d' ' -f2)
echo "📋 使用Python版本: $python_version"

# 创建虚拟环境（如果不存在）
if [ ! -d "venv" ]; then
    echo "📦 创建虚拟环境..."
    python3.11 -m venv venv
fi

# 激活虚拟环境
echo "🔌 激活虚拟环境..."
source venv/bin/activate

# 升级pip
echo "⬆️ 升级pip..."
pip install --upgrade pip

# 安装依赖
echo "📥 安装项目依赖..."
pip install -r backend/requirements.txt

# 验证关键依赖
echo "✅ 验证关键依赖..."
python -c "import django; print('Django版本:', django.get_version())"
python -c "import paddleocr; print('PaddleOCR: 已安装')" 2>/dev/null || echo "❌ PaddleOCR: 未安装"
python -c "import torch; print('PyTorch版本:', torch.__version__)" 2>/dev/null || echo "❌ PyTorch: 未安装"

echo "🎉 环境设置完成！"
echo "💡 下次启动项目时，请先运行: source venv/bin/activate"
