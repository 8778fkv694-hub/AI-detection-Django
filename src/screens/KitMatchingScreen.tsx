import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
  Shield,
  Play,
  Pause,
  Maximize,
  Minimize,
  RefreshCw,
  CheckCircle,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getYoloStatus, preloadYolo, getModelConfig, type ModelConfig } from '@/lib/api';
import type { InspectionResult } from '@/types';
import ModelUnavailableDialog from '@/components/ModelUnavailableDialog';
import ModelSelector from '@/components/ModelSelector';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import { useOCRCamera } from '@/hooks/ocr/useOCRCamera';
import { useROIProcessor } from '@/hooks/kitMatching/useROIProcessor';
import { useKitDetection } from '@/hooks/kitMatching/useKitDetection';
import { useKitWorkflow } from '@/hooks/kitMatching/useKitWorkflow';
import { useFolderOperations } from '@/hooks/kitMatching/useFolderOperations';
import { ThresholdSettingsPanel } from '@/components/kitMatching/ThresholdSettingsPanel';
import { CapturedImagesPanel } from '@/components/kitMatching/CapturedImagesPanel';
import { DetectionResultsCard } from '@/components/kitMatching/DetectionResultsCard';
import { getCameraDevices } from '@/lib/cameraUtils';
import type { CameraDevice } from '@/lib/cameraUtils';
import { ImagePreviewModal } from '@/components/ocr/ImagePreviewModal';
import { drawKitMatchingDetections } from '@/lib/ocr/detectionDrawer';


const KitMatchingScreen: React.FC = () => {
  //   const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const detectionCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isPpeActive, setIsPpeActive] = useState(false);
  const { currentModel, modelName, isLoading: modelLoading, refresh: refreshModel } = useCurrentModel();

  // 图片预览状态
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);

  // 自动抓拍的目标检测类型（用户可选择）
  const [autoCaptureTargetClass, setAutoCaptureTargetClass] = useState<string>('person');

  // 模型配置状态（从API获取）
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  //   const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  // 加载模型配置
  const loadModelConfig = useCallback(async (modelId: string | null) => {
    if (!modelId) {
      setModelConfig(null);
      return;
    }

    //     setIsLoadingConfig(true);
    try {
      const result = await getModelConfig(modelId);
      if (result.model) {
        setModelConfig(result.model);
        console.log('✅ 已加载模型配置:', result.model);
      } else {
        console.warn('⚠️ 未找到模型配置:', modelId);
        setModelConfig(null);
      }
    } catch (error) {
      console.error('❌ 加载模型配置失败:', error);
      setModelConfig(null);
      toast.error('加载模型配置失败');
    } finally {
      //       setIsLoadingConfig(false);
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

  // 累加式检测状态：记录已检测到的类别（跨画面累加）
  const [accumulatedDetectedClasses, setAccumulatedDetectedClasses] = useState<Set<string>>(new Set());
  // ROI截图暂存：每次检测时保存ROI区域截图（每种类别只保存综合评分最佳的一张）
  const [roiSnapshots, setRoiSnapshots] = useState<Array<{ class: string; image: string; timestamp: number; confidence?: number; sharpness?: number; roiArea?: number; imageWidth?: number; imageHeight?: number; compositeScore?: number }>>([]);
  // 检测模式：手动或自动
  const [detectionMode, setDetectionMode] = useState<'manual' | 'auto'>('auto');
  // 是否已完成检测（所有类别都已检测到）
  const [isComplete, setIsComplete] = useState(false);
  // 是否在延时期间（检测完成后继续检测综合评分最佳的图片）
  const [isInPostDetectionDelay, setIsInPostDetectionDelay] = useState(false);
  // 延时计时器引用
  const postDetectionDelayTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 正在进行的清晰度计算Promise集合
  const pendingSharpnessCalculationsRef = useRef<Set<Promise<void>>>(new Set());
  // 阈值设置分组展开状态
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['names', 'labels', 'others']));
  const isTriggeringInspectionRef = useRef(false); // 防止重复触发检测
  const triggerAutoInspectionRef = useRef<((imagesToProcess?: string[]) => Promise<void>) | null>(null); // 存储 triggerAutoInspection 函数引用
  const lastInspectionTimeRef = useRef<number>(0); // 上次检测完成的时间戳
  const [isInCooldown, setIsInCooldown] = useState(false); // 是否在冷却时间内
  const [isWaitingForCooldown, setIsWaitingForCooldown] = useState(false); // 是否在等待冷却中
  const [cooldownRemaining, setCooldownRemaining] = useState<number>(0); // 冷却剩余秒数
  const isPausedRef = useRef(false); // 保存暂停状态，供定时器使用

  // 同步暂停状态到ref，供定时器和回调读取最新值
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  // 类别名称中文翻译（仅从后端获取，无硬编码）
  const getClassChineseName = useCallback((className: string) => {
    // 仅使用后端返回的中文名称映射
    if (modelConfig?.class_names && modelConfig.class_names[className]) {
      return modelConfig.class_names[className];
    }

    // 如果后端没有提供，直接返回类别名称（不进行硬编码映射）
    console.warn(`⚠️ 齐套化页面：类别 "${className}" 没有对应的中文名称映射，请检查后端配置`);
    return className;
  }, [modelConfig]);

  // 使用 zustand store 管理持久化状态
  const {
    autoCapture,
    showDetections,
    captureThreshold,
    // inspectionThreshold,
    captureInterval,
    inspectionCooldownInterval,
    postDetectionDelay,
    detectionInterval,
    bestDetectionPriority,
    ppeThresholds,
    isSettingsExpanded,
    capturedImages,
    results,
    bestDetectionInInterval,
    setAutoCapture,
    // setShowDetections,
    // setCaptureThreshold,
    // setInspectionThreshold,
    setCaptureInterval,
    setInspectionCooldownInterval,
    setPostDetectionDelay,
    setDetectionInterval,
    setBestDetectionPriority,
    setPpeThresholds,
    // updatePpeThreshold,
    setIsSettingsExpanded,
    setCapturedImages,
    // addCapturedImage,
    setResults,
    addResult,
    // setBestDetectionInInterval,
    // clearResults,
  } = useSafetyEquipmentStore();

  // 获取当前模型的所有类别（仅从后端获取，无硬编码）
  const getAllModelClasses = useCallback(() => {
    // 仅从API获取的模型配置
    if (modelConfig && modelConfig.classes && modelConfig.classes.length > 0) {
      return modelConfig.classes;
    }

    // 如果API配置未加载，返回空数组（不进行硬编码）
    console.warn('⚠️ 齐套化页面：模型配置未加载，无法获取类别列表，请检查后端API');
    return [];
  }, [modelConfig]);

  // 根据当前模型获取需要显示的检测类别（需要在 store 解构之后定义）
  const getCurrentModelClasses = useCallback(() => {
    // 添加调试日志
    console.log('🔍 getCurrentModelClasses - currentModel:', currentModel, 'modelName:', modelName);

    // 获取所有类别
    const allClasses = getAllModelClasses();

    // 过滤掉阈值为0的类别（跳过检测的类别）
    const activeClasses = allClasses.filter(className => {
      const thresholdValue = ((ppeThresholds as unknown) as Record<string, number>)[className];
      // 如果阈值为undefined，使用默认值0.6（确保新类别不会被过滤掉）
      // 如果阈值为0，跳过该类别（用户明确禁用的类别）
      const finalThreshold = thresholdValue !== undefined ? thresholdValue : 0.6;
      return finalThreshold > 0;
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

  // 非持久化状态
  const [lastDetectionTime, setLastDetectionTime] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const isDetectingRef = useRef(false);

  // localStorage 相关函数已移除，由 zustand store 自动处理持久化

  // 非持久化状态
  // 非持久化状态
  const { addResult: addAppResult, results: globalResults } = useAppStore();
  const { config } = useAIConfigStore();

  // 过滤齐套化检测结果（用于显示）
  const kitMatchingResults = useMemo(() => {
    return globalResults.filter(result => {
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
  }, [globalResults]);
  const [tempFolderPath] = useState('/Users/yiliwen/开发/打包带走/改善周项目/AI检测React+Django/temp_clean');
  const [videoDevices, setVideoDevices] = useState<CameraDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [forceUpdate, setForceUpdate] = useState(0); // 强制更新计数器
  const [localCapturedImages, setLocalCapturedImages] = useState<string[]>([]); // 本地抓拍图片状态

  // 生成窗口ID
  const [windowId] = useState<string>(() => {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('windowId') || `kit-matching-${Date.now()}`;
  });

  // 使用 useOCRCamera Hook 管理摄像头
  const {
    // startCamera,
    toggleCamera,
    switchCamera,
  } = useOCRCamera({
    windowId,
    videoRef,
    isCameraOn,
    setIsCameraOn,
    setIsRealtimeActive: setIsPpeActive, // Kit matching 使用 isPpeActive 而不是 isRealtimeActive
    selectedDeviceId,
    setSelectedDeviceId,
    availableDevices: videoDevices,
    setAvailableDevices: setVideoDevices,
  });

  // 模型不可用对话框状态（必须在 useKitDetection 之前定义）
  const [modelUnavailableDialog, setModelUnavailableDialog] = useState({
    isOpen: false,
    errorMessage: '',
    errorType: 'model_unavailable' as 'model_unavailable' | 'specific_model_unavailable'
  });

  // 使用 useROIProcessor Hook 处理 ROI
  const { extractAndSaveROI, stitchROISnapshots, stitchWithSnapshots } = useROIProcessor({
    roiSnapshots,
  });

  // 使用 useKitDetection Hook 管理检测逻辑
  const {
    performDetection,
    performCaptureDetection,
    saveKitMatchingResult
  } = useKitDetection({
    ppeThresholds: ppeThresholds as unknown as Record<string, number>,
    captureThreshold,
    detectionType: (modelConfig?.detection_type as 'cleanroom_ppe' | 'kit_matching' | 'ocr_inspection' | 'ocr_fusion_inspection' | 'general_quality' | undefined) ?? 'kit_matching',
    setIsMonitoring,
    setIsPpeActive,
    setIsWaitingForCooldown,
    lastInspectionTimeRef,
    getAllModelClasses,
    getCurrentModelClasses,
    getClassChineseName,
    setModelUnavailableDialog,
    addAppResult,
    results,
    setResults,
    setRoiSnapshots,
  });

  // 使用 useKitWorkflow Hook 管理工作流（仅用于副作用，不使用返回值）
  useKitWorkflow({
    isComplete,
    setIsComplete,
    isInPostDetectionDelay,
    setIsInPostDetectionDelay,
    isInCooldown,
    setIsInCooldown,
    isWaitingForCooldown,
    setIsWaitingForCooldown,
    postDetectionDelay,
    inspectionCooldownInterval,
    lastInspectionTimeRef,
    postDetectionDelayTimerRef,
  });

  // 文件夹操作 Hook
  const {
    handleClearCapturedImages,
    handleSaveToTempFolder,
    handleOpenTempFolder,
    handleClearTempFolder,
  } = useFolderOperations({
    tempFolderPath,
    localCapturedImages,
    setCapturedImages,
    setLocalCapturedImages,
    setForceUpdate,
  });

  // 全屏状态管理
  const [isFullscreen, setIsFullscreen] = useState(false);

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
    setIsInPostDetectionDelay(false);
    // 清除延时计时器
    if (postDetectionDelayTimerRef.current) {
      clearTimeout(postDetectionDelayTimerRef.current);
      postDetectionDelayTimerRef.current = null;
    }

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
      // 拼接所有ROI截图（使用共享的拼接函数）
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
      setIsInPostDetectionDelay(false);
      // 清除延时计时器
      if (postDetectionDelayTimerRef.current) {
        clearTimeout(postDetectionDelayTimerRef.current);
        postDetectionDelayTimerRef.current = null;
      }

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
  }, [saveKitMatchingResult, stitchWithSnapshots]); // 使用共享的拼接函数

  // 实时齐套化检测 - 简化实现，参考LiveInspectionScreen
  const runPpeDetection = useCallback(async () => {
    if (!isPpeActive || !videoRef.current || !detectionCanvasRef.current) {
      return;
    }

    // 暂停时跳过检测
    if (isPausedRef.current) {
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

          // 提取ROI截图并暂存（每种类别只保存综合评分最佳的一张）
          const roiPromise = extractAndSaveROI(dataUrl, detection).then(roiResult => {
            if (roiResult) {
              setRoiSnapshots(prev => {
                // 查找该类别的已有ROI截图
                const existingIndex = prev.findIndex(item => item.class === detection.class);

                // 计算当前ROI的综合评分（ROI面积50%权重 + 清晰度50%权重）
                // ROI面积归一化：ROI面积 / 图片总面积
                const imageTotalArea = roiResult.imageWidth * roiResult.imageHeight;
                const normalizedRoiArea = imageTotalArea > 0 ? roiResult.roiArea / imageTotalArea : 0;
                // 清晰度归一化：清晰度 / 100（清晰度范围是0-100）
                const normalizedSharpness = roiResult.sharpness / 100;
                // 综合评分 = ROI面积权重 * 0.5 + 清晰度权重 * 0.5
                const currentCompositeScore = normalizedRoiArea * 0.5 + normalizedSharpness * 0.5;

                if (existingIndex >= 0) {
                  // 如果已存在该类别的ROI，比较综合评分
                  const existing = prev[existingIndex];
                  const existingCompositeScore = existing.compositeScore ?? 0;

                  // 如果当前综合评分更高，则替换
                  if (currentCompositeScore > existingCompositeScore) {
                    const newSnapshots = [...prev];
                    newSnapshots[existingIndex] = {
                      class: detection.class,
                      image: roiResult.image,
                      timestamp: Date.now(),
                      confidence: detection.confidence,
                      sharpness: roiResult.sharpness,
                      roiArea: roiResult.roiArea,
                      imageWidth: roiResult.imageWidth,
                      imageHeight: roiResult.imageHeight,
                      compositeScore: currentCompositeScore
                    };
                    return newSnapshots;
                  } else {
                    // 已有ROI综合评分更好，不替换
                    return prev;
                  }
                } else {
                  // 该类别的ROI不存在，直接添加
                  return [...prev, {
                    class: detection.class,
                    image: roiResult.image,
                    timestamp: Date.now(),
                    confidence: detection.confidence,
                    sharpness: roiResult.sharpness,
                    roiArea: roiResult.roiArea,
                    imageWidth: roiResult.imageWidth,
                    imageHeight: roiResult.imageHeight,
                    compositeScore: currentCompositeScore
                  }];
                }
              });
            }
          }).catch(err => {
            console.error('ROI提取失败:', err);
          });

          // 将Promise添加到集合中，用于跟踪所有正在进行的清晰度计算
          const promise = roiPromise.then(() => {
            pendingSharpnessCalculationsRef.current.delete(promise);
          }).catch(() => {
            pendingSharpnessCalculationsRef.current.delete(promise);
          });
          pendingSharpnessCalculationsRef.current.add(promise);
        }
      });

      // 累加已检测到的类别（跨画面累加）
      setAccumulatedDetectedClasses(prev => {
        const newSet = new Set([...prev, ...currentDetectedClasses]);

        // 检查是否完成所有类别的检测
        const isCompleteNow = requiredClasses.every(cls => newSet.has(cls));

        // 如果刚完成检测（之前未完成，现在完成），且是自动模式，则启动延时计时器
        if (isCompleteNow && !isComplete && detectionMode === 'auto' && !isTriggeringInspectionRef.current) {
          setIsComplete(true);
          isTriggeringInspectionRef.current = true; // 防止重复触发

          // 显示完成提示，并开始延时
          const requiredClasses = getCurrentModelClasses();
          toast.success(`✅ 齐套化检测完成！已检测到所有类别 (${requiredClasses.length}/${requiredClasses.length})，延时${postDetectionDelay}秒继续检测综合评分最佳的图片...`, {
            duration: 3000,
            icon: '🎉',
            id: 'kit-matching-complete' // 使用唯一ID防止重复提示
          });

          // 启动延时期间，继续检测以寻找综合评分最佳的图片
          setIsInPostDetectionDelay(true);

          // 清除之前的延时计时器（如果有）
          if (postDetectionDelayTimerRef.current) {
            clearTimeout(postDetectionDelayTimerRef.current);
          }

          // 设置延时计时器
          postDetectionDelayTimerRef.current = setTimeout(async () => {
            setIsInPostDetectionDelay(false);

            // 等待所有清晰度计算完成（因为extractAndSaveROI中的清晰度计算是异步的）
            // 确保所有ROI截图的清晰度都已计算完成后再提交
            try {
              // 等待所有正在进行的清晰度计算完成
              const pendingPromises = Array.from(pendingSharpnessCalculationsRef.current);
              if (pendingPromises.length > 0) {
                console.log(`等待 ${pendingPromises.length} 个清晰度计算完成...`);
                await Promise.all(pendingPromises);
                console.log('所有清晰度计算完成');
              }

              // 再等待一小段时间，确保所有异步ROI保存操作完成
              await new Promise(resolve => setTimeout(resolve, 500));

              // 再次检查ROI截图是否已保存，并确保所有都有清晰度值
              let retryCount = 0;
              const maxRetries = 15; // 增加重试次数，因为清晰度计算是异步的
              while (retryCount < maxRetries) {
                // 使用函数式更新来获取最新状态
                let hasSnapshots = false;
                let allSnapshotsHaveSharpness = false;
                setRoiSnapshots(current => {
                  hasSnapshots = current.length > 0;
                  // 检查所有ROI截图是否都有清晰度值
                  allSnapshotsHaveSharpness = current.length > 0 && current.every(s => s.sharpness !== undefined);
                  return current; // 不改变状态，只是读取
                });

                if (hasSnapshots && allSnapshotsHaveSharpness) {
                  console.log('所有ROI截图都已保存且清晰度计算完成');
                  break;
                }

                // 等待200ms后重试（给清晰度计算更多时间）
                await new Promise(resolve => setTimeout(resolve, 200));
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
          }, postDetectionDelay * 1000);
        } else {
          setIsComplete(isCompleteNow);
        }

        return newSet;
      });

      // 更新检测统计 - 已移除冗余统计状态

      // 更新检测统计
      //       setDetectionStats({
      //         totalDetections: detections.length,
      //         personDetections: personCount,
      //         equipmentDetections: equipmentCount
      //       });

      // 在检测画布上绘制结果 - 完全参考LiveInspectionScreen
      if (detectionCanvasRef.current && videoRef.current && showDetections) {
        const videoWidth = videoRef.current.videoWidth;
        const videoHeight = videoRef.current.videoHeight;

        // 添加安全检查
        if (videoWidth > 0 && videoHeight > 0) {
          // 画布尺寸已在useEffect中设置，这里直接绘制（使用共享绘制模块）
          drawKitMatchingDetections(detections, detectionCanvasRef.current, videoRef);
        } else {
          console.log('视频尺寸无效，跳过绘制检测结果');
        }
      }

    } catch (error) {
      console.error('实时齐套化检测失败:', error);
    } finally {
      // 重置检测状态
      isDetectingRef.current = false;
      setIsDetecting(false);
    }
  }, [isPpeActive, autoCapture, autoCaptureTargetClass, performCaptureDetection, captureThreshold, captureInterval, bestDetectionInInterval, isDetecting, getAllModelClasses, ppeThresholds]);

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

        // 计算完整率：检测到的类别数量 / 总类别数量
        const totalClasses = requiredClasses.length;
        const detectedCount = detectedClasses.size;
        const completeness = totalClasses > 0 ? detectedCount / totalClasses : 0;
        let complianceScore = completeness * 100;

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

        // 生成具体的不完整原因（使用之前已声明的 missingClasses）
        const missingClassNames = missingClasses.map(cls => getClassChineseName(cls));
        const missingItems = missingClassNames.length > 0 ? [`缺少类别: ${missingClassNames.join('、')}`] : [];

        // 生成详细的核心齐套化检测报告
        const detectionDetails = [];
        if (personDetections.length > 0) detectionDetails.push(`检测到${personDetections.length}名人员`);
        if (detectedClasses.size > 0) {
          const classCounts = Array.from(detectedClasses).map(cls => {
            const count = detections.filter(d => d.class === cls).length;
            return count > 0 ? `${getClassChineseName(cls)}(${count})` : null;
          }).filter(Boolean);
          detectionDetails.push(`检测类别: ${classCounts.join(', ')}`);
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

        inspectionResults.push(result);
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
  }, [addResult, performDetection, config, lastDetectionTime, isDetecting, currentModel, modelName, getCurrentModelClasses, getClassChineseName, getAllModelClasses, ppeThresholds, setResults, results, capturedImages]);

  // 将 triggerAutoInspection 赋值给 ref，供其他函数使用
  useEffect(() => {
    triggerAutoInspectionRef.current = triggerAutoInspection;
  }, [triggerAutoInspection]);



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
      setIsPaused(false);
      setIsPpeActive(false);
      toast.success('已停止监控');
    } else {
      if (!isCameraOn) {
        toast.error('请先开启摄像头');
        return;
      }
      setIsMonitoring(true);
      setIsPaused(false);
      setIsPpeActive(true);
      toast.success('开始实时监控，使用后端齐套化检测');
    }
  }, [isMonitoring, isCameraOn]);

  // 暂停/继续实时监控（不关闭摄像头）
  const togglePause = useCallback(() => {
    if (!isMonitoring) return;
    setIsPaused(prev => !prev);
  }, [isMonitoring]);


  // 获取摄像头列表（包括物理和虚拟摄像头）
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const devices = await getCameraDevices({ requestPermission: true });
        if (mounted) {
          setVideoDevices(devices);
          console.log(`[${windowId}] 获取到 ${devices.length} 个摄像头设备:`, devices);
        }
      } catch (e) {
        console.error('获取摄像头列表失败:', e);
        if (mounted) setVideoDevices([]);
      }
    })();
    return () => { mounted = false; };
  }, [windowId]);

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

  // 实时齐套化检测定时器 - 使用用户设置的检测频率
  useEffect(() => {
    if (!isPpeActive) return;

    // 确保检测间隔在0.1-3秒范围内
    const actualInterval = Math.max(0.1, Math.min(3, detectionInterval));

    const interval = setInterval(() => {
      // 检查是否正在检测中，避免重叠
      if (!isDetectingRef.current) {
        runPpeDetection();
      }
    }, actualInterval * 1000);

    return () => clearInterval(interval);
  }, [isPpeActive, runPpeDetection, detectionInterval]);

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

  // 手动确认继续（提前结束冷却）
  const handleConfirmContinue = useCallback(() => {
    setIsWaitingForCooldown(false);
    // 重置检测状态（全部变黄）
    setAccumulatedDetectedClasses(new Set());
    setRoiSnapshots([]);
    setIsComplete(false);

    if (isCameraOn) {
      setIsMonitoring(true);
      setIsPpeActive(true);
      toast.success('已确认继续，监控已开启', { duration: 2000 });
    }
  }, [isCameraOn]);

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 回车键：确认继续（提前结束冷却）
      if (e.code === 'Enter' && isWaitingForCooldown) {
        e.preventDefault();
        handleConfirmContinue();
        return; // 防止触发其他回车键逻辑
      }

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
      // 回车键：如果有抓拍图片且不在等待冷却状态，触发旧版检测（兼容性保留）
      if (e.code === 'Enter' && localCapturedImages.length > 0 && !isWaitingForCooldown) {
        e.preventDefault();
        handleSafetyInspection();
      }
      if (e.code === 'KeyM' && isCameraOn) {
        e.preventDefault();
        toggleMonitoring();
      }
      if (e.code === 'KeyP' && isCameraOn && isMonitoring) {
        e.preventDefault();
        togglePause();
      }
      if (e.code === 'KeyL') {
        e.preventDefault();
        loadYoloModel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => { window.removeEventListener('keydown', handleKeyDown); };
  }, [isCameraOn, handleManualCapture, localCapturedImages.length, handleSafetyInspection, toggleMonitoring, loadYoloModel, roiSnapshots.length, handleManualInspection, inspectionCooldownInterval, isWaitingForCooldown, handleConfirmContinue, isMonitoring, togglePause]);

  // 冷却时间倒计时更新
  useEffect(() => {
    if (inspectionCooldownInterval === 0) {
      setIsInCooldown(false);
      setCooldownRemaining(0);
      return;
    }

    if (!isWaitingForCooldown) {
      setCooldownRemaining(0);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const cooldownMs = inspectionCooldownInterval * 1000;
      const elapsed = now - lastInspectionTimeRef.current;
      const isCooldown = elapsed < cooldownMs;
      const remaining = isCooldown ? Math.ceil((cooldownMs - elapsed) / 1000) : 0;

      setIsInCooldown(isCooldown);
      setCooldownRemaining(remaining);
    }, 100); // 每100ms更新一次，实现流畅的倒计时

    return () => clearInterval(interval);
  }, [inspectionCooldownInterval, isWaitingForCooldown]);

  // 冷却时间结束后自动开启监控
  useEffect(() => {
    if (!isWaitingForCooldown || inspectionCooldownInterval === 0) {
      return;
    }

    const checkCooldown = () => {
      const now = Date.now();
      const cooldownMs = inspectionCooldownInterval * 1000;
      const elapsed = now - lastInspectionTimeRef.current;

      if (elapsed >= cooldownMs) {
        // 冷却时间结束，重置检测状态（全部变黄）并自动开启监控
        setIsWaitingForCooldown(false);
        setAccumulatedDetectedClasses(new Set());
        setRoiSnapshots([]);
        setIsComplete(false);

        if (isCameraOn) {
          setIsMonitoring(true);
          setIsPpeActive(true);
          toast.success('冷却时间结束，已自动开启监控', { duration: 2000 });
        }
      }
    };

    // 立即检查一次
    checkCooldown();

    // 每秒检查一次
    const interval = setInterval(checkCooldown, 1000);

    return () => clearInterval(interval);
  }, [isWaitingForCooldown, inspectionCooldownInterval, isCameraOn]);

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
              {/* YOLO 模型选择器 */}
              <ModelSelector
                label=""
                placeholder="切换检测模型"
                showActiveBadge={false}
                showModelCount={true}
                onModelChange={async (modelId) => {
                  console.log('模型已切换:', modelId);
                  // 重新加载模型信息
                  await refreshModel();
                  await loadModelConfig(modelId);
                }}
              />
              {/* 齐套化检测进度显示 - 显示所有检测类型，检测到的变绿，未检测到的保持黄色 */}
              {(() => {
                const requiredClasses = getCurrentModelClasses();
                const detectedCount = Array.from(accumulatedDetectedClasses).filter(cls => requiredClasses.includes(cls)).length;
                const totalCount = requiredClasses.length;
                const percentage = totalCount > 0 ? (detectedCount / totalCount) * 100 : 0;

                // 如果没有需要检测的类别，不显示
                if (totalCount === 0) {
                  return null;
                }

                return (
                  <div className="px-4 py-2 rounded-lg border-2 shadow-lg bg-slate-800/95 border-slate-600">
                    <div className="space-y-2">
                      {/* 进度显示 */}
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-200">齐套化检测进度</span>
                        <span className="font-bold text-yellow-400">
                          {detectedCount}/{totalCount}
                        </span>
                        <span className="text-xs text-slate-400">
                          ({Math.round(percentage)}%)
                        </span>
                        {roiSnapshots.length > 0 && (
                          <span className="text-xs text-slate-400 ml-2">
                            (已暂存 {roiSnapshots.length} 张ROI)
                          </span>
                        )}
                        {isInPostDetectionDelay && (
                          <span className="text-xs text-blue-400 ml-2">⏱️ 延时中，继续检测综合评分最佳的图片...</span>
                        )}
                      </div>

                      {/* 检测类型列表 - 显示所有目标，检测到的变绿（累积状态），未检测到的保持黄色 */}
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {requiredClasses.map((className) => {
                          const isDetected = accumulatedDetectedClasses.has(className);
                          const chineseName = getClassChineseName(className);
                          return (
                            <span
                              key={className}
                              className={`
                              px-2 py-0.5 rounded border
                              ${isDetected
                                  ? 'bg-green-500/80 text-white border-green-600'
                                  : 'bg-yellow-500/80 text-white border-yellow-600'
                                }
                            `}
                            >
                              {chineseName}
                            </span>
                          );
                        })}
                      </div>
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
                className={cn("w-full h-full object-contain", { "hidden": !isCameraOn })}
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
                <div className={`absolute top-2 left-2 flex items-center gap-2 px-2 py-1 rounded text-xs ${isPaused ? 'bg-yellow-500 text-white' : 'bg-red-500 text-white'}`}>
                  <div className={`w-2 h-2 rounded-full ${isPaused ? 'bg-black' : 'bg-white animate-pulse'}`}></div>
                  {isPaused ? '已暂停' : '监控中'}
                </div>
              )}

              {/* 检测统计（仅在监控时显示详细统计） - 已隐藏 */}
              {/* {isMonitoring && (
              <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm text-white px-3 py-2 rounded-lg text-xs space-y-1">
                <div>人员: {detectionStats.personDetections}</div>
                <div>装备: {detectionStats.equipmentDetections}</div>
                {roiSnapshots.length > 0 && (
                  <div className="text-yellow-300">ROI暂存: {roiSnapshots.length} 张</div>
                )}
              </div>
            )} */}

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
            <div className="flex flex-wrap gap-2">
              <Button onClick={toggleCamera} variant={isCameraOn ? "destructive" : "default"}>
                <Camera className="mr-2 h-4 w-4" />
                {isCameraOn ? '关闭摄像头' : '开启摄像头'}
              </Button>
              <Button
                onClick={toggleMonitoring}
                disabled={!isCameraOn || isWaitingForCooldown}
                variant={isMonitoring ? "destructive" : "default"}
                className={isWaitingForCooldown ? "opacity-50 cursor-not-allowed bg-slate-600" : ""}
              >
                {isMonitoring ? <Pause className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
                {isWaitingForCooldown ? '等待冷却中...' : (isMonitoring ? '停止监控' : '开始监控')}
              </Button>
              {isMonitoring && (
                <Button
                  onClick={togglePause}
                  variant={isPaused ? "default" : "outline"}
                  className={isPaused ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : ''}
                >
                  {isPaused ? <Play className="mr-2 h-4 w-4" /> : <Pause className="mr-2 h-4 w-4" />}
                  {isPaused ? '继续' : '暂停'}
                </Button>
              )}
            </div>

            {/* 确认继续按钮 - 显示倒计时 */}
            {isWaitingForCooldown && (
              <Button
                onClick={handleConfirmContinue}
                disabled={!isCameraOn}
                className="w-full bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {cooldownRemaining > 0
                  ? `冷却中 (${cooldownRemaining}秒)，按回车键提前继续`
                  : '确认继续（按回车键）'}
              </Button>
            )}

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
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm">事件抓拍</Label>
                    <div className="text-xs text-slate-400 mt-1">检测到指定类型时自动抓拍（事件触发）</div>
                  </div>
                  <Switch
                    checked={autoCapture}
                    onCheckedChange={setAutoCapture}
                  />
                </div>

                {/* 检测类型选择下拉框 */}
                {autoCapture && (
                  <div className="space-y-1 pl-1">
                    <Label className="text-xs text-slate-400">检测类型</Label>
                    <Select
                      value={autoCaptureTargetClass}
                      onValueChange={setAutoCaptureTargetClass}
                    >
                      <SelectTrigger className="h-8 text-xs bg-slate-700 border-slate-600">
                        <SelectValue placeholder="选择检测类型" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAllModelClasses().map((className) => (
                          <SelectItem key={className} value={className}>
                            {modelConfig?.class_names?.[className] || className}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              {/* 阈值设置区域 */}
              <ThresholdSettingsPanel
                isSettingsExpanded={isSettingsExpanded}
                setIsSettingsExpanded={setIsSettingsExpanded}
                expandedGroups={expandedGroups}
                setExpandedGroups={setExpandedGroups}
                modelConfig={modelConfig}
                getAllModelClasses={getAllModelClasses}
                getClassChineseName={getClassChineseName}
                doesModelSupportPersonDetection={doesModelSupportPersonDetection}
                ppeThresholds={ppeThresholds as unknown as Record<string, number>}
                setPpeThresholds={(thresholds) => setPpeThresholds(thresholds as any)}
                captureInterval={captureInterval}
                setCaptureInterval={setCaptureInterval}
                bestDetectionPriority={bestDetectionPriority}
                setBestDetectionPriority={setBestDetectionPriority}
                detectionInterval={detectionInterval}
                setDetectionInterval={setDetectionInterval}
                postDetectionDelay={postDetectionDelay}
                setPostDetectionDelay={setPostDetectionDelay}
                inspectionCooldownInterval={inspectionCooldownInterval}
                setInspectionCooldownInterval={setInspectionCooldownInterval}
              />
            </div>

            {/* 检测按钮 */}
            <Button
              onClick={handleManualInspection}
              disabled={roiSnapshots.length === 0 || isInCooldown}
              className="w-full !py-3 !text-base"
            >
              <CircleDotDashed className="mr-2 h-4 w-4" />
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
        <CapturedImagesPanel
          localCapturedImages={localCapturedImages}
          forceUpdate={forceUpdate}
          setPreviewImage={setPreviewImage}
          setShowPreviewModal={setShowPreviewModal}
          handleClearCapturedImages={handleClearCapturedImages}
          handleSaveToTempFolder={handleSaveToTempFolder}
          handleOpenTempFolder={handleOpenTempFolder}
          handleClearTempFolder={handleClearTempFolder}
        />
      </div>

      {/* 右侧：检测结果 */}
      <DetectionResultsCard
        kitMatchingResults={kitMatchingResults}
        setResults={setResults}
        setPreviewImage={setPreviewImage}
        setShowPreviewModal={setShowPreviewModal}
      />

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

      {/* 图片预览模态框 */}
      <ImagePreviewModal
        imageUrl={previewImage || ''}
        isOpen={showPreviewModal && !!previewImage}
        onClose={() => {
          setShowPreviewModal(false);
          setPreviewImage(null);
        }}
        alt="图片预览"
      />
    </div>
  );
};

export default KitMatchingScreen; 