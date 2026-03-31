import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/state/appStore';
import { useAIConfigStore } from '@/state/aiConfigStore';
import { useSafetyEquipmentStore } from '@/state/safetyEquipmentStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
// import { Progress } from '@/components/ui/Progress';
import toast from 'react-hot-toast';
import { v4 as uuidv4 } from 'uuid';
import {
  Camera,
  CameraOff,
  CircleDotDashed,
  Keyboard,
  Shield,
  User,
  Target,
  Play,
  Pause,
  FolderOpen,
  Trash2,
  Download,
  Repeat,
  Maximize,
  Minimize,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  QrCode,
  ScanText,
  Brain,
  Hash,
  Edit3,
  AlertTriangle,
  Check,
  X as XIcon
} from 'lucide-react';
import { Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { yoloDetectBackend, getYoloStatus, preloadYolo } from '@/lib/api';
import type { InspectionResult } from '@/types';
import type { YoloDetection } from '@/lib/yoloDetector';
import ModelUnavailableDialog from '@/components/ModelUnavailableDialog';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { getCameraDevices } from '@/lib/cameraUtils';
import type { CameraDevice } from '@/lib/cameraUtils';
import { StreamPlayer } from '@/lib/streamPlayer';
import { HLSPlayer } from '@/lib/hlsPlayer';
import { startHLSStream } from '@/api/streamApi';


// 验证选项类型定义
interface ValidationOptions {
  enableOCR: boolean;
  enableQRCode: boolean;
  enableLLM: boolean;
  enableSerialBinding: boolean;
}

// 验证结果类型定义
interface ValidationResult {
  type: 'ocr' | 'qrcode' | 'llm' | 'serial';
  status: 'success' | 'failed' | 'pending' | 'suspicious';
  data?: any;
  message?: string;
  confidence?: number;
}

// 关键词配置类型（参考OCR页面）
interface KeywordConfig {
  text: string;
  confidence: number;
  expectedOrientation?: 0 | 90 | 180 | 270;
  type?: 'positive' | 'negative';  // positive=必须出现，negative=排除清单
  requiredCount?: number;          // 需要出现的次数
}

// 二维码配置类型（参考OCR页面）
interface BarcodeConfig {
  id: string;
  expectedText: string;
  matchMode: 'contains' | 'exact';
  enabled: boolean;
}

// 扩展的检测结果类型，包含验证信息
interface ExtendedInspectionResult extends InspectionResult {
  validationResults?: ValidationResult[];
  serialNumber?: string;
  ocrText?: string;
  qrCodeData?: string;
  llmAnalysis?: string;
  isSuspicious?: boolean; // 是否存疑
  manuallyEdited?: boolean; // 是否手动编辑过
}

const KitMatchingScreenTest: React.FC = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamPlayerRef = useRef<StreamPlayer | null>(null); // 流媒体播放器实例（JPEG方案）
  const hlsPlayerRef = useRef<HLSPlayer | null>(null); // HLS播放器实例（高画质方案）
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isPpeActive, setIsPpeActive] = useState(false);
  const { currentModel, modelName, isLoading: modelLoading, refresh: refreshModel } = useCurrentModel();
  
  // 累加式检测状态：记录已检测到的类别（跨画面累加）
  const [accumulatedDetectedClasses, setAccumulatedDetectedClasses] = useState<Set<string>>(new Set());
  // ROI截图暂存：每次检测时保存ROI区域截图（每种类别只保存置信度最高的一张）
  const [roiSnapshots, setRoiSnapshots] = useState<Array<{ class: string; image: string; timestamp: number; confidence?: number }>>([]);
  // 检测模式：手动或自动
  const [detectionMode, setDetectionMode] = useState<'manual' | 'auto'>('auto');
  // 是否已完成检测（所有类别都已检测到）
  const [isComplete, setIsComplete] = useState(false);
  // 阈值设置分组展开状态
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['names', 'labels', 'others']));
  const isTriggeringInspectionRef = useRef(false); // 防止重复触发检测
  const lastInspectionTimeRef = useRef<number>(0); // 上次检测完成的时间戳
  const [isInCooldown, setIsInCooldown] = useState(false); // 是否在冷却时间内

  // ==================== 新增：验证选项状态 ====================
  const [validationOptions, setValidationOptions] = useState<ValidationOptions>({
    enableOCR: false,
    enableQRCode: false,
    enableLLM: false,
    enableSerialBinding: false
  });

  // 验证结果弹窗状态
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [currentValidationResult, setCurrentValidationResult] = useState<ExtendedInspectionResult | null>(null);
  const [validationInProgress, setValidationInProgress] = useState(false);

  // 手动编辑状态
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // ==================== 新增：OCR关键词和二维码标准配置 ====================
  const [keywordConfigs, setKeywordConfigs] = useState<KeywordConfig[]>([]);
  const [barcodeConfigs, setBarcodeConfigs] = useState<BarcodeConfig[]>([]);
  const [showKeywordSettings, setShowKeywordSettings] = useState(false);
  const [showBarcodeSettings, setShowBarcodeSettings] = useState(false);
  
  // 类别名称中文翻译
  const getClassChineseName = (className: string) => {
    const nameMap: { [key: string]: string } = {
      // 滤芯模型类别
      'filter': '滤芯组件',
      'name_MCF': '名称MCF',
      'nsplogo': 'NSP标志',
      'qrcode': '二维码',
      'service_label': '服务标签',
      'nameplate_label': '铭牌标签',
      'security_label': '防伪标签',
      'name_MNF': '名称MNF',
      'name_CPP': '名称CPP',
      'name_MPF': '名称MPF',
      'name_NF': '名称NF',
      'name_PCC': '名称PCC',
      'name_PCF': '名称PCF',
      'name_ZPC': '名称ZPC',
      'filter package': '滤芯包装',
      // 净水机模型类别
      'anti_counterfeit_label': '防伪标签',
      'water_efficiency_label': '水效标签',
      'barcode_label': '条码标签',
      // 人员
      'person': '人员'
    };
    return nameMap[className] || className;
  };

  // ==================== 新增：验证API调用函数 ====================

  // OCR识别（使用关键词配置）
  const performOCR = useCallback(async (imageData: string): Promise<ValidationResult> => {
    try {
      const response = await fetch('/api/ocr/recognize/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageData,
          keywords: keywordConfigs  // 发送关键词配置
        })
      });

      if (!response.ok) {
        throw new Error('OCR识别失败');
      }

      const data = await response.json();

      // 检查是否有负面关键词匹配
      const hasNegativeMatch = keywordConfigs
        .filter(k => k.type === 'negative')
        .some(k => data.text && data.text.includes(k.text));

      // 检查正面关键词是否都匹配
      const positiveKeywords = keywordConfigs.filter(k => !k.type || k.type === 'positive');
      const allPositiveMatched = positiveKeywords.length === 0 || positiveKeywords.every(k =>
        data.text && data.text.includes(k.text)
      );

      let status: 'success' | 'suspicious' | 'failed' = 'success';
      let message = data.text || '';

      if (hasNegativeMatch) {
        status = 'suspicious';
        message = `⚠️ 检测到排除关键词！识别文本: ${data.text}`;
      } else if (!allPositiveMatched) {
        status = 'suspicious';
        message = `⚠️ 未匹配所有必需关键词！识别文本: ${data.text}`;
      } else if (data.confidence < 0.8) {
        status = 'suspicious';
        message = `⚠️ 置信度较低 (${(data.confidence * 100).toFixed(1)}%)！识别文本: ${data.text}`;
      }

      return {
        type: 'ocr',
        status,
        data: data.text,
        message,
        confidence: data.confidence
      };
    } catch (error) {
      return {
        type: 'ocr',
        status: 'failed',
        message: `OCR识别失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }, [keywordConfigs]);

  // 二维码识别（使用二维码配置）
  const performQRCodeScan = useCallback(async (imageData: string): Promise<ValidationResult> => {
    try {
      const response = await fetch('/api/qrcode/scan/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageData,
          expectedBarcodes: barcodeConfigs.filter(b => b.enabled)  // 发送期望的二维码配置
        })
      });

      if (!response.ok) {
        throw new Error('二维码识别失败');
      }

      const data = await response.json();

      if (!data.found) {
        return {
          type: 'qrcode',
          status: 'failed',
          data: null,
          message: '未识别到二维码'
        };
      }

      // 检查是否匹配期望的二维码
      const enabledConfigs = barcodeConfigs.filter(b => b.enabled);
      if (enabledConfigs.length === 0) {
        // 没有配置期望值，只要识别到就算成功
        return {
          type: 'qrcode',
          status: 'success',
          data: data.content,
          message: `识别到二维码: ${data.content}`
        };
      }

      // 检查是否匹配任一期望值
      const matched = enabledConfigs.some(config => {
        if (config.matchMode === 'exact') {
          return data.content === config.expectedText;
        } else {
          return data.content.includes(config.expectedText);
        }
      });

      return {
        type: 'qrcode',
        status: matched ? 'success' : 'suspicious',
        data: data.content,
        message: matched
          ? `✅ 二维码匹配: ${data.content}`
          : `⚠️ 二维码不匹配期望值！识别到: ${data.content}`
      };
    } catch (error) {
      return {
        type: 'qrcode',
        status: 'failed',
        message: `二维码识别失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }, [barcodeConfigs]);

  // LLM检测
  const performLLMAnalysis = useCallback(async (imageData: string, context: any): Promise<ValidationResult> => {
    try {
      const response = await fetch('/api/llm/analyze/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imageData,
          context: context,
          prompt: '请分析这张图片中的物品是否齐套，并给出详细说明'
        })
      });

      if (!response.ok) {
        throw new Error('LLM分析失败');
      }

      const data = await response.json();
      return {
        type: 'llm',
        status: data.is_complete ? 'success' : 'suspicious',
        data: data.analysis,
        message: data.analysis,
        confidence: data.confidence
      };
    } catch (error) {
      return {
        type: 'llm',
        status: 'failed',
        message: `LLM分析失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }, []);

  // 序列号绑定
  const performSerialBinding = useCallback(async (serialNumber: string, qrCodeData: string): Promise<ValidationResult> => {
    try {
      const response = await fetch('/api/serial/bind/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serial_number: serialNumber,
          qr_code: qrCodeData
        })
      });

      if (!response.ok) {
        throw new Error('序列号绑定失败');
      }

      const data = await response.json();
      return {
        type: 'serial',
        status: data.valid ? 'success' : 'suspicious',
        data: data,
        message: data.valid ? '序列号绑定成功' : `序列号不匹配: ${data.reason}`
      };
    } catch (error) {
      return {
        type: 'serial',
        status: 'failed',
        message: `序列号绑定失败: ${error instanceof Error ? error.message : '未知错误'}`
      };
    }
  }, []);

  // 执行所有启用的验证
  const performAllValidations = useCallback(async (imageData: string, baseResult: InspectionResult): Promise<ExtendedInspectionResult> => {
    const validationResults: ValidationResult[] = [];
    let extendedResult: ExtendedInspectionResult = {
      ...baseResult,
      validationResults: [],
      isSuspicious: false
    };

    try {
      setValidationInProgress(true);

      // OCR识别
      if (validationOptions.enableOCR) {
        toast.loading('正在进行OCR识别...', { id: 'ocr-validation' });
        const ocrResult = await performOCR(imageData);
        validationResults.push(ocrResult);
        extendedResult.ocrText = ocrResult.data;
        if (ocrResult.status === 'suspicious' || ocrResult.status === 'failed') {
          extendedResult.isSuspicious = true;
        }
        toast.dismiss('ocr-validation');
      }

      // 二维码识别
      if (validationOptions.enableQRCode) {
        toast.loading('正在识别二维码...', { id: 'qr-validation' });
        const qrResult = await performQRCodeScan(imageData);
        validationResults.push(qrResult);
        extendedResult.qrCodeData = qrResult.data;
        if (qrResult.status === 'failed') {
          extendedResult.isSuspicious = true;
        }
        toast.dismiss('qr-validation');
      }

      // LLM检测
      if (validationOptions.enableLLM) {
        toast.loading('正在进行LLM分析...', { id: 'llm-validation' });
        const llmResult = await performLLMAnalysis(imageData, { result: baseResult });
        validationResults.push(llmResult);
        extendedResult.llmAnalysis = llmResult.data;
        if (llmResult.status === 'suspicious' || llmResult.status === 'failed') {
          extendedResult.isSuspicious = true;
        }
        toast.dismiss('llm-validation');
      }

      // 序列号绑定（需要同时有二维码数据）
      if (validationOptions.enableSerialBinding && extendedResult.qrCodeData) {
        toast.loading('正在验证序列号绑定...', { id: 'serial-validation' });
        // 从OCR或用户输入获取序列号
        const serialNumber = extendedResult.ocrText || '';
        const serialResult = await performSerialBinding(serialNumber, extendedResult.qrCodeData);
        validationResults.push(serialResult);
        extendedResult.serialNumber = serialNumber;
        if (serialResult.status === 'suspicious' || serialResult.status === 'failed') {
          extendedResult.isSuspicious = true;
        }
        toast.dismiss('serial-validation');
      }

      extendedResult.validationResults = validationResults;

      // 如果有存疑项，弹出验证对话框供用户确认
      if (extendedResult.isSuspicious) {
        setCurrentValidationResult(extendedResult);
        setShowValidationDialog(true);
      }

      return extendedResult;
    } catch (error) {
      console.error('验证过程出错:', error);
      toast.error(`验证失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return extendedResult;
    } finally {
      setValidationInProgress(false);
    }
  }, [validationOptions, performOCR, performQRCodeScan, performLLMAnalysis, performSerialBinding]);

  // 兼容性: getUserMedia 封装，支持旧版浏览器前缀并在非安全环境下给出提示
  const getUserMediaCompat = useCallback(async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
    const isLocalhost = typeof window !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname);
    const isSecure = typeof window !== 'undefined' && (window.isSecureContext || window.location.protocol === 'https:' || isLocalhost);
    if (!isSecure) {
      toast.error('摄像头需要在 HTTPS 或 localhost 环境使用');
    }

    if (navigator.mediaDevices?.getUserMedia) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err: any) {
        // Safari 有时对约束更为严格，失败时回退到宽松配置
        if (err?.name === 'OverconstrainedError' || err?.name === 'NotReadableError' || err?.name === 'NotAllowedError') {
          try {
            return await navigator.mediaDevices.getUserMedia({ video: true });
          } catch (e) {
            throw err;
          }
        }
        throw err;
      }
    }

    const legacyGetUserMedia: any = (navigator as any).getUserMedia || (navigator as any).webkitGetUserMedia || (navigator as any).mozGetUserMedia || (navigator as any).msGetUserMedia;
    if (legacyGetUserMedia) {
      return new Promise<MediaStream>((resolve, reject) => {
        try {
          legacyGetUserMedia.call(navigator, constraints, resolve, reject);
        } catch (e) {
          reject(e);
        }
      });
    }

    throw new Error('当前环境不支持摄像头 (getUserMedia 不可用)');
  }, []);

  // 使用 zustand store 管理持久化状态
  const {
    autoCapture,
    showDetections,
    captureThreshold,
    inspectionThreshold,
    captureInterval,
    inspectionCooldownInterval,
    ppeThresholds,
    isSettingsExpanded,
    capturedImages,
    results,
    bestDetectionInInterval,
    setAutoCapture,
    setShowDetections,
    setCaptureThreshold,
    setInspectionThreshold,
    setCaptureInterval,
    setInspectionCooldownInterval,
    setPpeThresholds,
    updatePpeThreshold,
    setIsSettingsExpanded,
    setCapturedImages,
    addCapturedImage,
    setResults,
    addResult,
    setBestDetectionInInterval,
    clearResults,
  } = useSafetyEquipmentStore();
  
  // 获取当前模型的所有类别（不过滤，用于UI显示）
  const getAllModelClasses = useCallback(() => {
    if (currentModel === 'filter_core_detection') {
      // YOLO11滤芯模型：15个类别
      return [
        'filter',
        'name_MCF',
        'nsplogo',
        'qrcode',
        'service_label',
        'nameplate_label',
        'security_label',
        'name_MNF',
        'name_CPP',
        'name_MPF',
        'name_NF',
        'name_PCC',
        'name_PCF',
        'name_ZPC',
        'filter package'
      ];
    } else if (currentModel === 'waterprifer_detection' || currentModel?.includes('water') || modelName?.includes('净水机')) {
      // 净水机模型：5个类别（支持多种可能的ID格式）
      return ['anti_counterfeit_label', 'service_label', 'nameplate_label', 'water_efficiency_label', 'barcode_label'];
    } else {
      // 默认：显示滤芯和净水机的关键类别
      return ['filter', 'qrcode', 'anti_counterfeit_label', 'nameplate_label', 'barcode_label'];
    }
  }, [currentModel, modelName]);

  // 根据当前模型获取需要显示的检测类别（需要在 store 解构之后定义）
  const getCurrentModelClasses = useCallback(() => {
    // 添加调试日志
    console.log('🔍 getCurrentModelClasses - currentModel:', currentModel, 'modelName:', modelName);
    
    // 获取所有类别
    const allClasses = getAllModelClasses();
    
    // 过滤掉阈值为0的类别（跳过检测的类别）
    const activeClasses = allClasses.filter(className => {
      const thresholdValue = ((ppeThresholds as unknown) as Record<string, number>)[className];
      // 如果阈值为0或undefined，跳过该类别
      return thresholdValue !== undefined && thresholdValue > 0;
    });
    
    console.log('  -> 过滤后的类别（排除阈值为0的）:', activeClasses);
    return activeClasses;
  }, [currentModel, modelName, ppeThresholds, getAllModelClasses]);
  
  // 判断当前模型是否支持人员检测
  const doesModelSupportPersonDetection = () => {
    // 滤芯模型和净水机模型不支持人员检测
    if (currentModel === 'filter_core_detection' || currentModel === 'waterprifer_detection') {
      return false;
    }
    // PPE检测模型和通用模型支持人员检测
    return currentModel === 'ppe_detection' || currentModel === 'yolo8_general' || !currentModel || currentModel === '';
  };
  
  // 窗口标识符 - 用于区分不同窗口
  const [windowId] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('windowId') || `kit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  });

  // 非持久化状态
  const [lastDetectionTime, setLastDetectionTime] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const isDetectingRef = useRef(false);
  
  // localStorage 相关函数已移除，由 zustand store 自动处理持久化

  // 非持久化状态
  const [lastCaptureTime, setLastCaptureTime] = useState(0); // 上次抓拍时间
  // 非持久化状态
  // 移除不再使用的yoloModel状态（后端检测不需要前端模型）
  // const [currentDetections, setCurrentDetections] = useState<YoloDetection[]>([]);
  const [detectionStats, setDetectionStats] = useState({
    totalDetections: 0,
    personDetections: 0,
    equipmentDetections: 0
  });
  const { addResult: addAppResult, results: globalResults } = useAppStore();
  const { config } = useAIConfigStore();
  const [tempFolderPath] = useState('/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/temp_clean');
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(undefined);
  const [forceUpdate, setForceUpdate] = useState(0); // 强制更新计数器
  const [localCapturedImages, setLocalCapturedImages] = useState<string[]>([]); // 本地抓拍图片状态


  // 全屏状态管理
  const [isFullscreen, setIsFullscreen] = useState(false);

  // 模型不可用对话框状态
  const [modelUnavailableDialog, setModelUnavailableDialog] = useState({
    isOpen: false,
    errorMessage: '',
    errorType: 'model_unavailable' as 'model_unavailable' | 'specific_model_unavailable'
  });

    // 刷新当前模型状态
  const refreshCurrentModel = useCallback(async () => {
    try {
      const response = await fetch('/api/results/available-models/');
      if (response.ok) {
        const data = await response.json();
        console.log('当前模型:', data.current_model || '未知');
      }
    } catch (error) {
      console.error('获取模型状态失败:', error);
    }
  }, []);

  // 切换识别模型（UI保留，但不影响后端）
  // 已不再使用前端识别模型切换

  // 后端模型预加载与状态检查
  const loadYoloModel = useCallback(async () => {
    try {
      await preloadYolo();
      const status = await getYoloStatus();
      console.log('YOLO状态:', status);
      toast.success('后端YOLO已就绪');
    } catch (e) {
      console.error('YOLO预加载失败:', e);
      toast.error('后端YOLO预加载失败');
    }
  }, []);
  // 执行检测（根据选择的检测模型）
  const performDetection = useCallback(async (imageData: string): Promise<YoloDetection[]> => {
    // 如果选择AI检测且AI检测开关开启
    {
      // 使用后端YOLO检测
      try {
        // 使用最低的阈值进行检测，然后在前端进行过滤
        const thresholdValues = Object.values(ppeThresholds).filter(v => typeof v === 'number') as number[];
        const minThreshold = thresholdValues.length > 0 ? Math.min(...thresholdValues) : 0.5;
        const backendDetections = await yoloDetectBackend(imageData, minThreshold);
        
        // 转换为前端统一的检测结构
        const detections: YoloDetection[] = backendDetections.map(d => ({
          class: d.label,
          confidence: d.confidence,
          bbox: [d.bbox.x1, d.bbox.y1, d.bbox.x2 - d.bbox.x1, d.bbox.y2 - d.bbox.y1]
        }));

        // 过滤出我们关心的齐套化类别（滤芯和净水机模型）
        // YOLO11滤芯模型类别：15个类别
        // 净水机模型类别：anti_counterfeit_label, service_label, nameplate_label, water_efficiency_label, barcode_label
        const filterClasses = [
          'filter',
          'name_MCF',
          'nsplogo',
          'qrcode',
          'service_label',
          'nameplate_label',
          'security_label',
          'name_MNF',
          'name_CPP',
          'name_MPF',
          'name_NF',
          'name_PCC',
          'name_PCF',
          'name_ZPC',
          'filter package'
        ];
        const waterPurifierClasses = ['anti_counterfeit_label', 'service_label', 'nameplate_label', 'water_efficiency_label', 'barcode_label'];
        const relevantClasses = ['person', ...filterClasses, ...waterPurifierClasses];
        
        const filteredDetections = detections.filter(detection => {
          if (!relevantClasses.includes(detection.class)) return false;
          
          // 根据类别使用对应的阈值
          let threshold = 0.8;
          // 滤芯模型类别使用cleanroom_cap阈值
          if (filterClasses.includes(detection.class)) {
            threshold = ppeThresholds.cleanroom_cap || 0.8;
          }
          // 净水机模型类别使用mask阈值
          else if (waterPurifierClasses.includes(detection.class)) {
            threshold = ppeThresholds.mask || 0.8;
          }
          // 人员使用person阈值
          else if (detection.class === 'person') {
            threshold = ppeThresholds.person || 0.8;
          }
          // 其他类别使用动态阈值（从ppeThresholds中获取）
          else {
            threshold = ((ppeThresholds as unknown) as Record<string, number>)[detection.class] ?? 0.8;
          }
          
          // 如果阈值为0，跳过该类别的检测
          if (threshold === 0) return false;
          
          return detection.confidence >= threshold;
        });

        return filteredDetections;
      } catch (error) {
        console.error('后端齐套化检测失败:', error);
        
        // 检查是否是模型不可用的错误
        if ((error as any).errorType === 'model_unavailable' || (error as any).errorType === 'specific_model_unavailable') {
          setModelUnavailableDialog({
            isOpen: true,
            errorMessage: (error as Error).message,
            errorType: (error as any).errorType
          });
        } else {
          toast.error(`检测失败: ${(error as Error).message}`);
        }
        
        return [];
      }
    }
  }, [ppeThresholds]);

  // 执行抓拍检测（专门用于抓拍，不受检测模型选择影响）
  const performCaptureDetection = useCallback(async (imageData: string): Promise<YoloDetection[]> => {
    // 抓拍检测改为调用后端接口
    try {
      console.log('调用后端检测，阈值:', captureThreshold);
      
      // 验证图片数据
      if (!imageData || imageData.length === 0) {
        console.error('图片数据为空，跳过检测');
        return [];
      }
      
      // 验证图片数据长度（防止过大的图片）
      if (imageData.length > 1000000) { // 限制为1MB
        console.error('图片数据过大，跳过检测:', imageData.length);
        return [];
      }
      
      // 验证base64数据格式
      try {
        // 尝试解码base64数据来验证其有效性
        const testDecode = atob(imageData);
        if (testDecode.length === 0) {
          console.error('图片数据格式无效，跳过检测');
          return [];
        }
      } catch (e) {
        console.error('图片数据base64解码失败，跳过检测:', e);
        return [];
      }
      
      console.log('图片数据验证通过，开始后端检测');
      const backendDetections = await yoloDetectBackend(imageData, captureThreshold);
      // 后端检测结果（仅在开发模式下输出日志）
      if (process.env.NODE_ENV === 'development') {
        console.log('后端原始检测结果:', backendDetections);
      }
      
      const detections: YoloDetection[] = backendDetections.map(d => ({
        class: d.label,
        confidence: d.confidence,
        bbox: [d.bbox.x1, d.bbox.y1, d.bbox.x2 - d.bbox.x1, d.bbox.y2 - d.bbox.y1]
      }));

              // 过滤出我们关心的齐套化类别（检测物品）
      // 支持后端返回的原始类别和映射后的类别（齐套化模型）
      // YOLO11滤芯模型类别：15个类别（filter, name_MCF, nsplogo, qrcode, service_label, nameplate_label, security_label, name_MNF, name_CPP, name_MPF, name_NF, name_PCC, name_PCF, name_ZPC, filter package）
      // 净水机模型类别：anti_counterfeit_label, service_label, nameplate_label, water_efficiency_label, barcode_label
      const filterClasses = [
        'filter',
        'name_MCF',
        'nsplogo',
        'qrcode',
        'service_label',
        'nameplate_label',
        'security_label',
        'name_MNF',
        'name_CPP',
        'name_MPF',
        'name_NF',
        'name_PCC',
        'name_PCF',
        'name_ZPC',
        'filter package'
      ];
      const waterPurifierClasses = ['anti_counterfeit_label', 'service_label', 'nameplate_label', 'water_efficiency_label', 'barcode_label'];
      const relevantClasses = [
        // 人员
        'person',
        // 滤芯模型类别
        ...filterClasses,
        // 净水机模型类别
        ...waterPurifierClasses
      ];
      const filteredDetections = detections.filter(detection => 
        relevantClasses.includes(detection.class)
      );

      // 过滤后的检测结果（仅在开发模式下输出日志）
      if (process.env.NODE_ENV === 'development') {
        console.log('过滤后的检测结果:', filteredDetections);
      }
      return filteredDetections;
    } catch (error) {
      console.error('抓拍齐套化检测失败:', error);
      return [];
    }
  }, [captureThreshold]);
  
  // triggerAutoInspection 先定义，因为 handleAutoInspection 和 handleManualInspection 需要依赖它
  // 这个函数定义在后面的代码中（约第825行），暂时在这里声明类型
  
  // 提取单个检测框的ROI截图
  const extractAndSaveROI = useCallback(async (base64Image: string, detection: YoloDetection): Promise<string | null> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          let x1, y1, x2, y2;
          const [x, y, width, height] = detection.bbox;
          
          // 检查坐标格式（相对坐标或绝对坐标）
          if (x > 1 || y > 1 || width > 1 || height > 1) {
            // 绝对像素坐标
            x1 = x;
            y1 = y;
            x2 = x + width;
            y2 = y + height;
          } else {
            // 相对坐标，需要乘以图片尺寸
            x1 = x * img.width;
            y1 = y * img.height;
            x2 = (x + width) * img.width;
            y2 = (y + height) * img.height;
          }
          
          // 确保坐标在图片范围内
          x1 = Math.max(0, Math.min(x1, img.width));
          y1 = Math.max(0, Math.min(y1, img.height));
          x2 = Math.max(0, Math.min(x2, img.width));
          y2 = Math.max(0, Math.min(y2, img.height));
          
          const cropWidth = x2 - x1;
          const cropHeight = y2 - y1;
          
          if (cropWidth <= 0 || cropHeight <= 0) {
            resolve(null);
            return;
          }
          
          // 添加边距
          const margin = 10;
          const cropX = Math.max(0, x1 - margin);
          const cropY = Math.max(0, y1 - margin);
          const finalWidth = Math.min(img.width - cropX, cropWidth + 2 * margin);
          const finalHeight = Math.min(img.height - cropY, cropHeight + 2 * margin);
          
          // 创建ROI canvas
          const roiCanvas = document.createElement('canvas');
          roiCanvas.width = finalWidth;
          roiCanvas.height = finalHeight;
          const roiCtx = roiCanvas.getContext('2d');
          
          if (!roiCtx) {
            resolve(null);
            return;
          }
          
          roiCtx.drawImage(
            img,
            cropX, cropY, finalWidth, finalHeight,
            0, 0, finalWidth, finalHeight
          );
          
          const roiBase64 = roiCanvas.toDataURL('image/jpeg', 0.8);
          resolve(roiBase64); // 返回完整的data URI（包含前缀）
        } catch (error) {
          console.error('ROI提取失败:', error);
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = base64Image.includes(',') ? base64Image : `data:image/jpeg;base64,${base64Image}`;
    });
  }, []);
  
  // 拼接所有ROI截图
  const stitchROISnapshots = useCallback(async (): Promise<string | null> => {
    const snapshots = roiSnapshots; // 使用当前状态
    if (snapshots.length === 0) {
      return null;
    }
    
    return new Promise((resolve) => {
      const images: HTMLImageElement[] = [];
      let loadedCount = 0;
      
      snapshots.forEach((snapshot) => {
        const img = new Image();
        img.onload = () => {
          images.push(img); // 只有加载成功的图片才加入数组
          loadedCount++;
          // 检查是否所有图片都处理完成（成功或失败）
          if (loadedCount === snapshots.length) {
            // 如果没有图片加载成功，返回null
            if (images.length === 0) {
              resolve(null);
              return;
            }
            // 所有图片加载完成，开始拼接
            const padding = 10;
            const maxWidth = 800;
            const maxHeight = 600;
            
            // 计算布局
            let canvasWidth = 0;
            let canvasHeight = 0;
            
            if (images.length === 1) {
              canvasWidth = Math.min(images[0].width, maxWidth);
              canvasHeight = Math.min(images[0].height, maxHeight);
            } else if (images.length === 2) {
              const totalWidth = images[0].width + images[1].width + padding;
              canvasWidth = Math.min(totalWidth, maxWidth);
              canvasHeight = Math.max(images[0].height, images[1].height);
            } else {
              // 网格布局
              const cols = Math.ceil(Math.sqrt(images.length));
              const rows = Math.ceil(images.length / cols);
              let maxWidthInRow = 0;
              let maxHeightInCol = 0;
              
              for (let i = 0; i < rows; i++) {
                let rowWidth = 0;
                let rowHeight = 0;
                for (let j = 0; j < cols && i * cols + j < images.length; j++) {
                  rowWidth += images[i * cols + j].width;
                  rowHeight = Math.max(rowHeight, images[i * cols + j].height);
                }
                maxWidthInRow = Math.max(maxWidthInRow, rowWidth);
                maxHeightInCol += rowHeight;
              }
              
              canvasWidth = Math.min(maxWidthInRow + (cols - 1) * padding, maxWidth);
              canvasHeight = Math.min(maxHeightInCol + (rows - 1) * padding, maxHeight);
            }
            
            const stitchCanvas = document.createElement('canvas');
            stitchCanvas.width = canvasWidth;
            stitchCanvas.height = canvasHeight;
            const stitchCtx = stitchCanvas.getContext('2d');
            
            if (!stitchCtx) {
              resolve(null);
              return;
            }
            
            // 填充背景
            stitchCtx.fillStyle = '#000000';
            stitchCtx.fillRect(0, 0, canvasWidth, canvasHeight);
            
            // 绘制图片
            if (images.length === 1) {
              stitchCtx.drawImage(images[0], 0, 0, canvasWidth, canvasHeight);
            } else if (images.length === 2) {
              let currentX = 0;
              images.forEach(img => {
                const scale = Math.min(1, (canvasHeight - padding) / img.height);
                const scaledWidth = img.width * scale;
                const scaledHeight = img.height * scale;
                stitchCtx.drawImage(img, currentX, 0, scaledWidth, scaledHeight);
                currentX += scaledWidth + padding;
              });
            } else {
              // 网格布局
              const cols = Math.ceil(Math.sqrt(images.length));
              let currentY = 0;
              
              for (let i = 0; i < images.length; i += cols) {
                let currentX = 0;
                let rowHeight = 0;
                
                for (let j = 0; j < cols && i + j < images.length; j++) {
                  const img = images[i + j];
                  const scale = Math.min(1, (canvasWidth / cols - padding) / img.width);
                  const scaledWidth = img.width * scale;
                  const scaledHeight = img.height * scale;
                  stitchCtx.drawImage(img, currentX, currentY, scaledWidth, scaledHeight);
                  currentX += scaledWidth + padding;
                  rowHeight = Math.max(rowHeight, scaledHeight);
                }
                
                currentY += rowHeight + padding;
              }
            }
            
            const stitchedBase64 = stitchCanvas.toDataURL('image/jpeg', 0.8);
            resolve(stitchedBase64.split(',')[1]);
          }
        };
        img.onerror = (error) => {
          console.error(`加载ROI图片失败: ${snapshot.class}`, error);
          loadedCount++;
          // 即使加载失败也继续，避免阻塞其他图片
          if (loadedCount === snapshots.length) {
            // 如果所有图片都加载失败，返回null
            if (images.length === 0) {
              resolve(null);
            } else {
              // 至少有一部分图片加载成功，继续拼接
              // 这个逻辑已经在 onload 中处理了
            }
          }
        };
        // 确保使用完整的data URI格式
        img.src = snapshot.image.includes('data:') 
          ? snapshot.image 
          : `data:image/jpeg;base64,${snapshot.image}`;
        // 不在这里 push，只在 onload 中 push 成功的图片
      });
    });
  }, [roiSnapshots]);
  
  // triggerAutoInspection 函数的声明（实际定义在后面，约第825行）
  // 这里创建一个 ref 来存储函数引用，避免初始化顺序问题
  const triggerAutoInspectionRef = useRef<((imagesToProcess?: string[]) => Promise<void>) | null>(null);
  
  // 保存齐套化检测结果（简单规则判断，不调用后端检测）
  const saveKitMatchingResult = useCallback(async (stitchedImage: string) => {
    try {
      // 获取当前的累加检测类别
      let currentDetectedClasses: Set<string> = new Set();
      setAccumulatedDetectedClasses(prev => {
        currentDetectedClasses = prev;
        return prev; // 不改变状态，只是读取
      });
      
      // 获取当前模型需要的类别
      const requiredClasses = getCurrentModelClasses();
      
      // 判断是否齐套：检测到所有需要的类别
      const isCompleteKit = requiredClasses.every(cls => currentDetectedClasses.has(cls));
      
      // 计算检测百分比：根据实际检测到的类别数量
      const detectedCount = currentDetectedClasses.size;
      const totalCount = requiredClasses.length;
      const score = totalCount > 0 ? Math.round((detectedCount / totalCount) * 100 * 100) / 100 : 0; // 保留两位小数
      
      // 简单规则判断：只有合格和存疑两种结果
      const overallQuality: '合格' | '存疑' = isCompleteKit ? '合格' : '存疑';
      
      // 生成原因说明
      let reason = '';
      if (isCompleteKit) {
        reason = `✅ 齐套化完整！已检测到所有类别 (${currentDetectedClasses.size}/${requiredClasses.length})`;
      } else {
        const missingClasses = requiredClasses.filter(cls => !currentDetectedClasses.has(cls));
        const missingClassNames = missingClasses.map(cls => getClassChineseName(cls)).join('、');
        const detectedClassNames = Array.from(currentDetectedClasses).map(cls => getClassChineseName(cls)).join('、');
        reason = `⚠️ 齐套化不完整。已检测到: ${detectedClassNames || '无'}；缺少: ${missingClassNames}`;
      }
      
      // 提取base64数据（去掉data URI前缀）
      const imageData = stitchedImage.includes(',') ? stitchedImage.split(',')[1] : stitchedImage;
      
      // 创建检测结果（齐套化检测只有合格和存疑）
      const result: InspectionResult = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        image: imageData, // 保存拼接后的图片（base64格式，不带前缀）
        standardId: null,
        // @ts-ignore - 齐套化检测只使用合格和存疑，类型定义已支持
        overallQuality: overallQuality,
        score,
        reason,
        // @ts-ignore - detectionType 已在 types/index.ts 中添加
        detectionType: 'kit_matching' as const
      };
      
      // 保存结果到数据库
      await addAppResult(result);
      
      // 更新本地结果列表
      const currentResults = results || [];
      const allResults = [result, ...currentResults];
      setResults(allResults.slice(0, 20)); // 只保留最近20个
      
      toast.success(`齐套化检测完成：${overallQuality === '合格' ? '✅ 合格' : '⚠️ 存疑'}`, { 
        duration: 3000,
        id: 'kit-matching-result'
      });
      
      return result;
    } catch (error) {
      console.error('保存齐套化检测结果失败:', error);
      toast.error('保存检测结果失败: ' + (error instanceof Error ? error.message : '未知错误'), { 
        duration: 3000,
        id: 'kit-matching-result'
      });
      throw error;
    }
  }, [getCurrentModelClasses, addAppResult, setResults, results]);
  
  // 手动触发检验
  const handleManualInspection = useCallback(async () => {
    // 检查是否在冷却时间内
    const now = Date.now();
    const cooldownMs = inspectionCooldownInterval * 1000;
    if (now - lastInspectionTimeRef.current < cooldownMs) {
      const remaining = Math.ceil((cooldownMs - (now - lastInspectionTimeRef.current)) / 1000);
      toast.error(`请等待 ${remaining} 秒后再进行检测`, { duration: 2000 });
      return;
    }
    
    if (roiSnapshots.length === 0) {
      toast.error('没有可用的ROI截图');
      return;
    }
    
    // 拼接所有ROI截图
    const stitchedImage = await stitchROISnapshots();
    if (!stitchedImage) {
      toast.error('图片拼接失败');
      return;
    }
    
    // 直接保存结果（不调用后端检测）
    await saveKitMatchingResult(stitchedImage);
    
    // 更新上次检测时间
    lastInspectionTimeRef.current = Date.now();
    
    // 检测并上传完成后，清空累加状态和ROI截图
    setAccumulatedDetectedClasses(new Set());
    setRoiSnapshots([]);
    setIsComplete(false);
    
    toast.success('手动检验完成，检测状态已重置', { duration: 2000 });
  }, [roiSnapshots, stitchROISnapshots, saveKitMatchingResult, inspectionCooldownInterval]);
  
  // 自动触发检验（延迟初始化，依赖 triggerAutoInspection）
  const handleAutoInspection = useCallback(async () => {
    // 使用函数式更新获取最新的ROI截图状态
    let currentSnapshots: Array<{ class: string; image: string; timestamp: number; confidence?: number }> = [];
    setRoiSnapshots(snapshots => {
      currentSnapshots = snapshots;
      return snapshots; // 不改变状态，只是读取
    });
    
    if (currentSnapshots.length === 0) {
      console.warn('没有ROI截图，跳过自动检测');
      return;
    }
    
    if (!triggerAutoInspectionRef.current) {
      console.error('检测功能未初始化');
      toast.error('检测功能未初始化', { duration: 2000 });
      return;
    }
    
    try {
      // 使用当前快照进行拼接（不依赖状态，直接使用获取到的快照）
      const stitchWithSnapshots = async (snapshots: Array<{ class: string; image: string; timestamp: number; confidence?: number }>): Promise<string | null> => {
        if (snapshots.length === 0) {
          return null;
        }
        
        // 创建canvas进行拼接
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        
        // 计算布局：根据截图数量决定排列方式
        const count = snapshots.length;
        let cols: number;
        let rows: number;
        
        if (count === 1) {
          cols = 1;
          rows = 1;
        } else if (count === 2) {
          cols = 2;
          rows = 1;
        } else if (count <= 4) {
          cols = 2;
          rows = 2;
        } else if (count <= 6) {
          cols = 3;
          rows = 2;
        } else if (count <= 9) {
          cols = 3;
          rows = 3;
        } else {
          cols = 4;
          rows = Math.ceil(count / 4);
        }
        
        // 假设每个ROI图片尺寸（可以后续优化为动态读取）
        const roiWidth = 400;
        const roiHeight = 300;
        const padding = 10;
        
        canvas.width = cols * roiWidth + (cols + 1) * padding;
        canvas.height = rows * roiHeight + (rows + 1) * padding;
        
        // 填充白色背景
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 加载并绘制每个ROI图片
        const imagePromises = snapshots.map((snapshot, index) => {
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
              const col = index % cols;
              const row = Math.floor(index / cols);
              const x = padding + col * (roiWidth + padding);
              const y = padding + row * (roiHeight + padding);
              
              ctx.drawImage(img, x, y, roiWidth, roiHeight);
              
              // 添加类别标签
              ctx.fillStyle = '#000000';
              ctx.font = '16px Arial';
              ctx.fillText(snapshot.class, x + 5, y + 20);
              
              resolve();
            };
            img.onerror = (error) => {
              console.error(`加载ROI图片失败: ${snapshot.class}`, error);
              resolve();
            };
            // 确保使用完整的data URI格式（如果snapshot.image不包含前缀则添加）
            img.src = snapshot.image.includes('data:') 
              ? snapshot.image 
              : `data:image/jpeg;base64,${snapshot.image}`;
          });
        });
        
        await Promise.all(imagePromises);
        
        return canvas.toDataURL('image/jpeg', 0.9);
      };
      
      // 拼接所有ROI截图（使用当前快照）
      const stitchedImage = await stitchWithSnapshots(currentSnapshots);
      if (!stitchedImage) {
        console.error('图片拼接失败');
        toast.error('图片拼接失败', { duration: 2000 });
        return;
      }
      
      // 调试：记录拼接后的图片信息
      if (process.env.NODE_ENV === 'development') {
        console.log('📸 拼接后的图片长度:', stitchedImage.length, '使用的ROI数量:', currentSnapshots.length);
      }
      
      // 直接保存结果（不调用后端检测）
      await saveKitMatchingResult(stitchedImage);
      
      // 更新上次检测时间
      lastInspectionTimeRef.current = Date.now();
      
      // 检测并上传完成后，清空累加状态和ROI截图（确保在检测完成后才清空）
      setAccumulatedDetectedClasses(new Set());
      setRoiSnapshots([]);
      setIsComplete(false);
      
      // 自动模式下，检测完成后显示提示（覆盖之前的"上传中"提示）
      toast.success('✅ 自动检验完成，检测状态已重置', { 
        duration: 2000,
        id: 'kit-matching-complete' // 替换之前的提示
      });
    } catch (error) {
      console.error('自动检测过程出错:', error);
      toast.error('自动检测失败: ' + (error instanceof Error ? error.message : '未知错误'), { 
        duration: 3000,
        id: 'kit-matching-complete'
      });
      throw error; // 重新抛出错误以便调用者处理
    }
  }, [saveKitMatchingResult]); // 使用 saveKitMatchingResult 而不是 triggerAutoInspection

  // 在画布上绘制检测结果 - 完全参考LiveInspectionScreen
  const drawDetections = useCallback((detections: YoloDetection[], canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 清除之前的绘制
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach(detection => {
      const [x, y, width, height] = detection.bbox;
      const confidence = detection.confidence;

      // 根据齐套化检测类别设置颜色
      let color = '#00ff00'; // 默认绿色
      
      // 人员检测
      if (detection.class === 'person') color = '#ff0000'; // 人员红色
      
      // 滤芯模型类别
      else if (detection.class === 'filter') color = '#ff6600'; // 滤芯组件橙色
      else if (detection.class === 'name_MCF') color = '#0066ff'; // 名称MCF蓝色
      else if (detection.class === 'nsplogo') color = '#ff0066'; // NSP标志粉色
      else if (detection.class === 'qrcode') color = '#66ff00'; // 二维码亮绿色
      
      // 净水机模型类别
      else if (detection.class === 'anti_counterfeit_label') color = '#ffcc00'; // 防伪标签金黄
      else if (detection.class === 'service_label') color = '#00ccff'; // 售后服务标签天蓝
      else if (detection.class === 'nameplate_label') color = '#cc00ff'; // 铭牌标签紫色
      else if (detection.class === 'water_efficiency_label') color = '#00ffcc'; // 水效标签薄荷绿
      else if (detection.class === 'barcode_label') color = '#999999'; // 条码标签灰色

      // 绘制边界框
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);

      // 绘制标签
      ctx.fillStyle = color;
      ctx.font = '16px Arial';
      ctx.fillText(`${detection.class}: ${(confidence * 100).toFixed(1)}%`, x, y - 5);
    });
  }, []);

  // 实时齐套化检测 - 简化实现，参考LiveInspectionScreen
  const runPpeDetection = useCallback(async () => {
    if (!isPpeActive || !videoRef.current || !detectionCanvasRef.current) {
      return;
    }

    // 检查是否正在检测中，避免重复检测
    if (isDetectingRef.current) {
      return;
    }
    
    // 设置检测状态
    isDetectingRef.current = true;

    try {
      // 从视频获取当前帧
      const canvas = document.createElement('canvas');
      
      // 添加视频尺寸检查
      if (!videoRef.current || videoRef.current.videoWidth <= 0 || videoRef.current.videoHeight <= 0) {
        console.log('实时检测失败：视频尺寸无效');
        return;
      }
      
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      
      if (!ctx) {
        console.log('实时检测失败：无法创建canvas上下文');
        return;
      }
      
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      
      // 简化内容检查，避免阻塞主线程
      // 直接进行检测，让后端处理空内容的情况
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64Data = dataUrl.split(',')[1];
      
      if (!base64Data) {
        console.log('实时检测失败：图片数据为空');
        return;
      }
      
      // 执行齐套化检测（使用专门的抓拍检测函数）
      const detections = await performCaptureDetection(base64Data);
      
      // 获取当前模型需要的检测类别
      const requiredClasses = getCurrentModelClasses();
      
      // 从当前检测结果中提取检测到的类别（过滤置信度阈值）
      const currentDetectedClasses = new Set<string>();
      detections.forEach(detection => {
        const threshold = ((ppeThresholds as unknown) as Record<string, number>)[detection.class] ?? 0.8;
        // 如果阈值为0，跳过该类别的检测
        if (threshold === 0) return;
        if (requiredClasses.includes(detection.class) && detection.confidence >= threshold) {
          currentDetectedClasses.add(detection.class);
          
          // 提取ROI截图并暂存（每种类别只保存置信度最高的一张，新替旧）
          extractAndSaveROI(dataUrl, detection).then(roiImage => {
            if (roiImage) {
              setRoiSnapshots(prev => {
                // 查找该类别的已有ROI截图
                const existingIndex = prev.findIndex(item => item.class === detection.class);
                
                if (existingIndex >= 0) {
                  // 如果已存在该类别的ROI，比较置信度
                  const existing = prev[existingIndex];
                  // 保留置信度更高的（当前检测的置信度在detection.confidence中）
                  if (detection.confidence > (existing.confidence || 0)) {
                    // 替换为新的（置信度更高的）
                    const newSnapshots = [...prev];
                    newSnapshots[existingIndex] = {
                      class: detection.class,
                      image: roiImage,
                      timestamp: Date.now(),
                      confidence: detection.confidence
                    };
                    return newSnapshots;
                  } else {
                    // 已有ROI置信度更高，不替换
                    return prev;
                  }
                } else {
                  // 该类别的ROI不存在，直接添加
                  return [...prev, {
                    class: detection.class,
                    image: roiImage,
                    timestamp: Date.now(),
                    confidence: detection.confidence
                  }];
                }
              });
            }
          }).catch(err => console.error('ROI提取失败:', err));
        }
      });
      
      // 累加已检测到的类别（跨画面累加）
      setAccumulatedDetectedClasses(prev => {
        const newSet = new Set([...prev, ...currentDetectedClasses]);
        
        // 检查是否完成所有类别的检测
        const isCompleteNow = requiredClasses.every(cls => newSet.has(cls));
        
        // 如果刚完成检测（之前未完成，现在完成），且是自动模式，则触发检验
        if (isCompleteNow && !isComplete && detectionMode === 'auto' && !isTriggeringInspectionRef.current) {
          setIsComplete(true);
          isTriggeringInspectionRef.current = true; // 防止重复触发
          
          // 显示完成提示
          const requiredClasses = getCurrentModelClasses();
          toast.success(`✅ 齐套化检测完成！已检测到所有类别 (${requiredClasses.length}/${requiredClasses.length})，自动上传中...`, {
            duration: 3000,
            icon: '🎉',
            id: 'kit-matching-complete' // 使用唯一ID防止重复提示
          });
          
          // 等待所有ROI截图保存完成（因为extractAndSaveROI是异步的）
          // 延迟触发，让ROI截图有时间保存，然后自动上传
          setTimeout(async () => {
            try {
              // 等待一小段时间，确保所有异步ROI保存操作完成
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // 再次检查ROI截图是否已保存
              // 通过读取最新状态来确认
              let retryCount = 0;
              const maxRetries = 5;
              while (retryCount < maxRetries) {
                // 使用函数式更新来获取最新状态
                let hasSnapshots = false;
                setRoiSnapshots(current => {
                  hasSnapshots = current.length > 0;
                  return current; // 不改变状态，只是读取
                });
                
                if (hasSnapshots) {
                  break;
                }
                
                // 等待100ms后重试
                await new Promise(resolve => setTimeout(resolve, 100));
                retryCount++;
              }
              
              // 调用自动检测
              await handleAutoInspection();
            } catch (error) {
              console.error('自动检测失败:', error);
              toast.error('自动检测失败，请手动检验', { duration: 3000 });
            } finally {
              // 检测完成后重置标志，但不清空 isComplete，让用户看到完成状态
              setTimeout(() => {
                isTriggeringInspectionRef.current = false;
              }, 1000);
            }
          }, 500);
        } else {
          setIsComplete(isCompleteNow);
        }
        
        return newSet;
      });
      
      // 更新检测统计 - 实时更新人员和设备数量（统计齐套化物品）
      const personCount = detections.filter(d => d.class === 'person').length;
      const filterClasses = [
        'filter',
        'name_MCF',
        'nsplogo',
        'qrcode',
        'service_label',
        'nameplate_label',
        'security_label',
        'name_MNF',
        'name_CPP',
        'name_MPF',
        'name_NF',
        'name_PCC',
        'name_PCF',
        'name_ZPC',
        'filter package'
      ];
      const waterPurifierClasses = ['anti_counterfeit_label', 'service_label', 'nameplate_label', 'water_efficiency_label', 'barcode_label'];
      const equipmentCount = detections.filter(d => 
        filterClasses.includes(d.class) || waterPurifierClasses.includes(d.class)
      ).length;
      
      // 更新检测统计
      setDetectionStats({
        totalDetections: detections.length,
        personDetections: personCount,
        equipmentDetections: equipmentCount
      });

      // 在检测画布上绘制结果 - 完全参考LiveInspectionScreen
      if (detectionCanvasRef.current && videoRef.current && showDetections) {
        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;
        
        // 添加安全检查
        if (videoWidth > 0 && videoHeight > 0) {
          // 画布尺寸已在useEffect中设置，这里直接绘制
          drawDetections(detections, detectionCanvasRef.current);
        } else {
          console.log('视频尺寸无效，跳过绘制检测结果');
        }
      }

      // 如果检测到人员且启用了自动抓拍，且置信度达到抓拍阈值
      const personDetections = detections.filter(d => 
        d.class === 'person' && d.confidence >= ppeThresholds.person
      );
      
      // 齐套化检测调试信息（仅在开发模式下输出）
      if (process.env.NODE_ENV === 'development') {
        console.log('齐套化检测调试:', {
          totalDetections: detections.length,
          personDetections: detections.filter(d => d.class === 'person').length,
          highConfidencePersons: personDetections.length,
          autoCaptureEnabled: autoCapture,
          personThreshold: ppeThresholds.person,
          inspectionThreshold: inspectionThreshold
        });
      }
      
      if (personDetections.length > 0 && autoCapture) {
        const currentTime = Date.now();
        const timeSinceLastCapture = currentTime - lastCaptureTime;
        const intervalMs = captureInterval * 1000; // 转换为毫秒
        
        // 计算当前检测的平均置信度
        const avgConfidence = personDetections.reduce((sum, d) => sum + d.confidence, 0) / personDetections.length;
        
        // 如果超过间隔时间且仍然检测到人员，执行抓拍
        if (timeSinceLastCapture >= intervalMs && personDetections.length > 0) {
          // 使用当前检测结果，确保只有当前检测到人员时才抓拍
          const finalDetections = detections;
          const finalImageData = bestDetectionInInterval?.imageData || '';
          const finalConfidence = avgConfidence;
          
          // 抓拍调试信息（仅在开发模式下输出）
          if (process.env.NODE_ENV === 'development') {
            console.log(`间隔${captureInterval}秒结束，执行抓拍：`, {
              useBestDetection: false,
              confidence: (finalConfidence * 100).toFixed(1) + '%',
              personCount: finalDetections.filter(d => d.class === 'person').length
            });
          }
          
          setLastCaptureTime(currentTime);
          setBestDetectionInInterval(null); // 重置最佳检测
          
          // 如果有最佳检测的图片数据，使用它；否则重新抓拍
          if (bestDetectionInInterval?.imageData) {
            handleAutoCapture(finalDetections, finalImageData);
          } else {
            handleAutoCapture(finalDetections);
          }
        } else {
          // 在间隔内，比较并更新最佳检测结果
          const currentBest = bestDetectionInInterval;
          const shouldUpdate = !currentBest || avgConfidence > currentBest.confidence;
          
          if (shouldUpdate) {
            console.log(`更新间隔内最佳检测：置信度${(avgConfidence * 100).toFixed(1)}% > ${currentBest ? (currentBest.confidence * 100).toFixed(1) : 0}%`);
            
            // 获取当前图片数据
            const imageData = await captureCurrentFrame();
            setBestDetectionInInterval({
              detections,
              imageData: imageData || '',
              confidence: avgConfidence,
              timestamp: currentTime
            });
          } else {
            console.log(`当前检测置信度${(avgConfidence * 100).toFixed(1)}%低于最佳${(currentBest.confidence * 100).toFixed(1)}%，跳过更新`);
          }
        }
      }

    } catch (error) {
      console.error('实时齐套化检测失败:', error);
    } finally {
      // 重置检测状态
      isDetectingRef.current = false;
      setIsDetecting(false);
    }
  }, [isPpeActive, autoCapture, performCaptureDetection, drawDetections, captureThreshold, captureInterval, lastCaptureTime, bestDetectionInInterval, isDetecting]);

  // 触发自动检测的函数
  // triggerAutoInspection 函数定义
  const triggerAutoInspection = useCallback(async (imagesToProcess?: string[]) => {
    const currentImages = imagesToProcess || capturedImages;
    if (currentImages.length === 0) return;
    
    // 检查是否正在检测中，避免重复检测
    if (isDetectingRef.current) {
      console.log(`检测进行中，跳过本次检测`);
      return;
    }
    
    // 立即设置检测状态
    isDetectingRef.current = true;
    
    // 开始自动检测（仅在开发模式下输出日志）
    if (process.env.NODE_ENV === 'development') {
      console.log(`开始自动检测，图片数量: ${currentImages.length}`);
    }
    setIsDetecting(true);
    setLastDetectionTime(Date.now());
    
    // 检测状态锁定（仅在开发模式下输出日志）
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔒 检测状态已锁定，防止重复检测`);
    }
    
    // 使用后端齐套化检测
    toast.loading('正在使用后端齐套化检测物品完整性...', { id: 'safety-inspection' });
      
      try {
        const inspectionResults: InspectionResult[] = [];
        
        // 对每张抓拍图片进行YOLO检测
        for (let i = 0; i < currentImages.length; i++) {
          const imageData = currentImages[i];
          
          // 使用YOLO检测齐套化物品（使用检测阈值）
          const detections = await performDetection(imageData);
          
          // 添加调试日志
          console.log('🔍 triggerAutoInspection - performDetection 返回的检测结果:', detections);
          console.log('  - 检测结果数量:', detections.length);
          
          // 获取当前模型需要的所有类别
          const requiredClasses = getCurrentModelClasses();
          console.log('  - 当前模型需要的类别:', requiredClasses);
          
          // 从检测结果中提取检测到的类别（过滤置信度阈值）
          const detectedClasses = new Set<string>();
          detections.forEach(detection => {
            const threshold = ((ppeThresholds as unknown) as Record<string, number>)[detection.class] || 0.8;
            const isInRequired = requiredClasses.includes(detection.class);
            const meetsThreshold = detection.confidence >= threshold;
            console.log(`  - 检测项: ${detection.class}, 置信度: ${detection.confidence.toFixed(2)}, 阈值: ${threshold.toFixed(2)}, 在需求类别中: ${isInRequired}, 满足阈值: ${meetsThreshold}`);
            if (isInRequired && meetsThreshold) {
              detectedClasses.add(detection.class);
              console.log(`    ✅ 已添加到 detectedClasses`);
            } else {
              console.log(`    ❌ 未添加: ${!isInRequired ? '不在需求类别中' : '不满足阈值'}`);
            }
          });
          
          console.log('  - 最终检测到的类别:', Array.from(detectedClasses));
          console.log('  - 需要检测的类别数量:', requiredClasses.length);
          console.log('  - 已检测到的类别数量:', detectedClasses.size);
          
          // 首先检查是否齐套：如果检测到所有需要的类别，直接判定为合格
          const isCompleteKit = requiredClasses.every(cls => detectedClasses.has(cls));
          console.log('  - 是否齐套完成:', isCompleteKit);
          
          // 检查缺少的类别
          const missingClasses = requiredClasses.filter(cls => !detectedClasses.has(cls));
          if (missingClasses.length > 0) {
            console.log('  - 缺少的类别:', missingClasses);
          }
          
          // 分析核心齐套化检测结果
          const personDetections = detections.filter(d => d.class === 'person');
          
          // YOLO11滤芯模型类别：15个类别
          const filterClasses = [
            'filter',
            'name_MCF',
            'nsplogo',
            'qrcode',
            'service_label',
            'nameplate_label',
            'security_label',
            'name_MNF',
            'name_CPP',
            'name_MPF',
            'name_NF',
            'name_PCC',
            'name_PCF',
            'name_ZPC',
            'filter package'
          ];
          const filterDetections = detections.filter(d => filterClasses.includes(d.class));
          const detectedFilterClasses = new Set(filterDetections.map(d => d.class));
          
          // 净水机模型类别
          const waterPurifierClasses = ['anti_counterfeit_label', 'service_label', 'nameplate_label', 'water_efficiency_label', 'barcode_label'];
          const waterPurifierDetections = detections.filter(d => waterPurifierClasses.includes(d.class));
          const detectedWaterPurifierClasses = new Set(waterPurifierDetections.map(d => d.class));
          
          // 智能齐套化判断：检查滤芯和净水机模型的关键类别
          const hasPersonnel = personDetections.length > 0;
          
          // 判断核心齐套化物品完整性
          // 滤芯模型：需要检测到关键类别（filter和qrcode至少要有）
          const filterKeyClasses = ['filter', 'qrcode'];
          const hasFilterKey = filterKeyClasses.some(cls => detectedFilterClasses.has(cls));
          const filterCompleteness = filterDetections.length / filterClasses.length; // 检测到的类别占比
          
          // 净水机模型：需要检测到关键标签（至少3个标签）
          const waterPurifierKeyClasses = ['anti_counterfeit_label', 'nameplate_label', 'barcode_label'];
          const hasWaterPurifierKey = waterPurifierKeyClasses.filter(cls => detectedWaterPurifierClasses.has(cls)).length >= 2;
          const waterPurifierCompleteness = waterPurifierDetections.length / waterPurifierClasses.length; // 检测到的类别占比
          
          // 计算完整率（滤芯和净水机的平均完整率）
          let complianceScore = 0;
          if (hasFilterKey && hasWaterPurifierKey) {
            complianceScore = ((filterCompleteness + waterPurifierCompleteness) / 2) * 100;
          } else if (hasFilterKey || hasWaterPurifierKey) {
            complianceScore = hasFilterKey ? filterCompleteness * 50 : waterPurifierCompleteness * 50;
          } else {
            complianceScore = 0;
          }
          
          // 如果齐套完成（检测到所有需要的类别），直接判定为合格
          // 否则根据完整率判断质量等级
          let overallQuality: '合格' | '需复检' | '存疑';
          if (isCompleteKit) {
            // 齐套完成，直接判定为合格
            console.log('✅ 齐套完成，判定为合格');
            overallQuality = '合格';
            complianceScore = 100; // 设置为100%，表示完全齐套
          } else if (complianceScore >= 80) {
            console.log('⚠️ 未齐套，但完整率 >= 80%，判定为合格');
            overallQuality = '合格';
          } else if (complianceScore >= 50) {
            console.log('⚠️ 完整率在 50-80% 之间，判定为需复检');
            overallQuality = '需复检';
          } else if (complianceScore >= 30) {
            console.log('⚠️ 完整率在 30-50% 之间，判定为需复检');
            overallQuality = '需复检';
          } else {
            console.log('❌ 完整率 < 30%，判定为存疑');
            overallQuality = '存疑';
          }
          
          console.log(`📊 最终判定结果: ${overallQuality}, 完整率: ${complianceScore.toFixed(1)}%`);
          
          // 生成具体的不完整原因
          const missingItems = [];
          if (!hasFilterKey) {
            const missingFilterClasses = filterKeyClasses.filter(cls => !detectedFilterClasses.has(cls));
            missingItems.push(`滤芯关键类别缺失: ${missingFilterClasses.join('、')}`);
          }
          if (!hasWaterPurifierKey) {
            const missingWpClasses = waterPurifierKeyClasses.filter(cls => !detectedWaterPurifierClasses.has(cls));
            missingItems.push(`净水机关键标签缺失: ${missingWpClasses.join('、')}`);
          }
          
          // 生成详细的核心齐套化检测报告
          const detectionDetails = [];
          if (personDetections.length > 0) detectionDetails.push(`检测到${personDetections.length}名人员`);
          if (filterDetections.length > 0) {
            const filterCounts = filterClasses.map(cls => {
              const count = filterDetections.filter(d => d.class === cls).length;
              return count > 0 ? `${cls}(${count})` : null;
            }).filter(Boolean);
            detectionDetails.push(`滤芯类别: ${filterCounts.join(', ')}`);
          }
          if (waterPurifierDetections.length > 0) {
            const wpCounts = waterPurifierClasses.map(cls => {
              const count = waterPurifierDetections.filter(d => d.class === cls).length;
              return count > 0 ? `${cls}(${count})` : null;
            }).filter(Boolean);
            detectionDetails.push(`净水机标签: ${wpCounts.join(', ')}`);
          }
          
          // 根据检测结果生成原因说明
          let reason = '';
          if (overallQuality === '合格' && isCompleteKit) {
            // 齐套完成的情况
            reason = `✅ 齐套化完整！已检测到所有类别 (${detectedClasses.size}/${requiredClasses.length})。${detectionDetails.join(', ')}`;
          } else if (overallQuality === '合格') {
            reason = `齐套化完整。${detectionDetails.join(', ')}。完整率: ${complianceScore.toFixed(1)}%`;
          } else if (complianceScore === 50) {
            // 50%时显示"请自我检查确认"
            const detectedText = detectionDetails.length > 0 ? `已检测到: ${detectionDetails.join(', ')}` : '未检测到任何齐套化物品';
            reason = `请自我检查确认。${detectedText}。合规率: ${complianceScore.toFixed(1)}%`;
          } else if (complianceScore === 0) {
            // 0%时显示"请复检"
            const detectedText = detectionDetails.length > 0 ? `已检测到: ${detectionDetails.join(', ')}` : '未检测到任何齐套化物品';
            reason = `请复检。${detectedText}。合规率: ${complianceScore.toFixed(1)}%`;
          } else {
            // 其他存疑情况时明确指出缺少的齐套化物品
            // 检查缺少的类别
            const missingClasses = requiredClasses.filter(cls => !detectedClasses.has(cls));
            const missingClassNames = missingClasses.map(cls => getClassChineseName(cls)).join('、');
            const missingText = missingItems.length > 0 ? `缺少: ${missingItems.join('、')}` : (missingClasses.length > 0 ? `缺少类别: ${missingClassNames}` : '');
            const detectedText = detectionDetails.length > 0 ? `已检测到: ${detectionDetails.join(', ')}` : '未检测到任何齐套化物品';
            reason = `存疑原因: ${missingText}。${detectedText}。合规率: ${complianceScore.toFixed(1)}%`;
          }
          
          const result: InspectionResult = {
            id: uuidv4(),
            timestamp: new Date().toISOString(),
            image: imageData, // 保存当前检测的图片数据（base64格式）
            standardId: null, // 齐套化检测通常不需要特定标准
            overallQuality,
            score: complianceScore,
            reason,
            // @ts-ignore - detectionType 已在 types/index.ts 中添加，但 TypeScript 可能未识别
            detectionType: 'kit_matching' as const // 标记为齐套化检测
          };
          
          // 调试：记录图片数据信息（仅在开发模式下输出）
          if (process.env.NODE_ENV === 'development') {
            console.log(`检测结果 ${result.id} 图片数据:`, {
              hasImage: !!imageData,
              imageLength: imageData?.length || 0,
              imageStart: imageData?.substring(0, 50) || '无数据',
              imageEnd: imageData?.substring(imageData.length - 20) || '无数据'
            });
          }

          // ==================== 新增：执行验证 ====================
          // 检查是否启用了任何验证选项
          const hasValidationEnabled = validationOptions.enableOCR ||
                                        validationOptions.enableQRCode ||
                                        validationOptions.enableLLM ||
                                        validationOptions.enableSerialBinding;

          if (hasValidationEnabled) {
            // 执行验证流程
            const validatedResult = await performAllValidations(imageData, result);
            // 如果有存疑项，验证对话框会自动弹出，等待用户确认后再保存
            // 如果没有存疑项，直接添加到结果列表
            if (!validatedResult.isSuspicious) {
              inspectionResults.push(validatedResult);
            }
            // 如果存疑，结果会在用户确认后通过对话框的"确认提交"按钮保存
          } else {
            // 未启用验证，直接添加结果
            inspectionResults.push(result);
          }
        }
        
        // 只保留最近20个检测结果，最新的显示在最上面
        const currentResults = results || [];
        const allResults = [...inspectionResults, ...currentResults]; // 新结果放在前面
        setResults(allResults.slice(0, 20)); // 显示最近20个
        
        // 检测完成后清空抓拍图片 - 延迟执行，确保UI先显示抓拍结果
        setTimeout(() => {
          setCapturedImages([]);
          setLocalCapturedImages([]);
          setForceUpdate(prev => prev + 1);
        }, 2000); // 延迟2秒清空，让用户能看到抓拍结果
        const totalResults = results.length + inspectionResults.length;
        const remainingSlots = Math.max(0, 1000 - totalResults);
        toast.success(`后端齐套化检测完成，共检测 ${inspectionResults.length} 张图片 (显示: ${Math.min(results.length, 20)}/20, 存储: ${remainingSlots}/1000)`, { id: 'safety-inspection' });
        
        // 保存结果到数据库（不包含图片）- 使用for循环确保顺序执行
        let savedCount = 0;
        let failedCount = 0;
        
        for (const result of inspectionResults) {
          try {
            // 保存检测结果（仅在开发模式下输出日志）
            if (process.env.NODE_ENV === 'development') {
              console.log(`正在保存检测结果 ${savedCount + failedCount + 1}/${inspectionResults.length}:`, result.overallQuality);
            }
            
            // 只保存到本地数据库，避免重复保存导致同一张图片产生不同结果
            await addAppResult(result);
            // 本地保存成功（仅在开发模式下输出日志）
            if (process.env.NODE_ENV === 'development') {
              console.log('✅ 本地保存成功');
            }
            savedCount++;
          } catch (error) {
            console.error('❌ 保存检测结果失败:', error);
            failedCount++;
            // 即使保存失败，也继续处理下一个结果
          }
        }
        
        // 显示保存结果统计
        if (failedCount > 0) {
          console.warn(`⚠️ 保存完成：成功 ${savedCount} 条，失败 ${failedCount} 条`);
          toast.error(`检测结果保存完成：成功 ${savedCount} 条，失败 ${failedCount} 条`, { 
            id: 'save-results',
            duration: 5000 
          });
        } else {
          // 检测结果保存成功（仅在开发模式下输出日志）
          if (process.env.NODE_ENV === 'development') {
            console.log(`✅ 所有检测结果保存成功：${savedCount} 条`);
          }
        }
        
        // 检测并上传完成后，确保清空累积状态（这是最后一道保障）
        // 注意：这个清空操作在 triggerAutoInspection 内部完成，但为了确保，
        // 如果 handleAutoInspection 或 handleManualInspection 已经清空过，这里不会重复清空
        // 这里主要是作为兜底逻辑
        
      } catch (error) {
        toast.error('后端齐套化检测失败: ' + (error instanceof Error ? error.message : '未知错误'), { id: 'safety-inspection' });
      } finally {
        // 重置检测状态
        isDetectingRef.current = false;
        setIsDetecting(false);
        // 检测状态解锁（仅在开发模式下输出日志）
        if (process.env.NODE_ENV === 'development') {
          console.log(`🔓 检测状态已解锁，可以接受新的检测请求`);
        }
      }
  }, [addResult, performDetection, config, lastDetectionTime, isDetecting, currentModel, modelName, getCurrentModelClasses]);
  
  // 将 triggerAutoInspection 赋值给 ref，供其他函数使用
  useEffect(() => {
    triggerAutoInspectionRef.current = triggerAutoInspection;
  }, [triggerAutoInspection]);

  // 获取当前帧图片数据
  const captureCurrentFrame = useCallback(async (): Promise<string | null> => {
    const videoElement = videoRef.current;
    if (!videoElement || !isCameraOn) {
      console.log('获取当前帧失败：摄像头未开启');
      return null;
    }

    if (videoElement.readyState < 2) {
      console.log('获取当前帧失败：视频流未准备好，readyState:', videoElement.readyState);
      return null;
    }

    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      console.log('获取当前帧失败：video尺寸为0');
      return null;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.log('获取当前帧失败：无法创建canvas上下文');
      return null;
    }

    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    ctx.drawImage(videoElement, 0, 0);

    // 检查canvas是否有内容
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const hasContent = imageData.data.some(pixel => pixel !== 0);

    if (!hasContent) {
      console.log('获取当前帧失败：无法获取视频内容');
      return null;
    }

    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      const base64Data = dataUrl.split(',')[1];
      return base64Data;
    } catch (error) {
      console.error('获取当前帧失败：转换图片格式失败', error);
      return null;
    }
  }, [isCameraOn]);

  // 自动抓拍（带检测结果）
  const handleAutoCapture = useCallback((detections: YoloDetection[] = [], imageData?: string) => {
    if (!videoRef.current || !isCameraOn) {
      console.log('自动抓拍失败：摄像头未开启');
      return;
    }
    const videoElement = videoRef.current;

    // 更严格的video状态检查
    if (videoElement.readyState < 2) {
      console.log('自动抓拍失败：视频流未准备好，readyState:', videoElement.readyState);
      return;
    }
    if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
      console.log('自动抓拍失败：video尺寸为0');
      return;
    }

    // 自动抓拍调试信息（仅在开发模式下输出）
    if (process.env.NODE_ENV === 'development') {
      console.log('自动抓拍调试信息:', {
        videoWidth: videoElement.videoWidth,
        videoHeight: videoElement.videoHeight,
        offsetWidth: videoElement.offsetWidth,
        offsetHeight: videoElement.offsetHeight,
        readyState: videoElement.readyState,
        currentTime: videoElement.currentTime,
        duration: videoElement.duration
      });
    }

    // 如果有传入的图片数据，直接使用；否则抓拍当前帧
    const processImage = (base64Image: string) => {
      // 抓拍图片处理（仅在开发模式下输出日志）
      if (process.env.NODE_ENV === 'development') {
        console.log('开始处理抓拍图片，base64长度:', base64Image.length);
      }
      
      // 使用更直接的状态更新方式 - 每次只保留一张精选图片
      const newImages = [base64Image]; // 只保留最新的一张图片
      // 精选抓拍图片（仅在开发模式下输出日志）
      if (process.env.NODE_ENV === 'development') {
        console.log(`精选抓拍图片，数量: ${newImages.length}`);
      }
      
      // 同时更新两个状态确保UI正确显示
      setCapturedImages(newImages);
      setLocalCapturedImages(newImages);
      
      // 强制触发UI更新
      setForceUpdate(prev => prev + 1);
      
      // 立即触发检测，因为只有一张精选图片
      // 抓拍完成（仅在开发模式下输出日志）
      if (process.env.NODE_ENV === 'development') {
        console.log(`精选图片抓拍完成，立即触发检测`);
      }
      
      // 延迟一下再触发检测，确保状态更新完成
      setTimeout(() => {
        // 直接调用检测逻辑，传入精选图片
        triggerAutoInspection(newImages);
      }, 500); // 增加延迟时间，确保UI先更新显示抓拍图片
      
      const personCount = detections.filter(d => d.class === 'person').length;
      toast.success(`检测到 ${personCount} 名人员，已精选抓拍!`);
    };

    if (imageData) {
      // 使用传入的图片数据
      console.log('使用传入的图片数据进行抓拍');
      processImage(imageData);
    } else {
      // 抓拍当前帧
      setTimeout(() => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          console.log('自动抓拍失败：无法创建canvas上下文');
          return;
        }
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const hasContent = imageData.data.some(pixel => pixel !== 0);
        // Canvas内容检查（仅在开发模式下输出日志）
        if (process.env.NODE_ENV === 'development') {
          console.log('自动抓拍Canvas是否有内容:', hasContent);
        }

        if (!hasContent) {
          console.log('自动抓拍失败：无法获取视频内容');
          return;
        }

        const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
        processImage(base64Image);
      }, 100); // 延迟100ms
    }
  }, [isCameraOn, triggerAutoInspection]);

  // 手动抓拍
  const handleManualCapture = useCallback(() => {
    if (!videoRef.current || !isCameraOn) {
      toast.error('摄像头未开启');
      return;
    }
    
    const videoElement = videoRef.current;
    
    // 等待video完全加载
    if (videoElement.readyState < 2) {
      toast.error('视频流未准备好，请稍后再试');
      return;
    }
    
    console.log('手动抓拍调试信息:', {
      videoWidth: videoElement.videoWidth,
      videoHeight: videoElement.videoHeight,
      offsetWidth: videoElement.offsetWidth,
      offsetHeight: videoElement.offsetHeight,
      readyState: videoElement.readyState,
      currentTime: videoElement.currentTime,
      duration: videoElement.duration
    });
    
    // 创建canvas并设置尺寸
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      toast.error('无法创建canvas上下文');
      return;
    }
    
    // 设置canvas尺寸为video的实际尺寸
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    
    console.log('手动抓拍Canvas尺寸:', canvas.width, 'x', canvas.height);
    
    try {
      // 绘制当前视频帧到canvas
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // 检查canvas是否有内容
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const hasContent = imageData.data.some(pixel => pixel !== 0);
      console.log('手动抓拍Canvas是否有内容:', hasContent);
      
      if (!hasContent) {
        toast.error('抓拍失败：无法获取视频内容');
        return;
      }
      
      // 不绘制检测框，只在实时画面显示
      // if (currentDetections.length > 0) {
      //   drawDetections(currentDetections, canvas);
      // }
      
      // 转换为base64
      const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      console.log('手动抓拍完成，base64长度:', base64Image.length);
      
      // 使用更直接的状态更新方式 - 每次只保留一张精选图片
      const newImages = [base64Image]; // 只保留最新的一张图片
      console.log(`手动精选抓拍，数量: ${newImages.length}`);
      
      // 同时更新两个状态确保UI正确显示
      setCapturedImages(newImages);
      setLocalCapturedImages(newImages);
      
      // 强制触发UI更新
      setForceUpdate(prev => prev + 1);
      
      console.log('手动精选抓拍状态更新完成，新数量:', newImages.length);
      
    toast.success('已手动抓拍!');
      
    } catch (error) {
      console.error('手动抓拍错误:', error);
      toast.error('抓拍失败');
    }
  }, [isCameraOn]);

  // 开始/停止监控
  const toggleMonitoring = useCallback(() => {
    if (isMonitoring) {
      setIsMonitoring(false);
      setIsPpeActive(false);
      toast.success('已停止监控');
    } else {
      if (!isCameraOn) {
        toast.error('请先开启摄像头');
        return;
      }
      setIsMonitoring(true);
      setIsPpeActive(true);
      toast.success('开始实时监控，使用后端齐套化检测');
    }
  }, [isMonitoring, isCameraOn]);

  // 启动摄像头（支持物理摄像头和虚拟流媒体摄像头）
  const startCamera = useCallback(async (deviceId?: string) => {
    try {
      // 先停止之前的流媒体播放器（如果有）
      if (streamPlayerRef.current) {
        streamPlayerRef.current.destroy();
        streamPlayerRef.current = null;
      }
      if (hlsPlayerRef.current) {
        hlsPlayerRef.current.destroy();
        hlsPlayerRef.current = null;
      }

      // 先停止物理摄像头流（如果有）
      if (videoRef.current) {
        const existingStream = videoRef.current.srcObject as MediaStream;
        if (existingStream) {
          existingStream.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
        }
      }

      // 检查是否为虚拟流媒体摄像头
      const isVirtualCamera = deviceId?.startsWith('stream-');
      
      if (isVirtualCamera && deviceId && videoRef.current) {
        // 虚拟流媒体摄像头
        const streamId = deviceId.replace('stream-', ''); // 提取真实的流ID
        
        // 查找流媒体源信息以获取 play_mode
        const streamDevice = videoDevices.find((d: CameraDevice) => d.deviceId === deviceId);
        const playMode = streamDevice?.streamSource?.play_mode || 'ffmpeg';
        
        console.log(`[${windowId}] 启动虚拟流媒体摄像头: ${streamId}，播放模式: ${playMode}`);
        
        // 根据 play_mode 选择播放方案
        if (playMode === 'ffmpeg') {
          // 使用 FFmpeg/HLS 高画质方案（低CPU占用配置）
          try {
            console.log(`[${windowId}] 使用FFmpeg/HLS流（低CPU占用配置）`);
            const hlsResponse = await startHLSStream(streamId, {
              fps: 15,              // 降低帧率到15fps
              width: 1280,          // 降低分辨率到1280px宽度
              crf: 26,              // 降低质量（值越大CPU占用越低）
              preset: 'ultrafast',  // 最快编码预设
              threads: 2            // 限制使用2个CPU核心
            });
            const hlsUrl = hlsResponse.hls_url;
          
            const hlsPlayer = new HLSPlayer({
              videoElement: videoRef.current,
              hlsUrl: hlsUrl,
              onError: (error) => {
                console.error('HLS播放错误:', error);
                toast.error(`HLS播放失败: ${error.message}`);
              },
              onLoaded: () => {
                console.log(`[${windowId}] HLS流加载完成`);
                toast.success('HLS流启动成功（低CPU占用配置）');
              },
            });
            
            await hlsPlayer.start();
            hlsPlayerRef.current = hlsPlayer;
            return; // HLS成功，直接返回
            
          } catch (hlsError) {
            console.error(`[${windowId}] HLS启动失败:`, hlsError);
            toast.error('HLS流启动失败');
            throw hlsError;
          }
        } else {
          // 使用 JPEG 方案（默认，推荐：无压缩，质量100）
          console.log(`[${windowId}] 使用JPEG流（无压缩画质方案）`);
          try {
            const player = new StreamPlayer({
              videoElement: videoRef.current,
              streamId: streamId,
              fps: 15,  // 降低帧率以减少CPU占用
              quality: 100,  // JPEG质量100（无压缩）
              targetWidth: 1280,  // 降低分辨率以减少CPU占用
              windowId: windowId,
              onError: (error) => {
                console.error('StreamPlayer错误:', error);
                toast.error(`流媒体播放失败: ${error.message}`);
              },
              onStreamTaken: () => {
                console.log(`[${windowId}] 流媒体被其他窗口占用`);
                toast.error('无法访问摄像头：未知错误。\n\n如果另一个窗口正在使用摄像头，请在该窗口中选择不同的摄像头设备。', {
                  duration: 5000,
                });
                setIsCameraOn(false);
                setIsMonitoring(false);
                setIsPpeActive(false);
              }
            });
            
            streamPlayerRef.current = player;
            await player.start();
            toast.success('流媒体启动成功（JPEG无压缩方案）');
          } catch (jpgError) {
            console.error('JPEG方案失败:', jpgError);
            toast.error('流媒体启动失败');
            throw jpgError;
          }
        }
      } else {
        // 物理摄像头
        console.log(`[${windowId}] 启动物理摄像头: ${deviceId || '默认'}`);
        const stream = await getUserMediaCompat({
          video: deviceId ? { deviceId: { exact: deviceId } } : true
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : '无法访问摄像头';
      console.error('启动摄像头失败:', err);
      toast.error(msg);
    }
  }, [getUserMediaCompat, windowId, videoDevices]);

  // 开启/关闭摄像头
  const toggleCamera = useCallback(async () => {
    if (isCameraOn) {
      console.log(`[${windowId}] 关闭摄像头`);
      // 停止流媒体播放器
      if (streamPlayerRef.current) {
        streamPlayerRef.current.destroy();
        streamPlayerRef.current = null;
      }
      if (hlsPlayerRef.current) {
        hlsPlayerRef.current.destroy();
        hlsPlayerRef.current = null;
      }
      // 停止物理摄像头流
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsCameraOn(false);
      setIsMonitoring(false);
      setIsPpeActive(false);
      toast.success(`[${windowId.slice(-8)}] 摄像头已关闭`);
    } else {
      console.log(`[${windowId}] 开启摄像头`);
      try {
        // 检查是否为虚拟摄像头（流媒体）
        const isVirtualCamera = selectedDeviceId?.startsWith('stream-');
        
        if (isVirtualCamera) {
          // 虚拟摄像头：通过 startCamera 启动
          await startCamera(selectedDeviceId);
          setIsCameraOn(true);
        } else {
          // 物理摄像头
          const constraints: MediaStreamConstraints = {
            video: {
              deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
              width: { ideal: 1280 },
              height: { ideal: 720 }
            }
          };
          
          console.log(`[${windowId}] 尝试启动物理摄像头:`, selectedDeviceId);
          const stream = await getUserMediaCompat(constraints);
          if (videoRef.current) videoRef.current.srcObject = stream;
          setIsCameraOn(true);
          toast.success(`[${windowId.slice(-8)}] 摄像头已开启`);
          
          // 监听流状态
          stream.getVideoTracks().forEach(track => {
            track.addEventListener('ended', () => {
              console.log(`[${windowId}] 摄像头轨道已结束，可能是被其他窗口占用`);
              setIsCameraOn(false);
              setIsMonitoring(false);
              setIsPpeActive(false);
            });
          });
        }
        
      } catch (err) { 
        console.error(`[${windowId}] 无法访问摄像头:`, err);
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        if (errorMessage.includes('Permission denied')) {
          toast.error(`[${windowId.slice(-8)}] 摄像头权限被拒绝，请检查浏览器权限设置`);
        } else if (errorMessage.includes('NotReadableError') || errorMessage.includes('NotAllowedError')) {
          toast.error(`[${windowId.slice(-8)}] 摄像头被其他应用占用，请关闭其他使用摄像头的应用后重试`);
        } else {
          toast.error(`[${windowId.slice(-8)}] 无法访问摄像头: ${errorMessage}`);
        }
      }
    }
  }, [isCameraOn, selectedDeviceId, windowId, startCamera]);

  // 切换摄像头
  const switchCamera = useCallback(async (deviceId: string) => {
    console.log(`[${windowId}] 切换摄像头到:`, deviceId);
    setSelectedDeviceId(deviceId);
    
    // 如果摄像头正在运行，重新启动
    if (isCameraOn) {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach(track => track.stop());
      await toggleCamera();
    }
  }, [isCameraOn, toggleCamera, windowId]);

  // 摄像头开关/切换时自动启动
  useEffect(() => {
    if (isCameraOn) {
      startCamera(selectedDeviceId);
    }
  }, [isCameraOn, selectedDeviceId, startCamera]);

  // 获取摄像头列表
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          console.warn('MediaDevices API 不可用，无法枚举设备');
          if (mounted) setVideoDevices([]);
          return;
        }
        const devices = await getCameraDevices();
        if (mounted) setVideoDevices(devices as unknown as MediaDeviceInfo[]);
      } catch (e) {
        console.error('获取摄像头列表失败:', e);
        if (mounted) setVideoDevices([]);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // 检测齐套化物品（手动触发）
  const handleSafetyInspection = useCallback(async () => {
    if (capturedImages.length === 0) return;
    
    console.log(`手动触发检测，图片数量: ${capturedImages.length}`);
    // 直接调用自动检测函数
    await triggerAutoInspection(capturedImages);
  }, [capturedImages, triggerAutoInspection]);

  // 画布尺寸设置 - 完全参考LiveInspectionScreen
  useEffect(() => {
    if (!detectionCanvasRef.current || !videoRef.current || !showDetections || !isPpeActive) return;
    
    const canvas = detectionCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // 等待视频加载完成
    if (videoRef.current.videoWidth === 0 || videoRef.current.videoHeight === 0) return;
    
    // 设置画布尺寸与视频尺寸一致
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    console.log('画布尺寸设置完成:', {
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      videoWidth: videoRef.current.videoWidth,
      videoHeight: videoRef.current.videoHeight
    });
  }, [showDetections, isPpeActive, isCameraOn]);

  // 实时齐套化检测定时器 - 简化实现，参考LiveInspectionScreen
  useEffect(() => {
    if (!isPpeActive) return;
    
    const interval = setInterval(runPpeDetection, 2000); // 固定2秒间隔
    return () => clearInterval(interval);
  }, [isPpeActive, runPpeDetection]);

  // 初次挂载时检查一次后端模型状态
  useEffect(() => {
    (async () => {
      try {
        const status = await getYoloStatus();
        console.log('YOLO状态:', status);
      } catch (error) {
        console.error('获取YOLO状态失败:', error);
      }
    })();
  }, []);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 空格键：如果有ROI截图则触发手动检验，否则触发抓拍
      if (e.code === 'Space' && isCameraOn) { 
        e.preventDefault(); 
        // 检查是否在冷却时间内
        const now = Date.now();
        const cooldownMs = inspectionCooldownInterval * 1000;
        if (now - lastInspectionTimeRef.current < cooldownMs) {
          const remaining = Math.ceil((cooldownMs - (now - lastInspectionTimeRef.current)) / 1000);
          toast.error(`请等待 ${remaining} 秒后再进行检测`, { duration: 2000 });
          return;
        }
        
        // 如果有ROI截图，触发手动检验
        if (roiSnapshots.length > 0) {
          handleManualInspection();
        } else {
          // 否则触发抓拍
          handleManualCapture(); 
        }
      }
      // 回车键：如果有抓拍图片，触发旧版检测（兼容性保留）
      if (e.code === 'Enter' && localCapturedImages.length > 0) { 
        e.preventDefault(); 
        handleSafetyInspection(); 
      }
      if (e.code === 'KeyM' && isCameraOn) { 
        e.preventDefault(); 
        toggleMonitoring(); 
      }
      if (e.code === 'KeyL') { 
        e.preventDefault(); 
        loadYoloModel(); 
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, [isCameraOn, handleManualCapture, localCapturedImages.length, handleSafetyInspection, toggleMonitoring, loadYoloModel, roiSnapshots.length, handleManualInspection, inspectionCooldownInterval]);

  // 冷却时间倒计时更新
  useEffect(() => {
    if (inspectionCooldownInterval === 0) {
      setIsInCooldown(false);
      return;
    }
    
    const interval = setInterval(() => {
      const now = Date.now();
      const cooldownMs = inspectionCooldownInterval * 1000;
      const isCooldown = now - lastInspectionTimeRef.current < cooldownMs;
      setIsInCooldown(isCooldown);
    }, 100); // 每100ms更新一次，实现流畅的倒计时
    
    return () => clearInterval(interval);
  }, [inspectionCooldownInterval]);

  // 清空最优识别结果
  const handleClearCapturedImages = () => {
    setCapturedImages([]);
    setLocalCapturedImages([]);
    setForceUpdate(prev => prev + 1);
    toast.success('已清空精选抓拍图片');
  };

  // 保存到临时文件夹
  const handleSaveToTempFolder = async () => {
    if (localCapturedImages.length === 0) {
      toast.error('没有图片可保存，请先抓拍图片');
      return;
    }
    
    console.log(`开始保存 ${localCapturedImages.length} 张图片到临时文件夹`);
    let successCount = 0;
    
    for (let i = 0; i < localCapturedImages.length; i++) {
      const fileName = `clean_capture_${Date.now()}_${i}.jpg`;
      const base64Image = localCapturedImages[i]; // 直接使用base64数据，不添加data URL前缀
      
      try {
        console.log(`保存第 ${i + 1} 张图片: ${fileName}`);
        const saveResponse = await fetch('/api/rpa/save-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image, fileName, folder: tempFolderPath })
        });
        
        if (saveResponse.ok) {
          const result = await saveResponse.json();
          console.log(`第 ${i + 1} 张图片保存成功:`, result);
          successCount++;
        } else {
          console.error(`第 ${i + 1} 张图片保存失败:`, saveResponse.status, saveResponse.statusText);
        }
      } catch (error) {
        console.error(`第 ${i + 1} 张图片保存出错:`, error);
      }
    }
    
    if (successCount > 0) {
      toast.success(`成功保存 ${successCount}/${localCapturedImages.length} 张图片到临时文件夹`);
    } else {
      toast.error('保存图片失败，请检查控制台日志');
    }
  };

  // 打开临时文件夹
  const handleOpenTempFolder = async () => {
    const response = await fetch('/api/rpa/open-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: tempFolderPath })
    });
    if (response.ok) {
      toast.success('已打开临时文件夹');
    } else {
      toast.error('打开临时文件夹失败');
    }
  };

  // 清空临时文件夹
  const handleClearTempFolder = async () => {
    const response = await fetch('/api/rpa/clear-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath: tempFolderPath })
    });
    if (response.ok) {
      const result = await response.json();
      toast.success(`已清空临时文件夹，删除了 ${result.deletedCount} 个文件`);
    } else {
      toast.error('清空临时文件夹失败');
    }
  };

  // 全屏切换功能
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      // 进入全屏
      const videoContainer = document.getElementById('video-container');
      if (videoContainer) {
        videoContainer.requestFullscreen().then(() => {
          setIsFullscreen(true);
        }).catch(err => {
          console.error('全屏失败:', err);
          toast.error('全屏失败');
        });
      }
    } else {
      // 退出全屏
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch(err => {
        console.error('退出全屏失败:', err);
        toast.error('退出全屏失败');
      });
    }
  };

  // 监听全屏状态变化
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // 组件卸载时清理摄像头资源
  useEffect(() => {
    return () => {
      // 组件卸载时停止所有摄像头轨道
      const stream = videoRef.current?.srcObject as MediaStream;
      if (stream) {
        stream.getTracks().forEach(track => {
          track.stop();
        });
      }
    };
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 h-full">
      {/* 左侧：实时监控和抓拍图片区域 */}
      <div className="flex flex-col gap-4">
        <Card className="flex flex-col">
        <CardHeader>
          <div className="flex flex-col gap-2">
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              齐套化实时监控
            </CardTitle>
            {/* 当前模型显示 */}
            <div className="flex items-center gap-2">
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
            {/* 齐套化检测进度显示 - 动态显示已检测数/总数（始终显示） */}
            {(() => {
              const requiredClasses = getCurrentModelClasses();
              const detectedCount = Array.from(accumulatedDetectedClasses).filter(cls => requiredClasses.includes(cls)).length;
              const totalCount = requiredClasses.length;
              const percentage = totalCount > 0 ? (detectedCount / totalCount) * 100 : 0;
              
              return (
                <div className={`
                  px-4 py-2 rounded-lg border-2 shadow-lg font-semibold text-sm transition-colors
                  ${percentage === 100
                    ? 'bg-green-500 text-white border-green-600'
                    : detectedCount > 0
                    ? 'bg-yellow-500 text-white border-yellow-600'
                    : 'bg-gray-500 text-white border-gray-600'
                  }
                `}>
                  <div className="flex items-center gap-2">
                    <span>齐套化检测进度</span>
                    <span className="font-bold">
                      {detectedCount}/{totalCount}
                    </span>
                    <span className="text-xs opacity-90">
                      ({Math.round(percentage)}%)
                    </span>
                    {roiSnapshots.length > 0 && (
                      <span className="text-xs opacity-75 ml-2">
                        (已暂存 {roiSnapshots.length} 张ROI)
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </CardHeader>
        <CardContent className="flex-grow flex flex-col space-y-4">
          {/* 移除YOLO模型状态与加载按钮 */}
          
          {/* 移除模型性能对比信息 */}

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
              className={cn("w-full h-full object-cover", { "hidden": !isCameraOn })} 
            />
            <canvas 
              ref={detectionCanvasRef}
              className={cn("absolute inset-0 w-full h-full pointer-events-none z-10", { "hidden": !isCameraOn || !showDetections || !isPpeActive })}
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
            
            {/* 监控状态指示器 */}
            {isMonitoring && (
              <div className="absolute top-2 left-2 flex items-center gap-2 bg-red-500 text-white px-2 py-1 rounded text-xs">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                监控中
              </div>
            )}
            
            {/* 检测统计（仅在监控时显示详细统计） */}
            {isMonitoring && (
              <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-white px-3 py-2 rounded-lg text-xs space-y-1">
                <div>人员: {detectionStats.personDetections}</div>
                <div>装备: {detectionStats.equipmentDetections}</div>
                {roiSnapshots.length > 0 && (
                  <div className="text-yellow-300">ROI暂存: {roiSnapshots.length} 张</div>
                )}
              </div>
            )}
            
            {/* 移除模型状态显示 */}
          </div>

          {/* 窗口信息和调试信息 */}
          <div className="text-xs text-slate-500 space-y-1">
            <div className="font-medium text-blue-400">
              窗口ID: {windowId.slice(-8)}
            </div>
            <div>
              检测到 {videoDevices.length} 个摄像头设备
              {selectedDeviceId && `，当前选择: ${videoDevices.find(d => d.deviceId === selectedDeviceId)?.label || '未知'}`}
            </div>
          </div>
          
          {/* 摄像头选择器 */}
          <Select value={selectedDeviceId} onValueChange={switchCamera}>
            <SelectTrigger className="w-full bg-slate-800 border-slate-600">
              <SelectValue placeholder={videoDevices.length > 0 ? "选择摄像头" : "未检测到摄像头"} />
            </SelectTrigger>
            <SelectContent>
              {videoDevices.length > 0 ? (
                videoDevices
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
          
          {/* 控制按钮 */}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={toggleCamera} variant={isCameraOn ? "destructive" : "default"}>
              <Camera className="mr-2 h-4 w-4"/>
              {isCameraOn ? '关闭摄像头' : '开启摄像头'}
            </Button>
            <Button 
              onClick={toggleMonitoring} 
              disabled={!isCameraOn}
              variant={isMonitoring ? "destructive" : "default"}
            >
              {isMonitoring ? <Pause className="mr-2 h-4 w-4"/> : <Play className="mr-2 h-4 w-4"/>}
              {isMonitoring ? '停止监控' : '开始监控'}
            </Button>
          </div>
          
          {/* 检测模式切换 - 始终显示，让用户提前了解功能 */}
          <div className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
            <div className="flex flex-col gap-1">
              <Label className="text-sm">检测模式</Label>
              <div className="text-xs text-slate-400">
                {detectionMode === 'auto' 
                  ? '达到所有类别时自动检验' 
                  : '手动点击检验按钮触发'}
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={detectionMode === 'auto' ? 'default' : 'outline'}
                onClick={() => setDetectionMode('auto')}
                className={detectionMode === 'auto' ? 'bg-blue-600' : ''}
                disabled={isMonitoring}
              >
                自动
              </Button>
              <Button
                size="sm"
                variant={detectionMode === 'manual' ? 'default' : 'outline'}
                onClick={() => setDetectionMode('manual')}
                className={detectionMode === 'manual' ? 'bg-blue-600' : ''}
                disabled={isMonitoring}
              >
                手动
              </Button>
            </div>
          </div>
          
          {/* 手动检验按钮 */}
          {detectionMode === 'manual' && isMonitoring && (
            <Button 
              onClick={handleManualInspection}
              disabled={roiSnapshots.length === 0}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              手动检验
              {(() => {
                const requiredClasses = getCurrentModelClasses();
                const detectedCount = Array.from(accumulatedDetectedClasses).filter(cls => requiredClasses.includes(cls)).length;
                const totalCount = requiredClasses.length;
                return totalCount > 0 && detectedCount > 0 ? ` (${detectedCount}/${totalCount})` : '';
              })()}
            </Button>
          )}
          
          {/* 重置按钮 - 如果有检测进度或ROI截图时显示 */}
          {(accumulatedDetectedClasses.size > 0 || roiSnapshots.length > 0) && (
            <Button 
              onClick={() => {
                setAccumulatedDetectedClasses(new Set());
                setRoiSnapshots([]);
                setIsComplete(false);
                toast.success('检测状态已重置');
              }}
              variant="outline"
              size="sm"
              className="w-full"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              重置检测状态
              {roiSnapshots.length > 0 && (
                <span className="ml-2 text-xs">(清除 {roiSnapshots.length} 张ROI)</span>
              )}
            </Button>
          )}

          {/* 设置选项 */}
          <div className="space-y-3 p-3 bg-slate-800/50 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">自动抓拍</Label>
                <div className="text-xs text-slate-400 mt-1">检测到人员时自动抓拍</div>
              </div>
              <Switch 
                checked={autoCapture} 
                onCheckedChange={setAutoCapture}
              />
            </div>
            
            {/* 阈值设置区域 */}
            <div className="border-t border-white/10 pt-3 mt-3">
              <div 
                className="flex items-center justify-between cursor-pointer hover:bg-slate-700/30 active:bg-slate-700/50 rounded-md p-2 -m-2 transition-colors select-none"
                onClick={() => {
                  const newExpanded = !isSettingsExpanded;
                  setIsSettingsExpanded(newExpanded);
                  // zustand store 自动处理持久化
                }}
              >
                <div className="text-xs text-slate-400">齐套化物品检测阈值设置</div>
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
              <div className={cn(
                "space-y-3 transition-all duration-300 ease-in-out overflow-hidden",
                isSettingsExpanded ? "max-h-[1200px] opacity-100 mt-3" : "max-h-0 opacity-0 mt-0"
              )}>
                {(() => {
                  // 将类别分组
                  const allClasses = getAllModelClasses();
                  const nameClasses = allClasses.filter(cls => cls.startsWith('name_'));
                  const labelClasses = allClasses.filter(cls => cls.includes('_label'));
                  const otherClasses = allClasses.filter(cls => !nameClasses.includes(cls) && !labelClasses.includes(cls));
                  
                  const toggleGroup = (groupName: string) => {
                    setExpandedGroups(prev => {
                      const newSet = new Set(prev);
                      if (newSet.has(groupName)) {
                        newSet.delete(groupName);
                      } else {
                        newSet.add(groupName);
                      }
                      return newSet;
                    });
                  };
                  
                  const renderThresholdItem = (className: string) => {
                    const thresholdValue = ((ppeThresholds as unknown) as Record<string, number>)[className] ?? 0.8;
                    return (
                      <div key={className} className="flex items-center justify-between gap-2 p-1.5 bg-slate-700/30 rounded">
                        <Label className="text-xs flex-1 truncate" title={getClassChineseName(className)}>
                          {getClassChineseName(className)}
                        </Label>
                        <Select 
                          value={thresholdValue.toString()} 
                          onValueChange={(value) => {
                            const newThresholds = {
                              ...ppeThresholds,
                              [className]: parseFloat(value)
                            } as typeof ppeThresholds;
                            setPpeThresholds(newThresholds);
                          }}
                        >
                          <SelectTrigger className="w-20 h-7 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="0">0%</SelectItem>
                            <SelectItem value="0.3">30%</SelectItem>
                            <SelectItem value="0.4">40%</SelectItem>
                            <SelectItem value="0.5">50%</SelectItem>
                            <SelectItem value="0.6">60%</SelectItem>
                            <SelectItem value="0.7">70%</SelectItem>
                            <SelectItem value="0.8">80%</SelectItem>
                            <SelectItem value="0.85">85%</SelectItem>
                            <SelectItem value="0.9">90%</SelectItem>
                            <SelectItem value="0.95">95%</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  };
                  
                  return (
                    <div className="space-y-2">
                      {/* 名称类分组 */}
                      {nameClasses.length > 0 && (
                        <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                          <div 
                            className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                            onClick={() => toggleGroup('names')}
                          >
                            <Label className="text-xs font-medium">名称类 ({nameClasses.length})</Label>
                            {expandedGroups.has('names') ? (
                              <ChevronUp className="h-3 w-3 text-slate-400" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-slate-400" />
                            )}
                          </div>
                          {expandedGroups.has('names') && (
                            <div className="p-2 space-y-1.5">
                              <div className="grid grid-cols-2 gap-1.5">
                                {nameClasses.map(renderThresholdItem)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* 标签类分组 */}
                      {labelClasses.length > 0 && (
                        <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                          <div 
                            className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                            onClick={() => toggleGroup('labels')}
                          >
                            <Label className="text-xs font-medium">标签类 ({labelClasses.length})</Label>
                            {expandedGroups.has('labels') ? (
                              <ChevronUp className="h-3 w-3 text-slate-400" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-slate-400" />
                            )}
                          </div>
                          {expandedGroups.has('labels') && (
                            <div className="p-2 space-y-1.5">
                              <div className="grid grid-cols-2 gap-1.5">
                                {labelClasses.map(renderThresholdItem)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* 其他类分组 */}
                      {otherClasses.length > 0 && (
                        <div className="border border-slate-600/50 rounded-lg overflow-hidden">
                          <div 
                            className="flex items-center justify-between p-2 bg-slate-700/50 cursor-pointer hover:bg-slate-700/70 transition-colors"
                            onClick={() => toggleGroup('others')}
                          >
                            <Label className="text-xs font-medium">其他类 ({otherClasses.length})</Label>
                            {expandedGroups.has('others') ? (
                              <ChevronUp className="h-3 w-3 text-slate-400" />
                            ) : (
                              <ChevronDown className="h-3 w-3 text-slate-400" />
                            )}
                          </div>
                          {expandedGroups.has('others') && (
                            <div className="p-2 space-y-1.5">
                              <div className="grid grid-cols-2 gap-1.5">
                                {otherClasses.map(renderThresholdItem)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
                
                {/* 人员检测阈值 - 仅在模型支持人员检测时显示 */}
                {doesModelSupportPersonDetection() && (
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm">人员检测阈值</Label>
                      <div className="text-xs text-slate-400 mt-1">检测到人员时的抓拍触发阈值</div>
                    </div>
                    <Select 
                      value={ppeThresholds.person.toString()} 
                      onValueChange={(value) => {
                        const newThresholds = {
                          ...ppeThresholds,
                          person: parseFloat(value)
                        };
                        setPpeThresholds(newThresholds);
                        // zustand store 自动处理持久化
                      setPpeThresholds(newThresholds);
                      }}
                    >
                      <SelectTrigger className="w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0% (关闭)</SelectItem>
                        <SelectItem value="0.3">30%</SelectItem>
                        <SelectItem value="0.4">40%</SelectItem>
                        <SelectItem value="0.5">50%</SelectItem>
                        <SelectItem value="0.6">60%</SelectItem>
                        <SelectItem value="0.7">70%</SelectItem>
                        <SelectItem value="0.8">80%</SelectItem>
                        <SelectItem value="0.85">85%</SelectItem>
                        <SelectItem value="0.9">90%</SelectItem>
                        <SelectItem value="0.95">95%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* ==================== 新增：验证选项 ==================== */}
                <div className="border-t border-white/10 pt-3 mt-3">
                  <div className="text-xs text-slate-400 mb-3">数据验证选项</div>

                  {/* OCR识别 */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <ScanText className="h-4 w-4 text-blue-400" />
                        <div>
                          <Label className="text-sm">OCR识别</Label>
                          <div className="text-xs text-slate-400 mt-0.5">识别图片中的文字信息</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowKeywordSettings(!showKeywordSettings)}
                          className="h-6 px-2 text-xs"
                        >
                          {showKeywordSettings ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                        <Switch
                          checked={validationOptions.enableOCR}
                          onCheckedChange={(checked) =>
                            setValidationOptions(prev => ({ ...prev, enableOCR: checked }))
                          }
                        />
                      </div>
                    </div>

                    {/* 关键词配置界面 */}
                    {showKeywordSettings && (
                      <div className="pl-6 mt-2 space-y-2 bg-slate-800/30 p-3 rounded border border-slate-600/30">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">关键词配置</Label>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setKeywordConfigs([...keywordConfigs, {
                                text: '',
                                confidence: 0.8,
                                type: 'positive',
                                requiredCount: 1
                              }]);
                            }}
                            className="h-6 text-xs px-2"
                          >
                            添加关键词
                          </Button>
                        </div>

                        {keywordConfigs.length === 0 ? (
                          <div className="text-xs text-slate-500 text-center py-2">
                            暂无关键词配置
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {keywordConfigs.map((config, index) => (
                              <div key={index} className="bg-slate-700/50 p-2 rounded border border-slate-600/30 space-y-2">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="text"
                                    value={config.text}
                                    onChange={(e) => {
                                      const newConfigs = [...keywordConfigs];
                                      newConfigs[index].text = e.target.value;
                                      setKeywordConfigs(newConfigs);
                                    }}
                                    placeholder="关键词文本"
                                    className="flex-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setKeywordConfigs(keywordConfigs.filter((_, i) => i !== index));
                                    }}
                                    className="h-6 px-2 text-red-400 border-red-600"
                                  >
                                    删除
                                  </Button>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                  <div>
                                    <Label className="text-xs text-slate-400">类型</Label>
                                    <Select
                                      value={config.type || 'positive'}
                                      onValueChange={(value) => {
                                        const newConfigs = [...keywordConfigs];
                                        newConfigs[index].type = value as 'positive' | 'negative';
                                        setKeywordConfigs(newConfigs);
                                      }}
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="positive">正面</SelectItem>
                                        <SelectItem value="negative">排除</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs text-slate-400">置信度</Label>
                                    <input
                                      type="number"
                                      min="0"
                                      max="1"
                                      step="0.1"
                                      value={config.confidence}
                                      onChange={(e) => {
                                        const newConfigs = [...keywordConfigs];
                                        newConfigs[index].confidence = parseFloat(e.target.value);
                                        setKeywordConfigs(newConfigs);
                                      }}
                                      className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"
                                    />
                                  </div>
                                  {config.type !== 'negative' && (
                                    <div>
                                      <Label className="text-xs text-slate-400">次数</Label>
                                      <input
                                        type="number"
                                        min="1"
                                        value={config.requiredCount || 1}
                                        onChange={(e) => {
                                          const newConfigs = [...keywordConfigs];
                                          newConfigs[index].requiredCount = parseInt(e.target.value);
                                          setKeywordConfigs(newConfigs);
                                        }}
                                        className="w-full px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 二维码识别 */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <QrCode className="h-4 w-4 text-green-400" />
                        <div>
                          <Label className="text-sm">二维码识别</Label>
                          <div className="text-xs text-slate-400 mt-0.5">识别图片中的二维码</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowBarcodeSettings(!showBarcodeSettings)}
                          className="h-6 px-2 text-xs"
                        >
                          {showBarcodeSettings ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        </Button>
                        <Switch
                          checked={validationOptions.enableQRCode}
                          onCheckedChange={(checked) =>
                            setValidationOptions(prev => ({ ...prev, enableQRCode: checked }))
                          }
                        />
                      </div>
                    </div>

                    {/* 二维码配置界面 */}
                    {showBarcodeSettings && (
                      <div className="pl-6 mt-2 space-y-2 bg-slate-800/30 p-3 rounded border border-slate-600/30">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs">二维码配置</Label>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setBarcodeConfigs([...barcodeConfigs, {
                                id: Date.now().toString(),
                                expectedText: '',
                                matchMode: 'contains',
                                enabled: true
                              }]);
                            }}
                            className="h-6 text-xs px-2"
                          >
                            添加二维码
                          </Button>
                        </div>

                        {barcodeConfigs.length === 0 ? (
                          <div className="text-xs text-slate-500 text-center py-2">
                            暂无二维码配置
                          </div>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto">
                            {barcodeConfigs.map((config, index) => (
                              <div key={config.id} className="bg-slate-700/50 p-2 rounded border border-slate-600/30">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={config.enabled}
                                    onChange={(e) => {
                                      const newConfigs = [...barcodeConfigs];
                                      newConfigs[index].enabled = e.target.checked;
                                      setBarcodeConfigs(newConfigs);
                                    }}
                                    className="rounded"
                                  />
                                  <input
                                    type="text"
                                    value={config.expectedText}
                                    onChange={(e) => {
                                      const newConfigs = [...barcodeConfigs];
                                      newConfigs[index].expectedText = e.target.value;
                                      setBarcodeConfigs(newConfigs);
                                    }}
                                    placeholder="期望的二维码文本"
                                    className="flex-1 px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"
                                  />
                                  <select
                                    value={config.matchMode}
                                    onChange={(e) => {
                                      const newConfigs = [...barcodeConfigs];
                                      newConfigs[index].matchMode = e.target.value as 'contains' | 'exact';
                                      setBarcodeConfigs(newConfigs);
                                    }}
                                    className="px-2 py-1 bg-slate-800 border border-slate-600 rounded text-xs text-white"
                                  >
                                    <option value="contains">包含</option>
                                    <option value="exact">完全匹配</option>
                                  </select>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      setBarcodeConfigs(barcodeConfigs.filter((_, i) => i !== index));
                                    }}
                                    className="h-6 px-2 text-red-400 border-red-600"
                                  >
                                    删除
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* LLM检测 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Brain className="h-4 w-4 text-purple-400" />
                      <div>
                        <Label className="text-sm">LLM智能分析</Label>
                        <div className="text-xs text-slate-400 mt-0.5">使用AI分析齐套完整性</div>
                      </div>
                    </div>
                    <Switch
                      checked={validationOptions.enableLLM}
                      onCheckedChange={(checked) =>
                        setValidationOptions(prev => ({ ...prev, enableLLM: checked }))
                      }
                    />
                  </div>

                  {/* 序列号绑定 */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Hash className="h-4 w-4 text-amber-400" />
                      <div>
                        <Label className="text-sm">序列号绑定</Label>
                        <div className="text-xs text-slate-400 mt-0.5">验证序列号与二维码绑定</div>
                      </div>
                    </div>
                    <Switch
                      checked={validationOptions.enableSerialBinding}
                      onCheckedChange={(checked) =>
                        setValidationOptions(prev => ({ ...prev, enableSerialBinding: checked }))
                      }
                    />
                  </div>
                </div>

                {/* 重置阈值按钮 */}
                <div className="flex items-center justify-between">
                  <Label className="text-sm">重置为默认值</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      const defaultThresholds = {
                        ...ppeThresholds,
                        cleanroom_cap: 0.8, // 滤芯检测阈值
                        mask: 0.8, // 净水机检测阈值
                        person: 0.8, // 人员检测阈值
                      };
                      setPpeThresholds(defaultThresholds);
                    }}
                    className="w-24"
                  >
                    重置
                  </Button>
                </div>
                
                {/* 抓拍间隔设置 */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">最优保留间隔(秒)</Label>
                    <div className="text-xs text-slate-400 mt-1">保留指定时间内置信度最高的检测结果</div>
                  </div>
                  <Select 
                    value={captureInterval.toString()} 
                    onValueChange={(value) => {
                      const interval = parseInt(value);
                      // zustand store 自动处理持久化
                      setCaptureInterval(interval);
                    }}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1秒</SelectItem>
                      <SelectItem value="3">3秒</SelectItem>
                      <SelectItem value="5">5秒</SelectItem>
                      <SelectItem value="10">10秒</SelectItem>
                      <SelectItem value="30">30秒</SelectItem>
                      <SelectItem value="60">60秒</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* 检测间隔时间设置 */}
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">检测间隔时间(秒)</Label>
                    <div className="text-xs text-slate-400 mt-1">检测完成后距离下一轮的最小间隔时间</div>
                  </div>
                  <Select 
                    value={inspectionCooldownInterval.toString()} 
                    onValueChange={(value) => {
                      const interval = parseInt(value);
                      setInspectionCooldownInterval(interval);
                    }}
                  >
                    <SelectTrigger className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">无间隔</SelectItem>
                      <SelectItem value="1">1秒</SelectItem>
                      <SelectItem value="2">2秒</SelectItem>
                      <SelectItem value="3">3秒</SelectItem>
                      <SelectItem value="5">5秒</SelectItem>
                      <SelectItem value="10">10秒</SelectItem>
                      <SelectItem value="15">15秒</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>

          {/* 检测按钮 */}
          <Button 
            onClick={handleManualInspection} 
            disabled={roiSnapshots.length === 0 || isInCooldown} 
            className="w-full !py-3 !text-base"
          >
            <CircleDotDashed className="mr-2 h-4 w-4"/>
            开始齐套化检测 ({detectionMode === 'auto' ? '空格' : '回车'})
            {isInCooldown && (() => {
              const now = Date.now();
              const cooldownMs = inspectionCooldownInterval * 1000;
              const remaining = Math.ceil((cooldownMs - (now - lastInspectionTimeRef.current)) / 1000);
              return ` (冷却中 ${remaining}秒)`;
            })()}
          </Button>
        </CardContent>
      </Card>

      {/* 抓拍图片区域 - 在实时画面下方 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            抓拍图片 ({localCapturedImages.length}) {forceUpdate > 0 && `[更新${forceUpdate}]`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-xs text-slate-500 mb-2">
            精选抓拍：每次只保留一张最佳图片
          </div>
          {localCapturedImages.length > 0 ? (
            <div key={`captured-images-${forceUpdate}`} className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto pb-2">
              {localCapturedImages.map((img, i) => {
                return (
                  <img 
                    key={`${i}-${forceUpdate}`} 
                    src={`data:image/jpeg;base64,${img}`} 
                    className="h-20 w-full rounded-md object-cover border-2 border-transparent hover:border-accent"
                    alt={`抓拍图片 ${i + 1}`}
                    onLoad={() => {
                      // 抓拍图片加载成功（仅在开发模式下输出日志）
                      if (process.env.NODE_ENV === 'development') {
                        console.log(`抓拍图片 ${i + 1} 加载成功`);
                      }
                    }}
                    onError={(e) => console.error(`抓拍图片 ${i + 1} 加载失败:`, e)}
                  />
                );
              })}
            </div>
          ) : (
            <p key={`waiting-${forceUpdate}`} className="text-center text-xs text-slate-600 pt-4">
              等待精选抓拍... (当前数量: {localCapturedImages.length})
            </p>
          )}
          
          {/* 抓拍图片操作按钮 */}
          <div className="space-y-2">
            <div className="text-xs text-slate-400 text-center">
              精选抓拍模式：每次只显示一张最佳图片
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleClearCapturedImages} className="flex-1">
                <Trash2 className="mr-2 h-4 w-4" />清空抓拍图片
              </Button>
              <Button variant="outline" onClick={handleSaveToTempFolder} className="flex-1">
                <Download className="mr-2 h-4 w-4" />保存到临时文件夹
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={handleOpenTempFolder} className="flex-1">
                <FolderOpen className="mr-2 h-4 w-4" />打开临时文件夹
              </Button>
              <Button variant="outline" onClick={handleClearTempFolder} className="flex-1">
                <Trash2 className="mr-2 h-4 w-4" />清空临时文件夹
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* 右侧：检测结果 */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            齐套化检测结果
            <span className="text-xs text-slate-400 ml-2">
              ({(() => {
                const kitMatchingResults = globalResults.filter(result => {
                  if ((result as any).detectionType === 'kit_matching') return true;
                  const reason = result.reason || '';
                  const lowerReason = reason.toLowerCase();
                  const hasKitMatchingKeywords = (
                    lowerReason.includes('齐套化') ||
                    lowerReason.includes('滤芯') ||
                    lowerReason.includes('净水机') ||
                    lowerReason.includes('filter') ||
                    lowerReason.includes('water') ||
                    lowerReason.includes('label') ||
                    lowerReason.includes('qrcode') ||
                    lowerReason.includes('filtername') ||
                    lowerReason.includes('nsplogo') ||
                    lowerReason.includes('齐套化检测') ||
                    lowerReason.includes('洁净用品') ||
                    lowerReason.includes('ppe') ||
                    lowerReason.includes('洁净帽') ||
                    lowerReason.includes('口罩') ||
                    lowerReason.includes('洁净服') ||
                    lowerReason.includes('防护装备') ||
                    lowerReason.includes('未检测到人员或齐套化物品严重不足')
                  );
                  const hasNoStandard = !result.standardId;
                  return hasKitMatchingKeywords || (hasNoStandard && hasKitMatchingKeywords);
                });
                return kitMatchingResults.length;
              })()}/20)
            </span>
          </CardTitle>
          <div className="flex items-center gap-1 text-xs text-slate-400">
            <Keyboard size={14}/>
            <span>空格=抓拍 / 回车=检测 / M=监控 / L=加载模型</span>
          </div>
        </CardHeader>
        <CardContent className="overflow-y-auto h-full space-y-4">
          {/* 显示说明 */}
          <div className="text-xs text-slate-400 bg-slate-800/50 p-2 rounded">
            <p>显示: 最近20个检测结果 | 存储: 最多1000张图片 (新替旧)</p>
          </div>
          {/* 清空按钮 */}
          {(() => {
            const kitMatchingResults = globalResults.filter(result => {
              if ((result as any).detectionType === 'kit_matching') return true;
              const reason = result.reason || '';
              const lowerReason = reason.toLowerCase();
              const hasKitMatchingKeywords = (
                lowerReason.includes('齐套化') ||
                lowerReason.includes('滤芯') ||
                lowerReason.includes('净水机') ||
                lowerReason.includes('filter') ||
                lowerReason.includes('water') ||
                lowerReason.includes('label') ||
                lowerReason.includes('qrcode') ||
                lowerReason.includes('filtername') ||
                lowerReason.includes('nsplogo') ||
                lowerReason.includes('齐套化检测') ||
                lowerReason.includes('洁净用品') ||
                lowerReason.includes('ppe') ||
                lowerReason.includes('洁净帽') ||
                lowerReason.includes('口罩') ||
                lowerReason.includes('洁净服') ||
                lowerReason.includes('防护装备') ||
                lowerReason.includes('未检测到人员或齐套化物品严重不足')
              );
              const hasNoStandard = !result.standardId;
              return hasKitMatchingKeywords || (hasNoStandard && hasKitMatchingKeywords);
            });
            return kitMatchingResults.length > 0;
          })() && (
            <div className="flex justify-end gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => navigate('/kit-matching-results')}
                className="text-blue-400 hover:text-blue-300"
              >
                <Download className="mr-2 h-4 w-4" />
                查看所有存储结果
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={async () => {
                  if (confirm('确定要清空所有检测结果吗？此操作将永久删除数据库中的所有记录，无法恢复！')) {
                    try {
                      // 清空本地显示
                      setResults([]);
                      
                      // 清空全局状态
                      const { clearAllResults } = useAppStore.getState();
                      clearAllResults();
                      
                      // 清空后端数据库中的齐套化检测结果
                      const response = await fetch('/api/results/clear-cleanroom/', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                          reason: '用户手动清空所有检测结果',
                          count: (() => {
                            const kitMatchingResults = globalResults.filter(result => {
                              if ((result as any).detectionType === 'kit_matching') return true;
                              const reason = result.reason || '';
                              const lowerReason = reason.toLowerCase();
                              const hasKitMatchingKeywords = (
                                lowerReason.includes('齐套化') ||
                                lowerReason.includes('滤芯') ||
                                lowerReason.includes('净水机') ||
                                lowerReason.includes('filter') ||
                                lowerReason.includes('water') ||
                                lowerReason.includes('label') ||
                                lowerReason.includes('qrcode') ||
                                lowerReason.includes('filtername') ||
                                lowerReason.includes('nsplogo') ||
                                lowerReason.includes('齐套化检测') ||
                                lowerReason.includes('洁净用品') ||
                                lowerReason.includes('ppe') ||
                                lowerReason.includes('洁净帽') ||
                                lowerReason.includes('口罩') ||
                                lowerReason.includes('洁净服') ||
                                lowerReason.includes('防护装备') ||
                                lowerReason.includes('未检测到人员或齐套化物品严重不足')
                              );
                              const hasNoStandard = !result.standardId;
                              return hasKitMatchingKeywords || (hasNoStandard && hasKitMatchingKeywords);
                            });
                            return kitMatchingResults.length;
                          })()
                        })
                      });
                      
                      if (response.ok) {
                        toast.success('已清空所有检测结果（包括数据库记录）');
                      } else {
                        toast.error('清空数据库记录失败，但已清空本地显示');
                      }
                    } catch (error) {
                      console.error('清空结果失败:', error);
                      toast.error('清空失败，请重试');
                    }
                  }
                }}
                className="text-red-400 hover:text-red-300"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                清空所有结果
              </Button>
            </div>
          )}
          {(() => {
            // 从全局结果中筛选齐套化检测结果
            const kitMatchingResults = globalResults.filter(result => {
              // 优先使用detectionType字段进行判断
              if ((result as any).detectionType === 'kit_matching') {
                return true;
              }
              
              // 如果没有detectionType字段，使用原有的判断逻辑
              const reason = result.reason || '';
              const lowerReason = reason.toLowerCase();
              
              // 检查是否包含齐套化相关的关键词
              const hasKitMatchingKeywords = (
                lowerReason.includes('齐套化') ||
                lowerReason.includes('滤芯') ||
                lowerReason.includes('净水机') ||
                lowerReason.includes('filter') ||
                lowerReason.includes('water') ||
                lowerReason.includes('label') ||
                lowerReason.includes('qrcode') ||
                lowerReason.includes('filtername') ||
                lowerReason.includes('nsplogo') ||
                lowerReason.includes('齐套化检测') ||
                lowerReason.includes('洁净用品') ||
                lowerReason.includes('ppe') ||
                lowerReason.includes('洁净帽') ||
                lowerReason.includes('口罩') ||
                lowerReason.includes('洁净服') ||
                lowerReason.includes('防护装备') ||
                lowerReason.includes('未检测到人员或齐套化物品严重不足')
              );
              
              // 检查是否没有standardId（齐套化检测通常没有标准ID）
              const hasNoStandard = !result.standardId;
              
              return hasKitMatchingKeywords || (hasNoStandard && hasKitMatchingKeywords);
            });
            
            return kitMatchingResults.length > 0 ? (
              kitMatchingResults.slice(0, 20).map(result => (
              <div key={result.id} className="p-3 rounded-lg bg-white/5 space-y-3">
                <div className="flex gap-4 items-start">
                  {(() => {
                    // 检查图片数据格式
                    let imageSrc = '';
                    if (result.image) {
                      if (result.image.startsWith('data:image/')) {
                        // 已经是完整的data URL
                        imageSrc = result.image;
                      } else if (result.image.length > 0) {
                        // 是base64数据，需要添加前缀
                        imageSrc = `data:image/jpeg;base64,${result.image}`;
                      }
                    }
                    
                    return imageSrc ? (
                      <img 
                        src={imageSrc} 
                        alt="检测图片" 
                        className="w-24 h-auto object-contain rounded-md bg-black" 
                        onLoad={() => {
                          // 图片加载成功（仅在开发模式下输出日志）
                          if (process.env.NODE_ENV === 'development') {
                            console.log(`检测结果图片加载成功: ${result.id}`);
                          }
                        }}
                        onError={(e) => {
                          console.error('检测结果图片加载失败:', result.id, '图片数据长度:', result.image?.length);
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-24 h-24 bg-slate-700 rounded-md flex items-center justify-center">
                        <span className="text-slate-400 text-xs">无图片</span>
                      </div>
                    );
                  })()}
                  <div className="flex-grow space-y-2">
                    <div className="flex items-center gap-2">
                      <p className={cn("font-bold", 
                        result.overallQuality === '合格' ? 'text-green-400' : 
                        result.overallQuality === '需复检' ? 'text-yellow-400' : 'text-red-400'
                      )}>
                         {result.overallQuality} ({result.score.toFixed(1)}%)
                      </p>
                    </div>
                    
                     {/* 检测原因 */}
                     <div className="text-xs text-slate-300">
                       <p>{result.reason}</p>
                    </div>
                    
                     {/* 缺陷信息 */}
                     {result.defects && result.defects.length > 0 && (
                      <div className="text-xs text-yellow-400">
                         <p className="font-medium">检测到的问题:</p>
                        <ul className="list-disc list-inside space-y-1">
                           {result.defects.map((defect, idx) => (
                             <li key={idx}>{defect.description}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Shield className="h-16 w-16" />
                <p className="mt-4">等待齐套化检测...</p>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* ==================== 新增：验证结果对话框 ==================== */}
      {showValidationDialog && currentValidationResult && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-slate-900 border-slate-700">
            <CardHeader className="bg-slate-800 border-b border-slate-700">
              <CardTitle className="flex items-center gap-2 text-white">
                <AlertTriangle className="h-5 w-5 text-amber-400" />
                验证结果确认
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 p-6">
              {/* 图片预览 */}
              <div className="aspect-video bg-slate-800 rounded-lg overflow-hidden flex items-center justify-center">
                {currentValidationResult.image && (
                  <img
                    src={currentValidationResult.image.startsWith('data:') ? currentValidationResult.image : `data:image/jpeg;base64,${currentValidationResult.image}`}
                    alt="检测图片"
                    className="w-full h-full object-contain"
                  />
                )}
              </div>

              {/* 基础检测结果 */}
              <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                <h3 className="font-semibold mb-3 text-white flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  基础检测结果
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-slate-400">检测状态:</span>
                    <span className={cn(
                      "ml-2 font-medium",
                      currentValidationResult.overallQuality === '合格' ? 'text-green-400' :
                      currentValidationResult.overallQuality === '存疑' ? 'text-amber-400' :
                      'text-red-400'
                    )}>
                      {currentValidationResult.overallQuality}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">综合评分:</span>
                    <span className="ml-2 font-medium text-white">{currentValidationResult.score.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-slate-400">原因:</span>
                  <p className="text-slate-300 mt-1">{currentValidationResult.reason}</p>
                </div>
              </div>

              {/* 验证结果列表 */}
              {currentValidationResult.validationResults && currentValidationResult.validationResults.length > 0 && (
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                  <h3 className="font-semibold mb-3 text-white">验证详情</h3>
                  <div className="space-y-3">
                    {currentValidationResult.validationResults.map((vResult, index) => (
                      <div
                        key={index}
                        className={cn(
                          "p-3 rounded-lg border",
                          vResult.status === 'success' ? 'bg-green-500/10 border-green-500/30' :
                          vResult.status === 'suspicious' ? 'bg-amber-500/10 border-amber-500/30' :
                          'bg-red-500/10 border-red-500/30'
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-white flex items-center gap-2">
                            {vResult.type === 'ocr' && <ScanText className="h-4 w-4" />}
                            {vResult.type === 'qrcode' && <QrCode className="h-4 w-4" />}
                            {vResult.type === 'llm' && <Brain className="h-4 w-4" />}
                            {vResult.type === 'serial' && <Hash className="h-4 w-4" />}
                            {vResult.type === 'ocr' ? 'OCR识别' :
                             vResult.type === 'qrcode' ? '二维码识别' :
                             vResult.type === 'llm' ? 'LLM分析' :
                             '序列号绑定'}
                          </span>
                          <span className={cn(
                            "text-xs font-semibold px-2 py-1 rounded",
                            vResult.status === 'success' ? 'bg-green-500 text-white' :
                            vResult.status === 'suspicious' ? 'bg-amber-500 text-white' :
                            'bg-red-500 text-white'
                          )}>
                            {vResult.status === 'success' ? '成功' :
                             vResult.status === 'suspicious' ? '存疑' :
                             '失败'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300">{vResult.message}</p>
                        {vResult.confidence && (
                          <p className="text-xs text-slate-400 mt-1">
                            置信度: {(vResult.confidence * 100).toFixed(1)}%
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 手动编辑字段 */}
              {currentValidationResult.isSuspicious && (
                <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
                  <h3 className="font-semibold mb-3 text-white flex items-center gap-2">
                    <Edit3 className="h-4 w-4" />
                    手动修正
                  </h3>
                  <div className="space-y-4">
                    {/* OCR文本编辑 */}
                    {validationOptions.enableOCR && (
                      <div>
                        <Label className="text-sm text-slate-400">OCR识别文本</Label>
                        <input
                          type="text"
                          value={editingField === 'ocrText' ? editValue : (currentValidationResult.ocrText || '')}
                          onChange={(e) => {
                            if (editingField !== 'ocrText') setEditingField('ocrText');
                            setEditValue(e.target.value);
                          }}
                          onBlur={() => {
                            if (editingField === 'ocrText' && currentValidationResult) {
                              setCurrentValidationResult({
                                ...currentValidationResult,
                                ocrText: editValue,
                                manuallyEdited: true
                              });
                              setEditingField(null);
                            }
                          }}
                          className="w-full mt-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="输入识别的文本"
                        />
                      </div>
                    )}

                    {/* 二维码数据编辑 */}
                    {validationOptions.enableQRCode && (
                      <div>
                        <Label className="text-sm text-slate-400">二维码内容</Label>
                        <input
                          type="text"
                          value={editingField === 'qrCodeData' ? editValue : (currentValidationResult.qrCodeData || '')}
                          onChange={(e) => {
                            if (editingField !== 'qrCodeData') setEditingField('qrCodeData');
                            setEditValue(e.target.value);
                          }}
                          onBlur={() => {
                            if (editingField === 'qrCodeData' && currentValidationResult) {
                              setCurrentValidationResult({
                                ...currentValidationResult,
                                qrCodeData: editValue,
                                manuallyEdited: true
                              });
                              setEditingField(null);
                            }
                          }}
                          className="w-full mt-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="输入二维码内容"
                        />
                      </div>
                    )}

                    {/* 序列号编辑 */}
                    {validationOptions.enableSerialBinding && (
                      <div>
                        <Label className="text-sm text-slate-400">序列号</Label>
                        <input
                          type="text"
                          value={editingField === 'serialNumber' ? editValue : (currentValidationResult.serialNumber || '')}
                          onChange={(e) => {
                            if (editingField !== 'serialNumber') setEditingField('serialNumber');
                            setEditValue(e.target.value);
                          }}
                          onBlur={() => {
                            if (editingField === 'serialNumber' && currentValidationResult) {
                              setCurrentValidationResult({
                                ...currentValidationResult,
                                serialNumber: editValue,
                                manuallyEdited: true
                              });
                              setEditingField(null);
                            }
                          }}
                          className="w-full mt-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="输入序列号"
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowValidationDialog(false);
                    setCurrentValidationResult(null);
                    setEditingField(null);
                    setEditValue('');
                  }}
                  className="border-slate-600 text-slate-300 hover:bg-slate-700"
                >
                  <XIcon className="mr-2 h-4 w-4" />
                  取消
                </Button>
                <Button
                  onClick={async () => {
                    if (currentValidationResult) {
                      // 提交验证后的结果
                      try {
                        await addAppResult(currentValidationResult);
                        toast.success('结果已保存');
                        setShowValidationDialog(false);
                        setCurrentValidationResult(null);
                        setEditingField(null);
                        setEditValue('');
                      } catch (error) {
                        toast.error(`保存失败: ${error instanceof Error ? error.message : '未知错误'}`);
                      }
                    }
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Check className="mr-2 h-4 w-4" />
                  确认提交
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 模型不可用确认对话框 */}
      <ModelUnavailableDialog
        isOpen={modelUnavailableDialog.isOpen}
        onClose={() => setModelUnavailableDialog(prev => ({ ...prev, isOpen: false }))}
        errorMessage={modelUnavailableDialog.errorMessage}
        errorType={modelUnavailableDialog.errorType}
        onModelSwitched={() => {
          // 模型切换成功后刷新状态
          refreshCurrentModel();
          loadYoloModel();
        }}
      />
    </div>
  );
};

export default KitMatchingScreenTest; 