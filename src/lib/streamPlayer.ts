/**
 * 流媒体播放器工具
 * 用于播放虚拟流媒体摄像头
 */

import { getStreamFrame } from '@/api/streamApi';

export interface StreamPlayerOptions {
  videoElement: HTMLVideoElement;
  displayCanvas?: HTMLCanvasElement | null;
  streamId: string;
  fps?: number; // 期望的帧率，默认25
  quality?: number; // JPEG 质量 (1-100)，默认95
  targetWidth?: number; // 目标宽度（0 表示原始宽度）
  onError?: (error: Error) => void;
  onFrame?: (frameData: string) => void;
  onStreamTaken?: () => void; // 当流被其他窗口占用时的回调
  windowId?: string; // 窗口ID，用于跨窗口通信
  /** 后端共享流允许多窗口同时观看；物理独占场景才设为 true */
  exclusive?: boolean;
}

export class StreamPlayer {
  private videoElement: HTMLVideoElement;
  private displayCanvas: HTMLCanvasElement | null;
  private streamId: string;
  private fps: number;
  private quality: number;
  private targetWidth: number;
  private intervalId: number | null = null;
  private isPlaying = false;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private onError?: (error: Error) => void;
  private onFrame?: (frameData: string) => void;
  private onStreamTaken?: () => void;
  private lastFrameTime = 0;
  private frameCount = 0;
  private broadcastChannel: BroadcastChannel | null = null;
  private windowId: string;
  private exclusive: boolean;
  private consecutiveErrorCount = 0;
  private isFetchingFrame = false;
  private captureTrack: CanvasCaptureMediaStreamTrack | null = null;
  private boundFullscreenChange: (() => void) | null = null;
  private ownsCanvas = false;

  private restartFetchTimer(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (!this.isPlaying) return;

    this.intervalId = window.setInterval(() => {
      this.fetchAndRenderFrame();
    }, 1000 / this.fps);
  }

  private isTransientFrameError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return (
      message.includes('404') ||
      message.includes('503') ||
      message.includes('Failed to fetch') ||
      message.includes('NetworkError') ||
      message.includes('流媒体连接中，暂无可用帧') ||
      message.includes('流媒体未运行') ||
      message.includes('Service Unavailable')
    );
  }

  constructor(options: StreamPlayerOptions) {
    this.videoElement = options.videoElement;
    this.displayCanvas = options.displayCanvas ?? null;
    this.streamId = options.streamId;
    this.fps = options.fps || 20; // 默认20帧/秒
    this.quality = options.quality || 100; // 默认100质量（最高质量）
    this.targetWidth = options.targetWidth ?? 1920; // 默认1920宽度
    this.onError = options.onError;
    this.onFrame = options.onFrame;
    this.onStreamTaken = options.onStreamTaken;
    this.windowId = options.windowId || `window_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.exclusive = options.exclusive ?? true;

    // 创建canvas用于渲染图片到video
    this.canvas = this.displayCanvas ?? document.createElement('canvas');
    this.ownsCanvas = !this.displayCanvas;
    if (this.ownsCanvas && this.canvas) {
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.style.position = 'fixed';
      this.canvas.style.left = '-99999px';
      this.canvas.style.top = '-99999px';
      this.canvas.style.width = '1px';
      this.canvas.style.height = '1px';
      this.canvas.style.opacity = '0';
      this.canvas.style.pointerEvents = 'none';
      document.body.appendChild(this.canvas);
    }
    this.ctx = this.canvas.getContext('2d', {
      alpha: false, // 禁用透明度以提高性能
      desynchronized: true, // 提高性能
    });

    // Jetson Chromium 在全屏时有概率暂停 canvas.captureStream 的消费端，
    // 这里在全屏切换后显式恢复 video 播放状态。
    this.boundFullscreenChange = () => {
      if (this.isPlaying) {
        window.setTimeout(() => {
          this.videoElement.play().catch((error) => {
            console.warn('StreamPlayer: 全屏切换后恢复播放失败', error);
          });
        }, 0);
      }
    };
    document.addEventListener('fullscreenchange', this.boundFullscreenChange);

    // 初始化跨窗口通信
    this.initBroadcastChannel();
  }

  /**
   * 初始化跨窗口通信
   */
  private initBroadcastChannel(): void {
    if (!this.exclusive) return;
    try {
      // 为每个流创建一个专属的广播频道
      this.broadcastChannel = new BroadcastChannel(`stream_${this.streamId}`);
      
      this.broadcastChannel.onmessage = (event) => {
        const { type, windowId } = event.data;
        
        // 如果其他窗口要求使用这个流，且不是来自当前窗口的消息
        if (type === 'REQUEST_STREAM' && windowId !== this.windowId) {
          console.log(`StreamPlayer: 收到其他窗口 ${windowId} 请求使用流 ${this.streamId}，当前窗口将释放`);
          
          // 通知上层应用流被占用
          if (this.onStreamTaken && this.isPlaying) {
            this.onStreamTaken();
          }
          
          // 停止当前播放
          this.stop();
        }
      };
    } catch (error) {
      console.warn('StreamPlayer: BroadcastChannel 不可用，跨窗口通信功能将被禁用', error);
    }
  }

  /**
   * 广播占用流的消息
   */
  private broadcastStreamRequest(): void {
    if (this.exclusive && this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({
          type: 'REQUEST_STREAM',
          windowId: this.windowId,
          streamId: this.streamId,
          timestamp: Date.now()
        });
        console.log(`StreamPlayer: 广播占用流 ${this.streamId} 的请求 (窗口 ${this.windowId})`);
      } catch (error) {
        console.warn('StreamPlayer: 广播消息失败', error);
      }
    }
  }

  /**
   * 开始播放流媒体
   */
  async start(): Promise<void> {
    if (this.isPlaying) {
      console.warn('StreamPlayer: 已经在播放中');
      return;
    }

    // 广播占用流的消息，通知其他窗口释放
    this.broadcastStreamRequest();

    this.isPlaying = true;
    this.lastFrameTime = Date.now();
    this.frameCount = 0;
    this.consecutiveErrorCount = 0;
    this.isFetchingFrame = false;

    console.log(`StreamPlayer: 开始播放流媒体 ${this.streamId}, FPS: ${this.fps} (窗口 ${this.windowId})`);

    // 先获取一帧来初始化canvas尺寸（带重试机制）
    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 1000; // 1秒
    
    while (retryCount < maxRetries) {
      try {
        const firstFrame = await getStreamFrame(this.streamId, this.quality, this.targetWidth);
        await this.renderFrame(firstFrame.frame);

        // 创建流并赋值给video元素
        if (this.canvas) {
          const stream = this.canvas.captureStream(this.fps);
          const [track] = stream.getVideoTracks();
          this.captureTrack = (track as CanvasCaptureMediaStreamTrack) || null;
          this.videoElement.srcObject = stream;
          this.captureTrack?.requestFrame?.();
          await this.videoElement.play();
        }
        break; // 成功，退出重试循环
      } catch (error) {
        retryCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        const is503Error = errorMessage.includes('503') || errorMessage.includes('Service Unavailable') || errorMessage.includes('流媒体未运行');
        
        if (retryCount < maxRetries && is503Error) {
          // 503错误（流媒体服务未启动），等待后重试
          console.log(`StreamPlayer: 流媒体服务未启动，等待${retryDelay}ms后重试 (${retryCount}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        } else {
          // 其他错误或重试次数用完
          console.error('StreamPlayer: 初始化失败:', error);
          this.stop();
          if (this.onError) {
            this.onError(error instanceof Error ? error : new Error('初始化失败'));
          }
          throw (error instanceof Error ? error : new Error('初始化失败'));
        }
      }
    }

    this.restartFetchTimer();
  }

  /**
   * 停止播放
   */
  stop(): void {
    if (!this.isPlaying) {
      return;
    }

    console.log(`StreamPlayer: 停止播放流媒体 ${this.streamId} (窗口 ${this.windowId})`);
    
    this.isPlaying = false;
    
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // 停止video的流
    if (this.videoElement.srcObject) {
      const stream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
    this.captureTrack = null;

    // 清理canvas
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    console.log(`StreamPlayer: 总共播放了 ${this.frameCount} 帧`);
  }

  /**
   * 销毁播放器，清理所有资源
   */
  destroy(): void {
    this.stop();

    if (this.boundFullscreenChange) {
      document.removeEventListener('fullscreenchange', this.boundFullscreenChange);
      this.boundFullscreenChange = null;
    }
    
    // 关闭BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
        console.log(`StreamPlayer: BroadcastChannel 已关闭 (窗口 ${this.windowId})`);
      } catch (error) {
        console.warn('StreamPlayer: 关闭 BroadcastChannel 失败', error);
      }
      this.broadcastChannel = null;
    }

    if (this.ownsCanvas && this.canvas?.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
  }

  updateSettings(options: Pick<StreamPlayerOptions, 'fps' | 'quality' | 'targetWidth'>): void {
    const nextFps = options.fps ?? this.fps;
    const nextQuality = options.quality ?? this.quality;
    const nextTargetWidth = options.targetWidth ?? this.targetWidth;
    const changed =
      nextFps !== this.fps ||
      nextQuality !== this.quality ||
      nextTargetWidth !== this.targetWidth;

    this.fps = nextFps;
    this.quality = nextQuality;
    this.targetWidth = nextTargetWidth;

    if (!this.isPlaying || !changed) return;

    this.frameCount = 0;
    this.lastFrameTime = Date.now();
    this.consecutiveErrorCount = 0;
    this.restartFetchTimer();
    void this.fetchAndRenderFrame();
    console.log(
      `StreamPlayer: 更新显示参数 FPS=${this.fps}, quality=${this.quality}, width=${this.targetWidth}`
    );
  }

  /**
   * 获取并渲染新帧（带重试机制）
   */
  private async fetchAndRenderFrame(): Promise<void> {
    if (!this.isPlaying || this.isFetchingFrame) {
      return;
    }
    this.isFetchingFrame = true;

    let retryCount = 0;
    const maxRetries = 2; // 获取帧时重试2次即可
    const retryDelay = 500; // 0.5秒

    try {
      while (retryCount < maxRetries) {
        try {
          const frameData = await getStreamFrame(this.streamId, this.quality, this.targetWidth);
          await this.renderFrame(frameData.frame);
          this.consecutiveErrorCount = 0;
          
          this.frameCount++;
          
          if (this.onFrame) {
            this.onFrame(frameData.frame);
          }

          // 计算实际FPS
          const now = Date.now();
          if (now - this.lastFrameTime > 1000) {
            const actualFps = (this.frameCount / (now - this.lastFrameTime)) * 1000;
            console.log(`StreamPlayer: 实际FPS: ${actualFps.toFixed(2)}, 已播放: ${this.frameCount} 帧`);
            this.lastFrameTime = now;
            this.frameCount = 0;
          }
          break; // 成功，退出重试循环
        } catch (error) {
          retryCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          const is503Error = errorMessage.includes('503') || errorMessage.includes('Service Unavailable') || errorMessage.includes('流媒体未运行');
          
          if (retryCount < maxRetries && is503Error) {
            // 503错误，等待后重试
            console.warn(`StreamPlayer: 获取帧失败（503），等待${retryDelay}ms后重试 (${retryCount}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          } else {
            // 其他错误或重试次数用完
            const isTransient = this.isTransientFrameError(error);
            this.consecutiveErrorCount += 1;

            if (isTransient) {
              if (this.consecutiveErrorCount === 1 || this.consecutiveErrorCount % 10 === 0) {
                console.warn(`StreamPlayer: 暂时无法获取新帧，继续保留当前画面 (${this.consecutiveErrorCount})`, error);
              }
            } else {
              console.error('StreamPlayer: 获取帧失败:', error);
            }

            if (!isTransient && this.consecutiveErrorCount >= 20) {
              const finalError = error instanceof Error
                ? error
                : new Error('流媒体连续取帧失败');
              console.error('StreamPlayer: 连续取帧失败过多，通知上层');
              this.onError?.(finalError);
            }
            break;
          }
        }
      }
    } finally {
      this.isFetchingFrame = false;
    }
  }

  /**
   * 渲染Base64图片到canvas（后端已缩放，前端自适应填充）
   */
  private async renderFrame(base64Data: string): Promise<void> {
    if (!this.canvas || !this.ctx) {
      return;
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      
      img.onload = () => {
        if (!this.canvas || !this.ctx) {
          reject(new Error('Canvas 未初始化'));
          return;
        }

        if (this.canvas.width !== img.width || this.canvas.height !== img.height) {
          this.canvas.width = img.width;
          this.canvas.height = img.height;
          
          // 启用高质量图像平滑
          this.ctx.imageSmoothingEnabled = true;
          this.ctx.imageSmoothingQuality = 'high';
          
          console.log(`StreamPlayer: Canvas分辨率 ${img.width}x${img.height}, 质量: ${this.quality}%, FPS: ${this.fps}`);
        }

        // 清除之前的帧
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 智能绘制：如果尺寸匹配就直接绘制，否则高质量缩放
        if (img.width === this.canvas.width && img.height === this.canvas.height) {
          // 尺寸完全匹配，1:1直接绘制（无损）
          this.ctx.drawImage(img, 0, 0);
        } else {
          // 尺寸不匹配，高质量缩放到canvas尺寸
          this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
        }

        // 某些 Chromium/Jetson 组合在全屏时不会稳定感知离屏 canvas 更新，
        // 显式 requestFrame 可以避免视频停在最后一帧。
        this.captureTrack?.requestFrame?.();

        if (this.isPlaying && this.videoElement.paused) {
          this.videoElement.play().catch((error) => {
            console.warn('StreamPlayer: 渲染后恢复播放失败', error);
          });
        }
        resolve();
      };

      img.onerror = (error) => {
        console.error('StreamPlayer: 图片加载失败', error);
        reject(new Error('图片加载失败'));
      };

      // 设置图片源（检查是否已包含data URL前缀）
      if (base64Data.startsWith('data:')) {
        img.src = base64Data;
      } else {
        // 回退：假设是纯 base64 数据，添加 JPEG 格式前缀
        img.src = `data:image/jpeg;base64,${base64Data}`;
      }
    });
  }

  /**
   * 检查是否正在播放
   */
  isActive(): boolean {
    return this.isPlaying;
  }

  /**
   * 获取流ID
   */
  getStreamId(): string {
    return this.streamId;
  }
}
