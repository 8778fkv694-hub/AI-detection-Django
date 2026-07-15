/**
 * 模型选择器组件（激活器）
 *
 * 可复用的下拉框组件，用于在各检测页面激活YOLO模型
 *
 * 核心概念：
 * - 从**待选库**中选择并**激活**模型
 * - 激活后调用后端API，模型立即生效
 *
 * 功能：
 * - 显示待选库中的所有模型
 * - 激活选中的模型（调用后端API）
 * - 显示当前激活状态
 *
 * 工作流程：
 * 1. 用户先在"模型管理"页面将模型加入待选库
 * 2. 在检测页面使用此组件从待选库中激活模型
 * 3. 激活后模型立即生效，检测目标自动更新
 *
 * 使用示例：
 * ```tsx
 * <ModelSelector
 *   label="检测模型"
 *   placeholder="选择并激活模型"
 *   onModelChange={(modelId) => {
 *     console.log('已激活模型:', modelId);
 *     // 重新加载模型配置
 *   }}
 * />
 * ```
 */

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Label } from '@/components/ui/Label';
import { Badge } from '@/components/ui/Badge';
import { useModelPool } from '@/hooks/useModelPool';
import { Loader2, Zap } from 'lucide-react';

export interface ModelSelectorProps {
  // 标签文本
  label?: string;
  // 占位符
  placeholder?: string;
  // 模型激活回调（模型激活成功后触发）
  onModelChange?: (modelId: string) => void;
  // 是否显示当前激活标记
  showActiveBadge?: boolean;
  // 是否禁用
  disabled?: boolean;
  // 自定义样式
  className?: string;
  // 是否显示待选模型数量
  showModelCount?: boolean;
}

export const ModelSelector: React.FC<ModelSelectorProps> = ({
  label = '检测模型',
  placeholder = '选择模型',
  onModelChange,
  showActiveBadge = true,
  disabled = false,
  className = '',
  showModelCount = false,
}) => {
  const navigate = useNavigate();
  const {
    modelPool,
    activeModelId,
    isLoading,
    isSwitching,
    switchModel,
    hasModels,
    poolSize,
  } = useModelPool();

  const handleValueChange = async (value: string) => {
    if (value === activeModelId) return; // 如果是当前激活的模型，不需要重复激活

    const success = await switchModel(value);

    if (success && onModelChange) {
      onModelChange(value);
    }
  };

  // 如果待选库为空，显示提示
  if (!isLoading && !hasModels) {
    return (
      <div className={className}>
        {label && <Label className="mb-2">{label}</Label>}
        <div className="text-sm text-gray-500 p-3 border border-dashed rounded-lg text-center">
          暂无待选模型，请先在
          <button
            type="button"
            onClick={() => navigate('/models')}
            className="text-blue-500 hover:underline mx-1"
          >
            模型管理
          </button>
          页面将模型加入待选库
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        {label && (
          <Label className="flex items-center gap-2">
            {label}
            {showModelCount && poolSize > 0 && (
              <Badge variant="secondary" className="text-xs">
                {poolSize} 个待选
              </Badge>
            )}
          </Label>
        )}
      </div>

      <Select
        value={activeModelId}
        onValueChange={handleValueChange}
        disabled={disabled || isLoading || isSwitching}
      >
        <SelectTrigger className="w-full">
          {isSwitching ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>切换中...</span>
            </div>
          ) : (
            <SelectValue placeholder={placeholder} />
          )}
        </SelectTrigger>

        <SelectContent>
          {modelPool.map((model) => {
            const isActive = model.id === activeModelId;

            return (
              <SelectItem key={model.id} value={model.id}>
                <div className="flex items-center justify-between w-full gap-2">
                  <div className="flex flex-col">
                    <span className="font-medium">{model.name}</span>
                  </div>

                  {showActiveBadge && isActive && (
                    <Badge variant="default" className="ml-2">
                      <Zap className="h-3 w-3 mr-1" />
                      使用中
                    </Badge>
                  )}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {/* 加载状态提示 */}
      {isLoading && (
        <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          加载模型列表...
        </div>
      )}
    </div>
  );
};

export default ModelSelector;
