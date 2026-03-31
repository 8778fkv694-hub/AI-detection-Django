/**
 * TargetSelectionPanel Component
 *
 * 用途：检测目标选择面板
 * 功能：按分类显示可检测目标、支持多选、支持 mini 模式
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { Label } from '@/components/ui/Label';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ModelConfig {
  class_categories?: {
    names?: string[];
    labels?: string[];
    logos?: string[];
    ppe?: string[];
    materials?: string[];
    components?: string[];
    features?: string[];
    others?: string[];
  };
}

interface TargetSelectionPanelProps {
  /** 当前模型ID */
  currentModel: string | null;
  /** 模型配置 */
  modelConfig: ModelConfig | null;
  /** 选中的目标列表 */
  selectedTargets: (string | null)[];
  /** Mini 模式目标列表 */
  nonGridTargets: string[];
  /** 展开的分组集合 */
  expandedTargetGroups: Set<string>;
  /** 获取所有可用目标 */
  getAvailableTargets: () => string[];
  /** 获取目标中文名称 */
  getTargetChineseName: (target: string | null | undefined) => string;
  /** 设置选中的目标 */
  setSelectedTargets: (targets: string[]) => void;
  /** 切换mini模式 */
  toggleNonGridTarget: (target: string) => void;
  /** 设置展开的分组 */
  setExpandedTargetGroups: React.Dispatch<React.SetStateAction<Set<string>>>;
}

export const TargetSelectionPanel: React.FC<TargetSelectionPanelProps> = ({
  currentModel,
  modelConfig,
  selectedTargets,
  nonGridTargets,
  expandedTargetGroups,
  getAvailableTargets,
  getTargetChineseName,
  setSelectedTargets,
  toggleNonGridTarget,
  setExpandedTargetGroups,
}) => {
  // 每次渲染时打印调试信息
  React.useEffect(() => {
    console.log('🔍 TargetSelectionPanel - 当前模型:', currentModel);
    console.log('🔍 TargetSelectionPanel - modelConfig:', modelConfig);
    console.log('🔍 TargetSelectionPanel - selectedTargets:', selectedTargets);
  }, [currentModel, modelConfig, selectedTargets]);

  // 切换分组展开/折叠
  const toggleGroup = (groupName: string) => {
    setExpandedTargetGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };

  // 渲染单个目标项
  const renderTargetItem = (target: string) => (
    <div key={target} className="flex items-center gap-2 text-sm">
      <label className="flex items-center gap-1">
        <input
          type="checkbox"
          checked={selectedTargets.includes(target)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedTargets([...selectedTargets, target].filter((t): t is string => t !== null));
            } else {
              setSelectedTargets(selectedTargets.filter((t): t is string => t !== target && t !== null));
            }
          }}
          className="rounded"
        />
        <span className="text-slate-300">{getTargetChineseName(target)}</span>
      </label>
      {selectedTargets.includes(target) && (
        <label
          className="flex items-center gap-1 ml-1 cursor-pointer"
          title="mini模式（智能填充到空白区域）"
          onClick={() => toggleNonGridTarget(target)}
        >
          <div
            className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${nonGridTargets.includes(target)
                ? 'border-blue-400'
                : 'border-slate-500'
              }`}
          >
            {nonGridTargets.includes(target) && (
              <div className="w-2 h-2 rounded-full bg-blue-400"></div>
            )}
          </div>
          <span className="text-xs text-slate-400">mini</span>
        </label>
      )}
    </div>
  );

  // 渲染分组
  const renderGroup = (
    title: string,
    groupKey: string,
    targets: string[]
  ) => {
    if (targets.length === 0) return null;

    return (
      <div className="border border-slate-600/50 rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
          onClick={() => toggleGroup(groupKey)}
        >
          <Label className="text-xs font-medium">
            {title} ({targets.length})
          </Label>
          {expandedTargetGroups.has(groupKey) ? (
            <ChevronUp className="h-3 w-3 text-slate-400" />
          ) : (
            <ChevronDown className="h-3 w-3 text-slate-400" />
          )}
        </div>
        {expandedTargetGroups.has(groupKey) && (
          <div className="p-2">
            <div className="flex flex-wrap gap-2">
              {targets.map(renderTargetItem)}
            </div>
          </div>
        )}
      </div>
    );
  };

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
    logoTargets = allTargets.filter(
      (t) => t.includes('_logo') || t.includes('logo')
    );
    otherTargets = allTargets.filter(
      (t) =>
        !nameTargets.includes(t) &&
        !labelTargets.includes(t) &&
        !logoTargets.includes(t)
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm">检测目标</Label>
      <div className="text-xs text-slate-400 mb-2">
        当前模型:{' '}
        {currentModel === 'filter_core_detection'
          ? '滤芯检测专用模型'
          : currentModel === 'ppe_detection'
            ? 'PPE检测专用模型'
            : currentModel === 'yolo8_general'
              ? 'YOLO8通用检测模型'
              : currentModel}
      </div>
      <div className="space-y-2">
        {renderGroup('名称类', 'names', nameTargets)}
        {renderGroup('标签类', 'labels', labelTargets)}
        {renderGroup('Logo类', 'logos', logoTargets)}
        {renderGroup('劳保类', 'ppe', ppeTargets)}
        {renderGroup('材质类', 'materials', materialTargets)}
        {renderGroup('组件类', 'components', componentTargets)}
        {renderGroup('特征类', 'features', featureTargets)}
        {renderGroup('其他类', 'others', otherTargets)}
      </div>
    </div>
  );
};
