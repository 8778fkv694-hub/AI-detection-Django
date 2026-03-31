import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { FileText, Download, Eye, RefreshCw, CheckCircle, XCircle, AlertCircle, Video, VideoOff, Play, Square, Upload, Cpu, ChevronDown, ChevronUp, CameraOff, Maximize, Minimize, Camera, Settings, RotateCcw } from 'lucide-react';
import { yoloDetectBackend, getModelConfig, type ModelConfig } from '@/lib/api';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { useAppStore } from '@/state/appStore';
import { useOCRDetectionStore } from '@/state/ocrDetectionStore';
import { calculateROISharpness, calculateSharpnessAsync } from '@/lib/imageQuality/sharpnessCalculator';
import { compressImage as compressImageHelper } from '@/lib/imageUtils/imageHelpers';
import { performBarcodeDetection as detectBarcodesAnalyzer, type BarcodeDetectionResult } from '@/lib/barcode/barcodeAnalyzer';
import { stitchROISnapshots as stitchROIs, stitchMultipleROIs as stitchMultiROIs } from '@/lib/roi/roiStitcher';
import type { CameraDevice } from '@/lib/cameraUtils';
import type { InspectionResult } from '@/types';
import type { BarcodeResult, TestResult, ExtendedHistoryItem, KeywordConfig, OCRTemplate } from '@/types/ocr';
import { PREPROCESSING_PRESETS, sliderStyles, OCR_DETECTION_CONFIG } from './ocrDetection/config';
import { QRCodeDetectionResult } from '@/components/ocr/QRCodeDetectionResult';
import { TemplateList } from '@/components/ocr/TemplateList';
import { TemplateSaveInput } from '@/components/ocr/TemplateSaveInput';
import { useImagePreprocessing } from '@/hooks/ocr/useImagePreprocessing';
import { useOCRProcessing } from '@/hooks/ocr/useOCRProcessing';
import { useOCRCamera } from '@/hooks/ocr/useOCRCamera';
import { drawDetections } from '@/lib/ocr/detectionDrawer';

const OCRErrorPreventionScreen: React.FC = () => {
  const navigate = useNavigate();
  // 检测目标分组展开状态
  const [expandedTargetGroups, setExpandedTargetGroups] = useState<Set<string>>(new Set(['names', 'labels', 'logos', 'others']));
  // 当前检测状态展开状态
  const [isDetectionStatusExpanded, setIsDetectionStatusExpanded] = useState<boolean>(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResult, setOcrResult] = useState<TestResult | null>(null);
  const [testHistory, setTestHistory] = useState<TestResult[]>([]);
  const [detectionInterval, setDetectionInterval] = useState<number>(OCR_DETECTION_CONFIG.defaultDetectionInterval); // 检测间隔（秒）
  const [requireQualifiedConfirmation, setRequireQualifiedConfirmation] = useState<boolean>(OCR_DETECTION_CONFIG.defaultRequireQualifiedConfirmation); // 是否需要合格结果确认（默认手动确认）

  // 固定配置常量（使用共享配置）
  const maxRetries = OCR_DETECTION_CONFIG.maxRetries; // 二维码检测最大重试次数
  const useWeChatQR = OCR_DETECTION_CONFIG.useWeChatQR; // 固定使用微信二维码检测器
  
  // 智能图像预处理 Hook
  const {
    enableSmartPreprocessing,
    imageQualityMetrics,
    preprocessingRecommendation,
    processedImagePreview,
    showImageComparison,
    isAnalyzingImage,
    isPreprocessing,
    selectedPreprocessingPreset,
    setEnableSmartPreprocessing,
    setShowImageComparison,
    setSelectedPreprocessingPreset,
    performSmartImageAnalysis,
    resetPreprocessingState,
  } = useImagePreprocessing();
  
  // 图片压缩配置状态（从store获取）
  const [compressionConfig, setCompressionConfig] = useState<{
    maxWidth: number;
    maxHeight: number;
    quality: number;
    maxSizeMB: number;
  }>(OCR_DETECTION_CONFIG.defaultCompressionConfig);
  const [showCompressionSettings, setShowCompressionSettings] = useState<boolean>(false);
  // 关键词配置折叠
  const [showKeywordSettings, setShowKeywordSettings] = useState<boolean>(false);
  
  // 使用默认OCR模型，不再需要手动选择（优先 RapidOCR）
  const selectedModel = OCR_DETECTION_CONFIG.defaultModel;
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 使用 zustand store 管理持久化状态
  const {
    // 关键词分析设置
    enableKeywordAnalysis,
    keywords,
    keywordMatchMode,
    minConfidence,
    keywordConfigs,
    setEnableKeywordAnalysis,
    setKeywords,
    setKeywordMatchMode,
    setMinConfidence,
    setKeywordConfigs,
    updateKeywordExpectedOrientation,

    // 条码检测相关
    enableBarcodeDetection,
    barcodeConfigs,
    isBarcodeSettingsExpanded,
    setEnableBarcodeDetection,
    addBarcodeConfig,
    updateBarcodeConfig,
    removeBarcodeConfig,
    setIsBarcodeSettingsExpanded,
    
    // OCR模板相关
    templates,
    templateName,
    showSaveTemplate,
    setTemplates,
    setTemplateName,
    setShowSaveTemplate,
    
    // 实时检测及工作流设置
    autoCapture,
    captureDelaySeconds,
    detectionConfidence,
    selectedTargets,
    setAutoCapture,
    setCaptureDelaySeconds,
    setDetectionConfidence,
    setSelectedTargets,
    
    // ROI截图和YOLO检测增强设置
    imageSaveMode,
    yoloDetectionMode,
    yoloTimeoutSeconds,
    detectedElements,
    elementDetectionStartTime,
    nonGridTargets,
    roiWeightRatio,
    compressionEnabled,
    setImageSaveMode,
    setYoloDetectionMode,
    setRoiWeightRatio,
    setCompressionEnabled,
    setYoloTimeoutSeconds,
    setDetectedElements,
    setElementDetectionStartTime,
    toggleNonGridTarget,

    // 工作流状态
    workflowState,
    isWaitingForSpace,
    setWorkflowState,
    setIsWaitingForSpace,
    setWorkflowResult,
    
    // 检测历史
    detectionHistory,
    showHistoryDetails,
    expandedHistoryId,
    setDetectionHistory,
    addDetectionHistory,
    setShowHistoryDetails,
    setExpandedHistoryId,
    
    // UI 界面状态
    isSettingsExpanded,
    isFullscreen,
    setIsSettingsExpanded,
    setIsFullscreen,
    
    // 检测统计
    detectionStats,
    setDetectionStats,
    
    // 强制复位
    resetDetectionState,
    
    // 存储管理
    clearOldDetectionHistory,
  } = useOCRDetectionStore();
  

  // 使用共享的findEmptySpaceForROI函数（已提取到lib/roi/roiStitcher）

  // 拼接已提取的ROI截图（使用共享模块）
  const stitchROISnapshots = useCallback((roiSnapshots: Array<{ imageDataUrl: string; label: string }>): Promise<string | null> => {
    return stitchROIs(roiSnapshots, nonGridTargets);
  }, [nonGridTargets]);

  // 多区域拼接功能（使用共享模块）
  const stitchMultipleROIs = useCallback((base64Image: string, detections: any[]): Promise<string> => {
    return stitchMultiROIs(base64Image, detections);
  }, []);

  // 图片压缩函数（使用共享模块）
  const compressImage = useCallback((base64Image: string): Promise<string> => {
    // 如果压缩被禁用，直接返回原图（但给出警告）
    if (!compressionEnabled) {
      console.warn('⚠️ 压缩已禁用，返回原图。注意：大尺寸图片可能导致系统崩溃！');
      toast.error('⚠️ 压缩已禁用！大尺寸图片可能导致后端内存溢出和系统崩溃，建议启用压缩。', {
        duration: 5000,
        icon: '⚠️',
      });
      return Promise.resolve(base64Image);
    }

    return compressImageHelper(base64Image, compressionConfig);
  }, [compressionEnabled, compressionConfig]);

  // OCR模板相关
  
  // 匹配状态显示
  const [matchStatus, setMatchStatus] = useState<'none' | 'qualified' | 'unqualified'>('none');
  
  // 窗口标识符 - 用于区分不同窗口
  const [windowId] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('windowId') || `ocr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });

  // 实时检测相关状态（非持久化状态）
  const [isCameraOn, setIsCameraOn] = useState<boolean>(false);
  const [isRealtimeActive, setIsRealtimeActive] = useState<boolean>(false);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [availableDevices, setAvailableDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [videoInfo, setVideoInfo] = useState<{width: number, height: number, readyState: number}>({width: 0, height: 0, readyState: 0});
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // 摄像头管理 Hook
  const {
    toggleCamera,
    switchCamera,
  } = useOCRCamera({
    windowId,
    videoRef,
    isCameraOn,
    setIsCameraOn,
    setIsRealtimeActive,
    selectedDeviceId,
    setSelectedDeviceId,
    availableDevices,
    setAvailableDevices,
  });
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDetectingRef = useRef<boolean>(false);
  // 检测任务队列：确保检测任务按顺序执行，避免并发问题
  const detectionQueueRef = useRef<Array<() => Promise<void>>>([]);
  const isProcessingQueueRef = useRef<boolean>(false);
  // 使用ref保存最新的workflowState，避免闭包问题
  const workflowStateRef = useRef<string>(workflowState);
  // 使用ref保存performRealtimeDetection函数引用，避免useEffect循环
  const performRealtimeDetectionRef = useRef<() => Promise<void>>();
  // 保存历史检测结果，用于ROI拼接（AND模式下，需要所有目标的检测框）
  const historyDetectionsRef = useRef<Map<string, any>>(new Map());
  // 累积保存所有检测到的ROI（对齐齐套化页面，用于ROI模式下的齐套化检测）
  const bestROIsRef = useRef<Map<string, {
    imageDataUrl: string;
    imageBase64: string;
    detection: any;
    sharpness: number;
    fullImageDataUrl: string;
  }>>(new Map());
  // 使用ref保存最新的detectedElements，避免闭包问题
  const detectedElementsRef = useRef<string[]>(detectedElements);

  // 🔧 防抖机制：记录检测到目标的开始时间，只有持续检测到目标一段时间后才触发抓拍
  const debounceStartTimeRef = useRef<number | null>(null);
  const [debounceSeconds, setDebounceSeconds] = useState(0.3); // 防抖时间，默认0.3秒

  // 同步detectedElements到ref，确保函数内部能获取最新值
  useEffect(() => {
    detectedElementsRef.current = detectedElements;
  }, [detectedElements]);
  
  // 同步workflowState到ref，确保函数内部能获取最新值
  useEffect(() => {
    workflowStateRef.current = workflowState;
  }, [workflowState]);
  
  // YOLO模型相关状态
  const { currentModel, modelName, isLoading: modelLoading, refresh: refreshModel } = useCurrentModel();
  
  // 模型配置状态（从API获取）
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  
  // 加载模型配置
  const loadModelConfig = useCallback(async (modelId: string | null) => {
    if (!modelId) {
      setModelConfig(null);
      return;
    }
    
    try {
      const result = await getModelConfig(modelId);
      if (result.model) {
        setModelConfig(result.model);
        console.log('✅ OCR防呆页面已加载模型配置:', result.model);
      } else {
        console.warn('⚠️ OCR防呆页面未找到模型配置:', modelId);
        setModelConfig(null);
      }
    } catch (error) {
      console.error('❌ OCR防呆页面加载模型配置失败:', error);
      setModelConfig(null);
    }
  }, []);
  
  // 当模型切换时，重新加载配置
  useEffect(() => {
    if (currentModel) {
      loadModelConfig(currentModel);
    } else {
      setModelConfig(null);
    }
  }, [currentModel, loadModelConfig]);
  
  // 目标名称中文翻译（仅从后端获取，无硬编码）
  const getTargetChineseName = useCallback((target: string | null | undefined) => {
    // 处理 null 或 undefined 值
    if (!target || typeof target !== 'string') {
      return '';
    }
    
    // 仅使用后端返回的中文名称映射
    if (modelConfig?.class_names && modelConfig.class_names[target]) {
      return modelConfig.class_names[target];
    }
    
    // 如果后端没有提供，直接返回类别名称（不进行硬编码映射）
    console.warn(`⚠️ OCR防呆页面：类别 "${target}" 没有对应的中文名称映射，请检查后端配置`);
    return target;
  }, [modelConfig]);

  // 根据当前模型获取可用的检测目标（仅从后端获取，无硬编码）
  const getAvailableTargets = useCallback(() => {
    // 仅从API获取的模型配置
    if (modelConfig && modelConfig.classes && modelConfig.classes.length > 0) {
      // 过滤掉 null、undefined 和非字符串值
      return modelConfig.classes.filter(target => target != null && typeof target === 'string');
    }
    
    // 如果API配置未加载，返回空数组（不进行硬编码）
    return [];
  }, [modelConfig]);

  // 规范化标签名称（去除空格、统一大小写等，确保匹配准确）
  const normalizeLabel = useCallback((label: string | null | undefined) => {
    if (!label || typeof label !== 'string') return '';
    return label.trim();
  }, []);

  // 根据模型自动更新检测目标（只在模型真正变化时更新，避免覆盖从localStorage恢复的值）
  const prevModelRef = useRef<string | null>(null);
  useEffect(() => {
    if (currentModel) {
      const prevModel = prevModelRef.current;
      prevModelRef.current = currentModel;
      
      // 如果是首次加载（prevModel为null），只验证和过滤，不覆盖已恢复的值
      if (prevModel === null) {
        const availableTargets = getAvailableTargets();
        const validTargets = selectedTargets.filter(target => availableTargets.includes(target));
        if (validTargets.length > 0) {
          // 如果有有效目标，只过滤掉无效的，保留有效的
          if (validTargets.length !== selectedTargets.length) {
            setSelectedTargets(validTargets);
            console.log(`首次加载，过滤无效目标，保留有效检测目标: ${validTargets.join(', ')}`);
          }
        } else if (availableTargets.length > 0) {
          // 如果没有有效目标，才设置默认值
          if (currentModel === 'waterprifer_detection') {
            setSelectedTargets(availableTargets);
            console.log(`首次加载，自动选择所有检测目标: ${availableTargets.join(', ')}`);
          } else {
            setSelectedTargets([availableTargets[0]]);
            console.log(`首次加载，自动选择检测目标: ${availableTargets[0]}`);
          }
        }
        return;
      }
      
      // 模型真正变化时，才更新目标
      if (prevModel !== currentModel) {
        console.log(`模型从 ${prevModel} 切换到 ${currentModel}`);
        const availableTargets = getAvailableTargets();
        console.log('可用目标:', availableTargets);
        console.log('当前选择的目标:', selectedTargets);
        
        // 如果当前选择的目标不在新模型的可用目标中，则自动选择所有可用目标（对于净水机模型）
        const validTargets = selectedTargets.filter(target => availableTargets.includes(target));
        if (validTargets.length === 0) {
          // 如果当前没有有效目标，对于净水机模型选择所有可用目标，其他模型选择第一个
          if (currentModel === 'waterprifer_detection') {
            setSelectedTargets(availableTargets);
            console.log(`模型切换到 ${currentModel}，自动选择所有检测目标: ${availableTargets.join(', ')}`);
          } else {
            setSelectedTargets([availableTargets[0]]);
            console.log(`模型切换到 ${currentModel}，自动选择检测目标: ${availableTargets[0]}`);
          }
        } else if (currentModel === 'waterprifer_detection' && validTargets.length < availableTargets.length) {
          // 对于净水机模型，如果选择的目标数量少于可用目标数量，自动选择所有可用目标
          setSelectedTargets(availableTargets);
          console.log(`模型切换到 ${currentModel}，自动选择所有检测目标（之前只选择了 ${validTargets.length} 个）: ${availableTargets.join(', ')}`);
        } else {
          // 保留有效的目标
          setSelectedTargets(validTargets);
          console.log(`模型切换到 ${currentModel}，保留有效检测目标: ${validTargets.join(', ')}`);
        }
      }
    }
  }, [currentModel, selectedTargets]);


  // 模态框状态
  // 历史结果管理 - 从后端获取OCR检测结果（非持久化状态）
  
  // 综合结果状态
  const [finalResult, setFinalResult] = useState<'qualified' | 'unqualified' | 'none'>('none');
  
  // 获取结果保存函数（OCR防呆页面不使用检测标准，这是LLM功能）
  const { addResult: addAppResult } = useAppStore();

  // 从后端加载OCR检测结果作为历史记录
  useEffect(() => {
    const loadOCRHistory = async () => {
      try {
        const response = await fetch('/api/results/', { headers: { 'Accept': 'application/json' } });
        if (response.ok) {
          const contentType = response.headers.get('content-type') || '';
          if (!contentType.includes('application/json')) {
            const text = await response.text();
            throw new Error(`加载OCR历史记录失败: 非JSON响应: ${text.slice(0, 200)}...`);
          }
          const data = await response.json();
          // 转换字段名以匹配前端接口（与appStore.ts保持一致）
          const transformedData = data.map((item: any) => ({
            ...item,
            standardId: item.standard_id,
            overallQuality: item.overall_quality,
            reasonKeywords: item.reason_keywords,
            detectionType: item.detection_type,
          }));
          
          // 过滤出OCR检测结果
          const ocrResults = transformedData.filter((result: any) => 
            result.detectionType === 'ocr_inspection' || 
            result.detectionType === 'ocr_fusion_inspection'
          );
          
          // 转换为历史记录格式
          const historyRecords: ExtendedHistoryItem[] = ocrResults.slice(0, 10).map((result: any) => ({
            id: result.id,
            timestamp: new Date(result.timestamp),
            matchStatus: result.ocrResult?.matchStatus || 
                        (result.overallQuality === '合格' ? 'qualified' : 
                         result.overallQuality === '存疑' ? 'unqualified' : 'none'),
            overallQuality: result.overallQuality || '需复检',
            score: result.score || 60,
            barcodeAnalysis: result.ocrResult?.barcode_analysis,
            ocrResult: result.ocrResult || {
              success: true,
              full_text: result.reason || '',
              detailed_results: [],
              text_count: 0,
              matchStatus: result.overallQuality === '合格' ? 'qualified' : 
                          result.overallQuality === '存疑' ? 'unqualified' : 'none',
              model_used: 'backend',
              error: null
            },
            aiResult: null, // 防呆检测不加载LLM结果
            imageBase64: result.image
          }));
          
          setDetectionHistory(historyRecords);
          console.log('📚 已加载OCR历史记录:', historyRecords.length, '条');
        }
      } catch (error) {
        console.error('❌ 加载OCR历史记录失败:', error);
      }
    };

    loadOCRHistory();
  }, []);

  // 保存检测结果到本地历史记录（仅OCR防呆检测，不含LLM）
  const saveDetectionResult = useCallback(async (ocrResult: any, _aiResult: InspectionResult | null, matchStatus: string, imageBase64?: string) => {
    const newResult = {
      id: Date.now().toString(),
      timestamp: new Date(),
      ocrResult,
      aiResult: null, // 防呆检测不保存LLM结果
      matchStatus,
      imageBase64
    };
    
    // 历史记录现在通过后端保存和加载，不需要单独的本地保存

    // 保存到检测结果页面
    try {
      if (ocrResult && ocrResult.success) {
        // OCR防呆检测模式（仅OCR，不含LLM）
        // OCR防呆页面不使用检测标准（这是LLM功能），standardId始终为null
        const inspectionResult = {
          id: newResult.id,
          timestamp: new Date().toISOString(),
          image: imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : 'data:image/jpeg;base64,',
          standardId: null, // OCR防呆页面不使用检测标准（这是LLM功能）
          overallQuality: (matchStatus === 'qualified' ? '合格' : matchStatus === 'unqualified' ? '存疑' : '需复检') as '合格' | '存疑' | '需复检',
          score: matchStatus === 'qualified' ? 95 : matchStatus === 'unqualified' ? 30 : 60,
          reason: `OCR防呆检测: ${matchStatus === 'qualified' ? '合格' : '存疑'}`,
          reasonKeywords: 'OCR防呆检测',
          defects: [],
          detectionType: 'ocr_error_prevention' as const,
          // 保存OCR详细结果
          ocrResult: {
            success: ocrResult.success,
            full_text: ocrResult.full_text || '',
            detailed_results: ocrResult.detailed_results || [],
            text_count: ocrResult.text_count || 0,
            matchStatus: matchStatus as 'qualified' | 'unqualified' | 'none',
            model_used: ocrResult.model_used,
            error: ocrResult.error,
            // 保存二维码检测结果
            barcode_analysis: ocrResult?.barcode_analysis
          }
        };
        
        // 保存到后端
        await addAppResult(inspectionResult);
        console.log('✅ OCR防呆检测结果已保存到后端');
        
        // 同时更新本地历史记录（仅存储必要信息，不存储图片数据）
        const newHistoryRecord = {
          id: newResult.id,
          timestamp: new Date(),
          matchStatus: matchStatus,
          overallQuality: matchStatus === 'qualified' ? '合格' : matchStatus === 'unqualified' ? '存疑' : '需复检',
          score: matchStatus === 'qualified' ? 95 : matchStatus === 'unqualified' ? 30 : 60,
          // 保存二维码检测结果到历史记录中
          barcodeAnalysis: ocrResult?.barcode_analysis,
          // 不存储ocrResult、aiResult和imageBase64，这些数据已保存在数据库中
        };
        // 在添加新记录前先清理旧数据，防止存储空间不足
        clearOldDetectionHistory();
        addDetectionHistory(newHistoryRecord);
      }
    } catch (error) {
      console.error('❌ 保存检测结果失败:', error);
    }
  }, [addAppResult, addDetectionHistory, clearOldDetectionHistory]);


  // 二维码检测函数（使用共享模块）
  const performBarcodeDetection = useCallback(async (imageFile: File | null): Promise<{
    allDetectedData: BarcodeDetectionResult[];
    matchResults: BarcodeResult[];
    retrySummary?: {
      totalRetries: number;
      successfulDetections: number;
      failedDetections: number;
    };
  }> => {
    return detectBarcodesAnalyzer(imageFile, barcodeConfigs, enableBarcodeDetection, {
      maxRetries,
      enableMasking: true,
      maskColor: '#FFFFFF',
      maskPadding: 30,
      useWeChatQR
    });
  }, [enableBarcodeDetection, barcodeConfigs, maxRetries, useWeChatQR]);

  // OCR 处理 Hook（OCR防呆页面不使用融合模式）
  const {
    processCapturedImage,
  } = useOCRProcessing({
    selectedModel,
    compressionEnabled,
    enableKeywordAnalysis,
    keywordConfigs,
    keywordMatchMode,
    enableBarcodeDetection,
    fusionModeEnabled: false, // OCR防呆页面不使用融合模式
    compressImage,
    performBarcodeDetection,
    performFusionAIAnalysis: async () => null, // 不使用融合模式，返回空函数
    saveDetectionResult,
    setOcrResult,
    setWorkflowResult,
    setAiAnalysisResult: () => {}, // 不使用AI分析结果
    setMatchStatus,
    setFinalResult,
  });

  // 手动抓拍函数
  const handleManualCapture = useCallback(async () => {
    if (!videoRef.current || !isCameraOn || workflowState !== 'idle') {
      return;
    }

    console.log('手动触发抓拍');
    setWorkflowState('capturing');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        setWorkflowState('idle');
        return;
      }
      
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 1.0); // 最高质量，避免多次压缩损失
      const base64Data = dataUrl.split(',')[1];

      if (!base64Data) {
        setWorkflowState('idle');
        return;
      }
      
      // 创建抓拍图片的File对象用于二维码检测
      const capturedImageFile = new File([canvas.toBlob ? await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 1.0); // 最高质量，避免多次压缩损失
      }) : new Blob()], 'captured_image.jpg', { type: 'image/jpeg' });
      
      // 设置预览图片
      setSelectedImage(capturedImageFile);
      setImagePreview(dataUrl);
      
      // 进入处理状态
      setWorkflowState('processing');
      
      // 使用公共的图像处理函数
      const { finalMatchStatus } = await processCapturedImage(base64Data, capturedImageFile, 'manual');
      
      // 判断合格性并决定下一步
      if (finalMatchStatus === 'qualified') {
        if (requireQualifiedConfirmation) {
          console.log('检测结果：合格，等待回车键确认');
          setWorkflowState('waiting_for_approval');
          setIsWaitingForSpace(true);
        } else {
          console.log('检测结果：合格，自动进入下一个循环');
          setWorkflowState('completed');
          // 重置YOLO检测状态
          setDetectedElements([]);
          detectedElementsRef.current = []; // 同步更新ref
          setElementDetectionStartTime(null);
          historyDetectionsRef.current.clear(); // 清空历史检测结果
          setTimeout(() => {
            setWorkflowState('idle');
            setMatchStatus('none');
            setWorkflowResult(null);
            setFinalResult('none');
          }, 1000); // 减少延迟时间，提升响应速度
        }
      } else if (finalMatchStatus === 'unqualified') {
        console.log('检测结果：存疑，等待回车键确认');
        setWorkflowState('waiting_for_approval');
        setIsWaitingForSpace(true);
      } else {
        console.log('检测结果：无匹配，自动进入下一个循环');
        setWorkflowState('completed');
        // 重置YOLO检测状态
        setDetectedElements([]);
        detectedElementsRef.current = []; // 同步更新ref
        setElementDetectionStartTime(null);
        historyDetectionsRef.current.clear(); // 清空历史检测结果
        setTimeout(() => {
          setWorkflowState('idle');
          setMatchStatus('none');
          setWorkflowResult(null);
          setFinalResult('none');
        }, 1000); // 减少延迟时间，提升响应速度
      }
    } catch (error) {
      console.error('手动抓拍失败:', error);
      setWorkflowState('idle');
    }
  }, [
    isCameraOn, 
    workflowState, 
    processCapturedImage,
    setWorkflowState,
    setSelectedImage,
    setImagePreview,
    setDetectedElements,
    setElementDetectionStartTime,
    setIsWaitingForSpace
  ]);


  // 全屏切换功能
  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      // 进入全屏
      const videoContainer = document.getElementById('video-container');
      if (videoContainer) {
        videoContainer.requestFullscreen().then(() => {
          setIsFullscreen(true);
        }).catch(err => {
          console.error('进入全屏失败:', err);
        });
      }
    } else {
      // 退出全屏
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(err => {
        console.error('退出全屏失败:', err);
      });
    }
  }, [setIsFullscreen]);

  // 强制复位功能
  const handleForceReset = useCallback(() => {
    console.log('执行强制复位');
    
    // 重置store中的状态
    resetDetectionState();
    
    // 清空历史检测结果
    historyDetectionsRef.current.clear();
    
    // 清理旧检测历史，释放存储空间
    clearOldDetectionHistory();
    
    // 重置组件本地状态
    setIsProcessing(false);
    setOcrResult(null);
    setTestHistory([]);
    setMatchStatus('none');
    setFinalResult('none');
    setIsRealtimeActive(false);
    setIsDetecting(false);
    
    // 重置图片相关状态
    setSelectedImage(null);
    setImagePreview('');
    
    // 重置智能预处理相关状态
    resetPreprocessingState();
    setSelectedPreprocessingPreset('balanced'); // 重置为默认方案
    
    // 如果文件输入存在，清空它
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    console.log('强制复位完成');
  }, [
    resetDetectionState,
    clearOldDetectionHistory,
    setIsProcessing,
    setOcrResult,
    setTestHistory,
    setMatchStatus,
    setFinalResult,
    setIsRealtimeActive,
    setIsDetecting,
    setSelectedImage,
    setImagePreview
  ]);

  // 键盘事件监听器 - 处理所有快捷键
  useEffect(() => {
    const handleKeyPress = (event: KeyboardEvent) => {
      // 回车键：确认存疑结果，继续工作流
      if (event.code === 'Enter' && isWaitingForSpace) {
        event.preventDefault();
        console.log('回车键被按下，继续工作流');
        setIsWaitingForSpace(false);
        // 修复：清空检测到的元素状态，重置为初始状态
        setDetectedElements([]);
        detectedElementsRef.current = []; // 同步更新ref
        setElementDetectionStartTime(null);
        historyDetectionsRef.current.clear(); // 清空历史检测结果
        setFinalResult('none');
        setWorkflowState('completed');
        setTimeout(() => {
          setWorkflowState('idle');
          setMatchStatus('none');
          setWorkflowResult(null);
        }, 1000);
      }
      
      // 空格键：手动触发抓拍（等同于点击拍照按键）
      if (event.code === 'Space') {
        event.preventDefault(); // 总是阻止默认的页面滚动行为
        if (isCameraOn && workflowState === 'idle') {
          console.log('空格键被按下，手动触发抓拍');
          handleManualCapture();
        } else {
          console.log('空格键被按下，但摄像头未开启或工作流状态不是空闲');
        }
      }
      
      // F键：切换全屏模式
      if (event.code === 'KeyF' && isCameraOn) {
        event.preventDefault();
        console.log('F键被按下，切换全屏模式');
        toggleFullscreen();
      }
      
      // R键：强制复位所有状态
      if (event.code === 'KeyR') {
        event.preventDefault();
        console.log('R键被按下，执行强制复位');
        handleForceReset();
      }
      
      // C键：开启/关闭摄像头
      if (event.code === 'KeyC') {
        event.preventDefault();
        console.log('C键被按下，切换摄像头状态');
        toggleCamera();
      }
      
      // D键：开启/关闭实时检测
      if (event.code === 'KeyD' && isCameraOn) {
        event.preventDefault();
        console.log('D键被按下，切换实时检测状态');
        setIsRealtimeActive(!isRealtimeActive);
      }
      
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, [isWaitingForSpace, isCameraOn, autoCapture, workflowState, isRealtimeActive, handleManualCapture, toggleFullscreen, handleForceReset, toggleCamera, setDetectedElements, setElementDetectionStartTime, setFinalResult, setWorkflowState, setMatchStatus, setWorkflowResult]);
  // 检测统计（非持久化状态）

  // 检查OCR服务状态（简化版，只检查服务是否可用）
  useEffect(() => {
    const checkOCRStatus = async () => {
      try {
        const response = await fetch('/api/ocr/status/');
        if (response.ok) {
          const status = await response.json();
          if (status.available) {
            console.log('OCR服务可用，使用默认OCR模型（优先 RapidOCR）');
          }
        }
      } catch (error) {
        console.error('检查OCR服务状态失败:', error);
      }
    };

    checkOCRStatus();
  }, []);

  // 处理图片选择
  const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      let finalFile: File = file;
      const isHeic = file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif');

      if (isHeic) {
        console.log('🔄 检测到HEIC/HEIF图片，开始转换为JPEG...');
        // 动态导入，避免非必要体积
        const heic2any = (await import('heic2any')).default as any;
        const jpegBlob: Blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: compressionConfig.quality || 0.8 });
        finalFile = new File([jpegBlob], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
        console.log('✅ HEIC转JPEG完成：', finalFile.name, finalFile.type, Math.round(finalFile.size / 1024), 'KB');
      }

      setSelectedImage(finalFile);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
        // 重置预处理相关状态
        resetPreprocessingState();
      };
      reader.readAsDataURL(finalFile);
      setOcrResult(null);
      
      // 自动触发智能图像分析
      if (enableSmartPreprocessing) {
        performSmartImageAnalysis(finalFile);
      }
    } catch (err) {
      console.error('❌ 处理上传图片失败:', err);
    }
  };


  // 处理关键词配置更新
  const updateKeywordConfigs = (keywordText: string) => {
    const keywordList = keywordText.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const newConfigs: KeywordConfig[] = keywordList.map(keyword => {
      const existing = keywordConfigs.find(config => config.text === keyword);
      return {
        text: keyword,
        confidence: existing ? existing.confidence : minConfidence,
        expectedOrientation: existing?.expectedOrientation ?? undefined,  // 默认关闭方向检查
        type: existing?.type ?? 'positive',  // 默认类型为正面
        requiredCount: existing?.requiredCount ?? 1  // 默认需要出现1次
      };
    });
    setKeywordConfigs(newConfigs);
  };

  // 更新单个关键词的置信度
  const updateKeywordConfidence = (keywordText: string, confidence: number) => {
    const updatedConfigs = keywordConfigs.map(config => 
      config.text === keywordText 
        ? { ...config, confidence }
        : config
    );
    setKeywordConfigs(updatedConfigs);
  };

  // 更新单个关键词的类型
  const updateKeywordType = (keywordText: string, type: 'positive' | 'negative') => {
    const updatedConfigs = keywordConfigs.map(config => 
      config.text === keywordText 
        ? { ...config, type }
        : config
    );
    setKeywordConfigs(updatedConfigs);
  };

  // 更新单个关键词的需要次数
  const updateKeywordRequiredCount = (keywordText: string, requiredCount: number) => {
    const updatedConfigs = keywordConfigs.map(config => 
      config.text === keywordText 
        ? { ...config, requiredCount: Math.max(1, Math.floor(requiredCount)) } // 至少为1，且为整数
        : config
    );
    setKeywordConfigs(updatedConfigs);
  };

  // 模板管理函数
  const saveTemplate = () => {
    if (!templateName.trim()) {
      alert('请输入模板名称');
      return;
    }

    const newTemplate: OCRTemplate = {
      id: Date.now().toString(),
      name: templateName.trim(),
      keywords,
      keywordConfigs: [...keywordConfigs],
      keywordMatchMode,
      minConfidence,
      createdAt: new Date().toLocaleString()
    };

    const updatedTemplates = [...templates, newTemplate];
    setTemplates(updatedTemplates);
    localStorage.setItem('ocrTemplates', JSON.stringify(updatedTemplates));
    
    setTemplateName('');
    setShowSaveTemplate(false);
    alert('模板保存成功！');
  };

  const loadTemplate = (template: OCRTemplate) => {
    setKeywords(template.keywords);
    setKeywordConfigs([...template.keywordConfigs]);
    setKeywordMatchMode(template.keywordMatchMode);
    setMinConfidence(template.minConfidence);
    setEnableKeywordAnalysis(true);
    alert(`已加载模板: ${template.name}`);
  };

  const deleteTemplate = (templateId: string) => {
    if (confirm('确定要删除这个模板吗？')) {
      const updatedTemplates = templates.filter(t => t.id !== templateId);
      setTemplates(updatedTemplates);
      localStorage.setItem('ocrTemplates', JSON.stringify(updatedTemplates));
    }
  };

  // 从localStorage加载模板
  useEffect(() => {
    const savedTemplates = localStorage.getItem('ocrTemplates');
    if (savedTemplates) {
      try {
        setTemplates(JSON.parse(savedTemplates));
      } catch (error) {
        console.error('加载模板失败:', error);
      }
    }
  }, []);

  // 获取可用摄像头设备（包括物理和虚拟摄像头）

  // 实时检测函数 - 优化性能
  const performRealtimeDetection = useCallback(async () => {
    if (!isRealtimeActive || !videoRef.current || !detectionCanvasRef.current) {
      return;
    }

    // 使用ref获取最新的workflowState，避免闭包问题
    const currentWorkflowState = workflowStateRef.current;
    
    // 如果工作流状态不是空闲状态，则不执行检测，并清空队列
    if (currentWorkflowState !== 'idle') {
      console.log('⏸️ 工作流状态不是空闲，停止检测并清空队列:', currentWorkflowState);
      // 清空检测队列
      detectionQueueRef.current = [];
      isProcessingQueueRef.current = false;
      return;
    }

    // 使用队列机制：将检测任务加入队列，按顺序执行
    const executeDetection = async () => {
      // 再次检查是否正在检测（避免重复执行）
      if (isDetectingRef.current) {
        return;
      }
      
      isDetectingRef.current = true;
      setIsDetecting(true);

      // 直接执行检测
      try {
        // 再次检查工作流状态，使用ref获取最新值，防止状态发生变化
        const currentWorkflowState = workflowStateRef.current;
        if (currentWorkflowState !== 'idle') {
          console.log('⏸️ 检测到工作流状态已变化，停止检测并清空队列:', currentWorkflowState);
          // 清空检测队列
          detectionQueueRef.current = [];
          isProcessingQueueRef.current = false;
          isDetectingRef.current = false;
          setIsDetecting(false);
          return;
        }

        if (!videoRef.current) {
          isDetectingRef.current = false;
          setIsDetecting(false);
          return;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          isDetectingRef.current = false;
          setIsDetecting(false);
          return;
        }
        
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 1.0); // 最高质量，避免多次压缩损失
        const base64Data = dataUrl.split(',')[1];
        
        if (!base64Data) {
          isDetectingRef.current = false;
          setIsDetecting(false);
          return;
        }
        
        // 执行YOLO检测
        const detections = await yoloDetectBackend(base64Data, detectionConfidence);
        
        // 更新检测统计
        const personDetections = detections.filter(d => d.label === 'person').length;
        const equipmentDetections = detections.filter(d => d.label !== 'person').length;
        setDetectionStats({
          totalDetections: detections.length,
          qualifiedCount: detectionStats.qualifiedCount,
          unqualifiedCount: detectionStats.unqualifiedCount,
          personDetections,
          equipmentDetections,
          lastDetectionTime: detectionStats.lastDetectionTime
        });
        
        // 绘制检测结果到画布上 - 优化性能
        // 注意：只在idle状态下绘制，其他状态下画布应该被清空
        if (workflowState === 'idle' && detectionCanvasRef.current && videoRef.current) {
          const videoWidth = videoRef.current.videoWidth;
          const videoHeight = videoRef.current.videoHeight;
          
          // 只在画布尺寸变化时才重新设置
          if (videoWidth > 0 && videoHeight > 0) {
            if (detectionCanvasRef.current.width !== videoWidth || detectionCanvasRef.current.height !== videoHeight) {
              detectionCanvasRef.current.width = videoWidth;
              detectionCanvasRef.current.height = videoHeight;
              console.log('画布尺寸更新:', videoWidth, 'x', videoHeight);
            }
            if (detectionCanvasRef.current) {
              drawDetections(detections, detectionCanvasRef.current);
            }
          } else {
            console.log('视频尺寸无效，跳过绘制检测结果');
          }
        } else if (workflowState !== 'idle' && detectionCanvasRef.current) {
          // 如果工作流状态不是idle，确保画布被清空
          const ctx = detectionCanvasRef.current.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, detectionCanvasRef.current.width, detectionCanvasRef.current.height);
            console.log('🔄 检测完成，清空检测画布（工作流状态:', workflowState, '）');
          }
        }
        
        // 如果ROI模式，在实时检测中累积保存ROI到bestROIsRef（对齐齐套化页面）
        if (imageSaveMode === 'roi') {
          detections.forEach(detection => {
            // 只保存选中的目标
            if (selectedTargets.includes(detection.label) && detection.confidence >= detectionConfidence) {
              // 异步处理ROI提取和清晰度计算
              (async () => {
                try {
                  const img = new Image();
                  await new Promise<void>((resolve) => {
                    img.onload = () => {
                      try {
                        let x1, y1, x2, y2;
                        
                        // 处理bbox格式
                        if (detection.bbox.x1 !== undefined && detection.bbox.y1 !== undefined && 
                            detection.bbox.x2 !== undefined && detection.bbox.y2 !== undefined) {
                          if (detection.bbox.x1 > 1 || detection.bbox.y1 > 1 || detection.bbox.x2 > 1 || detection.bbox.y2 > 1) {
                            x1 = detection.bbox.x1;
                            y1 = detection.bbox.y1;
                            x2 = detection.bbox.x2;
                            y2 = detection.bbox.y2;
                          } else {
                            x1 = detection.bbox.x1 * img.width;
                            y1 = detection.bbox.y1 * img.height;
                            x2 = detection.bbox.x2 * img.width;
                            y2 = detection.bbox.y2 * img.height;
                          }
                        } else if ('x' in detection.bbox && 'y' in detection.bbox && 
                                   'width' in detection.bbox && 'height' in detection.bbox) {
                          const x = (detection.bbox as any).x;
                          const y = (detection.bbox as any).y;
                          const width = (detection.bbox as any).width;
                          const height = (detection.bbox as any).height;
                          if (x > 1 || y > 1 || width > 1 || height > 1) {
                            x1 = x;
                            y1 = y;
                            x2 = x + width;
                            y2 = y + height;
                          } else {
                            x1 = x * img.width;
                            y1 = y * img.height;
                            x2 = (x + width) * img.width;
                            y2 = (y + height) * img.height;
                          }
                        } else {
                          resolve();
                          return;
                        }
                        
                        x1 = Math.max(0, Math.min(x1, img.width));
                        y1 = Math.max(0, Math.min(y1, img.height));
                        x2 = Math.max(0, Math.min(x2, img.width));
                        y2 = Math.max(0, Math.min(y2, img.height));
                        
                        const roiWidth = x2 - x1;
                        const roiHeight = y2 - y1;
                        
                        if (roiWidth <= 0 || roiHeight <= 0) {
                          resolve();
                          return;
                        }
                        
                        // 创建ROI画布
                        const roiCanvas = document.createElement('canvas');
                        roiCanvas.width = roiWidth;
                        roiCanvas.height = roiHeight;
                        const roiCtx = roiCanvas.getContext('2d');
                        
                        if (!roiCtx) {
                          resolve();
                          return;
                        }
                        
                        // 绘制ROI区域
                        roiCtx.drawImage(img, x1, y1, roiWidth, roiHeight, 0, 0, roiWidth, roiHeight);
                        
                        // 计算ROI面积
                        const roiArea = roiWidth * roiHeight;
                        
                        // 异步计算清晰度（避免阻塞主线程，提高检测频率时的性能）
                        const roiImageData = roiCtx.getImageData(0, 0, roiWidth, roiHeight);
                        calculateSharpnessAsync(roiImageData).then(sharpness => {
                          // 检查是否需要更新综合评分最佳的ROI
                          const existing = bestROIsRef.current.get(detection.label);
                          let shouldUpdate = false;
                          
                          if (!existing) {
                            shouldUpdate = true;
                          } else {
                            // 计算综合分数：面积权重0.5，清晰度权重0.5
                            const maxArea = 1920 * 1080;
                            const normalizedArea = Math.min(1, roiArea / maxArea);
                            let existingArea = 0;
                            if (existing.detection.bbox.width && existing.detection.bbox.height) {
                              existingArea = existing.detection.bbox.width * existing.detection.bbox.height;
                            } else if (existing.detection.bbox.x1 !== undefined && existing.detection.bbox.x2 !== undefined) {
                              existingArea = (existing.detection.bbox.x2 - existing.detection.bbox.x1) * (existing.detection.bbox.y2 - existing.detection.bbox.y1);
                            }
                            const normalizedExistingArea = Math.min(1, existingArea / maxArea);

                            const normalizedSharpness = sharpness / 100;
                            const normalizedExistingSharpness = existing.sharpness / 100;

                            const areaWeight = roiWeightRatio.area / 100;
                            const clarityWeight = roiWeightRatio.clarity / 100;
                            const currentScore = normalizedArea * areaWeight + normalizedSharpness * clarityWeight;
                            const existingScore = normalizedExistingArea * areaWeight + normalizedExistingSharpness * clarityWeight;
                            
                            if (currentScore > existingScore) {
                              shouldUpdate = true;
                            }
                          }
                          
                          if (shouldUpdate) {
                            const roiDataUrl = roiCanvas.toDataURL('image/jpeg', 1.0); // 最高质量，避免多次压缩损失
                            bestROIsRef.current.set(detection.label, {
                              imageDataUrl: roiDataUrl,
                              imageBase64: roiDataUrl.split(',')[1],
                              detection: detection,
                              sharpness: sharpness,
                              fullImageDataUrl: dataUrl
                            });
                            console.log(`📸 更新ROI ${detection.label} 的最佳照片，面积: ${roiArea.toFixed(0)}px², 清晰度: ${sharpness.toFixed(2)}`);
                          }
                          
                          resolve();
                        }).catch(err => {
                          console.error('清晰度计算失败:', err);
                          resolve();
                        });
                      } catch (error) {
                        console.error('处理ROI失败:', error);
                        resolve();
                      }
                    };
                    img.onerror = () => resolve();
                    img.src = dataUrl;
                  });
                } catch (error) {
                  console.error('ROI处理失败:', error);
                }
              })();
            }
          });
        }
        
        // 过滤掉 selectedTargets 中的 null 值
        const validSelectedTargets = selectedTargets.filter(target => target != null && typeof target === 'string');
        const normalizedSelectedTargets = validSelectedTargets.map(normalizeLabel);
        
        // 检查是否检测到设置的目标，根据OR/AND模式进行判断
        // 使用规范化后的标签进行匹配，确保匹配准确
        const targetDetections = detections.filter(detection => {
          const normalizedLabel = normalizeLabel(detection.label);
          if (normalizedLabel === '') return false;
          const isInSelected = normalizedSelectedTargets.includes(normalizedLabel);
          const confidenceOk = detection.confidence >= detectionConfidence;
          
          // 详细调试：记录每个检测结果的匹配情况
          if (isInSelected) {
            console.log(`✅ 标签匹配: "${detection.label}" (规范化: "${normalizedLabel}") 置信度: ${detection.confidence.toFixed(3)} >= ${detectionConfidence}? ${confidenceOk}`);
          }
          
          return isInSelected && confidenceOk;
        });
        
        // 获取检测到的元素标签（用于触发抓拍）- 使用规范化后的标签
        const detectedLabels = targetDetections.map(d => normalizeLabel(d.label)).filter(label => label !== '');
        
        // 获取所有检测到的目标元素（用于显示，不基于置信度过滤）
        const allDetectedTargets = detections.filter(detection => {
          const normalizedLabel = normalizeLabel(detection.label);
          return normalizedLabel !== '' && normalizedSelectedTargets.includes(normalizedLabel);
        });
        const allDetectedLabels = allDetectedTargets.map(d => normalizeLabel(d.label)).filter(label => label !== '');
        
        // 详细调试日志
        console.log('🔍 ========== 检测调试信息 ==========');
        console.log('🔍 所有检测结果:', detections.map(d => ({ 
          label: d.label, 
          normalizedLabel: normalizeLabel(d.label),
          confidence: d.confidence,
          confidenceOk: d.confidence >= detectionConfidence
        })));
        console.log('🔍 选择的目标 (原始):', selectedTargets);
        console.log('🔍 选择的目标 (规范化):', normalizedSelectedTargets);
        console.log('🔍 置信度阈值:', detectionConfidence);
        console.log('🔍 过滤后的目标检测 (置信度达标):', targetDetections.map(d => ({ 
          label: d.label, 
          normalizedLabel: normalizeLabel(d.label),
          confidence: d.confidence 
        })));
        console.log('🔍 检测到的标签 (用于更新状态):', detectedLabels);
        console.log('🔍 所有检测到的目标标签 (不基于置信度):', allDetectedLabels);
        
        // 使用ref获取最新值，避免闭包问题
        const currentDetectedElements = detectedElementsRef.current;
        console.log('🔍 当前detectedElements (from ref):', currentDetectedElements);
        console.log('🔍 ====================================');
        
        // 根据检测模式进行判断
        let shouldTriggerCapture = false;
        let shouldResetDetection = false;
        
        // 核心逻辑：无论什么模式，只要检测到目标且置信度达标，就更新detectedElements状态
        // 这是UI显示的基础，必须健壮可靠
        if (detectedLabels.length > 0) {
          const currentDetectedElements = detectedElementsRef.current;
          // 规范化当前已检测的元素，确保比较准确
          const normalizedCurrent = currentDetectedElements.map(normalizeLabel).filter(label => label !== '');
          // 合并新检测到的标签（也规范化）
          const normalizedNew = detectedLabels.map(normalizeLabel).filter(label => label !== '');
          // 合并并去重
          const allNormalized = [...normalizedCurrent, ...normalizedNew];
          const uniqueNormalized = [...new Set(allNormalized)].filter(label => label !== '');
          
          // 如果状态有变化，才更新（避免不必要的重渲染）
          const hasChanged = uniqueNormalized.length !== normalizedCurrent.length || 
            !uniqueNormalized.every(label => normalizedCurrent.includes(label));
          
          if (hasChanged) {
            console.log(`🟢 更新detectedElements: [${normalizedCurrent.join(', ')}] -> [${uniqueNormalized.join(', ')}]`);
            setDetectedElements(uniqueNormalized);
            // 立即更新ref，确保下次读取时是最新值
            detectedElementsRef.current = uniqueNormalized;
          } else {
            console.log('🟡 detectedElements 无变化，跳过更新');
          }
        } else {
          console.log('🔴 当前帧没有检测到置信度达标的目标');
        }
        
        if (yoloDetectionMode === 'or') {
          // OR模式：检测到任一元素即抓拍
          shouldTriggerCapture = targetDetections.length > 0;
        } else if (yoloDetectionMode === 'and') {
          // AND模式：必须检测到所有元素才抓拍
          const currentTime = Date.now();
          
          // 注意：detectedElements状态更新已在上面统一处理（3098-3124行），这里不再重复更新
          // 保存当前帧检测到的目标的检测框到历史记录中（用于ROI拼接）
          if (targetDetections.length > 0) {
            targetDetections.forEach(detection => {
              const normalizedLabel = normalizeLabel(detection.label);
              if (!historyDetectionsRef.current.has(normalizedLabel)) {
                historyDetectionsRef.current.set(normalizedLabel, detection);
                console.log(`🔍 AND模式：保存目标 ${normalizedLabel} 的检测框到历史记录`);
              }
            });
          }
          
          if (targetDetections.length > 0) {
            // 如果还没有开始检测计时，检查是否已有已检测的目标
            // 如果有，说明之前已经开始检测了，应该继续累积而不是重新开始计时
            if (!elementDetectionStartTime) {
              const currentDetectedElements = detectedElementsRef.current;
              
              // 如果已有已检测的目标，说明之前已经开始检测了，应该继续累积
              // 使用最早的时间作为开始时间（如果无法获取，使用当前时间）
              if (currentDetectedElements.length > 0) {
                // 已有已检测的目标，继续累积，不重新开始计时
                // 使用当前时间作为开始时间（因为无法获取之前的时间）
                setElementDetectionStartTime(currentTime);
                console.log(`AND模式：继续检测（已有已检测目标），已检测到: ${currentDetectedElements.join(', ')}, 当前帧新增: ${detectedLabels.join(', ')}`);
              } else {
                // 第一次检测，开始计时
                setElementDetectionStartTime(currentTime);
                console.log(`AND模式：开始检测计时，已检测到: ${detectedLabels.join(', ')}`);
              }
              
              // 使用ref获取最新值（已经更新过了）
              const latestDetectedElements = detectedElementsRef.current;
              
              // 检查是否所有目标都已检测到（包括单目标和多目标的情况）
              const allTargetsDetected = validSelectedTargets.every(target => latestDetectedElements.includes(target));
              
              console.log('🔍 AND模式：检查是否所有目标都已检测到:');
              console.log('🔍 selectedTargets:', selectedTargets);
              console.log('🔍 latestDetectedElements:', latestDetectedElements);
              console.log('🔍 allTargetsDetected:', allTargetsDetected);
              
              if (allTargetsDetected) {
                shouldTriggerCapture = true;
                console.log(`AND模式：所有元素已检测到，立即触发抓拍: ${latestDetectedElements.join(', ')}`);
              }
            } else {
              // 检查是否所有目标都已检测到（基于置信度过滤的结果）
              // 使用ref获取最新值，避免闭包问题
              const currentDetectedElements = detectedElementsRef.current;
              const allDetectedElements = [...new Set([...currentDetectedElements, ...detectedLabels])];
              
              // 检查是否所有目标都已检测到（使用规范化后的标签）
              const normalizedSelected = validSelectedTargets.map(normalizeLabel).filter(label => label !== '');
              const normalizedAll = allDetectedElements.map(normalizeLabel).filter(label => label !== '');
              const allTargetsDetected = normalizedSelected.every(target => normalizedAll.includes(target));
              
              console.log('🔍 AND模式触发检查:');
              console.log('🔍 selectedTargets:', selectedTargets);
              console.log('🔍 allDetectedElements:', allDetectedElements);
              console.log('🔍 allTargetsDetected:', allTargetsDetected);
              
              if (allTargetsDetected) {
                shouldTriggerCapture = true;
                console.log(`AND模式：所有元素已检测到，开始抓拍: ${allDetectedElements.join(', ')}`);
              } else {
                // 检查是否超时（-1表示永不超时）
                const elapsedTime = (currentTime - elementDetectionStartTime) / 1000;
                if (yoloTimeoutSeconds > 0 && elapsedTime > yoloTimeoutSeconds) {
                  shouldResetDetection = true;
                  console.log(`AND模式：检测超时 (${elapsedTime.toFixed(1)}s > ${yoloTimeoutSeconds}s)，缺少元素: ${validSelectedTargets.filter(t => !allDetectedElements.includes(t)).join(', ')}`);
                } else {
                  if (yoloTimeoutSeconds === -1) {
                    console.log(`AND模式：继续检测（永不超时），已检测到: ${allDetectedElements.join(', ')}, 等待: ${validSelectedTargets.filter(t => !allDetectedElements.includes(t)).join(', ')}, 已用时: ${elapsedTime.toFixed(1)}s`);
                  } else {
                    console.log(`AND模式：继续检测，已检测到: ${allDetectedElements.join(', ')}, 等待: ${validSelectedTargets.filter(t => !allDetectedElements.includes(t)).join(', ')}, 剩余时间: ${(yoloTimeoutSeconds - elapsedTime).toFixed(1)}s`);
                  }
                }
              }
            }
          } else {
            // 没有检测到任何目标（基于置信度过滤），但不清空显示
            // 显示仍然基于实际检测结果更新
            console.log('AND模式：没有检测到高置信度目标，但保持显示更新');
            
            // 如果已经开始检测计时，检查是否所有目标都已检测到（即使当前帧没有检测到目标）
            if (elementDetectionStartTime) {
              const currentDetectedElements = detectedElementsRef.current;
              // 使用规范化后的标签进行匹配
              const normalizedSelected = validSelectedTargets.map(normalizeLabel).filter(label => label !== '');
              const normalizedCurrent = currentDetectedElements.map(normalizeLabel).filter(label => label !== '');
              const allTargetsDetected = normalizedSelected.every(target => normalizedCurrent.includes(target));
              
              console.log('🔍 AND模式：当前帧无目标，检查已累积的检测结果:');
              console.log('🔍 selectedTargets:', selectedTargets);
              console.log('🔍 currentDetectedElements:', currentDetectedElements);
              console.log('🔍 allTargetsDetected:', allTargetsDetected);
              
              if (allTargetsDetected) {
                shouldTriggerCapture = true;
                console.log(`AND模式：所有元素已检测到（当前帧无目标但已累积完成），开始抓拍: ${currentDetectedElements.join(', ')}`);
              } else {
                // 检查是否超时
                const elapsedTime = (currentTime - elementDetectionStartTime) / 1000;
                if (yoloTimeoutSeconds > 0 && elapsedTime > yoloTimeoutSeconds) {
                  shouldResetDetection = true;
                  console.log(`AND模式：检测超时 (${elapsedTime.toFixed(1)}s > ${yoloTimeoutSeconds}s)，缺少元素: ${validSelectedTargets.filter(t => !currentDetectedElements.includes(t)).join(', ')}`);
                } else {
                  if (yoloTimeoutSeconds === -1) {
                    console.log(`AND模式：继续检测（永不超时），已检测到: ${currentDetectedElements.join(', ')}, 等待: ${validSelectedTargets.filter(t => !currentDetectedElements.includes(t)).join(', ')}, 已用时: ${elapsedTime.toFixed(1)}s`);
                  } else {
                    console.log(`AND模式：继续检测，已检测到: ${currentDetectedElements.join(', ')}, 等待: ${validSelectedTargets.filter(t => !currentDetectedElements.includes(t)).join(', ')}, 剩余时间: ${(yoloTimeoutSeconds - elapsedTime).toFixed(1)}s`);
                  }
                }
              }
            }
          }
        }
        
        // 重置检测状态
        if (shouldResetDetection) {
          setDetectedElements([]); // 清空已检测元素
          detectedElementsRef.current = []; // 同步更新ref
          setElementDetectionStartTime(null);
          historyDetectionsRef.current.clear(); // 清空历史检测结果
          debounceStartTimeRef.current = null; // 重置防抖计时
          console.log('🔍 检测超时，重置计时器和已检测元素');
        }

        // 🔧 防抖机制：只有持续检测到目标一段时间后才触发抓拍
        let shouldActuallyTrigger = false;

        if (shouldTriggerCapture && workflowState === 'idle' && autoCapture) {
          const currentTime = Date.now();

          // 开始或继续防抖计时
          if (debounceStartTimeRef.current === null) {
            // 刚开始检测到目标，记录开始时间
            debounceStartTimeRef.current = currentTime;
            console.log(`🔍 检测到目标 ${detectedLabels.join(', ')}，开始防抖计时 ${debounceSeconds}秒...`);
          } else {
            // 已经在防抖中，检查是否已经稳定足够长时间
            const elapsedTime = (currentTime - debounceStartTimeRef.current) / 1000;

            if (elapsedTime >= debounceSeconds) {
              // 防抖完成，可以触发抓拍
              shouldActuallyTrigger = true;
              debounceStartTimeRef.current = null; // 重置防抖计时
              console.log(`✅ 目标稳定 ${elapsedTime.toFixed(2)}秒，防抖完成，开始抓拍 ${detectedLabels.join(', ')}`);
            } else {
              // 还在防抖期间
              console.log(`⏳ 目标稳定中... ${elapsedTime.toFixed(2)}s / ${debounceSeconds}s`);
            }
          }
        } else {
          // 未检测到目标或其他条件不满足，重置防抖计时
          if (debounceStartTimeRef.current !== null) {
            debounceStartTimeRef.current = null;
            console.log(`⏸️ 目标丢失或条件不满足，重置防抖计时`);
          }
        }

        if (shouldActuallyTrigger) {
          console.log(`🎯 防抖完成，开始工作流`);
          
          // 根据保存模式处理图片
          let processedImageBase64: string;
          let processedDataUrl: string;
          
          // 存储每个ROI类型的综合评分最佳照片（在外部作用域定义，以便后续使用）
          const bestROIs = new Map<string, {
            imageDataUrl: string;
            imageBase64: string;
            detection: any;
            sharpness: number;
            fullImageDataUrl: string;
          }>();
          
          // 如果设置了延时，在延时期间持续捕获并选择综合评分最佳的ROI/全画面
          if (captureDelaySeconds > 0) {
            console.log(`⏱️ 延时 ${captureDelaySeconds} 秒，期间持续捕获并选择综合评分最佳${imageSaveMode === 'roi' ? 'ROI' : '全画面'}...`);
            
            const captureInterval = 200; // 每200ms捕获一帧
            const totalFrames = Math.max(1, Math.floor((captureDelaySeconds * 1000) / captureInterval));
            let capturedFrames = 0;
            
            // 持续捕获并评估
            while (capturedFrames < totalFrames) {
              await new Promise(resolve => setTimeout(resolve, captureInterval));
              
              // 检查状态是否变化
              if (workflowState !== 'idle' || !videoRef.current) {
                console.log('⚠️ 延时期间工作流状态已变化，取消抓拍');
                return;
              }
              
              // 捕获当前帧
              const frameCanvas = document.createElement('canvas');
              frameCanvas.width = videoRef.current.videoWidth;
              frameCanvas.height = videoRef.current.videoHeight;
              const frameCtx = frameCanvas.getContext('2d');
              
              if (!frameCtx || !videoRef.current) {
                capturedFrames++;
                continue;
              }
              
              frameCtx.drawImage(videoRef.current, 0, 0, frameCanvas.width, frameCanvas.height);
              const frameDataUrl = frameCanvas.toDataURL('image/jpeg', 1.0); // 最高质量，避免多次压缩损失
              const frameBase64 = frameDataUrl.split(',')[1];
              
              if (!frameBase64) {
                capturedFrames++;
                continue;
              }
              
              // 对当前帧进行评估（ROI模式评估ROI清晰度，全画面模式评估全画面清晰度）
              if (imageSaveMode === 'roi') {
                // ROI模式：对每个ROI计算清晰度
                try {
                  const frameDetections = await yoloDetectBackend(frameBase64, detectionConfidence);
                  const frameTargetDetections = frameDetections.filter(detection => 
                    selectedTargets.includes(detection.label) && detection.confidence >= detectionConfidence
                  );
                  
                  // 实时绘制检测框到画布上，让用户看到ROI识别的动态变化
                  // 注意：只在idle状态下绘制，其他状态下画布应该被清空
                  if (workflowState === 'idle' && detectionCanvasRef.current && videoRef.current && frameTargetDetections.length > 0) {
                    const videoWidth = videoRef.current.videoWidth;
                    const videoHeight = videoRef.current.videoHeight;
                    if (videoWidth > 0 && videoHeight > 0) {
                      if (detectionCanvasRef.current.width !== videoWidth || detectionCanvasRef.current.height !== videoHeight) {
                        detectionCanvasRef.current.width = videoWidth;
                        detectionCanvasRef.current.height = videoHeight;
                      }
                      if (detectionCanvasRef.current) {
                        drawDetections(frameDetections, detectionCanvasRef.current);
                      }
                    }
                  } else if (workflowState !== 'idle' && detectionCanvasRef.current) {
                    // 如果工作流状态不是idle，确保画布被清空
                    const ctx = detectionCanvasRef.current.getContext('2d');
                    if (ctx) {
                      ctx.clearRect(0, 0, detectionCanvasRef.current.width, detectionCanvasRef.current.height);
                    }
                  }
                  
                  // 对每个检测到的ROI计算清晰度
                  for (const detection of frameTargetDetections) {
                    const img = new Image();
                    await new Promise<void>((resolve) => {
                      img.onload = () => {
                        try {
                          // 提取ROI区域
                          let x1, y1, x2, y2;
                          if (detection.bbox.x1 !== undefined) {
                            x1 = detection.bbox.x1 > 1 ? detection.bbox.x1 : detection.bbox.x1 * img.width;
                            y1 = detection.bbox.y1 > 1 ? detection.bbox.y1 : detection.bbox.y1 * img.height;
                            x2 = detection.bbox.x2 > 1 ? detection.bbox.x2 : detection.bbox.x2 * img.width;
                            y2 = detection.bbox.y2 > 1 ? detection.bbox.y2 : detection.bbox.y2 * img.height;
                          } else if ('x' in detection.bbox && 'y' in detection.bbox && 
                                   'width' in detection.bbox && 'height' in detection.bbox) {
                            const x = (detection.bbox as any).x;
                            const y = (detection.bbox as any).y;
                            const width = (detection.bbox as any).width;
                            const height = (detection.bbox as any).height;
                            x1 = x > 1 ? x : x * img.width;
                            y1 = y > 1 ? y : y * img.height;
                            x2 = (x + width) > 1 ? (x + width) : (x + width) * img.width;
                            y2 = (y + height) > 1 ? (y + height) : (y + height) * img.height;
                          } else {
                            resolve();
                            return;
                          }
                          
                          // 确保坐标在范围内
                          x1 = Math.max(0, Math.min(x1, img.width));
                          y1 = Math.max(0, Math.min(y1, img.height));
                          x2 = Math.max(0, Math.min(x2, img.width));
                          y2 = Math.max(0, Math.min(y2, img.height));
                          
                          const roiWidth = x2 - x1;
                          const roiHeight = y2 - y1;
                          
                          if (roiWidth <= 0 || roiHeight <= 0) {
                            resolve();
                            return;
                          }
                          
                          // 创建ROI画布
                          const roiCanvas = document.createElement('canvas');
                          roiCanvas.width = roiWidth;
                          roiCanvas.height = roiHeight;
                          const roiCtx = roiCanvas.getContext('2d');
                          
                          if (!roiCtx) {
                            resolve();
                            return;
                          }
                          
                          // 绘制ROI区域
                          roiCtx.drawImage(img, x1, y1, roiWidth, roiHeight, 0, 0, roiWidth, roiHeight);
                          
                          // 计算清晰度
                          const roiImageData = roiCtx.getImageData(0, 0, roiWidth, roiHeight);
                          const sharpness = calculateROISharpness(roiImageData);
                          
                          // 计算ROI面积（用于优先级判断，面积越大越好）
                          const roiArea = roiWidth * roiHeight;
                          
                          // 检查是否需要更新综合评分最佳的ROI
                          // 综合评分：ROI面积50%权重 + 清晰度50%权重
                          const existing = bestROIs.get(detection.label);
                          let shouldUpdate = false;

                          if (!existing) {
                            shouldUpdate = true;
                          } else {
                            // 计算综合分数：面积权重0.5，清晰度权重0.5
                            // 归一化面积（假设最大面积为1920*1080，实际可以根据需要调整）
                            const maxArea = 1920 * 1080;
                            const normalizedArea = Math.min(1, roiArea / maxArea);
                            // 计算已有ROI的面积
                            let existingArea = 0;
                            if (existing.detection.bbox.width && existing.detection.bbox.height) {
                              existingArea = existing.detection.bbox.width * existing.detection.bbox.height;
                            } else if (existing.detection.bbox.x1 !== undefined && existing.detection.bbox.x2 !== undefined) {
                              existingArea = (existing.detection.bbox.x2 - existing.detection.bbox.x1) * (existing.detection.bbox.y2 - existing.detection.bbox.y1);
                            }
                            const normalizedExistingArea = Math.min(1, existingArea / maxArea);

                            // 归一化清晰度（0-100 -> 0-1）
                            const normalizedSharpness = sharpness / 100;
                            const normalizedExistingSharpness = existing.sharpness / 100;

                            // 综合分数 = 面积 × 权重 + 清晰度 × 权重
                            const areaWeight = roiWeightRatio.area / 100;
                            const clarityWeight = roiWeightRatio.clarity / 100;
                            const currentScore = normalizedArea * areaWeight + normalizedSharpness * clarityWeight;
                            const existingScore = normalizedExistingArea * areaWeight + normalizedExistingSharpness * clarityWeight;
                            
                            if (currentScore > existingScore) {
                              shouldUpdate = true;
                            }
                          }
                          
                          if (shouldUpdate) {
                            const roiDataUrl = roiCanvas.toDataURL('image/jpeg', 1.0); // 最高质量，避免多次压缩损失
                            bestROIs.set(detection.label, {
                              imageDataUrl: roiDataUrl,
                              imageBase64: roiDataUrl.split(',')[1],
                              detection: detection,
                              sharpness: sharpness,
                              fullImageDataUrl: frameDataUrl
                            });
                            console.log(`📸 更新ROI ${detection.label} 的最佳照片，面积: ${roiArea.toFixed(0)}px², 清晰度: ${sharpness.toFixed(2)}`);
                          }
                          
                          resolve();
                        } catch (error) {
                          console.error('处理ROI失败:', error);
                          resolve();
                        }
                      };
                      img.onerror = () => resolve();
                      img.src = frameDataUrl;
                    });
                  }
                } catch (error) {
                  console.error('延时期间检测失败:', error);
                }
              } else {
                // 全画面模式：计算全画面的清晰度
                try {
                  const img = new Image();
                  await new Promise<void>((resolve) => {
                    img.onload = () => {
                      try {
                        // 计算全画面清晰度
                        const fullImageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
                        const sharpness = calculateROISharpness(fullImageData);
                        
                        // 检查是否需要更新最清晰的全画面
                        const existing = bestROIs.get('full_image');
                        if (!existing || sharpness > existing.sharpness) {
                          bestROIs.set('full_image', {
                            imageDataUrl: frameDataUrl,
                            imageBase64: frameBase64,
                            detection: null, // 全画面模式没有detection
                            sharpness: sharpness,
                            fullImageDataUrl: frameDataUrl
                          });
                          console.log(`📸 更新全画面的最清晰照片，清晰度: ${sharpness.toFixed(2)}`);
                        }
                        
                        resolve();
                      } catch (error) {
                        console.error('处理全画面清晰度失败:', error);
                        resolve();
                      }
                    };
                    img.onerror = () => resolve();
                    img.src = frameDataUrl;
                  });
                } catch (error) {
                  console.error('延时期间计算全画面清晰度失败:', error);
                }
              }
              
              capturedFrames++;
            }
            
            const roiCount = imageSaveMode === 'roi' ? bestROIs.size : (bestROIs.has('full_image') ? 1 : 0);
            console.log(`✅ 延时结束，已捕获 ${capturedFrames} 帧，找到 ${roiCount} 个综合评分最佳${imageSaveMode === 'roi' ? 'ROI' : '全画面'}`);
            
            // 延时期间可能状态已变化，再次检查
            if (workflowState !== 'idle' || !videoRef.current) {
              console.log('⚠️ 延时期间工作流状态已变化，取消抓拍');
              return;
            }
            
            // 开始工作流
            setWorkflowState('capturing');
            
            // 使用综合评分最佳的ROI进行拼接或使用最后一帧
            // 优先使用实时检测累积的bestROIsRef（对齐齐套化页面）
            if (imageSaveMode === 'roi') {
              // 合并延时期间的bestROIs和实时检测累积的bestROIsRef
              // 🔧 修复：比较综合分数，只保留分数更高的ROI
              const allBestROIs = new Map(bestROIsRef.current);

              // 辅助函数：计算综合分数（面积50% + 清晰度50%）
              const calculateCompositeScore = (roiData: {
                detection: any;
                sharpness: number;
              }) => {
                const maxArea = 1920 * 1080;
                let roiArea = 0;

                if (roiData.detection.bbox.width && roiData.detection.bbox.height) {
                  roiArea = roiData.detection.bbox.width * roiData.detection.bbox.height;
                } else if (roiData.detection.bbox.x1 !== undefined && roiData.detection.bbox.x2 !== undefined) {
                  roiArea = (roiData.detection.bbox.x2 - roiData.detection.bbox.x1) *
                           (roiData.detection.bbox.y2 - roiData.detection.bbox.y1);
                }

                const normalizedArea = Math.min(1, roiArea / maxArea);
                const normalizedSharpness = roiData.sharpness / 100;

                const areaWeight = roiWeightRatio.area / 100;
                const clarityWeight = roiWeightRatio.clarity / 100;
                return normalizedArea * areaWeight + normalizedSharpness * clarityWeight;
              };

              // 合并ROI：只有当延时期间的ROI综合分数更高时才覆盖
              bestROIs.forEach((delayROI, key) => {
                const existingROI = allBestROIs.get(key);

                if (!existingROI) {
                  // 实时检测没有这个类别，直接使用延时期间的
                  allBestROIs.set(key, delayROI);
                  console.log(`📸 添加延时ROI ${key}（实时检测无此类别）`);
                } else {
                  // 比较综合分数，保留更高分的
                  const delayScore = calculateCompositeScore(delayROI);
                  const existingScore = calculateCompositeScore(existingROI);

                  if (delayScore > existingScore) {
                    allBestROIs.set(key, delayROI);
                    console.log(`✅ 延时ROI分数更高(${delayScore.toFixed(3)} > ${existingScore.toFixed(3)})，更新 ${key}`);
                  } else {
                    console.log(`⏭️ 实时ROI分数更高(${existingScore.toFixed(3)} >= ${delayScore.toFixed(3)})，保留 ${key}`);
                  }
                }
              });
              
              if (allBestROIs.size > 0) {
                // 使用已提取的ROI截图进行拼接（对齐齐套化页面）
                const roiSnapshots = Array.from(allBestROIs.values()).map(item => ({
                  imageDataUrl: item.imageDataUrl,
                  label: item.detection.label
                }));
                const stitchedImage = await stitchROISnapshots(roiSnapshots);
                if (stitchedImage) {
                  processedImageBase64 = stitchedImage;
                  processedDataUrl = `data:image/jpeg;base64,${stitchedImage}`;
                  console.log(`✅ ROI模式保存完成，使用累积ROI截图拼接（实时检测${bestROIsRef.current.size}个 + 延时${bestROIs.size}个 = 共${allBestROIs.size}个），base64长度:`, processedImageBase64.length);
                } else {
                  console.error('❌ ROI拼接失败，使用最后一帧');
                  // 使用最后一帧作为备选
                  const lastFrameCanvas = document.createElement('canvas');
                  lastFrameCanvas.width = videoRef.current.videoWidth;
                  lastFrameCanvas.height = videoRef.current.videoHeight;
                  const lastFrameCtx = lastFrameCanvas.getContext('2d');
                  if (lastFrameCtx && videoRef.current) {
                    lastFrameCtx.drawImage(videoRef.current, 0, 0);
                    processedDataUrl = lastFrameCanvas.toDataURL('image/jpeg', 1.0); // 最高质量，避免多次压缩损失
                    processedImageBase64 = processedDataUrl.split(',')[1];
                  } else {
                    setWorkflowState('idle');
                    return;
                  }
                }
              } else {
                // 没有累积的ROI，回退到旧逻辑：使用最后一帧重新检测
                console.log('🔍 ROI模式：没有累积ROI，使用最后一帧重新检测...');
                const lastFrameCanvas = document.createElement('canvas');
                lastFrameCanvas.width = videoRef.current.videoWidth;
                lastFrameCanvas.height = videoRef.current.videoHeight;
                const lastFrameCtx = lastFrameCanvas.getContext('2d');
                if (lastFrameCtx && videoRef.current) {
                  lastFrameCtx.drawImage(videoRef.current, 0, 0);
                  const lastFrameDataUrl = lastFrameCanvas.toDataURL('image/jpeg', 1.0); // 最高质量，避免多次压缩损失
                  const lastFrameBase64 = lastFrameDataUrl.split(',')[1];
                  
                  // 对最后一帧重新进行YOLO检测
                  const captureDetections = await yoloDetectBackend(lastFrameBase64, detectionConfidence);
                  const captureTargetDetections = captureDetections.filter(detection => 
                    selectedTargets.includes(detection.label) && detection.confidence >= detectionConfidence
                  );
                  
                  if (captureTargetDetections.length > 0) {
                    processedDataUrl = await stitchMultipleROIs(lastFrameDataUrl, captureTargetDetections);
                    if (processedDataUrl && processedDataUrl.includes(',')) {
                      processedImageBase64 = processedDataUrl.split(',')[1];
                      console.log('✅ ROI模式保存完成，使用最后一帧检测结果拼接，base64长度:', processedImageBase64.length);
                    } else {
                      processedDataUrl = lastFrameDataUrl;
                      processedImageBase64 = lastFrameBase64;
                    }
                  } else {
                    processedDataUrl = lastFrameDataUrl;
                    processedImageBase64 = lastFrameBase64;
                    console.warn('⚠️ ROI模式：最后一帧未检测到目标ROI区域，使用原图');
                  }
                } else {
                  setWorkflowState('idle');
                  return;
                }
              }
            } else {
              // 全画面模式：使用最清晰的一帧
              const bestFullImage = bestROIs.get('full_image');
              if (bestFullImage) {
                processedDataUrl = bestFullImage.fullImageDataUrl;
                processedImageBase64 = bestFullImage.imageBase64;
                console.log(`✅ 全画面模式保存完成，使用最清晰照片（清晰度: ${bestFullImage.sharpness.toFixed(2)}），统一压缩将在后续处理中进行`);
              } else {
                // 如果没有找到最清晰的照片，使用最后一帧
                const captureCanvas = document.createElement('canvas');
                captureCanvas.width = videoRef.current.videoWidth;
                captureCanvas.height = videoRef.current.videoHeight;
                const captureCtx = captureCanvas.getContext('2d');
                
                if (!captureCtx || !videoRef.current) {
                  console.error('❌ 无法创建抓拍画布');
                  setWorkflowState('idle');
                  return;
                }
                
                captureCtx.drawImage(videoRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
                processedDataUrl = captureCanvas.toDataURL('image/jpeg', 1.0); // 最高质量，避免多次压缩损失
                processedImageBase64 = processedDataUrl.split(',')[1];

                if (!processedImageBase64) {
                  console.error('❌ 无法获取抓拍图像数据');
                  setWorkflowState('idle');
                  return;
                }
                console.log('✅ 全画面模式保存完成（使用最后一帧），统一压缩将在后续处理中进行');
              }
            }
          } else {
            // 没有延时，使用原有逻辑
            // 开始工作流
            setWorkflowState('capturing');
            
            // 延时后重新获取当前帧图像（确保抓拍的是延时后的画面）
            const captureCanvas = document.createElement('canvas');
            captureCanvas.width = videoRef.current.videoWidth;
            captureCanvas.height = videoRef.current.videoHeight;
            const captureCtx = captureCanvas.getContext('2d');
            
            if (!captureCtx || !videoRef.current) {
              console.error('❌ 无法创建抓拍画布');
              setWorkflowState('idle');
              return;
            }

            // 绘制当前帧到画布
            captureCtx.drawImage(videoRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
            const captureDataUrl = captureCanvas.toDataURL('image/jpeg', 1.0); // 最高质量，避免多次压缩损失
            const captureBase64Data = captureDataUrl.split(',')[1];
            
            if (!captureBase64Data) {
              console.error('❌ 无法获取抓拍图像数据');
              setWorkflowState('idle');
              return;
            }
            
            processedImageBase64 = captureBase64Data;
            processedDataUrl = captureDataUrl;
            
            if (imageSaveMode === 'roi') {
              // 优先使用实时检测累积的bestROIsRef（对齐齐套化页面）
              if (bestROIsRef.current.size > 0) {
                // 使用已提取的ROI截图进行拼接
                const roiSnapshots = Array.from(bestROIsRef.current.values()).map(item => ({
                  imageDataUrl: item.imageDataUrl,
                  label: item.detection.label
                }));
                const stitchedImage = await stitchROISnapshots(roiSnapshots);
                if (stitchedImage) {
                  processedImageBase64 = stitchedImage;
                  processedDataUrl = `data:image/jpeg;base64,${stitchedImage}`;
                  console.log(`✅ ROI模式保存完成，使用累积ROI截图拼接（共${bestROIsRef.current.size}个），base64长度:`, processedImageBase64.length);
                } else {
                  console.error('❌ ROI拼接失败，使用原图');
                  processedDataUrl = captureDataUrl;
                  processedImageBase64 = captureBase64Data;
                }
              } else {
                // 没有累积的ROI，对延时后的全画面图片重新进行YOLO检测
                console.log('🔍 ROI模式：没有累积ROI，对全画面图片进行YOLO检测...');
                const captureDetections = await yoloDetectBackend(captureBase64Data, detectionConfidence);
                
                // 过滤出选中的目标检测结果
                const captureTargetDetections = captureDetections.filter(detection => 
                  selectedTargets.includes(detection.label) && detection.confidence >= detectionConfidence
                );
                
                console.log(`🔍 ROI模式：检测到 ${captureTargetDetections.length} 个目标ROI区域`);
                
                if (captureTargetDetections.length > 0) {
                  // 使用检测到的ROI区域进行拼接
                  processedDataUrl = await stitchMultipleROIs(captureDataUrl, captureTargetDetections);
                  // 从data URL中提取纯base64字符串
                  if (processedDataUrl && processedDataUrl.includes(',')) {
                    processedImageBase64 = processedDataUrl.split(',')[1];
                    console.log('✅ ROI模式保存完成，多区域拼接，base64长度:', processedImageBase64.length);
                  } else {
                    console.error('❌ ROI拼接失败，使用原图');
                    processedDataUrl = captureDataUrl;
                    processedImageBase64 = captureBase64Data;
                  }
                } else {
                  console.warn('⚠️ ROI模式：未检测到目标ROI区域，使用原图');
                  processedDataUrl = captureDataUrl;
                  processedImageBase64 = captureBase64Data;
                }
              }
            } else {
              // 全画面模式：不再在这里压缩，统一在 processCapturedImage 中处理
              processedDataUrl = captureDataUrl;
              processedImageBase64 = captureBase64Data;
              console.log('✅ 全画面模式保存完成，统一压缩将在后续处理中进行');
            }
          }
          
          // 创建抓拍图片的File对象用于二维码检测
          let capturedImageFile: File = new File([], 'captured_image.jpg', { type: 'image/jpeg' });
          if (captureDelaySeconds > 0 && imageSaveMode === 'roi') {
            // 延时模式下，合并实时检测和延时期间的ROI
            const allBestROIs = new Map(bestROIsRef.current);
            bestROIs.forEach((value, key) => {
              allBestROIs.set(key, value);
            });
            const bestROIsArray = Array.from(allBestROIs.values());
            if (bestROIsArray.length > 0) {
              const img = new Image();
              await new Promise<void>((resolve) => {
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  canvas.width = img.width;
                  canvas.height = img.height;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(img, 0, 0);
                    canvas.toBlob((blob) => {
                      if (blob) {
                        capturedImageFile = new File([blob], 'captured_image.jpg', { type: 'image/jpeg' });
                      } else {
                        capturedImageFile = new File([], 'captured_image.jpg', { type: 'image/jpeg' });
                      }
                      resolve();
                    }, 'image/jpeg', 0.8);
                  } else {
                    capturedImageFile = new File([], 'captured_image.jpg', { type: 'image/jpeg' });
                    resolve();
                  }
                };
                img.onerror = () => {
                  capturedImageFile = new File([], 'captured_image.jpg', { type: 'image/jpeg' });
                  resolve();
                };
                img.src = processedDataUrl;
              });
            } else {
              // 如果没有找到综合评分最佳的ROI，使用最后一帧
              const lastFrameCanvas = document.createElement('canvas');
              lastFrameCanvas.width = videoRef.current!.videoWidth;
              lastFrameCanvas.height = videoRef.current!.videoHeight;
              const lastFrameCtx = lastFrameCanvas.getContext('2d');
              if (lastFrameCtx && videoRef.current) {
                lastFrameCtx.drawImage(videoRef.current, 0, 0);
                capturedImageFile = new File([lastFrameCanvas.toBlob ? await new Promise<Blob>((resolve) => {
                  lastFrameCanvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 1.0); // 最高质量，避免多次压缩损失
                }) : new Blob()], 'captured_image.jpg', { type: 'image/jpeg' });
              } else {
                capturedImageFile = new File([], 'captured_image.jpg', { type: 'image/jpeg' });
              }
            }
          } else {
            // 非延时模式或全画面模式，使用原有逻辑
            const captureCanvas = document.createElement('canvas');
            captureCanvas.width = videoRef.current!.videoWidth;
            captureCanvas.height = videoRef.current!.videoHeight;
            const captureCtx = captureCanvas.getContext('2d');
            if (captureCtx && videoRef.current) {
              captureCtx.drawImage(videoRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
              capturedImageFile = new File([captureCanvas.toBlob ? await new Promise<Blob>((resolve) => {
                captureCanvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 1.0); // 最高质量，避免多次压缩损失
              }) : new Blob()], 'captured_image.jpg', { type: 'image/jpeg' });
            } else {
              capturedImageFile = new File([], 'captured_image.jpg', { type: 'image/jpeg' });
            }
          }
          
          // 设置预览图片
          setSelectedImage(capturedImageFile);
          setImagePreview(processedDataUrl);
          
          // 进入处理状态
          setWorkflowState('processing');
          
          // 使用公共的图像处理函数
          const { finalMatchStatus } = await processCapturedImage(processedImageBase64, capturedImageFile, 'realtime');
          
          // 判断合格性并决定下一步
          if (finalMatchStatus === 'qualified') {
            if (requireQualifiedConfirmation) {
              console.log('检测结果：合格，等待回车键确认');
              setWorkflowState('waiting_for_approval');
              setIsWaitingForSpace(true);
              // 立即停止检测循环
              console.log('设置工作流状态为waiting_for_approval，检测循环将停止');
            } else {
              console.log('检测结果：合格，自动进入下一个循环');
              setWorkflowState('completed');
              // 重置YOLO检测状态
              setDetectedElements([]);
              detectedElementsRef.current = []; // 同步更新ref
              setElementDetectionStartTime(null);
              historyDetectionsRef.current.clear(); // 清空历史检测结果
              bestROIsRef.current.clear(); // 清空累积的ROI，准备下次检测
              // 延迟一下再开始下一个循环
              setTimeout(() => {
                setWorkflowState('idle');
                setMatchStatus('none');
                setWorkflowResult(null);
                setFinalResult('none');
              }, 1000); // 减少延迟时间，提升响应速度
            }
          } else if (finalMatchStatus === 'unqualified') {
            console.log('检测结果：存疑，等待回车键确认');
            setWorkflowState('waiting_for_approval');
            setIsWaitingForSpace(true);
            // 立即停止检测循环
            console.log('设置工作流状态为waiting_for_approval，检测循环将停止');
          } else {
            console.log('检测结果：无匹配，自动进入下一个循环');
            setWorkflowState('completed');
            // 重置YOLO检测状态
            setDetectedElements([]);
            detectedElementsRef.current = []; // 同步更新ref
            setElementDetectionStartTime(null);
            historyDetectionsRef.current.clear(); // 清空历史检测结果
            setTimeout(() => {
              setWorkflowState('idle');
              setMatchStatus('none');
              setWorkflowResult(null);
              setFinalResult('none');
            }, 1000); // 减少延迟时间，提升响应速度
          }
        }
        
      } catch (error) {
        console.error('实时检测失败:', error);
        
        // 修复Bug 6: 发生错误时，重置工作流状态以允许下一次检测
        setWorkflowState('idle');
        setMatchStatus('none');
        setWorkflowResult(null);
        setFinalResult('none');
        
      } finally {
        isDetectingRef.current = false;
        setIsDetecting(false);
        
        // 处理队列中的下一个任务
        if (detectionQueueRef.current.length > 0) {
          const nextTask = detectionQueueRef.current.shift();
          if (nextTask) {
            // 使用 setTimeout 确保当前任务完全结束后再执行下一个
            setTimeout(() => {
              nextTask();
            }, 0);
          }
        } else {
          isProcessingQueueRef.current = false;
        }
      }
    };
    
    // 如果队列正在处理或正在检测，将任务加入队列
    if (isProcessingQueueRef.current || isDetectingRef.current) {
      detectionQueueRef.current.push(executeDetection);
      if (!isProcessingQueueRef.current) {
        isProcessingQueueRef.current = true;
      }
      return;
    }
    
    // 否则立即执行
    isProcessingQueueRef.current = true;
    executeDetection();
  }, [
    // 列出所有依赖项
    isRealtimeActive,
    workflowState,
    autoCapture,
    captureDelaySeconds,
    detectionConfidence,
    selectedTargets,
    yoloDetectionMode,
    imageSaveMode,
    elementDetectionStartTime,
    yoloTimeoutSeconds,
    detectionInterval, // 添加检测间隔依赖
    calculateSharpnessAsync, // 添加异步清晰度计算函数依赖
    processCapturedImage,
    setWorkflowState,
    setSelectedImage,
    setImagePreview,
    setDetectedElements,
    setElementDetectionStartTime,
    setIsWaitingForSpace,
    setMatchStatus,
    setWorkflowResult,
    setFinalResult,
    setIsDetecting
  ]);
  
  // 同步performRealtimeDetection到ref，确保useEffect中能获取最新引用
  useEffect(() => {
    performRealtimeDetectionRef.current = performRealtimeDetection;
  }, [performRealtimeDetection]);

  // 实时检测循环
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    // 只在idle状态下启动检测循环，其他状态（waiting_for_approval、completed、processing、capturing）都停止
    if (isRealtimeActive && isCameraOn && workflowState === 'idle') {
      console.log('▶️ 启动检测循环，工作流状态:', workflowState, '检测间隔:', detectionInterval, '秒');
      intervalId = setInterval(() => {
        // 使用ref获取最新的函数和状态，避免闭包问题
        const currentWorkflowState = workflowStateRef.current;
        const detectionFn = performRealtimeDetectionRef.current;
        if (currentWorkflowState === 'idle' && detectionFn) {
          detectionFn();
        } else if (currentWorkflowState !== 'idle') {
          console.log('⏸️ 检测循环中检测到状态变化，跳过本次检测:', currentWorkflowState);
        }
      }, detectionInterval * 1000); // 使用用户设置的检测间隔
    } else {
      // 状态不是idle时，确保清空队列
      if (workflowState !== 'idle') {
        console.log('⏸️ 停止检测循环，工作流状态:', workflowState);
        detectionQueueRef.current = [];
        isProcessingQueueRef.current = false;
        isDetectingRef.current = false;
        setIsDetecting(false);
      }
    }
    
    return () => {
      if (intervalId) {
        console.log('🛑 清除检测循环定时器，工作流状态:', workflowState);
        clearInterval(intervalId);
      }
      // 清理时也清空队列
      detectionQueueRef.current = [];
      isProcessingQueueRef.current = false;
    };
    // 注意：不包含 performRealtimeDetection 在依赖项中，因为它使用 useCallback 且依赖项已经处理好了
    // 如果包含它，会导致循环不断重新创建
  }, [isRealtimeActive, isCameraOn, workflowState, detectionInterval]); // 移除 performRealtimeDetection 依赖，避免循环

  // 定期更新视频信息
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (isCameraOn && videoRef.current) {
      intervalId = setInterval(() => {
        if (videoRef.current) {
          setVideoInfo({
            width: videoRef.current.videoWidth,
            height: videoRef.current.videoHeight,
            readyState: videoRef.current.readyState
          });
        }
      }, 500); // 每500ms更新一次
    }
    
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isCameraOn]);

  // 工作流状态变化时清空检测画布
  useEffect(() => {
    // 当工作流状态不是idle时（比如capturing、processing、waiting_for_approval等），清空画布
    if (workflowState !== 'idle' && detectionCanvasRef.current) {
      const ctx = detectionCanvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, detectionCanvasRef.current.width, detectionCanvasRef.current.height);
        console.log('🔄 工作流状态变化，清空检测画布:', workflowState);
      }
    }
  }, [workflowState]);


  // 关键词分析函数

  // 执行OCR测试
  // 执行OCR测试（使用 processCapturedImage 统一处理）
  const performOCRTest = async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    setMatchStatus('none');
    try {
      // 将图片转换为base64
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(selectedImage);
      });

      // 使用统一的 processCapturedImage 处理
      await processCapturedImage(base64, selectedImage, 'manual');
      
      // 添加到测试历史
      if (ocrResult) {
        setTestHistory(prev => [ocrResult!, ...prev.slice(0, 9)]);
      }
    } catch (error) {
      console.error('OCR测试失败:', error);
      setOcrResult({
        success: false,
        full_text: '',
        detailed_results: [],
        text_count: 0,
        error: `OCR测试失败: ${error}`
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 清空结果
  const clearResults = () => {
    setSelectedImage(null);
    setImagePreview('');
    setOcrResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // 导出结果
  const exportResults = () => {
    if (!ocrResult) return;
    
    const data = {
      timestamp: new Date().toISOString(),
      image_name: selectedImage?.name || 'unknown',
      result: ocrResult
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocr_test_result_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // 获取置信度颜色
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.5) return 'text-yellow-400';
    return 'text-red-400';
  };

  // 获取置信度图标
  const getConfidenceIcon = (confidence: number) => {
    if (confidence >= 0.8) return <CheckCircle className="h-4 w-4 text-green-400" />;
    if (confidence >= 0.5) return <AlertCircle className="h-4 w-4 text-yellow-400" />;
    return <XCircle className="h-4 w-4 text-red-400" />;
  };

  return (
    <>
      <style>{sliderStyles}</style>
      
      {/* 综合结果状态显示 - 右上角 */}
      {finalResult !== 'none' && (
        <div className="fixed top-4 right-4 z-50">
          <div className={`
            px-8 py-4 rounded-lg border-4 shadow-2xl font-bold text-2xl
            ${finalResult === 'qualified' 
              ? 'bg-green-500 text-white border-green-600' 
              : 'bg-yellow-500 text-white border-yellow-600'
            }
          `}>
            {finalResult === 'qualified' ? '✓ 合格' : '? 存疑'}
          </div>
        </div>
      )}

      {/* YOLO识别目标数量显示 - 右上角，在合格/存疑左侧 */}
      {isRealtimeActive && selectedTargets.length > 0 && (
        <div className="fixed top-4 right-80 z-50 max-w-xs">
          <div className="px-4 py-2 rounded-lg border-2 shadow-lg bg-slate-800/95 border-slate-600">
            <div className="space-y-2">
              {/* 进度显示 */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-200">识别目标</span>
                {(() => {
                  const validTargets = selectedTargets.filter(target => target != null && typeof target === 'string');
                  const detectedCount = Array.isArray(detectedElements) ? detectedElements.length : 0;
                  const totalCount = validTargets.length;
                  const percentage = totalCount > 0 ? Math.round((detectedCount / totalCount) * 100) : 0;
                  return (
                    <>
                      <span className="font-bold text-yellow-400">
                        {detectedCount}/{totalCount}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({percentage}%)
                      </span>
                    </>
                  );
                })()}
              </div>
              
              {/* 检测类型列表 - 显示所有目标，检测到的变绿，未检测到的保持黄色 */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                {selectedTargets
                  .filter(target => target != null && typeof target === 'string')
                  .map((target) => {
                    // 确保 detectedElements 是数组
                    const detectedArray = Array.isArray(detectedElements) ? detectedElements : [];
                    // 规范化标签名称进行匹配，确保匹配准确（与检测逻辑保持一致）
                    const normalizedTarget = normalizeLabel(target);
                    const normalizedDetected = detectedArray.map(normalizeLabel).filter(label => label !== '');
                    const isDetected = normalizedDetected.includes(normalizedTarget);
                    
                    const chineseName = getTargetChineseName(target);
                  return (
                    <span
                      key={target}
                      className={`
                        px-2 py-0.5 rounded border
                        ${isDetected 
                          ? 'bg-green-500/80 text-white border-green-600' 
                          : 'bg-yellow-500/80 text-white border-yellow-600'
                        }
                      `}
                      title={isDetected ? `✅ 已检测到: ${target}` : `⏳ 未检测到: ${target}`}
                    >
                      {chineseName}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
      
      
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-full">
      {/* 左侧：图片上传和预览 */}
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              OCR防呆检测
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 实时检测控制面板 */}
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-600">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Label className="text-sm font-medium">实时检测</Label>
                    <div className="text-xs text-blue-400 font-medium">
                      窗口ID: {windowId.slice(-8)}
                    </div>
                  </div>
                </div>
                
                {/* 摄像头控制区域 */}
                <div className="space-y-3">
                  {/* 调试信息 */}
                  <div className="text-xs text-slate-500">
                    检测到 {availableDevices.length} 个摄像头设备
                    {selectedDeviceId && `，当前选择: ${availableDevices.find(d => d.deviceId === selectedDeviceId)?.label || '未知'}`}
                  </div>
                  
                  {/* 摄像头选择器和控制按钮 - 单行布局 */}
                  <div className="flex items-center gap-2">
                    <Select value={selectedDeviceId} onValueChange={switchCamera}>
                      <SelectTrigger className="w-48 h-7 bg-slate-800 border-slate-600 text-xs">
                        <SelectValue placeholder={availableDevices.length > 0 ? "选择摄像头" : "未检测到摄像头"} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableDevices.length > 0 ? (
                          availableDevices
                            .filter(device => device.deviceId && device.deviceId.trim() !== '')
                            .map(device => (
                              <SelectItem key={device.deviceId} value={device.deviceId}>
                                {device.label || `摄像头 ${device.deviceId.slice(0, 8)}`}
                              </SelectItem>
                            ))
                        ) : (
                          <SelectItem value="no-camera" disabled>
                            未检测到摄像头设备
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    
                    <Button
                      variant={isCameraOn ? "destructive" : "default"}
                      size="sm"
                      onClick={toggleCamera}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 h-7"
                    >
                      {isCameraOn ? <VideoOff className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                      {isCameraOn ? '关闭摄像头' : '开启摄像头'}
                    </Button>
                    <Button
                      variant={isRealtimeActive ? "destructive" : "default"}
                      size="sm"
                      onClick={() => setIsRealtimeActive(!isRealtimeActive)}
                      disabled={!isCameraOn}
                      className="flex items-center gap-1 text-xs px-3 py-1.5 h-7"
                    >
                      {isRealtimeActive ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                      {isRealtimeActive ? '停止检测' : '开始检测'}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleManualCapture}
                      disabled={!isCameraOn || workflowState !== 'idle'}
                      className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-xs px-3 py-1.5 h-7"
                    >
                      <Camera className="h-3 w-3" />
                      拍照
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleForceReset}
                      className="h-7 w-7 p-0 bg-red-600 hover:bg-red-700"
                      title="强制复位所有检测状态，解决卡住问题"
                    >
                      <RotateCcw className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
              
              {/* YOLO模型状态显示 */}
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="h-4 w-4 text-blue-400" />
                <span className="text-sm text-slate-300">
                  当前模型: 
                  {modelLoading ? (
                    <span className="text-slate-500 ml-1">加载中...</span>
                  ) : (
                    <span className="text-blue-400 font-medium ml-1">
                      {modelName}
                    </span>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshModel}
                  className="h-6 w-6 p-0 text-slate-400 hover:text-slate-300"
                >
                  <RefreshCw className={`h-3 w-3 ${modelLoading ? 'animate-spin' : ''}`} />
                </Button>
              </div>
              
              {/* 视频显示区域 */}
              <div 
                id="video-container"
                className="aspect-video bg-black rounded-lg flex items-center justify-center text-slate-500 overflow-hidden relative"
              >
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted
                  className={`w-full h-full object-contain ${!isCameraOn ? 'hidden' : ''}`}
                  onLoadStart={() => console.log('视频开始加载')}
                  onLoadedData={() => console.log('视频数据加载完成')}
                  onLoadedMetadata={() => console.log('视频元数据加载完成')}
                  onCanPlay={() => console.log('视频可以播放')}
                  onPlay={() => console.log('视频开始播放')}
                  onPlaying={() => console.log('视频正在播放')}
                  onError={(e) => console.error('视频错误:', e)}
                />
                <canvas 
                  ref={detectionCanvasRef}
                  className="absolute inset-0 w-full h-full pointer-events-none"
                />
                {!isCameraOn && <CameraOff className="h-16 w-16" />}
                
                {/* 全屏按钮 */}
                {isCameraOn && (
                  <button
                    onClick={toggleFullscreen}
                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-lg transition-colors z-10"
                    title={isFullscreen ? "退出全屏" : "全屏显示"}
                  >
                    {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                  </button>
                )}
                
                {/* 检测状态指示器 */}
                {isRealtimeActive && (
                  <div className="absolute top-2 left-2 flex items-center gap-2 bg-red-500 text-white px-2 py-1 rounded text-xs">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                    检测中
                  </div>
                )}
                
                {/* 检测统计 */}
                {isRealtimeActive && detectionStats.totalDetections > 0 && (
                  <div className="absolute bottom-2 left-2 bg-blue-500 text-white px-2 py-1 rounded text-xs">
                    <div>人员: {detectionStats.personDetections}</div>
                    <div>装备: {detectionStats.equipmentDetections}</div>
                  </div>
                )}
                
                {/* 检测中指示器 */}
                {isDetecting && (
                  <div className="absolute bottom-2 right-2 bg-blue-500 text-white px-2 py-1 rounded text-xs">
                    检测中...
                  </div>
                )}
              </div>
              
              {/* 检测设置面板 */}
              <div className="border-t border-slate-600/50 pt-3 mt-3">
                <div 
                  className="flex items-center justify-between cursor-pointer hover:bg-slate-700/30 active:bg-slate-700/50 rounded-md p-2 -m-2 transition-colors select-none"
                  onClick={() => setIsSettingsExpanded(!isSettingsExpanded)}
                >
                  <div className="text-xs text-slate-400">检测设置</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {isSettingsExpanded ? '收起' : '展开'}
                    </span>
                    {isSettingsExpanded ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </div>
                
                {/* 可折叠的设置内容 */}
                <div className={`space-y-3 transition-all duration-300 ease-in-out ${
                  isSettingsExpanded ? "max-h-[800px] opacity-100 mt-3 overflow-y-auto" : "max-h-0 opacity-0 mt-0 overflow-hidden"
                }`}>
                  {/* 检测置信度设置 */}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">检测置信度</Label>
                    <select
                      value={detectionConfidence.toString()}
                      onChange={(e) => setDetectionConfidence(parseFloat(e.target.value))}
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
                      value={detectionInterval}
                      onChange={(e) => {
                        const interval = parseFloat(e.target.value);
                        setDetectionInterval(interval);
                        console.log('检测间隔设置为:', interval, '秒');
                      }}
                    >
                      <option value="0.1">0.1秒</option>
                      <option value="0.5">0.5秒</option>
                      <option value="1">1秒</option>
                      <option value="2">2秒</option>
                      <option value="5">5秒</option>
                    </select>
                  </div>
                  
                  {/* 合格结果确认设置 */}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">合格结果确认</Label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {requireQualifiedConfirmation ? '需要回车确认' : '自动继续'}
                      </span>
                      <button
                        onClick={() => setRequireQualifiedConfirmation(!requireQualifiedConfirmation)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          requireQualifiedConfirmation ? 'bg-blue-600' : 'bg-slate-600'
                        }`}
                      >
                        <span
                          className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                            requireQualifiedConfirmation ? 'translate-x-5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                  
                  {/* 检测目标选择 - 分组显示 */}
                  <div className="space-y-2">
                    <Label className="text-sm">检测目标</Label>
                    <div className="text-xs text-slate-400 mb-2">
                      当前模型: {currentModel === 'filter_core_detection' ? '滤芯检测专用模型' : 
                               currentModel === 'ppe_detection' ? 'PPE检测专用模型' : 
                               currentModel === 'yolo8_general' ? 'YOLO8通用检测模型' : currentModel}
                    </div>
                    {(() => {
                      // 使用后端返回的分类信息（如果可用），否则使用前端分组逻辑作为备用
                      const allTargets = getAvailableTargets();
                      let nameTargets: string[] = [];
                      let labelTargets: string[] = [];
                      let logoTargets: string[] = [];
                      let ppeTargets: string[] = [];
                      let materialTargets: string[] = [];
                      let componentTargets: string[] = [];
                      let featureTargets: string[] = [];
                      let otherTargets: string[] = [];
                      
                      if (modelConfig?.class_categories) {
                        // 优先使用后端返回的分类信息
                        nameTargets = modelConfig.class_categories.names || [];
                        labelTargets = modelConfig.class_categories.labels || [];
                        logoTargets = modelConfig.class_categories.logos || [];
                        ppeTargets = modelConfig.class_categories.ppe || [];
                        materialTargets = modelConfig.class_categories.materials || [];
                        componentTargets = modelConfig.class_categories.components || [];
                        featureTargets = modelConfig.class_categories.features || [];
                        otherTargets = modelConfig.class_categories.others || [];
                      } else {
                        // 备用：前端分组逻辑（向后兼容）
                        nameTargets = allTargets.filter(t => t.startsWith('name_'));
                        labelTargets = allTargets.filter(t => t.includes('_label'));
                        logoTargets = allTargets.filter(t => t.includes('_logo') || t.includes('logo'));
                        otherTargets = allTargets.filter(t => 
                          !nameTargets.includes(t) && 
                          !labelTargets.includes(t) && 
                          !logoTargets.includes(t)
                        );
                      }
                      
                      const toggleGroup = (groupName: string) => {
                        setExpandedTargetGroups(prev => {
                          const newSet = new Set(prev);
                          if (newSet.has(groupName)) {
                            newSet.delete(groupName);
                          } else {
                            newSet.add(groupName);
                          }
                          return newSet;
                        });
                      };
                      
                      const renderTargetItem = (target: string) => (
                        <div key={target} className="flex items-center gap-2 text-sm">
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={selectedTargets.includes(target)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedTargets([...selectedTargets, target]);
                                } else {
                                  setSelectedTargets(selectedTargets.filter(t => t !== target));
                                }
                              }}
                              className="rounded"
                            />
                            <span className="text-slate-300">
                              {getTargetChineseName(target)}
                            </span>
                          </label>
                          {selectedTargets.includes(target) && (
                            <label
                              className="flex items-center gap-1 ml-1 cursor-pointer"
                              title="mini模式（智能填充到空白区域）"
                              onClick={() => toggleNonGridTarget(target)}
                            >
                              <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center transition-all ${
                                nonGridTargets.includes(target)
                                  ? 'border-blue-400'
                                  : 'border-slate-500'
                              }`}>
                                {nonGridTargets.includes(target) && (
                                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                                )}
                              </div>
                              <span className="text-xs text-slate-400">mini</span>
                            </label>
                          )}
                        </div>
                      );
                      
                      return (
                        <div className="space-y-2">
                          {/* 名称类分组 */}
                          {nameTargets.length > 0 && (
                            <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                              <div 
                                className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                                onClick={() => toggleGroup('names')}
                              >
                                <Label className="text-xs font-medium">名称类 ({nameTargets.length})</Label>
                                {expandedTargetGroups.has('names') ? (
                                  <ChevronUp className="h-3 w-3 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-slate-400" />
                                )}
                              </div>
                              {expandedTargetGroups.has('names') && (
                                <div className="p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {nameTargets.map(renderTargetItem)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* 标签类分组 */}
                          {labelTargets.length > 0 && (
                            <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                              <div 
                                className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                                onClick={() => toggleGroup('labels')}
                              >
                                <Label className="text-xs font-medium">标签类 ({labelTargets.length})</Label>
                                {expandedTargetGroups.has('labels') ? (
                                  <ChevronUp className="h-3 w-3 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-slate-400" />
                                )}
                              </div>
                              {expandedTargetGroups.has('labels') && (
                                <div className="p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {labelTargets.map(renderTargetItem)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* Logo类分组 */}
                          {logoTargets.length > 0 && (
                            <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                              <div 
                                className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                                onClick={() => toggleGroup('logos')}
                              >
                                <Label className="text-xs font-medium">Logo类 ({logoTargets.length})</Label>
                                {expandedTargetGroups.has('logos') ? (
                                  <ChevronUp className="h-3 w-3 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-slate-400" />
                                )}
                              </div>
                              {expandedTargetGroups.has('logos') && (
                                <div className="p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {logoTargets.map(renderTargetItem)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* 劳保类分组 */}
                          {ppeTargets.length > 0 && (
                            <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                              <div 
                                className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                                onClick={() => toggleGroup('ppe')}
                              >
                                <Label className="text-xs font-medium">劳保类 ({ppeTargets.length})</Label>
                                {expandedTargetGroups.has('ppe') ? (
                                  <ChevronUp className="h-3 w-3 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-slate-400" />
                                )}
                              </div>
                              {expandedTargetGroups.has('ppe') && (
                                <div className="p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {ppeTargets.map(renderTargetItem)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* 材质类分组 */}
                          {materialTargets.length > 0 && (
                            <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                              <div 
                                className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                                onClick={() => toggleGroup('materials')}
                              >
                                <Label className="text-xs font-medium">材质类 ({materialTargets.length})</Label>
                                {expandedTargetGroups.has('materials') ? (
                                  <ChevronUp className="h-3 w-3 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-slate-400" />
                                )}
                              </div>
                              {expandedTargetGroups.has('materials') && (
                                <div className="p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {materialTargets.map(renderTargetItem)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* 组件类分组 */}
                          {componentTargets.length > 0 && (
                            <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                              <div 
                                className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                                onClick={() => toggleGroup('components')}
                              >
                                <Label className="text-xs font-medium">组件类 ({componentTargets.length})</Label>
                                {expandedTargetGroups.has('components') ? (
                                  <ChevronUp className="h-3 w-3 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-slate-400" />
                                )}
                              </div>
                              {expandedTargetGroups.has('components') && (
                                <div className="p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {componentTargets.map(renderTargetItem)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* 特征类分组 */}
                          {featureTargets.length > 0 && (
                            <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                              <div 
                                className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                                onClick={() => toggleGroup('features')}
                              >
                                <Label className="text-xs font-medium">特征类 ({featureTargets.length})</Label>
                                {expandedTargetGroups.has('features') ? (
                                  <ChevronUp className="h-3 w-3 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-slate-400" />
                                )}
                              </div>
                              {expandedTargetGroups.has('features') && (
                                <div className="p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {featureTargets.map(renderTargetItem)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          
                          {/* 其他类分组 */}
                          {otherTargets.length > 0 && (
                            <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                              <div 
                                className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                                onClick={() => toggleGroup('others')}
                              >
                                <Label className="text-xs font-medium">其他类 ({otherTargets.length})</Label>
                                {expandedTargetGroups.has('others') ? (
                                  <ChevronUp className="h-3 w-3 text-slate-400" />
                                ) : (
                                  <ChevronDown className="h-3 w-3 text-slate-400" />
                                )}
                              </div>
                              {expandedTargetGroups.has('others') && (
                                <div className="p-2">
                                  <div className="flex flex-wrap gap-2">
                                    {otherTargets.map(renderTargetItem)}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  
                  
                  {/* ROI截图和YOLO检测增强设置 */}
                  <div className="space-y-3 border-t border-slate-600/30 pt-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">自动检测保存模式</Label>
                      <Select value={imageSaveMode} onValueChange={(value: 'full' | 'roi') => setImageSaveMode(value)}>
                        <SelectTrigger className="w-32 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full">全画面</SelectItem>
                          <SelectItem value="roi">ROI截图</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* ROI评分权重比例设置 */}
                    {imageSaveMode === 'roi' && (
                      <div className="flex items-center justify-between">
                        <Label className="text-sm" title="ROI面积权重:清晰度权重">评分权重 (面积:清晰度)</Label>
                        <Select
                          value={`${roiWeightRatio.area}/${roiWeightRatio.clarity}`}
                          onValueChange={(value) => {
                            const [area, clarity] = value.split('/').map(Number);
                            setRoiWeightRatio({ area, clarity });
                          }}
                        >
                          <SelectTrigger className="w-32 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="100/0">100/0 (仅面积)</SelectItem>
                            <SelectItem value="20/80">20/80</SelectItem>
                            <SelectItem value="40/60">40/60</SelectItem>
                            <SelectItem value="60/40">60/40</SelectItem>
                            <SelectItem value="80/20">80/20</SelectItem>
                            <SelectItem value="0/100">0/100 (仅清晰度)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* YOLO检测逻辑设置 */}
                    <div className="space-y-2">
                      <Label className="text-sm">YOLO检测逻辑</Label>
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="yoloMode"
                            value="or"
                            checked={yoloDetectionMode === 'or'}
                            onChange={(e) => setYoloDetectionMode(e.target.value as 'or' | 'and')}
                            className="rounded"
                          />
                          <span className="text-slate-300">OR (识别任一元素即抓拍)</span>
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="radio"
                            name="yoloMode"
                            value="and"
                            checked={yoloDetectionMode === 'and'}
                            onChange={(e) => setYoloDetectionMode(e.target.value as 'or' | 'and')}
                            className="rounded"
                          />
                          <span className="text-slate-300">AND (必须全部元素才抓拍)</span>
                        </label>
                      </div>
                    </div>
                    
                    {/* AND模式超时设置 */}
                    {yoloDetectionMode === 'and' && (
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">AND模式超时时间</Label>
                        <select
                          value={yoloTimeoutSeconds === -1 ? '-1' : yoloTimeoutSeconds.toString()}
                          onChange={(e) => {
                            const value = parseInt(e.target.value);
                            setYoloTimeoutSeconds(value === -1 ? -1 : value);
                          }}
                          className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-slate-100 text-sm"
                        >
                          <option value="-1">∞ 永不超时</option>
                          <option value="3">3秒</option>
                          <option value="5">5秒</option>
                          <option value="10">10秒</option>
                          <option value="15">15秒</option>
                        </select>
                      </div>
                    )}
                    
                    {/* 当前检测状态显示 - 可折叠，默认收起避免遮挡 */}
                    {yoloDetectionMode === 'and' && Array.isArray(detectedElements) && detectedElements.length > 0 && (
                      <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                        <div 
                          className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                          onClick={() => setIsDetectionStatusExpanded(!isDetectionStatusExpanded)}
                        >
                          <Label className="text-xs font-medium">当前检测状态</Label>
                          {isDetectionStatusExpanded ? (
                            <ChevronUp className="h-3 w-3 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                          )}
                        </div>
                        {isDetectionStatusExpanded && (
                          <div className="p-2 space-y-1.5 max-h-32 overflow-y-auto">
                            <div className="text-xs text-slate-400 break-words">
                              <span className="font-medium">已检测到:</span> {detectedElements.join(', ')}
                            </div>
                            <div className="text-xs text-slate-400 break-words">
                              <span className="font-medium">等待元素:</span> {selectedTargets.filter(t => !detectedElements.includes(t)).join(', ')}
                            </div>
                            {elementDetectionStartTime && (
                              <div className="text-xs text-slate-400">
                                <span className="font-medium">检测开始时间:</span> {new Date(elementDetectionStartTime).toLocaleTimeString()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {/* 自动抓拍设置 */}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">自动抓拍</Label>
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoCapture}
                        onChange={(e) => setAutoCapture(e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-slate-300">启用</span>
                    </label>
                  </div>
                  
                  {/* 防抖时间设置 */}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">防抖时间</Label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0"
                        max="3"
                        step="0.1"
                        value={debounceSeconds}
                        onChange={(e) => setDebounceSeconds(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-20 px-2 py-1 text-sm text-slate-200 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.3"
                      />
                      <span className="text-sm text-slate-400">秒</span>
                    </div>
                  </div>

                  {/* 延时拍照设置 */}
                  <div className="flex items-center justify-between">
                    <Label className="text-sm">延时拍照</Label>
                    <div className="flex items-center space-x-2">
                      <input
                        type="number"
                        min="0"
                        max="10"
                        step="0.5"
                        value={captureDelaySeconds}
                        onChange={(e) => setCaptureDelaySeconds(Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-20 px-2 py-1 text-sm text-slate-200 bg-slate-700 border border-slate-600 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0"
                      />
                      <span className="text-sm text-slate-400">秒</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* 二维码检测设置面板 */}
              <div className="border-t border-slate-600/50 pt-3 mt-3">
                <div 
                  className="flex items-center justify-between cursor-pointer hover:bg-slate-700/30 active:bg-slate-700/50 rounded-md p-2 -m-2 transition-colors select-none"
                  onClick={() => setIsBarcodeSettingsExpanded(!isBarcodeSettingsExpanded)}
                >
                  <div className="flex items-center gap-2">
                    <div className="text-xs text-slate-400">二维码检测设置</div>
                    <Switch
                      checked={enableBarcodeDetection}
                      onCheckedChange={setEnableBarcodeDetection}
                      className="data-[state=checked]:bg-green-600"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500">
                      {isBarcodeSettingsExpanded ? '收起' : '展开'}
                    </span>
                    {isBarcodeSettingsExpanded ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </div>
                
                {/* 可折叠的条码检测设置内容 */}
                <div className={`space-y-3 transition-all duration-300 ease-in-out overflow-hidden ${
                  isBarcodeSettingsExpanded ? "max-h-[600px] opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
                }`}>
                  {/* 条码配置列表 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">期望二维码配置</Label>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const newConfig = {
                            id: Date.now().toString(),
                            expectedText: '',
                            matchMode: 'contains' as const,
                            enabled: true
                          };
                          addBarcodeConfig(newConfig);
                        }}
                        className="text-xs"
                      >
                        添加二维码
                      </Button>
                    </div>
                    
                    {barcodeConfigs.length === 0 ? (
                      <div className="text-xs text-slate-500 text-center py-4">
                        暂无二维码配置，点击"添加二维码"开始配置
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {barcodeConfigs.map((config) => (
                          <div key={config.id} className="flex items-center gap-2 p-2 bg-slate-800/50 rounded border border-slate-600/30">
                            <input
                              type="checkbox"
                              checked={config.enabled}
                              onChange={(e) => updateBarcodeConfig(config.id, { enabled: e.target.checked })}
                              className="rounded"
                            />
                            <input
                              type="text"
                              value={config.expectedText}
                              onChange={(e) => updateBarcodeConfig(config.id, { expectedText: e.target.value })}
                              placeholder="期望的二维码文本"
                              className="flex-1 px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm"
                            />
                            <select
                              value={config.matchMode}
                              onChange={(e) => updateBarcodeConfig(config.id, { matchMode: e.target.value as 'contains' | 'exact' })}
                              className="px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm"
                            >
                              <option value="contains">包含</option>
                              <option value="exact">相同</option>
                            </select>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => removeBarcodeConfig(config.id)}
                              className="text-red-300 border-red-600 hover:bg-red-800 text-xs px-2"
                            >
                              删除
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* 智能预处理配置 */}
                  <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-600/30">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-2">
                        <div className={`w-2 h-2 rounded-full ${enableSmartPreprocessing ? 'bg-blue-500' : 'bg-slate-500'}`}></div>
                        <span className="text-sm font-medium text-slate-200">智能预处理</span>
                      </div>
                      <Switch
                        checked={enableSmartPreprocessing}
                        onCheckedChange={setEnableSmartPreprocessing}
                        className="data-[state=checked]:bg-blue-600"
                      />
                    </div>
                    
                    {enableSmartPreprocessing && (
                      <div className="space-y-3">
                        {/* 预处理方案选择 */}
                        <div className="space-y-2">
                          <Label className="text-xs text-slate-400">预处理方案</Label>
                          <Select value={selectedPreprocessingPreset} onValueChange={setSelectedPreprocessingPreset}>
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PREPROCESSING_PRESETS.map((preset) => (
                                <SelectItem key={preset.id} value={preset.id}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{preset.name}</span>
                                    <span className="text-xs text-slate-400">{preset.description}</span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        
                        {/* 图像质量分析状态 */}
                        {isAnalyzingImage && (
                          <div className="flex items-center space-x-2 text-blue-400">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span className="text-sm">正在分析图像质量...</span>
                          </div>
                        )}
                        
                        {/* 图像质量指标 */}
                        {imageQualityMetrics && (
                          <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                            <h4 className="text-blue-300 font-medium mb-2">图像质量分析</h4>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="flex justify-between">
                                <span className="text-slate-400">亮度:</span>
                                <span className="text-slate-300">{imageQualityMetrics.brightness?.toFixed(1) || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">对比度:</span>
                                <span className="text-slate-300">{imageQualityMetrics.contrast?.toFixed(1) || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">清晰度:</span>
                                <span className="text-slate-300">{imageQualityMetrics.sharpness?.toFixed(1) || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-400">噪声:</span>
                                <span className="text-slate-300">{imageQualityMetrics.noise?.toFixed(1) || 'N/A'}</span>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* 预处理推荐 */}
                        {preprocessingRecommendation && (
                          <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
                            <h4 className="text-green-300 font-medium mb-2">智能推荐</h4>
                            <div className="space-y-1 text-xs">
                              {preprocessingRecommendation.map((rec: any, index: number) => (
                                <div key={index} className="flex justify-between">
                                  <span className="text-slate-400">{rec.type}:</span>
                                  <span className="text-green-300">{rec.value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {/* 预处理状态 */}
                        {isPreprocessing && (
                          <div className="flex items-center space-x-2 text-orange-400">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span className="text-sm">正在应用预处理...</span>
                          </div>
                        )}
                        
                        {/* 处理前后对比按钮 */}
                        {processedImagePreview && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowImageComparison(!showImageComparison)}
                            className="w-full text-xs"
                          >
                            <Eye className="h-3 w-3 mr-1" />
                            {showImageComparison ? '隐藏对比' : '查看对比'}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* 检测状态显示 */}
              {isRealtimeActive && (
                <div className="mt-2 text-xs text-slate-400">
                  <div>检测间隔: {detectionInterval}秒</div>
                  <div>检测目标: {selectedTargets.filter(target => target != null).map(target => getTargetChineseName(target)).filter(name => name !== '').join(', ')}</div>
                  <div>置信度阈值: {(detectionConfidence * 100).toFixed(0)}%</div>
                  <div>合格确认: {requireQualifiedConfirmation ? '需要回车' : '自动继续'}</div>
                </div>
              )}
              
              {/* 调试信息 */}
              {isCameraOn && (
                <div className="mt-2 text-xs text-slate-500">
                  <div>摄像头状态: {isCameraOn ? '已开启' : '已关闭'}</div>
                  <div>视频尺寸: {videoInfo.width} x {videoInfo.height}</div>
                  <div>视频就绪: {videoInfo.readyState}</div>
                  <div>流状态: {videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).active ? '已连接' : '未连接'}</div>
                </div>
              )}
            </div>

            {/* 图片压缩配置 */}
            <div className="mb-6 p-4 bg-slate-800/50 rounded-lg border border-slate-600">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center">
                  <Settings className="h-4 w-4 mr-2" />
                  图片压缩配置
                </h3>
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={compressionEnabled}
                      onChange={(e) => setCompressionEnabled(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-300">启用压缩</span>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCompressionSettings(!showCompressionSettings)}
                    className="text-xs px-3 py-1"
                  >
                    {showCompressionSettings ? '收起' : '展开'}设置
                  </Button>
                </div>
              </div>
              
              {compressionEnabled && (
                <div className="text-sm text-slate-400 mb-3">
                  💡 启用压缩可以减小图片大小，提高处理速度，但可能会影响识别精度
                </div>
              )}
              
              {/* 压缩设置详情 */}
              {compressionEnabled && showCompressionSettings && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">最大宽度</label>
                      <input
                        type="number"
                        value={compressionConfig.maxWidth}
                        onChange={(e) => setCompressionConfig(prev => ({ ...prev, maxWidth: parseInt(e.target.value) }))}
                        className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm"
                        min="100"
                        max="2000"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">最大高度</label>
                      <input
                        type="number"
                        value={compressionConfig.maxHeight}
                        onChange={(e) => setCompressionConfig(prev => ({ ...prev, maxHeight: parseInt(e.target.value) }))}
                        className="w-full px-2 py-1 bg-slate-700 border border-slate-600 rounded text-slate-100 text-sm"
                        min="100"
                        max="2000"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs text-slate-400">压缩质量</label>
                      <span className="text-xs text-slate-400">{Math.round(compressionConfig.quality * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.1"
                      value={compressionConfig.quality}
                      onChange={(e) => setCompressionConfig(prev => ({ ...prev, quality: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                  </div>
                  
                  <div className="text-xs text-slate-500">
                    当前配置: {compressionConfig.maxWidth}x{compressionConfig.maxHeight}, 质量{Math.round(compressionConfig.quality * 100)}%
                  </div>
                </div>
              )}
            </div>

            {/* 图片上传按钮 */}
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
              
              <Button
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center gap-2"
                variant="outline"
              >
                <Upload className="h-4 w-4" />
                选择图片上传
              </Button>
              
              {imagePreview && (
                <div className="space-y-2">
                  {/* 图像对比显示 */}
                  {showImageComparison && processedImagePreview ? (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="text-center">
                        <div className="text-xs text-slate-400 mb-1">原始图像</div>
                        <img 
                          src={imagePreview} 
                          alt="原始图像" 
                          className="max-h-32 mx-auto rounded-lg border border-slate-600"
                        />
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-slate-400 mb-1">预处理后</div>
                        <img 
                          src={processedImagePreview} 
                          alt="预处理后图像" 
                          className="max-h-32 mx-auto rounded-lg border border-blue-500"
                        />
                      </div>
                    </div>
                  ) : (
                    <img 
                      src={imagePreview} 
                      alt="预览" 
                      className="max-h-64 mx-auto rounded-lg border border-slate-600"
                    />
                  )}
                  <p className="text-sm text-slate-400 text-center">
                    点击上方按钮更换图片
                  </p>
                </div>
              )}
            </div>

            {/* 移除OCR模型选择器，使用默认OCR模型（优先 RapidOCR） */}

            {/* AI分析和关键词设置 */}
            <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-600">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">关键词分析设置</Label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableKeywordAnalysis}
                      onChange={(e) => setEnableKeywordAnalysis(e.target.checked)}
                      className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-300">启用关键词分析</span>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                    className="text-xs px-2 py-1"
                  >
                    保存模板
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowKeywordSettings(!showKeywordSettings)}
                    className="text-xs px-3 py-1"
                  >
                    {showKeywordSettings ? '收起' : '展开'}设置
                  </Button>
                </div>
              </div>

              {/* 保存模板输入框 */}
              <TemplateSaveInput
                isVisible={showSaveTemplate}
                templateName={templateName}
                onTemplateNameChange={setTemplateName}
                onSave={saveTemplate}
                onCancel={() => setShowSaveTemplate(false)}
              />

              {/* 模板列表 */}
              {showKeywordSettings && (
                <TemplateList
                  templates={templates}
                  onLoadTemplate={loadTemplate}
                  onDeleteTemplate={deleteTemplate}
                />
              )}

              {showKeywordSettings && enableKeywordAnalysis && (
                <div className="space-y-3">
                  {/* 关键词设置 */}
                  <div className="space-y-2">
                    <Label htmlFor="keywords">关键词设置 (用逗号分隔)</Label>
                    <textarea
                      id="keywords"
                      value={keywords}
                      onChange={(e) => {
                        setKeywords(e.target.value);
                        updateKeywordConfigs(e.target.value);
                      }}
                      placeholder="例如: 产品名称,型号,规格 (用逗号分隔多个关键词)"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                      rows={2}
                    />
                  </div>

                  {/* 匹配模式 */}
                  <div className="space-y-2">
                    <Label>匹配模式</Label>
                    <div className="flex space-x-4">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="matchMode"
                          value="contains"
                          checked={keywordMatchMode === 'contains'}
                          onChange={(e) => setKeywordMatchMode(e.target.value as 'contains' | 'exact')}
                          className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-300">包含匹配</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="radio"
                          name="matchMode"
                          value="exact"
                          checked={keywordMatchMode === 'exact'}
                          onChange={(e) => setKeywordMatchMode(e.target.value as 'contains' | 'exact')}
                          className="w-4 h-4 text-blue-600 bg-slate-700 border-slate-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-slate-300">完全匹配</span>
                      </label>
                    </div>
                  </div>

                  {/* 每个关键词的置信度设置 */}
                  {keywordConfigs.length > 0 && (
                    <div className="space-y-2">
                      <Label>关键词高级设置</Label>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {keywordConfigs.map((config, index) => {
                          const keywordType = config.type ?? 'positive';
                          const requiredCount = config.requiredCount ?? 1;
                          return (
                            <div key={index} className="p-3 bg-slate-700/50 rounded-lg border border-slate-600/50">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-slate-200">
                                  {config.text}
                                </span>
                                <div className="flex items-center gap-2">
                                  {keywordType === 'negative' && (
                                    <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-300 rounded">
                                      排除清单
                                    </span>
                                  )}
                                  {keywordType === 'positive' && requiredCount > 1 && (
                                    <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                                      需{requiredCount}次
                                    </span>
                                  )}
                                  <span className="text-xs text-slate-400">
                                    置信度: {config.confidence.toFixed(2)}
                                  </span>
                                </div>
                              </div>
                              
                              {/* 关键词类型选择 */}
                              <div className="mb-2 flex items-center gap-2">
                                <Label className="text-xs w-20">类型</Label>
                                <Select 
                                  value={keywordType} 
                                  onValueChange={(v) => updateKeywordType(config.text, v as 'positive' | 'negative')}
                                >
                                  <SelectTrigger className="flex-1 h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="positive">正面（必须出现）</SelectItem>
                                    <SelectItem value="negative">排除清单（出现即存疑）</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {/* 次数要求（仅正面关键词显示） */}
                              {keywordType === 'positive' && (
                                <div className="mb-2 flex items-center gap-2">
                                  <Label className="text-xs w-20">需要次数</Label>
                                  <input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={requiredCount}
                                    onChange={(e) => updateKeywordRequiredCount(config.text, parseInt(e.target.value) || 1)}
                                    className="flex-1 h-8 px-2 bg-slate-800 border border-slate-600 rounded text-slate-100 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                                  />
                                </div>
                              )}

                              {/* 置信度滑块 */}
                              <div className="mb-2">
                                <Label className="text-xs mb-1 block">置信度阈值</Label>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.1"
                                  value={config.confidence}
                                  onChange={(e) => updateKeywordConfidence(config.text, parseFloat(e.target.value))}
                                  className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider"
                                />
                                <div className="flex justify-between text-xs text-slate-400 mt-1">
                                  <span>0.0</span>
                                  <span>0.5</span>
                                  <span>1.0</span>
                                </div>
                              </div>

                              {/* 期望方向 */}
                              <div className="flex items-center gap-2">
                                <Label className="text-xs w-20">期望方向</Label>
                                <Select 
                                  value={config.expectedOrientation === undefined ? 'none' : String(config.expectedOrientation)} 
                                  onValueChange={(v) => {
                                    if (v === 'none') {
                                      updateKeywordExpectedOrientation(config.text, undefined);
                                    } else {
                                      updateKeywordExpectedOrientation(config.text, Number(v) as 0 | 90 | 180 | 270);
                                    }
                                  }}
                                >
                                  <SelectTrigger className="flex-1 h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">关闭（不检查方向）</SelectItem>
                                    <SelectItem value="0">→ 右</SelectItem>
                                    <SelectItem value="90">↓ 下</SelectItem>
                                    <SelectItem value="180">← 左</SelectItem>
                                    <SelectItem value="270">↑ 上</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* 全局最小置信度 */}
                  <div className="space-y-2">
                    <Label htmlFor="minConfidence">
                      全局最小置信度: {minConfidence.toFixed(2)}
                    </Label>
                    <input
                      id="minConfidence"
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      value={minConfidence}
                      onChange={(e) => setMinConfidence(parseFloat(e.target.value))}
                      className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer slider"
                    />
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>0.0</span>
                      <span>0.5</span>
                      <span>1.0</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 操作按钮 */}
            <div className="grid grid-cols-2 gap-2">
              <Button 
                onClick={performOCRTest}
                disabled={!selectedImage || isProcessing}
                className="flex items-center gap-2"
              >
                {isProcessing ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
                {isProcessing ? '识别中...' : '开始识别'}
              </Button>
              
              <Button 
                variant="outline" 
                onClick={clearResults}
                disabled={!selectedImage}
              >
                清空
              </Button>
            </div>

            {/* 图片信息 */}
            {selectedImage && (
              <div className="bg-slate-800/50 rounded-lg p-3 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400">文件名:</span>
                  <span className="text-slate-300">{selectedImage.name}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400">文件大小:</span>
                  <span className="text-slate-300">{(selectedImage.size / 1024).toFixed(1)} KB</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">文件类型:</span>
                  <span className="text-slate-300">{selectedImage.type}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>


        {/* 测试历史 */}
        {testHistory.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">测试历史</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {testHistory.map((result, index) => (
                  <div key={index} className="p-2 rounded bg-slate-800/50 border border-slate-700/50">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">
                        {new Date().toLocaleTimeString()}
                      </span>
                      <div className="flex items-center gap-1">
                        {result.success ? (
                          <CheckCircle className="h-3 w-3 text-green-400" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-400" />
                        )}
                        <span className={result.success ? 'text-green-400' : 'text-red-400'}>
                          {result.success ? '成功' : '失败'}
                        </span>
                      </div>
                    </div>
                    <div className="text-xs text-slate-300 mt-1">
                      {result.success ? `${result.text_count}个文字` : result.error}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* 右侧：识别结果 */}
      <div className="flex flex-col gap-4">
        {/* OCR防呆检测结果 - 显示在顶部 */}
        {(workflowState === 'capturing' || workflowState === 'processing' || workflowState === 'waiting_for_approval' || workflowState === 'completed' || ocrResult) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-400" />
                OCR防呆检测结果
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* OCR结果和二维码检测结果 - 合并为两列布局 */}
                <div className="grid grid-cols-2 gap-2">
                  {/* OCR结果 */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <FileText className="h-3 w-3 text-blue-400" />
                      <span className="text-xs font-medium text-blue-300">OCR检测结果</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                      <div className="flex items-center gap-1.5">
                        {workflowState === 'processing' || workflowState === 'capturing' ? (
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400"></div>
                        ) : matchStatus === 'qualified' ? (
                          <CheckCircle className="h-3 w-3 text-green-400" />
                        ) : matchStatus === 'unqualified' ? (
                          <AlertCircle className="h-3 w-3 text-yellow-400" />
                        ) : (
                          <AlertCircle className="h-3 w-3 text-amber-400" />
                        )}
                        <span className="text-xs font-medium">OCR状态</span>
                      </div>
                      <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        workflowState === 'processing' || workflowState === 'capturing' ? 'bg-blue-900/50 text-blue-300' :
                        matchStatus === 'qualified' ? 'bg-green-900/50 text-green-300' :
                        matchStatus === 'unqualified' ? 'bg-yellow-900/50 text-yellow-300' :
                        'bg-amber-900/50 text-amber-300'
                      }`}>
                        {workflowState === 'processing' || workflowState === 'capturing' ? '检测中...' :
                         matchStatus === 'qualified' ? '合格' : 
                         matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                      </div>
                    </div>
                  </div>

                  {/* 二维码检测结果 */}
                  {enableBarcodeDetection && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <div className="h-3 w-3 bg-green-400 rounded flex items-center justify-center">
                          <span className="text-xs text-slate-900 font-bold">码</span>
                        </div>
                        <span className="text-xs font-medium text-green-300">二维码检测结果</span>
                        <div className="ml-2 px-1.5 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                          微信
                        </div>
                      </div>
                      {ocrResult?.barcode_analysis && workflowState !== 'capturing' && workflowState !== 'processing' ? (
                        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                          <div className="flex items-center gap-1.5">
                            {ocrResult.barcode_analysis.overall_match ? (
                              <CheckCircle className="h-3 w-3 text-green-400" />
                            ) : (
                              <XCircle className="h-3 w-3 text-red-400" />
                            )}
                            <span className="text-xs font-medium">二维码状态</span>
                          </div>
                          <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            ocrResult.barcode_analysis.overall_match ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
                          }`}>
                            {ocrResult.barcode_analysis.overall_match ? '合格' : '存疑'}
                          </div>
                        </div>
                      ) : workflowState === 'capturing' || workflowState === 'processing' ? (
                        <div className="flex items-center justify-center p-2 rounded-lg bg-slate-800/50">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-400 mr-1"></div>
                          <span className="text-xs text-green-300">检测中...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center p-2 rounded-lg bg-slate-800/50">
                          <span className="text-xs text-slate-400">等待检测...</span>
                        </div>
                      )}
                      {ocrResult?.barcode_analysis?.detection_summary && workflowState !== 'capturing' && workflowState !== 'processing' && (
                        <div className="text-xs text-slate-400 px-2">
                          💡 {ocrResult.barcode_analysis.detection_summary}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 工作流状态显示 */}
        {isRealtimeActive && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CameraOff className="h-5 w-5" />
                智能工作流状态
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* 检测目标和工作流状态 - 合并为一行 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-600">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>
                        <span className="text-xs font-medium text-slate-200">检测目标</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {selectedTargets.length} 个
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400 truncate">
                      {selectedTargets.filter(target => target != null).map(target => getTargetChineseName(target)).filter(name => name !== '').join(', ')}
                    </div>
                  </div>
                  
                  <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-600">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${
                          workflowState === 'idle' ? 'bg-gray-500' :
                          workflowState === 'capturing' ? 'bg-yellow-500' :
                          workflowState === 'processing' ? 'bg-blue-500' :
                          workflowState === 'waiting_for_approval' ? 'bg-yellow-500' :
                          workflowState === 'completed' ? 'bg-green-500' : 'bg-gray-500'
                        }`}></div>
                        <span className="text-xs font-medium text-slate-200">工作流状态</span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {workflowState === 'idle' ? '等待检测' :
                         workflowState === 'capturing' ? '抓拍中...' :
                         workflowState === 'processing' ? '识别中...' :
                         workflowState === 'waiting_for_approval' ? '等待确认' :
                         workflowState === 'completed' ? '已完成' : '未知'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      阈值: {(detectionConfidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>

                {/* 等待回车键提示 */}
                {isWaitingForSpace && (
                  <div className="p-2 bg-yellow-500/20 rounded-lg border border-yellow-500/50">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-yellow-200">需要确认</span>
                      </div>
                      <span className="text-xs text-yellow-300">按回车键继续</span>
                    </div>
                    <div className="mt-1 text-xs text-yellow-400">
                      检测结果需要确认，请按回车键确认后继续下一个循环
                    </div>
                    <div className="mt-1">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="text-xs text-yellow-300 border-yellow-600 hover:bg-yellow-800 h-6 px-2"
                        onClick={() => {
                          setIsWaitingForSpace(false);
                          // 修复：清空检测到的元素状态，重置为初始状态（与回车键保持一致）
                          setDetectedElements([]);
                          detectedElementsRef.current = []; // 同步更新ref
                          setElementDetectionStartTime(null);
                          historyDetectionsRef.current.clear(); // 清空历史检测结果
                          setFinalResult('none');
                          setWorkflowState('idle');
                          setMatchStatus('none');
                          setWorkflowResult(null);
                        }}
                      >
                        手动重置工作流
                      </Button>
                    </div>
                  </div>
                )}

                {/* 关键词分析结果和二维码检测结果 - 合并为一行 */}
                <div className="grid grid-cols-2 gap-2">
                  {/* 关键词分析结果 */}
                  {ocrResult && ocrResult.success && ocrResult.ai_analysis && (
                    <div className="p-2 bg-blue-900/20 border border-blue-500/50 rounded-lg">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>
                        <span className="text-xs font-medium text-blue-200">关键词分析</span>
                      </div>
                    <div className="space-y-2">
                      {/* 过滤后的文本 */}
                      <div>
                        <Label className="text-xs text-blue-300">过滤后文本:</Label>
                        <div className="p-1.5 bg-slate-800/50 rounded border border-slate-700/50 mt-1">
                          <p className={`text-xs whitespace-pre-wrap ${
                            !ocrResult.ai_analysis?.filtered_text || ocrResult.ai_analysis.filtered_text.trim() === '' 
                              ? 'text-red-400' 
                              : 'text-slate-200'
                          }`}>
                            {ocrResult.ai_analysis?.filtered_text || '无匹配内容'}
                          </p>
                        </div>
                      </div>

                      {/* 关键词匹配状态 */}
                      {keywordConfigs.length > 0 && (
                        <div>
                          <Label className="text-xs text-blue-300">关键词匹配状态:</Label>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {keywordConfigs.map((config, index) => {
                              const matchDetail = ocrResult.ai_analysis?.keyword_match_details?.find(
                                detail => detail.keyword === config.text
                              );
                              const keywordType = config.type ?? 'positive';
                              const isMatched = matchDetail?.overallMatched ?? false;
                              
                              // 对于排除清单关键词，显示特殊样式
                              const isNegative = keywordType === 'negative';
                              const actualCount = matchDetail?.actualCount ?? 0;
                              const requiredCount = matchDetail?.requiredCount ?? (config.requiredCount ?? 1);
                              
                              return (
                                <div 
                                  key={index}
                                  className={`px-2 py-1 text-xs rounded border ${
                                    isNegative && actualCount > 0
                                      ? 'bg-red-700/50 text-red-200 border-red-600'  // 排除清单关键词被检测到
                                      : isNegative
                                      ? 'bg-orange-600/30 text-orange-200 border-orange-500/50'  // 排除清单关键词未检测到
                                      : isMatched
                                      ? 'bg-green-600/30 text-green-200 border-green-500/50' 
                                      : 'bg-red-600/30 text-red-200 border-red-500/50'
                                  }`}
                                >
                                  <div className="flex items-center gap-1">
                                    {/* 类型标识 */}
                                    {isNegative && (
                                      <span className="text-red-400 font-bold">🚫</span>
                                    )}
                                    {/* 始终基于期望方向渲染箭头，避免受匹配详情影响 */}
                                    <span className="inline-flex items-center gap-1">
                                      {config.expectedOrientation !== undefined && config.expectedOrientation !== null ? (
                                        (() => {
                                          const expected = config.expectedOrientation;
                                          if (expected === 0) return '→';
                                          if (expected === 90) return '↓';
                                          if (expected === 180) return '←';
                                          if (expected === 270) return '↑';
                                          return '';
                                        })()
                                      ) : ''} {config.text}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {/* 文本匹配 */}
                                      <span className={matchDetail?.textMatched ? 'text-green-300' : 'text-red-300'}>
                                        {matchDetail?.textMatched ? '✓' : '✗'}
                                      </span>
                                      {/* 方向匹配 - 用箭头表示 */}
                                      {config.expectedOrientation !== undefined && config.expectedOrientation !== null && !isNegative && (
                                        <span 
                                          className={matchDetail?.orientationMatched ? 'text-green-300' : 'text-red-300'}
                                          title={`期望方向: ${config.expectedOrientation}°${matchDetail?.detectedOrientation !== undefined ? `, 检测方向: ${matchDetail.detectedOrientation}°` : ''}`}
                                        >
                                          {(() => {
                                            const expected = config.expectedOrientation;
                                            if (expected === 0) return '→'; // 右箭头
                                            if (expected === 90) return '↓'; // 下箭头
                                            if (expected === 180) return '←'; // 左箭头
                                            if (expected === 270) return '↑'; // 上箭头
                                            return '?';
                                          })()}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  {/* 次数显示（仅正面关键词且有次数要求时显示） */}
                                  {!isNegative && requiredCount > 1 && (
                                    <div className="text-xs mt-0.5">
                                      {actualCount >= requiredCount ? (
                                        <span className="text-green-300">✓ {actualCount}/{requiredCount}次</span>
                                      ) : (
                                        <span className="text-red-300">✗ {actualCount}/{requiredCount}次</span>
                                      )}
                                    </div>
                                  )}
                                  {/* 排除清单关键词次数显示 */}
                                  {isNegative && actualCount > 0 && (
                                    <div className="text-xs mt-0.5 text-red-300 font-bold">
                                      检测到{actualCount}次！
                                    </div>
                                  )}
                                  {/* 方向信息 - 简化显示 */}
                                  {config.expectedOrientation !== undefined && config.expectedOrientation !== null && matchDetail && matchDetail.detectedOrientation !== undefined && (
                                    <div className="text-xs opacity-75 mt-1">
                                      检测: {matchDetail.detectedOrientation}°
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* 平均置信度 */}
                      <div className="flex items-center justify-between">
                        <Label className="text-xs text-blue-300">平均置信度:</Label>
                        <div className="flex items-center gap-1">
                          {getConfidenceIcon(ocrResult.ai_analysis.confidence_score)}
                          <span className={`text-xs font-medium ${getConfidenceColor(ocrResult.ai_analysis.confidence_score)}`}>
                            {(ocrResult.ai_analysis.confidence_score * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  )}

                  {/* 二维码检测结果 - 支持融合模式和单独OCR模式 */}
                  {ocrResult?.barcode_analysis?.enabled && (
                    <div className="p-2 bg-green-900/20 border border-green-500/50 rounded-lg">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                        <span className="text-xs font-medium text-green-200">二维码检测</span>
                        <div className="ml-2 px-1.5 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                          微信检测器
                        </div>
                      </div>
                      <QRCodeDetectionResult barcodeAnalysis={ocrResult.barcode_analysis} />
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                识别结果
              </div>
              <div className="flex items-center gap-2">
                {detectionHistory.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowHistoryDetails(!showHistoryDetails)}
                    className="text-xs"
                  >
                    {showHistoryDetails ? '隐藏历史' : `查看历史 (${detectionHistory.length})`}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/ocr-results')}
                  className="text-xs"
                >
                  查看所有结果
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // 重新加载历史记录
                    const loadOCRHistory = async () => {
                      try {
                        const response = await fetch('/api/results/');
                        if (response.ok) {
                          const data = await response.json();
                          const ocrResults = data.filter((result: any) => 
                            result.detection_type === 'ocr_inspection' || 
                            result.detection_type === 'ocr_fusion_inspection'
                          );
                          
                          const historyRecords = ocrResults.slice(0, 10).map((result: any) => ({
                            id: result.id,
                            timestamp: new Date(result.timestamp),
                            ocrResult: result.ocrResult || {
                              success: true,
                              full_text: result.reason || '',
                              detailed_results: [],
                              text_count: 0,
                              matchStatus: result.overallQuality === '合格' ? 'qualified' : 'unqualified',
                              model_used: 'backend',
                              error: null
                            },
                            aiResult: result.llmResult ? {
                              overallQuality: result.llmResult.overallQuality,
                              score: result.llmResult.score,
                              reason: result.llmResult.reason,
                              reasonKeywords: result.llmResult.reasonKeywords,
                              defects: result.llmResult.defects || []
                            } : null,
                            matchStatus: result.ocrResult?.matchStatus || (result.overallQuality === '合格' ? 'qualified' : 'unqualified'),
                            imageBase64: result.image
                          }));
                          
                          setDetectionHistory(historyRecords);
                          console.log('🔄 已刷新OCR历史记录:', historyRecords.length, '条');
                        }
                      } catch (error) {
                        console.error('❌ 刷新OCR历史记录失败:', error);
                      }
                    };
                    loadOCRHistory();
                  }}
                  className="text-xs"
                >
                  刷新历史
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* 历史记录详情 */}
            {showHistoryDetails && detectionHistory.length > 0 && (
              <div className="mb-4 space-y-2 max-h-60 overflow-y-auto">
                <div className="text-sm font-medium text-slate-300 mb-2">历史检测记录</div>
                {(detectionHistory as ExtendedHistoryItem[]).map((record) => (
                  <div key={record.id} className="bg-slate-800/50 rounded-lg border border-slate-600">
                    <div 
                      className="p-3 cursor-pointer hover:bg-slate-700/50 transition-colors"
                      onClick={() => setExpandedHistoryId(expandedHistoryId === record.id ? null : record.id)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${
                            record.matchStatus === 'qualified' ? 'bg-green-400' :
                            record.matchStatus === 'unqualified' ? 'bg-yellow-400' : 'bg-amber-400'
                          }`}></div>
                          <span className="text-xs text-slate-400">
                            {record.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-xs px-2 py-1 rounded-full ${
                            record.matchStatus === 'qualified' ? 'bg-green-900/50 text-green-300' :
                            record.matchStatus === 'unqualified' ? 'bg-yellow-900/50 text-yellow-300' :
                            'bg-amber-900/50 text-amber-300'
                          }`}>
                            {record.matchStatus === 'qualified' ? '合格' :
                             record.matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {expandedHistoryId === record.id ? '收起' : '展开详情'}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-300">
                        {record.matchStatus === 'qualified' ? '合格' : 
                         record.matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                        {record.aiResult && ` | LLM: ${record.aiResult.overallQuality}`}
                      </div>
                    </div>
                    
                    {/* 展开的详情 */}
                    {expandedHistoryId === record.id && (
                      <div className="px-3 pb-3 border-t border-slate-600/50 pt-3 space-y-3">
                        {/* 基本信息 */}
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-slate-300 border-b border-slate-500/30 pb-1">检测基本信息</div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="text-slate-400">检测时间:</div>
                            <div className="text-slate-300">{record.timestamp.toLocaleString()}</div>
                            <div className="text-slate-400">最终结果:</div>
                            <div className={`font-medium ${
                              record.matchStatus === 'qualified' ? 'text-green-400' : 
                              record.matchStatus === 'unqualified' ? 'text-yellow-400' : 'text-yellow-400'
                            }`}>
                              {record.matchStatus === 'qualified' ? '合格' : 
                               record.matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                            </div>
                            <div className="text-slate-400">记录ID:</div>
                            <div className="text-slate-300 font-mono text-xs">{record.id}</div>
                          </div>
                        </div>

                        {/* OCR详细结果 */}
                        {record.ocrResult ? (
                          <div className="space-y-3">
                            <div className="text-sm font-medium text-blue-300 border-b border-blue-500/30 pb-1">OCR检测详情</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="text-slate-400">识别状态:</div>
                              <div className={`font-medium ${record.ocrResult.success ? 'text-green-400' : 'text-red-400'}`}>
                                {record.ocrResult.success ? '成功' : '失败'}
                              </div>
                              <div className="text-slate-400">最终结果:</div>
                              <div className={`font-medium ${
                                record.matchStatus === 'qualified' ? 'text-green-400' : 
                                record.matchStatus === 'unqualified' ? 'text-red-400' : 'text-yellow-400'
                              }`}>
                                {record.matchStatus === 'qualified' ? '合格' : 
                                 record.matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                              </div>
                              {record.ocrResult.text_count && (
                                <>
                                  <div className="text-slate-400">文字数量:</div>
                                  <div className="text-slate-300">{record.ocrResult.text_count} 个</div>
                                </>
                              )}
                              {record.ocrResult.model_used && (
                                <>
                                  <div className="text-slate-400">使用模型:</div>
                                  <div className="text-slate-300">{record.ocrResult.model_used}</div>
                                </>
                              )}
                            </div>
                            {record.ocrResult.full_text && (
                              <div className="space-y-1">
                                <div className="text-xs text-slate-400">识别文字:</div>
                                <div className="text-xs text-slate-200 bg-slate-700/50 p-2 rounded border border-slate-600/50 max-h-20 overflow-y-auto">
                                  {record.ocrResult.full_text}
                                </div>
                              </div>
                            )}
                            {record.ocrResult.detailed_results && record.ocrResult.detailed_results.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-xs text-slate-400">详细识别结果:</div>
                                <div className="space-y-1 max-h-24 overflow-y-auto">
                                  {record.ocrResult.detailed_results.slice(0, 5).map((item: any, itemIdx: number) => (
                                    <div key={itemIdx} className="text-xs text-slate-300 bg-slate-700/30 p-1 rounded">
                                      <span className="text-slate-400">文字:</span> {item.text} 
                                      <span className="text-slate-400 ml-2">置信度:</span> {(item.confidence * 100).toFixed(1)}%
                                    </div>
                                  ))}
                                  {record.ocrResult.detailed_results.length > 5 && (
                                    <div className="text-xs text-slate-500">...还有{record.ocrResult.detailed_results.length - 5}个结果</div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-blue-300 border-b border-blue-500/30 pb-1">OCR检测详情</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="text-slate-400">匹配状态:</div>
                              <div className={`font-medium ${
                                record.matchStatus === 'qualified' ? 'text-green-400' : 
                                record.matchStatus === 'unqualified' ? 'text-red-400' : 'text-yellow-400'
                              }`}>
                                {record.matchStatus === 'qualified' ? '合格' : 
                                 record.matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                              </div>
                            </div>
                            {keywordConfigs.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-xs text-slate-400">关键词匹配状态:</div>
                                <div className="flex flex-wrap gap-1">
                                  {keywordConfigs.map((config, index) => {
                                    const isMatched = record.ocrResult?.ai_analysis?.keywords_found?.includes(config.text) || false;
                                    return (
                                      <span 
                                        key={index}
                                        className={`px-2 py-1 text-xs rounded border ${
                                          isMatched 
                                            ? 'bg-green-600/30 text-green-200 border-green-500/50' 
                                            : 'bg-red-600/30 text-red-200 border-red-500/50'
                                        }`}
                                      >
                                        {config.text}
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* 二维码检测结果 - 所有模式 */}
                        {record.barcodeAnalysis?.enabled && (
                          <div className="space-y-3">
                            <div className="text-sm font-medium text-green-300 border-b border-green-500/30 pb-1">二维码检测详情</div>
                            <QRCodeDetectionResult barcodeAnalysis={record.barcodeAnalysis} />
                          </div>
                        )}
                        
                        {/* LLM详细结果 */}
                        {record.aiResult ? (
                          <div className="space-y-3">
                            <div className="text-sm font-medium text-purple-300 border-b border-purple-500/30 pb-1">LLM分析详情</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="text-slate-400">分析结果:</div>
                              <div className={`font-medium ${
                                record.aiResult.overallQuality === '合格' ? 'text-green-400' : 
                                record.aiResult.overallQuality === '存疑' ? 'text-red-400' : 'text-yellow-400'
                              }`}>
                                {record.aiResult.overallQuality}
                              </div>
                              <div className="text-slate-400">评分:</div>
                              <div className="text-slate-300 font-medium">{record.aiResult.score} 分</div>
                              {(record.aiResult as any)?.reasonKeywords && (
                                <>
                                  <div className="text-slate-400">关键词:</div>
                                  <div className="text-slate-300">
                                    {Array.isArray((record.aiResult as any).reasonKeywords) 
                                      ? (record.aiResult as any).reasonKeywords.join(', ')
                                      : String((record.aiResult as any).reasonKeywords)}
                                  </div>
                                </>
                              )}
                            </div>
                            {record.aiResult.reason && (
                              <div className="space-y-1">
                                <div className="text-xs text-slate-400">分析原因:</div>
                                <div className="text-xs text-slate-200 bg-slate-700/50 p-2 rounded border border-slate-600/50">
                                  {record.aiResult.reason}
                                </div>
                              </div>
                            )}
                            {record.aiResult.defects && record.aiResult.defects.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-xs text-slate-400">检测到的缺陷:</div>
                                <div className="space-y-1">
                                  {record.aiResult.defects.map((defect: any, idx: number) => (
                                    <div key={idx} className="text-xs text-slate-300 bg-red-900/20 p-2 rounded border border-red-500/30">
                                      <div className="font-medium text-red-300">{defect.type}</div>
                                      <div className="text-slate-400">严重程度: {defect.severity}</div>
                                      <div className="text-slate-300">{defect.description}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="text-sm font-medium text-purple-300 border-b border-purple-500/30 pb-1">LLM分析详情</div>
                            <div className="text-xs text-slate-400">暂无LLM分析详情</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {ocrResult ? (
              <div className="space-y-4">
                {/* 整体结果状态 */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    {ocrResult.success ? (
                      <CheckCircle className="h-5 w-5 text-green-400" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-400" />
                    )}
                    <span className={ocrResult.success ? 'text-green-400' : 'text-red-400'}>
                      {ocrResult.success ? '识别成功' : '识别失败'}
                    </span>
                  </div>
                  {ocrResult.success && (
                    <div className="text-sm text-slate-400 space-y-1">
                      <div>{ocrResult.text_count} 个文字</div>
                      {ocrResult.model_used && (
                        <div>使用模型: {ocrResult.model_used}</div>
                      )}
                    </div>
                  )}
                </div>




                {/* 完整文本 */}
                {ocrResult.success && ocrResult.full_text && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">完整文本:</Label>
                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">
                        {ocrResult.full_text}
                      </p>
                    </div>
                  </div>
                )}

                {/* 文字方向检测结果（全局） - 已不使用全局期望方向，仅展示检测方向 */}
                {ocrResult.success && (ocrResult.detected_orientation !== undefined) && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">文字方向检测:</Label>
                    <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                      <div className="space-y-2">
                        {/* 检测到的方向 */}
                        {ocrResult.detected_orientation !== undefined && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-slate-300">检测方向:</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-blue-400">
                                {ocrResult.detected_orientation}°
                              </span>
                               {ocrResult.detected_orientation_degrees !== undefined && ocrResult.detected_orientation_degrees !== null && (
                                 <span className="text-xs text-slate-500">
                                   (实际: {ocrResult.detected_orientation_degrees.toFixed(1)}°)
                                 </span>
                               )}
                            </div>
                          </div>
                        )}
                        {/* 说明 */}
                        <div className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-600/50">
                          💡 关键词可单独配置方向要求，匹配状态见下方"关键词匹配状态"
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 详细结果 */}
                {ocrResult.success && ocrResult.detailed_results.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">详细结果:</Label>
                    <div className="space-y-2 max-h-60 overflow-y-auto">
                      {ocrResult.detailed_results.map((item, index) => (
                        <div key={index} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-slate-300">
                              {index + 1}. {item.text}
                            </span>
                            <div className="flex items-center gap-2">
                              {getConfidenceIcon(item.confidence)}
                              <span className={`text-sm font-medium ${getConfidenceColor(item.confidence)}`}>
                                {(item.confidence * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <div className="text-xs text-slate-400">
                            位置: {JSON.stringify(item.bbox)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 错误信息 */}
                {!ocrResult.success && ocrResult.error && (
                  <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-lg">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle className="h-4 w-4 text-red-400" />
                      <span className="text-sm font-medium text-red-400">错误信息:</span>
                    </div>
                    <p className="text-sm text-red-300">{ocrResult.error}</p>
                  </div>
                )}

                {/* 导出按钮 */}
                {ocrResult.success && (
                  <Button 
                    variant="outline" 
                    onClick={exportResults}
                    className="w-full"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    导出结果
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-500">
                <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无识别结果</p>
                <p className="text-xs mt-2">请上传图片并点击"开始识别"</p>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>


    </>
  );
};

export default OCRErrorPreventionScreen;

