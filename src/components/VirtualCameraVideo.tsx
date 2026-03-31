/**
 * 虚拟摄像头视频组件
 * 从流媒体拉取帧并显示
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { getStreamFrame } from '@/api/streamApi';

interface VirtualCameraVideoProps {
  streamId: string;
  enabled: boolean;
  fps?: number;
  quality?: number;
  targetWidth?: number; // 目标宽度，0 表示原始宽度
  className?: string;
  onError?: (error: string) => void;
}

const VirtualCameraVideo: React.FC<VirtualCameraVideoProps> = ({
  streamId,
  enabled,
  fps = 15,
  quality = 85,
  targetWidth = 0,
  className = '',
  onError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const frameIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);

  // 获取并显示帧
  const fetchAndDisplayFrame = useCallback(async () => {
    if (!streamId || !enabled || !canvasRef.current || !isMountedRef.current) {
      return;
    }

    try {
      const frameData = await getStreamFrame(streamId, quality, targetWidth);
      
      if (!isMountedRef.current) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) return;

      // 创建图片对象
      const img = new Image();
      img.onload = () => {
        if (!isMountedRef.current || !canvasRef.current) return;
        
        // 设置canvas尺寸
        canvas.width = img.width;
        canvas.height = img.height;
        
        // 绘制图片
        ctx.drawImage(img, 0, 0);
      };
      img.onerror = () => {
        console.error('加载视频帧失败');
      };
      img.src = frameData.frame;
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '获取视频帧失败';
      console.error('获取视频帧失败:', err);
      if (onError) {
        onError(errorMessage);
      }
    }
  }, [streamId, enabled, quality, targetWidth, onError]);

  // 启动/停止流
  useEffect(() => {
    isMountedRef.current = true;

    if (enabled && streamId) {
      setIsStreaming(true);
      
      // 立即获取第一帧
      fetchAndDisplayFrame();
      
      // 设置定时器持续获取帧
      const interval = 1000 / fps;
      frameIntervalRef.current = setInterval(fetchAndDisplayFrame, interval);
    } else {
      setIsStreaming(false);
      
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    }

    return () => {
      isMountedRef.current = false;
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
      }
    };
  }, [enabled, streamId, fps, fetchAndDisplayFrame]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        display: isStreaming ? 'block' : 'none',
      }}
    />
  );
};

export default VirtualCameraVideo;

