/**
 * PPE Detection Hook
 *
 * 用途：PPE检测核心逻辑
 * 功能：执行YOLO检测、绘制检测结果、实时监控
 * 使用位置：SafetyEquipmentScreen
 */

import { useCallback, useRef, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import type { BackendYoloDetection } from '@/lib/api';
import { isLocalOfflineMode } from '@/lib/config';
import {
  detectImage,
  ensureLocalModel,
  fetchStreamSnapshot,
  fetchStreamDetections,
  startStreamDetectionLoop,
  stopStreamDetectionLoop,
} from '@/services/detect';
import type { YoloDetection } from '@/lib/yoloDetector';

export interface DetectionStats {
  totalDetections: number;
  personDetections: number;
  equipmentDetections: number;
}

export interface BestDetection {
  detections: YoloDetection[];
  imageData?: string;
  confidence: number;
  timestamp: number;
  sharpness?: number;
}

export interface UsePPEDetectionOptions {
  /** 后端流ID（虚拟流媒体摄像头时启用） */
  streamId?: string;
  /** 视频元素引用 */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 检测画布引用 */
  detectionCanvasRef: React.RefObject<HTMLCanvasElement>;
  /** PPE检测是否激活 */
  isPpeActive: boolean;
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 抓拍阈值 */
  captureThreshold: number;
  /** PPE各项阈值 */
  ppeThresholds: Record<string, number>;
  /** 是否显示检测框 */
  showDetections: boolean;
  /** 自动抓拍开关 */
  autoCapture: boolean;
  /** 抓拍间隔(秒) */
  captureInterval: number;
  /** 模型不可用对话框设置函数 */
  setModelUnavailableDialog: (dialog: {
    isOpen: boolean;
    errorMessage: string;
    errorType: 'model_unavailable' | 'specific_model_unavailable';
  }) => void;
  /** 自动抓拍处理函数 */
  handleAutoCapture: (
    detections: YoloDetection[],
    imageData?: string
  ) => Promise<string[] | null>;
  /** 获取当前帧函数 */
  captureCurrentFrame: () => Promise<string | null>;
  /** 最佳检测结果 */
  bestDetectionInInterval: BestDetection | null;
  /** 设置最佳检测结果 */
  setBestDetectionInInterval: (detection: BestDetection | null) => void;
}

export interface UsePPEDetectionResult {
  /** 执行检测 */
  performDetection: (imageData: string) => Promise<YoloDetection[]>;
  /** 执行抓拍检测 */
  performCaptureDetection: (imageData: string) => Promise<YoloDetection[]>;
  /** 在画布上绘制检测结果 */
  drawDetections: (
    detections: YoloDetection[],
    canvas: HTMLCanvasElement,
    sourceSize?: { width: number; height: number }
  ) => void;
  /** 检测统计 */
  detectionStats: DetectionStats;
  /** 是否正在检测 */
  isDetecting: boolean;
  /** 检测状态引用 */
  isDetectingRef: React.MutableRefObject<boolean>;
  /** 上次抓拍时间 */
  lastCaptureTime: number;
  /** 设置上次抓拍时间 */
  setLastCaptureTime: (time: number) => void;
  /** 执行单次实时PPE检测 */
  runPpeDetection: () => Promise<string[] | null>;
}

export const usePPEDetection = ({
  streamId,
  videoRef,
  detectionCanvasRef,
  isPpeActive,
  isCameraOn,
  captureThreshold,
  ppeThresholds,
  showDetections,
  autoCapture,
  captureInterval,
  setModelUnavailableDialog,
  handleAutoCapture,
  captureCurrentFrame,
  bestDetectionInInterval,
  setBestDetectionInInterval,
}: UsePPEDetectionOptions): UsePPEDetectionResult => {
  const isDetectingRef = useRef(false);
  const backendLoopStartedRef = useRef(false);
  const backendLoopOwnerRef = useRef(`ppe:${Date.now()}:${Math.random().toString(36).slice(2)}`);
  const [isDetecting, setIsDetecting] = useState(false);
  const [lastCaptureTime, setLastCaptureTime] = useState(0);
  const [detectionStats, setDetectionStats] = useState<DetectionStats>({
    totalDetections: 0,
    personDetections: 0,
    equipmentDetections: 0,
  });

  // 在离线/Native平台下，当进入PPE检测屏幕且开启了PPE检测时，确保加载了 ppe_detection 模型
  useEffect(() => {
    if (isLocalOfflineMode() && isPpeActive) {
      console.log('[PPEDetection] 确保加载离线 PPE 模型 (ppe_detection)');
      ensureLocalModel('ppe_detection').catch((error) => {
        console.error('加载离线 PPE 模型失败:', error);
      });
    }
  }, [isPpeActive]);

  const getMinThreshold = useCallback(() => {
    const thresholdValues = Object.values(ppeThresholds).filter(
      (v) => typeof v === 'number'
    ) as number[];
    return thresholdValues.length > 0 ? Math.min(...thresholdValues) : 0.5;
  }, [ppeThresholds]);

  const mapBackendDetection = useCallback((d: BackendYoloDetection): YoloDetection => {
    let label = d.label;
    if (label === 'Person') label = 'person';
    else if (label === 'Mask') label = 'mask';
    else if (label === 'Safety Vest') label = 'safety-vest';
    return {
      class: label,
      confidence: d.confidence,
      bbox: [d.bbox.x1, d.bbox.y1, d.bbox.x2 - d.bbox.x1, d.bbox.y2 - d.bbox.y1],
    };
  }, []);

  const filterDetections = useCallback(
    (
      detections: YoloDetection[],
      fallbackThreshold: number,
      useClassThresholds = false
    ) => detections.filter((detection) => {
      let key = detection.class;
      if (key === 'Hardhat' || key === 'NO-Hardhat') key = 'helmet';
      else if (key === 'NO-Mask') key = 'mask';
      else if (key === 'NO-Safety Vest') key = 'safety-vest';

      const classThreshold = ppeThresholds[key as keyof typeof ppeThresholds];
      const threshold = useClassThresholds && typeof classThreshold === 'number'
        ? classThreshold
        : fallbackThreshold;
      return detection.confidence >= threshold;
    }),
    [ppeThresholds]
  );

  const fetchBackendSnapshotBase64 = useCallback(async (frameId?: number): Promise<string | null> => {
    if (!streamId) return null;
    try {
      const res = await fetchStreamSnapshot(streamId, frameId);
      if (!res.ok) return null;
      const snapFrameId = parseInt(res.headers.get('X-Frame-ID') || '0', 10);
      if (frameId && frameId > 0 && snapFrameId !== frameId) {
        console.warn(`⚠️ 后端 Ring Buffer 未能命中请求帧(${frameId})，退化返回帧(${snapFrameId})`);
      }
      const blob = await res.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1] || '');
        };
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('获取PPE后端快照失败:', error);
      return null;
    }
  }, [streamId]);

  // 执行检测（用于检测阈值过滤）
  const performDetection = useCallback(
    async (imageData: string): Promise<YoloDetection[]> => {
      try {
        const minThreshold = getMinThreshold();
        const backendDetections = await detectImage(imageData, minThreshold, {
          detection_type: 'cleanroom_ppe',
        });

        const detections = backendDetections.map(mapBackendDetection);
        const filteredDetections = filterDetections(detections, minThreshold, true);

        return filteredDetections;
      } catch (error) {
        console.error('后端PPE检测失败:', error);

        const err = error as { errorType?: string; message?: string };
        if (err.errorType === 'model_unavailable' || err.errorType === 'specific_model_unavailable') {
          setModelUnavailableDialog({
            isOpen: true,
            errorMessage: (error as Error).message,
            errorType: err.errorType as 'model_unavailable' | 'specific_model_unavailable',
          });
        } else {
          toast.error(`检测失败: ${(error as Error).message}`);
        }

        return [];
      }
    },
    [filterDetections, getMinThreshold, mapBackendDetection, setModelUnavailableDialog]
  );

  // 执行抓拍检测
  const performCaptureDetection = useCallback(
    async (imageData: string): Promise<YoloDetection[]> => {
      try {
        if (!imageData || imageData.length === 0) {
          console.error('图片数据为空，跳过检测');
          return [];
        }

        if (imageData.length > 8000000) {
          console.warn('图片数据较大，继续检测:', imageData.length);
        }

        try {
          const testDecode = atob(imageData);
          if (testDecode.length === 0) {
            console.error('图片数据格式无效，跳过检测');
            return [];
          }
        } catch {
          console.error('图片数据base64解码失败，跳过检测');
          return [];
        }

        const backendDetections = await detectImage(imageData, captureThreshold, {
          detection_type: 'cleanroom_ppe',
        });

        const detections = backendDetections.map(mapBackendDetection);
        const filteredDetections = filterDetections(detections, captureThreshold, true);

        return filteredDetections;
      } catch (error) {
        console.error('抓拍PPE检测失败:', error);
        return [];
      }
    },
    [captureThreshold, filterDetections, mapBackendDetection]
  );

  // 在画布上绘制检测结果
  const drawDetections = useCallback(
    (
      detections: YoloDetection[],
      canvas: HTMLCanvasElement,
      sourceSize?: { width: number; height: number }
    ) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scaleX = sourceSize?.width ? canvas.width / sourceSize.width : 1;
      const scaleY = sourceSize?.height ? canvas.height / sourceSize.height : 1;

      detections.forEach((detection) => {
        const [x, y, width, height] = detection.bbox;
        const confidence = detection.confidence;

        let color = '#00ff00';

        if (detection.class === 'person') color = '#ff0000';
        else if (['cleanroom_cap', 'hat', 'Hardhat', 'helmet'].includes(detection.class))
          color = '#00ffff';
        else if (['mask', 'face-mask', 'face-guard'].includes(detection.class))
          color = '#ffff00';
        else if (
          ['no_cleanroom_cap', 'no_mask', 'NO-Hardhat', 'NO-Mask', 'NO-Safety Vest'].includes(
            detection.class
          )
        )
          color = '#ff6666';
        else if (
          ['gloves', 'glasses', 'shoes', 'ear', 'ear-mufs', 'face', 'foot', 'tool', 'hands', 'head'].includes(
            detection.class
          )
        )
          color = '#ff00ff';

        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x * scaleX, y * scaleY, width * scaleX, height * scaleY);

        ctx.fillStyle = color;
        ctx.font = '16px Arial';
        ctx.fillText(
          `${detection.class}: ${(confidence * 100).toFixed(1)}%`,
          x * scaleX,
          y * scaleY - 5
        );
      });
    },
    []
  );

  useEffect(() => {
    const useBackendDetection = !isLocalOfflineMode();
    if (!useBackendDetection || !streamId) return;

    const stopLoop = () => {
      if (!backendLoopStartedRef.current) return;
      backendLoopStartedRef.current = false;
      stopStreamDetectionLoop(streamId, backendLoopOwnerRef.current)
        .catch((error) => console.error('停止PPE后端检测循环失败:', error));
    };

    if (isCameraOn && isPpeActive) {
      backendLoopStartedRef.current = true;
      startStreamDetectionLoop(streamId, {
        modelId: 'ppe_detection',
        confThreshold: Math.min(captureThreshold, getMinThreshold()),
        ownerId: backendLoopOwnerRef.current,
      }).catch((error) => {
        backendLoopStartedRef.current = false;
        console.error('启动PPE后端检测循环失败:', error);
      });
    } else {
      stopLoop();
    }

    return stopLoop;
  }, [captureThreshold, getMinThreshold, isCameraOn, isPpeActive, streamId]);

  // 实时PPE检测
  const runPpeDetection = useCallback(async (): Promise<string[] | null> => {
    if (!isPpeActive || !videoRef.current || !detectionCanvasRef.current) {
      return null;
    }

    if (isDetectingRef.current) {
      return null;
    }

    isDetectingRef.current = true;
    setIsDetecting(true);
    let autoCapturedImages: string[] | null = null;

    try {
      const useBackendDetection =
        !isLocalOfflineMode() && Boolean(streamId);
      let base64Data = '';
      let detections: YoloDetection[] = [];
      let sourceSize: { width: number; height: number } | undefined;
      let currentFrameId = 0;

      if (useBackendDetection && streamId) {
        try {
          const result = await fetchStreamDetections(streamId);
          const backendDetections = result.detections as BackendYoloDetection[];
          currentFrameId = result.frameId || 0;
          detections = filterDetections(
            backendDetections.map(mapBackendDetection),
            Math.min(captureThreshold, getMinThreshold())
          );
          if (result.sourceSize) {
            sourceSize = result.sourceSize;
          }
        } catch (error) {
          console.error('拉取PPE后端检测结果失败:', error);
        }
      } else {
        const canvas = document.createElement('canvas');

        if (!videoRef.current || videoRef.current.videoWidth <= 0 || videoRef.current.videoHeight <= 0) {
          return null;
        }

        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          return null;
        }

        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        base64Data = dataUrl.split(',')[1];

        if (!base64Data) {
          return null;
        }

        detections = await performCaptureDetection(base64Data);
      }

      const personCount = detections.filter((d) => d.class === 'person').length;
      const equipmentCount = detections.filter((d) =>
        [
          'cleanroom_cap',
          'mask',
          'Hardhat',
          'helmet',
          'hat',
          'no_cleanroom_cap',
          'no_mask',
          'NO-Hardhat',
          'NO-Safety Vest',
        ].includes(d.class)
      ).length;

      setDetectionStats({
        totalDetections: detections.length,
        personDetections: personCount,
        equipmentDetections: equipmentCount,
      });

      if (detectionCanvasRef.current && videoRef.current && showDetections) {
        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;

        if (videoWidth > 0 && videoHeight > 0) {
          detectionCanvasRef.current.width = videoWidth;
          detectionCanvasRef.current.height = videoHeight;
          drawDetections(detections, detectionCanvasRef.current, sourceSize);
        }
      }

      const personDetections = detections.filter(
        (d) => d.class === 'person' && d.confidence >= ppeThresholds.person
      );

      if (personDetections.length > 0 && autoCapture) {
        const currentTime = Date.now();
        const timeSinceLastCapture = currentTime - lastCaptureTime;
        const intervalMs = captureInterval * 1000;

        const avgConfidence =
          personDetections.reduce((sum, d) => sum + d.confidence, 0) / personDetections.length;

        if (timeSinceLastCapture >= intervalMs && personDetections.length > 0) {
          const finalImageData =
            bestDetectionInInterval?.imageData ||
            base64Data ||
            (await fetchBackendSnapshotBase64(currentFrameId)) ||
            (await captureCurrentFrame()) ||
            '';
          const capturedImages = await handleAutoCapture(detections, finalImageData);

          if (capturedImages?.length) {
            setLastCaptureTime(currentTime);
            setBestDetectionInInterval(null);
            autoCapturedImages = capturedImages;
          }
        } else {
          const currentBest = bestDetectionInInterval;
          const shouldUpdate = !currentBest || avgConfidence > currentBest.confidence;

          if (shouldUpdate) {
            const imageData =
              base64Data ||
              (await fetchBackendSnapshotBase64(currentFrameId)) ||
              (await captureCurrentFrame());
            setBestDetectionInInterval({
              detections,
              imageData: imageData || '',
              confidence: avgConfidence,
              timestamp: currentTime,
            });
          }
        }
      }
    } catch (error) {
      console.error('实时PPE检测失败:', error);
    } finally {
      isDetectingRef.current = false;
      setIsDetecting(false);
    }
    return autoCapturedImages;
  }, [
    isPpeActive,
    streamId,
    videoRef,
    detectionCanvasRef,
    performCaptureDetection,
    drawDetections,
    filterDetections,
    getMinThreshold,
    mapBackendDetection,
    showDetections,
    ppeThresholds,
    autoCapture,
    captureInterval,
    lastCaptureTime,
    bestDetectionInInterval,
    setBestDetectionInInterval,
    handleAutoCapture,
    captureCurrentFrame,
    fetchBackendSnapshotBase64,
  ]);

  // 画布尺寸设置
  useEffect(() => {
    if (!detectionCanvasRef.current || !videoRef.current || !showDetections || !isPpeActive) return;

    const canvas = detectionCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [showDetections, isPpeActive, isCameraOn, videoRef, detectionCanvasRef]);

  return {
    performDetection,
    performCaptureDetection,
    drawDetections,
    detectionStats,
    isDetecting,
    isDetectingRef,
    lastCaptureTime,
    setLastCaptureTime,
    runPpeDetection,
  };
};
