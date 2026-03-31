# WebP 格式测试指南

## 🎯 测试方法

### 方法1：浏览器开发者工具（最简单）

1. **打开浏览器开发者工具**
   - Chrome/Edge: `F12` 或 `Cmd+Option+I` (Mac) / `Ctrl+Shift+I` (Windows)
   - 切换到 **Network（网络）** 标签

2. **启动流媒体播放**
   - 在应用中选择一个虚拟流媒体摄像头
   - 等待视频开始播放

3. **查看网络请求**
   - 在 Network 标签中，找到 `/api/streams/{id}/frame` 请求
   - 点击请求，查看 **Headers（请求头）** 或 **Payload（负载）**
   - 检查 URL 参数中是否包含 `format=webp`

4. **验证响应**
   - 查看 **Response（响应）** 标签
   - 检查 `frame` 字段的 data URL 前缀：
     - ✅ WebP: `data:image/webp;base64,...`
     - ❌ PNG: `data:image/png;base64,...`
     - ❌ JPEG: `data:image/jpeg;base64,...`

5. **对比文件大小**
   - 在 Network 标签中查看 **Size（大小）** 列
   - WebP 应该比 PNG 小 60-80%
   - 例如：PNG 约 1-3MB，WebP 约 200-500KB

### 方法2：控制台日志

1. **打开浏览器控制台**
   - 在开发者工具中切换到 **Console（控制台）** 标签

2. **查看日志**
   - 启动流媒体后，应该看到类似日志：
   ```
   StreamPlayer: Canvas分辨率 1280x720, 质量: 100%, 格式: WEBP, FPS: 20
   ```

3. **检查格式**
   - 如果看到 `格式: WEBP`，说明正在使用 WebP
   - 如果看到 `格式: PNG` 或 `格式: JPEG`，说明使用了其他格式

### 方法3：代码中临时切换格式

在 `src/screens/KitMatchingScreen.tsx` 中修改：

```typescript
// 测试 WebP（默认，推荐）
const player = new StreamPlayer({
  videoElement: videoRef.current!,
  streamId: streamId,
  fps: 15,
  quality: 100,
  targetWidth: 1280,
  format: 'webp',  // ✅ WebP格式
  // ... 其他配置
});

// 测试 PNG（对比用）
const player = new StreamPlayer({
  videoElement: videoRef.current!,
  streamId: streamId,
  fps: 15,
  quality: 100,
  targetWidth: 1280,
  format: 'png',  // PNG格式
  // ... 其他配置
});

// 测试 JPEG（对比用）
const player = new StreamPlayer({
  videoElement: videoRef.current!,
  streamId: streamId,
  fps: 15,
  quality: 100,
  targetWidth: 1280,
  format: 'jpeg',  // JPEG格式
  // ... 其他配置
});
```

## 📊 性能对比测试

### 测试步骤

1. **使用 WebP 格式**
   - 启动流媒体，记录：
     - 网络请求大小
     - 页面加载时间
     - CPU 使用率（在任务管理器中查看）

2. **切换到 PNG 格式**
   - 修改代码使用 `format: 'png'`
   - 重新启动流媒体，记录相同指标

3. **对比结果**

| 指标 | PNG | WebP | 改善 |
|------|-----|------|------|
| 单帧大小 | 1-3MB | 200-500KB | **减少 70%** |
| 传输时间 | ~500ms | ~150ms | **减少 70%** |
| CPU占用 | 中 | 低 | **更低** |
| 清晰度 | 高 | 高 | **相同** |

## 🔍 验证 WebP 是否生效

### 快速验证脚本

在浏览器控制台中运行：

```javascript
// 检查当前使用的格式
const checkFormat = () => {
  const requests = performance.getEntriesByType('resource')
    .filter(r => r.name.includes('/frame'))
    .map(r => {
      const url = new URL(r.name);
      return {
        url: r.name,
        format: url.searchParams.get('format'),
        size: r.transferSize,
        duration: r.duration
      };
    });
  
  console.table(requests);
  return requests;
};

// 运行检查
checkFormat();
```

### 手动检查网络请求

1. 打开 Network 标签
2. 过滤：输入 `frame` 过滤请求
3. 查看请求 URL，应该包含 `format=webp`
4. 查看响应，`frame` 字段应该以 `data:image/webp;base64,` 开头

## 🛠️ 切换格式的方法

### 方法1：修改 StreamPlayer 配置（推荐）

在创建 StreamPlayer 时指定格式：

```typescript
const player = new StreamPlayer({
  videoElement: videoRef.current!,
  streamId: streamId,
  format: 'webp',  // 或 'png' 或 'jpeg'
  // ... 其他配置
});
```

### 方法2：修改 API 调用

直接调用 `getStreamFrame` 时指定格式：

```typescript
const frameData = await getStreamFrame(streamId, 95, 1280, 'webp');
```

### 方法3：通过 URL 参数（如果使用 Django API）

在浏览器中直接访问：
```
http://localhost:8000/api/streams/{id}/frame/?quality=95&width=1280&format=webp
```

## 📝 测试清单

- [ ] 浏览器开发者工具中看到 `format=webp` 参数
- [ ] 响应中的 data URL 以 `data:image/webp;base64,` 开头
- [ ] 控制台日志显示 `格式: WEBP`
- [ ] 文件大小比 PNG 小 60-80%
- [ ] 视频清晰度与 PNG 相当
- [ ] CPU 占用低于 PNG
- [ ] 视频播放流畅

## 🐛 常见问题

### Q: 看不到 format 参数？
A: 检查 Node.js 服务是否运行，Django 可能回退到原生实现。

### Q: 文件大小没有减少？
A: 检查质量参数，WebP 质量 95-100 时文件可能较大，但清晰度更高。

### Q: 浏览器不支持 WebP？
A: 现代浏览器（Chrome 23+, Edge 18+, Firefox 65+）都支持。如果使用旧浏览器，会自动回退。

### Q: 如何确认使用的是 WebP？
A: 查看 Network 标签中的请求 URL 和响应内容，确认包含 `webp`。

## 🎉 成功标志

如果看到以下情况，说明 WebP 方案已成功：

1. ✅ Network 请求 URL 包含 `format=webp`
2. ✅ 响应 data URL 以 `data:image/webp;base64,` 开头
3. ✅ 文件大小明显小于 PNG（减少 60-80%）
4. ✅ 控制台显示 `格式: WEBP`
5. ✅ 视频清晰度良好
6. ✅ 播放流畅，无卡顿

