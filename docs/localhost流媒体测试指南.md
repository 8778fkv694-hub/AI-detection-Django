# Localhost 流媒体测试指南

本文档说明如何使用 localhost 地址测试流媒体虚拟摄像头功能。

## ✅ 支持的 Localhost 流类型

### 1. HTTP 视频流 ⭐️ **推荐**
- **协议**：HTTP/HTTPS
- **支持格式**：MJPEG、MP4、FLV
- **OpenCV支持**：✅ 完全支持
- **示例地址**：
  - `http://localhost:8080/video.mp4`
  - `http://localhost:5000/video_feed`
  - `http://127.0.0.1:8081/stream`

### 2. HLS 流（.m3u8）
- **协议**：HTTP Live Streaming
- **支持格式**：.m3u8
- **OpenCV支持**：✅ 支持（需要FFMPEG）
- **示例地址**：
  - `http://localhost:8080/stream.m3u8`

### 3. 本地 RTSP 服务器
- **协议**：RTSP
- **OpenCV支持**：⚠️ 需要FFMPEG支持
- **示例地址**：
  - `rtsp://localhost:8554/stream`
  - `rtsp://127.0.0.1:8554/mystream`

### 4. 本地视频文件 ⭐️ **最简单**
- **类型**：本地文件
- **支持格式**：MP4、AVI、MOV等
- **OpenCV支持**：✅ 完全支持
- **示例地址**：
  - `/Users/你的用户名/Videos/test.mp4`
  - `/tmp/test_video.mp4`
  - `~/Downloads/sample.mp4`

## 🚀 快速测试方法

### 方法1：使用本地视频文件（最简单）

1. **准备视频文件**
   ```bash
   # 下载测试视频（可选）
   curl -o ~/Downloads/test_video.mp4 "https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4"
   ```

2. **在流媒体管理中配置**
   - 流类型：`本地文件`
   - 流地址：`/Users/你的用户名/Downloads/test_video.mp4`
   - 启用：✅
   - 点击"启动"

### 方法2：使用系统摄像头创建HTTP流

如果你的系统有摄像头，可以创建一个简单的HTTP流服务器：

#### 安装Flask（如果尚未安装）
```bash
pip install flask
```

#### 运行测试服务器
```bash
cd "/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django"
python test_video_server.py
```

服务器启动后：
- **预览地址**：http://localhost:5000
- **流媒体地址**：`http://localhost:5000/video_feed`

#### 在流媒体管理中配置
- 流类型：`HTTP流`
- 流地址：`http://localhost:5000/video_feed`
- 启用：✅
- 点击"启动"

### 方法3：使用现有的Node.js服务器

如果你已经有Node.js HTTP服务器提供视频流：

```javascript
// 示例：Express服务器提供视频流
const express = require('express');
const fs = require('fs');
const app = express();

app.get('/video', (req, res) => {
  const videoPath = '/path/to/your/video.mp4';
  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize-1;
    const chunksize = (end-start)+1;
    const file = fs.createReadStream(videoPath, {start, end});
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(206, head);
    file.pipe(res);
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
    };
    res.writeHead(200, head);
    fs.createReadStream(videoPath).pipe(res);
  }
});

app.listen(8080, () => {
  console.log('视频服务器运行在 http://localhost:8080');
});
```

## 📋 配置示例

### 示例1：本地MP4文件
```
名称：本地测试视频
流类型：本地文件
流地址：/Users/yiliwen/Downloads/test.mp4
启用：✅
自动重连：❌（文件不需要重连）
```

### 示例2：本地HTTP流
```
名称：本地HTTP视频流
流类型：HTTP流
流地址：http://localhost:5000/video_feed
启用：✅
自动重连：✅
重连间隔：5秒
```

### 示例3：本地RTSP流（需要RTSP服务器）
```
名称：本地RTSP流
流类型：RTSP流
流地址：rtsp://localhost:8554/stream
启用：✅
自动重连：✅
重连间隔：5秒
用户名：（如果需要）
密码：（如果需要）
```

### 示例4：本地HLS流
```
名称：本地HLS流
流类型：HLS流
流地址：http://localhost:8080/live/stream.m3u8
启用：✅
自动重连：✅
重连间隔：5秒
```

## 🐛 故障排查

### 问题1：无法连接到localhost
**原因**：端口未开放或服务未启动
**解决**：
```bash
# 检查端口是否监听
lsof -i :5000  # 替换为你的端口号

# 检查服务是否运行
ps aux | grep video_server
```

### 问题2：视频文件找不到
**原因**：文件路径错误
**解决**：
- 使用绝对路径，不要使用相对路径
- 确保文件存在：`ls -la /path/to/video.mp4`
- 确保Django进程有读取权限

### 问题3：OpenCV无法读取
**原因**：文件格式不支持或损坏
**解决**：
```bash
# 测试OpenCV能否读取
python -c "import cv2; cap = cv2.VideoCapture('/path/to/video.mp4'); print('可读取:', cap.isOpened())"
```

### 问题4：HTTP流连接超时
**原因**：网络配置或防火墙
**解决**：
- 使用`127.0.0.1`而不是`localhost`
- 检查防火墙设置
- 确保服务器绑定到`0.0.0.0`或`127.0.0.1`

## 💡 最佳实践

1. **测试阶段**：使用本地文件最简单可靠
2. **开发阶段**：使用localhost HTTP流便于调试
3. **生产阶段**：使用实际的网络流媒体源
4. **性能优化**：
   - 降低视频分辨率和帧率
   - 使用合适的编码格式
   - 避免过多同时打开的流

## 📝 测试清单

- [ ] 测试本地视频文件播放
- [ ] 测试localhost HTTP流
- [ ] 验证流在检测页面可见
- [ ] 测试流的启动/停止
- [ ] 验证虚拟摄像头出现在下拉列表
- [ ] 测试帧捕获和检测功能

## 🔗 相关文档

- [流媒体虚拟摄像头集成指南](./流媒体虚拟摄像头集成指南.md)
- [OpenCV视频捕获文档](https://docs.opencv.org/4.x/d8/dfe/classcv_1_1VideoCapture.html)

## 🆘 需要帮助？

如果遇到问题：
1. 检查Django日志：`tail -f /tmp/django_server.log`
2. 检查浏览器控制台
3. 验证OpenCV安装：`python -c "import cv2; print(cv2.__version__)"`
4. 测试视频文件：使用VLC等播放器验证文件是否可播放

