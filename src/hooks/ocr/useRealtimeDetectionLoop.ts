/**
 * Realtime Detection Loop Hook
 *
 * 用途：管理实时检测的完整循环逻辑
 * 功能：performRealtimeDetection 函数、帧采集、检测循环 useEffect
 * 提取自：OCRDetectionScreen.tsx (原第 1132-2018 行)
 */

import { useCallback, useEffect, useRef } from 'react';
import { yoloDetectBackend, type BackendYoloDetection } from '@/lib/api';
import { apiFetch } from '@/lib/config';
import { calculateSharpnessAsync } from '@/lib/imageQuality/sharpnessCalculator';
import { drawDetections } from '@/lib/ocr/detectionDrawer';
import type { BestROIData } from '@/hooks/ocr/useROIProcessor';

export interface UseRealtimeDetectionLoopOptions {
  // 实时检测状态
  isRealtimeActive: boolean;
  isCameraOn: boolean;
  workflowState: string;
  isPaused: boolean;
  autoCapture: boolean;
  detectionInterval: number;
  detectionConfidence: number;
  selectedTargets: string[];
  imageSaveMode: string;
  captureDelaySeconds: number;
  batchProcessingMode: string;
  requireQualifiedConfirmation: boolean;

  // 模型配置
  currentModelId: string | null;
  modelConfig: any;

  // Refs
  videoRef: React.RefObject<HTMLVideoElement>;
  detectionCanvasRef: React.RefObject<HTMLCanvasElement>;
  detectedElementsRef: React.MutableRefObject<string[]>;
  elementDetectionStartTimeRef: React.MutableRefObject<number | null>;

  // 来自 useRealtimeDetection 的 refs
  isDetectingRef: React.MutableRefObject<boolean>;
  isPausedRef: React.MutableRefObject<boolean>;
  detectionQueueRef: React.MutableRefObject<Array<() => Promise<void>>>;
  isProcessingQueueRef: React.MutableRefObject<boolean>;
  historyDetectionsRef: React.MutableRefObject<Map<string, BackendYoloDetection>>;
  debounceStartTimeRef: React.MutableRefObject<number | null>;
  debounceSeconds: number;

  // 来自 useROIProcessor 的方法和 refs
  roiProcessorBestROIsRef: React.MutableRefObject<Map<string, BestROIData>>;
  batchExtractROIs: (detections: BackendYoloDetection[], dataUrl: string, validTargets: string[]) => void;
  captureAndEvaluateFrame: (
    videoRef: React.RefObject<HTMLVideoElement>,
    frameDataUrl: string,
    detections: BackendYoloDetection[],
    validTargets: string[],
    localBestROIs: Map<string, BestROIData>
  ) => Promise<void>;
  mergeROIs: (
    delayROIs: Map<string, BestROIData>,
    realtimeROIs: Map<string, BestROIData>
  ) => Map<string, BestROIData>;

  // 来自 useDetectionMode 的方法
  evaluateDetections: (
    detections: BackendYoloDetection[],
    validSelectedTargets: string[],
    currentDetectedElements: string[],
    elementDetectionStartTime: number | null,
    historyDetectionsRef: React.MutableRefObject<Map<string, BackendYoloDetection>>
  ) => { shouldTriggerCapture: boolean; shouldResetDetection: boolean; updatedDetectedElements: string[]; updatedStartTime: number | null };
  evaluateDebounce: (
    shouldTriggerCapture: boolean,
    workflowState: string,
    autoCapture: boolean,
    debounceStartTime: number | null,
    detectedLabels: string[]
  ) => { shouldActuallyTrigger: boolean; updatedDebounceStartTime: number | null };

  // 来自 useBatchProcessingManager 的方法
  batchManager: {
    cacheROI: (label: string, imageDataUrl: string, bbox: any, detection: any) => Promise<any>;
    triggerBatchProcessing: (force: boolean) => Promise<void>;
  } | null;

  // 图像处理函数
  stitchROISnapshots: (roiSnapshots: Array<{ imageDataUrl: string; label: string }>) => Promise<string | null>;
  stitchMultipleROIs: (base64Image: string, detections: any[]) => Promise<string>;
  captureFrameData: () => { dataUrl: string; base64: string } | null;
  processCapturedImage: (imageBase64: string, imageFile: File, source: string) => Promise<{ finalMatchStatus: string }>;

  // 非持久化的 store 状态
  detectedElements: string[];
  elementDetectionStartTime: number | null;
  detectionStats: any;
  nonGridTargets: string[];

  // 并行工装码识别
  enableParallelQrDetection?: boolean;
  qrDetectIntervalMs?: number; // 默认3000ms
  fixtureQrInput?: string;
  fixtureQrPrefixes?: string[];
  fixtureQrPattern?: string;
  onFixtureQrDetected?: (qrCode: string) => void;

  // State setters
  setIsDetecting: (value: boolean) => void;
  setDetectedElements: (value: string[]) => void;
  setElementDetectionStartTime: (value: number | null) => void;
  setDetectionStats: (value: any) => void;
  setCurrentSharpness: (value: number) => void;
  setIsInPostDetectionDelay: (value: boolean) => void;
  setWorkflowState: (value: string) => void;
  setSelectedImage: (value: File | null) => void;
  setImagePreview: (value: string) => void;
  setIsWaitingForSpace: (value: boolean) => void;
  setMatchStatus: (value: 'none' | 'qualified' | 'unqualified') => void;
  setWorkflowResult: (value: any) => void;
  setAiAnalysisResult: (value: any) => void;
  setFinalResult: (value: 'qualified' | 'unqualified' | 'none') => void;
}

export const useRealtimeDetectionLoop = (options: UseRealtimeDetectionLoopOptions) => {
  const {
    isRealtimeActive, isCameraOn, workflowState, isPaused, autoCapture,
    detectionInterval, detectionConfidence, selectedTargets, imageSaveMode,
    captureDelaySeconds, batchProcessingMode, requireQualifiedConfirmation,
    currentModelId, modelConfig,
    videoRef, detectionCanvasRef, detectedElementsRef, elementDetectionStartTimeRef,
    isDetectingRef, isPausedRef, detectionQueueRef, isProcessingQueueRef,
    historyDetectionsRef, debounceStartTimeRef, debounceSeconds,
    roiProcessorBestROIsRef, batchExtractROIs, captureAndEvaluateFrame, mergeROIs,
    evaluateDetections, evaluateDebounce,
    batchManager,
    stitchROISnapshots, stitchMultipleROIs, captureFrameData, processCapturedImage,
    detectedElements, elementDetectionStartTime, detectionStats, nonGridTargets,
    enableParallelQrDetection, qrDetectIntervalMs, fixtureQrInput, fixtureQrPrefixes, fixtureQrPattern,
    onFixtureQrDetected,
    setIsDetecting, setDetectedElements, setElementDetectionStartTime,
    setDetectionStats, setCurrentSharpness, setIsInPostDetectionDelay,
    setWorkflowState, setSelectedImage, setImagePreview,
    setIsWaitingForSpace, setMatchStatus, setWorkflowResult,
    setAiAnalysisResult, setFinalResult,
  } = options;

  // P0修复：使用ref保存performRealtimeDetection函数，避免setInterval闭包问题
  const performRealtimeDetectionRef = useRef<(() => Promise<void>) | null>(null);
  const handleCaptureWorkflowRef = useRef<((validSelectedTargets: string[], currentDataUrl: string, currentBase64: string) => Promise<void>) | null>(null);

  // 帧采集优化：在防抖期间独立采集帧
  const frameCollectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastDetectionsRef = useRef<BackendYoloDetection[]>([]);
  const isFrameCollectionActiveRef = useRef<boolean>(false);

  // ========== 帧采集逻辑 ==========

  const stopFrameCollection = useCallback(() => {
    if (frameCollectionIntervalRef.current) {
      clearInterval(frameCollectionIntervalRef.current);
      frameCollectionIntervalRef.current = null;
      isFrameCollectionActiveRef.current = false;
      console.log('🛑 帧采集已停止');
    }
  }, []);

  const startFrameCollection = useCallback(() => {
    if (isFrameCollectionActiveRef.current) return;
    if (!videoRef.current || imageSaveMode !== 'roi' || lastDetectionsRef.current.length === 0) return;

    isFrameCollectionActiveRef.current = true;
    console.log('🎬 启动独立帧采集（间隔100ms）');

    const FRAME_COLLECTION_INTERVAL = 100;

    frameCollectionIntervalRef.current = setInterval(() => {
      if (!isFrameCollectionActiveRef.current || !videoRef.current || workflowState !== 'idle') {
        stopFrameCollection();
        return;
      }

      const detections = lastDetectionsRef.current;
      if (detections.length === 0) return;

      const validTargets = selectedTargets.filter(target => target != null && typeof target === 'string');
      if (validTargets.length === 0) return;

      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = videoRef.current.videoWidth;
      frameCanvas.height = videoRef.current.videoHeight;
      const frameCtx = frameCanvas.getContext('2d');
      if (!frameCtx || !videoRef.current) return;

      frameCtx.drawImage(videoRef.current, 0, 0, frameCanvas.width, frameCanvas.height);
      const frameDataUrl = frameCanvas.toDataURL('image/jpeg', 0.95);

      batchExtractROIs(detections, frameDataUrl, validTargets);

      if (Math.random() < 0.1) {
        console.log('📸 独立帧采集中...（复用检测框位置）');
      }
    }, FRAME_COLLECTION_INTERVAL);
  }, [imageSaveMode, workflowState, batchExtractROIs, selectedTargets, stopFrameCollection, videoRef]);

  // ========== 并行工装码二维码识别 ==========
  const qrDetectingRef = useRef(false);
  const lastQrDetectTimeRef = useRef(0);
  const fixtureQrInputRef = useRef(fixtureQrInput);
  useEffect(() => { fixtureQrInputRef.current = fixtureQrInput; }, [fixtureQrInput]);

  const effectiveQrInterval = qrDetectIntervalMs ?? 3000;

  const fireParallelQrDetection = useCallback((base64Data: string) => {
    if (!enableParallelQrDetection || !onFixtureQrDetected) return;
    if (fixtureQrInputRef.current) return; // 已有工装码，无需再检
    if (qrDetectingRef.current) return;
    const now = Date.now();
    if (now - lastQrDetectTimeRef.current < effectiveQrInterval) return;

    qrDetectingRef.current = true;
    lastQrDetectTimeRef.current = now;

    // 后台异步调用，不阻塞 YOLO 循环
    apiFetch('/wechat-qr/detect/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: base64Data }),
    })
      .then(r => r.ok ? r.json() : null)
      .then(result => {
        if (!result?.success || fixtureQrInputRef.current) return;
        const codes: string[] = (result.results || []).map((r: any) => r.data || r.text).filter(Boolean);
        if (codes.length === 0) return;

        // 如果配置了前缀/正则，筛选匹配的
        const prefixes = (fixtureQrPrefixes || []).map(p => p.toUpperCase());
        let regex: RegExp | null = null;
        if (fixtureQrPattern) {
          try { regex = new RegExp(fixtureQrPattern); } catch { /* ignore */ }
        }

        const matched = codes.filter(code => {
          const upper = code.toUpperCase();
          if (prefixes.length > 0 && !prefixes.some(p => upper.startsWith(p))) return false;
          if (regex && !regex.test(code)) return false;
          return true;
        });

        if (matched.length === 1) {
          console.log('🔗 并行QR识别成功:', matched[0]);
          onFixtureQrDetected(matched[0]);
        } else if (!prefixes.length && !regex && codes.length === 1) {
          // 未配置规则且只有一个码，直接采用
          console.log('🔗 并行QR识别（唯一码）:', codes[0]);
          onFixtureQrDetected(codes[0]);
        }
      })
      .catch(() => { /* 静默失败，不影响主流程 */ })
      .finally(() => { qrDetectingRef.current = false; });
  }, [enableParallelQrDetection, onFixtureQrDetected, fixtureQrPrefixes, fixtureQrPattern]);

  // ========== 主检测函数 ==========

  const performRealtimeDetection = useCallback(async () => {
    if (!isRealtimeActive || !videoRef.current || !detectionCanvasRef.current) return;
    if (isPausedRef.current) return;
    if (isDetectingRef.current) return;
    if (workflowState !== 'idle') {
      console.log('工作流状态不是空闲，跳过检测:', workflowState);
      return;
    }

    const executeDetection = async () => {
      if (isDetectingRef.current) return;

      isDetectingRef.current = true;
      setIsDetecting(true);

      try {
        if (workflowState !== 'idle') {
          console.log('检测到工作流状态已变化，跳过检测:', workflowState);
          isDetectingRef.current = false;
          setIsDetecting(false);
          return;
        }

        if (!videoRef.current) {
          isDetectingRef.current = false;
          setIsDetecting(false);
          return;
        }

        const validSelectedTargets = selectedTargets.filter(target => target != null && typeof target === 'string');

        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          isDetectingRef.current = false;
          setIsDetecting(false);
          return;
        }

        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const base64Data = dataUrl.split(',')[1];

        if (!base64Data) {
          isDetectingRef.current = false;
          setIsDetecting(false);
          return;
        }

        // 并行触发工装码识别（不阻塞YOLO）
        fireParallelQrDetection(base64Data);

        // 执行YOLO检测
        const detectionType = (modelConfig?.detection_type as 'cleanroom_ppe' | 'kit_matching' | 'ocr_inspection' | 'ocr_fusion_inspection' | 'general_quality' | undefined) || 'ocr_inspection';
        const detections = await yoloDetectBackend(base64Data, detectionConfidence, {
          model_id: currentModelId || undefined,
          detection_type: detectionType,
        });

        // 保存检测结果供帧采集使用
        lastDetectionsRef.current = detections.filter(d =>
          validSelectedTargets.includes(d.label) && d.confidence >= detectionConfidence
        );

        // 更新检测统计
        const personDetections = detections.filter(d => d.label === 'person').length;
        const equipmentDetections = detections.filter(d => d.label !== 'person').length;
        setDetectionStats({
          totalDetections: detections.length,
          qualifiedCount: detectionStats.qualifiedCount,
          unqualifiedCount: detectionStats.unqualifiedCount,
          personDetections,
          equipmentDetections,
          lastDetectionTime: detectionStats.lastDetectionTime
        });

        // 绘制检测结果到画布上
        if (detectionCanvasRef.current && videoRef.current) {
          const videoWidth = videoRef.current.videoWidth;
          const videoHeight = videoRef.current.videoHeight;
          if (videoWidth > 0 && videoHeight > 0) {
            if (detectionCanvasRef.current.width !== videoWidth || detectionCanvasRef.current.height !== videoHeight) {
              detectionCanvasRef.current.width = videoWidth;
              detectionCanvasRef.current.height = videoHeight;
              console.log('画布尺寸更新:', videoWidth, 'x', videoHeight);
            }
            if (detectionCanvasRef.current) {
              drawDetections(detections, detectionCanvasRef.current);
            }
          } else {
            console.log('视频尺寸无效，跳过绘制检测结果');
          }
        }

        // ROI模式累积保存
        if (imageSaveMode === 'roi') {
          batchExtractROIs(detections, dataUrl, validSelectedTargets);
        }

        // 使用 useDetectionMode hook 评估检测结果
        const currentDetectedElements = detectedElementsRef.current.length > 0
          ? detectedElementsRef.current
          : (detectedElements.length > 0 ? detectedElements : []);

        const detectionResult = evaluateDetections(
          detections,
          validSelectedTargets,
          currentDetectedElements,
          elementDetectionStartTimeRef.current,
          historyDetectionsRef
        );

        // 更新检测状态
        if (detectionResult.updatedDetectedElements.length > 0 &&
          detectionResult.updatedDetectedElements.length !== currentDetectedElements.length) {
          setDetectedElements(detectionResult.updatedDetectedElements);
          detectedElementsRef.current = detectionResult.updatedDetectedElements;
        }

        if (detectionResult.updatedStartTime !== null &&
          detectionResult.updatedStartTime !== elementDetectionStartTimeRef.current) {
          setElementDetectionStartTime(detectionResult.updatedStartTime);
          elementDetectionStartTimeRef.current = detectionResult.updatedStartTime;
        }

        // 重置检测状态
        if (detectionResult.shouldResetDetection) {
          setDetectedElements([]);
          detectedElementsRef.current = [];
          setElementDetectionStartTime(null);
          elementDetectionStartTimeRef.current = null;
          historyDetectionsRef.current.clear();
          debounceStartTimeRef.current = null;
          stopFrameCollection();
          lastDetectionsRef.current = [];
          console.log('🔍 检测超时，重置计时器和已检测元素');
        }

        // 获取检测到的标签
        const targetDetections = detections.filter(detection =>
          validSelectedTargets.includes(detection.label) && detection.confidence >= detectionConfidence
        );
        const detectedLabels = targetDetections.map(d => d.label);

        // 评估防抖
        const debounceResult = evaluateDebounce(
          detectionResult.shouldTriggerCapture,
          workflowState,
          autoCapture,
          debounceStartTimeRef.current,
          detectedLabels
        );

        // 更新防抖状态
        if (debounceResult.updatedDebounceStartTime !== debounceStartTimeRef.current) {
          const wasNotInDebounce = debounceStartTimeRef.current === null;
          const isNowInDebounce = debounceResult.updatedDebounceStartTime !== null;
          if (wasNotInDebounce && isNowInDebounce) {
            startFrameCollection();
          }
          debounceStartTimeRef.current = debounceResult.updatedDebounceStartTime;
        }

        if (debounceResult.shouldActuallyTrigger) {
          stopFrameCollection();
          console.log(`🎯 防抖完成，开始工作流`);

          // ========== 抓拍与图像处理 ==========
          await handleCaptureWorkflowRef.current?.(
            validSelectedTargets, dataUrl, base64Data
          );
        }

      } catch (error) {
        console.error('实时检测失败:', error);
        setWorkflowState('idle');
        setMatchStatus('none');
        setWorkflowResult(null);
        setAiAnalysisResult(null);
        setFinalResult('none');
      } finally {
        isDetectingRef.current = false;
        setIsDetecting(false);

        if (detectionQueueRef.current.length > 0) {
          const nextTask = detectionQueueRef.current.shift();
          if (nextTask) {
            setTimeout(() => { nextTask(); }, 0);
          }
        } else {
          isProcessingQueueRef.current = false;
        }
      }
    };

    if (isProcessingQueueRef.current || isDetectingRef.current) {
      detectionQueueRef.current.push(executeDetection);
      if (!isProcessingQueueRef.current) {
        isProcessingQueueRef.current = true;
      }
      return;
    }

    isProcessingQueueRef.current = true;
    executeDetection();
  }, [
    autoCapture,
    debounceSeconds,
    detectedElements,
    detectionCanvasRef,
    detectionConfidence,
    detectionQueueRef,
    detectionStats,
    detectedElementsRef,
    elementDetectionStartTimeRef,
    evaluateDebounce,
    evaluateDetections,
    historyDetectionsRef,
    imageSaveMode,
    isDetectingRef,
    isPausedRef,
    isProcessingQueueRef,
    isRealtimeActive,
    modelConfig,
    selectedTargets,
    setAiAnalysisResult,
    setDetectedElements,
    setDetectionStats,
    setElementDetectionStartTime,
    setFinalResult,
    setIsDetecting,
    setMatchStatus,
    setWorkflowResult,
    setWorkflowState,
    startFrameCollection,
    stopFrameCollection,
    videoRef,
    workflowState,
  ]);

  // ========== 抓拍工作流（从 performRealtimeDetection 中拆出的内联逻辑） ==========

  const handleCaptureWorkflow = useCallback(async (
    validSelectedTargets: string[],
    _currentDataUrl: string,
    _currentBase64: string,
  ) => {
    let processedImageBase64: string;
    let processedDataUrl: string;

    const bestROIs = new Map<string, BestROIData>();

    if (captureDelaySeconds > 0) {
      // ========== 延时模式 ==========
      console.log(`⏱️ 延时 ${captureDelaySeconds} 秒，期间持续捕获并选择最清晰ROI...`);
      setIsInPostDetectionDelay(true);
      setWorkflowState('searching_best_frame');

      const captureInterval = 200;
      const totalFrames = Math.max(1, Math.floor((captureDelaySeconds * 1000) / captureInterval));
      let capturedFrames = 0;

      while (capturedFrames < totalFrames) {
        await new Promise(resolve => setTimeout(resolve, captureInterval));

        if ((workflowState !== 'idle' && workflowState !== 'searching_best_frame') || !videoRef.current) {
          console.log('⚠️ 延时期间工作流状态已变化，取消抓拍');
          return;
        }

        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = videoRef.current.videoWidth;
        frameCanvas.height = videoRef.current.videoHeight;
        const frameCtx = frameCanvas.getContext('2d');

        if (!frameCtx || !videoRef.current) { capturedFrames++; continue; }

        frameCtx.drawImage(videoRef.current, 0, 0, frameCanvas.width, frameCanvas.height);
        const frameDataUrl = frameCanvas.toDataURL('image/jpeg', 0.95);
        const frameBase64 = frameDataUrl.split(',')[1];

        if (!frameBase64) { capturedFrames++; continue; }

        if (imageSaveMode === 'roi') {
          try {
            const frameDetectionType = (modelConfig?.detection_type as any) || 'ocr_inspection';
            const frameDetections = await yoloDetectBackend(frameBase64, detectionConfidence, {
              model_id: currentModelId || undefined,
              detection_type: frameDetectionType,
            });
            const frameTargetDetections = frameDetections.filter(detection =>
              validSelectedTargets.includes(detection.label) && detection.confidence >= detectionConfidence
            );

            if (detectionCanvasRef.current && videoRef.current && frameTargetDetections.length > 0) {
              const videoWidth = videoRef.current.videoWidth;
              const videoHeight = videoRef.current.videoHeight;
              if (videoWidth > 0 && videoHeight > 0) {
                if (detectionCanvasRef.current.width !== videoWidth || detectionCanvasRef.current.height !== videoHeight) {
                  detectionCanvasRef.current.width = videoWidth;
                  detectionCanvasRef.current.height = videoHeight;
                }
                if (detectionCanvasRef.current) {
                  drawDetections(frameDetections, detectionCanvasRef.current);
                }
              }
            }

            await captureAndEvaluateFrame(videoRef, frameDataUrl, frameTargetDetections, validSelectedTargets, bestROIs);
          } catch (error) {
            console.error('延时期间检测失败:', error);
          }
        } else {
          // 全画面模式
          try {
            const img = new Image();
            await new Promise<void>((resolve) => {
              img.onload = async () => {
                try {
                  const fullImageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
                  const sharpness = await calculateSharpnessAsync(fullImageData);
                  setCurrentSharpness(sharpness);

                  const existing = bestROIs.get('full_image');
                  if (!existing || sharpness > existing.sharpness) {
                    bestROIs.set('full_image', {
                      imageDataUrl: frameDataUrl,
                      imageBase64: frameBase64,
                      detection: null as any,
                      sharpness: sharpness,
                      fullImageDataUrl: frameDataUrl
                    });
                    console.log(`📸 更新全画面的最清晰照片，清晰度: ${sharpness.toFixed(2)}`);
                  }
                  resolve();
                } catch (error) {
                  console.error('处理全画面清晰度失败:', error);
                  resolve();
                }
              };
              img.onerror = () => resolve();
              img.src = frameDataUrl;
            });
          } catch (error) {
            console.error('延时期间计算全画面清晰度失败:', error);
          }
        }

        capturedFrames++;
      }

      const roiCount = imageSaveMode === 'roi' ? bestROIs.size : (bestROIs.has('full_image') ? 1 : 0);
      console.log(`✅ 延时结束，已捕获 ${capturedFrames} 帧，找到 ${roiCount} 个最清晰${imageSaveMode === 'roi' ? 'ROI' : '全画面'}`);
      setIsInPostDetectionDelay(false);

      if (workflowState !== 'idle' || !videoRef.current) {
        console.log('⚠️ 延时期间工作流状态已变化，取消抓拍');
        setIsInPostDetectionDelay(false);
        return;
      }

      setWorkflowState('capturing');

      // 批处理模式分支（延时结束）
      if (imageSaveMode === 'roi' && batchProcessingMode === 'batch') {
        console.log('🔄 [批处理模式] (延时结束) 收集ROI并缓存，跳过常规拼接...');
        const allBestROIs = mergeROIs(bestROIs, roiProcessorBestROIsRef.current);

        if (allBestROIs.size > 0 && batchManager) {
          let successCount = 0;
          for (const [label, item] of allBestROIs.entries()) {
            const res = await batchManager.cacheROI(label, item.imageDataUrl, item.detection.bbox, item.detection);
            if (res) successCount++;
            await new Promise(r => setTimeout(r, 50));
          }
          console.log(`✅ [批处理模式] (延时结束) 已缓存 ${successCount}/${allBestROIs.size} 个ROI`);

          if (successCount > 0) {
            setWorkflowState('processing');
            await batchManager.triggerBatchProcessing(true);
            return;
          }
        } else {
          console.warn('⚠️ [批处理模式] 未收集到任何ROI，重置状态');
          setWorkflowState('idle');
          return;
        }
      }

      // ROI拼接（延时模式）
      if (imageSaveMode === 'roi') {
        const allBestROIs = mergeROIs(bestROIs, roiProcessorBestROIsRef.current);
        if (allBestROIs.size > 0) {
          const roiSnapshots = Array.from(allBestROIs.values()).map(item => ({
            imageDataUrl: item.imageDataUrl,
            label: item.detection.label
          }));
          const fallbackFrame = captureFrameData();
          const stitchedImage = await stitchROISnapshots(roiSnapshots);
          if (stitchedImage) {
            processedImageBase64 = stitchedImage;
            processedDataUrl = `data:image/jpeg;base64,${stitchedImage}`;
            console.log(`✅ ROI模式保存完成，使用累积ROI截图拼接（共${allBestROIs.size}个），base64长度:`, processedImageBase64.length);
          } else {
            console.error('❌ ROI拼接失败，使用最后一帧');
            if (fallbackFrame) {
              processedDataUrl = fallbackFrame.dataUrl;
              processedImageBase64 = fallbackFrame.base64;
            } else {
              setWorkflowState('idle');
              return;
            }
          }
        } else {
          const lastFrameCanvas = document.createElement('canvas');
          lastFrameCanvas.width = videoRef.current.videoWidth;
          lastFrameCanvas.height = videoRef.current.videoHeight;
          const lastFrameCtx = lastFrameCanvas.getContext('2d');
          if (lastFrameCtx && videoRef.current) {
            lastFrameCtx.drawImage(videoRef.current, 0, 0);
            processedDataUrl = lastFrameCanvas.toDataURL('image/jpeg', 0.95);
            processedImageBase64 = processedDataUrl.split(',')[1];
          } else {
            setWorkflowState('idle');
            return;
          }
        }
      } else {
        // 全画面模式（延时）
        const bestFullImage = bestROIs.get('full_image');
        if (bestFullImage) {
          processedDataUrl = bestFullImage.fullImageDataUrl;
          processedImageBase64 = bestFullImage.imageBase64;
          console.log(`✅ 全画面模式保存完成，使用最清晰照片（清晰度: ${bestFullImage.sharpness.toFixed(2)}）`);
        } else {
          const captureCanvas = document.createElement('canvas');
          captureCanvas.width = videoRef.current.videoWidth;
          captureCanvas.height = videoRef.current.videoHeight;
          const captureCtx = captureCanvas.getContext('2d');
          if (!captureCtx || !videoRef.current) {
            console.error('❌ 无法创建抓拍画布');
            setWorkflowState('idle');
            return;
          }
          captureCtx.drawImage(videoRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
          processedDataUrl = captureCanvas.toDataURL('image/jpeg', 0.95);
          processedImageBase64 = processedDataUrl.split(',')[1];
          if (!processedImageBase64) {
            console.error('❌ 无法获取抓拍图像数据');
            setWorkflowState('idle');
            return;
          }
          console.log('✅ 全画面模式保存完成（使用最后一帧）');
        }
      }
    } else {
      // ========== 无延时模式 ==========
      setWorkflowState('capturing');

      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = videoRef.current!.videoWidth;
      captureCanvas.height = videoRef.current!.videoHeight;
      const captureCtx = captureCanvas.getContext('2d');

      if (!captureCtx || !videoRef.current) {
        console.error('❌ 无法创建抓拍画布');
        setWorkflowState('idle');
        return;
      }

      captureCtx.drawImage(videoRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
      const captureDataUrl = captureCanvas.toDataURL('image/jpeg', 0.95);
      const captureBase64Data = captureDataUrl.split(',')[1];

      if (!captureBase64Data) {
        console.error('❌ 无法获取抓拍图像数据');
        setWorkflowState('idle');
        return;
      }

      processedImageBase64 = captureBase64Data;
      processedDataUrl = captureDataUrl;

      // 批处理模式分支（无延时）
      if (imageSaveMode === 'roi' && batchProcessingMode === 'batch') {
        console.log('🔄 [批处理模式] 收集ROI并缓存，跳过常规拼接...');
        const allBestROIs = mergeROIs(bestROIs, roiProcessorBestROIsRef.current);

        if (allBestROIs.size > 0 && batchManager) {
          let successCount = 0;
          for (const [label, item] of allBestROIs.entries()) {
            const cacheResult = await batchManager.cacheROI(label, item.imageDataUrl, item.detection.bbox, item.detection);
            if (cacheResult) successCount++;
            await new Promise(r => setTimeout(r, 50));
          }
          console.log(`✅ [批处理模式] 已缓存 ${successCount}/${allBestROIs.size} 个ROI`);

          if (successCount > 0) {
            setWorkflowState('processing');
            await batchManager.triggerBatchProcessing(true);
            return;
          }
        } else {
          console.warn('⚠️ [批处理模式] 未收集到任何ROI，重置状态');
          setWorkflowState('idle');
          return;
        }
      }

      // ROI拼接（无延时）
      if (imageSaveMode === 'roi') {
        if (roiProcessorBestROIsRef.current.size > 0) {
          const roiSnapshots = Array.from(roiProcessorBestROIsRef.current.values()).map(item => ({
            imageDataUrl: item.imageDataUrl,
            label: item.detection.label
          }));
          const fallbackFrame = captureFrameData();
          const stitchedImage = await stitchROISnapshots(roiSnapshots);
          if (stitchedImage) {
            processedImageBase64 = stitchedImage;
            processedDataUrl = `data:image/jpeg;base64,${stitchedImage}`;
            console.log(`✅ ROI模式保存完成，使用累积ROI截图拼接（共${roiProcessorBestROIsRef.current.size}个），base64长度:`, processedImageBase64.length);
          } else {
            console.error('❌ ROI拼接失败，使用原图');
            if (fallbackFrame) {
              processedDataUrl = fallbackFrame.dataUrl;
              processedImageBase64 = fallbackFrame.base64;
            } else {
              processedDataUrl = captureDataUrl;
              processedImageBase64 = captureBase64Data;
            }
          }
        } else {
          console.log('🔍 ROI模式：没有累积ROI，对全画面图片进行YOLO检测...');
          const captureDetections = await yoloDetectBackend(captureBase64Data, detectionConfidence, {
            model_id: currentModelId || undefined,
            detection_type: (modelConfig?.detection_type as any) || 'ocr_inspection',
          });
          const captureTargetDetections = captureDetections.filter(detection =>
            validSelectedTargets.includes(detection.label) && detection.confidence >= detectionConfidence
          );
          console.log(`🔍 ROI模式：检测到 ${captureTargetDetections.length} 个目标ROI区域`);

          if (captureTargetDetections.length > 0) {
            processedDataUrl = await stitchMultipleROIs(captureDataUrl, captureTargetDetections);
            if (processedDataUrl && processedDataUrl.includes(',')) {
              processedImageBase64 = processedDataUrl.split(',')[1];
              console.log('✅ ROI模式保存完成，多区域拼接，base64长度:', processedImageBase64.length);
            } else {
              console.error('❌ ROI拼接失败，使用原图');
              processedDataUrl = captureDataUrl;
              processedImageBase64 = captureBase64Data;
            }
          } else {
            console.warn('⚠️ ROI模式：未检测到目标ROI区域，使用原图');
            processedDataUrl = captureDataUrl;
            processedImageBase64 = captureBase64Data;
          }
        }
      } else {
        processedDataUrl = captureDataUrl;
        processedImageBase64 = captureBase64Data;
        console.log('✅ 全画面模式保存完成，统一压缩将在后续处理中进行');
      }
    }

    // ========== 创建文件对象 & 处理结果 ==========
    let capturedImageFile: File = new File([], 'captured_image.jpg', { type: 'image/jpeg' });
    if (captureDelaySeconds > 0 && imageSaveMode === 'roi') {
      const bestROIsArray = Array.from(bestROIs.values());
      if (bestROIsArray.length > 0) {
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              canvas.toBlob((blob) => {
                capturedImageFile = blob
                  ? new File([blob], 'captured_image.jpg', { type: 'image/jpeg' })
                  : new File([], 'captured_image.jpg', { type: 'image/jpeg' });
                resolve();
              }, 'image/jpeg', 0.8);
            } else {
              resolve();
            }
          };
          img.onerror = () => resolve();
          img.src = processedDataUrl!;
        });
      } else if (videoRef.current) {
        const lastFrameCanvas = document.createElement('canvas');
        lastFrameCanvas.width = videoRef.current.videoWidth;
        lastFrameCanvas.height = videoRef.current.videoHeight;
        const lastFrameCtx = lastFrameCanvas.getContext('2d');
        if (lastFrameCtx && videoRef.current) {
          lastFrameCtx.drawImage(videoRef.current, 0, 0);
          capturedImageFile = new File([lastFrameCanvas.toBlob ? await new Promise<Blob>((resolve) => {
            lastFrameCanvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
          }) : new Blob()], 'captured_image.jpg', { type: 'image/jpeg' });
        }
      }
    } else if (videoRef.current) {
      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = videoRef.current.videoWidth;
      captureCanvas.height = videoRef.current.videoHeight;
      const captureCtx = captureCanvas.getContext('2d');
      if (captureCtx && videoRef.current) {
        captureCtx.drawImage(videoRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
        capturedImageFile = new File([captureCanvas.toBlob ? await new Promise<Blob>((resolve) => {
          captureCanvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.8);
        }) : new Blob()], 'captured_image.jpg', { type: 'image/jpeg' });
      }
    }

    setSelectedImage(capturedImageFile);
    setImagePreview(processedDataUrl!);
    setWorkflowState('processing');

    const { finalMatchStatus } = await processCapturedImage(processedImageBase64!, capturedImageFile, 'realtime');

    // 判断合格性并决定下一步
    if (finalMatchStatus === 'qualified') {
      if (requireQualifiedConfirmation) {
        console.log('检测结果：合格，等待回车键确认');
        setWorkflowState('waiting_for_approval');
        setIsWaitingForSpace(true);
      } else {
        console.log('检测结果：合格，自动进入下一个循环');
        setWorkflowState('completed');
        setDetectedElements([]);
        detectedElementsRef.current = [];
        setElementDetectionStartTime(null);
        elementDetectionStartTimeRef.current = null;
        historyDetectionsRef.current.clear();
        roiProcessorBestROIsRef.current.clear();
        setTimeout(() => {
          setWorkflowState('idle');
          setMatchStatus('none');
          setWorkflowResult(null);
          setAiAnalysisResult(null);
          setFinalResult('none');
        }, 1000);
      }
    } else {
      console.log(`检测结果：${finalMatchStatus === 'unqualified' ? '存疑' : '存疑/无匹配'}，等待回车键确认`);
      setWorkflowState('waiting_for_approval');
      setIsWaitingForSpace(true);
    }
  }, [
    batchManager,
    batchProcessingMode,
    captureAndEvaluateFrame,
    captureDelaySeconds,
    captureFrameData,
    detectionCanvasRef,
    detectionConfidence,
    detectedElementsRef,
    elementDetectionStartTimeRef,
    historyDetectionsRef,
    imageSaveMode,
    mergeROIs,
    modelConfig,
    processCapturedImage,
    requireQualifiedConfirmation,
    roiProcessorBestROIsRef,
    setAiAnalysisResult,
    setCurrentSharpness,
    setDetectedElements,
    setElementDetectionStartTime,
    setFinalResult,
    setImagePreview,
    setIsInPostDetectionDelay,
    setIsWaitingForSpace,
    setMatchStatus,
    setSelectedImage,
    setWorkflowResult,
    setWorkflowState,
    stitchMultipleROIs,
    stitchROISnapshots,
    videoRef,
    workflowState,
  ]);

  // ========== 检测循环 Effects ==========

  // 同步performRealtimeDetection到ref
  useEffect(() => {
    performRealtimeDetectionRef.current = performRealtimeDetection;
  }, [performRealtimeDetection]);

  useEffect(() => {
    handleCaptureWorkflowRef.current = handleCaptureWorkflow;
  }, [handleCaptureWorkflow]);

  // 实时检测循环
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let isRunning = true;

    if (isRealtimeActive && isCameraOn && workflowState === 'idle') {
      if (detectionInterval === 0) {
        const runAdaptive = async () => {
          if (!isRunning) return;
          await performRealtimeDetectionRef.current?.();
          if (isRunning) {
            setTimeout(runAdaptive, 10);
          }
        };
        runAdaptive();
      } else {
        intervalId = setInterval(() => {
          performRealtimeDetectionRef.current?.();
        }, detectionInterval * 1000);
      }
    }

    return () => {
      isRunning = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [isRealtimeActive, isCameraOn, workflowState, detectionInterval]);

  // 帧采集清理
  useEffect(() => {
    if (!isRealtimeActive) {
      if (frameCollectionIntervalRef.current) {
        clearInterval(frameCollectionIntervalRef.current);
        frameCollectionIntervalRef.current = null;
        isFrameCollectionActiveRef.current = false;
        lastDetectionsRef.current = [];
        console.log('🛑 实时检测关闭，帧采集已清理');
      }
    }

    return () => {
      if (frameCollectionIntervalRef.current) {
        clearInterval(frameCollectionIntervalRef.current);
        frameCollectionIntervalRef.current = null;
        isFrameCollectionActiveRef.current = false;
      }
    };
  }, [isRealtimeActive]);

  return {
    performRealtimeDetection,
    stopFrameCollection,
    startFrameCollection,
  };
};
