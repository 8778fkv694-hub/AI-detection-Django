#!/bin/bash

echo "🔍 诊断AI检测系统问题"
echo "================================"

echo ""
echo "1. 检查服务状态"
echo "---------------"

# 检查Django
echo "检查Django后端..."
if curl -s http://localhost:8000/api/ollama/status/ > /dev/null; then
    echo "✅ Django后端运行正常"
else
    echo "❌ Django后端未运行或无法访问"
fi

# 检查Ollama
echo "检查Ollama服务..."
if curl -s http://localhost:11434/api/version > /dev/null; then
    echo "✅ Ollama服务运行正常"
else
    echo "❌ Ollama服务未运行或无法访问"
fi

# 检查前端
echo "检查前端服务..."
if curl -s http://localhost:3303 > /dev/null; then
    echo "✅ 前端服务运行正常"
else
    echo "❌ 前端服务未运行或无法访问"
fi

echo ""
echo "2. 测试API端点"
echo "---------------"

# 测试Django状态API
echo "测试Django状态API..."
django_status=$(curl -s http://localhost:8000/api/ollama/status/)
if echo "$django_status" | grep -q "success"; then
    echo "✅ Django状态API正常"
    echo "   模型数量: $(echo "$django_status" | jq '.models | length' 2>/dev/null || echo '未知')"
else
    echo "❌ Django状态API异常: $django_status"
fi

# 测试Ollama聊天API
echo "测试Ollama聊天API..."
ollama_chat=$(curl -s -X POST http://localhost:8000/api/ollama/chat/ \
    -H "Content-Type: application/json" \
    -d '{"model": "minicpm-v", "messages": [{"role": "user", "content": "你好"}], "stream": false}')
if echo "$ollama_chat" | grep -q "message"; then
    echo "✅ Ollama聊天API正常"
else
    echo "❌ Ollama聊天API异常: $ollama_chat"
fi

echo ""
echo "3. 检查端口占用"
echo "---------------"

echo "端口8000 (Django):"
lsof -i :8000 | head -2

echo "端口11434 (Ollama):"
lsof -i :11434 | head -2

echo "端口3303 (前端):"
lsof -i :3303 | head -2

echo ""
echo "4. 检查进程"
echo "---------------"

echo "Django进程:"
ps aux | grep "python.*manage.py runserver" | grep -v grep

echo "Ollama进程:"
ps aux | grep ollama | grep -v grep

echo "前端进程:"
ps aux | grep "vite\|node.*dev" | grep -v grep

echo ""
echo "5. 检查日志"
echo "---------------"

echo "Django日志 (最后5行):"
tail -5 django.log 2>/dev/null || echo "无Django日志"

echo ""
echo "6. 建议的修复步骤"
echo "---------------"

# 检查是否有404错误
if echo "$ollama_chat" | grep -q "404"; then
    echo "❌ 发现404错误，建议："
    echo "   1. 检查Django URL配置"
    echo "   2. 重启Django服务"
    echo "   3. 清除浏览器缓存"
fi

# 检查是否有500错误
if echo "$ollama_chat" | grep -q "500"; then
    echo "❌ 发现500错误，建议："
    echo "   1. 检查Django日志"
    echo "   2. 检查Ollama连接"
    echo "   3. 重启所有服务"
fi

echo ""
echo "诊断完成！"
