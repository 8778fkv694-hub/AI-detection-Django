/**
 * Safety Camera Hook
 *
 * 用途：摄像头控制与视频流管理
 * 功能：开启/关闭摄像头、切换摄像头、切换监控状态
 * 使用位置：SafetyEquipmentScreen
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { StreamPlayer } from '@/lib/streamPlayer';
import { HLSPlayer } from '@/lib/hlsPlayer';
import { MJPEGPlayer } from '@/lib/mjpegPlayer';
import { startHLSStream, getHLSPlaylistUrl } from '@/api/streamApi';
import { getCameraDevices, type CameraDevice } from '@/lib/cameraUtils';
import { useStreamSettingsStore } from '@/state/streamSettingsStore';

export interface UseSafetyCameraOptions {
  /** 窗口ID */
  windowId: string;
  /** 视频元素引用 */
  videoRef: React.RefObject<HTMLVideoElement>;
}

export interface UseSafetyCameraResult {
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 是否正在监控 */
  isMonitoring: boolean;
  /** PPE检测是否激活 */
  isPpeActive: boolean;
  /** 可用的摄像头设备 */
  videoDevices: CameraDevice[];
  /** 当前选中的设备ID */
  selectedDeviceId: string | undefined;
  /** MJPEG播放器引用 */
  mjpegPlayerRef: React.MutableRefObject<MJPEGPlayer | null>;
  /** 流媒体播放器引用 */
  streamPlayerRef: React.MutableRefObject<StreamPlayer | null>;
  /** HLS播放器引用 */
  hlsPlayerRef: React.MutableRefObject<HLSPlayer | null>;
  /** 切换摄像头开关 */
  toggleCamera: () => Promise<void>;
  /** 切换监控状态 */
  toggleMonitoring: () => void;
  /** 切换摄像头设备 */
  switchCamera: (deviceId: string) => Promise<void>;
  /** 设置选中的设备ID */
  setSelectedDeviceId: (deviceId: string) => void;
}

// 兼容性: getUserMedia 封装，支持旧版浏览器前缀
const getUserMediaCompat = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
  const isLocalhost =
    typeof window !== 'undefined' &&
    /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
  const isSecure =
    typeof window !== 'undefined' &&
    (window.isSecureContext || window.location.protocol === 'https:' || isLocalhost);
  if (!isSecure) {
    toast.error('摄像头需要在 HTTPS 或 localhost 环境使用');
  }

  if (navigator.mediaDevices?.getUserMedia) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err: unknown) {
      const error = err as { name?: string };
      if (
        error?.name === 'OverconstrainedError' ||
        error?.name === 'NotReadableError'
      ) {
        try {
          return await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          });
        } catch {
          throw err;
        }
      }
      throw err;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nav = navigator as any;
  const legacyGetUserMedia =
    nav.getUserMedia || nav.webkitGetUserMedia || nav.mozGetUserMedia || nav.msGetUserMedia;

  if (legacyGetUserMedia && typeof legacyGetUserMedia === 'function') {
    return new Promise<MediaStream>((resolve, reject) => {
      try {
        legacyGetUserMedia.call(navigator, constraints, resolve, reject);
      } catch (e) {
        reject(e);
      }
    });
  }

  throw new Error('当前环境不支持摄像头 (getUserMedia 不可用)');
};

export const useSafetyCamera = ({
  windowId,
  videoRef,
}: UseSafetyCameraOptions): UseSafetyCameraResult => {
  const streamPlayerRef = useRef<StreamPlayer | null>(null);
  const hlsPlayerRef = useRef<HLSPlayer | null>(null);
  const mjpegPlayerRef = useRef<MJPEGPlayer | null>(null);

  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isPpeActive, setIsPpeActive] = useState(false);
  const [videoDevices, setVideoDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const globalFps = useStreamSettingsStore((s) => s.fps);
  const globalQuality = useStreamSettingsStore((s) => s.quality);
  const globalWidth = useStreamSettingsStore((s) => s.targetWidth);

  // 获取摄像头列表
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const devices = await getCameraDevices();
        if (mounted) {
          setVideoDevices(devices);
          if (!selectedDeviceId && devices.length > 0) {
            const preferVirtual =
              window.location.port === '3005' || window.location.port === '3001';
            const preferredDevice = preferVirtual
              ? devices.find((d) => d.isVirtual) || devices.find((d) => !d.isVirtual) || devices[0]
              : devices.find((d) => !d.isVirtual) || devices.find((d) => d.isVirtual) || devices[0];

            setSelectedDeviceId(preferredDevice.deviceId);
            console.log(
              `[${windowId}] 自动选择${preferredDevice.isVirtual ? '流媒体设备' : '物理摄像头'}: ${preferredDevice.label}`
            );
          }
        }
      } catch (e) {
        console.error('获取摄像头列表失败:', e);
        if (mounted) setVideoDevices([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [windowId, selectedDeviceId]);

  // 启动摄像头
  const startCamera = useCallback(
    async (deviceId?: string) => {
      try {
        // 停止之前的流媒体播放器
        if (mjpegPlayerRef.current) {
          mjpegPlayerRef.current.destroy();
          mjpegPlayerRef.current = null;
        }

        if (streamPlayerRef.current) {
          streamPlayerRef.current.destroy();
          streamPlayerRef.current = null;
        }

        if (hlsPlayerRef.current) {
          hlsPlayerRef.current.destroy();
          hlsPlayerRef.current = null;
        }

        if (videoRef.current) {
          const existingStream = videoRef.current.srcObject as MediaStream;
          if (existingStream) {
            existingStream.getTracks().forEach((track) => track.stop());
            videoRef.current.srcObject = null;
          }
        }

        const isVirtualCamera = deviceId?.startsWith('stream-');

        if (isVirtualCamera && deviceId && videoRef.current) {
          const streamId = deviceId.replace('stream-', '');
          const streamDevice = videoDevices.find((d) => d.deviceId === deviceId);
          const playMode = streamDevice?.streamSource?.play_mode || 'ffmpeg';

          console.log(`[${windowId}] 启动虚拟流媒体摄像头: ${streamId}，播放模式: ${playMode}`);

          // 优先 MJPEG 直显（零双重编码，清晰度最高）
          try {
            console.log(`[${windowId}] 使用 MJPEG 流 (fps=${globalFps}, q=${globalQuality}, w=${globalWidth})`);
            const mjpegPlayer = new MJPEGPlayer({
              videoElement: videoRef.current,
              streamId: streamId,
              fps: globalFps,
              quality: globalQuality,
              targetWidth: globalWidth,
              windowId: windowId,
              onError: (error) => {
                console.error('MJPEG播放错误:', error);
                mjpegPlayerRef.current?.destroy();
                mjpegPlayerRef.current = null;
                setIsCameraOn(false);
                setIsMonitoring(false);
                setIsPpeActive(false);
              },
              onStreamTaken: () => {
                toast.error('摄像头流已被其他窗口接管');
                setIsCameraOn(false);
                setIsMonitoring(false);
                setIsPpeActive(false);
              },
            });

            await mjpegPlayer.start();
            mjpegPlayerRef.current = mjpegPlayer;
            setIsCameraOn(true);
            console.log(`[${windowId}] MJPEG 流启动成功`);
            return;
          } catch (mjpegError) {
            console.warn(`[${windowId}] MJPEG 启动失败，回退:`, mjpegError);
            mjpegPlayerRef.current?.destroy();
            mjpegPlayerRef.current = null;
          }

          if (playMode === 'ffmpeg') {
            try {
              console.log(`[${windowId}] 使用FFmpeg/HLS流`);
              await startHLSStream(streamId, {
                fps: globalFps,
                width: globalWidth,
                crf: 26,
                preset: 'ultrafast',
                threads: 2,
              });
              const hlsUrl = getHLSPlaylistUrl(streamId);

              const hlsPlayer = new HLSPlayer({
                videoElement: videoRef.current,
                hlsUrl: hlsUrl,
                onError: (error) => {
                  console.error('HLS播放错误:', error);
                  toast.error(`HLS播放失败: ${error.message}`);
                  hlsPlayerRef.current?.destroy();
                  hlsPlayerRef.current = null;
                  setIsCameraOn(false);
                  setIsMonitoring(false);
                  setIsPpeActive(false);
                },
                onLoaded: () => {
                  console.log(`[${windowId}] HLS流加载完成`);
                  toast.success('HLS流启动成功（低CPU占用配置）');
                },
              });

              await hlsPlayer.start();
              hlsPlayerRef.current = hlsPlayer;
              setIsCameraOn(true);
              return;
            } catch (hlsError) {
              console.error(`[${windowId}] HLS启动失败:`, hlsError);
              toast.error('HLS流启动失败，回退到JPG模式');
            }
          }

          // JPEG 逐帧轮询（最终回退）
          console.log(`[${windowId}] 使用JPEG流`);
          const player = new StreamPlayer({
            videoElement: videoRef.current,
            streamId: streamId,
            fps: globalFps,
            quality: globalQuality,
            targetWidth: globalWidth,
            windowId: windowId,
            onError: (error) => {
              toast.error(`流媒体播放失败: ${error.message}`);
              streamPlayerRef.current?.destroy();
              streamPlayerRef.current = null;
              setIsCameraOn(false);
              setIsMonitoring(false);
              setIsPpeActive(false);
            },
            onStreamTaken: () => {
              toast.error('无法访问摄像头：未知错误。');
              setIsCameraOn(false);
              setIsMonitoring(false);
              setIsPpeActive(false);
            },
          });

          streamPlayerRef.current = player;
          await player.start();
          setIsCameraOn(true);
          toast.success('流媒体启动成功');
          return;
        }

        // 物理摄像头
        const stream = await getUserMediaCompat({
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setIsCameraOn(true);

        stream.getVideoTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            console.log(`[${windowId}] 摄像头轨道已结束`);
            setIsCameraOn(false);
            setIsMonitoring(false);
            setIsPpeActive(false);
          });
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : '无法访问摄像头';
        toast.error(msg);
      }
    },
    [windowId, videoRef, videoDevices, globalFps, globalQuality, globalWidth]
  );

  useEffect(() => {
    if (!isCameraOn || !selectedDeviceId?.startsWith('stream-')) return;

    mjpegPlayerRef.current?.updateSettings({
      fps: globalFps,
      quality: globalQuality,
      targetWidth: globalWidth,
    });
    streamPlayerRef.current?.updateSettings({
      fps: globalFps,
      quality: globalQuality,
      targetWidth: globalWidth,
    });
  }, [globalFps, globalQuality, globalWidth, isCameraOn, selectedDeviceId]);

  // 切换摄像头
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      console.log(`[${windowId}] 关闭摄像头`);

      if (mjpegPlayerRef.current) {
        mjpegPlayerRef.current.destroy();
        mjpegPlayerRef.current = null;
      }

      if (streamPlayerRef.current) {
        streamPlayerRef.current.destroy();
        streamPlayerRef.current = null;
      }

      if (hlsPlayerRef.current) {
        hlsPlayerRef.current.destroy();
        hlsPlayerRef.current = null;
      }

      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;

      setIsCameraOn(false);
      setIsMonitoring(false);
      setIsPpeActive(false);
      toast.success(`[${windowId.slice(-8)}] 摄像头已关闭`);
    } else {
      console.log(`[${windowId}] 开启摄像头`);
      await startCamera(selectedDeviceId);
    }
  }, [isCameraOn, selectedDeviceId, windowId, videoRef, startCamera]);

  // 切换摄像头设备
  const switchCamera = useCallback(
    async (deviceId: string) => {
      console.log(`[${windowId}] 切换摄像头到:`, deviceId);
      setSelectedDeviceId(deviceId);

      if (isCameraOn) {
        const stream = videoRef.current?.srcObject as MediaStream;
        stream?.getTracks().forEach((track) => track.stop());
        await startCamera(deviceId);
      }
    },
    [isCameraOn, windowId, videoRef, startCamera]
  );

  // 切换监控状态
  const toggleMonitoring = useCallback(() => {
    if (isMonitoring) {
      setIsMonitoring(false);
      setIsPpeActive(false);
      toast.success('已停止监控');
    } else {
      if (!isCameraOn) {
        toast.error('请先开启摄像头');
        return;
      }
      setIsMonitoring(true);
      setIsPpeActive(true);
      toast.success('开始实时监控，使用后端PPE检测');
    }
  }, [isMonitoring, isCameraOn]);

  // 摄像头开关/切换时自动启动
  useEffect(() => {
    if (isCameraOn && selectedDeviceId) {
      startCamera(selectedDeviceId);
    }
  }, [selectedDeviceId]);

  // 组件卸载时清理摄像头资源
  useEffect(() => {
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    };
  }, [videoRef]);

  return {
    isCameraOn,
    isMonitoring,
    isPpeActive,
    videoDevices,
    selectedDeviceId,
    mjpegPlayerRef,
    streamPlayerRef,
    hlsPlayerRef,
    toggleCamera,
    toggleMonitoring,
    switchCamera,
    setSelectedDeviceId,
  };
};
