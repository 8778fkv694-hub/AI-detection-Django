/**
 * VideoOverlayIndicators Component
 *
 * 用途：视频画面叠加层指示器集合
 * 包含：实时检测状态、检测统计、处理中指示器
 * 位置：视频画面上的绝对定位叠加层
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import React from 'react';

interface DetectionStats {
  totalDetections: number;
  qualifiedCount: number;
  unqualifiedCount: number;
  personDetections: number;
  equipmentDetections: number;
  lastDetectionTime: string | number | null;
}

interface VideoOverlayIndicatorsProps {
  isRealtimeActive: boolean;
  isDetecting: boolean;
  detectionStats: DetectionStats;
}

export const VideoOverlayIndicators: React.FC<VideoOverlayIndicatorsProps> = ({
  isRealtimeActive,
  isDetecting,
  detectionStats,
}) => {
  return (
    <>
      {/* 检测统计 */}
      {isRealtimeActive && detectionStats.totalDetections > 0 && (
        <div className="absolute bottom-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs">
          <div>人员: {detectionStats.personDetections}</div>
          <div>装备: {detectionStats.equipmentDetections}</div>
        </div>
      )}

      {/* 检测中指示器 */}
      {isDetecting && (
        <div className="absolute bottom-2 right-2 bg-blue-500 text-white px-2 py-1 rounded text-xs">
          检测中...
        </div>
      )}
    </>
  );
};
