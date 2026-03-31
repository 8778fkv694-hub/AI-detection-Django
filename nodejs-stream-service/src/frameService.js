/**
 * 帧服务
 * 使用 FFmpeg 获取视频帧并编码为 PNG/JPEG/WebP
 */
import { spawn } from 'child_process';
import sharp from 'sharp';

export class FrameService {
  constructor(streamManager) {
    this.streamManager = streamManager;
    this.frameCache = new Map(); // streamId -> { frame, timestamp }
    this.cacheTimeout = 100; // 缓存 100ms
  }

  /**
   * 获取当前帧
   * @param {string} streamId - 流ID
   * @param {number} quality - 质量 (1-100)
   * @param {number} width - 目标宽度
   * @param {string} format - 格式 ('png', 'jpeg', 或 'webp')
   * @returns {Promise<{base64: string, buffer: Buffer}>}
   */
  async getFrame(streamId, quality = 95, width = 1280, format = 'webp', url = null, streamType = 'rtsp') {
    // 检查缓存
    const cached = this.frameCache.get(streamId);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.frame;
    }

    // 获取流信息（如果流已启动）
    const streamInfo = this.streamManager.getStream(streamId);
    let sourceUrl = url;
    let sourceType = streamType;

    if (streamInfo && streamInfo.isRunning) {
      sourceUrl = streamInfo.url;
      sourceType = streamInfo.streamType;
    } else if (!sourceUrl) {
      throw new Error('流媒体未运行且未提供URL');
    }

    try {
      // 使用 FFmpeg 获取单帧
      const frameData = await this.captureFrame(
        sourceUrl,
        sourceType,
        quality,
        width,
        format
      );

      // 缓存帧
      this.frameCache.set(streamId, {
        frame: frameData,
        timestamp: Date.now()
      });

      return frameData;

    } catch (error) {
      console.error(`[FrameService] 获取帧失败 (${streamId}):`, error);
      throw error;
    }
  }

  /**
   * 使用 FFmpeg 捕获单帧
   */
  async captureFrame(url, streamType, quality, width, format) {
    return new Promise((resolve, reject) => {
      const args = [];

      // RTSP 特殊处理
      if (streamType === 'rtsp') {
        args.push('-rtsp_transport', 'tcp', '-timeout', '5000000');
      }
      
      // 本地文件特殊处理
      if (streamType === 'file' || streamType === 'local_file') {
        args.push('-ss', '0');  // 从开始读取
        args.push('-i', url);
        args.push('-frames:v', '1');  // 只读取一帧
      } else {
        args.push('-i', url);
        args.push('-frames:v', '1');  // 只读取一帧
      }
      
      // 禁用音频（减少处理时间）
      args.push('-an');
      
      // 缩放（如果需要）
      if (width > 0) {
        args.push('-vf', `scale=${width}:-1:flags=lanczos`);  // 高质量缩放
      }
      
      // 输出格式和质量
      // 注意：FFmpeg可能不支持libwebp编码器，所以WebP格式先获取PNG，然后用sharp转换
      const needsWebPConversion = format === 'webp';
      const ffmpegFormat = needsWebPConversion ? 'png' : format; // WebP先获取PNG
      
      if (ffmpegFormat === 'png') {
        args.push('-f', 'image2', '-vcodec', 'png');  // PNG 格式
        // PNG 压缩通过 -pred 和 -compression_level 控制，但 FFmpeg 的 PNG 编码器不支持这些参数
        // 我们使用默认压缩，或者可以后续用 sharp 处理
      } else {
        args.push('-f', 'image2', '-vcodec', 'mjpeg');  // JPEG 格式
        const jpegQuality = Math.max(2, Math.min(31, Math.floor((100 - quality) / 3.1))); // 2-31
        args.push('-q:v', jpegQuality.toString());
      }
      
      args.push('-');  // 输出到 stdout

      const ffmpeg = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const chunks = [];
      let errorOutput = '';

      // 收集输出数据
      ffmpeg.stdout.on('data', (chunk) => {
        chunks.push(chunk);
      });

      // 收集错误信息
      ffmpeg.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      // 处理完成
      ffmpeg.on('close', async (code) => {
        if (code === 0 && chunks.length > 0) {
          let buffer = Buffer.concat(chunks);
          
          // 如果需要WebP格式，使用sharp转换PNG到WebP
          if (needsWebPConversion) {
            try {
              const webpQuality = Math.max(0, Math.min(100, quality));
              buffer = await sharp(buffer)
                .webp({ 
                  quality: webpQuality,
                  effort: 4  // 压缩努力程度：0-6，4是平衡点
                })
                .toBuffer();
            } catch (sharpError) {
              reject(new Error(`Sharp WebP转换失败: ${sharpError.message}`));
              return;
            }
          }
          
          const base64 = buffer.toString('base64');
          // 根据格式返回正确的MIME类型
          const mimeType = format === 'webp' ? 'webp' : format === 'png' ? 'png' : 'jpeg';
          resolve({
            base64: `data:image/${mimeType};base64,${base64}`,
            buffer: buffer
          });
        } else {
          reject(new Error(`FFmpeg 失败 (代码: ${code}): ${errorOutput.slice(-200)}`));
        }
      });

      // 处理错误
      ffmpeg.on('error', (error) => {
        reject(new Error(`FFmpeg 进程错误: ${error.message}`));
      });

      // 超时处理（10秒，本地文件可能需要更多时间）
      const timeout = streamType === 'file' || streamType === 'local_file' ? 10000 : 5000;
      setTimeout(() => {
        if (!ffmpeg.killed) {
          ffmpeg.kill('SIGKILL');
          reject(new Error('获取帧超时'));
        }
      }, timeout);
    });
  }

  /**
   * 清理缓存
   */
  clearCache(streamId) {
    if (streamId) {
      this.frameCache.delete(streamId);
    } else {
      this.frameCache.clear();
    }
  }
}

