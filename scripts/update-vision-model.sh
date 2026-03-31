#!/bin/bash

# 视觉模型配置更新脚本
# 用法: ./update-vision-model.sh <模型名称>

if [ $# -eq 0 ]; then
    echo "用法: $0 <模型名称>"
    echo "示例: $0 qwen2.5-vl-7b-instruct"
    echo "可用模型:"
    ollama list | grep -E "(qwen|llava|bakllava|minicpm)"
    exit 1
fi

MODEL_NAME=$1

echo "🔄 正在更新配置以使用视觉模型: $MODEL_NAME"

# 检查模型是否存在
if ! ollama list | grep -q "$MODEL_NAME"; then
    echo "❌ 模型 $MODEL_NAME 不存在，请先安装："
    echo "   ollama pull $MODEL_NAME"
    exit 1
fi

# 更新 optimizedLocalAI.ts
echo "📝 更新 src/lib/optimizedLocalAI.ts..."
sed -i.bak "s/modelName: '[^']*'/modelName: '$MODEL_NAME'/" src/lib/optimizedLocalAI.ts

# 更新 api.ts
echo "📝 更新 src/lib/api.ts..."
sed -i.bak "s/model: '[^']*'/model: '$MODEL_NAME'/" src/lib/api.ts

# 更新 useModelMode.ts
echo "📝 更新 src/hooks/useModelMode.ts..."
# 提取模型前缀（如 qwen2.5-vl, llava 等）
MODEL_PREFIX=$(echo $MODEL_NAME | cut -d'-' -f1-2)
sed -i.bak "s/m.name.includes('[^']*')/m.name.includes('$MODEL_PREFIX')/" src/hooks/useModelMode.ts

# 更新启动脚本
echo "📝 更新 ollama-memory-optimized.sh..."
sed -i.bak "s/\"model\": \"[^\"]*\"/\"model\": \"$MODEL_NAME\"/" ollama-memory-optimized.sh

# 更新系统提示词（针对视觉模型）
echo "📝 更新系统提示词..."
sed -i.bak "s/你是一个专业的质量检测AI助手，请根据用户提供的描述进行质量分析/你是一个专业的质量检测AI助手，可以分析图像内容，特别擅长视觉理解任务/" src/lib/optimizedLocalAI.ts

echo "✅ 配置更新完成！"
echo "💡 建议重启应用以应用新配置："
echo "   1. 停止当前服务 (Ctrl+C)"
echo "   2. 运行: ./ollama-memory-optimized.sh"
echo "   3. 重新启动应用"

# 显示当前配置
echo ""
echo "📋 当前配置摘要："
echo "   模型名称: $MODEL_NAME"
echo "   超时时间: 3分钟"
echo "   图片压缩: 512x512像素"
echo "   内存优化: CPU模式"
