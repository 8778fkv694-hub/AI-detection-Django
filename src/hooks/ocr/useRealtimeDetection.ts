/**
 * Realtime Detection Hook
 *
 * 用途：管理实时检测状态、refs和检测循环
 * 功能：提供检测队列管理、防抖机制、检测状态追踪
 * 使用位置：OCRDetectionScreen
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import type { BackendYoloDetection } from '@/lib/api';

export interface BestROIData {
  imageDataUrl: string;
  imageBase64: string;
  detection: BackendYoloDetection;
  sharpness: number;
  fullImageDataUrl: string;
}

export interface UseRealtimeDetectionOptions {
  /** 是否启用实时检测 */
  isRealtimeActive: boolean;
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** 工作流状态 */
  workflowState: string;
  /** 检测间隔（秒） */
  detectionInterval: number;
  /** 是否暂停 */
  isPaused: boolean;
}

export interface UseRealtimeDetectionResult {
  /** 是否正在检测 */
  isDetecting: boolean;
  /** 设置检测状态 */
  setIsDetecting: (value: boolean) => void;
  /** 检测状态ref */
  isDetectingRef: React.MutableRefObject<boolean>;
  /** 暂停状态ref */
  isPausedRef: React.MutableRefObject<boolean>;
  /** 检测队列ref */
  detectionQueueRef: React.MutableRefObject<Array<() => Promise<void>>>;
  /** 队列处理状态ref */
  isProcessingQueueRef: React.MutableRefObject<boolean>;
  /** 历史检测记录ref */
  historyDetectionsRef: React.MutableRefObject<Map<string, BackendYoloDetection>>;
  /** 最佳ROI累积ref */
  bestROIsRef: React.MutableRefObject<Map<string, BestROIData>>;
  /** 防抖开始时间ref */
  debounceStartTimeRef: React.MutableRefObject<number | null>;
  /** 防抖时间（秒） */
  debounceSeconds: number;
  /** 设置防抖时间 */
  setDebounceSeconds: (value: number) => void;
  /** 开始检测循环 */
  startDetectionLoop: (callback: () => Promise<void>) => void;
  /** 停止检测循环 */
  stopDetectionLoop: () => void;
  /** 重置检测状态 */
  resetDetectionState: () => void;
  /** 执行检测任务（带队列管理） */
  executeWithQueue: (task: () => Promise<void>) => void;
}

export const useRealtimeDetection = ({
  isRealtimeActive,
  isCameraOn,
  workflowState,
  detectionInterval,
  isPaused,
}: UseRealtimeDetectionOptions): UseRealtimeDetectionResult => {
  // 检测状态
  const [isDetecting, setIsDetecting] = useState(false);
  const [debounceSeconds, setDebounceSeconds] = useState(0.3);

  // 检测状态refs
  const isDetectingRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);

  // 检测队列refs
  const detectionQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingQueueRef = useRef<boolean>(false);

  // 检测记录refs
  const historyDetectionsRef = useRef<Map<string, BackendYoloDetection>>(new Map());
  const bestROIsRef = useRef<Map<string, BestROIData>>(new Map());

  // 防抖ref
  const debounceStartTimeRef = useRef<number | null>(null);

  // 检测循环ref
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 同步暂停状态到ref
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // 执行检测任务（带队列管理）
  const executeWithQueue = useCallback((task: () => Promise<void>) => {
    // 如果队列正在处理或正在检测，将任务加入队列
    if (isProcessingQueueRef.current || isDetectingRef.current) {
      detectionQueueRef.current.push(task);
      if (!isProcessingQueueRef.current) {
        isProcessingQueueRef.current = true;
      }
      return;
    }

    // 否则立即执行
    isProcessingQueueRef.current = true;

    const executeTask = async () => {
      try {
        await task();
      } finally {
        // 处理队列中的下一个任务
        if (detectionQueueRef.current.length > 0) {
          const nextTask = detectionQueueRef.current.shift();
          if (nextTask) {
            setTimeout(() => {
              executeTask();
            }, 0);
          }
        } else {
          isProcessingQueueRef.current = false;
        }
      }
    };

    executeTask();
  }, []);

  // 开始检测循环
  const startDetectionLoop = useCallback((callback: () => Promise<void>) => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
    }

    detectionIntervalRef.current = setInterval(() => {
      callback();
    }, detectionInterval * 1000);
  }, [detectionInterval]);

  // 停止检测循环
  const stopDetectionLoop = useCallback(() => {
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
  }, []);

  // 重置检测状态
  const resetDetectionState = useCallback(() => {
    isDetectingRef.current = false;
    setIsDetecting(false);
    detectionQueueRef.current = [];
    isProcessingQueueRef.current = false;
    historyDetectionsRef.current.clear();
    bestROIsRef.current.clear();
    debounceStartTimeRef.current = null;
  }, []);

  // 自动管理检测循环
  useEffect(() => {
    if (!isRealtimeActive || !isCameraOn || workflowState !== 'idle') {
      stopDetectionLoop();
    }

    return () => {
      stopDetectionLoop();
    };
  }, [isRealtimeActive, isCameraOn, workflowState, stopDetectionLoop]);

  return {
    isDetecting,
    setIsDetecting,
    isDetectingRef,
    isPausedRef,
    detectionQueueRef,
    isProcessingQueueRef,
    historyDetectionsRef,
    bestROIsRef,
    debounceStartTimeRef,
    debounceSeconds,
    setDebounceSeconds,
    startDetectionLoop,
    stopDetectionLoop,
    resetDetectionState,
    executeWithQueue,
  };
};
