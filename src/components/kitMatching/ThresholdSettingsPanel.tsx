/**
 * 阈值设置面板组件
 *
 * 用途：齐套化检测阈值和参数设置
 * 功能：管理检测阈值、抓拍间隔、检测频率等设置
 * 使用位置：KitMatchingScreen
 */

import React from 'react';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelConfig } from '@/lib/api';

interface ThresholdSettingsPanelProps {
  // 展开状态
  isSettingsExpanded: boolean;
  setIsSettingsExpanded: (expanded: boolean) => void;
  expandedGroups: Set<string>;
  setExpandedGroups: React.Dispatch<React.SetStateAction<Set<string>>>;

  // 模型配置
  modelConfig: ModelConfig | null;
  getAllModelClasses: () => string[];
  getClassChineseName: (className: string) => string;
  doesModelSupportPersonDetection: () => boolean;

  // 阈值设置
  ppeThresholds: Record<string, number>;
  setPpeThresholds: (thresholds: Record<string, number>) => void;

  // 其他参数
  captureInterval: number;
  setCaptureInterval: (interval: number) => void;
  bestDetectionPriority: string;
  setBestDetectionPriority: (priority: 'confidence' | 'sharpness') => void;
  detectionInterval: number;
  setDetectionInterval: (interval: number) => void;
  postDetectionDelay: number;
  setPostDetectionDelay: (delay: number) => void;
  inspectionCooldownInterval: number;
  setInspectionCooldownInterval: (interval: number) => void;
}

export const ThresholdSettingsPanel: React.FC<ThresholdSettingsPanelProps> = ({
  isSettingsExpanded,
  setIsSettingsExpanded,
  expandedGroups,
  setExpandedGroups,
  modelConfig,
  getAllModelClasses,
  getClassChineseName,
  doesModelSupportPersonDetection,
  ppeThresholds,
  setPpeThresholds,
  captureInterval,
  setCaptureInterval,
  bestDetectionPriority,
  setBestDetectionPriority,
  detectionInterval,
  setDetectionInterval,
  postDetectionDelay,
  setPostDetectionDelay,
  inspectionCooldownInterval,
  setInspectionCooldownInterval,
}) => {
  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };

  const renderThresholdItem = (className: string) => {
    const thresholdValue = ppeThresholds[className] ?? 0.8;
    const isDisabled = thresholdValue === 0;
    return (
      <div
        key={className}
        className={cn(
          "flex items-center justify-between gap-2 p-1.5 rounded transition-opacity",
          isDisabled
            ? "bg-slate-700/10 opacity-50"
            : "bg-slate-700/30"
        )}
        title={isDisabled ? "已禁用（阈值为0）" : undefined}
      >
        <Label
          className={cn(
            "text-xs flex-1 truncate",
            isDisabled && "text-slate-500"
          )}
          title={getClassChineseName(className)}
        >
          {getClassChineseName(className)}
          {isDisabled && <span className="ml-1 text-xs text-slate-500">(禁用)</span>}
        </Label>
        <Select
          value={thresholdValue.toString()}
          onValueChange={(value) => {
            const newThresholds = {
              ...ppeThresholds,
              [className]: parseFloat(value)
            };
            setPpeThresholds(newThresholds);
          }}
        >
          <SelectTrigger className="w-20 h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="0">0%</SelectItem>
            <SelectItem value="0.3">30%</SelectItem>
            <SelectItem value="0.4">40%</SelectItem>
            <SelectItem value="0.5">50%</SelectItem>
            <SelectItem value="0.6">60%</SelectItem>
            <SelectItem value="0.7">70%</SelectItem>
            <SelectItem value="0.8">80%</SelectItem>
            <SelectItem value="0.85">85%</SelectItem>
            <SelectItem value="0.9">90%</SelectItem>
            <SelectItem value="0.95">95%</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  };

  const renderCategoryGroup = (
    groupName: string,
    groupLabel: string,
    classes: string[]
  ) => {
    if (classes.length === 0) return null;

    return (
      <div className="border border-slate-600/50 rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
          onClick={() => toggleGroup(groupName)}
        >
          <Label className="text-xs font-medium">{groupLabel} ({classes.length})</Label>
          {expandedGroups.has(groupName) ? (
            <ChevronUp className="h-3 w-3 text-slate-400" />
          ) : (
            <ChevronDown className="h-3 w-3 text-slate-400" />
          )}
        </div>
        {expandedGroups.has(groupName) && (
          <div className="p-2 space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              {classes.map(renderThresholdItem)}
            </div>
          </div>
        )}
      </div>
    );
  };

  // 计算分类
  const allClasses = getAllModelClasses();
  let nameClasses: string[] = [];
  let labelClasses: string[] = [];
  let logoClasses: string[] = [];
  let ppeClasses: string[] = [];
  let materialClasses: string[] = [];
  let componentClasses: string[] = [];
  let featureClasses: string[] = [];
  let otherClasses: string[] = [];

  if (modelConfig?.class_categories) {
    // 优先使用后端返回的分类信息
    nameClasses = modelConfig.class_categories.names || [];
    labelClasses = modelConfig.class_categories.labels || [];
    logoClasses = modelConfig.class_categories.logos || [];
    ppeClasses = modelConfig.class_categories.ppe || [];
    materialClasses = modelConfig.class_categories.materials || [];
    componentClasses = modelConfig.class_categories.components || [];
    featureClasses = modelConfig.class_categories.features || [];
    otherClasses = modelConfig.class_categories.others || [];
  } else {
    // 备用：前端分组逻辑（向后兼容）
    nameClasses = allClasses.filter(cls => cls.startsWith('name_'));
    labelClasses = allClasses.filter(cls => cls.includes('_label'));
    logoClasses = allClasses.filter(cls => cls.includes('_logo') || cls.includes('logo'));
    otherClasses = allClasses.filter(cls =>
      !nameClasses.includes(cls) &&
      !labelClasses.includes(cls) &&
      !logoClasses.includes(cls)
    );
  }

  return (
    <div className="border-t border-white/10 pt-3 mt-3">
      <div
        className="flex items-center justify-between cursor-pointer hover:bg-slate-700/30 active:bg-slate-700/50 rounded-md p-2 -m-2 transition-colors select-none"
        onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
      >
        <div className="text-xs text-slate-400">齐套化物品检测阈值设置</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">
            {isSettingsExpanded ? '收起' : '展开'}
          </span>
          {isSettingsExpanded ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </div>
      </div>

      {/* 可折叠的设置内容 */}
      <div className={cn(
        "space-y-3 transition-all duration-300 ease-in-out overflow-hidden",
        isSettingsExpanded ? "max-h-[1200px] opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
      )}>
        <div className="space-y-2">
          {renderCategoryGroup('names', '名称类', nameClasses)}
          {renderCategoryGroup('labels', '标签类', labelClasses)}
          {renderCategoryGroup('logos', 'Logo类', logoClasses)}
          {renderCategoryGroup('ppe', '劳保类', ppeClasses)}
          {renderCategoryGroup('materials', '材质类', materialClasses)}
          {renderCategoryGroup('components', '组件类', componentClasses)}
          {renderCategoryGroup('features', '特征类', featureClasses)}
          {renderCategoryGroup('others', '其他类', otherClasses)}
        </div>

        {/* 人员检测阈值 - 仅在模型支持人员检测时显示 */}
        {doesModelSupportPersonDetection() && (
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">人员检测阈值</Label>
              <div className="text-xs text-slate-400 mt-1">检测到人员时的抓拍触发阈值</div>
            </div>
            <Select
              value={(ppeThresholds.person ?? 0.8).toString()}
              onValueChange={(value) => {
                const newThresholds = {
                  ...ppeThresholds,
                  person: parseFloat(value)
                };
                setPpeThresholds(newThresholds);
              }}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0% (关闭)</SelectItem>
                <SelectItem value="0.3">30%</SelectItem>
                <SelectItem value="0.4">40%</SelectItem>
                <SelectItem value="0.5">50%</SelectItem>
                <SelectItem value="0.6">60%</SelectItem>
                <SelectItem value="0.7">70%</SelectItem>
                <SelectItem value="0.8">80%</SelectItem>
                <SelectItem value="0.85">85%</SelectItem>
                <SelectItem value="0.9">90%</SelectItem>
                <SelectItem value="0.95">95%</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* 重置阈值按钮 */}
        <div className="flex items-center justify-between">
          <Label className="text-sm">重置为默认值</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const defaultThresholds = {
                ...ppeThresholds,
                cleanroom_cap: 0.8,
                mask: 0.8,
                person: 0.8,
              };
              setPpeThresholds(defaultThresholds);
            }}
            className="w-24"
          >
            重置
          </Button>
        </div>

        {/* 抓拍间隔设置 */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">最优保留间隔(秒)</Label>
            <div className="text-xs text-slate-400 mt-1">保留指定时间内置信度最高的检测结果</div>
          </div>
          <Select
            value={captureInterval.toString()}
            onValueChange={(value) => {
              const interval = parseInt(value);
              setCaptureInterval(interval);
            }}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1秒</SelectItem>
              <SelectItem value="3">3秒</SelectItem>
              <SelectItem value="5">5秒</SelectItem>
              <SelectItem value="10">10秒</SelectItem>
              <SelectItem value="30">30秒</SelectItem>
              <SelectItem value="60">60秒</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 优先级选择 - 已改为综合评分，此设置项保留但不生效 */}
        <div className="flex items-center justify-between opacity-50">
          <div>
            <Label className="text-sm">保留优先级（已弃用）</Label>
            <div className="text-xs text-slate-400 mt-1">现在使用综合评分（ROI面积50%+清晰度50%），此设置不再生效</div>
          </div>
          <Select
            value={bestDetectionPriority}
            onValueChange={(value: 'confidence' | 'sharpness') => {
              setBestDetectionPriority(value);
            }}
            disabled
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="confidence">置信度优先</SelectItem>
              <SelectItem value="sharpness">清晰度优先</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 检测频率设置 */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">检测频率</Label>
            <div className="text-xs text-slate-400 mt-1">实时检测的间隔时间（0.1-3秒）</div>
          </div>
          <Select
            value={detectionInterval.toString()}
            onValueChange={(value) => {
              const interval = parseFloat(value);
              setDetectionInterval(interval);
            }}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0.1">0.1秒</SelectItem>
              <SelectItem value="0.3">0.3秒</SelectItem>
              <SelectItem value="0.5">0.5秒</SelectItem>
              <SelectItem value="1">1秒</SelectItem>
              <SelectItem value="2">2秒</SelectItem>
              <SelectItem value="3">3秒</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 检测完成延时设置 */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">检测完成延时(秒)</Label>
            <div className="text-xs text-slate-400 mt-1">所有类别检测完成后，继续检测综合评分最佳图片的延时时间</div>
          </div>
          <Select
            value={postDetectionDelay.toString()}
            onValueChange={(value) => {
              const delay = parseInt(value);
              setPostDetectionDelay(delay);
            }}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">0秒（不延时）</SelectItem>
              <SelectItem value="5">5秒</SelectItem>
              <SelectItem value="10">10秒</SelectItem>
              <SelectItem value="15">15秒</SelectItem>
              <SelectItem value="20">20秒</SelectItem>
              <SelectItem value="30">30秒</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* 检测间隔时间设置 */}
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">检测间隔时间(秒)</Label>
            <div className="text-xs text-slate-400 mt-1">检测完成后距离下一轮的最小间隔时间</div>
          </div>
          <Select
            value={inspectionCooldownInterval.toString()}
            onValueChange={(value) => {
              const interval = parseInt(value);
              setInspectionCooldownInterval(interval);
            }}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">无间隔</SelectItem>
              <SelectItem value="1">1秒</SelectItem>
              <SelectItem value="2">2秒</SelectItem>
              <SelectItem value="3">3秒</SelectItem>
              <SelectItem value="5">5秒</SelectItem>
              <SelectItem value="10">10秒</SelectItem>
              <SelectItem value="15">15秒</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
};
