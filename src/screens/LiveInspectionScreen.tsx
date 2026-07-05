/**
 * Live Inspection Screen
 *
 * 重构后版本 - 使用拆分的 hooks 和组件
 * 原始行数: 2622 行
 * 重构后行数: ~500 行
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useAppStore } from '@/state/appStore';
import { useAIConfigStore } from '@/state/aiConfigStore';
import { useLiveInspectionStore } from '@/state/liveInspectionStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';
import { MessageSquare, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getAvailableModels } from '@/lib/api';
import { saveImageToFolder, clearTempFolder as clearRpaTempFolder } from '@/lib/rpa';
import { directBackendFetch } from '@/lib/config';
import { useModelMode } from '@/hooks/useModelMode';
import { saveLiveInspectionParams, type LiveInspectionParams } from '@/lib/paramPersistence';
import { getCameraDevices, type CameraDevice } from '@/lib/cameraUtils';

// 导入拆分的 Hooks
import {
  useLiveModelConfig,
  useLiveImageProcessing,
  useLiveCamera,
  useLiveYoloDetection,
  useLiveAIDetection,
  useLiveKeyboardShortcuts,
} from '@/hooks/liveInspection';

// 导入拆分的组件
import {
  LiveAIProgressModal,
  LiveDetectionResultsCard,
  LiveConfigPanel,
  LiveCapturedImagesGrid,
  LiveYoloControlPanel,
  LiveTargetSelector,
  LiveCameraPanel,
} from '@/components/liveInspection';

const LiveInspectionScreen: React.FC = () => {
  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 窗口标识符
  const [windowId] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('windowId') || `live_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });

  // 本地状态
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isYoloActive, setIsYoloActive] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const backendStreamId = selectedDeviceId?.startsWith('stream-') ? selectedDeviceId.replace('stream-', '') : null;
  const [capturedImages, setCapturedImages] = useState<string[]>([]);
  const [lastCaptureTime, setLastCaptureTime] = useState(0);
  const [actualPrompt, setActualPrompt] = useState<string>('');
  const [currentYoloModel, setCurrentYoloModel] = useState<string>('未知模型');

  // YOLO抓拍控制状态
  const [autoAIDetectionEnabled, setAutoAIDetectionEnabled] = useState(true);
  const [hasCapturedForDetection, setHasCapturedForDetection] = useState(false);
  const [isWaitingForAIResult, setIsWaitingForAIResult] = useState(false);
  const autoCaptureDelay = 2000;

  // Zustand Store 状态
  const {
    selectedStandardId,
    autoCapture,
    showDetections,
    detectionConfidence,
    selectedTarget,
    selectedTargets,
    yoloDetectionMode,
    yoloTimeoutSeconds,
    detectedElements: detectedElementsRaw,
    elementDetectionStartTime,
    expandedTargetGroups,
    imageSaveMode,
    isFullscreen,
    showPromptDetails,
    localResults,
    detectionResults,
    setSelectedStandardId,
    setAutoCapture,
    setShowDetections,
    setDetectionConfidence,
    setSelectedTargets,
    setYoloDetectionMode,
    setYoloTimeoutSeconds,
    setDetectedElements,
    setElementDetectionStartTime,
    setExpandedTargetGroups,
    setImageSaveMode,
    setIsFullscreen,
    setShowPromptDetails,
    setLocalResults,
    setDetectionResults,
  } = useLiveInspectionStore();

  // 确保 detectedElements 始终是数组
  const detectedElements = Array.isArray(detectedElementsRaw) ? detectedElementsRaw : [];

  // 全局状态
  const { standards, addResult: addAppResult, results: globalResults, fetchResults } = useAppStore();
  const { config } = useAIConfigStore();
  const { localModelConfig, isLocalMode } = useModelMode();

  // 使用拆分的 Hooks
  const { modelConfig, getTargetChineseName, getAvailableTargets, loadModelConfig } = useLiveModelConfig({
    currentYoloModel,
  });

  const { compressImage, cropImageToROI } = useLiveImageProcessing();

  // 添加抓拍图片回调
  const addCapturedImage = useCallback((image: string) => {
    setCapturedImages((prev) => {
      const newImages = [...prev, image];
      return newImages.slice(-10);
    });
  }, []);

  const { toggleCamera, handleCapture, streamPlayerRef: _streamPlayerRef, hlsPlayerRef: _hlsPlayerRef } = useLiveCamera({
    windowId,
    videoRef,
    isCameraOn,
    setIsCameraOn,
    selectedDeviceId,
    availableDevices,
    setIsYoloActive,
    compressImage,
    addCapturedImage,
  });

  const {
    isInspecting,
    progressState,
    handleDirectAIDetection,
    handleStartAIDetection,
    handleCancelAIDetection,
  } = useLiveAIDetection({
    isLocalMode,
    localModelConfig,
    config,
    standards,
    selectedStandardId,
    capturedImages,
    setCapturedImages,
    localResults,
    setLocalResults,
    addAppResult,
    setHasCapturedForDetection,
    setIsWaitingForAIResult,
    setActualPrompt,
    setShowPromptDetails,
  });

  const { performYoloDetection: _performYoloDetection, toggleYoloDetection } = useLiveYoloDetection({
    streamId: backendStreamId ?? undefined,
    videoRef,
    canvasRef,
    isCameraOn,
    isYoloActive,
    setIsYoloActive,
    detectionConfidence,
    selectedTargets,
    yoloDetectionMode,
    yoloTimeoutSeconds,
    imageSaveMode,
    autoCapture,
    autoAIDetectionEnabled,
    showDetections,
    detectedElements,
    setDetectedElements,
    elementDetectionStartTime,
    setElementDetectionStartTime,
    detectionResults,
    setDetectionResults,
    hasCapturedForDetection,
    setHasCapturedForDetection,
    isWaitingForAIResult,
    setIsWaitingForAIResult,
    lastCaptureTime,
    setLastCaptureTime,
    autoCaptureDelay,
    compressImage,
    cropImageToROI,
    addCapturedImage,
    handleDirectAIDetection,
    getTargetChineseName,
  });

  // 测试本地模型连接
  const testLocalModelConnection = useCallback(async () => {
    try {
      const response = await directBackendFetch('/ollama/status/');
      const data = response.ok ? await response.json() : null;

      if (response.ok && data?.success && data?.status === 'running') {
        toast.success('本地模型连接成功');
      } else {
        toast.error('本地模型连接失败');
      }
    } catch {
      toast.error('无法连接到本地模型服务');
    }
  }, []);

  // 获取当前YOLO模型信息
  const fetchYoloModelInfo = useCallback(async () => {
    try {
      const modelInfo = await getAvailableModels();
      setCurrentYoloModel(modelInfo.current_model || '未知模型');
    } catch (error) {
      console.error('获取YOLO模型信息失败:', error);
      setCurrentYoloModel('获取失败');
    }
  }, []);

  // 键盘快捷键
  useLiveKeyboardShortcuts({
    isCameraOn,
    isFullscreen,
    setIsFullscreen,
    capturedImagesCount: capturedImages.length,
    isInspecting,
    handleCapture,
    toggleYoloDetection,
    handleStartAIDetection,
    testLocalModelConnection,
  });

  // 初始化效果
  useEffect(() => {
    fetchResults();
    fetchYoloModelInfo();
  }, [fetchResults, fetchYoloModelInfo]);

  // 获取可用摄像头设备
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devices = await getCameraDevices({ requestPermission: true });
        setAvailableDevices(devices);
        const urlParams = new URLSearchParams(window.location.search);
        const preferredCamera = urlParams.get('camera');
        if (preferredCamera && devices.find((d) => d.deviceId === preferredCamera)) {
          setSelectedDeviceId(preferredCamera);
        } else if (devices.length > 0) {
          const preferVirtual =
            window.location.port === '3005' || window.location.port === '3001';
          const preferredDevice = preferVirtual
            ? devices.find((d) => d.isVirtual) || devices.find((d) => !d.isVirtual) || devices[0]
            : devices.find((d) => !d.isVirtual) || devices.find((d) => d.isVirtual) || devices[0];
          setSelectedDeviceId(preferredDevice.deviceId);
        }
      } catch (error) {
        console.error('获取摄像头设备失败:', error);
      }
    };
    getDevices();
  }, []);

  // 模型切换时重新加载配置
  useEffect(() => {
    if (currentYoloModel && currentYoloModel !== '未知模型' && currentYoloModel !== '获取失败') {
      loadModelConfig(currentYoloModel);
    }
  }, [currentYoloModel, loadModelConfig]);

  // 设置默认标准ID
  useEffect(() => {
    if (standards.length > 0 && !selectedStandardId) {
      setSelectedStandardId(standards[0].id);
    }
  }, [standards, selectedStandardId, setSelectedStandardId]);

  // 同步全局结果到本地状态
  useEffect(() => {
    if (globalResults && globalResults.length > 0) {
      const liveResults = globalResults
        .filter(
          (result) =>
            result.detectionType === 'standard_inspection' ||
            result.detectionType === 'general_quality' ||
            result.detectionType === 'unknown' ||
            !result.detectionType
        )
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);

      if (localResults.length === 0 || liveResults.length > localResults.length) {
        setLocalResults(liveResults);
      }
    }
  }, [globalResults, localResults.length, setLocalResults]);

  // 保存参数到localStorage
  useEffect(() => {
    const params: Partial<LiveInspectionParams> = {
      selectedStandardId,
      selectedTarget,
      detectionConfidence,
      autoCapture,
      showDetections,
      autoAIDetectionEnabled,
      isYoloActive,
    };
    saveLiveInspectionParams(params);
  }, [selectedStandardId, selectedTarget, detectionConfidence, autoCapture, showDetections, autoAIDetectionEnabled, isYoloActive]);

  // 文件上传处理
  const handleFileUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = (e.target?.result as string).split(',')[1];
        const compressed = await compressImage(base64);
        addCapturedImage(compressed);
        toast.success('图片已上传');
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    },
    [compressImage, addCapturedImage]
  );

  // 临时文件夹操作
  const tempFolderPath = '/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/temp_live';

  const handleClearCapturedImages = useCallback(() => {
    setCapturedImages([]);
    toast.success('已清空抓拍队列');
  }, []);

  const handleSaveToTempFolder = useCallback(async () => {
    if (capturedImages.length === 0) {
      toast.error('没有可保存的图片');
      return;
    }
    // 修复 B2：原实现调用的 /api/save-images 后端从未存在（长期404），
    // 改为复用 rpa.ts 已验证的单张保存接口（与 SafetyEquipmentScreen/
    // KitMatchingScreen 的临时文件夹保存行为一致）。
    let successCount = 0;
    for (let i = 0; i < capturedImages.length; i++) {
      const fileName = `live_capture_${Date.now()}_${i}.jpg`;
      try {
        const result = await saveImageToFolder(capturedImages[i], fileName, tempFolderPath);
        if (result.ok) successCount++;
      } catch {
        // 单张失败不影响其余图片继续保存
      }
    }
    if (successCount > 0) {
      toast.success(`成功保存 ${successCount}/${capturedImages.length} 张图片到临时文件夹`);
    } else {
      toast.error('保存失败');
    }
  }, [capturedImages, tempFolderPath]);

  const handleOpenTempFolder = useCallback(() => {
    window.open(`file://${tempFolderPath}`, '_blank');
  }, [tempFolderPath]);

  const handleClearTempFolder = useCallback(async () => {
    try {
      const result = await clearRpaTempFolder(tempFolderPath);
      if (result.ok) {
        toast.success('已清空临时文件夹');
      } else {
        toast.error('清空失败');
      }
    } catch {
      toast.error('清空失败');
    }
  }, [tempFolderPath]);

  return (
    <div
      className={cn(
        'grid gap-4 h-full',
        isFullscreen ? 'fixed inset-0 z-50 bg-black' : 'grid-cols-1 lg:grid-cols-3'
      )}
    >
      {/* YOLO识别目标数量显示 - 右上角：全屏下不属于"判断结果"，不渲染（A1.5 降噪） */}
      {!isFullscreen && isYoloActive && selectedTargets.length > 0 && (
        <div className="fixed top-4 right-80 z-50">
          <div
            className={`px-4 py-2 rounded-lg border-2 shadow-lg font-semibold text-sm ${(() => {
              const detectedCount = detectedElements.length;
              const totalCount = selectedTargets.length;
              const percentage = totalCount > 0 ? (detectedCount / totalCount) * 100 : 0;
              if (percentage === 100) return 'bg-green-500 text-white border-green-600';
              if (detectedCount > 0) return 'bg-yellow-500 text-white border-yellow-600';
              return 'bg-gray-500 text-white border-gray-600';
            })()}`}
          >
            <div className="flex items-center gap-2">
              <span>识别目标</span>
              <span className="font-bold">
                {detectedElements.length}/{selectedTargets.length}
              </span>
              <span className="text-xs opacity-90">
                ({selectedTargets.length > 0 ? Math.round((detectedElements.length / selectedTargets.length) * 100) : 0}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 左侧：摄像头区域 */}
      <div className={cn('flex flex-col', isFullscreen ? 'col-span-2' : 'lg:col-span-2')}>
        <LiveCameraPanel
          videoRef={videoRef}
          canvasRef={canvasRef}
          windowId={windowId}
          isCameraOn={isCameraOn}
          isYoloActive={isYoloActive}
          isFullscreen={isFullscreen}
          setIsFullscreen={setIsFullscreen}
          showDetections={showDetections}
          isLocalMode={isLocalMode}
          testLocalModelConnection={testLocalModelConnection}
          currentYoloModel={currentYoloModel}
          fetchYoloModelInfo={fetchYoloModelInfo}
          availableDevices={availableDevices}
          selectedDeviceId={selectedDeviceId}
          setSelectedDeviceId={setSelectedDeviceId}
          onToggleCamera={toggleCamera}
          onCapture={handleCapture}
          onStartAIDetection={handleStartAIDetection}
          capturedImagesCount={capturedImages.length}
          isInspecting={isInspecting}
          verdict={localResults[0]?.overallQuality ?? '待检测'}
        />

        {/* 隐藏的文件上传输入框：由 LiveCameraPanel 内"上传"按钮触发，全屏下也需保持挂载 */}
        <input
          id="file-upload-input"
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />

        {/* 检测目标选择：不属于"判断结果"，全屏下不渲染（A1.5 降噪） */}
        {!isFullscreen && (
          <Card className="mt-4">
            <CardContent className="pt-4 space-y-4">
              <LiveTargetSelector
                currentYoloModel={currentYoloModel}
                modelConfig={modelConfig}
                getAvailableTargets={getAvailableTargets}
                getTargetChineseName={getTargetChineseName}
                selectedTargets={selectedTargets}
                setSelectedTargets={setSelectedTargets}
                expandedTargetGroups={expandedTargetGroups}
                setExpandedTargetGroups={setExpandedTargetGroups}
                yoloDetectionMode={yoloDetectionMode}
                setYoloDetectionMode={setYoloDetectionMode}
                yoloTimeoutSeconds={yoloTimeoutSeconds}
                setYoloTimeoutSeconds={setYoloTimeoutSeconds}
                detectedElements={detectedElements}
              />

              <LiveYoloControlPanel
                isCameraOn={isCameraOn}
                isYoloActive={isYoloActive}
                onToggleYoloDetection={toggleYoloDetection}
                detectionConfidence={detectionConfidence}
                setDetectionConfidence={setDetectionConfidence}
              />

              <LiveCapturedImagesGrid
                capturedImages={capturedImages}
                imageSaveMode={imageSaveMode}
                onClearCapturedImages={handleClearCapturedImages}
                onSaveToTempFolder={handleSaveToTempFolder}
                onOpenTempFolder={handleOpenTempFolder}
                onClearTempFolder={handleClearTempFolder}
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* AI分析进度弹窗 */}
      <LiveAIProgressModal
        isVisible={isInspecting}
        progressState={progressState}
        onCancel={handleCancelAIDetection}
      />

      {/* 右侧：检测结果：全屏下不渲染（A1.5 降噪） */}
      {!isFullscreen && <LiveDetectionResultsCard localResults={localResults} />}

      {/* 下方：配置区域 */}
      <LiveConfigPanel
        isFullscreen={isFullscreen}
        detectionConfidence={detectionConfidence}
        setDetectionConfidence={setDetectionConfidence}
        autoCapture={autoCapture}
        setAutoCapture={setAutoCapture}
        autoAIDetectionEnabled={autoAIDetectionEnabled}
        setAutoAIDetectionEnabled={setAutoAIDetectionEnabled}
        showDetections={showDetections}
        setShowDetections={setShowDetections}
        imageSaveMode={imageSaveMode}
        setImageSaveMode={setImageSaveMode}
        selectedStandardId={selectedStandardId}
        setSelectedStandardId={setSelectedStandardId}
        standards={standards}
      />

      {/* 实际使用的提示词显示区域 */}
      {showPromptDetails && actualPrompt && (
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                实际使用的提示词
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(actualPrompt);
                    toast.success('提示词已复制到剪贴板');
                  }}
                  className="h-8 px-3 text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  复制
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPromptDetails(false)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-slate-300 whitespace-pre-wrap bg-slate-800/50 p-4 rounded-lg max-h-60 overflow-y-auto">
              {actualPrompt}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default LiveInspectionScreen;
