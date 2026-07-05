#!/bin/bash

# Ollama服务手动启动脚本
# 当需要AI功能时手动启动

echo "🤖 手动启动Ollama服务"
echo "====================="

# 检查Conda是否安装
if ! command -v conda &> /dev/null; then
    echo "❌ 错误: Conda未安装或未在PATH中"
    exit 1
fi

# 初始化Conda
echo "📦 初始化Conda环境..."
source $(conda info --base)/etc/profile.d/conda.sh

# 激活Conda环境
echo "🔌 激活Conda环境: ai-detection"
conda activate ai-detection

# 检查环境是否激活成功
if [[ "$CONDA_DEFAULT_ENV" != "ai-detection" ]]; then
    echo "❌ 错误: 无法激活ai-detection环境"
    echo "请先创建环境: conda create -n ai-detection python=3.11"
    exit 1
fi

echo "✅ Conda环境已激活: $CONDA_DEFAULT_ENV"

# 检查Ollama是否已运行
if pgrep -f "ollama serve" > /dev/null; then
    echo "✅ Ollama服务已在运行"
    echo "🌐 Ollama服务地址: http://localhost:11434"
else
    echo "🚀 启动Ollama服务..."
    ollama serve > ollama.log 2>&1 &
    OLLAMA_PID=$!
    echo $OLLAMA_PID > ollama.pid
    echo "✅ Ollama服务已启动 (PID: $OLLAMA_PID)"
    
    # 等待Ollama启动
    echo "⏳ 等待Ollama服务启动..."
    sleep 5
    
    # 检查Ollama状态
    if curl -s http://localhost:11434 > /dev/null; then
        echo "✅ Ollama服务启动成功，运行在 http://localhost:11434"
    else
        echo "⚠️ Ollama服务可能还在启动中..."
    fi
fi

# 启动Ollama代理
echo "🌐 启动Ollama代理服务..."
if pgrep -f "ollama-proxy.js" > /dev/null; then
    echo "✅ Ollama代理已在运行"
else
    node ollama-proxy.js > ollama-proxy.log 2>&1 &
    PROXY_PID=$!
    echo $PROXY_PID > ollama-proxy.pid
    echo "✅ Ollama代理已启动 (PID: $PROXY_PID)"
    
    # 等待代理启动
    echo "⏳ 等待代理服务启动..."
    sleep 3
    
    # 检查代理状态
    if curl -s http://localhost:11437 > /dev/null; then
        echo "✅ Ollama代理启动成功，运行在 http://localhost:11437"
    else
        echo "⚠️ Ollama代理可能还在启动中..."
    fi
fi

echo ""
echo "🎉 Ollama服务启动完成！"
echo ""
echo "📱 访问地址："
echo "   Ollama服务: http://localhost:11434"
echo "   Ollama代理: http://localhost:11437"
echo ""
echo "📝 日志文件："
echo "   Ollama服务: ollama.log"
echo "   Ollama代理: ollama-proxy.log"
echo ""
echo "🛑 停止Ollama: pkill -f 'ollama serve' && pkill -f 'ollama-proxy.js'"
echo ""
echo "💡 提示："
echo "   1. 现在可以使用AI功能了"
echo "   2. 如果遇到问题，请检查日志文件"
echo "   3. 确保已下载所需的模型"
echo ""
