#!/bin/bash

# 模型设置脚本 - 下载并准备模型文件

echo "=== Qwen2.5-VL-7B-Instruct 模型设置 ==="

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装"
    exit 1
fi

# 检查pip
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 未安装"
    exit 1
fi

echo "✅ Python 环境检查通过"

# 安装必要的依赖
echo "📦 安装模型下载依赖..."
pip3 install huggingface_hub transformers torch

# 创建模型目录
mkdir -p models

# 下载模型
echo "⬇️  开始下载模型文件..."
python3 scripts/download_model.py

echo ""
echo "🎉 模型设置完成！"
echo "现在可以运行: ./scripts/quick_start.sh"
