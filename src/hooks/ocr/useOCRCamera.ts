/**
 * OCR Camera Management Hook
 *
 * 用途：管理 OCR 页面的摄像头功能
 * 功能：启动/关闭摄像头、切换设备、获取设备列表、处理流媒体
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import { useCallback, useEffect, useRef } from 'react';
import { getCameraDevices, type CameraDevice } from '@/lib/cameraUtils';
import { StreamPlayer } from '@/lib/streamPlayer';
import { HLSPlayer } from '@/lib/hlsPlayer';
import { MJPEGPlayer } from '@/lib/mjpegPlayer';
import { startHLSStream, getHLSPlaylistUrl } from '@/api/streamApi';
import toast from 'react-hot-toast';

interface UseOCRCameraOptions {
  windowId: string;
  videoRef: React.RefObject<HTMLVideoElement>;
  previewCanvasRef?: React.RefObject<HTMLCanvasElement>;
  isCameraOn: boolean;
  setIsCameraOn: (value: boolean) => void;
  setIsRealtimeActive: (value: boolean) => void;
  selectedDeviceId: string;
  setSelectedDeviceId: (value: string) => void;
  availableDevices: CameraDevice[];
  setAvailableDevices: (devices: CameraDevice[]) => void;
}

export const useOCRCamera = ({
  windowId,
  videoRef,
  previewCanvasRef: _previewCanvasRef,
  isCameraOn,
  setIsCameraOn,
  setIsRealtimeActive,
  selectedDeviceId,
  setSelectedDeviceId,
  availableDevices,
  setAvailableDevices,
}: UseOCRCameraOptions) => {
  const streamPlayerRef = useRef<StreamPlayer | null>(null);
  const hlsPlayerRef = useRef<HLSPlayer | null>(null);
  const mjpegPlayerRef = useRef<MJPEGPlayer | null>(null);

  // 启动摄像头
  const startCamera = useCallback(async (preferredDeviceId?: string) => {
    try {
      // 先停止 MJPEG 播放器（如果有）
      if (mjpegPlayerRef.current) {
        mjpegPlayerRef.current.destroy();
        mjpegPlayerRef.current = null;
      }

      // 先停止之前的流媒体播放器（如果有）
      if (streamPlayerRef.current) {
        streamPlayerRef.current.destroy();
        streamPlayerRef.current = null;
      }

      // 停止HLS播放器（如果有）
      if (hlsPlayerRef.current) {
        hlsPlayerRef.current.destroy();
        hlsPlayerRef.current = null;
      }

      // 先停止物理摄像头流（如果有）
      if (videoRef.current) {
        const existingStream = videoRef.current.srcObject as MediaStream;
        if (existingStream) {
          existingStream.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
        }
      }

      const targetDeviceId = preferredDeviceId || selectedDeviceId;

      // 检查是否为虚拟流媒体摄像头
      const isVirtualCamera = targetDeviceId?.startsWith('stream-');

      if (isVirtualCamera && targetDeviceId && videoRef.current) {
        // 虚拟流媒体摄像头
        const streamId = targetDeviceId.replace('stream-', '');

        // 查找流媒体源信息以获取 play_mode
        const streamDevice = availableDevices.find(d => d.deviceId === targetDeviceId);
        const playMode = streamDevice?.streamSource?.play_mode || 'ffmpeg';

        console.log(`[${windowId}] 启动虚拟流媒体摄像头: ${streamId}，播放模式: ${playMode}`);

        // 根据 play_mode 选择播放方案
        if (playMode === 'ffmpeg') {
          // 使用 FFmpeg/HLS 高画质方案（低CPU占用配置）
          try {
            console.log(`[${windowId}] 使用FFmpeg/HLS流（低CPU占用配置）`);
            // 使用推荐的"低CPU占用"配置
            await startHLSStream(streamId, {
              fps: 15,              // 降低帧率到15fps
              width: 1280,          // 降低分辨率到1280px宽度
              crf: 26,              // 降低质量（值越大CPU占用越低）
              preset: 'ultrafast',  // 最快编码预设
              threads: 2            // 限制使用2个CPU核心
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
                setIsRealtimeActive(false);
              },
              onLoaded: () => {
                console.log(`[${windowId}] HLS流加载完成`);
                toast.success('HLS流启动成功');
              },
            });

            await hlsPlayer.start();
            hlsPlayerRef.current = hlsPlayer;
            setIsCameraOn(true);
            console.log(`[${windowId}] HLS流启动成功`);
            return; // HLS成功，直接返回

          } catch (hlsError) {
            console.error(`[${windowId}] HLS启动失败:`, hlsError);
            toast.error('HLS流启动失败，回退到JPG模式');
            // 继续执行JPG模式作为回退
          }
        }

        // 使用 MJPEG 直连方案（最低延迟、最高清晰度）
        console.log(`[${windowId}] 使用 MJPEG 直连（零中转低延迟）`);
        const player = new MJPEGPlayer({
          videoElement: videoRef.current,
          streamId: streamId,
          fps: 25,
          quality: 95,
          targetWidth: 0, // 0 = 不缩放，保持原生分辨率
          onError: (error) => {
            console.error('MJPEGPlayer 错误:', error);
            toast.error(`MJPEG 流播放失败: ${error.message}`);
            mjpegPlayerRef.current?.destroy();
            mjpegPlayerRef.current = null;
            setIsCameraOn(false);
            setIsRealtimeActive(false);
          },
        });

        mjpegPlayerRef.current = player;
        await player.start();
        setIsCameraOn(true);
        console.log(`[${windowId}] MJPEG 直连摄像头启动成功`);
        return;
      }

      // 物理摄像头逻辑
      const devices = availableDevices;
      const devicesToTry = targetDeviceId
        ? [devices.find(d => d.deviceId === targetDeviceId)].filter(Boolean) as CameraDevice[]
        : devices.filter(d => !d.isVirtual); // 只尝试物理摄像头

      let lastError: Error | null = null;

      for (const device of devicesToTry) {
        try {
          const constraints: MediaStreamConstraints = {
            video: {
              deviceId: device.deviceId ? { exact: device.deviceId } : undefined,
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          };

          console.log(`[${windowId}] 尝试启动摄像头:`, device.label || device.deviceId);
          const stream = await navigator.mediaDevices.getUserMedia(constraints);

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }

          if (device.deviceId !== targetDeviceId) {
            setSelectedDeviceId(device.deviceId);
            console.log(`[${windowId}] 自动切换到可用设备: ${device.label || device.deviceId}`);
          }

          setIsCameraOn(true);
          console.log(`[${windowId}] 摄像头状态已更新为开启`);

          stream.getVideoTracks().forEach(track => {
            track.addEventListener('ended', () => {
              console.log(`[${windowId}] 摄像头轨道已结束，可能是被其他窗口占用`);
              setIsCameraOn(false);
              setIsRealtimeActive(false);
            });
          });

          return;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          console.warn(`[${windowId}] 无法访问摄像头设备 ${device.label || device.deviceId}:`, lastError.message);

          if (lastError.message.includes('Permission denied') || lastError.message.includes('NotAllowedError')) {
            break;
          }
          continue;
        }
      }

      console.error(`[${windowId}] 无法访问任何摄像头设备`);
      const errorMessage = lastError?.message || '未知错误';

      if (errorMessage.includes('Permission denied') || errorMessage.includes('NotAllowedError')) {
        toast.error('摄像头权限被拒绝，请检查浏览器权限设置');
      } else if (errorMessage.includes('NotReadableError') || errorMessage.includes('in use')) {
        if (devices.length > 1) {
          toast.error('当前摄像头被其他窗口占用，请尝试切换到其他摄像头设备');
        } else {
          toast.error('摄像头被其他窗口占用，请关闭其他使用摄像头的窗口后重试');
        }
      } else {
        toast.error(`无法访问摄像头: ${errorMessage}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '无法访问摄像头';
      console.error('启动摄像头失败:', err);
      toast.error(msg);
    }
  }, [selectedDeviceId, availableDevices, windowId, videoRef, setIsCameraOn, setIsRealtimeActive, setSelectedDeviceId]);

  // 摄像头控制函数
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      console.log(`[${windowId}] 关闭摄像头`);

      // 停止 MJPEG 播放器（如果有）
      if (mjpegPlayerRef.current) {
        mjpegPlayerRef.current.destroy();
        mjpegPlayerRef.current = null;
      }

      // 停止流媒体播放器（如果有）
      if (streamPlayerRef.current) {
        streamPlayerRef.current.destroy();
        streamPlayerRef.current = null;
      }

      // 停止HLS播放器（如果有）
      if (hlsPlayerRef.current) {
        hlsPlayerRef.current.destroy();
        hlsPlayerRef.current = null;
      }

      // 停止物理摄像头流（如果有）
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;

      setIsCameraOn(false);
      setIsRealtimeActive(false);
    } else {
      console.log(`[${windowId}] 开启摄像头`);
      await startCamera();
    }
  }, [isCameraOn, windowId, startCamera, setIsCameraOn, setIsRealtimeActive]);

  // 切换摄像头设备
  const switchCamera = useCallback(async (deviceId: string) => {
    console.log(`[${windowId}] 切换摄像头到:`, deviceId);
    setSelectedDeviceId(deviceId);

    if (isCameraOn) {
      // 如果摄像头正在运行，重新启动以使用新设备
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      // 停止 MJPEG 播放器
      if (mjpegPlayerRef.current) {
        mjpegPlayerRef.current.destroy();
        mjpegPlayerRef.current = null;
      }
      setIsCameraOn(false);

      // 启动新摄像头（指定设备ID）
      await startCamera(deviceId);
    }
  }, [windowId, isCameraOn, videoRef, setIsCameraOn, startCamera, setSelectedDeviceId]);

  // 获取可用摄像头设备
  const getAvailableDevices = useCallback(async () => {
    try {
      const devices = await getCameraDevices();
      setAvailableDevices(devices);

      // 从URL参数获取首选摄像头
      const urlParams = new URLSearchParams(window.location.search);
      const preferredCamera = urlParams.get('camera');

      if (preferredCamera && devices.find(d => d.deviceId === preferredCamera)) {
        setSelectedDeviceId(preferredCamera);
      } else if (selectedDeviceId && devices.find(d => d.deviceId === selectedDeviceId)) {
        // 保留用户当前选择，避免流媒体列表刷新时被重置
        return;
      } else if (devices.length > 0) {
        // 基于windowId智能分配不同的默认设备，避免多窗口冲突
        // 通过windowId的简单哈希来选择不同的设备索引
        let deviceIndex = 0;
        if (windowId) {
          // 使用windowId生成一个简单的哈希值来选择设备
          const hash = windowId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
          deviceIndex = hash % devices.length;
        }
        setSelectedDeviceId(devices[deviceIndex].deviceId);
        console.log(`[${windowId}] 自动分配摄像头设备索引 ${deviceIndex}: ${devices[deviceIndex].label}`);
      } else if (selectedDeviceId) {
        setSelectedDeviceId('');
      }
    } catch (error) {
      console.error('获取摄像头设备失败:', error);
    }
  }, [windowId, selectedDeviceId, setAvailableDevices, setSelectedDeviceId]);

  // 初始化摄像头设备
  useEffect(() => {
    getAvailableDevices();
  }, [windowId, getAvailableDevices]);

  // 定期刷新设备列表，并在窗口回到前台时同步最新流媒体配置
  useEffect(() => {
    const handleFocus = () => {
      getAvailableDevices();
    };

    const timer = window.setInterval(() => {
      getAvailableDevices();
    }, 10000);

    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [getAvailableDevices]);

  // 监听摄像头流状态变化 - 处理多窗口冲突
  useEffect(() => {
    if (!videoRef.current || !isCameraOn) return;

    const video = videoRef.current;

    const handleStreamEnd = async () => {
      // 只有在摄像头实际打开时才处理流结束事件
      if (!isCameraOn) {
        console.log(`[${windowId}] 收到流结束事件，但摄像头已关闭，忽略`);
        return;
      }

      console.log(`[${windowId}] 摄像头流已结束，可能是被其他窗口占用`);
      setIsCameraOn(false);
      setIsRealtimeActive(false);

      // 不再自动切换和重试，避免闪烁
      // 用户需要手动重新打开摄像头
      console.log(`[${windowId}] 摄像头流已结束，请手动重新打开摄像头`);
    };

    const handleStreamError = async () => {
      // 只有在摄像头实际打开时才处理流错误事件
      if (!isCameraOn) {
        console.log(`[${windowId}] 收到流错误事件，但摄像头已关闭，忽略`);
        return;
      }

      console.log(`[${windowId}] 摄像头流出现错误`);
      setIsCameraOn(false);
      setIsRealtimeActive(false);

      // 不再自动切换和重试，避免闪烁
      // 用户需要手动重新打开摄像头
      console.log(`[${windowId}] 摄像头流出现错误，请手动重新打开摄像头`);
    };

    // 监听流结束事件（仅对物理摄像头流，HLS流由HLSPlayer自己处理）
    const stream = video.srcObject as MediaStream;
    const tracks: MediaStreamTrack[] = [];

    // 检查是否为HLS流（通过检查是否有hlsPlayerRef或video.src属性）
    const isHLSStream = !stream && (video.src || hlsPlayerRef.current);

    // 只有当srcObject是MediaStream时（物理摄像头），才监听ended事件
    // HLS流使用src属性，由HLSPlayer自己处理循环播放，不应该触发自动重试
    if (stream && stream instanceof MediaStream) {
      video.addEventListener('ended', handleStreamEnd);
      video.addEventListener('error', handleStreamError);

      // 也监听track的ended事件（在startCamera中已经设置，这里作为备份）
      stream.getVideoTracks().forEach(track => {
        tracks.push(track);
        track.addEventListener('ended', handleStreamEnd);
      });
    } else if (!isHLSStream) {
      // 非HLS流且没有MediaStream，可能是其他情况，只监听错误事件
      video.addEventListener('error', handleStreamError);
    }
    // HLS流不监听ended和error事件，由HLSPlayer自己处理

    return () => {
      video.removeEventListener('ended', handleStreamEnd);
      video.removeEventListener('error', handleStreamError);
      tracks.forEach(track => {
        track.removeEventListener('ended', handleStreamEnd);
      });
    };
  }, [isCameraOn, windowId, setIsCameraOn, setIsRealtimeActive, videoRef]);

  return {
    startCamera,
    toggleCamera,
    switchCamera,
    getAvailableDevices,
    streamPlayerRef,
    hlsPlayerRef,
    mjpegPlayerRef,
  };
};
