import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Label } from '@/components/ui/Label';

// Components
import { TargetSelectionPanel } from '@/components/ocr/TargetSelectionPanel';
import { ROIYoloSettingsPanel } from '@/components/ocr/ROIYoloSettingsPanel';
import { BatchProcessingPanel } from '@/components/ocr/BatchProcessingPanel';
import { FusionModeSettingsPanel } from '@/components/ocr/FusionModeSettingsPanel';
import { CaptureSettingsPanel } from '@/components/ocr/CaptureSettingsPanel';
import { BarcodeSettingsPanel } from '@/components/ocr/BarcodeSettingsPanel';
import { SmartPreprocessingPanel } from '@/components/ocr/SmartPreprocessingPanel';
import { VideoDebugInfo } from '@/components/ocr/VideoDebugInfo';
import { BarcodeConfig, KeywordConfig } from '@/state/ocrDetectionStore';
import { PREPROCESSING_PRESETS } from '@/screens/ocrDetection/config';

interface OCRSettingsSectionProps {
  // Settings Panel State
  isSettingsExpanded: boolean;
  setIsSettingsExpanded: (v: boolean) => void;

  // Basic Settings
  detectionConfidence: number;
  setDetectionConfidence: (v: number) => void;
  detectionInterval: number;
  setDetectionInterval: (v: number) => void;
  requireQualifiedConfirmation: boolean;
  setRequireQualifiedConfirmation: (v: boolean) => void;

  // Target Selection
  currentModel: string | null;
  modelConfig: any;
  selectedTargets: string[];
  nonGridTargets: string[];
  expandedTargetGroups: Set<string>;
  getAvailableTargets: () => string[];
  getTargetChineseName: (target: string | null | undefined) => string;
  setSelectedTargets: (targets: string[]) => void;
  toggleNonGridTarget: (target: string) => void;
  setExpandedTargetGroups: React.Dispatch<React.SetStateAction<Set<string>>>;

  // ROI / YOLO Settings
  imageSaveMode: 'full' | 'roi';
  setImageSaveMode: (mode: 'full' | 'roi') => void;
  roiWeightRatio: { area: number; clarity: number };
  setRoiWeightRatio: (ratio: { area: number; clarity: number }) => void;
  yoloDetectionMode: 'or' | 'and';
  setYoloDetectionMode: (mode: 'or' | 'and') => void;
  yoloTimeoutSeconds: number;
  setYoloTimeoutSeconds: (v: number) => void;
  detectedElements: string[];
  elementDetectionStartTime: number | null;
  isDetectionStatusExpanded: boolean;
  setIsDetectionStatusExpanded: (v: boolean) => void;
  batchProcessingMode: 'stitching' | 'batch' | 'traditional';
  setBatchProcessingMode: (mode: 'stitching' | 'batch' | 'traditional') => void;

  // Batch Processing
  batchManager: any;

  // Fusion Mode Settings
  fusionModeEnabled: boolean;
  selectedStandardId: string | undefined;
  standards: any[];
  isLocalMode: boolean;
  config: any;
  localModelConfig: any;
  setFusionModeEnabled: (v: boolean) => void;
  setSelectedStandardId: (id: string) => void;
  setOcrResult: (result: any) => void;
  setMatchStatus: (status: any) => void;
  performFusionAIAnalysis: (ocrBase64: string) => Promise<any>;

  // Capture Settings
  autoCapture: boolean;
  debounceSeconds: number;
  captureDelaySeconds: number;
  setAutoCapture: (v: boolean) => void;
  setDebounceSeconds: (v: number) => void;
  setCaptureDelaySeconds: (v: number) => void;

  // Barcode Settings
  enableBarcodeDetection: boolean;
  isBarcodeSettingsExpanded: boolean;
  keywordConfigs: KeywordConfig[];
  barcodeConfigs: BarcodeConfig[];
  barcodeTemplates: any[];
  barcodeTemplateName: string;
  showBarcodeSaveTemplate: boolean;
  showBarcodeTemplateList: boolean;
  setEnableBarcodeDetection: (v: boolean) => void;
  setIsBarcodeSettingsExpanded: (v: boolean) => void;
  addBarcodeConfig: (config: BarcodeConfig) => void;
  updateBarcodeConfig: (id: string, updates: Partial<BarcodeConfig>) => void;
  removeBarcodeConfig: (id: string) => void;
  setBarcodeTemplateName: (v: string) => void;
  setShowBarcodeSaveTemplate: (v: boolean) => void;
  setShowBarcodeTemplateList: (v: boolean) => void;
  saveBarcodeTemplate: () => Promise<void>;
  loadBarcodeTemplate: (templateId: string) => void;
  deleteBarcodeTemplate: (templateId: string) => Promise<void>;
  availableTargetsForBarcode: string[];

  // Smart Preprocessing Settings
  enableSmartPreprocessing: boolean;
  selectedPreprocessingPreset: string;
  isAnalyzingImage: boolean;
  imageQualityMetrics: any;
  preprocessingRecommendation: any;
  isPreprocessing: boolean;
  processedImagePreview: string | null;
  showImageComparison: boolean;
  setEnableSmartPreprocessing: (v: boolean) => void;
  setSelectedPreprocessingPreset: (v: string) => void;
  setShowImageComparison: (v: boolean) => void;

  // Video Debug Info
  isRealtimeActive: boolean;
  isCameraOn: boolean;
  videoInfo: { width: number; height: number; readyState: number } | null;
  videoRef: React.RefObject<HTMLVideoElement>;
}

export const OCRSettingsSection: React.FC<OCRSettingsSectionProps> = (props) => {
  const hasTargetScopedRules =
    props.keywordConfigs.some(config => config.targetRoi && config.targetRoi !== 'all') ||
    props.barcodeConfigs.some(config => config.enabled && config.targetRoi && config.targetRoi !== 'all');
  const shouldShowTargetRuleWarning = hasTargetScopedRules && props.batchProcessingMode !== 'batch';

  return (
    <div className="p-3 sm:p-4 bg-slate-800/50 rounded-lg border border-slate-600">
      <div className="border-t border-slate-600/50 pt-3 mt-3">
        <div
          className="flex items-center justify-between cursor-pointer hover:bg-slate-700/30 active:bg-slate-700/50 rounded-md p-2 -m-2 transition-colors select-none"
          onClick={() => props.setIsSettingsExpanded(!props.isSettingsExpanded)}
        >
          <div className="text-xs text-slate-400">检测设置</div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">
              {props.isSettingsExpanded ? '收起' : '展开'}
            </span>
            {props.isSettingsExpanded ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </div>
        </div>

        {/* 可折叠的设置内容 */}
        <div
          className={`space-y-3 transition-all duration-300 ease-in-out ${
            props.isSettingsExpanded
              ? 'max-h-[800px] opacity-100 mt-3 overflow-y-auto'
              : 'max-h-0 opacity-0 mt-0 overflow-hidden'
          }`}
        >
          {/* 检测置信度设置 */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">检测置信度</Label>
            <select
              value={props.detectionConfidence.toString()}
              onChange={(e) => props.setDetectionConfidence(parseFloat(e.target.value))}
              className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-100 text-sm"
            >
              <option value="0.1">10%</option>
              <option value="0.2">20%</option>
              <option value="0.3">30%</option>
              <option value="0.4">40%</option>
              <option value="0.5">50%</option>
              <option value="0.6">60%</option>
              <option value="0.7">70%</option>
              <option value="0.8">80%</option>
              <option value="0.9">90%</option>
              <option value="0.95">95%</option>
            </select>
          </div>

          {/* 检测间隔设置 */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">检测间隔</Label>
            <select
              className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-100 text-sm"
              value={props.detectionInterval.toString()}
              onChange={(e) => {
                const interval = parseFloat(e.target.value);
                props.setDetectionInterval(interval);
                console.log('检测间隔设置为:', interval === 0 ? '自适应(最快)' : `${interval}秒`);
              }}
            >
              <option value="0">自适应(最快)</option>
              <option value="0.05">0.05秒</option>
              <option value="0.1">0.1秒</option>
              <option value="0.2">0.2秒</option>
              <option value="0.3">0.3秒</option>
              <option value="0.5">0.5秒</option>
              <option value="1">1秒</option>
              <option value="3">3秒</option>
            </select>
          </div>

          {/* 合格结果确认设置 */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">合格结果确认</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">
                {props.requireQualifiedConfirmation ? '需要回车确认' : '自动继续'}
              </span>
              <button
                onClick={() => props.setRequireQualifiedConfirmation(!props.requireQualifiedConfirmation)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                  props.requireQualifiedConfirmation ? 'bg-blue-600' : 'bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                    props.requireQualifiedConfirmation ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {shouldShowTargetRuleWarning && (
            <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-3">
              <div className="text-sm font-medium text-amber-300">目标绑定规则当前未处于严格模式</div>
              <div className="mt-1 text-xs text-amber-200">
                已配置按目标绑定的关键词或二维码规则，但当前不是批处理模式。
                在整图OCR下缺少ROI上下文，结果会按存疑处理。要做严格判定，请切换到“批处理模式”。
              </div>
            </div>
          )}

          {/* 检测目标选择 - 分组显示 */}
          <TargetSelectionPanel
            currentModel={props.currentModel}
            modelConfig={props.modelConfig}
            selectedTargets={props.selectedTargets}
            nonGridTargets={props.nonGridTargets}
            expandedTargetGroups={props.expandedTargetGroups}
            getAvailableTargets={props.getAvailableTargets}
            getTargetChineseName={props.getTargetChineseName}
            setSelectedTargets={props.setSelectedTargets}
            toggleNonGridTarget={props.toggleNonGridTarget}
            setExpandedTargetGroups={props.setExpandedTargetGroups}
          />

          {/* ROI截图和YOLO检测增强设置 */}
          <ROIYoloSettingsPanel
            imageSaveMode={props.imageSaveMode}
            setImageSaveMode={props.setImageSaveMode}
            roiWeightRatio={props.roiWeightRatio}
            setRoiWeightRatio={props.setRoiWeightRatio}
            yoloDetectionMode={props.yoloDetectionMode}
            setYoloDetectionMode={props.setYoloDetectionMode}
            yoloTimeoutSeconds={props.yoloTimeoutSeconds}
            setYoloTimeoutSeconds={props.setYoloTimeoutSeconds}
            detectedElements={props.detectedElements}
            selectedTargets={props.selectedTargets}
            elementDetectionStartTime={props.elementDetectionStartTime}
            isDetectionStatusExpanded={props.isDetectionStatusExpanded}
            setIsDetectionStatusExpanded={props.setIsDetectionStatusExpanded}
            batchProcessingMode={props.batchProcessingMode}
            setBatchProcessingMode={props.setBatchProcessingMode}
          />

          {/* 批处理状态面板 */}
          {props.batchProcessingMode === 'batch' && props.batchManager && (
            <BatchProcessingPanel status={props.batchManager.status} />
          )}

          {/* 融合模式设置 */}
          <FusionModeSettingsPanel
            fusionModeEnabled={props.fusionModeEnabled}
            selectedStandardId={props.selectedStandardId}
            standards={props.standards}
            isLocalMode={props.isLocalMode}
            config={props.config}
            localModelConfig={props.localModelConfig}
            setFusionModeEnabled={props.setFusionModeEnabled}
            setSelectedStandardId={props.setSelectedStandardId}
            setOcrResult={props.setOcrResult}
            setMatchStatus={props.setMatchStatus}
            performFusionAIAnalysis={props.performFusionAIAnalysis}
          />

          {/* 抓拍设置面板 */}
          <CaptureSettingsPanel
            autoCapture={props.autoCapture}
            debounceSeconds={props.debounceSeconds}
            captureDelaySeconds={props.captureDelaySeconds}
            setAutoCapture={props.setAutoCapture}
            setDebounceSeconds={props.setDebounceSeconds}
            setCaptureDelaySeconds={props.setCaptureDelaySeconds}
          />
        </div>
      </div>

      {/* 二维码检测设置面板 */}
      <BarcodeSettingsPanel
        enableBarcodeDetection={props.enableBarcodeDetection}
        isBarcodeSettingsExpanded={props.isBarcodeSettingsExpanded}
        barcodeConfigs={props.barcodeConfigs}
        barcodeTemplates={props.barcodeTemplates}
        barcodeTemplateName={props.barcodeTemplateName}
        showBarcodeSaveTemplate={props.showBarcodeSaveTemplate}
        showBarcodeTemplateList={props.showBarcodeTemplateList}
        setEnableBarcodeDetection={props.setEnableBarcodeDetection}
        setIsBarcodeSettingsExpanded={props.setIsBarcodeSettingsExpanded}
        addBarcodeConfig={props.addBarcodeConfig}
        updateBarcodeConfig={props.updateBarcodeConfig}
        removeBarcodeConfig={props.removeBarcodeConfig}
        setBarcodeTemplateName={props.setBarcodeTemplateName}
        setShowBarcodeSaveTemplate={props.setShowBarcodeSaveTemplate}
        setShowBarcodeTemplateList={props.setShowBarcodeTemplateList}
        onSaveBarcodeTemplate={props.saveBarcodeTemplate}
        onLoadBarcodeTemplate={props.loadBarcodeTemplate}
        onDeleteBarcodeTemplate={props.deleteBarcodeTemplate}
        availableTargets={props.availableTargetsForBarcode}
        getTargetChineseName={(t: string) => props.getTargetChineseName(t)}
      >
        {/* 智能预处理配置 */}
        <SmartPreprocessingPanel
          enableSmartPreprocessing={props.enableSmartPreprocessing}
          selectedPreprocessingPreset={props.selectedPreprocessingPreset}
          isAnalyzingImage={props.isAnalyzingImage}
          imageQualityMetrics={props.imageQualityMetrics}
          preprocessingRecommendation={props.preprocessingRecommendation}
          isPreprocessing={props.isPreprocessing}
          processedImagePreview={props.processedImagePreview}
          showImageComparison={props.showImageComparison}
          preprocessingPresets={PREPROCESSING_PRESETS}
          setEnableSmartPreprocessing={props.setEnableSmartPreprocessing}
          setSelectedPreprocessingPreset={props.setSelectedPreprocessingPreset}
          setShowImageComparison={props.setShowImageComparison}
        />
      </BarcodeSettingsPanel>

      {/* 检测状态和调试信息 */}
      <VideoDebugInfo
        isRealtimeActive={props.isRealtimeActive}
        detectionInterval={props.detectionInterval}
        selectedTargets={props.selectedTargets}
        detectionConfidence={props.detectionConfidence}
        requireQualifiedConfirmation={props.requireQualifiedConfirmation}
        getTargetChineseName={(target: string) => props.getTargetChineseName(target)}
        isCameraOn={props.isCameraOn}
        videoInfo={props.videoInfo}
        videoRef={props.videoRef}
      />
    </div>
  );
};
