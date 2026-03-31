/**
 * Live Config Panel Component
 *
 * 用途：检测配置面板
 * 功能：检测置信度、自动抓拍、自动AI检测、显示检测框、保存模式、标准选择
 * 使用位置：LiveInspectionScreen
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Input } from '@/components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Box } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Standard {
  id: string;
  name: string;
}

export interface LiveConfigPanelProps {
  /** 是否全屏 */
  isFullscreen: boolean;
  /** 检测置信度 */
  detectionConfidence: number;
  /** 设置检测置信度 */
  setDetectionConfidence: (value: number) => void;
  /** 是否自动抓拍 */
  autoCapture: boolean;
  /** 设置自动抓拍 */
  setAutoCapture: (value: boolean) => void;
  /** 是否自动AI检测 */
  autoAIDetectionEnabled: boolean;
  /** 设置自动AI检测 */
  setAutoAIDetectionEnabled: (value: boolean) => void;
  /** 是否显示检测框 */
  showDetections: boolean;
  /** 设置显示检测框 */
  setShowDetections: (value: boolean) => void;
  /** 图片保存模式 */
  imageSaveMode: 'full' | 'roi';
  /** 设置图片保存模式 */
  setImageSaveMode: (value: 'full' | 'roi') => void;
  /** 选中的标准ID */
  selectedStandardId: string | null;
  /** 设置选中的标准ID */
  setSelectedStandardId: (value: string) => void;
  /** 标准列表 */
  standards: Standard[];
}

export const LiveConfigPanel: React.FC<LiveConfigPanelProps> = ({
  isFullscreen,
  detectionConfidence,
  setDetectionConfidence,
  autoCapture,
  setAutoCapture,
  autoAIDetectionEnabled,
  setAutoAIDetectionEnabled,
  showDetections,
  setShowDetections,
  imageSaveMode,
  setImageSaveMode,
  selectedStandardId,
  setSelectedStandardId,
  standards,
}) => {
  return (
    <Card
      className={cn('lg:col-span-3', isFullscreen ? 'hidden' : '')}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Box className="h-5 w-5" />
          检测配置
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 基础设置 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3 bg-slate-800/30 rounded-lg">
          <div>
            <Label className="text-xs">检测置信度</Label>
            <Input
              type="number"
              min="0"
              max="1"
              step="0.1"
              value={detectionConfidence}
              onChange={(e) => setDetectionConfidence(parseFloat(e.target.value))}
              className="h-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={autoCapture} onCheckedChange={setAutoCapture} />
            <Label className="text-xs">自动抓拍</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={autoAIDetectionEnabled} onCheckedChange={setAutoAIDetectionEnabled} />
            <Label className="text-xs">自动AI检测</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={showDetections} onCheckedChange={setShowDetections} />
            <Label className="text-xs">显示检测框</Label>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">自动检测保存模式</Label>
            <Select
              value={imageSaveMode}
              onValueChange={(value: 'full' | 'roi') => setImageSaveMode(value)}
            >
              <SelectTrigger className="w-32 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="full">全画面</SelectItem>
                <SelectItem value="roi">ROI截图</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* AI分析标准选择 */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">AI分析标准</Label>
          <Select value={selectedStandardId || ''} onValueChange={setSelectedStandardId}>
            <SelectTrigger className="w-full h-9">
              <SelectValue placeholder="选择检测标准" />
            </SelectTrigger>
            <SelectContent>
              {standards.map((standard) => (
                <SelectItem key={standard.id} value={standard.id}>
                  {standard.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};
