# 🎨 WebP格式测试指南

## 🚀 快速开始

### 最简单的测试方法（推荐）

1. **打开应用，启动流媒体播放**
2. **按 `F12` 打开开发者工具**
3. **切换到 Network 标签**
4. **过滤输入 `frame`**
5. **点击请求，查看URL参数**
6. **确认看到 `format=webp`** ✅

---

## 📋 详细测试步骤

### 方法1: 浏览器开发者工具

#### 步骤：

1. 启动流媒体播放
2. 打开开发者工具 (`F12`)
3. 切换到 **Network** 标签
4. 过滤：输入 `frame`
5. 找到 `/api/streams/{id}/frame` 请求
6. 点击请求，查看：
   - **Headers** → **Query String Parameters** → 确认 `format=webp`
   - **Response** → 确认 `frame` 字段以 `data:image/webp;base64,` 开头
   - **Size** → 查看文件大小（应该比PNG小60-80%）

### 方法2: 控制台脚本

在浏览器控制台中运行：

```javascript
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
```

### 方法3: 查看控制台日志

启动流媒体后，控制台应该显示：

```
StreamPlayer: Canvas分辨率 1280x720, 质量: 100%, 格式: WEBP, FPS: 20
```

如果看到 `格式: WEBP`，说明成功！✅

---

## 🔄 切换格式测试

### 在代码中切换：

```typescript
// WebP格式（默认，推荐）
const player = new StreamPlayer({
  format: 'webp',  // ✅ 高质量、小文件
  // ...
});

// PNG格式（对比用）
const player = new StreamPlayer({
  format: 'png',  // 文件大但清晰
  // ...
});

// JPEG格式（对比用）
const player = new StreamPlayer({
  format: 'jpeg',  // 文件小但质量稍差
  // ...
});
```

---

## 📊 预期结果

| 格式 | 文件大小 | 清晰度 | CPU占用 |
|------|---------|--------|---------|
| **WebP** | 200-500KB | 高 | 低 |
| PNG | 1-3MB | 高 | 中 |
| JPEG | 300-500KB | 中 | 低 |

---

## ✅ 验证清单

- [ ] Network请求URL包含 `format=webp`
- [ ] 响应以 `data:image/webp;base64,` 开头
- [ ] 控制台显示 `格式: WEBP`
- [ ] 文件大小比PNG小60-80%
- [ ] 视频清晰度良好
- [ ] 播放流畅

---

## 🛠️ 命令行测试

```bash
# 运行测试脚本
./scripts/test_webp_format.sh

# 或指定流ID
./scripts/test_webp_format.sh 1
```

---

## 📁 相关文件

- **测试工具**: `test_webp_format.html` - 浏览器测试页面
- **测试脚本**: `scripts/test_webp_format.sh` - 命令行测试
- **详细文档**: `docs/快速测试WebP.md` - 完整测试指南
- **技术文档**: `docs/WebP格式测试指南.md` - 技术细节

---

## 🎉 成功标志

如果看到以下情况，说明WebP已成功：

1. ✅ Network请求包含 `format=webp`
2. ✅ 响应以 `data:image/webp;base64,` 开头
3. ✅ 文件大小明显小于PNG
4. ✅ 控制台显示 `格式: WEBP`
5. ✅ 视频清晰流畅

---

## 💡 提示

- **默认使用WebP**：无需修改代码，默认就是WebP格式
- **自动回退**：如果浏览器不支持WebP，会自动使用其他格式
- **性能优化**：WebP在保持高质量的同时，文件大小减少70%

