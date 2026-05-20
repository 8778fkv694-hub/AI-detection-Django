/**
 * Realtime Detection Loop Hook
 *
 * 用途：管理实时检测的完整循环逻辑
 * 功能：performRealtimeDetection 函数、帧采集、检测循环 useEffect
 * 提取自：OCRDetectionScreen.tsx (原第 1132-2018 行)
 */

import { useCallback, useEffect, useRef } from 'react';
import { yoloDetectBackend, type BackendYoloDetection } from '@/lib/api';
import { apiFetch, buildApiUrl, isLocalOfflineMode } from '@/lib/config';
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
  streamId?: string;

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
    detectedElements, elementDetectionStartTime: _elementDetectionStartTime, nonGridTargets: _nonGridTargets,
    enableParallelQrDetection, qrDetectIntervalMs, fixtureQrInput, fixtureQrPrefixes, fixtureQrPattern,
    onFixtureQrDetected, streamId,
    setIsDetecting, setDetectedElements, setElementDetectionStartTime,
    setDetectionStats, setCurrentSharpness, setIsInPostDetectionDelay,
    setWorkflowState, setSelectedImage, setImagePreview,
    setIsWaitingForSpace, setMatchStatus, setWorkflowResult,
    setAiAnalysisResult, setFinalResult,
  } = options;

  // P0修复：使用ref保存performRealtimeDetection函数，避免setInterval闭包问题
  const performRealtimeDetectionRef = useRef<(() => Promise<void>) | null>(null);
  const handleCaptureWorkflowRef = useRef<((validSelectedTargets: string[], currentDataUrl: string, currentBase64: string) => Promise<void>) | null>(null);
  const latestPerfStatsRef = useRef<{ inferenceMs: number | null, fps: number | null }>({ inferenceMs: null, fps: null });
  const backendLoopOwnerRef = useRef(`ocr:${Date.now()}:${Math.random().toString(36).slice(2)}`);

  // M2修复：保存workflowState到ref，延时循环中读取ref而非闭包值
  const workflowStateRef = useRef(workflowState);
  // 使用useRef + useEffect模式而非render期间赋值，兼容React并发模式
  useEffect(() => {
    workflowStateRef.current = workflowState;
  }, [workflowState]);

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

      const useBackendDetection = !isLocalOfflineMode();

      const collectFrame = async () => {
        try {
          if (useBackendDetection && streamId) {
            // 解耦模式：从后端获取与检测框完全匹配的高清原图
            const res = await fetch(buildApiUrl(`/streams/${streamId}/snapshot/`));
            if (!res.ok) return;
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            
            const img = new Image();
            img.onload = () => {
              const frameCanvas = document.createElement('canvas');
              frameCanvas.width = img.width;
              frameCanvas.height = img.height;
              const frameCtx = frameCanvas.getContext('2d');
              if (frameCtx) {
                frameCtx.drawImage(img, 0, 0);
                const frameDataUrl = frameCanvas.toDataURL('image/jpeg', 0.95);
                batchExtractROIs(detections, frameDataUrl, validTargets);
              }
              // 关键修复：使用完后必须释放 Blob URL，防止 Jetson 浏览器内存溢出崩溃
              URL.revokeObjectURL(objectUrl);
            };
            img.onerror = () => URL.revokeObjectURL(objectUrl);
            img.src = objectUrl;
          } else {
            // 传统模式：从前端 video 元素直接截图
            const frameCanvas = document.createElement('canvas');
            frameCanvas.width = videoRef.current!.videoWidth;
            frameCanvas.height = videoRef.current!.videoHeight;
            const frameCtx = frameCanvas.getContext('2d');
            if (!frameCtx || !videoRef.current) return;

            frameCtx.drawImage(videoRef.current, 0, 0, frameCanvas.width, frameCanvas.height);
            const frameDataUrl = frameCanvas.toDataURL('image/jpeg', 0.95);
            batchExtractROIs(detections, frameDataUrl, validTargets);
          }
        } catch (err) {
          console.error("Frame collection error:", err);
        }
      };

      collectFrame();

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
      if (isPausedRef.current) return;

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

        // 检查是否启用后端持续检测
        const useBackendDetection = !isLocalOfflineMode();
        
        let detections: any[] = [];
        let base64DataForQr = '';
        let dataUrl = '';
        let base64Data = '';
        let currentFrameId = 0;

        if (useBackendDetection && streamId) {
          // ====== 解耦模式：拉取后端最新 JSON 结果（<1KB） ======
          try {
            const response = await fetch(buildApiUrl(`/streams/${streamId}/detections/`));
            if (response.ok) {
              const result = await response.json();
              detections = result.boxes || [];
              currentFrameId = result.frame_id || 0;
              
              // 更新性能指标
              latestPerfStatsRef.current = {
                inferenceMs: result.inference_ms || null,
                fps: result.detect_fps || null,
              };

              // 同步更新后端的 FPS 统计
              if (result.detect_fps) {
                // 将后端真实 FPS 更新到统计中
                setDetectionStats((prev: any) => ({
                  ...prev,
                  fps: result.detect_fps,
                }));
              }
            }
          } catch (e) {
            console.error('拉取后端检测结果失败:', e);
          }

          // 仅在需要触发并行二维码识别时，按需截图（降低 CPU 消耗）
          if (enableParallelQrDetection && !fixtureQrInputRef.current &&
              (Date.now() - lastQrDetectTimeRef.current >= effectiveQrInterval)) {
            const qrCanvas = document.createElement('canvas');
            const qrSrcW = videoRef.current.videoWidth;
            const qrSrcH = videoRef.current.videoHeight;
            let qrDstW = qrSrcW;
            let qrDstH = qrSrcH;
            if (qrDstW > 960) {
              qrDstH = Math.round(qrDstH * 960 / qrDstW);
              qrDstW = 960;
            }
            qrCanvas.width = qrDstW;
            qrCanvas.height = qrDstH;
            const qrCtx = qrCanvas.getContext('2d');
            if (qrCtx) {
              qrCtx.drawImage(videoRef.current, 0, 0, qrDstW, qrDstH);
              base64DataForQr = qrCanvas.toDataURL('image/jpeg', 0.80).split(',')[1];
            }
          }

        } else {
          // ====== 传统模式：前端截图 → 缩图 → 压缩 → 上传 Base64 ======
          const MAX_WIDTH = 960; // 发 Jetson 前缩到 960px，降低网络传输
          const JPEG_QUALITY = 0.80;

          const srcWidth = videoRef.current.videoWidth;
          const srcHeight = videoRef.current.videoHeight;

          // 计算缩图尺寸（保持宽高比）
          let dstWidth = srcWidth;
          let dstHeight = srcHeight;
          if (dstWidth > MAX_WIDTH) {
            dstHeight = Math.round(dstHeight * MAX_WIDTH / dstWidth);
            dstWidth = MAX_WIDTH;
          }

          const canvas = document.createElement('canvas');
          canvas.width = dstWidth;
          canvas.height = dstHeight;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            isDetectingRef.current = false;
            setIsDetecting(false);
            return;
          }

          ctx.drawImage(videoRef.current, 0, 0, dstWidth, dstHeight);
          dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
          base64Data = dataUrl.split(',')[1];

          if (!base64Data) {
            isDetectingRef.current = false;
            setIsDetecting(false);
            return;
          }

          base64DataForQr = base64Data;

          // 执行YOLO检测
          const detectionType = (modelConfig?.detection_type as 'cleanroom_ppe' | 'kit_matching' | 'ocr_inspection' | 'ocr_fusion_inspection' | 'general_quality' | undefined) || 'ocr_inspection';
          const startTime = performance.now();
          detections = await yoloDetectBackend(base64Data, detectionConfidence, {
            ...(currentModelId ? { model_id: currentModelId } : {}),
            detection_type: detectionType,
          });
          const elapsed = performance.now() - startTime;
          latestPerfStatsRef.current = {
            inferenceMs: Math.round(elapsed),
            fps: Math.round(1000 / elapsed),
          };
        }

        // 并行触发工装码识别（如果本帧有图）
        if (base64DataForQr) {
          fireParallelQrDetection(base64DataForQr);
        }

        // 保存检测结果供帧采集使用
        lastDetectionsRef.current = detections.filter(d =>
          validSelectedTargets.includes(d.label) && d.confidence >= detectionConfidence
        );

        // 更新检测统计
        const personDetections = detections.filter(d => d.label === 'person').length;
        const equipmentDetections = detections.filter(d => d.label !== 'person').length;
        setDetectionStats((prev: any) => ({
          ...prev,
          totalDetections: detections.length,
          personDetections,
          equipmentDetections,
          lastDetectionTime: Date.now()
        }));

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
              drawDetections(detections, detectionCanvasRef.current, latestPerfStatsRef.current);
            }
          } else {
            console.log('视频尺寸无效，跳过绘制检测结果');
          }
        }

        // ROI模式累积保存（有本地截图数据时每帧提取ROI，不论后端/传统模式）
        if (imageSaveMode === 'roi' && dataUrl) {
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

          let finalDataUrl = dataUrl;
          let finalBase64 = base64Data;
          
          if (useBackendDetection && streamId && !finalDataUrl) {
            try {
              // 通过 frame_id 从后端 Ring Buffer 请求历史帧，实现完美对齐
              const url = currentFrameId > 0 
                ? buildApiUrl(`/streams/${streamId}/snapshot/?frame_id=${currentFrameId}`)
                : buildApiUrl(`/streams/${streamId}/snapshot/`);
                
              const snapRes = await fetch(url);
              if (snapRes.ok) {
                const snapFrameId = parseInt(snapRes.headers.get('X-Frame-ID') || '0', 10);
                if (currentFrameId > 0 && snapFrameId !== currentFrameId) {
                  console.warn(`⚠️ 后端 Ring Buffer 未能命中请求帧(${currentFrameId})，退化返回帧(${snapFrameId})`);
                }
                const blob = await snapRes.blob();
                const objectUrl = URL.createObjectURL(blob);
                const reader = new FileReader();
                finalDataUrl = await new Promise<string>((resolve) => {
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });
                finalBase64 = finalDataUrl.split(',')[1] || '';
                URL.revokeObjectURL(objectUrl);
              }
            } catch (e) {
              console.error('抓拍后端原图失败:', e);
            }
            
            // fallback如果后端快照失败
            if (!finalDataUrl && videoRef.current) {
              const canvas = document.createElement('canvas');
              canvas.width = videoRef.current.videoWidth;
              canvas.height = videoRef.current.videoHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                finalDataUrl = canvas.toDataURL('image/jpeg', 0.95);
                finalBase64 = finalDataUrl.split(',')[1] || '';
              }
            }
          }

          // ========== 抓拍与图像处理 ==========
          await handleCaptureWorkflowRef.current?.(
            validSelectedTargets, finalDataUrl, finalBase64
          );
        }

      } catch (error) {
        console.error('实时检测失败:', error);
        // M13: 仅在没有活跃工作流时才重置，避免冲掉正在进行的流程
        if (workflowStateRef.current === 'idle') {
          setWorkflowState('idle');
          setMatchStatus('none');
          setWorkflowResult(null);
          setAiAnalysisResult(null);
          setFinalResult('none');
        }
      } finally {
        isDetectingRef.current = false;
        setIsDetecting(false);
        detectionQueueRef.current = [];
        isProcessingQueueRef.current = false;
      }
    };

    if (isProcessingQueueRef.current || isDetectingRef.current) {
      // 实时视频只处理最新帧；旧检测任务排队会造成 OBS/浏览器预览周期性卡顿。
      detectionQueueRef.current = [];
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

        // M2: 用ref读取最新workflowState，避免过期闭包
        // M14: 暂停时停止帧收集
        if (isPausedRef.current) {
          console.log('⚠️ 延时期间暂停，取消帧收集');
          setIsInPostDetectionDelay(false);
          return;
        }
        const currentWfState = workflowStateRef.current;
        if ((currentWfState !== 'idle' && currentWfState !== 'searching_best_frame') || !videoRef.current) {
          console.log('⚠️ 延时期间工作流状态已变化，取消抓拍');
          setIsInPostDetectionDelay(false);
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
            const startTime = performance.now();
            const frameDetections = await yoloDetectBackend(frameBase64, detectionConfidence, {
              ...(currentModelId ? { model_id: currentModelId } : {}),
              detection_type: frameDetectionType,
            });
            const elapsed = performance.now() - startTime;
            latestPerfStatsRef.current = {
              inferenceMs: Math.round(elapsed),
              fps: Math.round(1000 / elapsed),
            };

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
                  drawDetections(frameDetections, detectionCanvasRef.current, latestPerfStatsRef.current);
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
      // 检查最佳ROI的清晰度是否达标，帮助判断是算法问题还是源画面问题
      if (bestROIs.size > 0) {
        const sharpnessValues = Array.from(bestROIs.values()).map(r => r.sharpness);
        const minSharpness = Math.min(...sharpnessValues);
        const avgSharpness = sharpnessValues.reduce((a, b) => a + b, 0) / sharpnessValues.length;
        console.log(`📊 清晰度统计: 最低=${minSharpness.toFixed(1)}, 平均=${avgSharpness.toFixed(1)}, 各ROI=${sharpnessValues.map(s => s.toFixed(1)).join(', ')}`);
        if (avgSharpness < 10) {
          console.warn(`⚠️ 所有ROI平均清晰度仅 ${avgSharpness.toFixed(1)}，源画面可能模糊、光线不足或对焦不准`);
        }
      }
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
            // 批处理模式：成功触发后清理检测状态，防止下一轮误触发
            historyDetectionsRef.current.clear();
            elementDetectionStartTimeRef.current = null;
            debounceStartTimeRef.current = null;
            await batchManager.triggerBatchProcessing(true);
            return;
          }
        } else {
          console.warn('⚠️ [批处理模式] 未收集到任何ROI，重置状态');
          // 批处理模式：失败时同样清理状态
          historyDetectionsRef.current.clear();
          elementDetectionStartTimeRef.current = null;
          debounceStartTimeRef.current = null;
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

          // H4修复：批处理分支返回前清理检测状态，防止残留状态导致下一轮误触发
          historyDetectionsRef.current.clear();
          elementDetectionStartTimeRef.current = null;
          debounceStartTimeRef.current = null;

          if (successCount > 0) {
            setWorkflowState('processing');
            await batchManager.triggerBatchProcessing(true);
            return;
          }
        } else {
          console.warn('⚠️ [批处理模式] 未收集到任何ROI，重置状态');
          // H4修复：失败时同样清理状态
          historyDetectionsRef.current.clear();
          elementDetectionStartTimeRef.current = null;
          debounceStartTimeRef.current = null;
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
            ...(currentModelId ? { model_id: currentModelId } : {}),
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
        // 计算全画面清晰度，确认抓拍质量
        try {
          const fullImageData = captureCtx.getImageData(0, 0, captureCanvas.width, captureCanvas.height);
          calculateSharpnessAsync(fullImageData).then(s => {
            console.log(`📷 全画面抓拍清晰度: ${s.toFixed(1)} ${s < 10 ? '⚠️ 模糊!' : s < 30 ? '⚡ 一般' : '✅ 清晰'}`);
          });
        } catch { /* 清晰度计算不影响主流程 */ }
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

  // ====== 后端检测循环生命周期管理 ======
  useEffect(() => {
    const useBackendDetection = !isLocalOfflineMode();
    if (!useBackendDetection || !streamId) return;

    if (isRealtimeActive && isCameraOn && !isPaused) {
      // 启动后端检测循环
      console.log(`🚀 正在请求后端启动检测循环: stream=${streamId}, model=${currentModelId || 'default'}`);
      fetch(buildApiUrl(`/streams/${streamId}/detection-loop/start/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: currentModelId || undefined,
          conf_threshold: detectionConfidence,
          owner_id: backendLoopOwnerRef.current,
        }),
      }).catch(e => console.error('启动后端检测循环失败:', e));
    } else {
      // 暂停或停止时关闭后端检测循环
      console.log(`🛑 正在请求后端停止检测循环: stream=${streamId}`);
      fetch(buildApiUrl(`/streams/${streamId}/detection-loop/stop/`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner_id: backendLoopOwnerRef.current }),
      }).catch(e => console.error('停止后端检测循环失败:', e));
    }
    
    return () => {
      // 卸载组件时停止检测循环
      if (useBackendDetection && streamId) {
        fetch(buildApiUrl(`/streams/${streamId}/detection-loop/stop/`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ owner_id: backendLoopOwnerRef.current }),
        }).catch(e => console.error('卸载时停止后端检测循环失败:', e));
      }
    };
  }, [isRealtimeActive, isCameraOn, isPaused, streamId, currentModelId, detectionConfidence, modelConfig]);

  // 实时检测循环
  // 注意：workflowState 故意不放进 deps —— 否则 workflow 状态一变化就 clearInterval，
  // 等到 workflow 回 idle 时 effect 重启可能漏掉 idle 窗口（特别是 workflow 卡在
  // waiting_for_approval / completed 这类需要外部驱动才能回 idle 的状态时，循环就死了）。
  // performRealtimeDetectionRef.current 内部第 268 行已经做了 workflowState !== 'idle'
  // 的早返回，busy 时跳过当次检测即可，workflow 回 idle 后自然恢复滴答。
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    let isRunning = true;

    if (isRealtimeActive && isCameraOn) {
      if (detectionInterval === 0) {
        // 自适应模式：33ms ≈ 30 FPS，对后端检测循环轮询已足够快
        // 10ms 会跑出 100 req/s，在 Jetson GIL 竞争下白白拖垮 MJPEG 和推理
        const runAdaptive = async () => {
          if (!isRunning) return;
          await performRealtimeDetectionRef.current?.();
          if (isRunning) {
            setTimeout(runAdaptive, 33);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRealtimeActive, isCameraOn, detectionInterval]);

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
