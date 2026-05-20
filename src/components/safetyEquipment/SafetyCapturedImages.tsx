/**
 * Safety Captured Images Component
 *
 * 用途：抓拍图片网格与管理
 * 使用位置：SafetyEquipmentScreen
 */

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Target, Trash2, Download, FolderOpen } from 'lucide-react';
import { PPECollapsibleSection } from './PPECollapsibleSection';

export interface SafetyCapturedImagesProps {
  /** 本地抓拍图片列表 */
  localCapturedImages: string[];
  /** 强制更新计数器 */
  forceUpdate: number;
  /** 是否折叠 */
  isCollapsed?: boolean;
  /** 设置折叠状态 */
  setIsCollapsed?: (collapsed: boolean) => void;
  /** 清空抓拍图片 */
  onClearCapturedImages: () => void;
  /** 保存到临时文件夹 */
  onSaveToTempFolder: () => void;
  /** 打开临时文件夹 */
  onOpenTempFolder: () => void;
  /** 清空临时文件夹 */
  onClearTempFolder: () => void;
}

export const SafetyCapturedImages: React.FC<SafetyCapturedImagesProps> = ({
  localCapturedImages,
  forceUpdate,
  isCollapsed = false,
  setIsCollapsed,
  onClearCapturedImages,
  onSaveToTempFolder,
  onOpenTempFolder,
  onClearTempFolder,
}) => {
  return (
    <PPECollapsibleSection
      title={`抓拍图片 (${localCapturedImages.length})`}
      icon={<Target className="h-4 w-4" />}
      isCollapsed={isCollapsed}
      onToggle={() => setIsCollapsed?.(!isCollapsed)}
      rightSlot={
        forceUpdate > 0 ? <span className="text-[11px] text-slate-500">更新{forceUpdate}</span> : undefined
      }
      expandedContentClassName="mt-3 max-h-[720px] opacity-100"
      contentClassName="pt-0"
    >
      <div className="space-y-4">
        <div className="text-xs text-slate-500 mb-2">
          精选抓拍：每次只保留一张最佳图片
        </div>
        {localCapturedImages.length > 0 ? (
          <div
            key={`captured-images-${forceUpdate}`}
            className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto pb-2"
          >
            {localCapturedImages.map((img, i) => (
              <img
                key={`${i}-${forceUpdate}`}
                src={`data:image/jpeg;base64,${img}`}
                className="h-20 w-full rounded-md object-cover border-2 border-transparent hover:border-accent"
                alt={`抓拍图片 ${i + 1}`}
                onError={(e) => console.error(`抓拍图片 ${i + 1} 加载失败:`, e)}
              />
            ))}
          </div>
        ) : (
          <p
            key={`waiting-${forceUpdate}`}
            className="text-center text-xs text-slate-600 pt-4"
          >
            等待精选抓拍... (当前数量: {localCapturedImages.length})
          </p>
        )}

        {/* 抓拍图片操作按钮 */}
        <div className="space-y-2">
          <div className="text-xs text-slate-400 text-center">
            精选抓拍模式：每次只显示一张最佳图片
          </div>
          {!(typeof window !== 'undefined' && ((window as any).Capacitor || (window as any).__IS_MOBILE_APP__)) ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={onClearCapturedImages} className="flex-1">
                  <Trash2 className="mr-2 h-4 w-4" />
                  清空抓拍图片
                </Button>
                <Button variant="outline" onClick={onSaveToTempFolder} className="flex-1">
                  <Download className="mr-2 h-4 w-4" />
                  保存到临时文件夹
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={onOpenTempFolder} className="flex-1">
                  <FolderOpen className="mr-2 h-4 w-4" />
                  打开临时文件夹
                </Button>
                <Button variant="outline" onClick={onClearTempFolder} className="flex-1">
                  <Trash2 className="mr-2 h-4 w-4" />
                  清空临时文件夹
                </Button>
              </div>
            </>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClearCapturedImages} className="w-full">
                <Trash2 className="mr-2 h-4 w-4" />
                清空抓拍图片
              </Button>
            </div>
          )}
        </div>
      </div>
    </PPECollapsibleSection>
  );
};

export default SafetyCapturedImages;
