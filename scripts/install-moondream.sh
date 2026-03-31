#!/bin/bash

# Moondream 模型安装和配置脚本
# 适用于 Mac M2/24GB 环境

echo "🚀 开始安装和配置 Moondream 模型..."

# 检查 Ollama 是否已安装
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama 未安装，请先安装 Ollama"
    echo "💡 安装命令: brew install ollama 或访问 https://ollama.com"
    exit 1
fi

echo "✅ Ollama 已安装"

# 停止现有的 Ollama 服务
echo "🛑 停止现有 Ollama 服务..."
pkill -f ollama
sleep 3

# 启动 Ollama 服务
echo "🔄 启动 Ollama 服务..."
ollama serve &
sleep 5

# 检查 Ollama 服务是否启动成功
if ! curl -s http://localhost:11434/api/version > /dev/null; then
    echo "❌ Ollama 服务启动失败"
    exit 1
fi

echo "✅ Ollama 服务启动成功"

# 拉取 moondream 模型
echo "📥 拉取 moondream:latest 模型..."
ollama pull moondream:latest

if [ $? -eq 0 ]; then
    echo "✅ Moondream 模型拉取成功"
else
    echo "❌ Moondream 模型拉取失败"
    exit 1
fi

# 创建优化的 moondream 配置
echo "⚙️ 创建优化的 moondream 配置..."

# 创建 Modelfile
cat > ~/moondream-fast.Modelfile << 'EOF'
FROM moondream:latest

# M2 芯片优化参数
PARAMETER num_gpu_layers 999
PARAMETER num_thread 4
PARAMETER num_ctx 2048
PARAMETER num_predict 96
PARAMETER temperature 0.2
PARAMETER keep_alive 2h
PARAMETER top_p 0.9
PARAMETER top_k 40
PARAMETER repeat_penalty 1.1
EOF

# 创建优化模型
echo "🔧 创建 moondream-fast 优化模型..."
ollama create moondream-fast -f ~/moondream-fast.Modelfile

if [ $? -eq 0 ]; then
    echo "✅ Moondream 优化模型创建成功"
else
    echo "❌ Moondream 优化模型创建失败"
    exit 1
fi

# 测试模型
echo "🧪 测试 moondream 模型..."
echo "测试图片分析功能..."

# 创建测试图片（如果不存在）
if [ ! -f "test.jpg" ]; then
    echo "📸 创建测试图片..."
    # 使用 sips 创建一个简单的测试图片
    sips -s format jpeg -s formatOptions 70 -z 512 512 /System/Library/Desktop\ Pictures/Solid\ Colors/Solid\ Gray\ Pro\ Ultra\ Dark.png --out test.jpg 2>/dev/null || echo "⚠️ 无法创建测试图片，请手动添加 test.jpg"
fi

# 测试模型响应
if [ -f "test.jpg" ]; then
    echo "🔍 测试 moondream 模型响应..."
    ollama run moondream-fast -i test.jpg "用最简短中文回答，50字内。" --options '{
        "num_gpu_layers": 999,
        "num_thread": 4,
        "num_ctx": 2048,
        "num_predict": 96,
        "temperature": 0.2
    }' > /dev/null 2>&1
    
    if [ $? -eq 0 ]; then
        echo "✅ Moondream 模型测试成功"
    else
        echo "⚠️ Moondream 模型测试失败，但模型已安装"
    fi
else
    echo "⚠️ 跳过模型测试（缺少测试图片）"
fi

echo ""
echo "🎉 Moondream 安装和配置完成！"
echo ""
echo "📋 配置摘要："
echo "   - 模型名称: moondream-fast"
echo "   - 优化参数: M2 芯片专用"
echo "   - GPU 层数: 999 (最大)"
echo "   - 线程数: 4 (M2 性能核)"
echo "   - 上下文长度: 2048 tokens"
echo "   - 输出长度: 96 tokens"
echo "   - 温度: 0.2 (稳定输出)"
echo "   - 保持活跃: 2小时"
echo ""
echo "🚀 使用方法："
echo "   1. 单次测试: ollama run moondream-fast -i test.jpg \"描述图片\""
echo "   2. 项目集成: 使用 moondream-fast 作为模型名称"
echo "   3. API 调用: 通过 http://localhost:11434/api/chat"
echo ""
echo "💡 性能优化建议："
echo "   - 图片压缩到 512-768 像素"
echo "   - 使用 JPEG 格式"
echo "   - 保持模型热启动"
echo ""
echo "🔧 如需重新配置，运行: ./install-moondream.sh"
