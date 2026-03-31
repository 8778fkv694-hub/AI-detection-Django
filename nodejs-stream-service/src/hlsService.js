/**
 * HLS 流服务
 * 使用 FFmpeg 生成 HLS 流
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class HLSService {
  constructor(streamManager) {
    this.streamManager = streamManager;
    this.hlsStreams = new Map(); // streamId -> HLSInfo
    this.baseOutputDir = path.join(process.cwd(), 'media', 'hls');
    
    // 确保输出目录存在
    if (!fs.existsSync(this.baseOutputDir)) {
      fs.mkdirSync(this.baseOutputDir, { recursive: true });
    }
  }

  /**
   * 启动 HLS 流
   * @param {string} streamId - 流ID
   * @returns {Promise<string>} HLS URL
   */
  async startHLS(streamId) {
    // 如果已存在，先停止
    if (this.hlsStreams.has(streamId)) {
      this.stopHLS(streamId);
    }

    const streamInfo = this.streamManager.getStream(streamId);
    if (!streamInfo) {
      throw new Error('流媒体未启动');
    }

    try {
      const outputDir = path.join(this.baseOutputDir, streamId);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const playlistFile = path.join(outputDir, 'playlist.m3u8');
      const segmentPattern = path.join(outputDir, 'segment%03d.ts');

      // 构建 FFmpeg 命令
      const args = ['-re']; // 实时模式

      // 本地文件循环
      if (streamInfo.streamType === 'file') {
        args.push('-stream_loop', '-1');
      }

      // RTSP 特殊处理
      if (streamInfo.streamType === 'rtsp') {
        args.push('-rtsp_transport', 'tcp', '-timeout', '5000000');
      }

      args.push(
        '-i', streamInfo.url,
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '18',
        '-g', '50',
        '-sc_threshold', '0',
        '-an',  // 禁用音频
        '-f', 'hls',
        '-hls_time', '2',
        '-hls_list_size', '10',
        '-hls_flags', 'delete_segments+append_list',
        '-hls_segment_filename', segmentPattern,
        '-hls_playlist_type', 'event',
        '-loglevel', 'warning',
        playlistFile
      );

      console.log(`[HLSService] 启动 HLS: ${streamId}`);
      console.log(`[HLSService] FFmpeg 命令: ffmpeg ${args.join(' ')}`);

      const ffmpegProcess = spawn('ffmpeg', args, {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      const hlsInfo = {
        streamId,
        process: ffmpegProcess,
        outputDir,
        playlistFile,
        isRunning: true,
        startTime: new Date()
      };

      // 处理输出
      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        if (output.includes('error') || output.includes('Error')) {
          console.error(`[HLSService ${streamId}] 错误:`, output.slice(0, 200));
        }
      });

      // 处理退出
      ffmpegProcess.on('exit', (code) => {
        console.log(`[HLSService ${streamId}] 进程退出，代码: ${code}`);
        hlsInfo.isRunning = false;
      });

      // 处理错误
      ffmpegProcess.on('error', (error) => {
        console.error(`[HLSService ${streamId}] 进程错误:`, error);
        hlsInfo.isRunning = false;
      });

      this.hlsStreams.set(streamId, hlsInfo);

      // 等待播放列表文件生成（最多5秒）
      for (let i = 0; i < 50; i++) {
        if (fs.existsSync(playlistFile)) {
          const hlsUrl = `/api/streams/${streamId}/hls/playlist.m3u8`;
          console.log(`[HLSService] HLS 流启动成功: ${hlsUrl}`);
          return hlsUrl;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      throw new Error('HLS 播放列表文件生成超时');

    } catch (error) {
      console.error(`[HLSService] 启动 HLS 失败:`, error);
      this.stopHLS(streamId);
      throw error;
    }
  }

  /**
   * 停止 HLS 流
   */
  stopHLS(streamId) {
    const hlsInfo = this.hlsStreams.get(streamId);
    if (hlsInfo) {
      console.log(`[HLSService] 停止 HLS: ${streamId}`);
      
      if (hlsInfo.process && !hlsInfo.process.killed) {
        hlsInfo.process.kill('SIGTERM');
        
        // 3秒后强制杀死
        setTimeout(() => {
          if (hlsInfo.process && !hlsInfo.process.killed) {
            hlsInfo.process.kill('SIGKILL');
          }
        }, 3000);
      }
      
      hlsInfo.isRunning = false;
      this.hlsStreams.delete(streamId);
    }
  }

  /**
   * 获取 HLS 文件路径
   */
  getHLSPath(streamId, filename) {
    const hlsInfo = this.hlsStreams.get(streamId);
    if (!hlsInfo) {
      return null;
    }

    const filePath = path.join(hlsInfo.outputDir, filename);
    if (fs.existsSync(filePath)) {
      return filePath;
    }

    return null;
  }

  /**
   * 获取 HLS 状态
   */
  getHLSStatus(streamId) {
    const hlsInfo = this.hlsStreams.get(streamId);
    if (!hlsInfo) {
      return null;
    }

    return {
      stream_id: streamId,
      is_running: hlsInfo.isRunning,
      playlist_exists: fs.existsSync(hlsInfo.playlistFile),
      playlist_path: hlsInfo.playlistFile,
      start_time: hlsInfo.startTime.toISOString()
    };
  }
}

