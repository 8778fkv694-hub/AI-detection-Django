/**
 * CompressionSettingsPanel Component
 *
 * 用途：图片压缩配置面板
 * 功能：启用/禁用压缩、设置最大宽高、压缩质量
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface CompressionConfig {
  maxWidth: number;
  maxHeight: number;
  quality: number;
  maxSizeMB: number; // 与 store 类型保持一致，必需字段
}

export interface CompressionSettingsPanelProps {
  /** 是否启用压缩 */
  compressionEnabled: boolean;
  /** 是否显示压缩设置详情 */
  showCompressionSettings: boolean;
  /** 压缩配置 */
  compressionConfig: CompressionConfig;
  /** 设置压缩启用状态 */
  setCompressionEnabled: (enabled: boolean) => void;
  /** 设置显示压缩设置详情 */
  setShowCompressionSettings: (show: boolean) => void;
  /** 设置压缩配置 */
  setCompressionConfig: (config: CompressionConfig) => void;
}

export const CompressionSettingsPanel: React.FC<CompressionSettingsPanelProps> = ({
  compressionEnabled,
  showCompressionSettings,
  compressionConfig,
  setCompressionEnabled,
  setShowCompressionSettings,
  setCompressionConfig,
}) => {
  return (
    <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-600">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-200 flex items-center">
          <Settings className="h-4 w-4 mr-2" />
          图片压缩配置
        </h3>
        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={compressionEnabled}
              onChange={(e) => setCompressionEnabled(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-slate-300">启用压缩</span>
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowCompressionSettings(!showCompressionSettings)}
            className="text-xs px-3 py-1"
          >
            {showCompressionSettings ? '收起' : '展开'}设置
          </Button>
        </div>
      </div>

      {compressionEnabled && (
        <div className="text-sm text-slate-400 mb-3">
          💡 启用压缩可以减小图片大小，提高处理速度，但可能会影响识别精度
        </div>
      )}

      {/* 压缩设置详情 */}
      {compressionEnabled && showCompressionSettings && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">最大宽度</label>
              <input
                type="number"
                value={compressionConfig.maxWidth}
                onChange={(e) => setCompressionConfig({ ...compressionConfig, maxWidth: parseInt(e.target.value) })}
                className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm"
                min="100"
                max="2048"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">最大高度</label>
              <input
                type="number"
                value={compressionConfig.maxHeight}
                onChange={(e) => setCompressionConfig({ ...compressionConfig, maxHeight: parseInt(e.target.value) })}
                className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm"
                min="100"
                max="2048"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1">
              <label className="text-xs text-slate-400">压缩质量</label>
              <span className="text-xs text-slate-400">{Math.round(compressionConfig.quality * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.1"
              value={compressionConfig.quality}
              onChange={(e) => setCompressionConfig({ ...compressionConfig, quality: parseFloat(e.target.value) })}
              className="w-full"
            />
          </div>

          <div className="text-xs text-slate-500">
            当前配置: {compressionConfig.maxWidth}x{compressionConfig.maxHeight}, 质量{Math.round(compressionConfig.quality * 100)}%
          </div>
        </div>
      )}
    </div>
  );
};

export default CompressionSettingsPanel;
