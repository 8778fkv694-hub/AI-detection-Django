#!/bin/bash

# Moondream 专用启动脚本
# 针对 Mac M2/24GB 环境优化

echo "🌙 启动 Moondream AI 检测项目..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 检查 Ollama 是否安装
if ! command -v ollama &> /dev/null; then
    echo -e "${RED}❌ Ollama 未安装${NC}"
    echo -e "${YELLOW}💡 请先安装 Ollama: brew install ollama${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Ollama 已安装${NC}"

# 停止现有服务
echo -e "${YELLOW}🛑 停止现有服务...${NC}"
pkill -f ollama
pkill -f ollama-proxy
pkill -f "npm run dev"
sleep 3

# 设置 Moondream 优化环境变量
echo -e "${BLUE}⚙️ 设置 Moondream 优化环境变量...${NC}"
export OLLAMA_NUM_PARALLEL=1
export OLLAMA_MAX_LOADED_MODELS=1
export OLLAMA_MAX_QUEUE=1
export OLLAMA_FLASH_ATTENTION=1
export OLLAMA_HOST=0.0.0.0:11434
export OLLAMA_LOAD_TIMEOUT=300s
export OLLAMA_NUM_GPU_LAYERS=999  # Moondream 优化
export OLLAMA_NUM_THREAD=4        # M2 性能核

# 启动 Ollama 服务
echo -e "${BLUE}🚀 启动 Ollama 服务...${NC}"
ollama serve &
OLLAMA_PID=$!

# 等待 Ollama 启动
echo -e "${YELLOW}⏳ 等待 Ollama 服务启动...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:11434/api/version > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Ollama 服务启动成功${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Ollama 服务启动失败${NC}"
        exit 1
    fi
    sleep 1
done

# 检查 moondream 模型
echo -e "${BLUE}🔍 检查 Moondream 模型...${NC}"
if ! ollama list | grep -q "moondream"; then
    echo -e "${YELLOW}📥 安装 Moondream 模型...${NC}"
    ollama pull moondream:latest
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Moondream 模型安装失败${NC}"
        exit 1
    fi
fi

# 检查 moondream-fast 模型
if ! ollama list | grep -q "moondream-fast"; then
    echo -e "${YELLOW}🔧 创建 Moondream 优化模型...${NC}"
    
    # 创建 Modelfile
    cat > /tmp/moondream-fast.Modelfile << 'EOF'
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

    ollama create moondream-fast -f /tmp/moondream-fast.Modelfile
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}❌ Moondream 优化模型创建失败${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Moondream 优化模型创建成功${NC}"
fi

# 预加载 moondream 模型
echo -e "${BLUE}🔄 预加载 Moondream 模型...${NC}"
ollama run moondream-fast "Hello" > /dev/null 2>&1 &
sleep 3

# 启动代理服务
echo -e "${BLUE}🌐 启动代理服务...${NC}"
node ollama-proxy.js &
PROXY_PID=$!

# 等待代理服务启动
sleep 3

# 检查代理服务
if curl -s http://localhost:11437/api/version > /dev/null 2>&1; then
    echo -e "${GREEN}✅ 代理服务启动成功${NC}"
else
    echo -e "${YELLOW}⚠️ 代理服务启动可能有问题，但继续启动前端...${NC}"
fi

# 安装依赖（如果需要）
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 安装项目依赖...${NC}"
    npm install
fi

# 启动前端开发服务器
echo -e "${BLUE}🎨 启动前端开发服务器...${NC}"
npm run dev &
FRONTEND_PID=$!

# 等待前端启动
echo -e "${YELLOW}⏳ 等待前端服务启动...${NC}"
sleep 10

# 检查服务状态
echo -e "${CYAN}📊 服务状态检查:${NC}"
echo -e "${BLUE}Ollama 服务:${NC} http://localhost:11434"
echo -e "${BLUE}代理服务:${NC} http://localhost:11437"
echo -e "${BLUE}前端服务:${NC} http://localhost:5173"

# 测试 Moondream 连接
echo -e "${BLUE}🧪 测试 Moondream 连接...${NC}"
if curl -s -X POST http://localhost:11437/api/chat \
    -H "Content-Type: application/json" \
    -d '{
        "model": "moondream-fast",
        "messages": [{"role": "user", "content": "Hello"}],
        "stream": false
    }' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Moondream 连接测试成功${NC}"
else
    echo -e "${YELLOW}⚠️ Moondream 连接测试失败，但服务可能仍在启动中${NC}"
fi

echo ""
echo -e "${GREEN}🎉 Moondream AI 检测项目启动完成！${NC}"
echo ""
echo -e "${CYAN}📋 服务信息:${NC}"
echo -e "   ${BLUE}• 前端地址:${NC} http://localhost:5173"
echo -e "   ${BLUE}• Ollama API:${NC} http://localhost:11434"
echo -e "   ${BLUE}• 代理服务:${NC} http://localhost:11437"
echo -e "   ${BLUE}• 模型名称:${NC} moondream-fast"
echo ""
echo -e "${CYAN}⚡ 性能优化:${NC}"
echo -e "   ${BLUE}• GPU 层数:${NC} 999 (最大)"
echo -e "   ${BLUE}• 线程数:${NC} 4 (M2 性能核)"
echo -e "   ${BLUE}• 上下文长度:${NC} 2048 tokens"
echo -e "   ${BLUE}• 输出长度:${NC} 96 tokens"
echo -e "   ${BLUE}• 温度:${NC} 0.2 (稳定输出)"
echo ""
echo -e "${CYAN}🛠️ 管理命令:${NC}"
echo -e "   ${BLUE}• 停止服务:${NC} ./stop_services.sh"
echo -e "   ${BLUE}• 查看日志:${NC} tail -f ollama.log"
echo -e "   ${BLUE}• 测试模型:${NC} ollama run moondream-fast -i test.jpg \"描述图片\""
echo ""
echo -e "${PURPLE}💡 提示: 首次使用可能需要一些时间来编译模型，后续会更快${NC}"

# 保存进程 ID
echo $OLLAMA_PID > ollama.pid
echo $PROXY_PID > ollama-proxy.pid
echo $FRONTEND_PID > frontend.pid

# 等待用户中断
trap 'echo -e "\n${YELLOW}🛑 正在停止服务...${NC}"; kill $OLLAMA_PID $PROXY_PID $FRONTEND_PID 2>/dev/null; exit 0' INT

echo -e "${GREEN}✅ 所有服务运行中，按 Ctrl+C 停止${NC}"
wait
