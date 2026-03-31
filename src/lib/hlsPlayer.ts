/**
 * HLS流媒体播放器
 * 使用 hls.js 播放 HLS 流，提供与物理摄像头相同的画质
 */
import Hls from 'hls.js';

export interface HLSPlayerOptions {
  videoElement: HTMLVideoElement;
  hlsUrl: string;
  onError?: (error: Error) => void;
  onLoaded?: () => void;
  autoplay?: boolean;
}

export class HLSPlayer {
  private videoElement: HTMLVideoElement;
  private hlsUrl: string;
  private hls: Hls | null = null;
  private onError?: (error: Error) => void;
  private onLoaded?: () => void;
  private isPlaying = false;
  private isVodPlaylist = false;  // 标记是否为VOD类型的播放列表（本地文件）
  private boundVideoErrorHandler: (() => void) | null = null;
  private boundVideoEndedHandler: (() => void) | null = null;

  constructor(options: HLSPlayerOptions) {
    this.videoElement = options.videoElement;
    // 确保HLS URL是完整的URL
    if (options.hlsUrl.startsWith('/')) {
      // 相对路径，转换为完整URL
      this.hlsUrl = `${window.location.origin}${options.hlsUrl}`;
    } else {
      this.hlsUrl = options.hlsUrl;
    }
    this.onError = options.onError;
    this.onLoaded = options.onLoaded;
  }

  /**
   * 启动HLS播放
   */
  async start(): Promise<void> {
    if (this.isPlaying) {
      console.warn('HLSPlayer: 已经在播放中');
      return;
    }

    try {
      // 强制使用hls.js，避免Safari原生HLS播放器的路径解析问题
      // Safari的原生HLS会把playlist.m3u8的完整路径作为base URL，导致segment路径错误
      if (Hls.isSupported()) {
        // 使用 hls.js（包括Safari在内的所有浏览器都使用这个）
        console.log('HLSPlayer: 使用 hls.js 播放HLS流（避免Safari路径问题）');
        // 对于本地文件，假设是VOD类型（需要循环播放）
        // 可以通过URL判断：如果是本地文件路径，则认为是VOD类型
        const isLocalFile = !this.hlsUrl.includes('://') || this.hlsUrl.startsWith('file://');
        if (isLocalFile) {
          this.isVodPlaylist = true;
        }

        // 计算base URL（playlist.m3u8的目录）
        const hlsUrlObj = new URL(this.hlsUrl);
        const baseUrl = hlsUrlObj.origin + hlsUrlObj.pathname.substring(0, hlsUrlObj.pathname.lastIndexOf('/') + 1);
        console.log('HLSPlayer: HLS URL:', this.hlsUrl);
        console.log('HLSPlayer: Base URL:', baseUrl);

        // 用于跟踪播放列表类型和首次加载
        let isFirstLoad = true;
        this.isVodPlaylist = false;  // 重置VOD标记

        this.hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,  // 对于vod类型，不需要低延迟模式
          maxBufferLength: 30,  // 增加缓冲长度（秒），适合vod类型
          maxMaxBufferLength: 60,
          maxBufferSize: 60 * 1000 * 1000,  // 增加缓冲大小（60MB）
          maxLoadingDelay: 4,
          minAutoBitrate: 0,
          startLevel: -1,  // 自动选择质量
          debug: false,
          // 对于vod类型，不要频繁重新加载清单
          manifestLoadingTimeOut: 10000,  // 清单加载超时（10秒）
          manifestLoadingMaxRetry: 1,  // 清单加载最大重试次数
          levelLoadingTimeOut: 10000,  // 级别加载超时
          fragLoadingTimeOut: 20000,  // 片段加载超时
          // 自定义XHR配置，修复片段URL路径
          xhrSetup: (xhr, url) => {
            // 修复错误的URL路径
            // 错误：/api/streams/{id}/hls/playlist.m3u8/segment000.ts
            // 正确：/api/streams/{id}/hls/segment000.ts
            if (url.includes('/playlist.m3u8/') && url.endsWith('.ts')) {
              const fixedUrl = url.replace('/playlist.m3u8/', '/');
              console.log('HLSPlayer: 修复URL路径:', url, '->', fixedUrl);
              xhr.open('GET', fixedUrl, true);
              return;
            }
            // 正常URL，使用默认处理
            xhr.open('GET', url, true);
          },
        });

        // 加载HLS流
        this.hls.loadSource(this.hlsUrl);
        this.hls.attachMedia(this.videoElement);

        // 监听清单加载事件，检测播放列表类型
        this.hls.on(Hls.Events.MANIFEST_LOADED, (event, data) => {
          if (isFirstLoad) {
            isFirstLoad = false;
            console.log('HLSPlayer: 首次清单加载完成', data);
            // 检查播放列表类型
            if (data.levels && data.levels[0] && data.levels[0].details) {
              const isLive = data.levels[0].details.live;
              this.isVodPlaylist = !isLive;
              console.log('HLSPlayer: 播放列表类型:', isLive ? '实时流(event)' : '点播(vod)');

              // 如果是vod类型，调整配置
              if (this.isVodPlaylist && this.hls) {
                console.log('HLSPlayer: 检测到VOD类型，优化播放配置');
                // VOD类型不需要频繁重新加载清单
              }
            }
          } else {
            console.log('HLSPlayer: 清单更新（保持播放位置）');
            // 对于vod类型，清单不应该频繁更新
            if (this.isVodPlaylist) {
              console.warn('HLSPlayer: VOD类型清单不应该更新，可能是配置问题');
            }
          }
        });

        // 事件监听
        this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('HLSPlayer: 清单解析完成，开始播放');
          this.isPlaying = true;
          if (this.onLoaded) {
            this.onLoaded();
          }
          // 自动播放（只在首次解析时）
          this.videoElement.play().catch(err => {
            console.error('HLSPlayer: 自动播放失败', err);
          });
        });

        this.hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                console.error('HLSPlayer: 网络错误，尝试恢复', data);
                // 如果是片段加载错误，可能是URL路径问题
                if (data.details === 'fragLoadError' && data.frag) {
                  console.error('HLSPlayer: 片段加载失败，URL:', data.frag.url);
                  // 尝试修复URL
                  if (data.frag.url && data.frag.url.includes('/playlist.m3u8/')) {
                    // URL错误：/api/streams/{id}/hls/playlist.m3u8/segment000.ts
                    // 应该改为：/api/streams/{id}/hls/segment000.ts
                    const correctUrl = data.frag.url.replace('/playlist.m3u8/', '/');
                    console.log('HLSPlayer: 修复片段URL:', correctUrl);
                    // 注意：这里无法直接修改frag.url，需要重新加载
                  }
                }
                this.hls?.startLoad();
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                console.error('HLSPlayer: 媒体错误，尝试恢复');
                this.hls?.recoverMediaError();
                break;
              default:
                console.error('HLSPlayer: 致命错误，无法恢复', data);
                this.stop();
                if (this.onError) {
                  this.onError(new Error(`HLS播放错误: ${data.type}`));
                }
                break;
            }
          } else {
            // 非致命错误，记录但不中断播放
            if (data.details === 'fragLoadError' && data.frag) {
              console.warn('HLSPlayer: 片段加载错误（非致命）', {
                url: data.frag.url,
                type: data.type,
                details: data.details
              });
              // hls.js会自动重试
            } else {
              console.warn('HLSPlayer: 非致命错误', data);
            }
          }
        });

        this.hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
          console.log(`HLSPlayer: 切换到质量级别 ${data.level}`);
        });

      } else {
        throw new Error('浏览器不支持HLS播放');
      }

      // 清理旧监听，避免重复绑定
      if (this.boundVideoErrorHandler) {
        this.videoElement.removeEventListener('error', this.boundVideoErrorHandler);
      }
      if (this.boundVideoEndedHandler) {
        this.videoElement.removeEventListener('ended', this.boundVideoEndedHandler);
      }

      this.boundVideoErrorHandler = () => {
        console.error('HLSPlayer: Video元素错误');
        if (this.onError) {
          this.onError(new Error('视频播放错误'));
        }
      };
      this.videoElement.addEventListener('error', this.boundVideoErrorHandler);

      // 监听视频播放结束事件，实现循环播放（所有类型）
      this.boundVideoEndedHandler = () => {
        console.log('HLSPlayer: 视频播放结束，重新开始播放（循环）');
        // 对于VOD类型的本地文件，直接重新开始播放
        if (this.isVodPlaylist) {
          this.videoElement.currentTime = 0;
          this.videoElement.play().catch(err => {
            console.error('HLSPlayer: 循环播放失败', err);
          });
        } else {
          // 对于实时流（live stream），重新加载并开始播放
          console.log('HLSPlayer: 实时流结束，重新加载并开始播放');
          if (this.hls) {
            // 重新加载HLS流源
            this.hls.loadSource(this.hlsUrl);
            this.hls.startLoad();
            this.videoElement.currentTime = 0;
            // 延迟一下再播放，确保流已加载
            setTimeout(() => {
              this.videoElement.play().catch(err => {
                console.error('HLSPlayer: 实时流循环播放失败', err);
              });
            }, 100);
          } else if (this.videoElement.src) {
            // 对于原生HLS支持（Safari等），重新加载
            this.videoElement.load();
            this.videoElement.play().catch(err => {
              console.error('HLSPlayer: 原生HLS循环播放失败', err);
            });
          }
        }
      };
      this.videoElement.addEventListener('ended', this.boundVideoEndedHandler);

      // 设置video元素的loop属性作为备用（虽然HLS可能不支持，但可以作为fallback）
      this.videoElement.loop = false; // 不使用loop，因为我们要手动控制循环

    } catch (error) {
      console.error('HLSPlayer: 启动失败', error);
      this.isPlaying = false;
      if (this.onError) {
        this.onError(error instanceof Error ? error : new Error('启动失败'));
      }
      throw error;
    }
  }

  /**
   * 停止播放
   */
  stop(): void {
    if (!this.isPlaying) {
      return;
    }

    console.log('HLSPlayer: 停止播放');

    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }

    if (this.videoElement) {
      if (this.boundVideoErrorHandler) {
        this.videoElement.removeEventListener('error', this.boundVideoErrorHandler);
        this.boundVideoErrorHandler = null;
      }
      if (this.boundVideoEndedHandler) {
        this.videoElement.removeEventListener('ended', this.boundVideoEndedHandler);
        this.boundVideoEndedHandler = null;
      }
      this.videoElement.pause();
      this.videoElement.src = '';
      this.videoElement.removeAttribute('src');
    }

    this.isPlaying = false;
  }

  /**
   * 销毁播放器
   */
  destroy(): void {
    this.stop();
  }

  /**
   * 检查是否正在播放
   */
  isActive(): boolean {
    return this.isPlaying;
  }

  /**
   * 获取HLS URL
   */
  getHlsUrl(): string {
    return this.hlsUrl;
  }
}
