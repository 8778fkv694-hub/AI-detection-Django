/**
 * DetectionProgressIndicator Component
 *
 * 用途：显示YOLO识别目标检测进度和状态
 * 位置：屏幕右上角（在结果徽章左侧）
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

interface DetectionProgressIndicatorProps {
  isRealtimeActive: boolean;
  selectedTargets: string[];
  detectedElements: string[];
  getTargetChineseName: (target: string) => string;
  isInPostDetectionDelay?: boolean; // 是否在延时期间（检测完成后继续寻找最佳图片）
}

export const DetectionProgressIndicator: React.FC<DetectionProgressIndicatorProps> = ({
  isRealtimeActive,
  selectedTargets,
  detectedElements,
  getTargetChineseName,
  isInPostDetectionDelay = false,
}) => {
  const DEFAULT_RIGHT_OFFSET = 320;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ startX: number; startRight: number } | null>(null);
  const [rightOffset, setRightOffset] = useState(DEFAULT_RIGHT_OFFSET);

  // Only show when realtime is active and there are selected targets
  const validTargets = selectedTargets.filter(target => target != null && typeof target === 'string' && target.trim());
  const detectedArray = Array.isArray(detectedElements) ? detectedElements : [];
  const detectedCount = detectedArray.length;
  const totalCount = validTargets.length;
  const percentage = totalCount > 0 ? Math.round((detectedCount / totalCount) * 100) : 0;

  const clampRightOffset = useCallback((nextRightOffset: number) => {
    if (typeof window === 'undefined') {
      return Math.max(0, nextRightOffset);
    }

    const panelWidth = panelRef.current?.offsetWidth ?? 320;
    const maxRightOffset = Math.max(0, window.innerWidth - panelWidth - 16);
    return Math.min(Math.max(0, nextRightOffset), maxRightOffset);
  }, []);

  useEffect(() => {
    setRightOffset((current) => clampRightOffset(current));
  }, [clampRightOffset]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStateRef.current) {
        return;
      }

      const deltaX = event.clientX - dragStateRef.current.startX;
      setRightOffset(clampRightOffset(dragStateRef.current.startRight - deltaX));
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [clampRightOffset]);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      startX: event.clientX,
      startRight: rightOffset,
    };
  };

  if (!isRealtimeActive || validTargets.length === 0) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className="fixed top-4 z-50 max-w-xs touch-none select-none"
      style={{ right: `${rightOffset}px` }}
      onPointerDown={handlePointerDown}
    >
      <div className="px-4 py-2 rounded-lg border-2 shadow-lg bg-slate-800/95 border-slate-600">
        <div className="space-y-2">
          {/* Progress Display */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-200">识别目标</span>
            <span className="font-bold text-yellow-400">
              {detectedCount}/{totalCount}
            </span>
            <span className="text-xs text-slate-400">
              ({percentage}%)
            </span>
          </div>

          {/* 延时期间提示 */}
          {isInPostDetectionDelay && (
            <div className="flex items-center gap-1.5 text-xs text-blue-300 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/30">
              <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>延时中，继续检测综合评分最佳的图片...</span>
            </div>
          )}

          {/* Target List */}
          <div className="flex flex-wrap gap-1.5 text-xs">
            {validTargets.map((target) => {
              const isDetected = detectedArray.includes(target);
              const chineseName = getTargetChineseName(target);
              return (
                <span
                  key={target}
                  className={`
                    px-2 py-0.5 rounded border
                    ${isDetected
                      ? 'bg-green-500/80 text-white border-green-600'
                      : 'bg-yellow-500/80 text-white border-yellow-600'
                    }
                  `}
                >
                  {chineseName}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
