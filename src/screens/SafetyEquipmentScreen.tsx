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
import { MiniWorkflowOverlay, type WorkflowPhase } from '@/components/ocr/MiniWorkflowOverlay';

const SafetyEquipmentScreen: React.FC = () => {
  const navigate = useNavigate();
  const controller = usePPEScreenController();

  // 推导当前工作流阶段
  const workflowPhase = (() => {
    const cameraPanel = controller.control.panelProps.cameraPanel;
    const latestVerdict = cameraPanel.latestVerdict;
    const captures = controller.capture.localCapturedImages;
    const isDetecting = controller.detection.isDetecting;
    if (isDetecting) return 'detecting' as WorkflowPhase;
    if (latestVerdict?.overallQuality === '合格') return 'pass' as WorkflowPhase;
    if (latestVerdict) return 'fail' as WorkflowPhase;
    if (captures.length > 0) return 'capturing' as WorkflowPhase;
    if (cameraPanel.isPpeActive && cameraPanel.isCameraOn) return 'sensor' as WorkflowPhase;
    if (cameraPanel.isCameraOn) return 'triggered' as WorkflowPhase;
    return 'idle' as WorkflowPhase;
  })();

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

      {/* 迷你工作流状态浮层（可选呼出，Portal 到视频容器以便原生全屏下亦可见） */}
      <MiniWorkflowOverlay
        portalToVideoContainer
        positionClass="absolute bottom-3 right-3 z-[60]"
        phase={workflowPhase}
      />
    </div>
  );
};

export default SafetyEquipmentScreen;
