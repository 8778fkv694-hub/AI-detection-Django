/**
 * Node.js 流媒体服务
 * 使用 FFmpeg 处理 RTSP/HTTP/本地文件流
 */
import express from 'express';
import cors from 'cors';
import { StreamManager } from './streamManager.js';
import { FrameService } from './frameService.js';
import { HLSService } from './hlsService.js';

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 流媒体管理器
const streamManager = new StreamManager();
const frameService = new FrameService(streamManager);
const hlsService = new HLSService(streamManager);

// ==================== 健康检查 ====================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'stream-media-service' });
});

// ==================== 流媒体管理 ====================

// 启动流媒体
app.post('/api/streams/:id/start', async (req, res) => {
  try {
    const { id } = req.params;
    const { url, stream_type = 'rtsp' } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: '缺少流媒体地址' });
    }
    
    const success = await streamManager.startStream(id, url, stream_type);
    
    if (success) {
      res.json({ 
        message: '流媒体启动成功',
        stream_id: id,
        status: 'active'
      });
    } else {
      res.status(500).json({ error: '流媒体启动失败' });
    }
  } catch (error) {
    console.error('启动流媒体失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 停止流媒体
app.post('/api/streams/:id/stop', async (req, res) => {
  try {
    const { id } = req.params;
    streamManager.stopStream(id);
    res.json({ message: '流媒体已停止', stream_id: id });
  } catch (error) {
    console.error('停止流媒体失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 获取流状态
app.get('/api/streams/:id/status', (req, res) => {
  try {
    const { id } = req.params;
    const status = streamManager.getStreamStatus(id);
    
    if (status) {
      res.json(status);
    } else {
      res.status(404).json({ error: '流媒体不存在' });
    }
  } catch (error) {
    console.error('获取流状态失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 帧服务 (PNG/JPEG) ====================

// 获取当前帧 (PNG/JPEG/WebP)
app.get('/api/streams/:id/frame', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      quality = 95, 
      width = 1280, 
      format = 'webp', // 'png', 'jpeg', 或 'webp'（默认webp）
      url = null,  // 可选：直接提供URL（如果流未启动）
      stream_type = 'rtsp'  // 流类型
    } = req.query;
    
    const frameData = await frameService.getFrame(
      id, 
      parseInt(quality), 
      parseInt(width),
      format,
      url || null,  // 如果提供了URL，使用它
      stream_type
    );
    
    if (frameData) {
      res.json({
        stream_id: id,
        frame: frameData.base64,
        format: format,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({ error: '无法获取视频帧' });
    }
  } catch (error) {
    console.error('获取帧失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== HLS 服务 ====================

// 启动 HLS 流
app.post('/api/streams/:id/start_hls', async (req, res) => {
  try {
    const { id } = req.params;
    const hlsUrl = await hlsService.startHLS(id);
    
    if (hlsUrl) {
      res.json({
        message: 'HLS流启动成功',
        stream_id: id,
        hls_url: hlsUrl
      });
    } else {
      res.status(500).json({ error: 'HLS流启动失败' });
    }
  } catch (error) {
    console.error('启动HLS失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 停止 HLS 流
app.post('/api/streams/:id/stop_hls', async (req, res) => {
  try {
    const { id } = req.params;
    hlsService.stopHLS(id);
    res.json({ message: 'HLS流已停止', stream_id: id });
  } catch (error) {
    console.error('停止HLS失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// 提供 HLS 文件服务
app.get('/api/streams/:id/hls/:filename', (req, res) => {
  try {
    const { id, filename } = req.params;
    const filePath = hlsService.getHLSPath(id, filename);
    
    if (filePath) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: '文件不存在' });
    }
  } catch (error) {
    console.error('获取HLS文件失败:', error);
    res.status(500).json({ error: error.message });
  }
});

// ==================== 启动服务 ====================
app.listen(PORT, () => {
  console.log(`🚀 流媒体服务启动在端口 ${PORT}`);
  console.log(`📡 健康检查: http://localhost:${PORT}/health`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('收到 SIGTERM，正在关闭服务...');
  streamManager.stopAll();
  process.exit(0);
});

