/**
 * 流媒体管理器
 * 使用 FFmpeg 管理多个流媒体源
 */
import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class StreamManager extends EventEmitter {
  constructor() {
    super();
    this.streams = new Map(); // streamId -> StreamInfo
  }

  /**
   * 启动流媒体
   * @param {string} streamId - 流ID
   * @param {string} url - 流媒体地址
   * @param {string} streamType - 流类型 (rtsp, http, file)
   * @returns {Promise<boolean>}
   */
  async startStream(streamId, url, streamType = 'rtsp') {
    // 如果已存在，先停止
    if (this.streams.has(streamId)) {
      this.stopStream(streamId);
    }

    try {
      console.log(`[StreamManager] 启动流媒体: ${streamId}, URL: ${url}`);

      // 创建流信息
      const streamInfo = {
        streamId,
        url,
        streamType,
        ffmpegProcess: null,
        isRunning: false,
        errorMessage: '',
        startTime: null
      };

      // 启动 FFmpeg 进程读取流
      const ffmpegArgs = this.buildFFmpegArgs(url, streamType);
      const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe'] // stdin忽略，stdout/stderr捕获
      });

      streamInfo.ffmpegProcess = ffmpegProcess;
      streamInfo.isRunning = true;
      streamInfo.startTime = new Date();

      // 处理 FFmpeg 输出
      ffmpegProcess.stdout.on('data', (data) => {
        // FFmpeg 通常输出到 stderr，但我们也监听 stdout
        console.log(`[FFmpeg ${streamId}] stdout:`, data.toString().slice(0, 100));
      });

      ffmpegProcess.stderr.on('data', (data) => {
        const output = data.toString();
        // 检查错误
        if (output.includes('error') || output.includes('Error')) {
          console.error(`[FFmpeg ${streamId}] 错误:`, output);
          streamInfo.errorMessage = output.slice(0, 200);
        }
      });

      // 处理进程退出
      ffmpegProcess.on('exit', (code) => {
        console.log(`[FFmpeg ${streamId}] 进程退出，代码: ${code}`);
        streamInfo.isRunning = false;
        if (code !== 0 && code !== null) {
          this.emit('streamError', streamId, `FFmpeg进程退出，代码: ${code}`);
        }
      });

      // 处理错误
      ffmpegProcess.on('error', (error) => {
        console.error(`[FFmpeg ${streamId}] 进程错误:`, error);
        streamInfo.isRunning = false;
        streamInfo.errorMessage = error.message;
        this.emit('streamError', streamId, error.message);
      });

      this.streams.set(streamId, streamInfo);
      console.log(`[StreamManager] 流媒体 ${streamId} 启动成功`);
      return true;

    } catch (error) {
      console.error(`[StreamManager] 启动流媒体失败:`, error);
      return false;
    }
  }

  /**
   * 构建 FFmpeg 参数（用于读取流）
   */
  buildFFmpegArgs(url, streamType) {
    const args = [
      '-i', url,  // 输入源
      '-f', 'rawvideo',  // 原始视频格式
      '-pix_fmt', 'rgb24',  // RGB24 像素格式（便于处理）
      '-'  // 输出到 stdout
    ];

    // RTSP 流特殊处理
    if (streamType === 'rtsp') {
      args.unshift(
        '-rtsp_transport', 'tcp',  // 使用 TCP（更稳定）
        '-timeout', '5000000'  // 5秒超时
      );
    }

    // 本地文件循环播放
    if (streamType === 'file') {
      args.unshift('-stream_loop', '-1');
    }

    return args;
  }

  /**
   * 停止流媒体
   */
  stopStream(streamId) {
    const streamInfo = this.streams.get(streamId);
    if (streamInfo) {
      console.log(`[StreamManager] 停止流媒体: ${streamId}`);
      
      if (streamInfo.ffmpegProcess) {
        streamInfo.ffmpegProcess.kill('SIGTERM');
        // 如果 3 秒后还没退出，强制杀死
        setTimeout(() => {
          if (streamInfo.ffmpegProcess && !streamInfo.ffmpegProcess.killed) {
            streamInfo.ffmpegProcess.kill('SIGKILL');
          }
        }, 3000);
      }
      
      streamInfo.isRunning = false;
      this.streams.delete(streamId);
    }
  }

  /**
   * 停止所有流
   */
  stopAll() {
    console.log('[StreamManager] 停止所有流媒体');
    for (const streamId of this.streams.keys()) {
      this.stopStream(streamId);
    }
  }

  /**
   * 获取流状态
   */
  getStreamStatus(streamId) {
    const streamInfo = this.streams.get(streamId);
    if (!streamInfo) {
      return null;
    }

    return {
      stream_id: streamId,
      is_running: streamInfo.isRunning,
      is_connected: streamInfo.isRunning && !streamInfo.errorMessage,
      error_message: streamInfo.errorMessage,
      start_time: streamInfo.startTime?.toISOString(),
      url: streamInfo.url
    };
  }

  /**
   * 获取流信息
   */
  getStream(streamId) {
    return this.streams.get(streamId);
  }

  /**
   * 检查流是否存在
   */
  hasStream(streamId) {
    return this.streams.has(streamId);
  }
}

