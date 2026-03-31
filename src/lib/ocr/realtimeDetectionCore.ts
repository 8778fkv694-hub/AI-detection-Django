/**
 * Realtime Detection Core Utilities
 *
 * 用途：实时检测的核心逻辑（视频帧捕获、YOLO检测、统计更新、结果绘制、ROI处理）
 * 功能：提取两个 OCR 页面中重复的检测核心逻辑
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen
 */

import { yoloDetectBackend } from '@/lib/api';
import { drawDetections } from '@/lib/ocr/detectionDrawer';
import { calculateSharpnessAsync } from '@/lib/imageQuality/sharpnessCalculator';
import type { BackendYoloDetection } from '@/lib/api';

interface DetectionCoreOptions {
  videoElement: HTMLVideoElement;
  detectionCanvas: HTMLCanvasElement | null;
  detectionConfidence: number;
  workflowState: string;
  imageSaveMode?: 'full' | 'roi';
  selectedTargets?: string[];
  roiWeightRatio?: { area: number; clarity: number };
  bestROIsRef?: React.MutableRefObject<Map<string, {
    imageDataUrl: string;
    imageBase64: string;
    detection: BackendYoloDetection;
    sharpness: number;
    fullImageDataUrl: string;
  }>>;
  imageQuality?: number; // JPEG 质量 (0.0-1.0)，默认 0.8
}

interface DetectionCoreResult {
  detections: BackendYoloDetection[];
  dataUrl: string;
  base64Data: string;
  personDetections: number;
  equipmentDetections: number;
}

/**
 * 执行核心检测逻辑：捕获视频帧、执行YOLO检测、更新统计、绘制结果、处理ROI
 */
export const executeDetectionCore = async (
  options: DetectionCoreOptions
): Promise<DetectionCoreResult | null> => {
  const {
    videoElement,
    detectionCanvas,
    detectionConfidence,
    workflowState,
    imageSaveMode = 'full',
    selectedTargets = [],
    roiWeightRatio = { area: 50, clarity: 50 },
    bestROIsRef,
    imageQuality = 0.95,
  } = options;

  // 1. 捕获视频帧
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return null;
  }

  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', imageQuality);
  const base64Data = dataUrl.split(',')[1];

  if (!base64Data) {
    return null;
  }

  // 2. 执行YOLO检测
  const detections = await yoloDetectBackend(base64Data, detectionConfidence);

  // 3. 计算检测统计
  const personDetections = detections.filter(d => d.label === 'person').length;
  const equipmentDetections = detections.filter(d => d.label !== 'person').length;

  // 4. 绘制检测结果到画布
  if (workflowState === 'idle' && detectionCanvas && videoElement) {
    const videoWidth = videoElement.videoWidth;
    const videoHeight = videoElement.videoHeight;

    if (videoWidth > 0 && videoHeight > 0) {
      if (detectionCanvas.width !== videoWidth || detectionCanvas.height !== videoHeight) {
        detectionCanvas.width = videoWidth;
        detectionCanvas.height = videoHeight;
        console.log('画布尺寸更新:', videoWidth, 'x', videoHeight);
      }
      if (detectionCanvas) {
        drawDetections(detections, detectionCanvas);
      }
    } else {
      console.log('视频尺寸无效，跳过绘制检测结果');
    }
  } else if (workflowState !== 'idle' && detectionCanvas) {
    // 如果工作流状态不是idle，确保画布被清空
    const canvasCtx = detectionCanvas.getContext('2d');
    if (canvasCtx) {
      canvasCtx.clearRect(0, 0, detectionCanvas.width, detectionCanvas.height);
      console.log('🔄 检测完成，清空检测画布（工作流状态:', workflowState, '）');
    }
  }

  // 5. 如果ROI模式，处理ROI提取和清晰度计算
  if (imageSaveMode === 'roi' && bestROIsRef) {
    detections.forEach(detection => {
      // 只保存选中的目标
      if (selectedTargets.includes(detection.label) && detection.confidence >= detectionConfidence) {
        // 异步处理ROI提取和清晰度计算
        (async () => {
          try {
            const img = new Image();
            await new Promise<void>((resolve) => {
              img.onload = () => {
                try {
                  let x1, y1, x2, y2;

                  // 处理bbox格式
                  if (detection.bbox.x1 !== undefined && detection.bbox.y1 !== undefined &&
                      detection.bbox.x2 !== undefined && detection.bbox.y2 !== undefined) {
                    if (detection.bbox.x1 > 1 || detection.bbox.y1 > 1 || detection.bbox.x2 > 1 || detection.bbox.y2 > 1) {
                      x1 = detection.bbox.x1;
                      y1 = detection.bbox.y1;
                      x2 = detection.bbox.x2;
                      y2 = detection.bbox.y2;
                    } else {
                      x1 = detection.bbox.x1 * img.width;
                      y1 = detection.bbox.y1 * img.height;
                      x2 = detection.bbox.x2 * img.width;
                      y2 = detection.bbox.y2 * img.height;
                    }
                  } else if ('x' in detection.bbox && 'y' in detection.bbox &&
                             'width' in detection.bbox && 'height' in detection.bbox) {
                    const x = (detection.bbox as any).x;
                    const y = (detection.bbox as any).y;
                    const width = (detection.bbox as any).width;
                    const height = (detection.bbox as any).height;
                    if (x > 1 || y > 1 || width > 1 || height > 1) {
                      x1 = x;
                      y1 = y;
                      x2 = x + width;
                      y2 = y + height;
                    } else {
                      x1 = x * img.width;
                      y1 = y * img.height;
                      x2 = (x + width) * img.width;
                      y2 = (y + height) * img.height;
                    }
                  } else {
                    resolve();
                    return;
                  }

                  x1 = Math.max(0, Math.min(x1, img.width));
                  y1 = Math.max(0, Math.min(y1, img.height));
                  x2 = Math.max(0, Math.min(x2, img.width));
                  y2 = Math.max(0, Math.min(y2, img.height));

                  const roiWidth = x2 - x1;
                  const roiHeight = y2 - y1;

                  if (roiWidth <= 0 || roiHeight <= 0) {
                    resolve();
                    return;
                  }

                  // 创建ROI画布
                  const roiCanvas = document.createElement('canvas');
                  roiCanvas.width = roiWidth;
                  roiCanvas.height = roiHeight;
                  const roiCtx = roiCanvas.getContext('2d');

                  if (!roiCtx) {
                    resolve();
                    return;
                  }

                  // 绘制ROI区域
                  roiCtx.drawImage(img, x1, y1, roiWidth, roiHeight, 0, 0, roiWidth, roiHeight);

                  // 计算ROI面积
                  const roiArea = roiWidth * roiHeight;

                  // 异步计算清晰度
                  const roiImageData = roiCtx.getImageData(0, 0, roiWidth, roiHeight);
                  calculateSharpnessAsync(roiImageData).then(sharpness => {
                    // 检查是否需要更新综合评分最佳的ROI
                    const existing = bestROIsRef.current.get(detection.label);
                    let shouldUpdate = false;

                    if (!existing) {
                      shouldUpdate = true;
                    } else {
                      // 计算综合分数：面积权重和清晰度权重
                      const maxArea = 1920 * 1080;
                      const normalizedArea = Math.min(1, roiArea / maxArea);
                      let existingArea = 0;
                      if (existing.detection.bbox.width && existing.detection.bbox.height) {
                        existingArea = existing.detection.bbox.width * existing.detection.bbox.height;
                      } else if (existing.detection.bbox.x1 !== undefined && existing.detection.bbox.x2 !== undefined) {
                        existingArea = (existing.detection.bbox.x2 - existing.detection.bbox.x1) * (existing.detection.bbox.y2 - existing.detection.bbox.y1);
                      }
                      const normalizedExistingArea = Math.min(1, existingArea / maxArea);

                      const normalizedSharpness = sharpness / 100;
                      const normalizedExistingSharpness = existing.sharpness / 100;

                      const areaWeight = roiWeightRatio.area / 100;
                      const clarityWeight = roiWeightRatio.clarity / 100;
                      const currentScore = normalizedArea * areaWeight + normalizedSharpness * clarityWeight;
                      const existingScore = normalizedExistingArea * areaWeight + normalizedExistingSharpness * clarityWeight;

                      if (currentScore > existingScore) {
                        shouldUpdate = true;
                      }
                    }

                    if (shouldUpdate) {
                      const roiDataUrl = roiCanvas.toDataURL('image/jpeg', imageQuality);
                      bestROIsRef.current.set(detection.label, {
                        imageDataUrl: roiDataUrl,
                        imageBase64: roiDataUrl.split(',')[1],
                        detection: detection,
                        sharpness: sharpness,
                        fullImageDataUrl: dataUrl
                      });
                      console.log(`📸 更新ROI ${detection.label} 的最佳照片，面积: ${roiArea.toFixed(0)}px², 清晰度: ${sharpness.toFixed(2)}`);
                    }

                    resolve();
                  }).catch(err => {
                    console.error('清晰度计算失败:', err);
                    resolve();
                  });
                } catch (error) {
                  console.error('处理ROI失败:', error);
                  resolve();
                }
              };
              img.onerror = () => resolve();
              img.src = dataUrl;
            });
          } catch (error) {
            console.error('ROI处理失败:', error);
          }
        })();
      }
    });
  }

  return {
    detections,
    dataUrl,
    base64Data,
    personDetections,
    equipmentDetections,
  };
};

