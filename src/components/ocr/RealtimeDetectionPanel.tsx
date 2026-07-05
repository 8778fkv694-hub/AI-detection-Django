/**
 * RealtimeDetectionPanel Component
 *
 * 用途：实时检测控制面板
 * 功能：摄像头控制、YOLO模型显示、视频显示区域、状态指示器
 * 使用位置：OCRDetectionScreen
 */

import React, { useMemo } from 'react';
import { Video, VideoOff, Play, Square, Pause, Camera, RotateCcw, Cpu, RefreshCw, CameraOff, Maximize, Minimize } from 'lucide-react';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import ModelSelector from '@/components/ModelSelector';
import { VideoOverlayIndicators } from '@/components/ocr/VideoOverlayIndicators';
import { FullscreenVerdictBadge, type FullscreenVerdict } from '@/components/detection/FullscreenVerdictBadge';
import { useVideoAspect } from '@/hooks/useVideoAspect';
import type { CameraDevice } from '@/lib/cameraUtils';
import type { TestResult } from '@/types/ocr';
import type { InspectionResult } from '@/types';

type WorkflowState = 'idle' | 'capturing' | 'searching_best_frame' | 'processing' | 'waiting_for_approval' | 'completed';
type MatchStatus = 'none' | 'qualified' | 'unqualified';

// 使用 InspectionResult 作为 AI 分析结果类型，保持与 useFusionAI 返回类型一致
type AIAnalysisResult = InspectionResult;

interface DetectionStats {
  totalDetections: number;
  qualifiedCount: number;
  unqualifiedCount: number;
  personDetections: number;
  equipmentDetections: number;
  lastDetectionTime: string | null;
}

export interface RealtimeDetectionPanelProps {
  /** 窗口ID */
  windowId: string;
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 是否实时检测中 */
  isRealtimeActive: boolean;
  /** 是否暂停 */
  isPaused: boolean;
  /** 是否全屏 */
  isFullscreen: boolean;
  /** 是否正在检测 */
  isDetecting: boolean;
  /** 工作流状态 */
  workflowState: WorkflowState;
  /** 匹配状态 */
  matchStatus: MatchStatus;
  /** 融合模式是否启用 */
  fusionModeEnabled: boolean;
  /** AI分析结果 */
  aiAnalysisResult: AIAnalysisResult | null;
  /** OCR结果 */
  ocrResult: TestResult | null;
  /** 可用摄像头列表 */
  availableDevices: CameraDevice[];
  /** 选中的摄像头ID */
  selectedDeviceId: string;
  /** 模型名称 */
  modelName: string;
  /** 模型是否加载中 */
  modelLoading: boolean;
  /** 检测统计 */
  detectionStats: DetectionStats;
  /** 视频ref */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 虚拟流显示canvas ref */
  previewCanvasRef?: React.RefObject<HTMLCanvasElement>;
  /** 检测canvas ref */
  detectionCanvasRef: React.RefObject<HTMLCanvasElement>;

  /** 切换摄像头 */
  switchCamera: (deviceId: string) => void;
  /** 切换摄像头开关 */
  toggleCamera: () => void;
  /** 设置实时检测状态 */
  setIsRealtimeActive: (active: boolean) => void;
  /** 切换暂停 */
  togglePause: () => void;
  /** 手动抓拍 */
  handleManualCapture: () => void;
  /** 强制复位 */
  handleForceReset: () => void;
  /** 刷新模型 */
  refreshModel: () => void;
  /** 切换全屏 */
  toggleFullscreen: () => void;
  /** 加载模型配置 */
  loadModelConfig: (modelId: string) => void;
  /** 模型切换回调（用于持久化） */
  onModelSwitch?: (modelId: string) => void;
}

export const RealtimeDetectionPanel: React.FC<RealtimeDetectionPanelProps> = ({
  windowId,
  isCameraOn,
  isRealtimeActive,
  isPaused,
  isFullscreen,
  isDetecting,
  workflowState,
  matchStatus,
  fusionModeEnabled,
  aiAnalysisResult,
  ocrResult,
  availableDevices,
  selectedDeviceId,
  modelName,
  modelLoading,
  detectionStats,
  videoRef,
  previewCanvasRef,
  detectionCanvasRef,
  switchCamera,
  toggleCamera,
  setIsRealtimeActive,
  togglePause,
  handleManualCapture,
  handleForceReset,
  refreshModel,
  toggleFullscreen,
  loadModelConfig,
  onModelSwitch,
}) => {
  const videoAspect = useVideoAspect(videoRef);
  const selectedDevice = availableDevices.find((device) => device.deviceId === selectedDeviceId);
  const isVirtualStream = selectedDeviceId.startsWith('stream-');
  const virtualStreamPlayMode = selectedDevice?.streamSource?.play_mode;
  const isJpegVirtualStream = isVirtualStream && virtualStreamPlayMode === 'jpg';
  const showVideoElement = isCameraOn && !isJpegVirtualStream;
  const showPreviewCanvas = isCameraOn && isJpegVirtualStream;

  // A1.2: 全屏判定文案，逻辑原样从内联 JSX 上移，行为不变
  const fullscreenVerdict: FullscreenVerdict = useMemo(() => {
    if (fusionModeEnabled && aiAnalysisResult) {
      const ocrQualified = matchStatus === 'qualified';
      const llmQualified = aiAnalysisResult.overallQuality === '合格';
      const barcodeQualified = !ocrResult?.barcode_analysis?.enabled || ocrResult?.barcode_analysis?.overall_match;
      const finalQualified = ocrQualified && llmQualified && barcodeQualified;
      return finalQualified ? '合格' : '存疑';
    }
    if (workflowState === 'processing' || workflowState === 'capturing') return '检测中...';
    if (matchStatus === 'qualified') return '合格';
    if (matchStatus === 'unqualified') return '存疑';
    return '待检测';
  }, [fusionModeEnabled, aiAnalysisResult, matchStatus, ocrResult, workflowState]);

  return (
    <div className="p-3 sm:p-4 bg-slate-800/50 rounded-lg border border-slate-600">
      <div className="space-y-2 sm:space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <Label className="text-xs sm:text-sm font-medium">实时检测</Label>
            <div className="text-xs text-blue-400 font-medium">
              窗口ID: {windowId.slice(-8)}
            </div>
          </div>
        </div>

        {/* YOLO 模型选择器 */}
        <ModelSelector
          label=""
          placeholder="切换检测模型"
          showActiveBadge={false}
          showModelCount={true}
          onModelChange={async (modelId) => {
            console.log('模型已切换:', modelId);
            // 🔧 修复：优先使用 onModelSwitch 持久化（useEffect 会自动加载）
            // 如果没有传递 onModelSwitch，则直接加载配置（向后兼容）
            if (onModelSwitch) {
              onModelSwitch(modelId);
            }
            await loadModelConfig(modelId);
          }}
        />

        {/* 摄像头控制区域 */}
        <div className="space-y-3">
          {/* 摄像头选择器和控制按钮 - 响应式布局 */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={selectedDeviceId} onValueChange={switchCamera}>
              <SelectTrigger className="w-full sm:w-24 h-7 bg-slate-800 border-slate-600 text-xs">
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
              className="flex items-center gap-1 text-xs px-2 sm:px-3 py-1.5 h-7 whitespace-nowrap"
            >
              {isCameraOn ? <VideoOff className="h-3 w-3" /> : <Video className="h-3 w-3" />}
              <span className="hidden sm:inline">{isCameraOn ? '关闭' : '开启'}</span>
              <span className="sm:hidden">{isCameraOn ? '关闭' : '开启'}</span>
            </Button>
            <Button
              variant={isRealtimeActive ? "destructive" : "default"}
              size="sm"
              onClick={() => setIsRealtimeActive(!isRealtimeActive)}
              disabled={!isCameraOn}
              className="flex items-center gap-1 text-xs px-2 sm:px-3 py-1.5 h-7 whitespace-nowrap"
            >
              {isRealtimeActive ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              <span className="hidden sm:inline">{isRealtimeActive ? '停止' : '检测'}</span>
              <span className="sm:hidden">{isRealtimeActive ? '停止' : '开始'}</span>
            </Button>
            {/* 暂停按钮 - 仅在检测运行时显示 */}
            {isRealtimeActive && (
              <Button
                variant={isPaused ? "default" : "outline"}
                size="sm"
                onClick={togglePause}
                className={`flex items-center gap-1 text-xs px-2 sm:px-3 py-1.5 h-7 whitespace-nowrap ${isPaused ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : ''}`}
                title={isPaused ? '继续检测' : '暂停检测'}
              >
                {isPaused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
                <span className="hidden sm:inline">{isPaused ? '继续' : '暂停'}</span>
              </Button>
            )}
            <Button
              variant="default"
              size="sm"
              onClick={handleManualCapture}
              disabled={!isCameraOn || workflowState !== 'idle' || isPaused}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-xs px-2 sm:px-3 py-1.5 h-7"
            >
              <Camera className="h-3 w-3" />
              拍照
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleForceReset}
              className="h-7 w-7 p-0 bg-red-600 hover:bg-red-700 shrink-0"
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

      {/* 视频显示区域：容器比例跟随视频原始分辨率（规范化坐标系），避免竖屏下检测框被 CSS 拉伸变形 */}
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
          className={`w-full h-full object-contain ${showVideoElement ? '' : 'hidden'}`}
          onLoadStart={() => console.log('视频开始加载')}
          onLoadedData={() => console.log('视频数据加载完成')}
          onLoadedMetadata={() => console.log('视频元数据加载完成')}
          onCanPlay={() => console.log('视频可以播放')}
          onPlay={() => console.log('视频开始播放')}
          onPlaying={() => console.log('视频正在播放')}
          onError={(e) => console.error('视频错误:', e)}
        />
        <canvas
          ref={previewCanvasRef}
          className={`absolute inset-0 w-full h-full object-contain z-10 ${showPreviewCanvas ? '' : 'hidden'}`}
        />
        <canvas
          ref={detectionCanvasRef}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none z-20"
        />
        {!isCameraOn && <CameraOff className="h-16 w-16" />}

        {/* 暂停状态指示器 */}
        {isCameraOn && isRealtimeActive && isPaused && (
          <div className="absolute top-2 left-2 z-30 bg-yellow-600/90 backdrop-blur-sm px-3 py-1.5 rounded-md flex items-center gap-2">
            <Pause className="h-4 w-4 text-white" />
            <span className="text-sm font-medium text-white">已暂停</span>
          </div>
        )}

        {/* 检测中状态指示器 */}
        {isCameraOn && isRealtimeActive && !isPaused && (
          <div className="absolute top-2 left-2 z-30 bg-green-600/90 backdrop-blur-sm px-3 py-1.5 rounded-md flex items-center gap-2">
            <div className="h-2 w-2 bg-white rounded-full animate-pulse" />
            <span className="text-sm font-medium text-white">检测中</span>
          </div>
        )}

        {/* 全屏时显示的右上角状态 */}
        {isCameraOn && isFullscreen && <FullscreenVerdictBadge verdict={fullscreenVerdict} />}

        {/* 全屏按钮 */}
        {isCameraOn && (
          <button
            onClick={toggleFullscreen}
            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors z-40"
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

export default RealtimeDetectionPanel;
