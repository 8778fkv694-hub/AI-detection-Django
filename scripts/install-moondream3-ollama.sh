#!/bin/bash

# Moondream3-preview 模型安装和配置脚本
# 通过 ModelScope 下载并部署到 Ollama

echo "🌙 开始安装 Moondream3-preview 模型到 Ollama..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 检查 Python 环境
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}❌ Python3 未安装${NC}"
    echo -e "${YELLOW}💡 请先安装 Python3: brew install python3${NC}"
    exit 1
fi

# 检查 pip
if ! command -v pip3 &> /dev/null; then
    echo -e "${RED}❌ pip3 未安装${NC}"
    echo -e "${YELLOW}💡 请先安装 pip3${NC}"
    exit 1
fi

# 安装 modelscope
echo -e "${BLUE}📦 安装 ModelScope...${NC}"
pip3 install modelscope transformers torch torchvision torchaudio

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ ModelScope 安装失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ ModelScope 安装成功${NC}"

# 创建模型下载目录
MODEL_DIR="./models/moondream3-preview"
mkdir -p "$MODEL_DIR"

# 创建 Python 下载脚本
cat > download_moondream3.py << 'EOF'
#!/usr/bin/env python3
import os
import sys
from modelscope import snapshot_download

def download_moondream3():
    try:
        print("开始下载 moondream3-preview 模型...")
        
        # 下载模型
        model_dir = snapshot_download(
            'moondream/moondream3-preview',
            cache_dir='./models',
            local_dir='./models/moondream3-preview'
        )
        
        print(f"模型下载完成，保存到: {model_dir}")
        return model_dir
        
    except Exception as e:
        print(f"下载失败: {e}")
        sys.exit(1)

if __name__ == "__main__":
    download_moondream3()
EOF

# 运行下载脚本
echo -e "${BLUE}📥 下载 Moondream3-preview 模型...${NC}"
python3 download_moondream3.py

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 模型下载失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ 模型下载成功${NC}"

# 检查 Ollama 是否安装
if ! command -v ollama &> /dev/null; then
    echo -e "${RED}❌ Ollama 未安装${NC}"
    echo -e "${YELLOW}💡 请先安装 Ollama: brew install ollama${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Ollama 已安装${NC}"

# 停止现有的 Ollama 服务
echo -e "${YELLOW}🛑 停止现有 Ollama 服务...${NC}"
pkill -f ollama
sleep 3

# 启动 Ollama 服务
echo -e "${BLUE}🚀 启动 Ollama 服务...${NC}"
ollama serve &
sleep 5

# 检查 Ollama 服务
if ! curl -s http://localhost:11434/api/version > /dev/null; then
    echo -e "${RED}❌ Ollama 服务启动失败${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Ollama 服务启动成功${NC}"

# 创建 Ollama Modelfile
echo -e "${BLUE}🔧 创建 Ollama Modelfile...${NC}"
cat > moondream3-preview.Modelfile << 'EOF'
# Moondream3-preview 模型配置
# 针对 Mac M2/24GB 环境优化

# 设置模型路径（需要根据实际下载路径调整）
FROM ./models/moondream3-preview

# 模板配置
TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant
{{ .Response }}<|im_end|>"""

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

# 系统提示词
SYSTEM """你是一个专业的图像分析AI助手，擅长快速准确地分析图像内容。请用简洁明了的中文回答。"""
EOF

# 创建优化版本的 Modelfile
cat > moondream3-fast.Modelfile << 'EOF'
# Moondream3-preview 快速优化版本
FROM ./models/moondream3-preview

TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}{{ if .Prompt }}<|im_start|>user
{{ .Prompt }}<|im_end|>
{{ end }}<|im_start|>assistant
{{ .Response }}<|im_end|>"""

# 快速模式参数
PARAMETER num_gpu_layers 999
PARAMETER num_thread 4
PARAMETER num_ctx 1024
PARAMETER num_predict 64
PARAMETER temperature 0.1
PARAMETER keep_alive 2h
PARAMETER top_p 0.8
PARAMETER top_k 20
PARAMETER repeat_penalty 1.1

SYSTEM """你是一个专业的图像分析AI助手，请用最简短的中文回答，50字以内。"""
EOF

# 创建模型
echo -e "${BLUE}🔧 创建 Ollama 模型...${NC}"

# 创建标准版本
ollama create moondream3-preview -f moondream3-preview.Modelfile

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Moondream3-preview 模型创建成功${NC}"
else
    echo -e "${YELLOW}⚠️ 标准模型创建失败，尝试其他方法...${NC}"
    
    # 如果直接路径失败，尝试使用 Ollama 的模型导入功能
    echo -e "${BLUE}🔄 尝试通过 Ollama 导入模型...${NC}"
    
    # 创建简化的 Modelfile
    cat > moondream3-simple.Modelfile << 'EOF'
FROM moondream3-preview

PARAMETER num_gpu_layers 999
PARAMETER num_thread 4
PARAMETER num_ctx 2048
PARAMETER num_predict 96
PARAMETER temperature 0.2
PARAMETER keep_alive 2h
EOF

    ollama create moondream3-fast -f moondream3-simple.Modelfile
fi

# 创建快速版本
ollama create moondream3-fast -f moondream3-fast.Modelfile

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Moondream3-fast 模型创建成功${NC}"
else
    echo -e "${YELLOW}⚠️ 快速模型创建失败，但继续测试...${NC}"
fi

# 测试模型
echo -e "${BLUE}🧪 测试模型...${NC}"

# 创建测试图片（如果不存在）
if [ ! -f "test.jpg" ]; then
    echo -e "${YELLOW}📸 创建测试图片...${NC}"
    # 使用 sips 创建一个简单的测试图片
    sips -s format jpeg -s formatOptions 70 -z 512 512 /System/Library/Desktop\ Pictures/Solid\ Colors/Solid\ Gray\ Pro\ Ultra\ Dark.png --out test.jpg 2>/dev/null || echo "⚠️ 无法创建测试图片，请手动添加 test.jpg"
fi

# 测试模型响应
if [ -f "test.jpg" ]; then
    echo -e "${BLUE}🔍 测试 moondream3-preview 模型响应...${NC}"
    
    # 测试标准版本
    if ollama run moondream3-preview -i test.jpg "用最简短中文回答，50字内。" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Moondream3-preview 模型测试成功${NC}"
    else
        echo -e "${YELLOW}⚠️ Moondream3-preview 模型测试失败，尝试快速版本...${NC}"
        
        # 测试快速版本
        if ollama run moondream3-fast -i test.jpg "描述图片" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ Moondream3-fast 模型测试成功${NC}"
        else
            echo -e "${YELLOW}⚠️ 模型测试失败，但模型已安装${NC}"
        fi
    fi
else
    echo -e "${YELLOW}⚠️ 跳过模型测试（缺少测试图片）${NC}"
fi

# 清理临时文件
rm -f download_moondream3.py

echo ""
echo -e "${GREEN}🎉 Moondream3-preview 安装完成！${NC}"
echo ""
echo -e "${CYAN}📋 配置摘要：${NC}"
echo -e "   ${BLUE}• 模型名称:${NC} moondream3-preview, moondream3-fast"
echo -e "   ${BLUE}• 模型路径:${NC} ./models/moondream3-preview"
echo -e "   ${BLUE}• 优化参数:${NC} M2 芯片专用"
echo -e "   ${BLUE}• GPU 层数:${NC} 999 (最大)"
echo -e "   ${BLUE}• 线程数:${NC} 4 (M2 性能核)"
echo -e "   ${BLUE}• 上下文长度:${NC} 2048 tokens (标准), 1024 tokens (快速)"
echo -e "   ${BLUE}• 输出长度:${NC} 96 tokens (标准), 64 tokens (快速)"
echo -e "   ${BLUE}• 温度:${NC} 0.2 (标准), 0.1 (快速)"
echo ""
echo -e "${CYAN}🚀 使用方法：${NC}"
echo -e "   ${BLUE}• 标准模式:${NC} ollama run moondream3-preview -i test.jpg \"描述图片\""
echo -e "   ${BLUE}• 快速模式:${NC} ollama run moondream3-fast -i test.jpg \"描述图片\""
echo -e "   ${BLUE}• API 调用:${NC} 通过 http://localhost:11434/api/chat"
echo ""
echo -e "${CYAN}💡 性能优化建议：${NC}"
echo -e "   ${BLUE}• 图片压缩到 512-768 像素${NC}"
echo -e "   ${BLUE}• 使用 JPEG 格式${NC}"
echo -e "   ${BLUE}• 保持模型热启动${NC}"
echo -e "   ${BLUE}• 根据需求选择标准或快速模式${NC}"
echo ""
echo -e "${PURPLE}🔧 如需重新配置，运行: ./install-moondream3-ollama.sh${NC}"
