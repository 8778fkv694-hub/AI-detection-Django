import React from 'react';
import { CircleDotDashed, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { SafetyCameraPanel } from './SafetyCameraPanel';
import { PPEThresholdSettings } from './PPEThresholdSettings';
import { PPECollapsibleSection } from './PPECollapsibleSection';
import type { SafetyCameraPanelProps } from './SafetyCameraPanel';
import type { PPEThresholdSettingsProps } from './PPEThresholdSettings';

export interface PPEControlPanelProps {
  cameraPanel: SafetyCameraPanelProps;
  thresholdSettings: PPEThresholdSettingsProps;
  isThresholdsCollapsed: boolean;
  setIsThresholdsCollapsed: (collapsed: boolean) => void;
  onStartInspection: () => Promise<void>;
  isInspectionDisabled: boolean;
}

export const PPEControlPanel: React.FC<PPEControlPanelProps> = ({
  cameraPanel,
  thresholdSettings,
  isThresholdsCollapsed,
  setIsThresholdsCollapsed,
  onStartInspection,
  isInspectionDisabled,
}) => {
  return (
    <div className="space-y-4">
      <SafetyCameraPanel {...cameraPanel} />
      <PPECollapsibleSection
        title="阈值与自动抓拍"
        icon={<SlidersHorizontal className="h-4 w-4" />}
        isCollapsed={isThresholdsCollapsed}
        onToggle={() => setIsThresholdsCollapsed(!isThresholdsCollapsed)}
        expandedContentClassName="mt-3 max-h-[1200px] opacity-100"
      >
        <PPEThresholdSettings {...thresholdSettings} />
      </PPECollapsibleSection>

      <Button
        onClick={onStartInspection}
        disabled={isInspectionDisabled}
        className="w-full !py-3 !text-base"
      >
        <CircleDotDashed className="mr-2 h-4 w-4" />
        开始PPE检测 (回车)
      </Button>
    </div>
  );
};
