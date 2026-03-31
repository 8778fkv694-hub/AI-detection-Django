/**
 * PPE Threshold Settings Component
 *
 * 用途：PPE阈值设置内容区
 * 使用位置：SafetyEquipmentScreen
 */

import React from 'react';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Button } from '@/components/ui/Button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/Select';

export interface PPEThresholdSettingsProps {
  /** 自动抓拍开关 */
  autoCapture: boolean;
  /** 设置自动抓拍 */
  setAutoCapture: (value: boolean) => void;
  /** PPE阈值 */
  ppeThresholds: Record<string, number>;
  /** 设置PPE阈值 */
  setPpeThresholds: (thresholds: Record<string, number>) => void;
  /** 抓拍间隔 */
  captureInterval: number;
  /** 设置抓拍间隔 */
  setCaptureInterval: (interval: number) => void;
  /** 自动上传数量 */
  autoUploadCount: number;
  /** 设置自动上传数量 */
  setAutoUploadCount: (count: number) => void;
}

// 阈值选项
const THRESHOLD_OPTIONS = [
  { value: '0.3', label: '30%' },
  { value: '0.4', label: '40%' },
  { value: '0.5', label: '50%' },
  { value: '0.6', label: '60%' },
  { value: '0.7', label: '70%' },
  { value: '0.8', label: '80%' },
  { value: '0.85', label: '85%' },
  { value: '0.9', label: '90%' },
  { value: '0.95', label: '95%' },
];

// 间隔选项
const INTERVAL_OPTIONS = [
  { value: '1', label: '1秒' },
  { value: '3', label: '3秒' },
  { value: '5', label: '5秒' },
  { value: '10', label: '10秒' },
  { value: '30', label: '30秒' },
  { value: '60', label: '60秒' },
];

// 上传数量选项
const UPLOAD_COUNT_OPTIONS = [
  { value: '1', label: '1张' },
  { value: '3', label: '3张' },
  { value: '5', label: '5张' },
  { value: '8', label: '8张' },
  { value: '10', label: '10张' },
  { value: '15', label: '15张' },
  { value: '20', label: '20张' },
];

export const PPEThresholdSettings: React.FC<PPEThresholdSettingsProps> = ({
  autoCapture,
  setAutoCapture,
  ppeThresholds,
  setPpeThresholds,
  captureInterval,
  setCaptureInterval,
  autoUploadCount,
  setAutoUploadCount,
}) => {
  const handleThresholdChange = (key: string, value: string) => {
    setPpeThresholds({
      ...ppeThresholds,
      [key]: parseFloat(value),
    });
  };

  const handleResetThresholds = () => {
    setPpeThresholds({
      ...ppeThresholds,
      cleanroom_cap: 0.8,
      mask: 0.8,
      person: 0.8,
    });
  };

  return (
    <div className="space-y-3 rounded-lg bg-slate-800/50 p-3">
      {/* 自动抓拍开关 */}
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm">自动抓拍</Label>
          <div className="text-xs text-slate-400 mt-1">检测到人员时自动抓拍</div>
        </div>
        <Switch checked={autoCapture} onCheckedChange={setAutoCapture} />
      </div>

      {/* 阈值设置区域 */}
      <div className="mt-3 space-y-3 border-t border-white/10 pt-3">
        <div className="text-xs text-slate-400">PPE物品检测阈值设置</div>
        {/* 洁净帽检测阈值 */}
        <div className="flex items-center justify-between">
          <Label className="text-sm">洁净帽检测阈值</Label>
          <Select
            value={ppeThresholds.cleanroom_cap.toString()}
            onValueChange={(value) => handleThresholdChange('cleanroom_cap', value)}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THRESHOLD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 口罩检测阈值 */}
        <div className="flex items-center justify-between">
          <Label className="text-sm">口罩检测阈值</Label>
          <Select
            value={ppeThresholds.mask.toString()}
            onValueChange={(value) => handleThresholdChange('mask', value)}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THRESHOLD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 人员检测阈值 */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">人员检测阈值</Label>
            <div className="text-xs text-slate-400 mt-1">检测到人员时的抓拍触发阈值</div>
          </div>
          <Select
            value={ppeThresholds.person.toString()}
            onValueChange={(value) => handleThresholdChange('person', value)}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THRESHOLD_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 重置阈值按钮 */}
        <div className="flex items-center justify-between">
          <Label className="text-sm">重置为默认值</Label>
          <Button variant="outline" size="sm" onClick={handleResetThresholds} className="w-24">
            重置
          </Button>
        </div>

        {/* 抓拍间隔设置 */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">最优保留间隔(秒)</Label>
            <div className="text-xs text-slate-400 mt-1">
              保留指定时间内置信度最高的检测结果
            </div>
          </div>
          <Select
            value={captureInterval.toString()}
            onValueChange={(value) => setCaptureInterval(parseInt(value))}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERVAL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 自动上传数量设置 */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">自动上传数量</Label>
            <div className="text-xs text-slate-400 mt-1">抓拍多少张图片后自动开始检测</div>
          </div>
          <Select
            value={autoUploadCount.toString()}
            onValueChange={(value) => setAutoUploadCount(parseInt(value))}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {UPLOAD_COUNT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};

export default PPEThresholdSettings;
