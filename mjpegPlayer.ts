/**
 * MJPEG 流媒体播放器
 * 用于播放真正的 MJPEG 流（multipart/x-mixed-replace）
 */

import { getMJPEGStreamUrl } from '@/api/streamApi';

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
  private abortController: AbortController | null = null;
  private frameCount = 0;
  private lastFrameTime = 0;
  private captureTrack: CanvasCaptureMediaStreamTrack | null = null;

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
    this.abortController = new AbortController();

    const mjpegUrl = getMJPEGStreamUrl(this.streamId, {
      quality: this.quality,
      width: this.targetWidth,
      fps: this.fps,
    });

    console.log(`MJPEGPlayer: 开始播放 MJPEG 流: ${mjpegUrl}`);

    try {
      const response = await fetch(mjpegUrl, {
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`MJPEG 流请求失败: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('multipart/x-mixed-replace')) {
        // 如果不是真正的 MJPEG 流，回退到 JPEG 模式
        console.warn('MJPEGPlayer: 服务器未返回 MJPEG 流，回退到 JPEG 模式');
        await this.startJPEGFallback();
        return;
      }

      // 解析 multipart 响应
      await this.parseMultipartStream(response);

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('MJPEGPlayer: 流已被中断');
        return;
      }
      
      console.error('MJPEGPlayer: 播放失败:', error);
      this.stop();
      if (this.onError) {
        this.onError(error instanceof Error ? error : new Error('播放失败'));
      }
    }
  }

  /**
   * 解析 multipart/x-mixed-replace 流
   */
  private async parseMultipartStream(response: Response): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('无法获取响应流');
    }

    const decoder = new TextDecoder();
    let buffer = new Uint8Array(0);
    let boundary = '';

    // 从 content-type 中提取 boundary
    const contentType = response.headers.get('content-type') || '';
    const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
    if (boundaryMatch) {
      boundary = boundaryMatch[1].trim();
      console.log(`MJPEGPlayer: 使用 boundary: ${boundary}`);
    } else {
      // 尝试从响应中检测 boundary
      console.warn('MJPEGPlayer: 未找到 boundary，尝试自动检测');
    }

    while (this.isPlaying) {
      try {
        const { done, value } = await reader.read();
        
        if (done) {
          console.log('MJPEGPlayer: 流已结束');
          break;
        }

        // 合并到 buffer
        const newBuffer = new Uint8Array(buffer.length + value.length);
        newBuffer.set(buffer);
        newBuffer.set(value, buffer.length);
        buffer = newBuffer;

        // 如果还没有检测到 boundary，尝试从数据中检测
        if (!boundary) {
          const text = decoder.decode(buffer.slice(0, Math.min(1024, buffer.length)));
          const boundaryLine = text.split('\n').find(line => line.startsWith('--'));
          if (boundaryLine) {
            boundary = boundaryLine.substring(2);
            console.log(`MJPEGPlayer: 检测到 boundary: ${boundary}`);
          }
        }

        // 查找并处理帧
        if (boundary) {
          const boundaryBytes = new TextEncoder().encode(`--${boundary}`);
          let startIndex = 0;

          while (true) {
            const boundaryIndex = this.indexOf(buffer, boundaryBytes, startIndex);
            if (boundaryIndex === -1) break;

            if (startIndex > 0) {
              // 提取帧数据（跳过 boundary）
              const frameData = buffer.slice(startIndex, boundaryIndex);
              await this.processFrame(frameData);
            }

            startIndex = boundaryIndex + boundaryBytes.length;
          }

          // 保留未处理的数据
          if (startIndex > 0) {
            buffer = buffer.slice(startIndex);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          break;
        }
        throw error;
      }
    }
  }

  /**
   * 在 buffer 中查找子数组
   */
  private indexOf(buffer: Uint8Array, search: Uint8Array, startIndex: number = 0): number {
    for (let i = startIndex; i <= buffer.length - search.length; i++) {
      let found = true;
      for (let j = 0; j < search.length; j++) {
        if (buffer[i + j] !== search[j]) {
          found = false;
          break;
        }
      }
      if (found) return i;
    }
    return -1;
  }

  /**
   * 处理一帧数据
   */
  private async processFrame(frameData: Uint8Array): Promise<void> {
    try {
      // 查找 JPEG 数据的开始和结束
      const jpegStart = this.indexOf(frameData, new Uint8Array([0xFF, 0xD8]), 0);
      const jpegEnd = this.indexOf(frameData, new Uint8Array([0xFF, 0xD9]), 0);

      if (jpegStart === -1 || jpegEnd === -1) {
        return;
      }

      const jpegData = frameData.slice(jpegStart, jpegEnd + 2);
      const blob = new Blob([jpegData], { type: 'image/jpeg' });
      const imageUrl = URL.createObjectURL(blob);

      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          // 更新 canvas 尺寸
          if (this.canvas.width !== img.width || this.canvas.height !== img.height) {
            this.canvas.width = img.width;
            this.canvas.height = img.height;
          }

          // 绘制帧
          this.ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(imageUrl);

          // 更新视频元素
          if (!this.captureTrack) {
            const stream = this.canvas.captureStream(this.fps);
            const [track] = stream.getVideoTracks();
            this.captureTrack = (track as CanvasCaptureMediaStreamTrack) || null;
            this.videoElement.srcObject = stream;
            this.videoElement.play().catch(console.warn);
          } else {
            this.captureTrack.requestFrame?.();
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

          // 计算 FPS
          this.frameCount++;
          const now = Date.now();
          if (now - this.lastFrameTime >= 1000) {
            const actualFps = this.frameCount / ((now - this.lastFrameTime) / 1000);
            console.log(`MJPEGPlayer: 实际FPS: ${actualFps.toFixed(2)}, 已播放: ${this.frameCount} 帧`);
            this.frameCount = 0;
            this.lastFrameTime = now;
          }

          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(imageUrl);
          reject(new Error('图片加载失败'));
        };
        img.src = imageUrl;
      });
    } catch (error) {
      console.warn('MJPEGPlayer: 帧处理失败:', error);
    }
  }

  /**
   * JPEG 回退模式（逐帧获取）
   */
  private async startJPEGFallback(): Promise<void> {
    console.log('MJPEGPlayer: 使用 JPEG 回退模式');
    
    const frameInterval = 1000 / this.fps;
    
    const fetchFrame = async () => {
      if (!this.isPlaying) return;

      try {
        const url = getMJPEGStreamUrl(this.streamId, {
          quality: this.quality,
          width: this.targetWidth,
        });
        
        // 移除 fps 参数，因为 JPEG 模式不支持
        const urlWithoutFps = url.replace(/[?&]fps=\d+/, '');
        
        const response = await fetch(urlWithoutFps, {
          signal: this.abortController?.signal,
        });

        if (response.ok) {
          const blob = await response.blob();
          const imageUrl = URL.createObjectURL(blob);
          
          const img = new Image();
          await new Promise<void>((resolve, reject) => {
            img.onload = () => {
              if (this.canvas.width !== img.width || this.canvas.height !== img.height) {
                this.canvas.width = img.width;
                this.canvas.height = img.height;
              }
              this.ctx.drawImage(img, 0, 0);
              URL.revokeObjectURL(imageUrl);

              if (!this.captureTrack) {
                const stream = this.canvas.captureStream(this.fps);
                const [track] = stream.getVideoTracks();
                this.captureTrack = (track as CanvasCaptureMediaStreamTrack) || null;
                this.videoElement.srcObject = stream;
                this.videoElement.play().catch(console.warn);
              } else {
                this.captureTrack.requestFrame?.();
              }

              this.frameCount++;
              resolve();
            };
            img.onerror = () => {
              URL.revokeObjectURL(imageUrl);
              reject(new Error('图片加载失败'));
            };
            img.src = imageUrl;
          });
        }
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.warn('MJPEGPlayer: 帧获取失败:', error);
        }
      }

      if (this.isPlaying) {
        setTimeout(fetchFrame, frameInterval);
      }
    };

    fetchFrame();
  }

  /**
   * 停止播放
   */
  stop(): void {
    if (!this.isPlaying) return;

    console.log('MJPEGPlayer: 停止播放');
    this.isPlaying = false;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

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
  }

  /**
   * 获取是否正在播放
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }
}
