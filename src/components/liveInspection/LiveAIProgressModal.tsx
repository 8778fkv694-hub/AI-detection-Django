/**
 * Live AI Progress Modal Component
 *
 * 用途：AI分析进度弹窗
 * 功能：显示进度、状态、取消按钮
 * 使用位置：LiveInspectionScreen
 */

import React from 'react';
import { Button } from '@/components/ui/Button';

export interface ProgressState {
  totalImages: number;
  completedImages: number;
  currentImageIndex: number;
  currentStatus: string;
  errors: string[];
}

export interface LiveAIProgressModalProps {
  /** 是否显示 */
  isVisible: boolean;
  /** 进度状态 */
  progressState: ProgressState;
  /** 取消回调 */
  onCancel: () => void;
}

export const LiveAIProgressModal: React.FC<LiveAIProgressModalProps> = ({
  isVisible,
  progressState,
  onCancel,
}) => {
  if (!isVisible) return null;

  const percentage = progressState.totalImages > 0
    ? Math.round((progressState.completedImages / progressState.totalImages) * 100)
    : 0;

  return (
    <div className="fixed top-4 right-4 z-50 bg-slate-800 border border-slate-600 rounded-lg p-4 shadow-lg max-w-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
          <span className="text-sm font-medium text-slate-200">AI分析中...</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="h-6 w-6 p-0 text-slate-400 hover:text-slate-300"
        >
          ×
        </Button>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-slate-400">
          <span>进度: {progressState.completedImages}/{progressState.totalImages}</span>
          <span>{percentage}%</span>
        </div>
        <div className="w-full bg-slate-700 rounded-full h-1.5">
          <div
            className="bg-blue-400 h-1.5 rounded-full transition-all duration-300"
            style={{ width: `${percentage}%` }}
          ></div>
        </div>
        <div className="text-xs text-slate-400">
          {progressState.currentStatus}
        </div>
      </div>
    </div>
  );
};
