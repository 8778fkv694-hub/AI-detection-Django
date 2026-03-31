#!/bin/bash

# WebP格式测试脚本
# 用于快速测试和验证WebP格式是否正常工作

echo "🎨 WebP格式测试工具"
echo "===================="
echo ""

# 检查Node.js服务是否运行
echo "1️⃣ 检查Node.js流媒体服务..."
NODEJS_STATUS=$(curl -s http://localhost:3000/health 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "   ✅ Node.js服务运行正常"
else
    echo "   ⚠️  Node.js服务未运行，请先启动："
    echo "      cd nodejs-stream-service && npm start"
    echo ""
fi

# 检查Django服务是否运行
echo ""
echo "2️⃣ 检查Django服务..."
DJANGO_STATUS=$(curl -s http://localhost:8000/api/health 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "   ✅ Django服务运行正常"
else
    echo "   ⚠️  Django服务可能未运行"
    echo ""
fi

echo ""
echo "3️⃣ 测试WebP格式API..."
echo "   测试URL: http://localhost:3000/api/streams/test/frame?format=webp&quality=95&width=1280"
echo ""

# 如果有stream ID，可以实际测试
if [ -n "$1" ]; then
    STREAM_ID=$1
    echo "   正在测试流ID: $STREAM_ID"
    
    # 测试WebP格式
    echo ""
    echo "   📊 测试WebP格式..."
    WEBP_RESPONSE=$(curl -s "http://localhost:3000/api/streams/$STREAM_ID/frame?format=webp&quality=95&width=1280" \
        -H "Content-Type: application/json" 2>/dev/null)
    
    if echo "$WEBP_RESPONSE" | grep -q "data:image/webp"; then
        WEBP_SIZE=$(echo "$WEBP_RESPONSE" | grep -o "data:image/webp;base64,[^\"}]*" | wc -c)
        echo "   ✅ WebP格式正常"
        echo "   📦 响应大小: ~$((WEBP_SIZE / 1024)) KB"
    else
        echo "   ❌ WebP格式测试失败"
        echo "   响应: ${WEBP_RESPONSE:0:200}..."
    fi
    
    # 对比PNG格式
    echo ""
    echo "   📊 对比PNG格式..."
    PNG_RESPONSE=$(curl -s "http://localhost:3000/api/streams/$STREAM_ID/frame?format=png&quality=95&width=1280" \
        -H "Content-Type: application/json" 2>/dev/null)
    
    if echo "$PNG_RESPONSE" | grep -q "data:image/png"; then
        PNG_SIZE=$(echo "$PNG_RESPONSE" | grep -o "data:image/png;base64,[^\"}]*" | wc -c)
        echo "   ✅ PNG格式正常"
        echo "   📦 响应大小: ~$((PNG_SIZE / 1024)) KB"
        
        if [ -n "$WEBP_SIZE" ] && [ -n "$PNG_SIZE" ]; then
            REDUCTION=$((100 - (WEBP_SIZE * 100 / PNG_SIZE)))
            echo ""
            echo "   📉 文件大小减少: ~${REDUCTION}%"
        fi
    else
        echo "   ❌ PNG格式测试失败"
    fi
else
    echo "   💡 提示: 运行此脚本时提供流ID可以实际测试"
    echo "   用法: ./test_webp_format.sh <stream_id>"
fi

echo ""
echo "4️⃣ 浏览器测试步骤:"
echo "   1. 打开浏览器开发者工具 (F12)"
echo "   2. 切换到 Network 标签"
echo "   3. 启动流媒体播放"
echo "   4. 查找 /api/streams/{id}/frame 请求"
echo "   5. 检查URL参数是否包含 format=webp"
echo "   6. 检查响应中的frame字段是否以 data:image/webp 开头"
echo ""

echo "5️⃣ 控制台检查脚本:"
echo "   打开浏览器控制台，运行以下代码："
echo ""
cat << 'EOF'
const checkFormat = () => {
  const requests = performance.getEntriesByType('resource')
    .filter(r => r.name.includes('/frame'))
    .map(r => {
      const url = new URL(r.name);
      return {
        format: url.searchParams.get('format') || '未指定',
        size: (r.transferSize / 1024).toFixed(2) + ' KB',
        duration: r.duration.toFixed(2) + ' ms'
      };
    });
  
  if (requests.length === 0) {
    console.log('❌ 未找到frame请求');
    return;
  }
  
  console.table(requests);
  const last = requests[requests.length - 1];
  if (last.format === 'webp') {
    console.log('✅ 正在使用WebP格式！');
  } else {
    console.log('⚠️  格式:', last.format);
  }
};
checkFormat();
EOF

echo ""
echo "✅ 测试完成！"
echo ""

