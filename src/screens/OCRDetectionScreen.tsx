import React, { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import RecipeSelectModal from '@/components/ocr/RecipeSelectModal';
import { AnomalyAlertBanner } from '@/components/ocr/AnomalyAlertBanner';
import { updateRecipe, type StageRecipe } from '@/lib/stageRecipeApi';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ChevronDown, ChevronUp, Eye, FileText, HelpCircle, RefreshCw, Upload, Package } from 'lucide-react';
import { OCR_DETECTION_CONFIG } from './ocrDetection/config';

// Components
import { ShortcutHelpModal } from '@/components/ocr/ShortcutHelpModal';
import { ImageInfoCard } from '@/components/ocr/ImageInfoCard';
import { RealtimeDetectionPanel } from '@/components/ocr/RealtimeDetectionPanel';
import { CompressionSettingsPanel } from '@/components/ocr/CompressionSettingsPanel';
import { KeywordSettingsPanel } from '@/components/ocr/KeywordSettingsPanel';
import { TestHistoryCard } from '@/components/ocr/TestHistoryCard';
import { FinalResultBadge } from '@/components/ocr/FinalResultBadge';
import { DetectionProgressIndicator } from '@/components/ocr/DetectionProgressIndicator';
import { OCRSettingsSection } from '@/components/ocr/OCRSettingsSection';
import { OCRResultsSection } from '@/components/ocr/OCRResultsSection';
import { MiniWorkflowOverlay, type WorkflowPhase } from '@/components/ocr/MiniWorkflowOverlay';

// Hooks
import { useOCRDetectionStore } from '@/state/ocrDetectionStore';
import { useAnomalyStore } from '@/state/anomalyStore';
import { useAIConfigStore } from '@/state/aiConfigStore';
import { useAppStore } from '@/state/appStore';
import { useModelMode } from '@/hooks/useModelMode';
import { useOCRLocalState } from '@/hooks/ocr/useOCRLocalState';
import { useImagePreprocessing } from '@/hooks/ocr/useImagePreprocessing';
import { useFusionAI } from '@/hooks/ocr/useFusionAI';
import { useOCRProcessing } from '@/hooks/ocr/useOCRProcessing';
import { useOCRCamera } from '@/hooks/ocr/useOCRCamera';
import { useKeyboardShortcuts } from '@/hooks/ocr/useKeyboardShortcuts';
import { useOCRHistory } from '@/hooks/ocr/useOCRHistory';
import { useOCRWorkflow } from '@/hooks/ocr/useOCRWorkflow';
import { useOCRTemplates } from '@/hooks/ocr/useOCRTemplates';
import { useDetectionSave } from '@/hooks/ocr/useDetectionSave';
import { useROIProcessor } from '@/hooks/ocr/useROIProcessor';
import { useDetectionMode } from '@/hooks/ocr/useDetectionMode';
import { useBatchProcessingManager } from '@/hooks/ocr/useBatchProcessingManager';
import { useRealtimeDetection } from '@/hooks/ocr/useRealtimeDetection';
import { useRealtimeDetectionLoop } from '@/hooks/ocr/useRealtimeDetectionLoop';
import { useBatchResultHandler } from '@/hooks/ocr/useBatchResultHandler';
import { useOCRSideEffects } from '@/hooks/ocr/useOCRSideEffects';
import { useModelConfig } from '@/hooks/ocr/useModelConfig';
import { useProductRecipe } from '@/hooks/ocr/useProductRecipe';
import { useAlarmControl } from '@/hooks/ocr/useAlarmControl';
import { useFullscreen } from '@/hooks/ocr/useFullscreen';
import { useHardwareTrigger } from '@/hooks/ocr/useHardwareTrigger';
import { useHardwareWatchdog } from '@/hooks/ocr/useHardwareWatchdog';
import { useHardwareFallbackKeys } from '@/hooks/ocr/useHardwareFallbackKeys';

// Utils
import { getConfidenceColor, getConfidenceIcon, exportOCRResults } from '@/lib/ocr/ocrUtils';
import { compressImage as compressImageHelper } from '@/lib/imageUtils/imageHelpers';
import { performBarcodeDetection as detectBarcodesAnalyzer } from '@/lib/barcode/barcodeAnalyzer';
import { stitchROISnapshots as stitchROIs, stitchMultipleROIs as stitchMultiROIs } from '@/lib/roi/roiStitcher';

function BindingSectionToggle({
  title,
  expanded,
  onToggle,
  rightText,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  rightText?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center justify-between cursor-pointer hover:bg-slate-700/30 active:bg-slate-700/50 rounded-md p-2 -m-2 transition-colors select-none text-left"
    >
      <span className="text-xs text-slate-400">{title}</span>
      <span className="flex items-center gap-2">
        {rightText && <span className="text-[11px] text-slate-500">{rightText}</span>}
        <span className="text-xs text-slate-500">{expanded ? '收起' : '展开'}</span>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </span>
    </button>
  );
}

const OCRDetectionScreen: React.FC = () => {
  const navigate = useNavigate();
  // 1. 统一管理本地状态 (Local State)
  const {
    selectedImage, setSelectedImage,
    imagePreview, setImagePreview,
    isProcessing, setIsProcessing,
    ocrResult, setOcrResult,
    testHistory, setTestHistory,
    requireQualifiedConfirmation, setRequireQualifiedConfirmation,
    matchStatus, setMatchStatus,
    finalResult,
    setFinalResult,
    isInPostDetectionDelay, setIsInPostDetectionDelay,
    isCameraOn, setIsCameraOn,
    isRealtimeActive, setIsRealtimeActive,
    availableDevices, setAvailableDevices,
    selectedDeviceId, setSelectedDeviceId,
    videoInfo, setVideoInfo,
    currentSharpness, setCurrentSharpness,
    bestSharpness, setBestSharpness,
    windowId,
    expandedTargetGroups, setExpandedTargetGroups,
    isDetectionStatusExpanded, setIsDetectionStatusExpanded,
    showCompressionSettings, setShowCompressionSettings,
    showKeywordSettings, setShowKeywordSettings,
    showBarcodeTemplateList, setShowBarcodeTemplateList,
    isSettingsExpanded, setIsSettingsExpanded,
  } = useOCRLocalState();

  // 2. 从 Zustand Store 获取持久化状态
  const {
    enableKeywordAnalysis, keywords, keywordMatchMode, minConfidence, keywordConfigs,
    enableBarcodeDetection, barcodeConfigs, isBarcodeSettingsExpanded,
    barcodeTemplates, barcodeTemplateName, showBarcodeSaveTemplate,
    templates, templateName, showSaveTemplate,
    autoCapture, captureDelaySeconds, detectionConfidence, selectedTargets, targetConfidences, currentModelId, ocrEngineModel,
    fusionModeEnabled, selectedStandardId,
    imageSaveMode, yoloDetectionMode, yoloTimeoutSeconds, detectedElements, elementDetectionStartTime,
    nonGridTargets, roiWeightRatio, compressionEnabled, compressionConfig, detectionInterval,
    workflowState, isWaitingForSpace, isPaused,
    detectionHistory, showHistoryDetails, expandedHistoryId,
    isFullscreen, showShortcutModal,
    isBindingInfoCollapsed, isQrRulesCollapsed, isQrSupplementCollapsed,
    batchProcessingMode, batchApplyRules, qrDetectIntervalSeconds,
    setEnableKeywordAnalysis, setKeywords, setKeywordMatchMode, setMinConfidence, setKeywordConfigs,
    setEnableBarcodeDetection, setBarcodeConfigs, setIsBarcodeSettingsExpanded, setBarcodeTemplateName, setShowBarcodeSaveTemplate,
    addBarcodeConfig, updateBarcodeConfig, removeBarcodeConfig,
    setTemplates, setTemplateName, setShowSaveTemplate,
    setAutoCapture, setCaptureDelaySeconds, setDetectionConfidence, setSelectedTargets, setTargetConfidences, setCurrentModelId, setOcrEngineModel,
    setFusionModeEnabled, setSelectedStandardId,
    setImageSaveMode, setYoloDetectionMode, setRoiWeightRatio, setCompressionEnabled, setCompressionConfig, setDetectionInterval, setYoloTimeoutSeconds,
    setDetectedElements, setElementDetectionStartTime, setNonGridTargets, toggleNonGridTarget,
    setWorkflowState, setIsWaitingForSpace, setWorkflowResult, togglePause,
    setDetectionHistory, addDetectionHistory, setShowHistoryDetails, setExpandedHistoryId,
    setIsFullscreen, setShowShortcutModal,
    setIsBindingInfoCollapsed, setIsQrRulesCollapsed, setIsQrSupplementCollapsed,
    setBatchProcessingMode, setBatchApplyRules, setQrDetectIntervalSeconds,
    resetDetectionState, clearOldDetectionHistory,
    updateKeywordExpectedOrientation,
    detectionStats, setDetectionStats,
    stageBindingConfig, setStageBindingConfig,
  } = useOCRDetectionStore();
  const { activeAlerts, fetchAlerts, clearAlerts } = useAnomalyStore();
  const { toggleFullscreen } = useFullscreen({
    isFullscreen,
    setIsFullscreen,
  });

  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const processStageCode = urlParams.get('stage_code')?.trim() || '';
  const processStageName = urlParams.get('stage_name')?.trim() || processStageCode;
  const pageInstanceId = urlParams.get('page_instance_id')?.trim() || windowId;
  const cameraId = urlParams.get('camera_id')?.trim() || selectedDeviceId || '';
  // 后端检测循环需要的是 StreamSource 的 DB 主键，不是浏览器 deviceId
  // 虚拟摄像头 selectedDeviceId = "stream-<id>"，物理摄像头 = 浏览器 UUID
  const backendStreamId = selectedDeviceId?.startsWith('stream-') ? selectedDeviceId.replace('stream-', '') : null;
  const fixtureQr = urlParams.get('fixture_qr')?.trim() || '';
  const fixtureQrSourceParam = urlParams.get('fixture_source')?.trim();
  const fixtureQrPrefixes = (urlParams.get('fixture_qr_prefixes') || urlParams.get('fixture_qr_prefix') || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const fixtureQrPattern = urlParams.get('fixture_qr_pattern')?.trim() || '';
  const businessCodeParam = urlParams.get('business_code')?.trim() || '';
  const businessCodeTypeParam = urlParams.get('business_code_type')?.trim() || '';
  const requestedOcrEngine = urlParams.get('ocr_model');
  const fixtureQrSource = (
    fixtureQrSourceParam === 'vision' ||
    fixtureQrSourceParam === 'scanner' ||
    fixtureQrSourceParam === 'nfc' ||
    fixtureQrSourceParam === 'manual'
      ? fixtureQrSourceParam
      : (fixtureQr ? 'manual' : 'vision')
  ) as 'vision' | 'scanner' | 'nfc' | 'manual' | undefined;
  const selectedOcrModel = (
    requestedOcrEngine === 'rapidocr' || requestedOcrEngine === 'paddleocr' || requestedOcrEngine === 'auto'
      ? requestedOcrEngine
      : ocrEngineModel
  ) as 'auto' | 'rapidocr' | 'paddleocr';

  useEffect(() => {
    if (
      requestedOcrEngine &&
      (requestedOcrEngine === 'rapidocr' || requestedOcrEngine === 'paddleocr' || requestedOcrEngine === 'auto') &&
      requestedOcrEngine !== ocrEngineModel
    ) {
      setOcrEngineModel(requestedOcrEngine);
    }
  }, [ocrEngineModel, requestedOcrEngine, setOcrEngineModel]);

  // URL 参数优先；URL 没有时从持久化配方中读取
  const effectiveStageCode    = processStageCode    || stageBindingConfig.processStageCode;
  const effectiveStageName    = processStageName    || stageBindingConfig.processStageName    || effectiveStageCode;
  const effectivePageId       = pageInstanceId      || stageBindingConfig.pageInstanceId;
  const effectiveCameraId     = cameraId            || stageBindingConfig.cameraId;
  const effectiveFixturePrefixes = fixtureQrPrefixes.length > 0
    ? fixtureQrPrefixes
    : stageBindingConfig.fixtureQrPrefixes.split(',').map(s => s.trim()).filter(Boolean);
  const effectiveFixturePattern  = fixtureQrPattern  || stageBindingConfig.fixtureQrPattern;

  // 配方编辑本地状态
  const [isEditingBinding, setIsEditingBinding] = useState(false);
  const [editingConfig, setEditingConfig] = useState({
    processStageCode: stageBindingConfig.processStageCode,
    processStageName: stageBindingConfig.processStageName,
    pageInstanceId:   stageBindingConfig.pageInstanceId,
    cameraId:         stageBindingConfig.cameraId,
    fixtureQrPrefixes: stageBindingConfig.fixtureQrPrefixes,
    fixtureQrPattern:  stageBindingConfig.fixtureQrPattern,
  });

  const [fixtureQrInput, setFixtureQrInput] = useState(fixtureQr);
  const [fixtureQrInputSource, setFixtureQrInputSource] = useState<'vision' | 'scanner' | 'nfc' | 'manual'>(fixtureQrSource || 'vision');
  // 保存后端返回的增量 trace_context 字段（如 candidateCount / fallbackRecommended）
  const [lastSavedTraceContext, setLastSavedTraceContext] = useState<Record<string, any> | null>(null);
  const [lastSavedTracePreview, setLastSavedTracePreview] = useState<{
    traceConclusion?: '合格' | '存疑' | '需复检';
    traceConclusionReason?: string;
    traceRuleSummary?: string;
    relatedStages?: Array<{
      stageCode?: string;
      stageName?: string;
      businessCode?: string;
      status?: 'completed' | 'pending' | 'failed';
      resultId?: string;
      timestamp?: string;
      pageInstanceId?: string;
      cameraId?: string;
    }>;
  } | null>(null);

  // 配方选择状态
  const [showRecipeSelect, setShowRecipeSelect] = useState(false);
  const [appliedRecipeId, setAppliedRecipeId] = useState<string | null>(null);
  const [appliedRecipeName, setAppliedRecipeName] = useState<string | null>(null);
  // 应用配方时保存快照，用于差异对比
  const [appliedRecipeSnapshot, setAppliedRecipeSnapshot] = useState<StageRecipe | null>(null);

  // 3. 模型配置 Hook
  const suppressAutoSelectRef = useRef(false);
  const { currentModel, getTargetChineseName, getAvailableTargets, modelConfig, modelName, modelLoading, refreshModel, loadModelConfig } = useModelConfig({
    selectedTargets, setSelectedTargets,
    persistedModelId: currentModelId,
    setPersistedModelId: setCurrentModelId,
    suppressAutoSelectRef,
  });

  // 4. 其它全局 Store/Mode
  const { config } = useAIConfigStore();
  const { standards, addResult: addAppResult, fetchStandards } = useAppStore();
  const { isLocalMode, localModelConfig } = useModelMode();

  // 5. 基础 Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fixtureSupplementRef = useRef<HTMLDivElement>(null);
  const fixtureQrInputRefDom = useRef<HTMLInputElement>(null);
  const detectedElementsRef = useRef<string[]>(detectedElements);
  const elementDetectionStartTimeRef = useRef<number | null>(elementDetectionStartTime);
  const batchManagerRef = useRef<{ reset: () => void } | null>(null);
  const lastRuleSignatureRef = useRef<string | null>(null);
  // 用于在 handleSaveComplete 内读取最新 fixtureQrInput，避免闭包捕获过期值
  const fixtureQrInputRef = useRef(fixtureQrInput);
  useEffect(() => { fixtureQrInputRef.current = fixtureQrInput; }, [fixtureQrInput]);

  // 6. 核心功能 Hooks
  const {
    enableSmartPreprocessing, imageQualityMetrics, preprocessingRecommendation,
    processedImagePreview, showImageComparison, isAnalyzingImage, isPreprocessing,
    selectedPreprocessingPreset, setEnableSmartPreprocessing, setShowImageComparison,
    setSelectedPreprocessingPreset, performSmartImageAnalysis, applySmartPreprocessing, resetPreprocessingState,
  } = useImagePreprocessing();

  const {
    aiAnalysisResult, isAnalyzing, setAiAnalysisResult, setIsAnalyzing, performFusionAIAnalysis,
  } = useFusionAI({
    fusionModeEnabled,
    selectedStandardId: selectedStandardId || null,
    config,
  });

  const { refreshHistory } = useOCRHistory({ setDetectionHistory });

  const {
    updateKeywordConfigs, updateKeywordConfidence, updateKeywordType,
    updateKeywordRequiredCount, updateKeywordTargetRoi,
    saveTemplate, loadTemplate, deleteTemplate,
    saveBarcodeTemplate, loadBarcodeTemplate, deleteBarcodeTemplate,
  } = useOCRTemplates();

  const traceContext = useMemo(() => ({
    processStageCode:   effectiveStageCode,
    processStageName:   effectiveStageName,
    pageInstanceId:     effectivePageId,
    cameraId:           effectiveCameraId,
    fixtureEnabled:     stageBindingConfig.fixtureEnabled,
    fixtureQr:          fixtureQrInput,
    fixtureQrDetected:  !!fixtureQrInput,
    fixtureQrSource:    fixtureQrInputSource,
    fixtureQrInputStatus: (fixtureQrInput
      ? 'success'
      : (fixtureQrInputSource === 'vision' ? 'pending' : 'failed')) as 'success' | 'pending' | 'failed',
    businessCode:       businessCodeParam,
    businessCodeType:   businessCodeTypeParam,
    fixtureQrPrefixes:  effectiveFixturePrefixes,
    fixtureQrPattern:   effectiveFixturePattern,
  }), [
    effectiveStageCode, effectiveStageName, effectivePageId, effectiveCameraId,
    stageBindingConfig.fixtureEnabled,
    fixtureQrInput, fixtureQrInputSource,
    businessCodeParam, businessCodeTypeParam,
    effectiveFixturePrefixes, effectiveFixturePattern,
  ]);

  // 报警灯控制
  const { sendAlarmSignal } = useAlarmControl({
    actionMap: appliedRecipeSnapshot?.deviceActionMap as any,
  });

  const handleSaveComplete = useCallback((savedData: any) => {
    if (savedData?.trace_context && typeof savedData.trace_context === 'object') {
      setLastSavedTraceContext(savedData.trace_context);
    }
    setLastSavedTracePreview({
      traceConclusion: savedData?.trace_conclusion,
      traceConclusionReason: savedData?.trace_conclusion_reason,
      traceRuleSummary: savedData?.trace_rule_summary,
      relatedStages: Array.isArray(savedData?.related_stages) ? savedData.related_stages : [],
    });
    if (effectiveStageCode) {
      fetchAlerts(effectiveStageCode);
    }
    // 视觉自动绑定：后端从 barcode_result 中匹配出工装码后，同步更新前端输入状态
    if (
      savedData?.fixture_qr &&
      savedData.fixture_qr_source === 'vision' &&
      !fixtureQrInputRef.current
    ) {
      setFixtureQrInput(savedData.fixture_qr);
      setFixtureQrInputSource('vision');
      toast.success(`工装码视觉识别: ${savedData.fixture_qr}`, { duration: 3000 });
    }
    // FQC终检结果即时提示
    if (savedData?.fqc_record_id) {
      const fqcResult = savedData.fqc_overall_result;
      if (fqcResult === '合格') {
        toast.success(`FQC终检: ${fqcResult}`, { duration: 4000 });
      } else if (fqcResult === '不合格') {
        toast.error(`FQC终检: ${fqcResult}`, { duration: 6000 });
      } else {
        toast(`FQC终检: ${fqcResult || '存疑'}`, { duration: 4000 });
      }
    }
    // 报警灯：根据检测结果自动控制（FQC不合格也触发报警）
    const quality = savedData?.fqc_overall_result || savedData?.overall_quality;
    if (quality === '合格') {
      sendAlarmSignal('qualified');
    } else if (quality === '存疑' || quality === '需复检' || quality === '不合格') {
      sendAlarmSignal('unqualified');
    }
  }, [effectiveStageCode, fetchAlerts, setFixtureQrInput, setFixtureQrInputSource, sendAlarmSignal]);

  const fixtureQrCandidates = useMemo(() => {
    const candidates = lastSavedTraceContext?.fixtureQrCandidates;
    return Array.isArray(candidates) ? candidates : [];
  }, [lastSavedTraceContext]);

  const scrollToFixtureSupplement = useCallback((source?: 'vision' | 'scanner' | 'nfc' | 'manual') => {
    if (source) {
      setFixtureQrInputSource(source);
      if (source !== 'vision') {
        setFixtureQrInput('');
      }
    }
    setIsQrSupplementCollapsed(false);
    window.setTimeout(() => {
      fixtureSupplementRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (source && source !== 'vision') {
        fixtureQrInputRefDom.current?.focus();
        fixtureQrInputRefDom.current?.select();
      }
    }, 80);
  }, [setIsQrSupplementCollapsed]);

  useEffect(() => {
    if (!isQrSupplementCollapsed && fixtureQrInputSource !== 'vision') {
      const timer = window.setTimeout(() => {
        fixtureQrInputRefDom.current?.focus();
        fixtureQrInputRefDom.current?.select();
      }, 50);
      return () => window.clearTimeout(timer);
    }
  }, [fixtureQrInputSource, isQrSupplementCollapsed]);

  const { saveDetectionResult } = useDetectionSave({
    fusionModeEnabled, selectedStandardId: selectedStandardId || null,
    addAppResult, clearOldDetectionHistory, addDetectionHistory, refreshHistory,
    onSaveComplete: handleSaveComplete,
    traceContext,
  });

  // 启动时：无 URL 参数 + 无 stageBindingConfig 时弹出配方选择（每个 tab 会话只弹一次）
  useEffect(() => {
    const hasUrlParams = !!(processStageCode || fixtureQrPrefixes.length);
    const hasStoredConfig = !!(stageBindingConfig.processStageCode || stageBindingConfig.fixtureQrPrefixes);
    const sessionKey = `recipe-modal-shown:${windowId}`;
    const alreadyShown = window.sessionStorage.getItem(sessionKey);
    if (!hasUrlParams && !hasStoredConfig && !alreadyShown) {
      window.sessionStorage.setItem(sessionKey, '1');
      setShowRecipeSelect(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!effectiveStageCode) {
      clearAlerts();
      return;
    }

    fetchAlerts(effectiveStageCode);

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchAlerts(effectiveStageCode);
      }
    }, 30000);

    return () => window.clearInterval(timer);
  }, [clearAlerts, effectiveStageCode, fetchAlerts]);

  // 应用配方 — 无论配方各项是否启用，都强制覆盖当前状态
  const applyRecipe = useCallback((recipe: StageRecipe) => {
    setStageBindingConfig({
      processStageCode:  recipe.processStageCode,
      processStageName:  recipe.processStageName,
      pageInstanceId:    stageBindingConfig.pageInstanceId,
      cameraId:          recipe.cameraId,
      fixtureEnabled:    recipe.fixtureEnabled,
      fixtureQrPrefixes: recipe.fixtureQrPrefixes,
      fixtureQrPattern:  recipe.fixtureQrPattern,
    });
    // 关键词 — 无论 enable 状态都覆盖，确保不保留旧配置
    setEnableKeywordAnalysis(recipe.enableKeywordAnalysis);
    if (recipe.enableKeywordAnalysis) {
      setKeywords(recipe.keywords);
      setKeywordConfigs(recipe.keywordConfigs.map(kw => ({
        ...kw,
        id: kw.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      })));
      setKeywordMatchMode(recipe.keywordMatchMode);
      setMinConfidence(recipe.minConfidence);
    }
    // 条码 — 同上
    setEnableBarcodeDetection(recipe.enableBarcodeDetection);
    if (recipe.enableBarcodeDetection) {
      setBarcodeConfigs(recipe.barcodeConfigs.map(bc => ({
        ...bc,
        id: bc.id || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      })));
    }
    // OCR 引擎
    setOcrEngineModel(recipe.ocrEngineModel);
    setDetectionConfidence(recipe.detectionConfidence);
    // 模型与目标同步（抑制 useModelConfig 的自动全选，由配方指定目标）
    suppressAutoSelectRef.current = true;
    if (recipe.currentModelId) {
      setCurrentModelId(recipe.currentModelId);
    }
    if (recipe.selectedTargets && recipe.selectedTargets.length > 0) {
      setSelectedTargets(recipe.selectedTargets);
    }
    // mini模式目标
    if (recipe.nonGridTargets && recipe.nonGridTargets.length > 0) {
      setNonGridTargets(recipe.nonGridTargets);
    }
    // 每个目标独立置信度
    setTargetConfidences(recipe.targetConfidences ?? {});
    // 融合模式
    setFusionModeEnabled(recipe.fusionModeEnabled);
    if (recipe.fusionModeEnabled && recipe.selectedStandardId) {
      setSelectedStandardId(recipe.selectedStandardId);
    }
    // 检测流程参数
    setAutoCapture(recipe.autoCapture);
    setCaptureDelaySeconds(recipe.captureDelaySeconds);
    setDetectionInterval(recipe.detectionInterval);
    setYoloTimeoutSeconds(recipe.yoloTimeoutSeconds);
    setYoloDetectionMode(recipe.yoloDetectionMode);
    setQrDetectIntervalSeconds(recipe.qrDetectIntervalSeconds);
    // 图像处理参数
    setImageSaveMode(recipe.imageSaveMode);
    setBatchProcessingMode(recipe.batchProcessingMode);
    setBatchApplyRules(recipe.batchApplyRules);
    setCompressionEnabled(recipe.compressionEnabled);
    setCompressionConfig(recipe.compressionConfig);
    setRoiWeightRatio(recipe.roiWeightRatio);
    setAppliedRecipeId(recipe.id);
    setAppliedRecipeName(recipe.name);
    setAppliedRecipeSnapshot(recipe);
    toast.success(`已应用配方：${recipe.name}`);
  }, [
    stageBindingConfig.pageInstanceId,
    setStageBindingConfig, setEnableKeywordAnalysis, setKeywords, setKeywordConfigs,
    setKeywordMatchMode, setMinConfidence, setEnableBarcodeDetection, setBarcodeConfigs,
    setOcrEngineModel, setDetectionConfidence, setFusionModeEnabled, setSelectedStandardId,
    setCurrentModelId, setSelectedTargets, setTargetConfidences,
    setAutoCapture, setCaptureDelaySeconds, setDetectionInterval, setYoloTimeoutSeconds,
    setYoloDetectionMode, setQrDetectIntervalSeconds, setImageSaveMode, setBatchProcessingMode,
    setBatchApplyRules, setCompressionEnabled, setCompressionConfig, setRoiWeightRatio,
  ]);

  // 10. 产品配方 Hook
  const {
    products, currentProduct, currentProductStageIndex,
    selectProduct, goToNextStage, goToPrevStage
  } = useProductRecipe(applyRecipe);

  // 差异检测：对比当前设置与应用配方的快照（keywords 字符串不做比对，以 keywordConfigs 为准）
  const recipeHasDiff = useMemo(() => {
    if (!appliedRecipeSnapshot) return false;
    const snap = appliedRecipeSnapshot;
    if (stageBindingConfig.processStageCode !== snap.processStageCode) return true;
    if (stageBindingConfig.fixtureQrPrefixes !== snap.fixtureQrPrefixes) return true;
    if (stageBindingConfig.fixtureQrPattern !== snap.fixtureQrPattern) return true;
    if (enableKeywordAnalysis !== snap.enableKeywordAnalysis) return true;
    if (JSON.stringify(keywordConfigs) !== JSON.stringify(snap.keywordConfigs)) return true;
    if (enableBarcodeDetection !== snap.enableBarcodeDetection) return true;
    if (JSON.stringify(barcodeConfigs) !== JSON.stringify(snap.barcodeConfigs)) return true;
    if (ocrEngineModel !== snap.ocrEngineModel) return true;
    if (currentModelId !== snap.currentModelId) return true;
    if (JSON.stringify(selectedTargets) !== JSON.stringify(snap.selectedTargets)) return true;
    if (JSON.stringify(nonGridTargets) !== JSON.stringify(snap.nonGridTargets)) return true;
    if (JSON.stringify(targetConfidences) !== JSON.stringify(snap.targetConfidences)) return true;
    if (autoCapture !== snap.autoCapture) return true;
    if (captureDelaySeconds !== snap.captureDelaySeconds) return true;
    if (detectionInterval !== snap.detectionInterval) return true;
    if (yoloTimeoutSeconds !== snap.yoloTimeoutSeconds) return true;
    if (yoloDetectionMode !== snap.yoloDetectionMode) return true;
    if (qrDetectIntervalSeconds !== snap.qrDetectIntervalSeconds) return true;
    if (imageSaveMode !== snap.imageSaveMode) return true;
    if (batchProcessingMode !== snap.batchProcessingMode) return true;
    if (batchApplyRules !== snap.batchApplyRules) return true;
    if (compressionEnabled !== snap.compressionEnabled) return true;
    if (JSON.stringify(compressionConfig) !== JSON.stringify(snap.compressionConfig)) return true;
    if (JSON.stringify(roiWeightRatio) !== JSON.stringify(snap.roiWeightRatio)) return true;
    return false;
  }, [
    appliedRecipeSnapshot, stageBindingConfig,
    enableKeywordAnalysis, keywordConfigs,
    enableBarcodeDetection, barcodeConfigs, ocrEngineModel,
    currentModelId, selectedTargets, nonGridTargets, targetConfidences,
    autoCapture, captureDelaySeconds, detectionInterval, yoloTimeoutSeconds,
    yoloDetectionMode, qrDetectIntervalSeconds, imageSaveMode, batchProcessingMode,
    batchApplyRules, compressionEnabled, compressionConfig, roiWeightRatio,
  ]);

  const handleSaveBackToRecipe = useCallback(async () => {
    if (!appliedRecipeId) return;
    try {
      await updateRecipe(appliedRecipeId, {
        processStageCode: stageBindingConfig.processStageCode,
        processStageName: stageBindingConfig.processStageName,
        fixtureQrPrefixes: stageBindingConfig.fixtureQrPrefixes,
        fixtureQrPattern: stageBindingConfig.fixtureQrPattern,
        cameraId: stageBindingConfig.cameraId,
        enableKeywordAnalysis,
        keywords,
        keywordConfigs,
        keywordMatchMode,
        minConfidence,
        enableBarcodeDetection,
        barcodeConfigs,
        ocrEngineModel,
        detectionConfidence,
        currentModelId,
        selectedTargets,
        autoCapture, captureDelaySeconds, detectionInterval, yoloTimeoutSeconds,
        yoloDetectionMode, qrDetectIntervalSeconds,
        imageSaveMode, batchProcessingMode, batchApplyRules,
        compressionEnabled, compressionConfig, roiWeightRatio,
      });
      // Refresh snapshot
      setAppliedRecipeSnapshot(prev => prev ? {
        ...prev,
        processStageCode: stageBindingConfig.processStageCode,
        processStageName: stageBindingConfig.processStageName,
        fixtureQrPrefixes: stageBindingConfig.fixtureQrPrefixes,
        fixtureQrPattern: stageBindingConfig.fixtureQrPattern,
        cameraId: stageBindingConfig.cameraId,
        enableKeywordAnalysis,
        keywords,
        keywordConfigs: [...keywordConfigs],
        keywordMatchMode,
        minConfidence,
        enableBarcodeDetection,
        barcodeConfigs: [...barcodeConfigs],
        ocrEngineModel,
        detectionConfidence,
        currentModelId,
        selectedTargets: [...selectedTargets],
        nonGridTargets: [...nonGridTargets],
        targetConfidences: { ...targetConfidences },
        autoCapture, captureDelaySeconds, detectionInterval, yoloTimeoutSeconds,
        yoloDetectionMode, qrDetectIntervalSeconds,
        imageSaveMode, batchProcessingMode, batchApplyRules,
        compressionEnabled, compressionConfig: { ...compressionConfig },
        roiWeightRatio: { ...roiWeightRatio },
      } : null);
      toast.success(`配方「${appliedRecipeName}」已更新`);
    } catch (e: any) {
      toast.error(e.message || '保存配方失败');
    }
  }, [
    appliedRecipeId, appliedRecipeName, stageBindingConfig,
    enableKeywordAnalysis, keywords, keywordConfigs, keywordMatchMode, minConfidence,
    enableBarcodeDetection, barcodeConfigs, ocrEngineModel, detectionConfidence,
    currentModelId, selectedTargets, nonGridTargets,
    autoCapture, captureDelaySeconds, detectionInterval, yoloTimeoutSeconds,
    yoloDetectionMode, qrDetectIntervalSeconds, imageSaveMode, batchProcessingMode,
    batchApplyRules, compressionEnabled, compressionConfig, roiWeightRatio,
  ]);

  const { toggleCamera, switchCamera } = useOCRCamera({
    windowId, videoRef, previewCanvasRef, isCameraOn, setIsCameraOn, setIsRealtimeActive,
    selectedDeviceId, setSelectedDeviceId, availableDevices, setAvailableDevices,
  });

  const {
    setIsDetecting, isDetectingRef, isPausedRef, detectionQueueRef,
    isProcessingQueueRef, historyDetectionsRef, debounceStartTimeRef, debounceSeconds, setDebounceSeconds,
  } = useRealtimeDetection({
    isRealtimeActive, isCameraOn, workflowState, detectionInterval, isPaused,
  });

  const { bestROIsRef, batchExtractROIs, captureAndEvaluateFrame, mergeROIs } = useROIProcessor({
    roiWeightRatio, detectionConfidence, selectedTargets,
  });

  const { evaluateDetections, evaluateDebounce } = useDetectionMode({
    yoloDetectionMode, yoloTimeoutSeconds, debounceSeconds, detectionConfidence,
  });

  const availableTargetsForRules = Array.from(new Set([...getAvailableTargets(), ...nonGridTargets]));

  // 7. 辅助功能（拼接、压缩、抓拍、二维码）
  const stitchROISnapshots = useCallback((roiSnapshots: Array<{ imageDataUrl: string; label: string }>) => 
    stitchROIs(roiSnapshots, nonGridTargets), [nonGridTargets]);

  const stitchMultipleROIs = useCallback((base64Image: string, detections: any[]) => 
    stitchMultiROIs(base64Image, detections), []);

  const compressImage = useCallback((base64Image: string): Promise<string> => {
    if (!compressionEnabled) {
      toast.error('⚠️ 压缩已禁用！大尺寸图片可能导致系统崩溃。', { duration: 5000, icon: '⚠️' });
      return Promise.resolve(base64Image);
    }
    return compressImageHelper(base64Image, {
      maxWidth: compressionConfig.maxWidth, maxHeight: compressionConfig.maxHeight,
      quality: compressionConfig.quality, maxSizeMB: compressionConfig.maxSizeMB
    });
  }, [compressionEnabled, compressionConfig]);

  const captureFrameData = useCallback((): { dataUrl: string; base64: string } | null => {
    if (!videoRef.current) return null;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    return { dataUrl, base64: dataUrl.split(',')[1] };
  }, []);

  const performBarcodeDetection = useCallback(async (imageSource: string | File | null) => 
    detectBarcodesAnalyzer(imageSource, barcodeConfigs, enableBarcodeDetection, {
      maxRetries: OCR_DETECTION_CONFIG.maxRetries, enableMasking: true,
      maskColor: '#FFFFFF', maskPadding: 30, useWeChatQR: OCR_DETECTION_CONFIG.useWeChatQR
    }), [enableBarcodeDetection, barcodeConfigs]);

  // 8. OCR 处理与工作流
  const { processCapturedImage, performOCRTest } = useOCRProcessing({
    selectedModel: selectedOcrModel || OCR_DETECTION_CONFIG.defaultModel, compressionEnabled, enableKeywordAnalysis, keywordConfigs,
    keywordMatchMode, enableBarcodeDetection, barcodeConfigs, fusionModeEnabled, enableSmartPreprocessing,
    applySmartPreprocessing, setShowImageComparison, compressImage, performBarcodeDetection,
    performFusionAIAnalysis, saveDetectionResult, setOcrResult, setWorkflowResult,
    setAiAnalysisResult, setMatchStatus, setFinalResult, setTestHistory, setIsProcessing,
  });

  const {
    onBatchComplete,
    useAutoSaveBatchResult,
    resetBatchSaveState,
  } = useBatchResultHandler({
    enableKeywordAnalysis,
    enableBarcodeDetection,
    barcodeConfigs,
    keywordConfigs,
    keywordMatchMode,
    requireQualifiedConfirmation,
    fusionModeEnabled,
    performFusionAIAnalysis,
    batchManager: { reset: () => batchManagerRef.current?.reset() },
    setOcrResult,
    setImagePreview,
    setWorkflowState,
    setFinalResult,
    setMatchStatus,
    setIsWaitingForSpace,
    setWorkflowResult,
    setAiAnalysisResult,
    setDetectedElements,
    setElementDetectionStartTime,
    addDetectionHistory,
    saveDetectionResult,
    captureFrameData,
  });

  const batchManager = useBatchProcessingManager({
    selectedTargets,
    enableKeywordAnalysis,
    keywordConfigs,
    enableBarcodeDetection,
    barcodeConfigs,
    nonGridTargets,
    onBatchComplete,
  });

  batchManagerRef.current = batchManager;

  useAutoSaveBatchResult(ocrResult, imagePreview, matchStatus);

  const { handleManualCapture } = useOCRWorkflow({
    videoRef, isCameraOn, workflowState, selectedTargets, requireQualifiedConfirmation,
    processCapturedImage: processCapturedImage as any,
    setWorkflowState: setWorkflowState as any, setSelectedImage, setImagePreview,
    setDetectedElements, setElementDetectionStartTime, setIsWaitingForSpace,
    setMatchStatus: setMatchStatus as any, setWorkflowResult,
    setAiAnalysisResult, setFinalResult,
    detectedElementsRef, elementDetectionStartTimeRef,
  });

  const handleConfirmUnqualified = useCallback(() => {
    setIsWaitingForSpace(false);
    setDetectedElements([]);
    detectedElementsRef.current = [];
    setElementDetectionStartTime(null);
    elementDetectionStartTimeRef.current = null;
    batchManager.reset();
    setFinalResult('none');
    setWorkflowState('completed');
    // 关闭报警灯
    sendAlarmSignal('idle');
    setTimeout(() => {
      setWorkflowState('idle');
      setMatchStatus('none');
      setWorkflowResult(null);
      setAiAnalysisResult(null);
    }, 1000);
  }, [
    batchManager,
    detectedElementsRef,
    elementDetectionStartTimeRef,
    sendAlarmSignal,
    setAiAnalysisResult,
    setDetectedElements,
    setElementDetectionStartTime,
    setFinalResult,
    setIsWaitingForSpace,
    setMatchStatus,
    setWorkflowResult,
    setWorkflowState,
  ]);

  const clearCurrentInspectionOutcome = useCallback(() => {
    setOcrResult(null);
    setAiAnalysisResult(null);
    setMatchStatus('none');
    setFinalResult('none');
    setWorkflowResult(null);
  }, [
    setOcrResult,
    setAiAnalysisResult,
    setFinalResult,
    setMatchStatus,
    setWorkflowResult,
  ]);

  useEffect(() => {
    const ruleSignature = JSON.stringify({
      keywordMatchMode,
      keywordConfigs: keywordConfigs.map(config => ({
        text: config.text,
        confidence: config.confidence,
        type: config.type,
        requiredCount: config.requiredCount,
        targetRoi: config.targetRoi,
        expectedOrientation: config.expectedOrientation,
      })),
      barcodeConfigs: barcodeConfigs.map(config => ({
        id: config.id,
        expectedText: config.expectedText,
        matchMode: config.matchMode,
        enabled: config.enabled,
        targetRoi: config.targetRoi,
      })),
      selectedTargets,
      batchProcessingMode,
    });

    if (lastRuleSignatureRef.current === null) {
      lastRuleSignatureRef.current = ruleSignature;
      return;
    }

    if (lastRuleSignatureRef.current !== ruleSignature) {
      batchManager.reset();
      resetBatchSaveState();
      clearCurrentInspectionOutcome();
      setIsWaitingForSpace(false);
      lastRuleSignatureRef.current = ruleSignature;
    }
  }, [
    barcodeConfigs,
    batchManager,
    batchProcessingMode,
    clearCurrentInspectionOutcome,
    keywordConfigs,
    keywordMatchMode,
    resetBatchSaveState,
    selectedTargets,
    setIsWaitingForSpace,
  ]);

  const handleFusionModeEnabledChange = useCallback((enabled: boolean) => {
    const modeChanged = enabled !== fusionModeEnabled;
    setFusionModeEnabled(enabled);
    if (modeChanged) {
      clearCurrentInspectionOutcome();
    }
  }, [
    clearCurrentInspectionOutcome,
    fusionModeEnabled,
    setFusionModeEnabled,
  ]);

  const handleSelectedStandardChange = useCallback((id: string) => {
    const standardChanged = !!selectedStandardId && id !== selectedStandardId;
    setSelectedStandardId(id);
    if (standardChanged) {
      clearCurrentInspectionOutcome();
    }
  }, [
    clearCurrentInspectionOutcome,
    selectedStandardId,
    setSelectedStandardId,
  ]);

  const handleEnableBarcodeDetectionChange = useCallback((enabled: boolean) => {
    const changed = enabled !== enableBarcodeDetection;
    setEnableBarcodeDetection(enabled);
    if (changed) {
      clearCurrentInspectionOutcome();
    }
  }, [
    clearCurrentInspectionOutcome,
    enableBarcodeDetection,
    setEnableBarcodeDetection,
  ]);

  const handleEnableKeywordAnalysisChange = useCallback((enabled: boolean) => {
    const changed = enabled !== enableKeywordAnalysis;
    setEnableKeywordAnalysis(enabled);
    if (changed) {
      clearCurrentInspectionOutcome();
    }
  }, [
    clearCurrentInspectionOutcome,
    enableKeywordAnalysis,
    setEnableKeywordAnalysis,
  ]);

  const handleKeywordMatchModeChange = useCallback((mode: 'contains' | 'exact') => {
    const changed = mode !== keywordMatchMode;
    setKeywordMatchMode(mode);
    if (changed) {
      clearCurrentInspectionOutcome();
    }
  }, [
    clearCurrentInspectionOutcome,
    keywordMatchMode,
    setKeywordMatchMode,
  ]);

  const handleForceReset = useCallback(() => {
    batchManager.reset();
    clearOldDetectionHistory();
    resetDetectionState();
    resetBatchSaveState();
    setIsProcessing(false);
    setOcrResult(null);
    setTestHistory([]);
    setAiAnalysisResult(null);
    setIsAnalyzing(false);
    setSelectedImage(null);
    setImagePreview('');
    resetPreprocessingState();
    setCurrentSharpness(0);
    setBestSharpness(0);
    setIsRealtimeActive(false);
    setDetectionStats({
      totalDetections: 0,
      qualifiedCount: 0,
      unqualifiedCount: 0,
      personDetections: 0,
      equipmentDetections: 0,
      lastDetectionTime: null,
    });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    setWorkflowState('idle');
    setMatchStatus('none');
    setFinalResult('none');
    toast.success('已强制重置检测状态');
  }, [
    batchManager,
    clearOldDetectionHistory,
    resetDetectionState,
    resetBatchSaveState,
    resetPreprocessingState,
    setAiAnalysisResult,
    setCurrentSharpness,
    setDetectionStats,
    setFinalResult,
    setImagePreview,
    setIsInPostDetectionDelay,
    setIsAnalyzing,
    setIsProcessing,
    setIsRealtimeActive,
    setMatchStatus,
    setOcrResult,
    setSelectedImage,
    setTestHistory,
    setWorkflowState,
  ]);

  // 9. 实时检测循环
  const { performRealtimeDetection } = useRealtimeDetectionLoop({
    isRealtimeActive, isCameraOn, workflowState, isPaused, autoCapture,
    detectionInterval, detectionConfidence, selectedTargets, imageSaveMode,
    captureDelaySeconds, batchProcessingMode, requireQualifiedConfirmation,
    currentModelId: currentModel, modelConfig, videoRef, detectionCanvasRef, detectedElementsRef, elementDetectionStartTimeRef,
    isDetectingRef, isPausedRef, detectionQueueRef, isProcessingQueueRef,
    historyDetectionsRef, debounceStartTimeRef, debounceSeconds,
    roiProcessorBestROIsRef: bestROIsRef, batchExtractROIs, captureAndEvaluateFrame, mergeROIs,
    evaluateDetections, evaluateDebounce, batchManager: batchManager as any,
    stitchROISnapshots, stitchMultipleROIs, captureFrameData, processCapturedImage: processCapturedImage as any,
    detectedElements, elementDetectionStartTime, detectionStats, nonGridTargets,
    streamId: backendStreamId ?? undefined,
    setIsDetecting, setDetectedElements, setElementDetectionStartTime,
    setDetectionStats, setCurrentSharpness, setBestSharpness, setIsInPostDetectionDelay,
    setWorkflowState: setWorkflowState as any, setSelectedImage, setImagePreview, setIsWaitingForSpace,
    setMatchStatus: setMatchStatus as any, setWorkflowResult, setAiAnalysisResult, setFinalResult,
  });

  // 10. 全局效应 (Side Effects & Keyboard)
  useKeyboardShortcuts({
    callbacks: {
      onCapture: handleManualCapture,
      onToggleRealtime: () => setIsRealtimeActive(!isRealtimeActive),
      onTogglePause: togglePause,
      onToggleFullscreen: toggleFullscreen,
      onResetWorkflow: handleForceReset,
      onToggleCamera: toggleCamera,
      onCloseModal: () => setShowShortcutModal(false),
      onConfirmUnqualified: handleConfirmUnqualified,
    },
    isWaitingForSpace,
    isCameraOn,
    autoCapture,
    workflowState,
    isRealtimeActive,
    isPaused,
    showShortcutModal,
  });

  // 10b. 硬件串口传感器触发 (Arduino 光电开关/按钮)
  const hardwareTriggerRef = useRef<any>(null);
  const handleHardwareStopCaptureRef = useRef<() => void>(() => {});

  const handleHardwareStopCapture = useCallback(() => {
    if (isRealtimeActive) {
      console.log('[硬件触发] 收到采集结束信号，开始批量评估缓存的目标和文字');
      void batchManager.triggerBatchProcessing(true);
    } else if (selectedImage) {
      console.log('[硬件触发] 手动模式收到采集结束信号，对当前选中图触发 OCR 评估');
      toast('采集结束：开始评估当前图像', { id: 'hardware-stop-capture-manual', icon: '🧪' });
      void performOCRTest(selectedImage);
    } else {
      console.log('[硬件触发] 采集结束信号到达，但当前无待评估图像，忽略');
    }
  }, [isRealtimeActive, selectedImage, batchManager, performOCRTest]);

  useEffect(() => { handleHardwareStopCaptureRef.current = handleHardwareStopCapture; }, [handleHardwareStopCapture]);

  // 看门狗:硬件 TRIGGER 后若 30s 未收到 STOP_CAPTURE,自动降级评估(防卡死)
  const watchdog = useHardwareWatchdog({
    armed: workflowState !== 'idle' && workflowState !== 'completed' && !isAnalyzing,
    timeoutMs: 30_000,
    debug: true,
    onTimeout: () => {
      toast('采集超时:30 秒未收到旋转台就位信号,自动启动评估', { icon: '⏰' });
      handleHardwareStopCaptureRef.current();
    },
  });
  const { markActivity } = watchdog;

  const handleHardwareTrigger = useCallback(() => {
    if (!isCameraOn) return;
    if (workflowState === 'idle' && hardwareTriggerRef.current?.sendData) {
      void hardwareTriggerRef.current.sendData('START_ROTATE\n');
    }
    if (!isRealtimeActive && workflowState === 'idle') {
      handleManualCapture();
    }
    markActivity();
  }, [isCameraOn, workflowState, isRealtimeActive, handleManualCapture, markActivity]);

  const hardwareTrigger = useHardwareTrigger({
    callbacks: {
      onTrigger: handleHardwareTrigger,
      onClear: handleForceReset,
      onResetWorkflow: handleForceReset,
      onConfirmUnqualified: handleConfirmUnqualified,
      onStopCapture: handleHardwareStopCapture,
    },
    enabled: true,
    actionMap: appliedRecipeSnapshot?.deviceActionMap as any,
  });
  hardwareTriggerRef.current = hardwareTrigger;

  // 键盘 ⇄ 硬件后备:Arduino 不在线时,PageDown 等键可手动替 STOP_CAPTURE 等信号
  useHardwareFallbackKeys({
    callbacks: {
      onTrigger: handleHardwareTrigger,
      onClear: handleForceReset,
      onResetWorkflow: handleForceReset,
      onConfirmUnqualified: handleConfirmUnqualified,
      onStopCapture: () => {
        toast('键盘后备:触发 STOP_CAPTURE', { icon: '⌨️' });
        handleHardwareStopCapture();
      },
    },
    enabled: true,
  });

  useOCRSideEffects({
    detectedElements,
    detectedElementsRef,
    elementDetectionStartTime,
    elementDetectionStartTimeRef,
    isCameraOn,
    videoRef,
    setVideoInfo: setVideoInfo as any,
    enableBarcodeDetection,
    barcodeConfigs,
    standards,
    selectedStandardId,
    setSelectedStandardId: handleSelectedStandardChange,
    setKeywords,
    updateKeywordConfigs,
    setEnableBarcodeDetection: handleEnableBarcodeDetectionChange,
    fetchStandards: fetchStandards as any,
    setTemplates,
  });

  // 11. 生命周期管理 (仅保留核心逻辑)
  useEffect(() => {
    // 组件挂载时触发实时检测循环（如果已激活）
    if (isRealtimeActive && isCameraOn && !isPaused) {
      performRealtimeDetection();
    }
  }, [isRealtimeActive, isCameraOn, isPaused, performRealtimeDetection]);

  // 12. UI Event Handlers
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let finalFile = file;
      const isHeic = file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

      if (isHeic) {
        const heic2any = (await import('heic2any')).default as (options: {
          blob: Blob;
          toType: string;
          quality: number;
        }) => Promise<Blob>;
        const jpegBlob = await heic2any({
          blob: file,
          toType: 'image/jpeg',
          quality: compressionConfig.quality || 0.8,
        });
        finalFile = new File(
          [jpegBlob],
          file.name.replace(/\.(heic|heif)$/i, '.jpg'),
          { type: 'image/jpeg' }
        );
      }

      setSelectedImage(finalFile);
      setOcrResult(null);
      setAiAnalysisResult(null);
      setMatchStatus('none');
      setFinalResult('none');
      resetPreprocessingState();

      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(finalFile);

      if (enableSmartPreprocessing) {
        void performSmartImageAnalysis(finalFile);
      }
    } catch (error) {
      console.error('处理上传图片失败:', error);
      toast.error('图片处理失败，请重试');
    }
  };

  const clearResults = () => {
    setSelectedImage(null); setImagePreview(''); setOcrResult(null);
    setAiAnalysisResult(null); setMatchStatus('none'); setFinalResult('none'); resetDetectionState();
    resetBatchSaveState(); resetPreprocessingState(); setCurrentSharpness(0); setIsInPostDetectionDelay(false);
    batchManager.reset();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const displayFinalResult =
    workflowState === 'capturing' || workflowState === 'processing' || workflowState === 'searching_best_frame'
      ? 'none'
      : finalResult;

  return (
    <>
      {showRecipeSelect && (
        <RecipeSelectModal
          onApply={(recipe) => { applyRecipe(recipe); setShowRecipeSelect(false); }}
          onSkip={() => setShowRecipeSelect(false)}
        />
      )}
      <FinalResultBadge finalResult={displayFinalResult} />
      <DetectionProgressIndicator
        isRealtimeActive={isRealtimeActive}
        selectedTargets={selectedTargets}
        detectedElements={detectedElements}
        getTargetChineseName={getTargetChineseName}
        isInPostDetectionDelay={isInPostDetectionDelay}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-8">
        {/* 左侧：视频预览与基本设置 */}
        <div className="flex flex-col gap-4">
          <RealtimeDetectionPanel
            windowId={windowId}
            isCameraOn={isCameraOn}
            isRealtimeActive={isRealtimeActive}
            isPaused={isPaused}
            isFullscreen={isFullscreen}
            isDetecting={isDetectingRef.current}
            workflowState={workflowState as any}
            matchStatus={matchStatus as any}
            fusionModeEnabled={fusionModeEnabled}
            aiAnalysisResult={aiAnalysisResult as any}
            ocrResult={ocrResult}
            availableDevices={availableDevices}
            selectedDeviceId={selectedDeviceId}
            modelName={modelName}
            modelLoading={modelLoading}
            detectionStats={detectionStats}
            videoRef={videoRef}
            previewCanvasRef={previewCanvasRef}
            detectionCanvasRef={detectionCanvasRef}
            switchCamera={switchCamera}
            toggleCamera={toggleCamera}
            setIsRealtimeActive={setIsRealtimeActive}
            togglePause={togglePause}
            handleManualCapture={handleManualCapture}
            handleForceReset={handleForceReset}
            refreshModel={refreshModel}
            toggleFullscreen={toggleFullscreen}
            loadModelConfig={loadModelConfig}
            onModelSwitch={setCurrentModelId}
          />

          <Card className="border-slate-700 bg-slate-900/50 backdrop-blur-sm">
            <CardHeader className="pb-3 px-4 sm:px-6">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <FileText className="h-5 w-5 text-blue-400" />
                检测配置
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 px-4 sm:px-6 pb-6">
              <OCRSettingsSection
                isSettingsExpanded={isSettingsExpanded} setIsSettingsExpanded={setIsSettingsExpanded}
                detectionConfidence={detectionConfidence} setDetectionConfidence={setDetectionConfidence}
                detectionInterval={detectionInterval} setDetectionInterval={setDetectionInterval}
                requireQualifiedConfirmation={requireQualifiedConfirmation}
                setRequireQualifiedConfirmation={setRequireQualifiedConfirmation}
                currentModel={currentModel} modelConfig={modelConfig}
                selectedTargets={selectedTargets} nonGridTargets={nonGridTargets}
                expandedTargetGroups={expandedTargetGroups}
                getAvailableTargets={getAvailableTargets} getTargetChineseName={getTargetChineseName}
                setSelectedTargets={setSelectedTargets} toggleNonGridTarget={toggleNonGridTarget}
                setExpandedTargetGroups={setExpandedTargetGroups} imageSaveMode={imageSaveMode}
                setImageSaveMode={setImageSaveMode} roiWeightRatio={roiWeightRatio} setRoiWeightRatio={setRoiWeightRatio}
                yoloDetectionMode={yoloDetectionMode} setYoloDetectionMode={setYoloDetectionMode}
                yoloTimeoutSeconds={yoloTimeoutSeconds} setYoloTimeoutSeconds={setYoloTimeoutSeconds}
                detectedElements={detectedElements} elementDetectionStartTime={elementDetectionStartTime}
                isDetectionStatusExpanded={isDetectionStatusExpanded} setIsDetectionStatusExpanded={setIsDetectionStatusExpanded}
                batchProcessingMode={batchProcessingMode} setBatchProcessingMode={setBatchProcessingMode}
                batchManager={batchManager as any} fusionModeEnabled={fusionModeEnabled}
                selectedStandardId={selectedStandardId} standards={standards} isLocalMode={isLocalMode}
                config={config} localModelConfig={localModelConfig}
                setFusionModeEnabled={handleFusionModeEnabledChange} setSelectedStandardId={handleSelectedStandardChange}
                setOcrResult={setOcrResult} setMatchStatus={setMatchStatus} performFusionAIAnalysis={performFusionAIAnalysis}
                autoCapture={autoCapture} debounceSeconds={debounceSeconds} captureDelaySeconds={captureDelaySeconds}
                setAutoCapture={setAutoCapture} setDebounceSeconds={setDebounceSeconds} setCaptureDelaySeconds={setCaptureDelaySeconds}
                enableBarcodeDetection={enableBarcodeDetection} isBarcodeSettingsExpanded={isBarcodeSettingsExpanded}
                keywordConfigs={keywordConfigs} barcodeConfigs={barcodeConfigs} barcodeTemplates={barcodeTemplates}
                barcodeTemplateName={barcodeTemplateName} showBarcodeSaveTemplate={showBarcodeSaveTemplate}
                showBarcodeTemplateList={showBarcodeTemplateList} setEnableBarcodeDetection={handleEnableBarcodeDetectionChange}
                setIsBarcodeSettingsExpanded={setIsBarcodeSettingsExpanded} addBarcodeConfig={addBarcodeConfig}
                updateBarcodeConfig={updateBarcodeConfig} removeBarcodeConfig={removeBarcodeConfig}
                setBarcodeTemplateName={setBarcodeTemplateName} setShowBarcodeSaveTemplate={setShowBarcodeSaveTemplate}
                setShowBarcodeTemplateList={setShowBarcodeTemplateList} saveBarcodeTemplate={saveBarcodeTemplate}
                loadBarcodeTemplate={loadBarcodeTemplate} deleteBarcodeTemplate={deleteBarcodeTemplate}
                availableTargetsForBarcode={availableTargetsForRules} enableSmartPreprocessing={enableSmartPreprocessing}
                selectedPreprocessingPreset={selectedPreprocessingPreset} isAnalyzingImage={isAnalyzingImage}
                imageQualityMetrics={imageQualityMetrics} preprocessingRecommendation={preprocessingRecommendation}
                isPreprocessing={isPreprocessing} processedImagePreview={processedImagePreview}
                showImageComparison={showImageComparison} setEnableSmartPreprocessing={setEnableSmartPreprocessing}
                setSelectedPreprocessingPreset={setSelectedPreprocessingPreset} setShowImageComparison={setShowImageComparison}
                isRealtimeActive={isRealtimeActive} isCameraOn={isCameraOn} videoInfo={videoInfo as any} videoRef={videoRef}
              />

              <CompressionSettingsPanel
                compressionEnabled={compressionEnabled} showCompressionSettings={showCompressionSettings}
                compressionConfig={compressionConfig} setCompressionEnabled={setCompressionEnabled}
                setShowCompressionSettings={setShowCompressionSettings} setCompressionConfig={setCompressionConfig}
              />

              {/* 配方差异提示条 */}
              {appliedRecipeId && recipeHasDiff && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 flex items-center justify-between gap-3 text-xs">
                  <span className="text-amber-300">⚠ 本地设置与配方「{appliedRecipeName}」有差异</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSaveBackToRecipe}
                      className="rounded border border-amber-500 bg-amber-500/20 px-2.5 py-1 text-amber-200 hover:bg-amber-500/30"
                    >
                      保存回配方
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAppliedRecipeId(null); setAppliedRecipeName(null); setAppliedRecipeSnapshot(null); }}
                      className="rounded border border-slate-600 bg-slate-800 px-2.5 py-1 text-slate-400 hover:border-slate-500"
                    >
                      仅本次生效
                    </button>
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-cyan-200">页面绑定信息</div>
                    {appliedRecipeName && (
                      <span className="text-[11px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/30 rounded px-1.5 py-0.5">
                        配方: {appliedRecipeName}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[11px] text-cyan-300/80">用于多页面隔离与追踪验证</div>
                    <button
                      type="button"
                      onClick={() => setShowRecipeSelect(true)}
                      className="rounded border border-cyan-600/40 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-500/20"
                    >
                      {appliedRecipeName ? '切换配方' : '选择配方'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isEditingBinding) {
                          setEditingConfig({
                            processStageCode: stageBindingConfig.processStageCode,
                            processStageName: stageBindingConfig.processStageName,
                            pageInstanceId:   stageBindingConfig.pageInstanceId,
                            cameraId:         stageBindingConfig.cameraId,
                            fixtureQrPrefixes: stageBindingConfig.fixtureQrPrefixes,
                            fixtureQrPattern:  stageBindingConfig.fixtureQrPattern,
                          });
                        }
                        setIsEditingBinding(!isEditingBinding);
                      }}
                      className="rounded border border-cyan-600/40 bg-cyan-500/10 px-2 py-0.5 text-[11px] text-cyan-300 hover:bg-cyan-500/20"
                    >
                      {isEditingBinding ? '取消' : '手动编辑'}
                    </button>
                  </div>
                </div>

                {/* 配方编辑表单 */}
                {isEditingBinding && (
                  <div className="space-y-2 rounded border border-cyan-600/30 bg-slate-900/70 p-3 text-xs">
                    <div className="text-cyan-300 font-medium mb-1">编辑工序配方（URL 参数优先，此处为默认值）</div>
                    {[
                      { key: 'processStageCode', label: '工序标识 (stage_code)' },
                      { key: 'processStageName', label: '工序名称 (stage_name)' },
                      { key: 'pageInstanceId',   label: '页面实例 (page_instance_id)' },
                      { key: 'cameraId',         label: '相机ID (camera_id)' },
                      { key: 'fixtureQrPrefixes',label: '工装前缀规则，逗号分隔 (fixture_qr_prefixes)' },
                      { key: 'fixtureQrPattern', label: '工装正则规则 (fixture_qr_pattern)' },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-slate-400 mb-0.5">{label}</label>
                        <input
                          value={(editingConfig as any)[key]}
                          onChange={(e) => setEditingConfig(prev => ({ ...prev, [key]: e.target.value }))}
                          className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 outline-none focus:border-cyan-500"
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setStageBindingConfig(editingConfig);
                          setIsEditingBinding(false);
                          toast.success('本地绑定已保存');
                        }}
                        className="rounded border border-cyan-500 bg-cyan-500/20 px-3 py-1 text-cyan-200 hover:bg-cyan-500/30"
                      >
                        保存本地绑定
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setStageBindingConfig({
                            processStageCode: '', processStageName: '',
                            pageInstanceId: '', cameraId: '',
                            fixtureQrPrefixes: '', fixtureQrPattern: '',
                          });
                          setIsEditingBinding(false);
                          toast.success('配方已清空，将由 URL 参数决定');
                        }}
                        className="rounded border border-slate-600 bg-slate-800 px-3 py-1 text-slate-400 hover:border-slate-500"
                      >
                        清空配方
                      </button>
                    </div>
                  </div>
                )}
               {/* 配方绑定信息展示区块 */}
            <div className="space-y-4">
              <div className="flex flex-col gap-3 rounded-lg bg-slate-900/50 p-3 border border-border/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-accent" />
                    <span className="text-xs font-semibold text-slate-300">产品配方 (多工序)</span>
                  </div>
                </div>
                <select
                  value={currentProduct?.id || ''}
                  onChange={e => selectProduct(e.target.value || null)}
                  className="w-full rounded border border-border/50 bg-slate-800 px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-accent"
                >
                  <option value="">未选择产品 (自由模式)</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                {currentProduct && (
                  <div className="space-y-2 mt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">当前进度</span>
                      <span className="text-[10px] text-accent font-medium">{currentProductStageIndex + 1} / {currentProduct.stages.length}</span>
                    </div>
                    <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-accent transition-all duration-300"
                        style={{ width: `${((currentProductStageIndex + 1) / currentProduct.stages.length) * 100}%` }}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={currentProductStageIndex === 0}
                        onClick={goToPrevStage}
                        className="h-6 flex-1 text-[10px] py-0"
                      >
                        上一步
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        disabled={currentProductStageIndex === currentProduct.stages.length - 1}
                        onClick={goToNextStage}
                        className="h-6 flex-1 text-[10px] py-0"
                      >
                        下一步
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg bg-slate-900/50 p-3 border border-border/30">
                    <BindingSectionToggle
                      title="基本信息"
                      expanded={!isBindingInfoCollapsed}
                      onToggle={() => setIsBindingInfoCollapsed(!isBindingInfoCollapsed)}
                    />
                    <div className={`transition-all duration-300 ${isBindingInfoCollapsed ? 'max-h-0 opacity-0 mt-0 overflow-hidden' : 'max-h-[420px] opacity-100 mt-3'}`}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="rounded border border-slate-700 bg-slate-950/60 p-2">
                          <div className="text-slate-400">工序</div>
                          <div className="mt-1 text-slate-100 break-all">
                            {effectiveStageName || effectiveStageCode || <span className="text-amber-400">未设置</span>}
                            {!processStageCode && effectiveStageCode && <span className="ml-1 text-cyan-500/70">(配方)</span>}
                          </div>
                        </div>
                        <div className="rounded border border-slate-700 bg-slate-950/60 p-2">
                          <div className="text-slate-400">页面实例</div>
                          <div className="mt-1 text-slate-100 break-all">
                            {effectivePageId || <span className="text-amber-400">未设置</span>}
                            {!pageInstanceId && effectivePageId && <span className="ml-1 text-cyan-500/70">(配方)</span>}
                          </div>
                        </div>
                        <div className="rounded border border-slate-700 bg-slate-950/60 p-2">
                          <div className="text-slate-400">相机</div>
                          <div className="mt-1 text-slate-100 break-all">
                            {effectiveCameraId || <span className="text-amber-400">未设置</span>}
                            {!cameraId && effectiveCameraId && <span className="ml-1 text-cyan-500/70">(配方)</span>}
                          </div>
                        </div>
                        <div className="rounded border border-slate-700 bg-slate-950/60 p-2">
                          <div className="text-slate-400">YOLO模型</div>
                          <div className="mt-1 text-slate-100 break-all">{currentModel || currentModelId || '未设置'}</div>
                        </div>
                        <div className="rounded border border-slate-700 bg-slate-950/60 p-2">
                          <div className="text-slate-400">OCR引擎</div>
                          <div className="mt-1 text-slate-100 break-all">{selectedOcrModel || 'auto'}</div>
                        </div>
                        <div className="rounded border border-slate-700 bg-slate-950/60 p-2">
                          <div className="text-slate-400">工装输入方式</div>
                          <div className="mt-1 text-slate-100 break-all">{fixtureQrInputSource || 'vision'}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded border border-slate-700 bg-slate-900/60 p-3 text-xs">
                    <BindingSectionToggle
                      title="工装二维码规则"
                      expanded={!isQrRulesCollapsed}
                      onToggle={() => setIsQrRulesCollapsed(!isQrRulesCollapsed)}
                      rightText={fixtureQrInput ? '已识别工装码' : undefined}
                    />
                    <div className={`transition-all duration-300 ${isQrRulesCollapsed ? 'max-h-0 opacity-0 mt-0 overflow-hidden' : 'max-h-[260px] opacity-100 mt-3'}`}>
                      <div className="space-y-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => scrollToFixtureSupplement('scanner')}
                            className="rounded border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[11px] text-slate-200 hover:border-amber-500/40"
                          >
                            快捷扫码补录
                          </button>
                          <button
                            type="button"
                            onClick={() => scrollToFixtureSupplement('nfc')}
                            className="rounded border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[11px] text-slate-200 hover:border-amber-500/40"
                          >
                            快捷NFC补录
                          </button>
                          <button
                            type="button"
                            onClick={() => scrollToFixtureSupplement('manual')}
                            className="rounded border border-slate-700 bg-slate-900/70 px-2.5 py-1 text-[11px] text-slate-200 hover:border-amber-500/40"
                          >
                            快捷人工补录
                          </button>
                        </div>
                        <div className="text-slate-200 break-all">当前工装码: {fixtureQrInput || '未直接传入，允许从整图多二维码中自动筛选'}</div>
                        <div className="text-slate-200 break-all">前缀规则: {effectiveFixturePrefixes.length > 0 ? effectiveFixturePrefixes.join(', ') : <span className="text-amber-400">未设置</span>}</div>
                        <div className="text-slate-200 break-all">正则规则: {effectiveFixturePattern || <span className="text-amber-400">未设置</span>}</div>
                        {fixtureQrCandidates.length > 0 && (
                          <div className="rounded border border-cyan-500/20 bg-cyan-500/5 p-2">
                            <div className="text-cyan-200">视觉候选工装码 ({fixtureQrCandidates.length})</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {fixtureQrCandidates.map((candidate: any, index: number) => {
                                const text = String(candidate?.text || '').trim();
                                const selected = !!text && fixtureQrInput === text;
                                if (!text) return null;
                                return (
                                  <button
                                    key={`${text}-${index}`}
                                    type="button"
                                    onClick={() => {
                                      setFixtureQrInput(text);
                                      setFixtureQrInputSource('vision');
                                      toast.success(`已选择候选工装码: ${text}`, { duration: 2500 });
                                    }}
                                    className={`rounded border px-2 py-1 text-left transition-colors ${
                                      selected
                                        ? 'border-cyan-400 bg-cyan-400/20 text-cyan-100'
                                        : 'border-slate-700 bg-slate-900/70 text-slate-200 hover:border-cyan-500/40'
                                    }`}
                                  >
                                    <div className="break-all text-[11px] font-medium">{text}</div>
                                    <div className="mt-1 text-[10px] text-slate-400">
                                      {candidate?.type || 'qr'}
                                      {typeof candidate?.confidence === 'number' ? ` · ${(candidate.confidence * 100).toFixed(0)}%` : ''}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="mt-2 text-[11px] text-slate-400">
                              识别未能唯一确定工装码时，可先点选候选，再保存当前结果。
                            </div>
                          </div>
                        )}
                        <div className="text-slate-400">
                          整图抓拍场景下，如果识别到多个二维码且规则不足以唯一筛出工装码，系统会提示改用扫码、NFC或人工补录，不改变原有拼接图和批量检验主流程。
                        </div>
                      </div>
                    </div>
                  </div>

                  <div ref={fixtureSupplementRef} className="space-y-3 rounded border border-amber-500/20 bg-amber-500/5 p-3 text-xs">
                    <BindingSectionToggle
                      title="工装二维码补录"
                      expanded={!isQrSupplementCollapsed}
                      onToggle={() => setIsQrSupplementCollapsed(!isQrSupplementCollapsed)}
                    />
                    <div className={`transition-all duration-300 ${isQrSupplementCollapsed ? 'max-h-0 opacity-0 mt-0 overflow-hidden' : 'max-h-[320px] opacity-100 mt-3'}`}>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          {(['vision', 'scanner', 'nfc', 'manual'] as const).map(source => (
                            <button
                              key={source}
                              type="button"
                              onClick={() => setFixtureQrInputSource(source)}
                              className={`rounded border px-2 py-2 text-xs transition-colors ${
                                fixtureQrInputSource === source
                                  ? 'border-amber-400 bg-amber-400/20 text-amber-100'
                                  : 'border-slate-700 bg-slate-900/60 text-slate-300 hover:border-amber-500/40'
                              }`}
                            >
                              {source === 'vision' ? '视觉' : source === 'scanner' ? '扫码' : source === 'nfc' ? 'NFC' : '人工'}
                            </button>
                          ))}
                        </div>
                        <div className="space-y-2">
                          <label className="block text-slate-400">工装二维码</label>
                          <input
                            ref={fixtureQrInputRefDom}
                            value={fixtureQrInput}
                            onChange={(event) => setFixtureQrInput(event.target.value.trim())}
                            placeholder={fixtureQrInputSource === 'vision' ? '视觉未识别到时可留空，等待自动筛选' : '请输入补录的工装二维码'}
                            className="w-full rounded border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-400"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2 text-slate-300">
                          <button
                            type="button"
                            onClick={() => {
                              setFixtureQrInput('');
                              setFixtureQrInputSource('vision');
                            }}
                            className="rounded border border-slate-700 bg-slate-900/70 px-3 py-1.5 hover:border-slate-500"
                          >
                            恢复视觉自动识别
                          </button>
                          {fixtureQr && (
                            <button
                              type="button"
                              onClick={() => {
                                setFixtureQrInput(fixtureQr);
                                setFixtureQrInputSource(fixtureQrSource || 'manual');
                              }}
                              className="rounded border border-slate-700 bg-slate-900/70 px-3 py-1.5 hover:border-slate-500"
                            >
                              恢复初始工装码
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <AnomalyAlertBanner alerts={activeAlerts} processStageCode={effectiveStageCode} />
                  {activeAlerts.length > 0 && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const query = effectiveStageCode ? `?process_stage_code=${encodeURIComponent(effectiveStageCode)}` : '';
                          navigate(`/anomalies${query}`);
                        }}
                        className="text-[11px] text-cyan-400 hover:text-cyan-300"
                      >
                        打开异常看板
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
                <Button onClick={() => fileInputRef.current?.click()} className="w-full flex items-center gap-2" variant="outline">
                  <Upload className="h-4 w-4" /> 选择图片上传
                </Button>
                {imagePreview && (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2">
                      {currentProduct && finalResult === 'qualified' && currentProductStageIndex < currentProduct.stages.length - 1 && (
                        <Button 
                          onClick={goToNextStage}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse shadow-lg shadow-emerald-900/20"
                        >
                          完成检测，进入下一工序
                        </Button>
                      )}
                    </div>
                    {showImageComparison && processedImagePreview ? (
                      <div className="grid grid-cols-2 gap-2">
                        <div className="text-center"><div className="text-xs text-slate-400 mb-1">原始图像</div><img src={imagePreview} className="max-h-32 mx-auto rounded-lg border border-slate-600" /></div>
                        <div className="text-center"><div className="text-xs text-slate-400 mb-1">预处理后</div><img src={processedImagePreview} className="max-h-32 mx-auto rounded-lg border border-blue-500" /></div>
                      </div>
                    ) : <img src={imagePreview} className="max-h-64 mx-auto rounded-lg border border-slate-600" />}
                    <p className="text-sm text-slate-400 text-center">点击上方按钮更换图片</p>
                  </div>
                )}
              </div>

              <KeywordSettingsPanel
                enableKeywordAnalysis={enableKeywordAnalysis} showSaveTemplate={showSaveTemplate}
                showKeywordSettings={showKeywordSettings} templateName={templateName}
                templates={templates} keywords={keywords} keywordMatchMode={keywordMatchMode}
                keywordConfigs={keywordConfigs} minConfidence={minConfidence}
                setEnableKeywordAnalysis={handleEnableKeywordAnalysisChange} setShowSaveTemplate={setShowSaveTemplate}
                setShowKeywordSettings={setShowKeywordSettings} setTemplateName={setTemplateName}
                setKeywords={setKeywords} setKeywordMatchMode={handleKeywordMatchModeChange} setMinConfidence={setMinConfidence}
                updateKeywordConfigs={updateKeywordConfigs} updateKeywordType={updateKeywordType}
                updateKeywordRequiredCount={updateKeywordRequiredCount} updateKeywordConfidence={updateKeywordConfidence}
                updateKeywordExpectedOrientation={updateKeywordExpectedOrientation} updateKeywordTargetRoi={updateKeywordTargetRoi}
                availableTargets={availableTargetsForRules} getTargetChineseName={getTargetChineseName}
                saveTemplate={saveTemplate} loadTemplate={loadTemplate} deleteTemplate={deleteTemplate}
              />

              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => performOCRTest(selectedImage)} disabled={!selectedImage || isProcessing} className="flex items-center gap-2">
                  {isProcessing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                  {isProcessing ? '识别中...' : '开始识别'}
                </Button>
                <Button variant="outline" onClick={clearResults} disabled={!selectedImage}>清空</Button>
              </div>
              <ImageInfoCard imageFile={selectedImage} />
            </CardContent>
          </Card>

          <div className="flex justify-center">
            <Button variant="outline" onClick={() => setShowShortcutModal(true)} className="flex items-center gap-2">
              <HelpCircle className="h-4 w-4" /> 快捷键说明
            </Button>
          </div>
          <TestHistoryCard testHistory={testHistory} />
        </div>

        {/* 右侧：识别结果 */}
        <OCRResultsSection
          fusionModeEnabled={fusionModeEnabled} isRealtimeActive={isRealtimeActive} enableBarcodeDetection={enableBarcodeDetection}
          workflowState={workflowState as any} matchStatus={matchStatus as any} finalResult={finalResult} isAnalyzing={isAnalyzing} isWaitingForSpace={isWaitingForSpace}
          ocrResult={ocrResult} aiAnalysisResult={aiAnalysisResult as any} selectedTargets={selectedTargets}
          detectionConfidence={detectionConfidence} keywordConfigs={keywordConfigs} detectionHistory={detectionHistory}
          imagePreview={imagePreview} currentSharpness={currentSharpness} bestSharpness={bestSharpness} imageSaveMode={imageSaveMode}
          traceContext={lastSavedTraceContext ? { ...traceContext, ...{
            fixtureQrCandidateCount: lastSavedTraceContext.fixtureQrCandidateCount,
            fixtureQrCandidates: lastSavedTraceContext.fixtureQrCandidates,
            fixtureQrFallbackRecommended: lastSavedTraceContext.fixtureQrFallbackRecommended,
          }} : traceContext}
          tracePreview={lastSavedTracePreview || undefined}
          detectedElementsRef={detectedElementsRef} elementDetectionStartTimeRef={elementDetectionStartTimeRef}
          showHistoryDetails={showHistoryDetails} expandedHistoryId={expandedHistoryId}
          setAiAnalysisResult={setAiAnalysisResult} setIsAnalyzing={setIsAnalyzing} setIsWaitingForSpace={setIsWaitingForSpace}
          setDetectedElements={setDetectedElements} setElementDetectionStartTime={setElementDetectionStartTime}
          setFinalResult={setFinalResult} setWorkflowState={setWorkflowState as any} setMatchStatus={setMatchStatus as any}
          setWorkflowResult={setWorkflowResult} setShowHistoryDetails={setShowHistoryDetails}
          setExpandedHistoryId={setExpandedHistoryId} refreshHistory={refreshHistory}
          getTargetChineseName={getTargetChineseName} getConfidenceIcon={getConfidenceIcon}
          getConfidenceColor={getConfidenceColor} exportOCRResults={exportOCRResults}
          onScrollToFixtureSupplement={scrollToFixtureSupplement}
          fixtureQrInput={fixtureQrInput}
          onFixtureQrInputChange={setFixtureQrInput}
          onFixtureQrSourceChange={setFixtureQrInputSource}
        />
      </div>

      <ShortcutHelpModal isOpen={showShortcutModal} onClose={() => setShowShortcutModal(false)} />

      {/* 迷你工作流状态浮层（可选呼出，Portal 到视频容器以便原生全屏下亦可见） */}
      <MiniWorkflowOverlay
        portalToVideoContainer
        positionClass="absolute bottom-3 right-3 z-[60]"
        phase={(() => {
          if (workflowState === 'processing' || isAnalyzing) return 'detecting';
          if (workflowState === 'capturing' || workflowState === 'searching_best_frame') return 'capturing';
          if (finalResult === 'qualified') return 'pass';
          if (finalResult === 'unqualified') return 'fail';
          if (isRealtimeActive) return 'triggered';
          return 'idle';
        })() as WorkflowPhase}
      />
    </>
  );
};

export default OCRDetectionScreen;
