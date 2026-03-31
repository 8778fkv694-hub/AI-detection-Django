#!/bin/bash

# Moondream 模型测试脚本
# 测试模型安装、配置和性能

echo "🧪 Moondream 模型测试开始..."

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 测试计数器
TESTS_PASSED=0
TESTS_FAILED=0

# 测试函数
test_function() {
    local test_name="$1"
    local test_command="$2"
    local expected_result="$3"
    
    echo -e "${BLUE}🔍 测试: $test_name${NC}"
    
    if eval "$test_command" > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 通过: $test_name${NC}"
        ((TESTS_PASSED++))
        return 0
    else
        echo -e "${RED}❌ 失败: $test_name${NC}"
        ((TESTS_FAILED++))
        return 1
    fi
}

# 测试 1: 检查 Ollama 是否安装
test_function "Ollama 安装检查" "command -v ollama"

# 测试 2: 检查 Ollama 服务是否运行
test_function "Ollama 服务运行检查" "curl -s http://localhost:11434/api/version"

# 测试 3: 检查 moondream 模型是否安装
test_function "Moondream 模型安装检查" "ollama list | grep -q moondream"

# 测试 4: 检查 moondream-fast 模型是否创建
test_function "Moondream 优化模型检查" "ollama list | grep -q moondream-fast"

# 测试 5: 检查代理服务是否运行
test_function "代理服务运行检查" "curl -s http://localhost:11437/api/version"

# 测试 6: 测试 moondream 基本响应
echo -e "${BLUE}🔍 测试: Moondream 基本响应${NC}"
if curl -s -X POST http://localhost:11437/api/chat \
    -H "Content-Type: application/json" \
    -d '{
        "model": "moondream-fast",
        "messages": [{"role": "user", "content": "Hello"}],
        "stream": false
    }' | grep -q "message"; then
    echo -e "${GREEN}✅ 通过: Moondream 基本响应${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}❌ 失败: Moondream 基本响应${NC}"
    ((TESTS_FAILED++))
fi

# 测试 7: 测试图片分析功能（如果有测试图片）
if [ -f "test.jpg" ]; then
    echo -e "${BLUE}🔍 测试: 图片分析功能${NC}"
    if ollama run moondream-fast -i test.jpg "用最简短中文回答，50字内。" --options '{
        "num_gpu_layers": 999,
        "num_thread": 4,
        "num_ctx": 2048,
        "num_predict": 96,
        "temperature": 0.2
    }' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ 通过: 图片分析功能${NC}"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ 失败: 图片分析功能${NC}"
        ((TESTS_FAILED++))
    fi
else
    echo -e "${YELLOW}⚠️ 跳过: 图片分析功能测试（缺少 test.jpg）${NC}"
fi

# 测试 8: 性能测试
echo -e "${BLUE}🔍 测试: 性能测试${NC}"
start_time=$(date +%s.%N)
if curl -s -X POST http://localhost:11437/api/chat \
    -H "Content-Type: application/json" \
    -d '{
        "model": "moondream-fast",
        "messages": [{"role": "user", "content": "请用一句话描述什么是人工智能"}],
        "stream": false,
        "options": {
            "num_gpu_layers": 999,
            "num_thread": 4,
            "num_ctx": 2048,
            "num_predict": 96,
            "temperature": 0.2
        }
    }' > /dev/null 2>&1; then
    end_time=$(date +%s.%N)
    duration=$(echo "$end_time - $start_time" | bc)
    echo -e "${GREEN}✅ 通过: 性能测试 (${duration}s)${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}❌ 失败: 性能测试${NC}"
    ((TESTS_FAILED++))
fi

# 测试 9: 内存使用检查
echo -e "${BLUE}🔍 测试: 内存使用检查${NC}"
if ps aux | grep -v grep | grep ollama | awk '{sum+=$6} END {print sum/1024 " MB"}' | grep -q "[0-9]"; then
    memory_usage=$(ps aux | grep -v grep | grep ollama | awk '{sum+=$6} END {print sum/1024}')
    echo -e "${GREEN}✅ 通过: 内存使用检查 (${memory_usage} MB)${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}❌ 失败: 内存使用检查${NC}"
    ((TESTS_FAILED++))
fi

# 测试 10: 配置参数验证
echo -e "${BLUE}🔍 测试: 配置参数验证${NC}"
if ollama show moondream-fast | grep -q "num_gpu_layers.*999"; then
    echo -e "${GREEN}✅ 通过: 配置参数验证${NC}"
    ((TESTS_PASSED++))
else
    echo -e "${RED}❌ 失败: 配置参数验证${NC}"
    ((TESTS_FAILED++))
fi

# 显示测试结果
echo ""
echo -e "${CYAN}📊 测试结果汇总:${NC}"
echo -e "${GREEN}✅ 通过: $TESTS_PASSED${NC}"
echo -e "${RED}❌ 失败: $TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 所有测试通过！Moondream 配置正确${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️ 部分测试失败，请检查配置${NC}"
    exit 1
fi
