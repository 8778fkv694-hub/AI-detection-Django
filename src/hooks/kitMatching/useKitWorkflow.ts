/**
 * Kit Matching Workflow Hook
 *
 * 用途：管理齐套化检测的工作流状态
 * 功能：工作流状态转换、完成检测逻辑、冷却时间管理
 * 使用位置：KitMatchingScreen
 */

import { useCallback, useEffect } from 'react';
import type { KitWorkflowState } from '@/types/kitMatching';

interface UseKitWorkflowOptions {
  // 状态管理
  isComplete: boolean;
  setIsComplete: (value: boolean) => void;
  isInPostDetectionDelay: boolean;
  setIsInPostDetectionDelay: (value: boolean) => void;
  isInCooldown: boolean;
  setIsInCooldown: (value: boolean) => void;
  isWaitingForCooldown: boolean;
  setIsWaitingForCooldown: (value: boolean) => void;

  // 配置
  postDetectionDelay: number;
  inspectionCooldownInterval: number;

  // Refs
  lastInspectionTimeRef: React.MutableRefObject<number>;
  postDetectionDelayTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

export const useKitWorkflow = ({
  isComplete,
  setIsComplete,
  isInPostDetectionDelay,
  setIsInPostDetectionDelay,
  isInCooldown,
  setIsInCooldown,
  isWaitingForCooldown,
  setIsWaitingForCooldown,
  postDetectionDelay,
  inspectionCooldownInterval,
  lastInspectionTimeRef,
  postDetectionDelayTimerRef,
}: UseKitWorkflowOptions) => {
  /**
   * 重置工作流状态
   */
  const resetWorkflow = useCallback(() => {
    setIsComplete(false);
    setIsInPostDetectionDelay(false);
    setIsInCooldown(false);
    setIsWaitingForCooldown(false);

    // 清除延时计时器
    if (postDetectionDelayTimerRef.current) {
      clearTimeout(postDetectionDelayTimerRef.current);
      postDetectionDelayTimerRef.current = null;
    }
  }, [
    setIsComplete,
    setIsInPostDetectionDelay,
    setIsInCooldown,
    setIsWaitingForCooldown,
    postDetectionDelayTimerRef,
  ]);

  /**
   * 开始后检测延时
   */
  const startPostDetectionDelay = useCallback(() => {
    setIsInPostDetectionDelay(true);
    setIsComplete(true);

    // 清除之前的计时器
    if (postDetectionDelayTimerRef.current) {
      clearTimeout(postDetectionDelayTimerRef.current);
    }

    // 设置新的延时计时器
    postDetectionDelayTimerRef.current = setTimeout(() => {
      setIsInPostDetectionDelay(false);
      console.log('✅ 后检测延时结束');
    }, postDetectionDelay);
  }, [
    setIsInPostDetectionDelay,
    setIsComplete,
    postDetectionDelay,
    postDetectionDelayTimerRef,
  ]);

  /**
   * 获取当前工作流状态
   */
  const getWorkflowState = useCallback((): KitWorkflowState => {
    if (isInCooldown) return 'cooldown';
    if (isInPostDetectionDelay) return 'post_detection_delay';
    if (isComplete) return 'completed';
    if (isWaitingForCooldown) return 'cooldown';
    return 'idle';
  }, [isComplete, isInPostDetectionDelay, isInCooldown, isWaitingForCooldown]);

  /**
   * 检查是否在冷却期
   */
  const checkCooldownStatus = useCallback(() => {
    if (isWaitingForCooldown && lastInspectionTimeRef.current > 0) {
      const elapsedTime = Date.now() - lastInspectionTimeRef.current;
      const cooldownRemainingMs = inspectionCooldownInterval * 1000 - elapsedTime; // 转换为毫秒

      if (cooldownRemainingMs > 0) {
        setIsInCooldown(true);
        return true;
      } else {
        setIsWaitingForCooldown(false);
        setIsInCooldown(false);
        return false;
      }
    }
    return false;
  }, [
    isWaitingForCooldown,
    inspectionCooldownInterval,
    lastInspectionTimeRef,
    setIsInCooldown,
    setIsWaitingForCooldown,
  ]);

  // 监听冷却状态
  useEffect(() => {
    if (!isWaitingForCooldown) return;

    const checkInterval = setInterval(() => {
      checkCooldownStatus();
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [isWaitingForCooldown, checkCooldownStatus]);

  // 清理延时计时器
  useEffect(() => {
    return () => {
      if (postDetectionDelayTimerRef.current) {
        clearTimeout(postDetectionDelayTimerRef.current);
      }
    };
  }, [postDetectionDelayTimerRef]);

  return {
    resetWorkflow,
    startPostDetectionDelay,
    getWorkflowState,
    checkCooldownStatus,
  };
};
