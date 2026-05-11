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

    // ✅ 关键：把 <img> 插入到 video 的父容器，直接显示，隐藏 video
    const container = this.videoElement.parentElement;
    if (container) {
      // 保存 video 原来的 display 样式
      (this.videoElement as any).__originalDisplay = this.videoElement.style.display;
      this.videoElement.style.display = 'none';

      // 设置 img 为容器大小
      this.mjpegImg.style.position = 'absolute';
      this.mjpegImg.style.inset = '0';
      this.mjpegImg.style.width = '100%';
      this.mjpegImg.style.height = '100%';
      this.mjpegImg.style.objectFit = 'contain';
      this.mjpegImg.style.opacity = '1';
      this.mjpegImg.style.left = '0';
      this.mjpegImg.style.top = '0';
      container.appendChild(this.mjpegImg);
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
      // onFrame 回调（用于 AI 截图等）
      if (this.onFrame) {
        const img = this.mjpegImg;
        if (this.canvas.width !== img.naturalWidth || this.canvas.height !== img.naturalHeight) {
          this.canvas.width = img.naturalWidth;
          this.canvas.height = img.naturalHeight;
        }
        this.ctx.drawImage(img, 0, 0);
        this.canvas.toBlob((blob) => {
          if (blob) {
            const reader = new FileReader();
            reader.onload = () => this.onFrame?.(reader.result as string);
            reader.readAsDataURL(blob);
          }
        }, 'image/jpeg', 0.9);
      }
    };
    this.mjpegImg.onload = this.boundOnLoad;
  }

  stop(): void {
    if (!this.isPlaying) return;
    this.isPlaying = false;

    console.log('MJPEGPlayer: 停止播放');

    // 解绑
    if (this.boundOnLoad) {
      this.mjpegImg.onload = null;
      this.boundOnLoad = null;
    }

    // 停止流
    this.mjpegImg.src = '';

    // 把 img 从容器移除，恢复 video 显示
    if (this.mjpegImg.parentElement) {
      this.mjpegImg.parentElement.removeChild(this.mjpegImg);
    }
    // 恢复 video
    const orig = (this.videoElement as any).__originalDisplay;
    this.videoElement.style.display = orig ?? '';
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
