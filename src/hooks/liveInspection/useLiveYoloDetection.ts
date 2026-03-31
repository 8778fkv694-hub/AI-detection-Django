/**
 * Live YOLO Detection Hook
 *
 * 用途：YOLO检测逻辑与目标判定
 * 功能：执行YOLO检测、OR/AND模式判断、自动抓拍触发
 * 使用位置：LiveInspectionScreen
 */

import { useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { yoloDetectBackend } from '@/lib/api';
import type { BackendYoloDetection } from '@/types';

export interface UseLiveYoloDetectionOptions {
  /** 视频元素引用 */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** 画布元素引用 */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** YOLO检测是否激活 */
  isYoloActive: boolean;
  /** 设置YOLO检测状态 */
  setIsYoloActive: (value: boolean) => void;
  /** 检测置信度 */
  detectionConfidence: number;
  /** 选中的检测目标 */
  selectedTargets: string[];
  /** 检测模式 */
  yoloDetectionMode: 'or' | 'and';
  /** AND模式超时时间 */
  yoloTimeoutSeconds: number;
  /** 图片保存模式 */
  imageSaveMode: 'full' | 'roi';
  /** 是否自动抓拍 */
  autoCapture: boolean;
  /** 是否自动AI检测 */
  autoAIDetectionEnabled: boolean;
  /** 是否显示检测框 */
  showDetections: boolean;
  /** 检测到的元素 */
  detectedElements: string[];
  /** 设置检测到的元素 */
  setDetectedElements: (elements: string[]) => void;
  /** 元素检测开始时间 */
  elementDetectionStartTime: number | null;
  /** 设置元素检测开始时间 */
  setElementDetectionStartTime: (time: number | null) => void;
  /** 检测结果 */
  detectionResults: BackendYoloDetection[];
  /** 设置检测结果 */
  setDetectionResults: (results: BackendYoloDetection[]) => void;
  /** 是否已抓拍等待检测 */
  hasCapturedForDetection: boolean;
  /** 设置是否已抓拍 */
  setHasCapturedForDetection: (value: boolean) => void;
  /** 是否等待AI结果 */
  isWaitingForAIResult: boolean;
  /** 设置是否等待AI结果 */
  setIsWaitingForAIResult: (value: boolean) => void;
  /** 上次抓拍时间 */
  lastCaptureTime: number;
  /** 设置上次抓拍时间 */
  setLastCaptureTime: (time: number) => void;
  /** 自动抓拍延迟 */
  autoCaptureDelay: number;
  /** 压缩图片函数 */
  compressImage: (base64: string) => Promise<string>;
  /** 裁剪ROI函数 */
  cropImageToROI: (base64: string, detections: BackendYoloDetection[]) => Promise<string>;
  /** 添加抓拍图片 */
  addCapturedImage: (image: string) => void;
  /** 直接AI检测函数 */
  handleDirectAIDetection: (imageBase64: string) => Promise<void>;
  /** 获取目标中文名称 */
  getTargetChineseName: (target: string) => string;
}

export interface UseLiveYoloDetectionResult {
  /** 执行YOLO检测 */
  performYoloDetection: () => Promise<void>;
  /** 启动/停止YOLO检测 */
  toggleYoloDetection: () => void;
}

export const useLiveYoloDetection = ({
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
}: UseLiveYoloDetectionOptions): UseLiveYoloDetectionResult => {
  // YOLO检测
  const performYoloDetection = useCallback(async () => {
    if (!videoRef.current || !isCameraOn || !isYoloActive) return;

    // 如果已经抓拍过且正在等待AI结果，则跳过检测
    if (hasCapturedForDetection && isWaitingForAIResult) {
      return;
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

      const detections = await yoloDetectBackend(base64Image, detectionConfidence);
      setDetectionResults(detections);

      // 检查是否检测到设置的目标
      const targetDetections = detections.filter(
        (detection) => selectedTargets.includes(detection.label) && detection.confidence >= detectionConfidence
      );

      const detectedLabels = targetDetections.map((d) => d.label);

      // 获取所有检测到的目标元素
      const allDetectedTargets = detections.filter((detection) => selectedTargets.includes(detection.label));
      const allDetectedLabels = allDetectedTargets.map((d) => d.label);

      // 根据检测模式进行判断
      let shouldTriggerCapture = false;
      let shouldResetDetection = false;

      if (yoloDetectionMode === 'or') {
        // OR模式：检测到任一元素即抓拍
        shouldTriggerCapture = targetDetections.length > 0;
        const newDetectedElements = allDetectedLabels.length > 0 ? [...new Set(allDetectedLabels)] : [];
        setDetectedElements(newDetectedElements);
      } else if (yoloDetectionMode === 'and') {
        // AND模式：必须检测到所有元素才抓拍
        const currentTime = Date.now();

        if (allDetectedLabels.length > 0) {
          const newElements = [...new Set([...detectedElements, ...allDetectedLabels])];
          setDetectedElements(newElements);
        }

        if (targetDetections.length > 0) {
          if (!elementDetectionStartTime) {
            setElementDetectionStartTime(currentTime);

            if (selectedTargets.length === 1 && detectedLabels.length === 1 && selectedTargets[0] === detectedLabels[0]) {
              shouldTriggerCapture = true;
            }
          } else {
            const allDetectedElements = [...new Set([...detectedElements, ...detectedLabels])];
            const allTargetsDetected = selectedTargets.every((target) => allDetectedElements.includes(target));

            if (allTargetsDetected) {
              shouldTriggerCapture = true;
            } else {
              const elapsedTime = (currentTime - elementDetectionStartTime) / 1000;
              if (elapsedTime > yoloTimeoutSeconds) {
                shouldResetDetection = true;
              }
            }
          }
        }
      }

      // 重置检测状态
      if (shouldResetDetection) {
        setDetectedElements([]);
        setElementDetectionStartTime(null);
      }

      // YOLO自动抓拍逻辑
      if (autoCapture && shouldTriggerCapture && !hasCapturedForDetection) {
        const now = Date.now();
        if (now - lastCaptureTime > autoCaptureDelay) {
          let processedImage: string;

          if (imageSaveMode === 'roi') {
            processedImage = await cropImageToROI(base64Image, targetDetections);
          } else {
            processedImage = await compressImage(base64Image);
          }

          setHasCapturedForDetection(true);
          setIsWaitingForAIResult(true);
          setLastCaptureTime(now);

          if (yoloDetectionMode === 'and') {
            setDetectedElements([]);
            setElementDetectionStartTime(null);
          }

          if (autoAIDetectionEnabled) {
            const modeText = imageSaveMode === 'roi' ? 'ROI截图' : '全画面';
            const detectedText =
              detectedLabels.length > 0 ? detectedLabels.map((l) => getTargetChineseName(l)).join(', ') : '目标';
            toast.success(`检测到${detectedText}，已自动抓拍1张${modeText}！正在自动上传AI分析...`);

            setTimeout(() => {
              addCapturedImage(processedImage);
              handleDirectAIDetection(processedImage);
            }, 1000);
          } else {
            const modeText = imageSaveMode === 'roi' ? 'ROI截图' : '全画面';
            const detectedText =
              detectedLabels.length > 0 ? detectedLabels.map((l) => getTargetChineseName(l)).join(', ') : '目标';
            addCapturedImage(processedImage);
            toast.success(`检测到${detectedText}，已自动抓拍1张${modeText}！请手动点击"AI分析"按钮进行分析`);
          }
        }
      }
    } catch (error) {
      console.error('YOLO检测失败:', error);
    }
  }, [
    isCameraOn,
    isYoloActive,
    detectionConfidence,
    selectedTargets,
    yoloDetectionMode,
    yoloTimeoutSeconds,
    detectedElements,
    elementDetectionStartTime,
    autoCapture,
    autoAIDetectionEnabled,
    hasCapturedForDetection,
    isWaitingForAIResult,
    autoCaptureDelay,
    lastCaptureTime,
    compressImage,
    cropImageToROI,
    imageSaveMode,
    setDetectedElements,
    setElementDetectionStartTime,
    setDetectionResults,
    setHasCapturedForDetection,
    setIsWaitingForAIResult,
    setLastCaptureTime,
    addCapturedImage,
    handleDirectAIDetection,
    getTargetChineseName,
    videoRef,
  ]);

  // 启动/停止YOLO检测
  const toggleYoloDetection = useCallback(() => {
    if (!isCameraOn) {
      toast.error('请先开启摄像头');
      return;
    }
    setIsYoloActive(!isYoloActive);
    if (!isYoloActive) {
      toast.success('YOLO检测已启动');
    } else {
      toast.error('YOLO检测已停止');
    }
  }, [isCameraOn, isYoloActive, setIsYoloActive]);

  // YOLO检测循环
  useEffect(() => {
    if (!isYoloActive || !isCameraOn) return;

    const interval = setInterval(performYoloDetection, 500);
    return () => clearInterval(interval);
  }, [isYoloActive, isCameraOn, performYoloDetection]);

  // 在画布上绘制检测框
  useEffect(() => {
    if (!canvasRef.current || !videoRef.current || !showDetections || !isYoloActive) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) return;

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detectionResults.forEach((detection) => {
      const { x1, y1, x2, y2 } = detection.bbox;
      const width = x2 - x1;
      const height = y2 - y1;

      // 根据检测类别设置颜色
      let color = '#FF0000';
      if (detection.label === 'filter') color = '#ff6600';
      else if (detection.label === 'name_MCF') color = '#0066ff';
      else if (detection.label === 'nsplogo') color = '#ff0066';
      else if (detection.label === 'qrcode') color = '#66ff00';
      else if (detection.label === 'anti_counterfeit_label') color = '#ffcc00';
      else if (detection.label === 'service_label') color = '#00ccff';
      else if (detection.label === 'nameplate_label') color = '#cc00ff';
      else if (detection.label === 'water_efficiency_label') color = '#00ffcc';
      else if (detection.label === 'barcode_label') color = '#999999';
      else if (detection.label === 'fotile_logo') color = '#ff6600';
      else if (detection.label === 'water_outlet') color = '#0066ff';
      else if (detection.label === 'Prompt_label') color = '#ff0066';
      else if (detection.label === 'yellow_point') color = '#ffff00';
      else if (detection.label === 'glod_logo') color = '#ffd700';

      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      ctx.strokeRect(x1, y1, width, height);

      const label = `${detection.label} ${(detection.confidence * 100).toFixed(1)}%`;
      const labelWidth = ctx.measureText(label).width + 10;
      const labelHeight = 20;

      ctx.fillStyle = color;
      ctx.fillRect(x1, y1 - labelHeight, labelWidth, labelHeight);

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '14px Arial';
      ctx.fillText(label, x1 + 5, y1 - 5);
    });
  }, [detectionResults, showDetections, isYoloActive, canvasRef, videoRef]);

  return {
    performYoloDetection,
    toggleYoloDetection,
  };
};
