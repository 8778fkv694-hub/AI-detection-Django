/**
 * ROI Processor Hook
 *
 * 用途：管理ROI（Region of Interest）处理逻辑
 * 功能：ROI提取、清晰度计算、综合评分、最佳ROI选择
 * 使用位置：OCRDetectionScreen
 */

import { useCallback, useRef } from 'react';
import { calculateROISharpness, calculateSharpnessAsync } from '@/lib/imageQuality/sharpnessCalculator';
import type { BackendYoloDetection } from '@/lib/api';

export interface BestROIData {
  imageDataUrl: string;
  imageBase64: string;
  detection: BackendYoloDetection;
  sharpness: number;
  fullImageDataUrl: string;
}

export interface ROIWeightRatio {
  area: number;
  clarity: number;
}

export interface UseROIProcessorOptions {
  /** 面积和清晰度权重比例 */
  roiWeightRatio: ROIWeightRatio;
  /** 检测置信度阈值 */
  detectionConfidence: number;
  /** 选中的目标列表 */
  selectedTargets: string[];
}

export interface UseROIProcessorResult {
  /** 最佳ROI累积ref */
  bestROIsRef: React.MutableRefObject<Map<string, BestROIData>>;
  /** 提取并评估单个检测的ROI */
  extractAndEvaluateROI: (
    detection: BackendYoloDetection,
    dataUrl: string,
    validSelectedTargets: string[]
  ) => Promise<void>;
  /** 批量提取并评估ROI（异步） */
  batchExtractROIs: (
    detections: BackendYoloDetection[],
    dataUrl: string,
    validSelectedTargets: string[]
  ) => void;
  /** 计算综合评分 */
  calculateCompositeScore: (roiData: { detection: any; sharpness: number }) => number;
  /** 从图像数据中提取ROI坐标 */
  extractROICoordinates: (
    detection: BackendYoloDetection,
    imgWidth: number,
    imgHeight: number
  ) => { x1: number; y1: number; x2: number; y2: number } | null;
  /** 在延时期间捕获并评估ROI */
  captureAndEvaluateFrame: (
    videoRef: React.RefObject<HTMLVideoElement>,
    frameDataUrl: string,
    detections: BackendYoloDetection[],
    validSelectedTargets: string[],
    localBestROIs: Map<string, BestROIData>
  ) => Promise<void>;
  /** 合并延时期间的ROI和实时检测累积的ROI */
  mergeROIs: (
    delayROIs: Map<string, BestROIData>,
    realtimeROIs: Map<string, BestROIData>
  ) => Map<string, BestROIData>;
  /** 重置ROI状态 */
  resetROIs: () => void;
}

export const useROIProcessor = ({
  roiWeightRatio,
  detectionConfidence,
  selectedTargets: _selectedTargets,
}: UseROIProcessorOptions): UseROIProcessorResult => {
  // _selectedTargets 保留用于将来可能的扩展，当前过滤逻辑在调用方传入 validSelectedTargets
  // 最佳ROI累积
  const bestROIsRef = useRef<Map<string, BestROIData>>(new Map());

  // 从检测结果中提取ROI坐标
  const extractROICoordinates = useCallback((
    detection: BackendYoloDetection,
    imgWidth: number,
    imgHeight: number
  ): { x1: number; y1: number; x2: number; y2: number } | null => {
    let x1: number, y1: number, x2: number, y2: number;

    // 处理 x1, y1, x2, y2 格式
    if (detection.bbox.x1 !== undefined && detection.bbox.y1 !== undefined &&
      detection.bbox.x2 !== undefined && detection.bbox.y2 !== undefined) {
      if (detection.bbox.x1 > 1 || detection.bbox.y1 > 1 || detection.bbox.x2 > 1 || detection.bbox.y2 > 1) {
        x1 = detection.bbox.x1;
        y1 = detection.bbox.y1;
        x2 = detection.bbox.x2;
        y2 = detection.bbox.y2;
      } else {
        x1 = detection.bbox.x1 * imgWidth;
        y1 = detection.bbox.y1 * imgHeight;
        x2 = detection.bbox.x2 * imgWidth;
        y2 = detection.bbox.y2 * imgHeight;
      }
    }
    // 处理 x, y, width, height 格式
    else if ('x' in detection.bbox && 'y' in detection.bbox &&
      'width' in detection.bbox && 'height' in detection.bbox) {
      const { x, y, width, height } = detection.bbox as { x: number; y: number; width: number; height: number };
      if (x > 1 || y > 1 || width > 1 || height > 1) {
        x1 = x;
        y1 = y;
        x2 = x + width;
        y2 = y + height;
      } else {
        x1 = x * imgWidth;
        y1 = y * imgHeight;
        x2 = (x + width) * imgWidth;
        y2 = (y + height) * imgHeight;
      }
    } else {
      return null;
    }

    // 确保坐标在范围内
    x1 = Math.max(0, Math.min(x1, imgWidth));
    y1 = Math.max(0, Math.min(y1, imgHeight));
    x2 = Math.max(0, Math.min(x2, imgWidth));
    y2 = Math.max(0, Math.min(y2, imgHeight));

    const roiWidth = x2 - x1;
    const roiHeight = y2 - y1;

    if (roiWidth <= 0 || roiHeight <= 0) {
      return null;
    }

    return { x1, y1, x2, y2 };
  }, []);

  // 每个 label 的历史最大面积（用于归一化）
  const labelMaxAreaRef = useRef<Map<string, number>>(new Map());

  // 计算综合评分（面积按同类目标相对归一化，不受目标天生大小影响）
  const calculateCompositeScore = useCallback((roiData: {
    detection: any;
    sharpness: number;
  }): number => {
    let roiArea = 0;

    if (roiData.detection.bbox.width && roiData.detection.bbox.height) {
      roiArea = roiData.detection.bbox.width * roiData.detection.bbox.height;
    } else if (roiData.detection.bbox.x1 !== undefined && roiData.detection.bbox.x2 !== undefined) {
      roiArea = (roiData.detection.bbox.x2 - roiData.detection.bbox.x1) *
        (roiData.detection.bbox.y2 - roiData.detection.bbox.y1);
    }

    // 更新该 label 的历史最大面积
    const label = roiData.detection.label || '_unknown';
    const prevMax = labelMaxAreaRef.current.get(label) || 0;
    if (roiArea > prevMax) {
      labelMaxAreaRef.current.set(label, roiArea);
    }
    const maxArea = labelMaxAreaRef.current.get(label) || roiArea || 1;

    // 面积按同类目标的相对比例归一化（0~1），不受目标天生大小影响
    const normalizedArea = Math.min(1, roiArea / maxArea);
    const normalizedSharpness = roiData.sharpness / 100;

    const areaWeight = roiWeightRatio.area / 100;
    const clarityWeight = roiWeightRatio.clarity / 100;

    return normalizedArea * areaWeight + normalizedSharpness * clarityWeight;
  }, [roiWeightRatio]);

  // 判断是否应该更新ROI
  const shouldUpdateROI = useCallback((
    newROI: { detection: any; sharpness: number },
    existingROI: BestROIData | undefined
  ): boolean => {
    if (!existingROI) {
      return true;
    }

    const newScore = calculateCompositeScore(newROI);
    const existingScore = calculateCompositeScore(existingROI);

    return newScore > existingScore;
  }, [calculateCompositeScore]);

  // 提取并评估单个检测的ROI（异步）
  const extractAndEvaluateROI = useCallback(async (
    detection: BackendYoloDetection,
    dataUrl: string,
    validSelectedTargets: string[]
  ): Promise<void> => {
    // 只处理选中的目标
    if (!validSelectedTargets.includes(detection.label) || detection.confidence < detectionConfidence) {
      return;
    }

    return new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = async () => {
        try {
          const coords = extractROICoordinates(detection, img.width, img.height);
          if (!coords) {
            resolve();
            return;
          }

          const { x1, y1, x2, y2 } = coords;
          const roiWidth = x2 - x1;
          const roiHeight = y2 - y1;

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

          // 异步计算清晰度
          const roiImageData = roiCtx.getImageData(0, 0, roiWidth, roiHeight);
          const sharpness = await calculateSharpnessAsync(roiImageData);

          // 检查是否需要更新
          const existing = bestROIsRef.current.get(detection.label);
          if (shouldUpdateROI({ detection, sharpness }, existing)) {
            const roiDataUrl = roiCanvas.toDataURL('image/png');
            bestROIsRef.current.set(detection.label, {
              imageDataUrl: roiDataUrl,
              imageBase64: roiDataUrl.split(',')[1],
              detection: detection,
              sharpness: sharpness,
              fullImageDataUrl: dataUrl
            });
            const roiArea = roiWidth * roiHeight;
            console.log(`📸 ROI ${detection.label} 更新: 清晰度=${sharpness.toFixed(1)}, 面积=${roiArea.toFixed(0)}px²`);
          } else if (existing) {
            console.log(`⏭️ ROI ${detection.label} 跳过: 当前清晰度=${sharpness.toFixed(1)} <= 已有=${existing.sharpness.toFixed(1)}`);
          }

          resolve();
        } catch (error) {
          console.error('处理ROI失败:', error);
          resolve();
        }
      };
      img.onerror = () => resolve();
      img.src = dataUrl;
    });
  }, [detectionConfidence, extractROICoordinates, shouldUpdateROI]);

  // 批量提取并评估ROI（异步，不阻塞主线程）
  const batchExtractROIs = useCallback((
    detections: BackendYoloDetection[],
    dataUrl: string,
    validSelectedTargets: string[]
  ): void => {
    detections.forEach(detection => {
      // 使用异步IIFE处理每个检测
      (async () => {
        try {
          await extractAndEvaluateROI(detection, dataUrl, validSelectedTargets);
        } catch (error) {
          console.error('ROI处理失败:', error);
        }
      })();
    });
  }, [extractAndEvaluateROI]);

  // 在延时期间捕获并评估ROI帧
  // _videoRef 保留用于将来可能需要直接访问视频元素的扩展
  const captureAndEvaluateFrame = useCallback(async (
    _videoRef: React.RefObject<HTMLVideoElement>,
    frameDataUrl: string,
    detections: BackendYoloDetection[],
    validSelectedTargets: string[],
    localBestROIs: Map<string, BestROIData>
  ): Promise<void> => {
    // 过滤出目标检测
    const targetDetections = detections.filter(detection =>
      validSelectedTargets.includes(detection.label) && detection.confidence >= detectionConfidence
    );

    // 对每个检测到的ROI计算清晰度
    for (const detection of targetDetections) {
      await new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => {
          try {
            const coords = extractROICoordinates(detection, img.width, img.height);
            if (!coords) {
              resolve();
              return;
            }

            const { x1, y1, x2, y2 } = coords;
            const roiWidth = x2 - x1;
            const roiHeight = y2 - y1;

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

            // 计算清晰度
            // 计算清晰度
            const roiImageData = roiCtx.getImageData(0, 0, roiWidth, roiHeight);
            const sharpness = calculateROISharpness(roiImageData);
            // const roiArea = roiWidth * roiHeight;

            // 检查是否需要更新最清晰的ROI
            const existing = localBestROIs.get(detection.label);
            if (shouldUpdateROI({ detection, sharpness }, existing)) {
              const roiDataUrl = roiCanvas.toDataURL('image/png');
              localBestROIs.set(detection.label, {
                imageDataUrl: roiDataUrl,
                imageBase64: roiDataUrl.split(',')[1],
                detection: detection,
                sharpness: sharpness,
                fullImageDataUrl: frameDataUrl
              });
              const roiArea = roiWidth * roiHeight;
              console.log(`📸 延时ROI ${detection.label}: 清晰度=${sharpness.toFixed(1)}, 面积=${roiArea.toFixed(0)}px²`);
            } else if (existing) {
              console.log(`⏭️ 延时ROI ${detection.label} 跳过: 清晰度=${sharpness.toFixed(1)} <= 已有=${existing.sharpness.toFixed(1)}`);
            }

            resolve();
          } catch (error) {
            console.error('处理ROI失败:', error);
            resolve();
          }
        };
        img.onerror = () => resolve();
        img.src = frameDataUrl;
      });
    }
  }, [detectionConfidence, extractROICoordinates, shouldUpdateROI]);

  // 合并延时期间的ROI和实时检测累积的ROI
  const mergeROIs = useCallback((
    delayROIs: Map<string, BestROIData>,
    realtimeROIs: Map<string, BestROIData>
  ): Map<string, BestROIData> => {
    const mergedROIs = new Map(realtimeROIs);

    delayROIs.forEach((delayROI, key) => {
      const existingROI = mergedROIs.get(key);

      if (!existingROI) {
        // 实时检测没有这个类别，直接使用延时期间的
        mergedROIs.set(key, delayROI);
        console.log(`📸 添加延时ROI ${key}（实时检测无此类别）`);
      } else {
        // 比较综合分数，保留更高分的
        const delayScore = calculateCompositeScore(delayROI);
        const existingScore = calculateCompositeScore(existingROI);

        if (delayScore > existingScore) {
          mergedROIs.set(key, delayROI);
          // console.log(`✅ 延时ROI分数更高(${delayScore.toFixed(3)} > ${existingScore.toFixed(3)})，更新 ${key}`);
        } else {
          // console.log(`⏭️ 实时ROI分数更高(${existingScore.toFixed(3)} >= ${delayScore.toFixed(3)})，保留 ${key}`);
        }
      }
    });

    return mergedROIs;
  }, [calculateCompositeScore]);

  // 重置ROI状态
  const resetROIs = useCallback(() => {
    bestROIsRef.current.clear();
  }, []);

  return {
    bestROIsRef,
    extractAndEvaluateROI,
    batchExtractROIs,
    calculateCompositeScore,
    extractROICoordinates,
    captureAndEvaluateFrame,
    mergeROIs,
    resetROIs,
  };
};
