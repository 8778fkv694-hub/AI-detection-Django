#!/bin/bash

# Ollama服务启动脚本
# 解决本地模型启动问题

echo "=== 启动Ollama本地模型服务 ==="

# 检查Ollama是否已安装
if ! command -v ollama &> /dev/null; then
    echo "❌ Ollama未安装，请先安装Ollama"
    echo "安装命令:"
    echo "  macOS: brew install ollama"
    echo "  Linux: curl -fsSL https://ollama.ai/install.sh | sh"
    echo "  Windows: 从 https://ollama.ai/download 下载安装"
    exit 1
fi

echo "✅ Ollama已安装"

# 检查Ollama服务是否已在运行
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama服务已在运行"
    echo "📡 服务地址: http://localhost:11434"
    echo "💬 聊天接口: http://localhost:11434/api/chat"
    echo "🔍 模型列表: http://localhost:11434/api/tags"
else
    echo "🚀 启动Ollama服务..."
    
    # 启动Ollama服务（后台运行）
    nohup ollama serve > ollama.log 2>&1 &
    OLLAMA_PID=$!
    
    # 等待服务启动
    echo "⏳ 等待服务启动..."
    for i in {1..30}; do
        if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo "✅ Ollama服务启动成功!"
            echo "📡 服务地址: http://localhost:11434"
            echo "💬 聊天接口: http://localhost:11434/api/chat"
            echo "🔍 模型列表: http://localhost:11434/api/tags"
            echo "🆔 进程ID: $OLLAMA_PID"
            echo "📝 日志文件: ollama.log"
            break
        fi
        sleep 1
        echo -n "."
    done
    
    if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "❌ Ollama服务启动失败"
        echo "请检查ollama.log文件查看错误信息"
        exit 1
    fi
fi

# 检查是否有可用的模型
echo ""
echo "🔍 检查可用模型..."
MODELS=$(curl -s http://localhost:11434/api/tags | jq -r '.models[].name' 2>/dev/null)

if [ -z "$MODELS" ]; then
    echo "⚠️  没有找到可用的模型"
    echo "请先拉取模型:"
    echo "  ollama pull qwen2.5-vl:7b"
    echo "  ollama pull qwen2.5:7b"
    echo "  ollama pull llama3.2:3b"
else
    echo "✅ 可用模型:"
    echo "$MODELS" | while read model; do
        echo "  - $model"
    done
fi

echo ""
echo "🎉 Ollama服务准备就绪!"
echo "按 Ctrl+C 停止服务"

# 保持脚本运行
trap 'echo ""; echo "🛑 停止Ollama服务..."; kill $OLLAMA_PID 2>/dev/null; exit 0' INT

while true; do
    sleep 10
    # 检查服务是否还在运行
    if ! curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
        echo "❌ Ollama服务意外停止"
        exit 1
    fi
done
