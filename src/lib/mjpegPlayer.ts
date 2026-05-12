/**
 * MJPEG 流媒体播放器 — 真正直连版
 * 直接把 <img> 标签插入到 video 的父容器里显示，
 * 跳过 canvas + captureStream + video 的中转，延迟最低。
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

  private isPlaying = false;
  private frameCount = 0;
  private lastFrameTime = 0;

  // <img> 标签直接显示 MJPEG 流
  private mjpegImg: HTMLImageElement;
  private boundOnLoad: (() => void) | null = null;
  private boundOnError: (() => void) | null = null;

  // 用于截图/回调的隐藏 canvas
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // 重连机制
  private reconnectAttempts = 0;
  private maxReconnects = 3;
  private reconnectDelay = 1000; // 重连间隔 ms
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: MJPEGPlayerOptions) {
    this.videoElement = options.videoElement;
    this.streamId = options.streamId;
    this.fps = options.fps || 25;
    this.quality = options.quality || 95;
    this.targetWidth = options.targetWidth ?? 0;
    this.onError = options.onError;
    this.onFrame = options.onFrame;

    // 创建隐藏的 canvas（仅用于 onFrame 截图回调）
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'none';
    document.body.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('无法创建 canvas context');
    this.ctx = ctx;

    // 创建 <img> 标签
    this.mjpegImg = document.createElement('img');
    this.mjpegImg.crossOrigin = 'anonymous';
    this.mjpegImg.alt = 'MJPEG 实时流';
    // 默认放在 body 里隐藏，start 时再移到容器
    this.mjpegImg.style.position = 'fixed';
    this.mjpegImg.style.left = '-99999px';
    this.mjpegImg.style.opacity = '0';
    document.body.appendChild(this.mjpegImg);
  }

  private _handleStreamError(): void {
    if (!this.isPlaying) return;

    this.reconnectAttempts++;
    console.warn(
      `MJPEGPlayer: 流连接断开，尝试重连 (${this.reconnectAttempts}/${this.maxReconnects})`
    );

    if (this.reconnectAttempts <= this.maxReconnects) {
      // 重置 img.src 触发重新连接（MJPEG 的 multipart 流会重新握手）
      this.reconnectTimer = setTimeout(() => {
        if (!this.isPlaying) return;
        const url = this.buildDirectMjpegUrl();
        console.log(`MJPEGPlayer: 重连中... ${url}`);
        this.mjpegImg.src = url;
      }, this.reconnectDelay * this.reconnectAttempts);  // 递增延迟：1s, 2s, 3s
    } else {
      console.error(`MJPEGPlayer: 重连 ${this.maxReconnects} 次失败，停止播放`);
      this.stop();
      this.onError?.(new Error('MJPEG 流连接失败，已重试 3 次'));
    }
  }

  private buildDirectMjpegUrl(): string {
    const protocol = window.location.protocol;
    const host = window.location.hostname;
    const params = new URLSearchParams();
    params.set('quality', this.quality.toString());
    params.set('width', this.targetWidth.toString());
    params.set('fps', this.fps.toString());
    return `${protocol}//${host}:8000/api/streams/${this.streamId}/mjpeg/?${params.toString()}`;
  }

  async start(): Promise<void> {
    if (this.isPlaying) {
      console.warn('MJPEGPlayer: 已经在播放中');
      return;
    }

    this.isPlaying = true;
    this.frameCount = 0;
    this.lastFrameTime = Date.now();
    this.reconnectAttempts = 0;  // 重置重连计数

    const mjpegUrl = this.buildDirectMjpegUrl();
    console.log(`MJPEGPlayer: 开始播放 MJPEG 流 (真正直连): ${mjpegUrl}`);

    // 等待第一帧
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => reject(new Error('MJPEG 流连接超时（10秒）')), 10000);

      this.mjpegImg.onload = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      this.mjpegImg.onerror = () => {
        clearTimeout(timeoutId);
        reject(new Error('MJPEG 流连接失败'));
      };
      this.mjpegImg.src = mjpegUrl;
    }).catch((error) => {
      this.stop();
      if (this.onError) this.onError(error instanceof Error ? error : new Error('播放失败'));
      throw error;
    });

    // ✅ 关键：把 <img> 插入到 video 的父容器，直接显示
    const container = this.videoElement.parentElement;
    if (container) {
      // 不再隐藏 video—— AI 推理（useRealtimeDetectionLoop 等）会调用
      // drawImage(videoRef.current) 截图，video 必须可读。
      // <img> 用更高 z-index 盖在上面，浏览器只重绘 <img> 那一层，性能不受影响。
      this.mjpegImg.style.position = 'absolute';
      this.mjpegImg.style.inset = '0';
      this.mjpegImg.style.width = '100%';
      this.mjpegImg.style.height = '100%';
      this.mjpegImg.style.objectFit = 'contain';
      this.mjpegImg.style.opacity = '1';
      this.mjpegImg.style.left = '0';
      this.mjpegImg.style.top = '0';
      this.mjpegImg.style.zIndex = '5';
      this.mjpegImg.style.pointerEvents = 'none';
      container.appendChild(this.mjpegImg);

      // 关键：让 <video> 元素也持有同一份画面，供 AI 推理 drawImage(video) 使用
      // 用 captureStream 把 hidden canvas 喂到 video.srcObject
      // 这条链路比"显示链路"宽松：浏览器内部限速，落后几帧也不影响 AI 抓取
      try {
        const stream = (this.canvas as any).captureStream
          ? (this.canvas as any).captureStream(15)
          : null;
        if (stream) {
          (this.videoElement as any).__originalSrcObject = this.videoElement.srcObject;
          this.videoElement.srcObject = stream;
          // 立刻 play() 让 video.videoWidth 在 canvas 第一帧后就有值
          this.videoElement.play().catch(() => {/* autoplay 限制下静默 */});
        }
      } catch (e) {
        console.warn('MJPEGPlayer: captureStream 不可用，AI 推理可能拿不到帧', e);
      }
    }

    // 事件驱动：每次收到新帧立即回调
    this.boundOnLoad = () => {
      if (!this.isPlaying) return;
      this.frameCount++;
      const now = Date.now();
      if (now - this.lastFrameTime >= 1000) {
        console.log(`MJPEGPlayer: 实际FPS: ${this.frameCount}, 已渲染: ${this.frameCount} 帧`);
        this.frameCount = 0;
        this.lastFrameTime = now;
      }

      const img = this.mjpegImg;
      if (img.naturalWidth === 0) return;

      // 把当前帧画到 hidden canvas → captureStream 把它喂给 <video>
      // 让 useRealtimeDetectionLoop 的 drawImage(videoRef.current) 拿到画面
      if (this.canvas.width !== img.naturalWidth || this.canvas.height !== img.naturalHeight) {
        this.canvas.width = img.naturalWidth;
        this.canvas.height = img.naturalHeight;
      }
      this.ctx.drawImage(img, 0, 0);

      // 老的 onFrame 回调链路保留
      if (this.onFrame) {
        this.canvas.toBlob((blob) => {
          if (blob) {
            const reader = new FileReader();
            reader.onload = () => this.onFrame?.(reader.result as string);
            reader.readAsDataURL(blob);
          }
        }, 'image/jpeg', 0.9);
      }
    };
    this.boundOnError = () => this._handleStreamError();
    this.mjpegImg.onload = this.boundOnLoad;
    this.mjpegImg.onerror = this.boundOnError;
  }

  stop(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    console.log('MJPEGPlayer: 停止播放');

    // 清除重连定时器
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 解绑
    if (this.boundOnLoad) {
      this.mjpegImg.onload = null;
      this.boundOnLoad = null;
    }
    if (this.boundOnError) {
      this.mjpegImg.onerror = null;
      this.boundOnError = null;
    }

    // 停止流
    this.mjpegImg.src = '';

    // 把 img 从容器移除
    if (this.mjpegImg.parentElement) {
      this.mjpegImg.parentElement.removeChild(this.mjpegImg);
    }

    // 解绑 captureStream → video，让上层重新设置物理摄像头时不冲突
    try {
      const stream = this.videoElement.srcObject as MediaStream | null;
      if (stream && typeof stream.getTracks === 'function') {
        stream.getTracks().forEach((t) => t.stop());
      }
      this.videoElement.srcObject = (this.videoElement as any).__originalSrcObject ?? null;
    } catch {
      // 忽略
    }
  }

  destroy(): void {
    this.stop();
    if (this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    if (this.mjpegImg.parentNode) this.mjpegImg.parentNode.removeChild(this.mjpegImg);
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}
