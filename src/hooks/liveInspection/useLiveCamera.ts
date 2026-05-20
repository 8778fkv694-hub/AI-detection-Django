/**
 * Live Camera Hook
 *
 * 用途：摄像头控制与视频流管理
 * 功能：开启/关闭摄像头、切换摄像头、手动抓拍
 * 使用位置：LiveInspectionScreen
 */

import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { StreamPlayer } from '@/lib/streamPlayer';
import { HLSPlayer } from '@/lib/hlsPlayer';
import { MJPEGPlayer } from '@/lib/mjpegPlayer';
import { startHLSStream, getHLSPlaylistUrl } from '@/api/streamApi';
import { buildCameraVideoConstraints, type CameraDevice } from '@/lib/cameraUtils';
import { useStreamSettingsStore } from '@/state/streamSettingsStore';

export interface UseLiveCameraOptions {
  /** 窗口ID */
  windowId: string;
  /** 视频元素引用 */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 设置摄像头开启状态 */
  setIsCameraOn: (value: boolean) => void;
  /** 选中的设备ID */
  selectedDeviceId: string;
  /** 可用设备列表 */
  availableDevices: CameraDevice[];
  /** 设置YOLO检测状态 */
  setIsYoloActive: (value: boolean) => void;
  /** 压缩图片函数 */
  compressImage: (base64: string) => Promise<string>;
  /** 添加抓拍图片 */
  addCapturedImage: (image: string) => void;
}

export interface UseLiveCameraResult {
  /** 切换摄像头 */
  toggleCamera: () => Promise<void>;
  /** 手动抓拍 */
  handleCapture: () => Promise<void>;
  /** MJPEG播放器引用 */
  mjpegPlayerRef: React.MutableRefObject<MJPEGPlayer | null>;
  /** 流媒体播放器引用 */
  streamPlayerRef: React.MutableRefObject<StreamPlayer | null>;
  /** HLS播放器引用 */
  hlsPlayerRef: React.MutableRefObject<HLSPlayer | null>;
}

export const useLiveCamera = ({
  windowId,
  videoRef,
  isCameraOn,
  setIsCameraOn,
  selectedDeviceId,
  availableDevices,
  setIsYoloActive,
  compressImage,
  addCapturedImage,
}: UseLiveCameraOptions): UseLiveCameraResult => {
  const streamPlayerRef = useRef<StreamPlayer | null>(null);
  const hlsPlayerRef = useRef<HLSPlayer | null>(null);
  const mjpegPlayerRef = useRef<MJPEGPlayer | null>(null);

  // 全局视频流显示设置（仅影响浏览器渲染，不影响 YOLO 检测）
  const globalFps = useStreamSettingsStore((s) => s.fps);
  const globalQuality = useStreamSettingsStore((s) => s.quality);
  const globalWidth = useStreamSettingsStore((s) => s.targetWidth);

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

  useEffect(() => {
    return () => {
      mjpegPlayerRef.current?.destroy();
      mjpegPlayerRef.current = null;
      streamPlayerRef.current?.destroy();
      streamPlayerRef.current = null;
      hlsPlayerRef.current?.destroy();
      hlsPlayerRef.current = null;

      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [videoRef]);

  // 切换摄像头
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      console.log('关闭摄像头');

      // 停止 MJPEG 播放器
      if (mjpegPlayerRef.current) {
        mjpegPlayerRef.current.destroy();
        mjpegPlayerRef.current = null;
      }

      // 停止流媒体播放器
      if (streamPlayerRef.current) {
        streamPlayerRef.current.destroy();
        streamPlayerRef.current = null;
      }

      // 停止HLS播放器
      if (hlsPlayerRef.current) {
        hlsPlayerRef.current.destroy();
        hlsPlayerRef.current = null;
      }

      // 停止物理摄像头流
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;

      setIsCameraOn(false);
      setIsYoloActive(false);
      toast.success('摄像头已关闭');
    } else {
      console.log('开启摄像头');
      try {
        // 先停止物理摄像头流
        if (videoRef.current) {
          const existingStream = videoRef.current.srcObject as MediaStream;
          if (existingStream) {
            existingStream.getTracks().forEach((track) => track.stop());
            videoRef.current.srcObject = null;
          }
        }

        // 检查是否为虚拟流媒体摄像头
        const isVirtualCamera = selectedDeviceId?.startsWith('stream-');

        if (isVirtualCamera && selectedDeviceId && videoRef.current) {
          const streamId = selectedDeviceId.replace('stream-', '');

          // 查找流媒体源信息
          const streamDevice = availableDevices.find((d) => d.deviceId === selectedDeviceId);
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
                setIsYoloActive(false);
              },
              onStreamTaken: () => {
                toast.error('摄像头流已被其他窗口接管');
                setIsCameraOn(false);
                setIsYoloActive(false);
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
              console.log(`[${windowId}] 使用FFmpeg/HLS流 (fps=${globalFps}, w=${globalWidth})`);
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
                  setIsYoloActive(false);
                },
                onLoaded: () => {
                  console.log(`[${windowId}] HLS流加载完成`);
                  toast.success('HLS流启动成功');
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
          console.log(`[${windowId}] 使用JPEG流 (fps=${globalFps}, q=${globalQuality}, w=${globalWidth})`);
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
              setIsYoloActive(false);
            },
            onStreamTaken: () => {
              toast.error('无法访问摄像头: 被其他窗口占用');
              setIsCameraOn(false);
              setIsYoloActive(false);
            },
          });

          streamPlayerRef.current = player;
          await player.start();
          setIsCameraOn(true);
          toast.success(`[${windowId.slice(-8)}] 流媒体摄像头已开启`);
          return;
        }

        // 物理摄像头
        const constraints: MediaStreamConstraints = {
          video: buildCameraVideoConstraints(selectedDeviceId, {
            width: 1280,
            height: 720,
          }),
        };

        console.log(`[${windowId}] 尝试启动摄像头:`, selectedDeviceId);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log(`[${windowId}] 摄像头流获取成功`);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            console.log(`[${windowId}] 视频尺寸:`, videoRef.current?.videoWidth, 'x', videoRef.current?.videoHeight);
          };
        }
        setIsCameraOn(true);
        toast.success(`[${windowId.slice(-8)}] 摄像头已开启`);

        // 监听流状态
        stream.getVideoTracks().forEach((track) => {
          track.addEventListener('ended', () => {
            console.log(`[${windowId}] 摄像头轨道已结束`);
            setIsCameraOn(false);
            setIsYoloActive(false);
          });
        });
      } catch (err) {
        console.error(`[${windowId}] 摄像头访问失败:`, err);
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        if (errorMessage.includes('Permission denied')) {
          toast.error('摄像头权限被拒绝');
        } else if (errorMessage.includes('NotReadableError') || errorMessage.includes('NotAllowedError')) {
          toast.error('摄像头被其他应用占用');
        } else {
          toast.error(`无法访问摄像头: ${errorMessage}`);
        }
      }
    }
  }, [isCameraOn, selectedDeviceId, windowId, videoRef, availableDevices, setIsCameraOn, setIsYoloActive, globalFps, globalQuality, globalWidth]);

  // 手动抓拍
  const handleCapture = useCallback(async () => {
    if (!videoRef.current || !isCameraOn) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

    const compressedImage = await compressImage(base64Image);
    addCapturedImage(compressedImage);
    toast.success('已抓拍!');
  }, [isCameraOn, videoRef, compressImage, addCapturedImage]);

  return {
    toggleCamera,
    handleCapture,
    mjpegPlayerRef,
    streamPlayerRef,
    hlsPlayerRef,
  };
};
