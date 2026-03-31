/**
 * 视频调试信息组件
 *
 * 用途：显示实时检测状态和摄像头调试信息
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';

interface VideoDebugInfoProps {
  // 检测状态
  isRealtimeActive: boolean;
  detectionInterval: number;
  selectedTargets: string[];
  detectionConfidence: number;
  requireQualifiedConfirmation: boolean;
  getTargetChineseName: (target: string) => string;

  // 摄像头调试
  isCameraOn: boolean;
  videoInfo: {
    width: number;
    height: number;
    readyState: number;
  } | null;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export const VideoDebugInfo: React.FC<VideoDebugInfoProps> = ({
  isRealtimeActive,
  detectionInterval,
  selectedTargets,
  detectionConfidence,
  requireQualifiedConfirmation,
  getTargetChineseName,
  isCameraOn,
  videoInfo,
  videoRef,
}) => {
  return (
    <>
      {/* 检测状态显示 */}
      {isRealtimeActive && (
        <div className="mt-2 text-xs text-slate-400">
          <div>检测间隔: {detectionInterval}秒</div>
          <div>检测目标: {selectedTargets.filter(target => target != null).map(target => getTargetChineseName(target)).filter(name => name !== '').join(', ')}</div>
          <div>置信度阈值: {(detectionConfidence * 100).toFixed(0)}%</div>
          <div>合格确认: {requireQualifiedConfirmation ? '需要回车' : '自动继续'}</div>
        </div>
      )}

      {/* 调试信息 */}
      {isCameraOn && videoInfo && (
        <div className="mt-2 text-xs text-slate-500">
          <div>摄像头状态: {isCameraOn ? '已开启' : '已关闭'}</div>
          <div>视频尺寸: {videoInfo.width} x {videoInfo.height}</div>
          <div>视频就绪: {videoInfo.readyState}</div>
          <div>流状态: {videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).active ? '已连接' : '未连接'}</div>
        </div>
      )}
    </>
  );
};
