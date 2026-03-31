/**
 * 虚拟摄像头Hook
 * 合并真实摄像头和流媒体虚拟摄像头
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { getActiveStreams, getStreamFrame } from '@/api/streamApi';
import type { StreamSource, VirtualCameraDevice } from '@/types/stream';

export interface UseVirtualCamerasOptions {
  refreshInterval?: number; // 刷新间隔（毫秒）
  autoRefresh?: boolean; // 是否自动刷新
}

export const useVirtualCameras = (options: UseVirtualCamerasOptions = {}) => {
  const { refreshInterval = 5000, autoRefresh = true } = options;
  
  const [realCameras, setRealCameras] = useState<MediaDeviceInfo[]>([]);
  const [virtualCameras, setVirtualCameras] = useState<VirtualCameraDevice[]>([]);
  const [allCameras, setAllCameras] = useState<VirtualCameraDevice[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 获取真实摄像头（包括系统级虚拟摄像头如OBS虚拟摄像头）
  const fetchRealCameras = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        console.warn('MediaDevices API 不可用');
        return [];
      }
      
      // 重要：先请求摄像头权限，这样浏览器才会返回完整的设备标签
      // 如果没有权限，enumerateDevices() 返回的设备 label 字段会是空字符串
      // 这会导致OBS虚拟摄像头等系统级虚拟摄像头无法被正确识别
      try {
        // 尝试获取任意一个摄像头设备的权限（不指定具体设备）
        const tempStream = await navigator.mediaDevices.getUserMedia({ 
          video: true 
        });
        // 立即停止流，不占用摄像头资源
        tempStream.getTracks().forEach(track => track.stop());
      } catch (permissionError) {
        // 权限被拒绝或没有设备，继续尝试枚举（可能只能获取部分信息）
        console.warn('无法获取摄像头权限，设备标签可能不完整（OBS虚拟摄像头可能无法识别）:', permissionError);
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(device => device.kind === 'videoinput');
      return videoDevices;
    } catch (err) {
      console.error('获取真实摄像头失败:', err);
      return [];
    }
  }, []);

  // 获取虚拟摄像头（流媒体）
  const fetchVirtualCameras = useCallback(async () => {
    try {
      const streams = await getActiveStreams();
      
      // 将StreamSource转换为VirtualCameraDevice
      const virtualDevices: VirtualCameraDevice[] = streams
        .filter(s => s.is_active) // 只包含激活的流
        .map(stream => ({
          deviceId: `stream-${stream.id}`,
          groupId: 'virtual-streams',
          kind: 'videoinput' as MediaDeviceKind,
          label: `📹 ${stream.name} (流媒体)`,
          toJSON: function() { return {}; },
          isVirtual: true,
          streamId: stream.id,
          streamSource: stream,
        }));
      
      return virtualDevices;
    } catch (err) {
      console.error('获取虚拟摄像头失败:', err);
      return [];
    }
  }, []);

  // 刷新所有摄像头列表
  const refreshCameras = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const [real, virtual] = await Promise.all([
        fetchRealCameras(),
        fetchVirtualCameras(),
      ]);
      
      setRealCameras(real);
      setVirtualCameras(virtual);
      
      // 合并列表：真实摄像头标记为非虚拟，虚拟摄像头已经标记
      const realWithFlag: VirtualCameraDevice[] = real.map(device => ({
        ...device,
        isVirtual: false,
      }));
      
      setAllCameras([...realWithFlag, ...virtual]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取摄像头列表失败';
      setError(errorMessage);
      console.error('刷新摄像头列表失败:', err);
    } finally {
      setIsLoading(false);
    }
  }, [fetchRealCameras, fetchVirtualCameras]);

  // 初始加载
  useEffect(() => {
    refreshCameras();
  }, [refreshCameras]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    refreshTimerRef.current = setInterval(() => {
      refreshCameras();
    }, refreshInterval);

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, refreshInterval, refreshCameras]);

  return {
    realCameras,
    virtualCameras,
    allCameras,
    isLoading,
    error,
    refreshCameras,
  };
};

/**
 * 虚拟摄像头视频流Hook
 * 用于从流媒体拉取视频帧并显示
 */
export interface UseVirtualCameraStreamOptions {
  streamId: string;
  enabled: boolean;
  fps?: number; // 帧率
  quality?: number; // 图片质量 1-100
  targetWidth?: number; // 目标宽度，0 表示原始宽度
}

export const useVirtualCameraStream = (options: UseVirtualCameraStreamOptions) => {
  const { streamId, enabled, fps = 15, quality = 85, targetWidth = 0 } = options;
  
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const frameTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 获取视频帧
  const fetchFrame = useCallback(async () => {
    if (!streamId || !enabled) {
      return;
    }

    try {
      const frameData = await getStreamFrame(streamId, quality, targetWidth);
      setCurrentFrame(frameData.frame);
      setError(null);
    } catch (err) {
      console.error('获取视频帧失败:', err);
      setError(err instanceof Error ? err.message : '获取视频帧失败');
    }
  }, [streamId, enabled, quality, targetWidth]);

  // 更新video元素的src
  const updateVideoElement = useCallback(() => {
    if (!currentFrame || !videoElementRef.current) {
      return;
    }

    // 使用Canvas将Base64图片绘制到video元素上
    // 这是一个技巧：我们使用Canvas作为中间层
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }

    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        
        // 如果有video元素，将canvas流连接到video
        if (videoElementRef.current && !videoElementRef.current.srcObject) {
          const stream = canvas.captureStream(fps);
          videoElementRef.current.srcObject = stream;
        }
      }
    };
    img.src = currentFrame;
  }, [currentFrame, fps]);

  // 启动/停止流
  useEffect(() => {
    if (enabled && streamId) {
      setIsStreaming(true);
      
      // 立即获取第一帧
      fetchFrame();
      
      // 设置定时器持续获取帧
      const interval = 1000 / fps;
      frameTimerRef.current = setInterval(fetchFrame, interval);
    } else {
      setIsStreaming(false);
      
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
        frameTimerRef.current = null;
      }
    }

    return () => {
      if (frameTimerRef.current) {
        clearInterval(frameTimerRef.current);
      }
    };
  }, [enabled, streamId, fps, fetchFrame]);

  // 更新video元素
  useEffect(() => {
    updateVideoElement();
  }, [updateVideoElement]);

  // 绑定video元素
  const bindVideoElement = useCallback((videoElement: HTMLVideoElement | null) => {
    videoElementRef.current = videoElement;
  }, []);

  return {
    currentFrame,
    isStreaming,
    error,
    bindVideoElement,
  };
};

