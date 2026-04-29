/**
 * MJPEG 流媒体播放器
 * 使用 <img> 标签直连后端 MJPEG 流（不受 CORS 限制）
 * 通过 canvas 将帧渲染到 video 元素
 */

export interface MJPEGPlayerOptions {
  videoElement: HTMLVideoElement;
  streamId: string;
  fps?: number;
  quality?: number;
  targetWidth?: number;
  onError?: (error: Error) => void;
  onFrame?: (frameData: string) => void;
}

export class MJPEGPlayer {
  private videoElement: HTMLVideoElement;
  private streamId: string;
  private fps: number;
  private quality: number;
  private targetWidth: number;
  private onError?: (error: Error) => void;
  private onFrame?: (frameData: string) => void;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isPlaying = false;
  private captureTrack: CanvasCaptureMediaStreamTrack | null = null;
  private frameCount = 0;
  private lastFrameTime = 0;
  private renderIntervalId: number | null = null;

  // <img> 标签直连 MJPEG 流
  private mjpegImg: HTMLImageElement;

  constructor(options: MJPEGPlayerOptions) {
    this.videoElement = options.videoElement;
    this.streamId = options.streamId;
    this.fps = options.fps || 20;
    this.quality = options.quality || 95;
    this.targetWidth = options.targetWidth ?? 1280;
    this.onError = options.onError;
    this.onFrame = options.onFrame;

    // 创建 canvas
    this.canvas = document.createElement('canvas');
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.style.position = 'fixed';
    this.canvas.style.left = '-99999px';
    this.canvas.style.top = '-99999px';
    this.canvas.style.width = '1px';
    this.canvas.style.height = '1px';
    this.canvas.style.opacity = '0';
    this.canvas.style.pointerEvents = 'none';
    document.body.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
    });
    if (!ctx) {
      throw new Error('无法创建 canvas context');
    }
    this.ctx = ctx;

    // 创建 <img> 标签用于接收 MJPEG 流
    // crossOrigin="anonymous" 使浏览器发送 CORS 请求，避免 canvas 被污染
    this.mjpegImg = document.createElement('img');
    this.mjpegImg.crossOrigin = 'anonymous';
    this.mjpegImg.setAttribute('aria-hidden', 'true');
    this.mjpegImg.style.position = 'fixed';
    this.mjpegImg.style.left = '-99999px';
    this.mjpegImg.style.top = '-99999px';
    this.mjpegImg.style.width = '1px';
    this.mjpegImg.style.height = '1px';
    this.mjpegImg.style.opacity = '0';
    this.mjpegImg.style.pointerEvents = 'none';
    document.body.appendChild(this.mjpegImg);
  }

  /**
   * 构建 MJPEG 直连 URL（直连后端 8000 端口，<img> 不受 CORS 限制）
   */
  private buildDirectMjpegUrl(): string {
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    const params = new URLSearchParams();
    params.set('quality', this.quality.toString());
    params.set('width', this.targetWidth.toString());
    return `${protocol}//${host}:8000/api/streams/${this.streamId}/mjpeg/?${params.toString()}`;
  }

  /**
   * 开始播放 MJPEG 流
   */
  async start(): Promise<void> {
    if (this.isPlaying) {
      console.warn('MJPEGPlayer: 已经在播放中');
      return;
    }

    this.isPlaying = true;
    this.frameCount = 0;
    this.lastFrameTime = Date.now();

    const mjpegUrl = this.buildDirectMjpegUrl();
    console.log(`MJPEGPlayer: 开始播放 MJPEG 流 (直连): ${mjpegUrl}`);

    // 等待第一帧加载
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('MJPEG 流连接超时（10秒）'));
      }, 10000);

      this.mjpegImg.onload = () => {
        clearTimeout(timeoutId);
        // 初始化 canvas 尺寸
        if (this.mjpegImg.naturalWidth > 0 && this.mjpegImg.naturalHeight > 0) {
          this.canvas.width = this.mjpegImg.naturalWidth;
          this.canvas.height = this.mjpegImg.naturalHeight;
        }
        resolve();
      };

      this.mjpegImg.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error('MJPEG 流连接失败'));
      };

      // 设置 src 触发加载
      this.mjpegImg.src = mjpegUrl;
    }).catch((error) => {
      this.stop();
      if (this.onError) {
        this.onError(error instanceof Error ? error : new Error('播放失败'));
      }
      throw error;
    });

    // 绘制第一帧到 canvas
    this.renderFrame();

    // 创建 captureStream 并赋值给 video
    const stream = this.canvas.captureStream(this.fps);
    const [track] = stream.getVideoTracks();
    this.captureTrack = (track as CanvasCaptureMediaStreamTrack) || null;
    this.videoElement.srcObject = stream;
    this.captureTrack?.requestFrame?.();

    try {
      await this.videoElement.play();
    } catch (playError) {
      console.warn('MJPEGPlayer: video.play() 被中断（正常，继续）');
    }

    // 定时从 img 绘制到 canvas
    const frameInterval = 1000 / this.fps;
    this.renderIntervalId = window.setInterval(() => {
      this.renderFrame();
    }, frameInterval);
  }

  /**
   * 将当前 img 帧渲染到 canvas
   */
  private renderFrame(): void {
    if (!this.isPlaying) return;

    const img = this.mjpegImg;
    if (!img.naturalWidth || !img.naturalHeight) return;

    // 更新 canvas 尺寸
    if (this.canvas.width !== img.naturalWidth || this.canvas.height !== img.naturalHeight) {
      this.canvas.width = img.naturalWidth;
      this.canvas.height = img.naturalHeight;
    }

    // 绘制帧
    this.ctx.drawImage(img, 0, 0);
    this.captureTrack?.requestFrame?.();

    // 统计 FPS
    this.frameCount++;
    const now = Date.now();
    if (now - this.lastFrameTime >= 1000) {
      const actualFps = this.frameCount / ((now - this.lastFrameTime) / 1000);
      console.log(`MJPEGPlayer: 实际FPS: ${actualFps.toFixed(2)}, 已播放: ${this.frameCount} 帧`);
      this.frameCount = 0;
      this.lastFrameTime = now;
    }

    // 回调
    if (this.onFrame) {
      this.canvas.toBlob((blob) => {
        if (blob) {
          const reader = new FileReader();
          reader.onload = () => {
            this.onFrame?.(reader.result as string);
          };
          reader.readAsDataURL(blob);
        }
      }, 'image/jpeg', 0.9);
    }
  }

  /**
   * 停止播放
   */
  stop(): void {
    if (!this.isPlaying) return;

    console.log('MJPEGPlayer: 停止播放');
    this.isPlaying = false;

    if (this.renderIntervalId !== null) {
      clearInterval(this.renderIntervalId);
      this.renderIntervalId = null;
    }

    // 停止 img 的 MJPEG 流
    this.mjpegImg.src = '';

    // 停止 video 的流
    if (this.videoElement.srcObject) {
      const stream = this.videoElement.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      this.videoElement.srcObject = null;
    }
    this.captureTrack = null;
  }

  /**
   * 销毁播放器
   */
  destroy(): void {
    this.stop();
    if (this.canvas.parentNode) {
      this.canvas.parentNode.removeChild(this.canvas);
    }
    if (this.mjpegImg.parentNode) {
      this.mjpegImg.parentNode.removeChild(this.mjpegImg);
    }
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}
