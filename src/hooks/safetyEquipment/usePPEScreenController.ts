import { useCallback, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { getYoloStatus, preloadYolo, clearCleanroomResults } from '@/lib/api';
import type { ActiveAlert } from '@/lib/anomalyApi';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { useAppStore } from '@/state/appStore';
import { useAnomalyStore } from '@/state/anomalyStore';
import { usePPEDetectionStore } from '@/state/ppeDetectionStore';
import { useTempFolder } from './useTempFolder';
import { usePPEKeyboardShortcuts } from './usePPEKeyboardShortcuts';
import { useSafetyCamera } from './useSafetyCamera';
import { usePPEDetection } from './usePPEDetection';
import { usePPECapture } from './usePPECapture';
import { usePPEInspection } from './usePPEInspection';
import { usePPESave } from './usePPESave';
import { usePPEPolling } from './usePPEPolling';
import { usePPELocalState } from './usePPELocalState';
import { usePPEBinding } from './usePPEBinding';
import type { PPEBindingPanelProps } from '@/components/safetyEquipment/PPEBindingPanel';
import type { PPEControlPanelProps } from '@/components/safetyEquipment/PPEControlPanel';
import type { PPECapturedImagesPanelProps } from '@/components/safetyEquipment/PPECapturedImagesPanel';
import type { PPEResultsSectionProps } from '@/components/safetyEquipment/PPEResultsSection';
import type { PPEShortcutHelpModalProps } from '@/components/safetyEquipment/PPEShortcutHelpModal';

export interface UsePPEScreenControllerResult {
  refs: {
    videoRef: React.RefObject<HTMLVideoElement>;
    detectionCanvasRef: React.RefObject<HTMLCanvasElement>;
  };
  binding: {
    panelProps: PPEBindingPanelProps;
    traceContext: ReturnType<typeof usePPEBinding>['traceContext'];
  };
  control: {
    panelProps: PPEControlPanelProps;
  };
  capture: {
    panelProps: PPECapturedImagesPanelProps;
    localCapturedImages: string[];
    forceUpdate: number;
    handleManualCapture: () => void;
  };
  detection: {
    detectionStats: ReturnType<typeof usePPEDetection>['detectionStats'];
    isDetecting: boolean;
    runPpeDetection: () => Promise<void>;
  };
  inspection: {
    handleSafetyInspection: () => Promise<void>;
    isInspectionDisabled: boolean;
    lastDetectionTime: number;
  };
  results: {
    sectionProps: Omit<PPEResultsSectionProps, 'onNavigateToResults'>;
  };
  anomalies: {
    activeAlerts: ActiveAlert[];
    processStageCode: string;
  };
  dialogs: {
    modelUnavailable: {
      isOpen: boolean;
      onClose: () => void;
      errorMessage: string;
      errorType: 'model_unavailable' | 'specific_model_unavailable';
      onModelSwitched: () => Promise<void>;
    };
    shortcutHelp: PPEShortcutHelpModalProps;
  };
  actions: {
    loadYoloModel: () => Promise<void>;
    refreshModel: () => Promise<unknown>;
    handleModelSwitched: () => Promise<void>;
    openShortcutHelp: () => void;
    closeShortcutHelp: () => void;
  };
}

export const usePPEScreenController = (): UsePPEScreenControllerResult => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null);

  const localState = usePPELocalState();
  const { modelName, isLoading: modelLoading, refresh: refreshModel } = useCurrentModel();
  const store = usePPEDetectionStore();
  const { addResult: addAppResult, results: globalResults, clearAllResults } = useAppStore();
  const { activeAlerts, fetchAlerts, clearAlerts } = useAnomalyStore();

  const camera = useSafetyCamera({
    windowId: localState.windowId,
    videoRef,
  });

  const binding = usePPEBinding({
    windowId: localState.windowId,
    selectedDeviceId: camera.selectedDeviceId,
  });
  const backendStreamId = camera.selectedDeviceId?.startsWith('stream-')
    ? camera.selectedDeviceId.replace('stream-', '')
    : undefined;

  const capture = usePPECapture({
    videoRef,
    isCameraOn: camera.isCameraOn,
    setCapturedImages: store.setCapturedImages,
  });

  const detection = usePPEDetection({
    streamId: backendStreamId,
    videoRef,
    detectionCanvasRef,
    isPpeActive: camera.isPpeActive,
    isCameraOn: camera.isCameraOn,
    captureThreshold: store.captureThreshold,
    ppeThresholds: store.ppeThresholds as unknown as Record<string, number>,
    showDetections: store.showDetections,
    autoCapture: store.autoCapture,
    captureInterval: store.captureInterval,
    setModelUnavailableDialog: localState.setModelUnavailableDialog,
    handleAutoCapture: capture.handleAutoCapture,
    captureCurrentFrame: capture.captureCurrentFrame,
    bestDetectionInInterval: store.bestDetectionInInterval,
    setBestDetectionInInterval: store.setBestDetectionInInterval,
  });

  const refreshAnomalyAlerts = useCallback(async () => {
    const stageCode = binding.traceContext.processStageCode;
    if (!stageCode) {
      clearAlerts();
      return;
    }
    await fetchAlerts(stageCode);
  }, [binding.traceContext.processStageCode, clearAlerts, fetchAlerts]);

  const save = usePPESave({
    addAppResult,
    setResults: store.setResults,
    getCurrentResults: () => usePPEDetectionStore.getState().results,
    onSaveComplete: refreshAnomalyAlerts,
    traceContext: binding.traceContext,
  });

  const inspection = usePPEInspection({
    capturedImages: store.capturedImages,
    performDetection: detection.performDetection,
    saveInspectionResults: save.saveInspectionResults,
    setCapturedImages: store.setCapturedImages,
    setLocalCapturedImages: capture.setLocalCapturedImages,
    setForceUpdate: capture.setForceUpdate,
    isDetectingRef: detection.isDetectingRef,
  });

  const tempFolder = useTempFolder({
    localCapturedImages: capture.localCapturedImages,
    tempFolderPath: localState.tempFolderPath,
  });

  const handleDetectionTick = useCallback(async () => {
    const autoCapturedImages = await detection.runPpeDetection();
    if (autoCapturedImages?.length) {
      await inspection.triggerAutoInspection(autoCapturedImages);
    }
  }, [detection.runPpeDetection, inspection.triggerAutoInspection]);

  usePPEPolling({
    enabled: camera.isPpeActive,
    intervalMs: Math.max(2000, Math.round((store.detectionInterval || 2) * 1000)),
    onTick: handleDetectionTick,
  });

  useEffect(() => {
    const stageCode = binding.traceContext.processStageCode;
    if (!stageCode) {
      clearAlerts();
      return;
    }

    void fetchAlerts(stageCode);

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchAlerts(stageCode);
      }
    }, 30000);

    return () => window.clearInterval(timer);
  }, [binding.traceContext.processStageCode, clearAlerts, fetchAlerts]);

  const loadYoloModel = useCallback(async () => {
    try {
      await preloadYolo();
      const status = await getYoloStatus();
      console.log('YOLO状态:', status);
      toast.success('后端YOLO已就绪');
    } catch (error) {
      console.error('YOLO预加载失败:', error);
      toast.error('后端YOLO预加载失败');
    }
  }, []);

  const handleModelSwitched = useCallback(async () => {
    await refreshModel();
    await loadYoloModel();
  }, [loadYoloModel, refreshModel]);

  const openShortcutHelp = useCallback(() => {
    store.setShowShortcutModal(true);
  }, [store]);

  const closeShortcutHelp = useCallback(() => {
    store.setShowShortcutModal(false);
  }, [store]);

  const handleClearAllResults = useCallback(async () => {
    if (
      !confirm('确定要清空所有检测结果吗？此操作将永久删除数据库中的所有记录，无法恢复！')
    ) {
      return;
    }

    try {
      store.setResults([]);
      clearAllResults();

      const cleanroomResults = globalResults.filter(
        (result) => (result as { detectionType?: string }).detectionType === 'cleanroom_ppe'
      );

      const response = await clearCleanroomResults(
        cleanroomResults.length,
        '用户手动清空所有检测结果'
      );

      if (response.ok) {
        toast.success('已清空所有检测结果（包括数据库记录）');
      } else {
        toast.error('清空数据库记录失败，但已清空本地显示');
      }
    } catch (error) {
      console.error('清空结果失败:', error);
      toast.error('清空失败，请重试');
    }
  }, [clearAllResults, globalResults, store]);

  usePPEKeyboardShortcuts({
    isCameraOn: camera.isCameraOn,
    capturedImagesCount: capture.localCapturedImages.length,
    onManualCapture: capture.handleManualCapture,
    onSafetyInspection: inspection.handleSafetyInspection,
    onToggleMonitoring: camera.toggleMonitoring,
    onLoadYoloModel: loadYoloModel,
    showShortcutModal: store.showShortcutModal,
    onOpenShortcutHelp: openShortcutHelp,
    onCloseShortcutHelp: closeShortcutHelp,
  });

  useEffect(() => {
    void getYoloStatus()
      .then((status) => {
        console.log('YOLO状态:', status);
      })
      .catch((error) => {
        console.error('获取YOLO状态失败:', error);
      });
  }, []);

  return {
    refs: {
      videoRef,
      detectionCanvasRef,
    },
    binding: {
      panelProps: {
        modelName,
        isModelLoading: modelLoading,
        onRefreshModel: refreshModel,
        onModelChange: handleModelSwitched,
        isCollapsed: store.isBindingInfoCollapsed,
        setIsCollapsed: store.setIsBindingInfoCollapsed,
      },
      traceContext: binding.traceContext,
    },
    control: {
      panelProps: {
        cameraPanel: {
          windowId: localState.windowId,
          videoRef,
          detectionCanvasRef,
          isCameraOn: camera.isCameraOn,
          isMonitoring: camera.isMonitoring,
          isPpeActive: camera.isPpeActive,
          showDetections: store.showDetections,
          videoDevices: camera.videoDevices,
          selectedDeviceId: camera.selectedDeviceId,
          detectionStats: detection.detectionStats,
          latestVerdict: detection.latestVerdict,
          onToggleCamera: camera.toggleCamera,
          onToggleMonitoring: camera.toggleMonitoring,
          onSwitchCamera: camera.switchCamera,
        },
        thresholdSettings: {
          autoCapture: store.autoCapture,
          setAutoCapture: store.setAutoCapture,
          ppeThresholds: store.ppeThresholds as unknown as Record<string, number>,
          setPpeThresholds:
            store.setPpeThresholds as unknown as (thresholds: Record<string, number>) => void,
          captureInterval: store.captureInterval,
          setCaptureInterval: store.setCaptureInterval,
          autoUploadCount: store.autoUploadCount,
          setAutoUploadCount: store.setAutoUploadCount,
        },
        isThresholdsCollapsed: store.isThresholdsCollapsed,
        setIsThresholdsCollapsed: store.setIsThresholdsCollapsed,
        onStartInspection: inspection.handleSafetyInspection,
        isInspectionDisabled: capture.localCapturedImages.length === 0,
      },
    },
    capture: {
      panelProps: {
        localCapturedImages: capture.localCapturedImages,
        forceUpdate: capture.forceUpdate,
        onClearCapturedImages: capture.handleClearCapturedImages,
        onSaveToTempFolder: tempFolder.handleSaveToTempFolder,
        onOpenTempFolder: tempFolder.handleOpenTempFolder,
        onClearTempFolder: tempFolder.handleClearTempFolder,
        isCollapsed: store.isCapturedImagesCollapsed,
        setIsCollapsed: store.setIsCapturedImagesCollapsed,
      },
      localCapturedImages: capture.localCapturedImages,
      forceUpdate: capture.forceUpdate,
      handleManualCapture: capture.handleManualCapture,
    },
    detection: {
      detectionStats: detection.detectionStats,
      isDetecting: detection.isDetecting,
      runPpeDetection: handleDetectionTick,
    },
    inspection: {
      handleSafetyInspection: inspection.handleSafetyInspection,
      isInspectionDisabled: capture.localCapturedImages.length === 0,
      lastDetectionTime: inspection.lastDetectionTime,
    },
    results: {
      sectionProps: {
        globalResults,
        onClearAllResults: handleClearAllResults,
        onOpenShortcutHelp: openShortcutHelp,
        isCollapsed: store.isResultsCollapsed,
        setIsCollapsed: store.setIsResultsCollapsed,
      },
    },
    anomalies: {
      activeAlerts,
      processStageCode: binding.traceContext.processStageCode,
    },
    dialogs: {
      modelUnavailable: {
        isOpen: localState.modelUnavailableDialog.isOpen,
        onClose: localState.closeModelUnavailableDialog,
        errorMessage: localState.modelUnavailableDialog.errorMessage,
        errorType: localState.modelUnavailableDialog.errorType,
        onModelSwitched: handleModelSwitched,
      },
      shortcutHelp: {
        isOpen: store.showShortcutModal,
        onClose: closeShortcutHelp,
      },
    },
    actions: {
      loadYoloModel,
      refreshModel,
      handleModelSwitched,
      openShortcutHelp,
      closeShortcutHelp,
    },
  };
};
