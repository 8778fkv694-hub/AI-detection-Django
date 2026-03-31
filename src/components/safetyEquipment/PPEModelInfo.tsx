/**
 * PPE Model Info Component
 *
 * 用途：显示当前模型信息与切换
 * 使用位置：SafetyEquipmentScreen
 */

import React from 'react';
import { Button } from '@/components/ui/Button';
import { Cpu, RefreshCw } from 'lucide-react';
import ModelSelector from '@/components/ModelSelector';

export interface PPEModelInfoProps {
  /** 模型名称 */
  modelName: string;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 刷新模型 */
  onRefresh: () => void;
  /** 模型切换回调 */
  onModelChange?: (modelId: string) => void;
}

export const PPEModelInfo: React.FC<PPEModelInfoProps> = ({
  modelName,
  isLoading,
  onRefresh,
  onModelChange,
}) => {
  return (
    <div className="flex flex-col gap-2">
      {/* 当前模型显示 */}
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-blue-400" />
        <span className="text-sm text-slate-300">
          当前模型:
          {isLoading ? (
            <span className="text-slate-500 ml-1">加载中...</span>
          ) : (
            <span className="text-blue-400 font-medium ml-1">{modelName}</span>
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          className="h-6 w-6 p-0 text-slate-400 hover:text-slate-300"
        >
          <RefreshCw className={`h-3 w-3 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* YOLO 模型选择器 */}
      <ModelSelector
        label=""
        placeholder="切换检测模型"
        showActiveBadge={false}
        showModelCount={true}
        onModelChange={async (modelId) => {
          console.log('模型已切换:', modelId);
          onModelChange?.(modelId);
        }}
      />
    </div>
  );
};

export default PPEModelInfo;
