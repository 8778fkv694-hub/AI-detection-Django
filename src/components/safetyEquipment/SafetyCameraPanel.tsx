/**
 * Safety Camera Panel Component
 *
 * 用途：摄像头控制与视频显示区域
 * 使用位置：SafetyEquipmentScreen
 */

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';
import {
  Camera,
  CameraOff,
  Play,
  Pause,
  Maximize,
  Minimize,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useVideoAspect } from '@/hooks/useVideoAspect';
import type { CameraDevice } from '@/lib/cameraUtils';
import type { DetectionStats } from '@/hooks/safetyEquipment/usePPEDetection';
import type { PpeVerdict } from '@/lib/safetyEquipment/ppeVerdict';
import { FullscreenVerdictBadge } from '@/components/detection/FullscreenVerdictBadge';

export interface SafetyCameraPanelProps {
  /** 窗口ID */
  windowId: string;
  /** 视频元素引用 */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 检测画布引用 */
  detectionCanvasRef: React.RefObject<HTMLCanvasElement>;
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 是否正在监控 */
  isMonitoring: boolean;
  /** PPE检测是否激活 */
  isPpeActive: boolean;
  /** 是否显示检测框 */
  showDetections: boolean;
  /** 可用的摄像头设备 */
  videoDevices: CameraDevice[];
  /** 当前选中的设备ID */
  selectedDeviceId: string | undefined;
  /** 检测统计 */
  detectionStats: DetectionStats;
  /** 最近一次检测的全屏判定（A1.3），全屏时渲染右上角徽章 */
  latestVerdict?: PpeVerdict | null;
  /** 切换摄像头开关 */
  onToggleCamera: () => void;
  /** 切换监控状态 */
  onToggleMonitoring: () => void;
  /** 切换摄像头设备 */
  onSwitchCamera: (deviceId: string) => void;
}

export const SafetyCameraPanel: React.FC<SafetyCameraPanelProps> = ({
  windowId,
  videoRef,
  detectionCanvasRef,
  isCameraOn,
  isMonitoring,
  isPpeActive,
  showDetections,
  videoDevices,
  selectedDeviceId,
  detectionStats,
  latestVerdict,
  onToggleCamera,
  onToggleMonitoring,
  onSwitchCamera,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const videoAspect = useVideoAspect(videoRef);

  // 全屏切换功能
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      const videoContainer = document.getElementById('video-container');
      if (videoContainer) {
        videoContainer.requestFullscreen().then(() => {
          setIsFullscreen(true);
        }).catch((err) => {
          console.error('全屏失败:', err);
        });
      }
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch((err) => {
        console.error('退出全屏失败:', err);
      });
    }
  };

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  return (
    <div className="space-y-4">
      {/* 视频显示区域 */}
      <div
        id="video-container"
        className="aspect-video bg-black rounded-lg flex items-center justify-center text-slate-500 overflow-hidden relative"
        style={videoAspect ? { aspectRatio: String(videoAspect) } : undefined}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn('w-full h-full object-contain', { hidden: !isCameraOn })}
        />
        <canvas
          ref={detectionCanvasRef}
          className={cn(
            'absolute inset-0 w-full h-full object-contain pointer-events-none z-10',
            { hidden: !isCameraOn || !showDetections || !isPpeActive }
          )}
        />
        {!isCameraOn && <CameraOff className="h-16 w-16" />}

        {/* 全屏时显示的判定徽章（渲染在被全屏的容器内，否则全屏时不可见） */}
        {isCameraOn && isFullscreen && latestVerdict && (
          <FullscreenVerdictBadge verdict={latestVerdict.overallQuality} score={latestVerdict.score} />
        )}

        {/* 全屏按钮 */}
        {isCameraOn && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors z-10"
            title={isFullscreen ? '退出全屏' : '全屏显示'}
          >
            {isFullscreen ? (
              <Minimize className="h-4 w-4" />
            ) : (
              <Maximize className="h-4 w-4" />
            )}
          </button>
        )}

        {/* 监控状态指示器 */}
        {isMonitoring && (
          <div className="absolute top-2 left-2 flex items-center gap-2 bg-red-500 text-white px-2 py-1 rounded text-xs">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            监控中
          </div>
        )}

        {/* 检测统计 */}
        {isMonitoring && (
          <div className="absolute bottom-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs">
            <div>人员: {detectionStats.personDetections}</div>
            <div>装备: {detectionStats.equipmentDetections}</div>
          </div>
        )}
      </div>

      {/* 窗口信息和调试信息 */}
      <div className="text-xs text-slate-500 space-y-1">
        <div className="font-medium text-blue-400">窗口ID: {windowId.slice(-8)}</div>
        <div>
          检测到 {videoDevices.length} 个摄像头设备
          {selectedDeviceId &&
            `，当前选择: ${videoDevices.find((d) => d.deviceId === selectedDeviceId)?.label || '未知'}`}
        </div>
      </div>

      {/* 摄像头选择器 */}
      <Select value={selectedDeviceId || ''} onValueChange={onSwitchCamera}>
        <SelectTrigger className="w-full bg-slate-800 border-slate-600">
          <SelectValue
            placeholder={videoDevices.length > 0 ? '选择摄像头' : '未检测到摄像头'}
          />
        </SelectTrigger>
        <SelectContent>
          {videoDevices.length > 0 ? (
            videoDevices
              .filter((device) => device.deviceId && device.deviceId.trim() !== '')
              .map((device) => (
                <SelectItem key={device.deviceId} value={device.deviceId}>
                  {device.label || `摄像头 ${device.deviceId.slice(0, 8)}`}
                </SelectItem>
              ))
          ) : (
            <SelectItem value="no-camera" disabled>
              未检测到摄像头设备
            </SelectItem>
          )}
        </SelectContent>
      </Select>

      {/* 控制按钮 */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={onToggleCamera}
          variant={isCameraOn ? 'destructive' : 'default'}
        >
          <Camera className="mr-2 h-4 w-4" />
          {isCameraOn ? '关闭摄像头' : '开启摄像头'}
        </Button>
        <Button
          onClick={onToggleMonitoring}
          disabled={!isCameraOn}
          variant={isMonitoring ? 'destructive' : 'default'}
        >
          {isMonitoring ? (
            <Pause className="mr-2 h-4 w-4" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          {isMonitoring ? '停止监控' : '开始监控'}
        </Button>
      </div>
    </div>
  );
};

export default SafetyCameraPanel;
