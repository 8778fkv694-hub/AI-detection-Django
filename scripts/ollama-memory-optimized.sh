#!/bin/bash

# Ollama内存优化启动脚本

echo "🔧 启动内存优化的Ollama服务..."

# 停止现有的Ollama进程
pkill -f ollama
sleep 2

# 设置环境变量优化内存使用
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_MAX_QUEUE=1
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_HOST=0.0.0.0:11435
export OLLAMA_LOAD_TIMEOUT=300s
export OLLAMA_NUM_GPU_LAYERS=0

# 启动Ollama服务
echo "📡 启动Ollama服务..."
ollama serve &

# 等待服务启动
sleep 5

# 检查服务状态
if curl -s http://localhost:11435/api/version > /dev/null; then
    echo "✅ Ollama服务启动成功"
    
    # 预加载模型（使用内存优化参数）
    echo "🔄 预加载minicpm-v模型（内存优化模式）..."
    curl -X POST http://localhost:11435/api/generate \
        -H "Content-Type: application/json" \
        -d '{
            "model": "minicpm-v",
            "prompt": "Hello",
            "stream": false,
            "options": {
                "num_ctx": 4096,
                "num_gpu": 0,
                "num_thread": 2,
                "f16_kv": true,
                "low_vram": true,
                "num_batch": 1,
                "num_predict": 100
            }
        }' > /dev/null 2>&1
    
    echo "🎉 Ollama内存优化配置完成！"
    echo "💡 建议："
    echo "   - 使用CPU模式减少GPU内存占用"
    echo "   - 限制上下文长度为4096"
    echo "   - 启用半精度浮点数"
    echo "   - 单线程处理避免内存竞争"
else
    echo "❌ Ollama服务启动失败"
    exit 1
fi
