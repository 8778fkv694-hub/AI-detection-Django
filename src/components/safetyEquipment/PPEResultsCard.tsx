/**
 * PPE Results Card Component
 *
 * 用途：PPE检测结果展示
 * 使用位置：SafetyEquipmentScreen
 */

import React from 'react';
import { Button } from '@/components/ui/Button';
import { User, Keyboard, Trash2, Download, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { InspectionResult } from '@/types';
import { PPECollapsibleSection } from './PPECollapsibleSection';

export interface PPEResultsCardProps {
  /** 全局检测结果 */
  globalResults: InspectionResult[];
  /** 清空所有结果 */
  onClearAllResults: () => void;
  /** 导航到结果页面 */
  onNavigateToResults: () => void;
  /** 打开快捷键帮助 */
  onOpenShortcutHelp?: () => void;
  /** 是否折叠 */
  isCollapsed?: boolean;
  /** 设置折叠状态 */
  setIsCollapsed?: (collapsed: boolean) => void;
}

export const PPEResultsCard: React.FC<PPEResultsCardProps> = ({
  globalResults,
  onClearAllResults,
  onNavigateToResults,
  onOpenShortcutHelp,
  isCollapsed = false,
  setIsCollapsed,
}) => {
  // 筛选洁净用品检测结果
  const cleanroomResults = globalResults.filter((result) => {
    return (result as { detectionType?: string }).detectionType === 'cleanroom_ppe';
  });

  return (
    <PPECollapsibleSection
      title={
        <span className="flex items-center gap-2">
          <span>PPE检测结果</span>
          <span className="text-xs text-slate-400">({cleanroomResults.length}/20)</span>
        </span>
      }
      icon={<User className="h-4 w-4" />}
      isCollapsed={isCollapsed}
      onToggle={() => setIsCollapsed?.(!isCollapsed)}
      rightSlot={
        <div className="hidden items-center gap-2 xl:flex">
          <Keyboard size={14} />
          <span>空格=抓拍 / 回车=检测 / M=监控 / L=加载模型 / H=帮助</span>
          {onOpenShortcutHelp && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onOpenShortcutHelp();
              }}
              className="h-7 px-2 text-xs text-slate-300"
            >
              快捷键帮助
            </Button>
          )}
        </div>
      }
      expandedContentClassName="mt-3 max-h-[1400px] opacity-100"
      contentClassName="pt-0"
    >
      <div className="h-full max-h-[72vh] space-y-4 overflow-y-auto pr-1">
        {/* 显示说明 */}
        <div className="text-xs text-slate-400 bg-slate-800/50 p-2 rounded">
          <p>显示: 最近20个检测结果 | 存储: 最多1000张图片 (新替旧)</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 xl:hidden">
          <Keyboard size={14} />
          <span>空格=抓拍 / 回车=检测 / M=监控 / L=加载模型 / H=帮助</span>
          {onOpenShortcutHelp && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenShortcutHelp}
              className="h-7 px-2 text-xs text-slate-300"
            >
              快捷键帮助
            </Button>
          )}
        </div>

        {/* 清空按钮 */}
        {cleanroomResults.length > 0 && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onNavigateToResults}
              className="text-blue-400 hover:text-blue-300"
            >
              <Download className="mr-2 h-4 w-4" />
              查看所有存储结果
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onClearAllResults}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              清空所有结果
            </Button>
          </div>
        )}

        {/* 结果列表 */}
        {cleanroomResults.length > 0 ? (
          cleanroomResults.slice(0, 20).map((result) => (
            <div key={result.id} className="p-3 rounded-lg bg-white/5 space-y-3">
              <div className="flex gap-4 items-start">
                {(() => {
                  let imageSrc = '';
                  if (result.image) {
                    if (result.image.startsWith('data:image/')) {
                      imageSrc = result.image;
                    } else if (result.image.length > 0) {
                      imageSrc = `data:image/jpeg;base64,${result.image}`;
                    }
                  }

                  return imageSrc ? (
                    <img
                      src={imageSrc}
                      alt="检测图片"
                      className="w-24 h-auto object-contain rounded-md bg-black"
                      onError={(e) => {
                        console.error('检测结果图片加载失败:', result.id);
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-24 h-24 bg-slate-700 rounded-md flex items-center justify-center">
                      <span className="text-slate-400 text-xs">无图片</span>
                    </div>
                  );
                })()}
                <div className="flex-grow space-y-2">
                  <div className="flex items-center gap-2">
                    <p
                      className={cn(
                        'font-bold',
                        result.overallQuality === '合格'
                          ? 'text-green-400'
                          : result.overallQuality === '需复检'
                            ? 'text-yellow-400'
                            : 'text-red-400'
                      )}
                    >
                      {result.overallQuality} ({result.score.toFixed(1)}%)
                    </p>
                  </div>

                  {/* 检测原因 */}
                  <div className="text-xs text-slate-300">
                    <p>{result.reason}</p>
                  </div>

                  {/* 缺陷信息 */}
                  {result.defects && result.defects.length > 0 && (
                    <div className="text-xs text-yellow-400">
                      <p className="font-medium">检测到的问题:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {result.defects.map((defect, idx) => (
                          <li key={idx}>{defect.description}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="flex min-h-[280px] flex-col items-center justify-center text-slate-500">
            <Shield className="h-16 w-16" />
            <p className="mt-4">等待PPE检测...</p>
          </div>
        )}
      </div>
    </PPECollapsibleSection>
  );
};

export default PPEResultsCard;
