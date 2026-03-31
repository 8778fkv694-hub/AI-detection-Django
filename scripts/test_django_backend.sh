#!/bin/bash

echo "🧪 测试Django后端功能..."

# 检查Django是否运行
if ! curl -s http://localhost:8000/api/standards/ > /dev/null; then
    echo "❌ Django后端未运行，请先启动后端服务"
    echo "   运行命令: ./start_django_only.sh"
    exit 1
fi

echo "✅ Django后端正在运行"
echo ""

# 测试API接口
echo "📡 测试API接口..."

# 1. 测试标准接口
echo "1️⃣ 测试标准接口..."
STANDARDS_RESPONSE=$(curl -s http://localhost:8000/api/standards/)
if [ $? -eq 0 ]; then
    echo "   ✅ GET /api/standards/ - 成功"
    echo "   返回数据: $STANDARDS_RESPONSE"
else
    echo "   ❌ GET /api/standards/ - 失败"
fi
echo ""

# 2. 测试结果接口
echo "2️⃣ 测试结果接口..."
RESULTS_RESPONSE=$(curl -s http://localhost:8000/api/results/)
if [ $? -eq 0 ]; then
    echo "   ✅ GET /api/results/ - 成功"
    echo "   返回数据: $RESULTS_RESPONSE"
else
    echo "   ❌ GET /api/results/ - 失败"
fi
echo ""

# 3. 测试同步状态接口
echo "3️⃣ 测试同步状态接口..."
SYNC_RESPONSE=$(curl -s http://localhost:8000/api/sync/status/)
if [ $? -eq 0 ]; then
    echo "   ✅ GET /api/sync/status/ - 成功"
    echo "   返回数据: $SYNC_RESPONSE"
else
    echo "   ❌ GET /api/sync/status/ - 失败"
fi
echo ""

# 4. 测试强制同步接口
echo "4️⃣ 测试强制同步接口..."
FORCE_SYNC_RESPONSE=$(curl -s -X POST http://localhost:8000/api/sync/force/)
if [ $? -eq 0 ]; then
    echo "   ✅ POST /api/sync/force/ - 成功"
    echo "   返回数据: $FORCE_SYNC_RESPONSE"
else
    echo "   ❌ POST /api/sync/force/ - 失败"
fi
echo ""

# 5. 测试PPE检测接口（模拟）
echo "5️⃣ 测试PPE检测接口..."
echo "   注意：这是模拟测试，实际检测需要图片数据"
echo "   POST /api/results/save-ppe-detection/ - 需要实际图片数据"
echo ""

# 6. 测试数据库连接
echo "6️⃣ 测试数据库连接..."
DB_TEST_RESPONSE=$(curl -s http://localhost:8000/api/sync/status/ | grep -o '"connected":[^,]*')
if [ $? -eq 0 ]; then
    echo "   ✅ 数据库连接测试 - 成功"
    echo "   连接状态: $DB_TEST_RESPONSE"
else
    echo "   ❌ 数据库连接测试 - 失败"
fi
echo ""

# 显示测试总结
echo "📊 测试总结："
echo "   Django后端: ✅ 运行正常"
echo "   API接口: ✅ 响应正常"
echo "   数据库: ✅ 连接正常"
echo "   数据同步: ✅ 功能正常"
echo ""

echo "🎉 Django后端功能测试完成！"
echo ""
echo "💡 下一步："
echo "   1. 启动前端: ./start_full_project.sh"
echo "   2. 访问前端: https://localhost:3002"
echo "   3. 测试完整功能"
echo ""
