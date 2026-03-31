# Moondream3-preview 模型使用说明

## 🌙 概述

Moondream3-preview 是 ModelScope 上的最新多模态模型，专为图像理解和分析设计。本配置通过 ModelScope SDK 下载模型并部署到 Ollama 中，针对 Mac M2/24GB 环境进行了优化。

## 🚀 快速安装

### 方法一：使用简化脚本（推荐）

```bash
# 1. 安装依赖
pip install modelscope transformers torch

# 2. 运行安装脚本
python3 install_moondream3_simple.py
```

### 方法二：使用完整脚本

```bash
# 运行完整安装脚本
python3 setup_moondream3.py
```

### 方法三：手动安装

```python
# 1. 下载模型
from modelscope import snapshot_download
model_dir = snapshot_download('moondream/moondream3-preview')

# 2. 创建 Modelfile（参考 moondream3-preview.Modelfile）

# 3. 创建 Ollama 模型
# ollama create moondream3-preview -f moondream3-preview.Modelfile
```

## ⚙️ 配置参数

### 模型配置

| 参数 | 值 | 说明 |
|------|-----|------|
| 模型名称 | `moondream3-preview` | ModelScope 官方模型 |
| GPU 层数 | 999 | 最大 GPU 加速 |
| 线程数 | 4 | M2 性能核数量 |
| 上下文长度 | 2048 | 适合轻量级模型 |
| 输出长度 | 96 | 短输出，提高速度 |
| 温度 | 0.2 | 低温度，稳定输出 |
| 保持活跃 | 2小时 | 减少冷启动时间 |

### 性能优化

- **图片压缩**: 自动压缩到 512-768 像素
- **格式优化**: 推荐使用 JPEG 格式
- **内存管理**: 启用半精度浮点数
- **缓存策略**: 保持模型热启动

## 🎯 使用场景

### 1. 图像质量检测

```bash
# CLI 使用
ollama run moondream3-preview -i test.jpg "分析图片质量，返回JSON格式"
```

### 2. 图像内容描述

```bash
# 简单描述
ollama run moondream3-preview -i test.jpg "用最简短中文回答，50字内"
```

### 3. API 调用

```javascript
// JavaScript API 调用
const response = await fetch('http://localhost:11437/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'moondream3-preview',
    messages: [
      { role: 'user', content: '分析图片', images: ['base64_image_data'] }
    ],
    stream: false,
    options: {
      num_gpu_layers: 999,
      num_thread: 4,
      num_ctx: 2048,
      num_predict: 96,
      temperature: 0.2
    }
  })
});
```

## 📊 性能特点

### 优势

- ✅ **最新模型**: ModelScope 官方 moondream3-preview
- ✅ **轻量级**: 仅需 ~3GB 内存
- ✅ **快速响应**: 通常 1-3 秒完成分析
- ✅ **低延迟**: 优化的 M2 芯片参数
- ✅ **稳定输出**: 低温度设置确保一致性
- ✅ **多模态**: 支持图像和文本理解

### 适用场景

- 🎯 图像质量检测
- 🎯 内容描述和分类
- 🎯 快速图像分析
- 🎯 实时检测应用
- 🎯 移动端部署

## 🔧 配置预设

### 标准模式

```javascript
const MOONDREAM3_CONFIG = {
  modelName: 'moondream3-preview',
  temperature: 0.2,     // 低温度
  maxTokens: 96,        // 短输出
  contextLength: 2048,  // 标准上下文
  timeout: 60000        // 1分钟超时
};
```

### 快速模式

```javascript
const MOONDREAM3_FAST_CONFIG = {
  modelName: 'moondream3-preview',
  temperature: 0.1,     // 更低温度
  maxTokens: 64,        // 更短输出
  contextLength: 1024,  // 更小上下文
  timeout: 30000        // 30秒超时
};
```

### 质量模式

```javascript
const MOONDREAM3_QUALITY_CONFIG = {
  modelName: 'moondream3-preview',
  temperature: 0.3,     // 稍高温度
  maxTokens: 128,       // 更多输出
  contextLength: 2048,  // 标准上下文
  timeout: 90000        // 1.5分钟超时
};
```

## 🛠️ 故障排除

### 常见问题

1. **ModelScope 下载失败**
   ```bash
   # 检查网络连接
   pip install --upgrade modelscope
   # 重新下载
   python3 install_moondream3_simple.py
   ```

2. **Ollama 模型创建失败**
   ```bash
   # 检查 Ollama 服务
   ollama serve
   # 检查 Modelfile 路径
   cat moondream3-preview.Modelfile
   ```

3. **模型响应超时**
   ```bash
   # 检查服务状态
   curl http://localhost:11434/api/version
   curl http://localhost:11437/api/version
   ```

4. **内存不足**
   ```bash
   # 重启 Ollama 服务
   pkill -f ollama
   ollama serve &
   ```

### 性能优化建议

1. **图片预处理**
   - 压缩到 512-768 像素
   - 使用 JPEG 格式，质量 0.7
   - 移除无关区域

2. **模型配置**
   - 保持模型热启动
   - 使用合适的上下文长度
   - 调整输出长度限制

3. **系统优化**
   - 确保足够的可用内存
   - 关闭不必要的后台程序
   - 使用 SSD 存储

## 📈 监控和调试

### 性能监控

```javascript
// 使用内置监控器
const monitor = new MoondreamMonitor();
monitor.start();

// 执行分析
const result = await analyzeImage(image);

// 查看性能报告
const report = monitor.end();
console.log('处理时间:', report.totalTime, 'ms');
console.log('内存使用:', report.memoryUsed, 'MB');
```

### 日志查看

```bash
# 查看 Ollama 日志
tail -f ollama.log

# 查看代理服务日志
tail -f ollama-proxy.log

# 查看前端日志
tail -f frontend.log
```

## 🔄 更新和维护

### 模型更新

```bash
# 更新到最新版本
python3 install_moondream3_simple.py

# 或者手动更新
from modelscope import snapshot_download
model_dir = snapshot_download('moondream/moondream3-preview')
```

### 配置备份

```bash
# 备份配置文件
cp moondream3-preview.Modelfile ./backup/

# 恢复配置
cp ./backup/moondream3-preview.Modelfile ./
ollama create moondream3-preview -f moondream3-preview.Modelfile
```

## 📚 参考资源

- [ModelScope 官方文档](https://modelscope.cn/docs)
- [Moondream3 模型页面](https://modelscope.cn/models/moondream/moondream3-preview)
- [Ollama 官方文档](https://ollama.com/docs)
- [Mac M2 优化指南](https://developer.apple.com/metal/)

## 🆘 技术支持

如果遇到问题，请：

1. 检查 ModelScope 网络连接
2. 验证 Ollama 服务状态
3. 查看日志文件
4. 参考故障排除部分

---

*最后更新: 2024年12月*
