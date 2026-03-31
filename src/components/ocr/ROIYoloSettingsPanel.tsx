/**
 * ROI 和 YOLO 检测设置面板
 *
 * 用途：管理自动检测保存模式、ROI权重、YOLO检测逻辑等设置
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ROIYoloSettingsPanelProps {
  // ROI 设置
  imageSaveMode: 'full' | 'roi';
  setImageSaveMode: (mode: 'full' | 'roi') => void;
  roiWeightRatio: { area: number; clarity: number };
  setRoiWeightRatio: (ratio: { area: number; clarity: number }) => void;

  // YOLO 检测逻辑设置
  yoloDetectionMode: 'or' | 'and';
  setYoloDetectionMode: (mode: 'or' | 'and') => void;
  yoloTimeoutSeconds: number;
  setYoloTimeoutSeconds: (seconds: number) => void;

  // AND 模式检测状态
  detectedElements: string[];
  selectedTargets: string[];
  elementDetectionStartTime: number | null;
  isDetectionStatusExpanded: boolean;
  setIsDetectionStatusExpanded: (expanded: boolean) => void;

  // 批处理设置
  batchProcessingMode: 'stitching' | 'batch' | 'traditional';
  setBatchProcessingMode: (mode: 'stitching' | 'batch' | 'traditional') => void;
}

export const ROIYoloSettingsPanel: React.FC<ROIYoloSettingsPanelProps> = ({
  imageSaveMode,
  setImageSaveMode,
  roiWeightRatio,
  setRoiWeightRatio,
  yoloDetectionMode,
  setYoloDetectionMode,
  yoloTimeoutSeconds,
  setYoloTimeoutSeconds,
  detectedElements,
  selectedTargets,
  elementDetectionStartTime,
  isDetectionStatusExpanded,
  setIsDetectionStatusExpanded,

  // 批处理设置
  batchProcessingMode,
  setBatchProcessingMode,
}) => {
  return (
    <div className="space-y-3 border-t border-slate-600/30 pt-3">
      {/* 检测模式选择 - 放在最上面 */}
      <div className="flex items-center justify-between bg-blue-500/10 p-2 rounded-md border border-blue-500/20">
        <Label className="text-sm font-medium text-blue-400">检测模式</Label>
        <Select
          value={batchProcessingMode}
          onValueChange={(value: 'stitching' | 'batch' | 'traditional') => setBatchProcessingMode(value)}
        >
          <SelectTrigger className="w-32 h-8 text-xs border-blue-500/30 bg-slate-900/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="traditional">标准模式</SelectItem>
            <SelectItem value="stitching">拼接模式</SelectItem>
            <SelectItem value="batch">批处理模式</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-sm">自动检测保存模式</Label>
        <Select value={imageSaveMode} onValueChange={(value: 'full' | 'roi') => setImageSaveMode(value)}>
          <SelectTrigger className="w-32 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="full">全画面</SelectItem>
            <SelectItem value="roi">ROI截图</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ROI评分权重比例设置 */}
      {imageSaveMode === 'roi' && (
        <div className="flex items-center justify-between">
          <Label className="text-sm" title="ROI面积权重:清晰度权重">评分权重 (面积:清晰度)</Label>
          <Select
            value={`${roiWeightRatio.area}/${roiWeightRatio.clarity}`}
            onValueChange={(value) => {
              const [area, clarity] = value.split('/').map(Number);
              setRoiWeightRatio({ area, clarity });
            }}
          >
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="100/0">100/0 (仅面积)</SelectItem>
              <SelectItem value="90/10">90/10</SelectItem>
              <SelectItem value="80/20">80/20</SelectItem>
              <SelectItem value="60/40">60/40</SelectItem>
              <SelectItem value="40/60">40/60</SelectItem>
              <SelectItem value="20/80">20/80</SelectItem>
              <SelectItem value="0/100">0/100 (仅清晰度)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* YOLO检测逻辑设置 */}
      <div className="space-y-2">
        <Label className="text-sm">YOLO检测逻辑</Label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="yoloMode"
              value="or"
              checked={yoloDetectionMode === 'or'}
              onChange={(e) => setYoloDetectionMode(e.target.value as 'or' | 'and')}
              className="rounded"
            />
            <span className="text-slate-300">OR (识别任一元素即抓拍)</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="yoloMode"
              value="and"
              checked={yoloDetectionMode === 'and'}
              onChange={(e) => setYoloDetectionMode(e.target.value as 'or' | 'and')}
              className="rounded"
            />
            <span className="text-slate-300">AND (必须全部元素才抓拍)</span>
          </label>
        </div>
      </div>

      {/* AND模式超时设置 */}
      {yoloDetectionMode === 'and' && (
        <div className="flex items-center justify-between">
          <Label className="text-sm">AND模式超时时间</Label>
          <select
            value={yoloTimeoutSeconds === -1 ? '-1' : yoloTimeoutSeconds.toString()}
            onChange={(e) => {
              const value = parseInt(e.target.value);
              setYoloTimeoutSeconds(value === -1 ? -1 : value);
            }}
            className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-100 text-sm"
          >
            <option value="-1">∞ 永不超时</option>
            <option value="3">3秒</option>
            <option value="5">5秒</option>
            <option value="10">10秒</option>
            <option value="15">15秒</option>
          </select>
        </div>
      )}

      {/* 当前检测状态显示 - 可折叠 */}
      {yoloDetectionMode === 'and' && detectedElements.length > 0 && (
        <div className="border border-slate-600/50 rounded-lg overflow-hidden">
          <div
            className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
            onClick={() => setIsDetectionStatusExpanded(!isDetectionStatusExpanded)}
          >
            <Label className="text-xs font-medium">当前检测状态</Label>
            {isDetectionStatusExpanded ? (
              <ChevronUp className="h-3 w-3 text-slate-400" />
            ) : (
              <ChevronDown className="h-3 w-3 text-slate-400" />
            )}
          </div>
          {isDetectionStatusExpanded && (
            <div className="p-2 space-y-1.5 max-h-32 overflow-y-auto">
              <div className="text-xs text-slate-400 break-words">
                <span className="font-medium">已检测到:</span> {detectedElements.join(', ')}
              </div>
              <div className="text-xs text-slate-400 break-words">
                <span className="font-medium">等待元素:</span> {selectedTargets.filter(t => !detectedElements.includes(t)).join(', ')}
              </div>
              {elementDetectionStartTime && (
                <div className="text-xs text-slate-400">
                  <span className="font-medium">检测开始时间:</span> {new Date(elementDetectionStartTime).toLocaleTimeString()}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
