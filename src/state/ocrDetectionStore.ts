import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  DETECTION_CONFIDENCE_DEFAULT,
  OCR_MIN_CONFIDENCE_DEFAULT,
} from './detectionDefaults';

const STORAGE_VERSION = 'v3';

const createScopedStorageName = () => {
  if (typeof window === 'undefined') {
    return `ocr-detection-storage-${STORAGE_VERSION}:server`;
  }

  const params = new URLSearchParams(window.location.search);
  const pageInstanceId = params.get('page_instance_id')?.trim();
  const stageCode = params.get('stage_code')?.trim();
  const explicitWindowId = params.get('windowId')?.trim();

  const buildScopeKey = () => {
    if (pageInstanceId) return `page:${pageInstanceId}`;
    if (stageCode) return `stage:${stageCode}`;
    if (explicitWindowId) return `window:${explicitWindowId}`;

    const sessionStorageKey = `ocr-detection-scope:${window.location.pathname}`;
    let sessionScope = window.sessionStorage.getItem(sessionStorageKey);
    if (!sessionScope) {
      sessionScope = `tab:${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      window.sessionStorage.setItem(sessionStorageKey, sessionScope);
    }
    return sessionScope;
  };

  return `ocr-detection-storage-${STORAGE_VERSION}:${buildScopeKey()}`;
};

const OCR_DETECTION_STORAGE_NAME = createScopedStorageName();

export interface KeywordConfig {
  id: string;
  text: string;
  confidence: number;
  expectedOrientation?: 0 | 90 | 180 | 270;
  type?: 'positive' | 'negative';  // 关键词类型：positive=必须出现，negative=排除清单（出现就存疑）
  requiredCount?: number;          // 需要出现的次数（默认1，negative类型无效）
  targetRoi?: string;
}

export interface BarcodeConfig {
  id: string;
  expectedText: string;
  matchMode: 'contains' | 'exact';
  enabled: boolean;
  targetRoi?: string;
  codeType?: 'qr' | 'linear';
  barcodeFormat?: 'auto' | 'code128' | 'ean13' | 'ean8' | 'upca' | 'upce' | 'itf' | 'codabar' | 'code39';
  allowOcrFallback?: boolean;
}

interface BarcodeTemplate {
  id: string;
  name: string;
  configs: BarcodeConfig[];
  createdAt: string;
}

interface OCRTemplate {
  id: string;
  name: string;
  keywords: string;
  keywordConfigs: KeywordConfig[];
  keywordMatchMode: 'contains' | 'exact';
  minConfidence: number;
  createdAt: string;
}

export interface DetectionHistoryItem {
  id: string;
  timestamp: Date;
  matchStatus: string;
  overallQuality: string;
  score: number;
  imageBase64?: string; // 图片数据
  ocrResult?: any; // OCR检测结果（包含详细识别列表）
  aiResult?: any; // AI分析结果
  // 保存二维码检测结果到历史记录中
  barcodeAnalysis?: {
    enabled: boolean;
    results: any[];
    overall_match: boolean;
    total_qr_codes_detected?: number;
    qr_detected_count?: number;
    linear_barcode_detected_count?: number;
    ocr_fallback_count?: number;
    qr_codes_data?: string[];
    detection_summary?: string;
  };
}

interface OCRDetectionState {
  // OCR 关键词分析设置
  enableKeywordAnalysis: boolean;
  keywords: string;
  keywordMatchMode: 'contains' | 'exact';
  minConfidence: number;
  keywordConfigs: KeywordConfig[];

  // 条码检测设置
  enableBarcodeDetection: boolean;
  barcodeConfigs: BarcodeConfig[];
  isBarcodeSettingsExpanded: boolean;
  useWeChatQR: boolean;

  // OCR 模板管理
  templates: OCRTemplate[];
  templateName: string;
  showSaveTemplate: boolean;
  // 二维码模板管理
  barcodeTemplates: BarcodeTemplate[];
  barcodeTemplateName: string;
  showBarcodeSaveTemplate: boolean;

  // 实时检测及工作流设置
  autoCapture: boolean;
  captureDelaySeconds: number; // 延时拍照时间（秒），0表示不延时
  detectionConfidence: number;
  selectedTargets: string[];
  targetConfidences: Record<string, number>; // 每个目标独立置信度覆盖
  currentModelId: string | null; // 当前页面选择的模型ID（持久化，页面级别）
  ocrEngineModel: 'auto' | 'rapidocr' | 'paddleocr';
  fusionModeEnabled: boolean;
  selectedStandardId?: string;

  // ROI截图和YOLO检测增强设置
  imageSaveMode: 'full' | 'roi';
  yoloDetectionMode: 'or' | 'and';
  yoloTimeoutSeconds: number;
  qrDetectIntervalSeconds: number; // 并行QR检测间隔（秒）
  detectedElements: string[];
  elementDetectionStartTime: number | null;
  nonGridTargets: string[]; // 标记为"不占格子"的目标列表（智能填充到空白区域）
  roiWeightRatio: { area: number; clarity: number }; // ROI选择权重比例（面积:清晰度）
  compressionEnabled: boolean; // 图片压缩开关
  compressionConfig: {
    maxWidth: number;
    maxHeight: number;
    quality: number;
    maxSizeMB: number;
  }; // 图片压缩配置
  detectionInterval: number; // 检测间隔（秒）

  // 批处理模式设置
  batchProcessingMode: 'stitching' | 'batch' | 'traditional'; // 检测模式：拼接/批处理/传统
  batchApplyRules: boolean; // 批处理时是否应用规则
  roiCacheIds: Record<string, string>; // ROI缓存ID {label: roi_id}
  batchTriggered: boolean; // 批处理是否已触发
  
  // 产品配方状态
  currentProductId: string | null;
  currentProductStageIndex: number;

  // 工作流状态
  workflowState: 'idle' | 'capturing' | 'searching_best_frame' | 'processing' | 'waiting_for_approval' | 'completed';
  isWaitingForSpace: boolean;
  workflowResult: any;
  isPaused: boolean; // 暂停检测状态

  // 检测历史
  detectionHistory: DetectionHistoryItem[];
  showHistoryDetails: boolean;
  expandedHistoryId: string | null;

  // UI 界面状态
  isSettingsExpanded: boolean;
  isFullscreen: boolean;
  showShortcutModal: boolean;
  isBindingInfoCollapsed: boolean;
  isQrRulesCollapsed: boolean;
  isQrSupplementCollapsed: boolean;

  // 检测统计
  detectionStats: {
    totalDetections: number;
    qualifiedCount: number;
    unqualifiedCount: number;
    personDetections: number;
    equipmentDetections: number;
    lastDetectionTime: string | null;
  };

  // Actions - 用于更新状态的方法
  setEnableKeywordAnalysis: (value: boolean) => void;
  setKeywords: (value: string) => void;
  setKeywordMatchMode: (value: 'contains' | 'exact') => void;
  setMinConfidence: (value: number) => void;
  setKeywordConfigs: (configs: KeywordConfig[]) => void;
  updateKeywordExpectedOrientation: (keywordId: string, deg: 0 | 90 | 180 | 270 | undefined) => void;

  // 条码检测 Actions
  setEnableBarcodeDetection: (value: boolean) => void;
  setBarcodeConfigs: (configs: BarcodeConfig[]) => void;
  addBarcodeConfig: (config: BarcodeConfig) => void;
  updateBarcodeConfig: (id: string, config: Partial<BarcodeConfig>) => void;
  removeBarcodeConfig: (id: string) => void;
  setIsBarcodeSettingsExpanded: (value: boolean) => void;
  setUseWeChatQR: (value: boolean) => void;

  // 模板管理 Actions
  setTemplates: (templates: OCRTemplate[]) => void;
  setTemplateName: (name: string) => void;
  setShowSaveTemplate: (show: boolean) => void;
  setBarcodeTemplates: (templates: BarcodeTemplate[]) => void;
  setBarcodeTemplateName: (name: string) => void;
  setShowBarcodeSaveTemplate: (show: boolean) => void;

  // 实时检测 Actions
  setAutoCapture: (value: boolean) => void;
  setCaptureDelaySeconds: (seconds: number) => void;
  setDetectionConfidence: (value: number) => void;
  setSelectedTargets: (targets: string[]) => void;
  setTargetConfidences: (confidences: Record<string, number>) => void;
  setCurrentModelId: (modelId: string | null) => void;
  setOcrEngineModel: (model: 'auto' | 'rapidocr' | 'paddleocr') => void;
  setFusionModeEnabled: (value: boolean) => void;
  setSelectedStandardId: (id?: string) => void;

  // ROI截图和YOLO检测增强 Actions
  setImageSaveMode: (mode: 'full' | 'roi') => void;
  setYoloDetectionMode: (mode: 'or' | 'and') => void;
  setYoloTimeoutSeconds: (seconds: number) => void;
  setQrDetectIntervalSeconds: (seconds: number) => void;
  setDetectedElements: (elements: string[]) => void;
  setElementDetectionStartTime: (time: number | null) => void;
  setNonGridTargets: (targets: string[]) => void;
  toggleNonGridTarget: (target: string) => void;
  setRoiWeightRatio: (ratio: { area: number; clarity: number }) => void;
  setCompressionEnabled: (enabled: boolean) => void;
  setCompressionConfig: (config: { maxWidth: number; maxHeight: number; quality: number; maxSizeMB: number }) => void;
  setDetectionInterval: (interval: number) => void;

  // 批处理模式 Actions
  setBatchProcessingMode: (mode: 'stitching' | 'batch' | 'traditional') => void;
  setBatchApplyRules: (value: boolean) => void;
  setRoiCacheIds: (ids: Record<string, string>) => void;
  updateRoiCacheId: (label: string, roiId: string) => void;
  setBatchTriggered: (value: boolean) => void;
  resetBatchState: () => void;
  
  // 产品配方 Actions
  setCurrentProductId: (id: string | null) => void;
  setCurrentProductStageIndex: (index: number) => void;
  nextProductStage: () => void;
  prevProductStage: () => void;

  // 工作流 Actions
  setWorkflowState: (state: 'idle' | 'capturing' | 'searching_best_frame' | 'processing' | 'waiting_for_approval' | 'completed') => void;
  setIsWaitingForSpace: (value: boolean) => void;
  setWorkflowResult: (result: any) => void;
  setIsPaused: (value: boolean) => void;
  togglePause: () => void;

  // 检测历史 Actions
  setDetectionHistory: (history: DetectionHistoryItem[]) => void;
  addDetectionHistory: (item: DetectionHistoryItem) => void;
  setShowHistoryDetails: (value: boolean) => void;
  setExpandedHistoryId: (id: string | null) => void;

  // UI Actions
  setIsSettingsExpanded: (value: boolean) => void;
  setIsFullscreen: (value: boolean) => void;
  setShowShortcutModal: (value: boolean) => void;
  setIsBindingInfoCollapsed: (value: boolean) => void;
  setIsQrRulesCollapsed: (value: boolean) => void;
  setIsQrSupplementCollapsed: (value: boolean) => void;

  // 检测统计 Actions
  setDetectionStats: (stats: {
    totalDetections: number;
    qualifiedCount: number;
    unqualifiedCount: number;
    personDetections: number;
    equipmentDetections: number;
    lastDetectionTime: string | null;
  }) => void;
  updateDetectionStats: (qualified: boolean) => void;

  // 强制复位 Actions
  resetDetectionState: () => void;

  // 存储管理 Actions
  clearOldDetectionHistory: () => void;

  // 工序配方绑定 — 当 URL 没有带参数时，从这里读取默认配置
  stageBindingConfig: {
    processStageCode: string;
    processStageName: string;
    pageInstanceId: string;
    cameraId: string;
    fixtureEnabled: boolean;         // 工装追踪是否启用
    fixtureQrPrefixes: string;   // 逗号分隔字符串，与 URL 参数格式一致
    fixtureQrPattern: string;
  };
  setStageBindingConfig: (config: Partial<{
    processStageCode: string;
    processStageName: string;
    pageInstanceId: string;
    cameraId: string;
    fixtureEnabled: boolean;
    fixtureQrPrefixes: string;
    fixtureQrPattern: string;
  }>) => void;
}

export const useOCRDetectionStore = create<OCRDetectionState>()(
  persist(
    (set) => ({
      // 默认值 (与原始组件中的 useState 初始值保持一致)
      enableKeywordAnalysis: false,
      keywords: '',
      keywordMatchMode: 'contains',
      minConfidence: OCR_MIN_CONFIDENCE_DEFAULT,
      keywordConfigs: [],

      // 条码检测默认值
      enableBarcodeDetection: false,
      barcodeConfigs: [],
      isBarcodeSettingsExpanded: false,
      useWeChatQR: true,

      // 模板管理默认值
      templates: [],
      templateName: '',
      showSaveTemplate: false,
      barcodeTemplates: [],
      barcodeTemplateName: '',
      showBarcodeSaveTemplate: false,

      // 实时检测默认值
      autoCapture: true,
      captureDelaySeconds: 0, // 默认不延时
      detectionConfidence: DETECTION_CONFIDENCE_DEFAULT,
      selectedTargets: ['person'],
      targetConfidences: {},
      currentModelId: null, // 初始为空，由页面首次加载时从后端获取并保存
      ocrEngineModel: 'auto',
      fusionModeEnabled: false,
      selectedStandardId: undefined,

      // ROI截图和YOLO检测增强默认值
      imageSaveMode: 'roi',
      yoloDetectionMode: 'and',
      yoloTimeoutSeconds: -1, // 默认永不超时（-1表示∞）
      qrDetectIntervalSeconds: 3, // 并行QR检测间隔
      detectedElements: [],
      elementDetectionStartTime: null,
      nonGridTargets: [], // 不占格子的目标列表（智能填充到空白区域）
      roiWeightRatio: { area: 60, clarity: 40 }, // 默认面积和清晰度各占50%
      compressionEnabled: true, // 默认启用压缩
      compressionConfig: {
        maxWidth: 1920,
        maxHeight: 1920,
        quality: 0.9,
        maxSizeMB: 1
      },
      detectionInterval: 0.1, // 默认检测间隔（秒）

      // 批处理模式默认值
      batchProcessingMode: 'batch', // 默认使用拼接模式
      batchApplyRules: true, // 默认不应用规则
      roiCacheIds: {}, // ROI缓存ID初始为空
      batchTriggered: false, // 默认未触发

      // 产品配方默认值
      currentProductId: null,
      currentProductStageIndex: 0,

      // 工作流默认值
      workflowState: 'idle',
      isWaitingForSpace: false,
      workflowResult: null,
      isPaused: false,

      // 检测历史默认值
      detectionHistory: [],
      showHistoryDetails: false,
      expandedHistoryId: null,

      // UI 默认值
      isSettingsExpanded: false,
      isFullscreen: false,
      showShortcutModal: false,
      isBindingInfoCollapsed: false,
      isQrRulesCollapsed: false,
      isQrSupplementCollapsed: false,

      // 检测统计默认值
      detectionStats: {
        totalDetections: 0,
        qualifiedCount: 0,
        unqualifiedCount: 0,
        personDetections: 0,
        equipmentDetections: 0,
        lastDetectionTime: null,
      },

      // Actions 实现
      setEnableKeywordAnalysis: (value) => set({ enableKeywordAnalysis: value }),
      setKeywords: (value) => set({ keywords: value }),
      setKeywordMatchMode: (value) => set({ keywordMatchMode: value }),
      setMinConfidence: (value) => set({ minConfidence: value }),
      setKeywordConfigs: (configs) => set({ keywordConfigs: configs }),
      updateKeywordExpectedOrientation: (keywordId, deg) => set((state) => ({
        keywordConfigs: state.keywordConfigs.map(cfg => cfg.id === keywordId ? { ...cfg, expectedOrientation: deg === undefined ? undefined : deg } : cfg)
      })),

      // 条码检测 Actions 实现
      setEnableBarcodeDetection: (value) => set({ enableBarcodeDetection: value }),
      setBarcodeConfigs: (configs) => set({ barcodeConfigs: configs }),
      addBarcodeConfig: (config) => set((state) => ({
        barcodeConfigs: [...state.barcodeConfigs, config]
      })),
      updateBarcodeConfig: (id, config) => set((state) => ({
        barcodeConfigs: state.barcodeConfigs.map(cfg => cfg.id === id ? { ...cfg, ...config } : cfg)
      })),
      removeBarcodeConfig: (id) => set((state) => ({
        barcodeConfigs: state.barcodeConfigs.filter(cfg => cfg.id !== id)
      })),
      setIsBarcodeSettingsExpanded: (value) => set({ isBarcodeSettingsExpanded: value }),
      setUseWeChatQR: (value) => set({ useWeChatQR: value }),

      // 模板管理 Actions
      setTemplates: (templates) => set({ templates }),
      setTemplateName: (name) => set({ templateName: name }),
      setShowSaveTemplate: (show) => set({ showSaveTemplate: show }),
      setBarcodeTemplates: (templates) => set({ barcodeTemplates: templates }),
      setBarcodeTemplateName: (name) => set({ barcodeTemplateName: name }),
      setShowBarcodeSaveTemplate: (show) => set({ showBarcodeSaveTemplate: show }),

      // 实时检测 Actions
      setAutoCapture: (value) => set({ autoCapture: value }),
      setCaptureDelaySeconds: (seconds) => set({ captureDelaySeconds: seconds }),
      setDetectionConfidence: (value) => set({ detectionConfidence: value }),
      setSelectedTargets: (targets) => set({
        selectedTargets: Array.isArray(targets)
          ? targets.filter((target: any) => target != null && typeof target === 'string')
          : []
      }),
      setTargetConfidences: (confidences) => set({ targetConfidences: confidences ?? {} }),
      setCurrentModelId: (modelId) => set({ currentModelId: modelId }),
      setOcrEngineModel: (model) => set({ ocrEngineModel: model }),
      setFusionModeEnabled: (value) => set({ fusionModeEnabled: value }),
      setSelectedStandardId: (id) => set({ selectedStandardId: id }),

      // ROI截图和YOLO检测增强 Actions
      setImageSaveMode: (mode) => set({ imageSaveMode: mode }),
      setYoloDetectionMode: (mode) => set({ yoloDetectionMode: mode }),
      setYoloTimeoutSeconds: (seconds) => set({ yoloTimeoutSeconds: seconds }),
      setQrDetectIntervalSeconds: (seconds) => set({ qrDetectIntervalSeconds: seconds }),
      setDetectedElements: (elements) => set({ detectedElements: elements }),
      setElementDetectionStartTime: (time) => set({ elementDetectionStartTime: time }),
      setNonGridTargets: (targets) => set({ nonGridTargets: targets }),
      toggleNonGridTarget: (target) => set((state) => ({
        nonGridTargets: state.nonGridTargets.includes(target)
          ? state.nonGridTargets.filter(t => t !== target)
          : [...state.nonGridTargets, target]
      })),
      setRoiWeightRatio: (ratio) => set({ roiWeightRatio: ratio }),
      setCompressionEnabled: (enabled) => set({ compressionEnabled: enabled }),
      setCompressionConfig: (config) => set({ compressionConfig: config }),
      setDetectionInterval: (interval) => set({ detectionInterval: interval }),

      // 批处理模式 Actions
      setBatchProcessingMode: (mode) => set({ batchProcessingMode: mode }),
      setBatchApplyRules: (value) => set({ batchApplyRules: value }),
      setRoiCacheIds: (ids) => set({ roiCacheIds: ids }),
      updateRoiCacheId: (label, roiId) => set((state) => ({
        roiCacheIds: { ...state.roiCacheIds, [label]: roiId }
      })),
      setBatchTriggered: (value) => set({ batchTriggered: value }),
      resetBatchState: () => set({
        roiCacheIds: {},
        batchTriggered: false
      }),

      // 产品配方 Actions 实现
      setCurrentProductId: (id) => set({ currentProductId: id, currentProductStageIndex: 0 }),
      setCurrentProductStageIndex: (index) => set({ currentProductStageIndex: index }),
      nextProductStage: () => set((state) => ({ currentProductStageIndex: state.currentProductStageIndex + 1 })),
      prevProductStage: () => set((state) => ({ currentProductStageIndex: Math.max(0, state.currentProductStageIndex - 1) })),

      // 工作流 Actions
      setWorkflowState: (state) => set({ workflowState: state }),
      setIsWaitingForSpace: (value) => set({ isWaitingForSpace: value }),
      setWorkflowResult: (result) => set({ workflowResult: result }),
      setIsPaused: (value) => set({ isPaused: value }),
      togglePause: () => set((state) => ({ isPaused: !state.isPaused })),

      // 检测历史 Actions
      setDetectionHistory: (history) => set({ detectionHistory: history }),
      addDetectionHistory: (item) => set((state) => ({
        detectionHistory: [item, ...state.detectionHistory]
      })),
      setShowHistoryDetails: (value) => set({ showHistoryDetails: value }),
      setExpandedHistoryId: (id) => set({ expandedHistoryId: id }),

      // UI Actions
      setIsSettingsExpanded: (value) => set({ isSettingsExpanded: value }),
      setIsFullscreen: (value) => set({ isFullscreen: value }),
      setShowShortcutModal: (value) => set({ showShortcutModal: value }),
      setIsBindingInfoCollapsed: (value) => set({ isBindingInfoCollapsed: value }),
      setIsQrRulesCollapsed: (value) => set({ isQrRulesCollapsed: value }),
      setIsQrSupplementCollapsed: (value) => set({ isQrSupplementCollapsed: value }),

      // 检测统计 Actions
      setDetectionStats: (stats) => set({ detectionStats: stats }),
      updateDetectionStats: (qualified) => set((state) => {
        const stats = state.detectionStats;
        return {
          detectionStats: {
            totalDetections: stats.totalDetections + 1,
            qualifiedCount: qualified ? stats.qualifiedCount + 1 : stats.qualifiedCount,
            unqualifiedCount: qualified ? stats.unqualifiedCount : stats.unqualifiedCount + 1,
            personDetections: stats.personDetections,
            equipmentDetections: stats.equipmentDetections,
            lastDetectionTime: new Date().toISOString(),
          }
        };
      }),

      // 强制复位方法
      resetDetectionState: () => set({
        // 重置工作流状态
        workflowState: 'idle',
        isWaitingForSpace: false,
        workflowResult: null,

        // 重置YOLO检测状态
        detectedElements: [],
        elementDetectionStartTime: null,

        // 重置检测历史显示状态
        showHistoryDetails: false,
        expandedHistoryId: null,

        // 重置UI状态
        isSettingsExpanded: false,
        showShortcutModal: false,
        isBindingInfoCollapsed: false,
        isQrRulesCollapsed: false,
        isQrSupplementCollapsed: false,
      }),

      // 工序配方绑定默认值
      stageBindingConfig: {
        processStageCode: '',
        processStageName: '',
        pageInstanceId: '',
        cameraId: '',
        fixtureEnabled: true,
        fixtureQrPrefixes: '',
        fixtureQrPattern: '',
      },
      setStageBindingConfig: (config) => set((state) => ({
        stageBindingConfig: { ...state.stageBindingConfig, ...config },
      })),

      // 清理旧检测历史方法
      clearOldDetectionHistory: () => set((state) => {
        const maxHistoryItems = 100; // 由于不再存储图片数据，可以保留更多记录
        if (state.detectionHistory.length > maxHistoryItems) {
          console.log(`清理检测历史：从${state.detectionHistory.length}条减少到${maxHistoryItems}条`);
          return {
            detectionHistory: state.detectionHistory.slice(0, maxHistoryItems)
          };
        }
        return {};
      }),
    }),
    {
      name: OCR_DETECTION_STORAGE_NAME, // 页面级持久化键，避免不同页面共享同一份OCR配置
      // 🔧 排除实时检测状态的持久化，避免闪烁和竞态条件
      partialize: (state) => {
        const {
          fusionModeEnabled: _fusionModeEnabled, // 排除：LLM 融合必须在每次页面会话中手动开启
          detectedElements,        // 排除：实时检测状态，不应持久化
          elementDetectionStartTime, // 排除：实时检测时间，不应持久化
          workflowState,            // 排除：工作流状态，每次都应重新开始
          isWaitingForSpace,        // 排除：等待确认状态，不应持久化
          workflowResult,           // 排除：工作流结果，不应持久化
          isPaused,                 // 排除：暂停状态，每次都应重新开始
          detectionHistory,         // 排除：检测历史数据量大，不持久化
          ...rest
        } = state;
        return {
          ...rest,
        };
      },
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try {
            return localStorage.getItem(name);
          } catch (error) {
            console.warn('localStorage读取失败，使用内存存储:', error);
            return null;
          }
        },
        setItem: (name: string, value: string) => {
          try {
            localStorage.setItem(name, value);
          } catch (error) {
            if (error instanceof Error && error.name === 'QuotaExceededError') {
              console.warn('localStorage存储空间不足，清理旧数据...');
              // 清理检测历史数据
              try {
                const currentData = localStorage.getItem(name);
                if (currentData) {
                  const parsed = JSON.parse(currentData);
                  if (parsed.state?.detectionHistory) {
                    // 只保留最近100条检测历史（由于不再存储图片数据，可以保留更多）
                    parsed.state.detectionHistory = parsed.state.detectionHistory.slice(0, 100);
                    localStorage.setItem(name, JSON.stringify(parsed));
                    console.log('已清理检测历史数据，保留最近100条');
                    return;
                  }
                }
              } catch (cleanupError) {
                console.error('清理数据失败:', cleanupError);
              }
            }
            console.warn('localStorage写入失败，数据将不会持久化:', error);
          }
        },
        removeItem: (name: string) => {
          try {
            localStorage.removeItem(name);
          } catch (error) {
            console.warn('localStorage删除失败:', error);
          }
        },
      })), // 使用自定义存储处理
      merge: (persistedState: any, currentState: OCRDetectionState) => {
        return {
          ...currentState,
          ...persistedState,
          // 注意：detectedElements, elementDetectionStartTime, workflowState 等字段
          // 已通过 partialize 排除在持久化之外，不会从 localStorage 恢复
          // 确保 selectedTargets 始终是数组，并过滤掉 null/undefined 值
          selectedTargets: Array.isArray(persistedState?.selectedTargets)
            ? persistedState.selectedTargets.filter((target: any) => target != null && typeof target === 'string')
            : currentState.selectedTargets,
          // 确保 nonGridTargets 始终是数组
          nonGridTargets: Array.isArray(persistedState?.nonGridTargets)
            ? persistedState.nonGridTargets
            : [],
          // 确保 roiWeightRatio 存在且有效
          roiWeightRatio: persistedState?.roiWeightRatio &&
            typeof persistedState.roiWeightRatio.area === 'number' &&
            typeof persistedState.roiWeightRatio.clarity === 'number'
            ? persistedState.roiWeightRatio
            : currentState.roiWeightRatio,
          // Jetson 无法让 YOLO、OCR、LLM 同时常驻；页面启动时始终关闭 LLM 融合。
          // 用户仍可在当前会话中手动开启，配方也可显式开启，但不会跨页面恢复。
          fusionModeEnabled: false,
          selectedStandardId: persistedState?.selectedStandardId !== undefined
            ? persistedState.selectedStandardId
            : currentState.selectedStandardId,
          // 确保 compressionConfig 有效
          compressionConfig: persistedState?.compressionConfig &&
            typeof persistedState.compressionConfig.maxWidth === 'number' &&
            typeof persistedState.compressionConfig.maxHeight === 'number' &&
            typeof persistedState.compressionConfig.quality === 'number' &&
            typeof persistedState.compressionConfig.maxSizeMB === 'number'
            ? persistedState.compressionConfig
            : currentState.compressionConfig,
          // 确保 detectionInterval 有效
          detectionInterval: typeof persistedState?.detectionInterval === 'number'
            ? persistedState.detectionInterval
            : currentState.detectionInterval,
        };
      },
      onRehydrateStorage: () => (state) => {
        // 在恢复数据时，将 timestamp 字符串转换回 Date 对象
        if (state?.detectionHistory) {
          state.detectionHistory = state.detectionHistory.map(item => ({
            ...item,
            timestamp: new Date(item.timestamp)
          }));
        }
        // 注意：detectedElements 已通过 partialize 排除，不会被恢复，会使用默认值 []
        // 确保 selectedTargets 始终是数组
        if (state && !Array.isArray(state.selectedTargets)) {
          state.selectedTargets = [];
        }
        // 确保 nonGridTargets 始终是数组
        if (state && !Array.isArray(state.nonGridTargets)) {
          state.nonGridTargets = [];
        }
        // 确保 roiWeightRatio 有效
        if (state && (!state.roiWeightRatio ||
          typeof state.roiWeightRatio.area !== 'number' ||
          typeof state.roiWeightRatio.clarity !== 'number')) {
          state.roiWeightRatio = { area: 60, clarity: 40 };
        }
        // 安全默认值：每次重新进入页面都必须手动开启 LLM 融合。
        if (state) {
          state.fusionModeEnabled = false;
        }
        // 确保 compressionConfig 有效
        if (state && (!state.compressionConfig ||
          typeof state.compressionConfig.maxWidth !== 'number' ||
          typeof state.compressionConfig.maxHeight !== 'number' ||
          typeof state.compressionConfig.quality !== 'number' ||
          typeof state.compressionConfig.maxSizeMB !== 'number')) {
          state.compressionConfig = {
            maxWidth: 1920,
            maxHeight: 1920,
            quality: 0.9,
            maxSizeMB: 1
          };
        }
        // 确保 detectionInterval 是数字
        if (state && typeof state.detectionInterval !== 'number') {
          state.detectionInterval = 0.1;
        }
        // selectedStandardId 可以是 undefined 或 string，不需要特殊处理
      },
    }
  )
);
