/**
 * CaptureSettingsPanel Component
 *
 * 用途：抓拍设置面板
 * 功能：自动抓拍开关、防抖时间、延时拍照设置
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { Label } from '@/components/ui/Label';

export interface CaptureSettingsPanelProps {
  /** 是否启用自动抓拍 */
  autoCapture: boolean;
  /** 防抖时间（秒） */
  debounceSeconds: number;
  /** 延时拍照时间（秒） */
  captureDelaySeconds: number;
  /** 设置自动抓拍 */
  setAutoCapture: (enabled: boolean) => void;
  /** 设置防抖时间 */
  setDebounceSeconds: (seconds: number) => void;
  /** 设置延时拍照时间 */
  setCaptureDelaySeconds: (seconds: number) => void;
}

export const CaptureSettingsPanel: React.FC<CaptureSettingsPanelProps> = ({
  autoCapture,
  debounceSeconds,
  captureDelaySeconds,
  setAutoCapture,
  setDebounceSeconds,
  setCaptureDelaySeconds,
}) => {
  return (
    <>
      {/* 自动抓拍设置 */}
      <div className="flex items-center justify-between">
        <Label className="text-sm">自动抓拍</Label>
        <label className="flex items-center space-x-2 cursor-pointer">
          <input
            type="checkbox"
            checked={autoCapture}
            onChange={(e) => setAutoCapture(e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-slate-300">启用</span>
        </label>
      </div>

      {/* 防抖时间设置 */}
      <div className="flex items-center justify-between">
        <Label className="text-sm">防抖时间</Label>
        <div className="flex items-center space-x-2">
          <input
            type="number"
            min="0"
            max="3"
            step="0.1"
            value={debounceSeconds}
            onChange={(e) => setDebounceSeconds(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-20 px-2 py-1 text-sm text-slate-200 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0.3"
          />
          <span className="text-sm text-slate-400">秒</span>
        </div>
      </div>

      {/* 延时拍照设置 */}
      <div className="flex items-center justify-between">
        <Label className="text-sm">延时拍照</Label>
        <div className="flex items-center space-x-2">
          <input
            type="number"
            min="0"
            max="10"
            step="0.5"
            value={captureDelaySeconds}
            onChange={(e) => setCaptureDelaySeconds(Math.max(0, parseFloat(e.target.value) || 0))}
            className="w-20 px-2 py-1 text-sm text-slate-200 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0"
          />
          <span className="text-sm text-slate-400">秒</span>
        </div>
      </div>
    </>
  );
};

export default CaptureSettingsPanel;
