/**
 * Detection Mode Hook
 *
 * 用途：管理 OR/AND 检测模式判断逻辑和防抖机制
 * 功能：元素累积、超时检测、防抖触发
 * 使用位置：OCRDetectionScreen
 */

import { useCallback } from 'react';
import type { BackendYoloDetection } from '@/lib/api';

export interface DetectionModeResult {
  /** 是否应该触发抓拍 */
  shouldTriggerCapture: boolean;
  /** 是否应该重置检测状态 */
  shouldResetDetection: boolean;
  /** 更新后的已检测元素列表 */
  updatedDetectedElements: string[];
  /** 更新后的检测开始时间 */
  updatedStartTime: number | null;
}

export interface DebounceResult {
  /** 防抖后是否真正触发 */
  shouldActuallyTrigger: boolean;
  /** 更新后的防抖开始时间 */
  updatedDebounceStartTime: number | null;
}

export interface UseDetectionModeOptions {
  /** 检测模式：or 或 and */
  yoloDetectionMode: 'or' | 'and';
  /** 超时时间（秒），-1表示永不超时 */
  yoloTimeoutSeconds: number;
  /** 防抖时间（秒） */
  debounceSeconds: number;
  /** 检测置信度阈值 */
  detectionConfidence: number;
}

export interface UseDetectionModeResult {
  /** 评估检测结果，返回是否触发和状态更新 */
  evaluateDetections: (
    detections: BackendYoloDetection[],
    validSelectedTargets: string[],
    currentDetectedElements: string[],
    elementDetectionStartTime: number | null,
    historyDetectionsRef: React.MutableRefObject<Map<string, BackendYoloDetection>>
  ) => DetectionModeResult;
  /** 评估防抖，返回是否真正触发 */
  evaluateDebounce: (
    shouldTriggerCapture: boolean,
    workflowState: string,
    autoCapture: boolean,
    debounceStartTime: number | null,
    detectedLabels: string[]
  ) => DebounceResult;
  /** 重置检测状态 */
  getResetState: () => {
    detectedElements: string[];
    elementDetectionStartTime: null;
    debounceStartTime: null;
  };
}

export const useDetectionMode = ({
  yoloDetectionMode,
  yoloTimeoutSeconds,
  debounceSeconds,
  detectionConfidence,
}: UseDetectionModeOptions): UseDetectionModeResult => {

  // 评估 OR 模式
  const evaluateORMode = useCallback((
    targetDetections: BackendYoloDetection[],
    detectedLabels: string[],
    currentDetectedElements: string[]
  ): DetectionModeResult => {
    const shouldTriggerCapture = targetDetections.length > 0;

    // OR模式也累积检测到的元素，避免标签闪烁
    let updatedDetectedElements = currentDetectedElements;
    if (detectedLabels.length > 0) {
      updatedDetectedElements = [...new Set([...currentDetectedElements, ...detectedLabels])];
    }

    return {
      shouldTriggerCapture,
      shouldResetDetection: false,
      updatedDetectedElements,
      updatedStartTime: null, // OR模式不需要计时
    };
  }, []);

  // 评估 AND 模式
  const evaluateANDMode = useCallback((
    targetDetections: BackendYoloDetection[],
    detectedLabels: string[],
    validSelectedTargets: string[],
    currentDetectedElements: string[],
    elementDetectionStartTime: number | null,
    historyDetectionsRef: React.MutableRefObject<Map<string, BackendYoloDetection>>
  ): DetectionModeResult => {
    const currentTime = Date.now();
    let shouldTriggerCapture = false;
    let shouldResetDetection = false;
    let updatedDetectedElements = currentDetectedElements;
    let updatedStartTime = elementDetectionStartTime;

    // 累积检测到的元素
    if (detectedLabels.length > 0) {
      updatedDetectedElements = [...new Set([...currentDetectedElements, ...detectedLabels])];
    }

    // 保存检测到的目标到历史记录（用于ROI拼接）
    if (targetDetections.length > 0) {
      targetDetections.forEach(detection => {
        historyDetectionsRef.current.set(detection.label, detection);
      });
    }

    if (targetDetections.length > 0) {
      if (!elementDetectionStartTime) {
        // 检查是否所有目标都已检测到
        const allDetectedBeforeStart = validSelectedTargets.every(
          target => updatedDetectedElements.includes(target)
        );

        if (allDetectedBeforeStart) {
          shouldTriggerCapture = true;
          console.log(`✅ AND模式：所有元素已检测到，立即触发抓拍: ${updatedDetectedElements.join(', ')}`);
        } else {
          // 开始计时
          updatedStartTime = currentTime;
          console.log(`⏱️ AND模式：开始检测计时，已检测到: ${detectedLabels.join(', ')}`);

          // 单目标情况
          if (validSelectedTargets.length === 1 && detectedLabels.length === 1 &&
              validSelectedTargets[0] === detectedLabels[0]) {
            shouldTriggerCapture = true;
            console.log(`AND模式：单目标检测完成，立即触发抓拍`);
          }
        }
      } else {
        // 已在计时中，检查是否所有目标都已检测到
        const allDetectedElements = [...new Set([...updatedDetectedElements, ...detectedLabels])];
        const allTargetsDetected = validSelectedTargets.every(
          target => allDetectedElements.includes(target)
        );

        if (allTargetsDetected) {
          shouldTriggerCapture = true;
          console.log(`AND模式：所有元素已检测到，触发抓拍: ${allDetectedElements.join(', ')}`);
        } else {
          // 检查超时
          const elapsedTime = (currentTime - elementDetectionStartTime) / 1000;
          if (yoloTimeoutSeconds > 0 && elapsedTime > yoloTimeoutSeconds) {
            shouldResetDetection = true;
            const missing = validSelectedTargets.filter(t => !allDetectedElements.includes(t));
            console.log(`AND模式：检测超时 (${elapsedTime.toFixed(1)}s)，缺少: ${missing.join(', ')}`);
          }
        }
      }
    } else {
      // 当前帧没有检测到目标，但检查已累积的结果
      const allTargetsDetected = validSelectedTargets.every(
        target => updatedDetectedElements.includes(target)
      );

      if (allTargetsDetected) {
        shouldTriggerCapture = true;
        console.log(`AND模式：已累积完成，触发抓拍: ${updatedDetectedElements.join(', ')}`);
      } else if (elementDetectionStartTime) {
        // 检查超时
        const elapsedTime = (currentTime - elementDetectionStartTime) / 1000;
        if (yoloTimeoutSeconds > 0 && elapsedTime > yoloTimeoutSeconds) {
          shouldResetDetection = true;
          const missing = validSelectedTargets.filter(t => !updatedDetectedElements.includes(t));
          console.log(`AND模式：检测超时 (${elapsedTime.toFixed(1)}s)，缺少: ${missing.join(', ')}`);
        }
      }
    }

    return {
      shouldTriggerCapture,
      shouldResetDetection,
      updatedDetectedElements,
      updatedStartTime,
    };
  }, [yoloTimeoutSeconds]);

  // 主评估函数
  const evaluateDetections = useCallback((
    detections: BackendYoloDetection[],
    validSelectedTargets: string[],
    currentDetectedElements: string[],
    elementDetectionStartTime: number | null,
    historyDetectionsRef: React.MutableRefObject<Map<string, BackendYoloDetection>>
  ): DetectionModeResult => {
    // 过滤出符合条件的检测
    const targetDetections = detections.filter(detection =>
      validSelectedTargets.includes(detection.label) && detection.confidence >= detectionConfidence
    );
    const detectedLabels = targetDetections.map(d => d.label);

    if (yoloDetectionMode === 'or') {
      return evaluateORMode(targetDetections, detectedLabels, currentDetectedElements);
    } else {
      return evaluateANDMode(
        targetDetections,
        detectedLabels,
        validSelectedTargets,
        currentDetectedElements,
        elementDetectionStartTime,
        historyDetectionsRef
      );
    }
  }, [yoloDetectionMode, detectionConfidence, evaluateORMode, evaluateANDMode]);

  // 评估防抖
  const evaluateDebounce = useCallback((
    shouldTriggerCapture: boolean,
    workflowState: string,
    autoCapture: boolean,
    debounceStartTime: number | null,
    detectedLabels: string[]
  ): DebounceResult => {
    let shouldActuallyTrigger = false;
    let updatedDebounceStartTime = debounceStartTime;

    if (shouldTriggerCapture && workflowState === 'idle' && autoCapture) {
      const currentTime = Date.now();

      if (debounceStartTime === null) {
        // 开始防抖计时
        updatedDebounceStartTime = currentTime;
        console.log(`🔍 检测到目标 ${detectedLabels.join(', ')}，开始防抖计时 ${debounceSeconds}秒...`);
      } else {
        // 检查防抖是否完成
        const elapsedTime = (currentTime - debounceStartTime) / 1000;

        if (elapsedTime >= debounceSeconds) {
          shouldActuallyTrigger = true;
          updatedDebounceStartTime = null;
          console.log(`✅ 目标稳定 ${elapsedTime.toFixed(2)}秒，防抖完成，开始抓拍`);
        } else {
          console.log(`⏳ 目标稳定中... ${elapsedTime.toFixed(2)}s / ${debounceSeconds}s`);
        }
      }
    } else {
      // 未检测到目标或条件不满足，重置防抖
      if (debounceStartTime !== null) {
        updatedDebounceStartTime = null;
        console.log(`⏸️ 目标丢失或条件不满足，重置防抖计时`);
      }
    }

    return {
      shouldActuallyTrigger,
      updatedDebounceStartTime,
    };
  }, [debounceSeconds]);

  // 获取重置状态
  const getResetState = useCallback(() => ({
    detectedElements: [] as string[],
    elementDetectionStartTime: null,
    debounceStartTime: null,
  }), []);

  return {
    evaluateDetections,
    evaluateDebounce,
    getResetState,
  };
};
