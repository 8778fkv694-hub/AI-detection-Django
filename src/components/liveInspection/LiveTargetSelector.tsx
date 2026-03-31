/**
 * Live Target Selector Component
 *
 * 用途：检测目标选择面板
 * 功能：分组可折叠列表、复选框目标选择、OR/AND检测逻辑选择
 * 使用位置：LiveInspectionScreen
 */

import React from 'react';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ModelConfig } from '@/lib/api';

export interface LiveTargetSelectorProps {
  /** 当前YOLO模型名称 */
  currentYoloModel: string;
  /** 模型配置 */
  modelConfig: ModelConfig | null;
  /** 获取可用目标函数 */
  getAvailableTargets: () => string[];
  /** 获取目标中文名称函数 */
  getTargetChineseName: (target: string) => string;
  /** 选中的目标列表 */
  selectedTargets: string[];
  /** 设置选中的目标列表 */
  setSelectedTargets: (targets: string[]) => void;
  /** 展开的目标分组 */
  expandedTargetGroups: string[];
  /** 设置展开的目标分组 */
  setExpandedTargetGroups: (groups: string[] | ((prev: string[]) => string[])) => void;
  /** 检测模式 */
  yoloDetectionMode: 'or' | 'and';
  /** 设置检测模式 */
  setYoloDetectionMode: (mode: 'or' | 'and') => void;
  /** AND模式超时时间 */
  yoloTimeoutSeconds: number;
  /** 设置AND模式超时时间 */
  setYoloTimeoutSeconds: (seconds: number) => void;
  /** 已检测到的元素 */
  detectedElements: string[];
}

export const LiveTargetSelector: React.FC<LiveTargetSelectorProps> = ({
  currentYoloModel,
  modelConfig,
  getAvailableTargets,
  getTargetChineseName,
  selectedTargets,
  setSelectedTargets,
  expandedTargetGroups,
  setExpandedTargetGroups,
  yoloDetectionMode,
  setYoloDetectionMode,
  yoloTimeoutSeconds,
  setYoloTimeoutSeconds,
  detectedElements,
}) => {
  // 使用后端返回的分类信息（如果可用），否则使用前端分组逻辑作为备用
  const allTargets = getAvailableTargets();
  let nameTargets: string[] = [];
  let labelTargets: string[] = [];
  let logoTargets: string[] = [];
  let ppeTargets: string[] = [];
  let materialTargets: string[] = [];
  let componentTargets: string[] = [];
  let featureTargets: string[] = [];
  let otherTargets: string[] = [];

  if (modelConfig?.class_categories) {
    // 优先使用后端返回的分类信息
    nameTargets = modelConfig.class_categories.names || [];
    labelTargets = modelConfig.class_categories.labels || [];
    logoTargets = modelConfig.class_categories.logos || [];
    ppeTargets = modelConfig.class_categories.ppe || [];
    materialTargets = modelConfig.class_categories.materials || [];
    componentTargets = modelConfig.class_categories.components || [];
    featureTargets = modelConfig.class_categories.features || [];
    otherTargets = modelConfig.class_categories.others || [];
  } else {
    // 备用：前端分组逻辑（向后兼容）
    nameTargets = allTargets.filter((t) => t.startsWith('name_'));
    labelTargets = allTargets.filter((t) => t.includes('_label'));
    logoTargets = allTargets.filter((t) => t.includes('_logo') || t.includes('logo'));
    otherTargets = allTargets.filter(
      (t) => !nameTargets.includes(t) && !labelTargets.includes(t) && !logoTargets.includes(t)
    );
  }

  const toggleGroup = (groupName: string) => {
    setExpandedTargetGroups((prev: string[]) => {
      const prevSet = new Set(prev);
      if (prevSet.has(groupName)) {
        prevSet.delete(groupName);
      } else {
        prevSet.add(groupName);
      }
      return Array.from(prevSet);
    });
  };

  const expandedGroupsSet = new Set(expandedTargetGroups);

  const renderTargetItem = (target: string) => (
    <label key={target} className="flex items-center gap-1 text-sm">
      <input
        type="checkbox"
        checked={selectedTargets.includes(target)}
        onChange={(e) => {
          if (e.target.checked) {
            setSelectedTargets([...selectedTargets, target]);
          } else {
            setSelectedTargets(selectedTargets.filter((t) => t !== target));
          }
        }}
        className="rounded"
      />
      <span className="text-slate-300">{getTargetChineseName(target)}</span>
    </label>
  );

  const renderTargetGroup = (
    groupName: string,
    groupLabel: string,
    targets: string[]
  ) => {
    if (targets.length === 0) return null;
    return (
      <div className="border border-slate-600/50 rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
          onClick={() => toggleGroup(groupName)}
        >
          <Label className="text-xs font-medium">
            {groupLabel} ({targets.length})
          </Label>
          {expandedGroupsSet.has(groupName) ? (
            <ChevronUp className="h-3 w-3 text-slate-400" />
          ) : (
            <ChevronDown className="h-3 w-3 text-slate-400" />
          )}
        </div>
        {expandedGroupsSet.has(groupName) && (
          <div className="p-2">
            <div className="flex flex-wrap gap-2">{targets.map(renderTargetItem)}</div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm text-slate-300">检测目标</Label>
      <div className="text-xs text-slate-400 mb-2">当前模型: {currentYoloModel}</div>

      <div className="space-y-2">
        {/* 名称类分组 */}
        {renderTargetGroup('names', '名称类', nameTargets)}

        {/* 标签类分组 */}
        {renderTargetGroup('labels', '标签类', labelTargets)}

        {/* Logo类分组 */}
        {renderTargetGroup('logos', 'Logo类', logoTargets)}

        {/* 劳保类分组 */}
        {renderTargetGroup('ppe', '劳保类', ppeTargets)}

        {/* 材质类分组 */}
        {renderTargetGroup('materials', '材质类', materialTargets)}

        {/* 部件类分组 */}
        {renderTargetGroup('components', '部件类', componentTargets)}

        {/* 特征类分组 */}
        {renderTargetGroup('features', '特征类', featureTargets)}

        {/* 其他类分组 */}
        {renderTargetGroup('others', '其他类', otherTargets)}

        {/* YOLO检测逻辑选择 */}
        <div className="space-y-2 p-2 bg-slate-800/30 rounded-lg border border-slate-600/30">
          <Label className="text-xs text-slate-300">YOLO检测逻辑</Label>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="yoloDetectionMode"
                value="or"
                checked={yoloDetectionMode === 'or'}
                onChange={() => setYoloDetectionMode('or')}
                className="rounded"
              />
              <span className="text-xs text-slate-300">OR (识别任一元素即抓拍)</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="yoloDetectionMode"
                value="and"
                checked={yoloDetectionMode === 'and'}
                onChange={() => setYoloDetectionMode('and')}
                className="rounded"
              />
              <span className="text-xs text-slate-300">AND (必须全部元素才抓拍)</span>
            </label>
          </div>

          {/* AND模式超时设置 */}
          {yoloDetectionMode === 'and' && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs text-slate-400">超时时间(秒)</Label>
                <span className="text-xs text-slate-400">{yoloTimeoutSeconds}秒</span>
              </div>
              <input
                type="range"
                min="1"
                max="30"
                step="1"
                value={yoloTimeoutSeconds}
                onChange={(e) => setYoloTimeoutSeconds(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"
              />
            </div>
          )}

          {/* AND模式已检测到的元素显示 */}
          {yoloDetectionMode === 'and' && detectedElements.length > 0 && (
            <div className="mt-2 p-2 bg-green-900/20 border border-green-500/30 rounded">
              <div className="text-xs text-green-300 mb-1">
                已检测到 ({detectedElements.length}/{selectedTargets.length}):
              </div>
              <div className="flex flex-wrap gap-1">
                {detectedElements.map((element) => (
                  <Badge
                    key={element}
                    variant="outline"
                    className="text-xs bg-green-900/30 border-green-500/50"
                  >
                    {getTargetChineseName(element)}
                  </Badge>
                ))}
              </div>
              {selectedTargets.filter((t) => !detectedElements.includes(t)).length > 0 && (
                <div className="text-xs text-slate-400 mt-1">
                  等待:{' '}
                  {selectedTargets
                    .filter((t) => !detectedElements.includes(t))
                    .map((t) => getTargetChineseName(t))
                    .join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
