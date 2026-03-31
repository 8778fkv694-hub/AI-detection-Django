/**
 * SmartPreprocessingPanel Component
 *
 * 用途：智能图像预处理设置面板
 * 功能：启用/禁用智能预处理、预处理方案选择、图像质量指标、预处理推荐
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { RefreshCw, Eye } from 'lucide-react';
import { Switch } from '@/components/ui/Switch';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';

interface PreprocessingPreset {
  id: string;
  name: string;
  description: string;
}

interface ImageQualityMetrics {
  brightness?: number;
  contrast?: number;
  sharpness?: number;
  noise?: number;
}

interface PreprocessingRecommendation {
  type: string;
  value: string;
}

export interface SmartPreprocessingPanelProps {
  /** 是否启用智能预处理 */
  enableSmartPreprocessing: boolean;
  /** 选中的预处理方案 */
  selectedPreprocessingPreset: string;
  /** 是否正在分析图像 */
  isAnalyzingImage: boolean;
  /** 图像质量指标 */
  imageQualityMetrics: ImageQualityMetrics | null;
  /** 预处理推荐 */
  preprocessingRecommendation: PreprocessingRecommendation[] | null;
  /** 是否正在预处理 */
  isPreprocessing: boolean;
  /** 处理后的图像预览 */
  processedImagePreview: string | null;
  /** 是否显示图像对比 */
  showImageComparison: boolean;
  /** 预处理方案列表 */
  preprocessingPresets: PreprocessingPreset[];
  /** 设置智能预处理启用状态 */
  setEnableSmartPreprocessing: (enabled: boolean) => void;
  /** 设置预处理方案 */
  setSelectedPreprocessingPreset: (preset: string) => void;
  /** 设置显示图像对比 */
  setShowImageComparison: (show: boolean) => void;
}

export const SmartPreprocessingPanel: React.FC<SmartPreprocessingPanelProps> = ({
  enableSmartPreprocessing,
  selectedPreprocessingPreset,
  isAnalyzingImage,
  imageQualityMetrics,
  preprocessingRecommendation,
  isPreprocessing,
  processedImagePreview,
  showImageComparison,
  preprocessingPresets,
  setEnableSmartPreprocessing,
  setSelectedPreprocessingPreset,
  setShowImageComparison,
}) => {
  return (
    <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-600/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <div className={`w-2 h-2 rounded-full ${enableSmartPreprocessing ? 'bg-blue-500' : 'bg-slate-500'}`}></div>
          <span className="text-sm font-medium text-slate-200">智能预处理</span>
        </div>
        <Switch
          checked={enableSmartPreprocessing}
          onCheckedChange={setEnableSmartPreprocessing}
          className="data-[state=checked]:bg-blue-600"
        />
      </div>

      {enableSmartPreprocessing && (
        <div className="space-y-3">
          {/* 预处理方案选择 */}
          <div className="space-y-2">
            <Label className="text-xs text-slate-400">预处理方案</Label>
            <Select value={selectedPreprocessingPreset} onValueChange={setSelectedPreprocessingPreset}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {preprocessingPresets.map((preset) => (
                  <SelectItem key={preset.id} value={preset.id}>
                    <div className="flex flex-col">
                      <span className="font-medium">{preset.name}</span>
                      <span className="text-xs text-slate-400">{preset.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 图像质量分析状态 */}
          {isAnalyzingImage && (
            <div className="flex items-center space-x-2 text-blue-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">正在分析图像质量...</span>
            </div>
          )}

          {/* 图像质量指标 */}
          {imageQualityMetrics && (
            <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <h4 className="text-blue-300 font-medium mb-2">图像质量分析</h4>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">亮度:</span>
                  <span className="text-slate-300">{imageQualityMetrics.brightness?.toFixed(1) || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">对比度:</span>
                  <span className="text-slate-300">{imageQualityMetrics.contrast?.toFixed(1) || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">清晰度:</span>
                  <span className="text-slate-300">{imageQualityMetrics.sharpness?.toFixed(1) || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">噪声:</span>
                  <span className="text-slate-300">{imageQualityMetrics.noise?.toFixed(1) || 'N/A'}</span>
                </div>
              </div>
            </div>
          )}

          {/* 预处理推荐 */}
          {preprocessingRecommendation && (
            <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
              <h4 className="text-green-300 font-medium mb-2">智能推荐</h4>
              <div className="space-y-1 text-xs">
                {preprocessingRecommendation.map((rec, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-slate-400">{rec.type}:</span>
                    <span className="text-green-300">{rec.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 预处理状态 */}
          {isPreprocessing && (
            <div className="flex items-center space-x-2 text-orange-400">
              <RefreshCw className="h-4 w-4 animate-spin" />
              <span className="text-sm">正在应用预处理...</span>
            </div>
          )}

          {/* 处理前后对比按钮 */}
          {processedImagePreview && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImageComparison(!showImageComparison)}
              className="w-full text-xs"
            >
              <Eye className="h-3 w-3 mr-1" />
              {showImageComparison ? '隐藏对比' : '查看对比'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default SmartPreprocessingPanel;
