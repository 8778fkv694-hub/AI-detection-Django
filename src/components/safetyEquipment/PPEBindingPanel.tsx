import React from 'react';
import { Cpu } from 'lucide-react';
import { PPEModelInfo } from './PPEModelInfo';
import { PPECollapsibleSection } from './PPECollapsibleSection';

export interface PPEBindingPanelProps {
  modelName: string;
  isModelLoading: boolean;
  onRefreshModel: () => Promise<unknown>;
  onModelChange: () => Promise<void>;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export const PPEBindingPanel: React.FC<PPEBindingPanelProps> = ({
  modelName,
  isModelLoading,
  onRefreshModel,
  onModelChange,
  isCollapsed,
  setIsCollapsed,
}) => {
  return (
    <PPECollapsibleSection
      title="检测模型"
      icon={<Cpu className="h-4 w-4" />}
      isCollapsed={isCollapsed}
      onToggle={() => setIsCollapsed(!isCollapsed)}
      expandedContentClassName="mt-3 max-h-[240px] opacity-100"
    >
      <PPEModelInfo
        modelName={modelName}
        isLoading={isModelLoading}
        onRefresh={onRefreshModel}
        onModelChange={onModelChange}
      />
    </PPECollapsibleSection>
  );
};
