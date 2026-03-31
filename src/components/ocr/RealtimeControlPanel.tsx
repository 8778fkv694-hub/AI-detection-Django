/**
 * RealtimeControlPanel Component
 *
 * 用途：实时检测控制面板
 * 功能：摄像头控制、视频显示、YOLO模型状态、检测控制按钮
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import {
  Video,
  VideoOff,
  Play,
  Square,
  Camera,
  RotateCcw,
  CameraOff,
  Maximize,
  Minimize,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { VideoOverlayIndicators } from '@/components/ocr/VideoOverlayIndicators';
import type { CameraDevice } from '@/lib/cameraUtils';

interface RealtimeControlPanelProps {
  /** 窗口ID */
  windowId: string;
  /** 可用摄像头设备列表 */
  availableDevices: CameraDevice[];
  /** 当前选中的设备ID */
  selectedDeviceId: string;
  /** 切换摄像头 */
  switchCamera: (deviceId: string) => void;
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 切换摄像头 */
  toggleCamera: () => void;
  /** 实时检测是否激活 */
  isRealtimeActive: boolean;
  /** 设置实时检测状态 */
  setIsRealtimeActive: (active: boolean) => void;
  /** 手动抓拍 */
  handleManualCapture: () => void;
  /** 工作流状态 */
  workflowState: string;
  /** 强制重置 */
  handleForceReset: () => void;
  /** 模型是否正在加载 */
  modelLoading: boolean;
  /** 模型名称 */
  modelName: string;
  /** 刷新模型 */
  refreshModel: () => void;
  /** 视频元素引用 */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 检测画布引用 */
  detectionCanvasRef: React.RefObject<HTMLCanvasElement>;
  /** 是否全屏 */
  isFullscreen: boolean;
  /** 切换全屏 */
  toggleFullscreen: () => void;
  /** 是否正在检测 */
  isDetecting: boolean;
  /** 检测统计 */
  detectionStats: {
    totalDetections: number;
    qualifiedCount: number;
    unqualifiedCount: number;
    personDetections: number;
    equipmentDetections: number;
    lastDetectionTime: string | null;
  };
}

export const RealtimeControlPanel: React.FC<RealtimeControlPanelProps> = ({
  windowId,
  availableDevices,
  selectedDeviceId,
  switchCamera,
  isCameraOn,
  toggleCamera,
  isRealtimeActive,
  setIsRealtimeActive,
  handleManualCapture,
  workflowState,
  handleForceReset,
  modelLoading,
  modelName,
  refreshModel,
  videoRef,
  detectionCanvasRef,
  isFullscreen,
  toggleFullscreen,
  isDetecting,
  detectionStats,
}) => {
  return (
    <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-600">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Label className="text-sm font-medium">实时检测</Label>
            <div className="text-xs text-blue-400 font-medium">
              窗口ID: {windowId.slice(-8)}
            </div>
          </div>
        </div>

        {/* 摄像头控制区域 */}
        <div className="space-y-3">
          {/* 调试信息 */}
          <div className="text-xs text-slate-500">
            检测到 {availableDevices.length} 个摄像头设备
            {selectedDeviceId && `，当前选择: ${availableDevices.find(d => d.deviceId === selectedDeviceId)?.label || '未知'}`}
          </div>

          {/* 摄像头选择器和控制按钮 - 单行布局 */}
          <div className="flex items-center gap-2">
            <Select value={selectedDeviceId} onValueChange={switchCamera}>
              <SelectTrigger className="w-48 h-7 bg-slate-800 border-slate-600 text-xs">
                <SelectValue placeholder={availableDevices.length > 0 ? "选择摄像头" : "未检测到摄像头"} />
              </SelectTrigger>
              <SelectContent>
                {availableDevices.length > 0 ? (
                  availableDevices
                    .filter(device => device.deviceId && device.deviceId.trim() !== '')
                    .map(device => (
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

            <Button
              variant={isCameraOn ? "destructive" : "default"}
              size="sm"
              onClick={toggleCamera}
              className="flex items-center gap-1 text-xs px-3 py-1.5 h-7"
            >
              {isCameraOn ? <VideoOff className="h-3 w-3" /> : <Video className="h-3 w-3" />}
              {isCameraOn ? '关闭摄像头' : '开启摄像头'}
            </Button>
            <Button
              variant={isRealtimeActive ? "destructive" : "default"}
              size="sm"
              onClick={() => setIsRealtimeActive(!isRealtimeActive)}
              disabled={!isCameraOn}
              className="flex items-center gap-1 text-xs px-3 py-1.5 h-7"
            >
              {isRealtimeActive ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {isRealtimeActive ? '停止检测' : '开始检测'}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleManualCapture}
              disabled={!isCameraOn || workflowState !== 'idle'}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-xs px-3 py-1.5 h-7"
            >
              <Camera className="h-3 w-3" />
              拍照
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleForceReset}
              className="h-7 w-7 p-0 bg-red-600 hover:bg-red-700"
              title="强制复位所有检测状态，解决卡住问题"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* YOLO模型状态显示 */}
      <div className="flex items-center gap-2 mb-3">
        <Cpu className="h-4 w-4 text-blue-400" />
        <span className="text-sm text-slate-300">
          当前模型:
          {modelLoading ? (
            <span className="text-slate-500 ml-1">加载中...</span>
          ) : (
            <span className="text-blue-400 font-medium ml-1">
              {modelName}
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={refreshModel}
          className="h-6 w-6 p-0 text-slate-400 hover:text-slate-300"
        >
          <RefreshCw className={`h-3 w-3 ${modelLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* 视频显示区域 */}
      <div
        id="video-container"
        className="aspect-video bg-black rounded-lg flex items-center justify-center text-slate-500 overflow-hidden relative"
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-contain ${!isCameraOn ? 'hidden' : ''}`}
          onLoadStart={() => console.log('视频开始加载')}
          onLoadedData={() => console.log('视频数据加载完成')}
          onLoadedMetadata={() => console.log('视频元数据加载完成')}
          onCanPlay={() => console.log('视频可以播放')}
          onPlay={() => console.log('视频开始播放')}
          onPlaying={() => console.log('视频正在播放')}
          onError={(e) => console.error('视频错误:', e)}
        />
        <canvas
          ref={detectionCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
        {!isCameraOn && <CameraOff className="h-16 w-16" />}

        {/* 全屏按钮 */}
        {isCameraOn && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors z-10"
            title={isFullscreen ? "退出全屏" : "全屏显示"}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>
        )}

        {/* 视频叠加层指示器 */}
        <VideoOverlayIndicators
          isRealtimeActive={isRealtimeActive}
          isDetecting={isDetecting}
          detectionStats={detectionStats}
        />
      </div>
    </div>
  );
};
