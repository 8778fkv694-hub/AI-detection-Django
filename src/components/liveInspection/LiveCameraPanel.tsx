/**
 * Live Camera Panel Component
 *
 * 用途：摄像头控制区域
 * 功能：摄像头选择器、设备信息显示、控制按钮组、视频显示区域
 * 使用位置：LiveInspectionScreen
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Badge } from '@/components/ui/Badge';
import {
  Camera,
  CameraOff,
  Sparkles,
  Aperture,
  Keyboard,
  Zap,
  Box,
  Package,
  Maximize,
  Minimize,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ModelModeSwitch from '@/components/ModelModeSwitch';
import ModelSelector from '@/components/ModelSelector';
import { useVideoAspect } from '@/hooks/useVideoAspect';
import type { CameraDevice } from '@/lib/cameraUtils';

export interface LiveCameraPanelProps {
  /** 视频元素引用 */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 画布元素引用 */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** 窗口ID */
  windowId: string;
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 是否YOLO激活 */
  isYoloActive: boolean;
  /** 是否全屏 */
  isFullscreen: boolean;
  /** 设置全屏 */
  setIsFullscreen: (value: boolean) => void;
  /** 是否显示检测框 */
  showDetections: boolean;
  /** 是否本地模式 */
  isLocalMode: boolean;
  /** 测试本地模型连接 */
  testLocalModelConnection: () => void;
  /** 当前YOLO模型 */
  currentYoloModel: string;
  /** 获取YOLO模型信息 */
  fetchYoloModelInfo: () => Promise<void>;
  /** 可用设备列表 */
  availableDevices: CameraDevice[];
  /** 选中的设备ID */
  selectedDeviceId: string;
  /** 设置选中的设备ID */
  setSelectedDeviceId: (deviceId: string) => void;
  /** 切换摄像头回调 */
  onToggleCamera: () => void;
  /** 手动抓拍回调 */
  onCapture: () => void;
  /** 开始AI检测回调 */
  onStartAIDetection: () => void;
  /** 抓拍图片数量 */
  capturedImagesCount: number;
  /** 是否正在检测 */
  isInspecting: boolean;
}

export const LiveCameraPanel: React.FC<LiveCameraPanelProps> = ({
  videoRef,
  canvasRef,
  windowId,
  isCameraOn,
  isYoloActive,
  isFullscreen,
  setIsFullscreen,
  showDetections,
  isLocalMode,
  testLocalModelConnection,
  currentYoloModel,
  fetchYoloModelInfo,
  availableDevices,
  selectedDeviceId,
  setSelectedDeviceId,
  onToggleCamera,
  onCapture,
  onStartAIDetection,
  capturedImagesCount,
  isInspecting,
}) => {
  const videoAspect = useVideoAspect(videoRef);
  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Camera className="h-5 w-5" />
              实时检测与抓拍
              {isYoloActive && (
                <Badge variant="outline" className="text-green-400 border-green-400 text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  检测中
                </Badge>
              )}
            </CardTitle>
            {/* 简化的模型模式切换 */}
            <div className="flex items-center gap-3">
              <ModelModeSwitch showStatus={false} />
              {isLocalMode && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={testLocalModelConnection}
                  className="h-7 px-3 text-xs text-slate-400 hover:text-slate-300"
                >
                  测试连接
                </Button>
              )}
            </div>
            {/* YOLO模型信息显示 */}
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Box className="h-4 w-4" />
              <span>YOLO模型:</span>
              <Badge variant="outline" className="text-xs">
                {currentYoloModel}
              </Badge>
            </div>
            {/* YOLO 模型选择器 */}
            <ModelSelector
              label=""
              placeholder="切换检测模型"
              showActiveBadge={false}
              showModelCount={true}
              onModelChange={async (_modelId) => {
                await fetchYoloModelInfo();
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-slate-400">
              <Keyboard size={12} />
              <span className="ml-1">空格=抓拍 / A=AI分析 / F=全屏</span>
            </div>
            {isCameraOn && (
              <Button variant="outline" size="sm" onClick={() => setIsFullscreen(!isFullscreen)}>
                {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-grow flex flex-col space-y-3">
        {/* 视频显示区域 */}
        <div
          className={cn(
            'bg-black rounded-lg flex items-center justify-center text-slate-500 overflow-hidden relative',
            isFullscreen ? 'flex-1' : 'aspect-video'
          )}
          style={!isFullscreen && videoAspect ? { aspectRatio: String(videoAspect) } : undefined}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className={cn('w-full h-full object-contain', { hidden: !isCameraOn })}
          />
          <canvas
            ref={canvasRef}
            className={cn(
              'absolute inset-0 w-full h-full object-contain pointer-events-none z-10',
              { hidden: !isCameraOn || !showDetections || !isYoloActive }
            )}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: 10,
            }}
          />
          {!isCameraOn && <CameraOff className="h-16 w-16" />}
        </div>

        {/* 摄像头控制区域 */}
        <div className="space-y-2">
          {/* 窗口信息和调试信息 */}
          <div className="text-xs text-slate-500 space-y-1">
            <div className="font-medium text-blue-400">窗口ID: {windowId.slice(-8)}</div>
            <div>
              检测到 {availableDevices.length} 个摄像头设备
              {selectedDeviceId &&
                `，当前选择: ${availableDevices.find((d) => d.deviceId === selectedDeviceId)?.label || '未知'}`}
            </div>
          </div>

          {/* 摄像头选择器 */}
          <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
            <SelectTrigger className="w-full h-8 bg-slate-800 border-slate-600">
              <SelectValue
                placeholder={availableDevices.length > 0 ? '选择摄像头' : '未检测到摄像头'}
              />
            </SelectTrigger>
            <SelectContent>
              {availableDevices.length > 0 ? (
                availableDevices
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
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={onToggleCamera}
              variant={isCameraOn ? 'destructive' : 'default'}
              size="sm"
            >
              <Camera className="mr-1 h-3 w-3" />
              {isCameraOn ? '关闭' : '开启'}
            </Button>
            <Button onClick={onCapture} disabled={!isCameraOn} size="sm">
              <Aperture className="mr-1 h-3 w-3" />
              抓拍
            </Button>
            <Button
              onClick={() => document.getElementById('file-upload-input')?.click()}
              variant="outline"
              size="sm"
            >
              <Package className="mr-1 h-3 w-3" />
              上传
            </Button>
            <Button
              onClick={onStartAIDetection}
              disabled={capturedImagesCount === 0 || isInspecting}
              variant="default"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Sparkles className="mr-1 h-3 w-3" />
              AI分析
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
