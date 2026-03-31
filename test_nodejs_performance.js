/**
 * Node.js 流媒体服务性能测试脚本
 */
const VIDEO_PATH = "/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/IMG_2043.MOV";
const NODEJS_SERVICE = "http://localhost:3000";
const DJANGO_SERVICE = "http://localhost:8000";

// 测试配置
const TEST_CONFIG = {
  iterations: 10,
  streamId: "test_perf",
  quality: 95,
  width: 1280,
  format: "png"
};

/**
 * 测试 Node.js 服务
 */
async function testNodeJS() {
  console.log("\n=== 测试 Node.js + FFmpeg 服务 ===");
  const times = [];
  
  for (let i = 0; i < TEST_CONFIG.iterations; i++) {
    const start = Date.now();
    try {
      const url = new URL(`${NODEJS_SERVICE}/api/streams/${TEST_CONFIG.streamId}/frame`);
      url.searchParams.set('url', VIDEO_PATH);
      url.searchParams.set('stream_type', 'file');
      url.searchParams.set('quality', TEST_CONFIG.quality.toString());
      url.searchParams.set('width', TEST_CONFIG.width.toString());
      url.searchParams.set('format', TEST_CONFIG.format);
      
      const response = await fetch(url.toString());
      if (response.ok) {
        const data = await response.json();
        const duration = Date.now() - start;
        times.push(duration);
        console.log(`  第 ${i + 1} 次: ${duration}ms (帧大小: ${data.frame.length} 字符)`);
      } else {
        console.error(`  第 ${i + 1} 次失败: ${response.status}`);
      }
    } catch (error) {
      console.error(`  第 ${i + 1} 次错误:`, error.message);
    }
  }
  
  if (times.length > 0) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    console.log(`\n  平均: ${avg.toFixed(2)}ms`);
    console.log(`  最快: ${min}ms`);
    console.log(`  最慢: ${max}ms`);
    return { avg, min, max, times };
  }
  
  return null;
}

/**
 * 测试 Django 服务（如果可用）
 */
async function testDjango() {
  console.log("\n=== 测试 Django 服务 ===");
  // 这里需要先确保 Django 中有对应的流媒体配置
  // 暂时跳过，或者可以手动测试
  console.log("  (需要 Django 服务运行且有对应的流媒体配置)");
  return null;
}

/**
 * 并发测试
 */
async function testConcurrency() {
  console.log("\n=== 并发测试 (10个并发请求) ===");
  const start = Date.now();
  
  const promises = [];
  for (let i = 0; i < 10; i++) {
    const url = new URL(`${NODEJS_SERVICE}/api/streams/test${i}/frame`);
    url.searchParams.set('url', VIDEO_PATH);
    url.searchParams.set('stream_type', 'file');
    url.searchParams.set('quality', '95');
    url.searchParams.set('width', '1280');
    url.searchParams.set('format', 'png');
    
    promises.push(
      fetch(url.toString())
        .then(res => res.json())
        .then(data => ({ success: true, size: data.frame.length }))
        .catch(err => ({ success: false, error: err.message }))
    );
  }
  
  const results = await Promise.all(promises);
  const duration = Date.now() - start;
  const successCount = results.filter(r => r.success).length;
  
  console.log(`  总耗时: ${duration}ms`);
  console.log(`  成功: ${successCount}/10`);
  console.log(`  平均每个请求: ${(duration / 10).toFixed(2)}ms`);
  
  return { duration, successCount };
}

/**
 * 主测试函数
 */
async function runTests() {
  console.log("🚀 Node.js 流媒体服务性能测试");
  console.log("=".repeat(50));
  
  // 测试健康检查
  try {
    const health = await fetch(`${NODEJS_SERVICE}/health`);
    if (health.ok) {
      console.log("✅ Node.js 服务运行正常");
    } else {
      console.error("❌ Node.js 服务不可用");
      return;
    }
  } catch (error) {
    console.error("❌ 无法连接到 Node.js 服务:", error.message);
    console.error("   请确保服务运行在 http://localhost:3000");
    return;
  }
  
  // 运行测试
  const nodejsResults = await testNodeJS();
  await testConcurrency();
  
  // 总结
  console.log("\n" + "=".repeat(50));
  console.log("📊 测试总结");
  if (nodejsResults) {
    console.log(`  Node.js 平均响应时间: ${nodejsResults.avg.toFixed(2)}ms`);
    console.log(`  最快响应: ${nodejsResults.min}ms`);
    console.log(`  最慢响应: ${nodejsResults.max}ms`);
  }
  console.log("\n✅ 测试完成！");
}

// 运行测试
runTests().catch(console.error);

