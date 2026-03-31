/**
 * Live YOLO Control Panel Component
 *
 * 用途：YOLO检测控制面板
 * 功能：启动/停止检测、置信度滑块
 * 使用位置：LiveInspectionScreen
 */

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Zap } from 'lucide-react';

export interface LiveYoloControlPanelProps {
  /** 摄像头是否开启 */
  isCameraOn: boolean;
  /** YOLO是否激活 */
  isYoloActive: boolean;
  /** 切换YOLO检测回调 */
  onToggleYoloDetection: () => void;
  /** 检测置信度 */
  detectionConfidence: number;
  /** 设置检测置信度 */
  setDetectionConfidence: (value: number) => void;
}

export const LiveYoloControlPanel: React.FC<LiveYoloControlPanelProps> = ({
  isCameraOn,
  isYoloActive,
  onToggleYoloDetection,
  detectionConfidence,
  setDetectionConfidence,
}) => {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm text-slate-300">YOLO检测</Label>
        <Button
          onClick={onToggleYoloDetection}
          disabled={!isCameraOn}
          variant={isYoloActive ? 'default' : 'outline'}
          size="sm"
        >
          <Zap className="mr-1 h-3 w-3" />
          {isYoloActive ? '停止检测' : '开始检测'}
        </Button>
      </div>

      {/* 检测置信度设置 */}
      {isYoloActive && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm text-slate-300">检测置信度</Label>
            <span className="text-xs text-slate-400">{Math.round(detectionConfidence * 100)}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.1"
            value={detectionConfidence}
            onChange={(e) => setDetectionConfidence(parseFloat(e.target.value))}
            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
          />
        </div>
      )}
    </div>
  );
};
