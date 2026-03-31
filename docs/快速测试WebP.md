# 🚀 快速测试WebP格式

## 方法1: 浏览器开发者工具（最简单）⭐

### 步骤：

1. **打开应用并启动流媒体**
   - 选择一个虚拟流媒体摄像头
   - 等待视频开始播放

2. **打开开发者工具**
   - 按 `F12` 或 `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)

3. **切换到Network标签**
   - 点击 **Network（网络）** 标签

4. **过滤请求**
   - 在过滤框中输入 `frame`
   - 找到 `/api/streams/{id}/frame` 请求

5. **检查格式**
   - 点击请求，查看 **Headers（请求头）**
   - 在 **Query String Parameters** 中查找 `format=webp`
   - 或者在 **Request URL** 中看到 `format=webp`

6. **验证响应**
   - 切换到 **Response（响应）** 标签
   - 查看 `frame` 字段
   - ✅ 应该以 `data:image/webp;base64,` 开头

7. **查看文件大小**
   - 在Network列表中查看 **Size** 列
   - WebP应该比PNG小60-80%

---

## 方法2: 控制台脚本（快速检查）⭐

### 在浏览器控制台中运行：

```javascript
// 检查当前使用的格式
const checkFormat = () => {
  const requests = performance.getEntriesByType('resource')
    .filter(r => r.name.includes('/frame'))
    .map(r => {
      const url = new URL(r.name);
      return {
        url: r.name.split('?')[0],
        format: url.searchParams.get('format') || '未指定',
        size: (r.transferSize / 1024).toFixed(2) + ' KB',
        duration: r.duration.toFixed(2) + ' ms'
      };
    });
  
  if (requests.length === 0) {
    console.log('❌ 未找到frame请求，请先启动流媒体播放');
    return null;
  }
  
  console.table(requests);
  
  const lastRequest = requests[requests.length - 1];
  if (lastRequest.format === 'webp') {
    console.log('✅ 正在使用WebP格式！');
    console.log('📦 文件大小:', lastRequest.size);
  } else if (lastRequest.format === 'png') {
    console.log('⚠️  正在使用PNG格式（建议切换到WebP）');
  } else if (lastRequest.format === 'jpeg') {
    console.log('⚠️  正在使用JPEG格式（建议切换到WebP）');
  } else {
    console.log('❓ 格式未知:', lastRequest.format);
  }
  
  return requests;
};

// 运行检查
checkFormat();
```

### 预期输出：

```
┌─────────┬──────────────────────────────┬──────────┬──────────┬──────────┐
│ (index) │             url             │  format  │   size   │ duration │
├─────────┼──────────────────────────────┼──────────┼──────────┼──────────┤
│    0    │ '/api/streams/1/frame'      │  'webp'  │ '245.32' │ '156.78' │
└─────────┴──────────────────────────────┴──────────┴──────────┴──────────┘
✅ 正在使用WebP格式！
📦 文件大小: 245.32 KB
```

---

## 方法3: 查看控制台日志

### 启动流媒体后，控制台应该显示：

```
StreamPlayer: 开始播放流媒体 1, FPS: 20 (窗口 window_xxx)
StreamPlayer: Canvas分辨率 1280x720, 质量: 100%, 格式: WEBP, FPS: 20
```

如果看到 `格式: WEBP`，说明正在使用WebP格式！

---

## 方法4: 直接测试API（命令行）

### 使用curl测试：

```bash
# 测试WebP格式
curl "http://localhost:3000/api/streams/{stream_id}/frame?format=webp&quality=95&width=1280" \
  | jq '.frame' | head -c 50

# 应该输出: "data:image/webp;base64,iVBORw0KGgoAAAANS..."
```

### 使用测试脚本：

```bash
# 运行测试脚本
./scripts/test_webp_format.sh

# 或者指定流ID进行实际测试
./scripts/test_webp_format.sh 1
```

---

## 方法5: 代码中切换格式测试

### 在 `src/screens/KitMatchingScreen.tsx` 中：

```typescript
// 测试WebP（默认，推荐）
const player = new StreamPlayer({
  videoElement: videoRef.current!,
  streamId: streamId,
  fps: 15,
  quality: 100,
  targetWidth: 1280,
  format: 'webp',  // ✅ WebP格式
  // ... 其他配置
});

// 测试PNG（对比用）
const player = new StreamPlayer({
  videoElement: videoRef.current!,
  streamId: streamId,
  fps: 15,
  quality: 100,
  targetWidth: 1280,
  format: 'png',  // PNG格式
  // ... 其他配置
});
```

---

## ✅ 验证清单

- [ ] Network请求URL包含 `format=webp`
- [ ] 响应中的 `frame` 字段以 `data:image/webp;base64,` 开头
- [ ] 控制台日志显示 `格式: WEBP`
- [ ] 文件大小比PNG小60-80%
- [ ] 视频清晰度良好
- [ ] 播放流畅无卡顿

---

## 🔄 切换格式

### 方式1: 修改StreamPlayer配置

```typescript
format: 'webp'  // 或 'png' 或 'jpeg'
```

### 方式2: 直接API调用

```typescript
// WebP
await getStreamFrame(streamId, 95, 1280, 'webp');

// PNG
await getStreamFrame(streamId, 95, 1280, 'png');

// JPEG
await getStreamFrame(streamId, 95, 1280, 'jpeg');
```

---

## 📊 性能对比

| 格式 | 文件大小 | 清晰度 | CPU占用 | 推荐度 |
|------|---------|--------|---------|--------|
| **WebP** | 200-500KB | 高 | 低 | ⭐⭐⭐⭐⭐ |
| PNG | 1-3MB | 高 | 中 | ⭐⭐⭐ |
| JPEG | 300-500KB | 中 | 低 | ⭐⭐⭐ |

---

## 🐛 常见问题

### Q: 看不到format参数？
**A:** 检查Node.js服务是否运行。如果Django回退到原生实现，可能没有format参数。

### Q: 文件大小没有减少？
**A:** 检查质量参数。WebP质量95-100时文件可能较大，但清晰度更高。

### Q: 如何确认使用的是WebP？
**A:** 
1. 查看Network请求URL中的 `format=webp`
2. 查看响应中 `frame` 字段以 `data:image/webp` 开头
3. 控制台日志显示 `格式: WEBP`

---

## 🎉 成功标志

如果看到以下情况，说明WebP方案已成功：

1. ✅ Network请求URL包含 `format=webp`
2. ✅ 响应data URL以 `data:image/webp;base64,` 开头
3. ✅ 文件大小明显小于PNG（减少60-80%）
4. ✅ 控制台显示 `格式: WEBP`
5. ✅ 视频清晰度良好
6. ✅ 播放流畅，无卡顿

---

## 📝 快速测试命令

```bash
# 1. 检查Node.js服务
curl http://localhost:3000/health

# 2. 测试WebP格式（替换{stream_id}为实际流ID）
curl "http://localhost:3000/api/streams/{stream_id}/frame?format=webp&quality=95&width=1280" | jq '.format'

# 3. 运行测试脚本
./scripts/test_webp_format.sh
```

