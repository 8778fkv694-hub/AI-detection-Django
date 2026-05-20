/**
 * Live Captured Images Grid Component
 *
 * 用途：抓拍图片网格显示
 * 功能：显示抓拍图片、清空、保存到临时文件夹
 * 使用位置：LiveInspectionScreen
 */

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Target, Trash2, Download, FolderOpen } from 'lucide-react';

export interface LiveCapturedImagesGridProps {
  /** 抓拍图片列表 (base64) */
  capturedImages: string[];
  /** 图片保存模式 */
  imageSaveMode: 'full' | 'roi';
  /** 清空抓拍图片回调 */
  onClearCapturedImages: () => void;
  /** 保存到临时文件夹回调 */
  onSaveToTempFolder: () => void;
  /** 打开临时文件夹回调 */
  onOpenTempFolder: () => void;
  /** 清空临时文件夹回调 */
  onClearTempFolder: () => void;
}

export const LiveCapturedImagesGrid: React.FC<LiveCapturedImagesGridProps> = ({
  capturedImages,
  imageSaveMode,
  onClearCapturedImages,
  onSaveToTempFolder,
  onOpenTempFolder,
  onClearTempFolder,
}) => {
  return (
    <div className="flex-grow space-y-3 p-3 rounded-lg border border-dashed border-white/20 min-h-[120px]">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Target className="h-4 w-4" />
          抓拍图片 ({capturedImages.length})
        </h3>
        {capturedImages.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearCapturedImages}
            className="text-xs text-red-400 hover:text-red-300"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            清空
          </Button>
        )}
      </div>

      {capturedImages.length > 0 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
            {capturedImages.map((img, i) => (
              <div key={i} className="relative">
                <img
                  src={`data:image/jpeg;base64,${img}`}
                  className="h-20 w-full rounded-md object-cover border-2 border-transparent hover:border-accent"
                  alt={`抓拍图片 ${i + 1}`}
                />
                {/* 显示图片模式标签 */}
                <div className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs px-1 rounded text-[10px]">
                  {imageSaveMode === 'roi' ? 'ROI' : '全图'}
                </div>
              </div>
            ))}
          </div>

          {/* 管理功能按钮 */}
          {!(typeof window !== 'undefined' && ((window as any).Capacitor || (window as any).__IS_MOBILE_APP__)) ? (
            <>
              <div className="space-y-2">
                <div className="text-xs text-slate-400 text-center">
                  显示最近10张，保存时包含所有历史抓拍
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onSaveToTempFolder}
                    className="text-xs"
                  >
                    <Download className="h-3 w-3 mr-1" />
                    保存到临时文件夹
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onOpenTempFolder}
                    className="text-xs"
                  >
                    <FolderOpen className="h-3 w-3 mr-1" />
                    打开临时文件夹
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onClearTempFolder}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  清空临时文件夹
                </Button>
                <div className="text-xs text-slate-500 flex items-center justify-center">
                  当前模式: {imageSaveMode === 'roi' ? 'ROI截图' : '全画面'}
                  {imageSaveMode === 'roi' && ' (仅自动检测)'}
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500 flex items-center justify-center py-2">
              当前模式: {imageSaveMode === 'roi' ? 'ROI截图' : '全画面'}
              {imageSaveMode === 'roi' && ' (仅自动检测)'}
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-slate-500 mb-2">等待最优识别结果...</p>
          <p className="text-xs text-slate-600">请按"抓拍"或空格键添加图片</p>
        </div>
      )}
    </div>
  );
};
