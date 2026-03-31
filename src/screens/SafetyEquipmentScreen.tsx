import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Shield } from 'lucide-react';
import ModelUnavailableDialog from '@/components/ModelUnavailableDialog';
import { AnomalyAlertBanner } from '@/components/ocr/AnomalyAlertBanner';
import { usePPEScreenController } from '@/hooks/safetyEquipment';
import {
  PPEBindingPanel,
  PPEControlPanel,
  PPECapturedImagesPanel,
  PPEResultsSection,
  PPEShortcutHelpModal,
} from '@/components/safetyEquipment';

const SafetyEquipmentScreen: React.FC = () => {
  const navigate = useNavigate();
  const controller = usePPEScreenController();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      {/* 左侧：实时监控和抓拍图片区域 */}
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col">
          <CardHeader>
            <div className="flex flex-col gap-2">
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                PPE实时监控
              </CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex-grow flex flex-col space-y-4">
            <PPEBindingPanel {...controller.binding.panelProps} />
            <AnomalyAlertBanner
              alerts={controller.anomalies.activeAlerts}
              processStageCode={controller.anomalies.processStageCode}
            />
            {controller.anomalies.activeAlerts.length > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    const query = controller.anomalies.processStageCode
                      ? `?process_stage_code=${encodeURIComponent(controller.anomalies.processStageCode)}`
                      : '';
                    navigate(`/anomalies${query}`);
                  }}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300"
                >
                  打开异常看板
                </button>
              </div>
            )}
            <PPEControlPanel {...controller.control.panelProps} />
          </CardContent>
        </Card>

        {/* 抓拍图片区域 */}
        <PPECapturedImagesPanel {...controller.capture.panelProps} />
      </div>

      {/* 右侧：检测结果 */}
      <PPEResultsSection
        {...controller.results.sectionProps}
        onNavigateToResults={() => navigate('/cleanroom-results')}
      />

      {/* 模型不可用确认对话框 */}
      <ModelUnavailableDialog {...controller.dialogs.modelUnavailable} />
      <PPEShortcutHelpModal {...controller.dialogs.shortcutHelp} />
    </div>
  );
};

export default SafetyEquipmentScreen;
