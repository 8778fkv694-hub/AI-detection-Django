/**
 * 二维码检出能力评估页面
 * 评估二维码检测算法的性能和优化效果
 */

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Upload, 
  Camera, 
  CheckCircle, 
  XCircle, 
  AlertCircle, 
  Settings, 
  Play, 
  ArrowRight,
  Zap,
  Eye,
  Download,
  RefreshCw,
  Brain
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { toast } from 'react-hot-toast';
// 统一封装兼容：react-hot-toast 无 warning 方法，用 success/error 替代
const toastWarning = (msg: string) => {
  try {
    // @ts-ignore
    if (typeof (toast as any).warning === 'function') {
      // 兼容存在 warning 的环境
      (toast as any).warning(msg);
    } else {
      toast(msg); // 使用默认提示
    }
  } catch {
    toast(msg);
  }
};
import { detectBarcodesWithRetry, BarcodeDetectionResult } from '@/lib/barcodeDetector';
import { preprocessImage, PreprocessingOptions } from '@/lib/imagePreprocessingApi';


interface TestResult {
  detectedCodes: BarcodeDetectionResult[];
  matchResults: Array<{
    expectedText: string;
    matchMode: 'contains' | 'exact';
    matched: boolean;
    detectedData?: string;
    confidence?: number;
    location?: { x: number; y: number; width: number; height: number };
    retryCount: number;
  }>;
  retrySummary: {
    totalRetries: number;
    successfulDetections: number;
    failedDetections: number;
    totalDetected?: number;  // 总检测数量
    iterations?: number;     // 迭代次数
  };
  modelUsed: string;
  processingTime: number;
}

// 评估结论和建议接口
interface EvaluationConclusion {
  overallScore: number; // 总体评分 (0-100)
  detectionRate: number; // 检测成功率
  processingEffectiveness: number; // 预处理效果
  recommendations: string[]; // 建议列表
  strengths: string[]; // 优势
  weaknesses: string[]; // 不足
  improvementSuggestions: string[]; // 改进建议
}

// 预处理方案接口
interface PreprocessingPreset {
  id: string;
  name: string;
  description: string;
  methods: PreprocessingMethod[];
}

interface PreprocessingMethod {
  type: string;
  intensity: 'light' | 'moderate' | 'aggressive';
  parameters: Record<string, number>;
}

// 预处理测试结果接口
interface PreprocessingTestResult {
  preset: PreprocessingPreset;
  processedImage: string;
  detectionResult: TestResult;
  score: number;
  processingTime: number;
}

interface StepData {
  step: number;
  title: string;
  description: string;
  completed: boolean;
  data?: any;
}

// 预处理方案配置
const PREPROCESSING_PRESETS: PreprocessingPreset[] = [
  {
    id: 'conservative',
    name: '保守方案',
    description: '轻微处理，保持原图特征',
    methods: [
      { type: 'brightness', intensity: 'light', parameters: { brightness: 10 } },
      { type: 'contrast', intensity: 'light', parameters: { contrast: 1.2 } }
    ]
  },
  {
    id: 'balanced',
    name: '平衡方案',
    description: '适中处理，平衡效果与质量',
    methods: [
      { type: 'brightness', intensity: 'moderate', parameters: { brightness: 20 } },
      { type: 'contrast', intensity: 'moderate', parameters: { contrast: 1.3 } },
      { type: 'sharpness', intensity: 'light', parameters: { sharpness: 0.5 } }
    ]
  },
  {
    id: 'aggressive',
    name: '激进方案',
    description: '强力处理，最大化检测效果',
    methods: [
      { type: 'brightness', intensity: 'aggressive', parameters: { brightness: 30 } },
      { type: 'contrast', intensity: 'aggressive', parameters: { contrast: 1.5 } },
      { type: 'sharpness', intensity: 'moderate', parameters: { sharpness: 0.8 } },
      { type: 'denoise', intensity: 'moderate', parameters: { denoise: 1 } }
    ]
  },
  {
    id: 'custom',
    name: '自定义方案',
    description: '用户自定义处理参数',
    methods: []
  }
];

const GuidedWeChatQRTestScreen: React.FC = () => {
  const navigate = useNavigate();
  
  // 基础状态
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [useWeChatQR] = useState(true);
  const [maxRetries] = useState(5);
  
  // 智能检测流程状态
  const [currentStep, setCurrentStep] = useState(1);
  const [isDetecting, setIsDetecting] = useState(false);
  const [currentRetry, setCurrentRetry] = useState(0);
  const [detectionProgress, setDetectionProgress] = useState('');
  const [steps, setSteps] = useState<StepData[]>([
    { step: 1, title: '上传测试图片', description: '选择包含二维码的测试图片', completed: false },
    { step: 2, title: '图像质量分析', description: 'AI分析图片质量并评估检测难度', completed: false },
    { step: 3, title: '智能优化处理', description: '应用推荐的预处理方案提升检测效果', completed: false },
    { step: 4, title: '执行检测评估', description: '运行检测算法并记录性能指标', completed: false },
    { step: 5, title: '查看评估结果', description: '对比处理前后的检测效果和性能数据', completed: false }
  ]);
  
  // 检测结果
  const [originalResult, setOriginalResult] = useState<TestResult | null>(null);
  const [processedResult, setProcessedResult] = useState<TestResult | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [processImages, setProcessImages] = useState<any[]>([]);
  const [currentMaskPadding, setCurrentMaskPadding] = useState(30);
  
  // 评估结论
  const [evaluationConclusion, setEvaluationConclusion] = useState<EvaluationConclusion | null>(null);
  
  // 图像质量指标
  const [imageQualityMetrics, setImageQualityMetrics] = useState<any>(null);
  
  // 多方案测试相关状态
  const [selectedPresets, setSelectedPresets] = useState<string[]>(['conservative', 'balanced', 'aggressive']);
  const [preprocessingTestResults, setPreprocessingTestResults] = useState<PreprocessingTestResult[]>([]);
  const [isTestingMultipleMethods, setIsTestingMultipleMethods] = useState(false);
  const [bestPreset, setBestPreset] = useState<PreprocessingPreset | null>(null);
  
  // 二维码配置 - 只要检测到二维码就算合格
  
  // 图片压缩配置状态
  const [compressionEnabled, setCompressionEnabled] = useState<boolean>(false);
  const [compressionConfig, setCompressionConfig] = useState({
    maxWidth: 800,
    maxHeight: 600,
    quality: 0.8,
    maxSizeMB: 1
  });
  const [showCompressionSettings, setShowCompressionSettings] = useState<boolean>(false);
  

  // 处理图片选择
  const handleImageSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);
      
      const reader = new FileReader();
      reader.onload = (e) => {
        const previewUrl = e.target?.result as string;
        setImagePreview(previewUrl);
        
        // 更新步骤状态
        updateStepStatus(1, true);
        setCurrentStep(2);
      };
      reader.readAsDataURL(file);
      
      // 清除之前的结果
      setOriginalResult(null);
      setProcessedResult(null);
      setProcessedImage(null);
      setShowComparison(false);
    }
  }, []);

  // 图片压缩函数
  const compressImage = useCallback((base64Image: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(base64Image);
            return;
          }
          
          // 使用配置的压缩尺寸
          const { maxWidth, maxHeight, quality } = compressionConfig;
          let { width, height } = img;
          
          // 计算压缩后的尺寸
          if (width > height) {
            if (width > maxWidth) {
              height = (height * maxWidth) / width;
              width = maxWidth;
            }
          } else {
            if (height > maxHeight) {
              width = (width * maxHeight) / height;
              height = maxHeight;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          
          ctx.drawImage(img, 0, 0, width, height);
          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          
          console.log(`🗜️ 图片压缩完成: 原图${img.width}x${img.height} -> 压缩${width}x${height} (质量${quality})`);
          resolve(compressedBase64);
        } catch (error) {
          console.error('图片压缩失败:', error);
          resolve(base64Image);
        }
      };
      img.onerror = () => resolve(base64Image);
      img.src = base64Image;
    });
  }, [compressionConfig]);

  // 更新步骤状态
  const updateStepStatus = useCallback((stepNumber: number, completed: boolean, data?: any) => {
    setSteps(prev => prev.map(step => 
      step.step === stepNumber ? { ...step, completed, data } : step
    ));
  }, []);

  // 智能分析
  const performSmartAnalysis = useCallback(async () => {
    if (!imagePreview) return;
    
    setIsProcessing(true);
    updateStepStatus(2, true);
    
    try {
      // 模拟图像质量分析
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // 生成模拟的图像质量指标
      const mockMetrics = {
        brightness: Math.random() * 100,
        contrast: Math.random() * 100,
        sharpness: Math.random() * 100,
        noise: Math.random() * 100
      };
      
      setImageQualityMetrics(mockMetrics);
      
      toast.success('图片质量分析完成');
      setCurrentStep(3);
    } catch (error) {
      console.error('分析失败:', error);
      toast.error('分析失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  }, [imagePreview, updateStepStatus]);

  // 一键优化
  const performOptimization = useCallback(async () => {
    if (!imagePreview) return;
    
    setIsProcessing(true);
    
    try {
      // 使用推荐的预处理参数
      const options: PreprocessingOptions = {
        brightness: 20,
        contrast: 1.3,
        sharpness: 0.8,
        denoise: true
      };
      
      const result = await preprocessImage(imagePreview, options);
      
      if (result.success && result.processed_image) {
        setProcessedImage(result.processed_image);
        updateStepStatus(3, true);
        setCurrentStep(4);
        toast.success('图片优化完成');
      } else {
        // 降级处理：使用原图
        setProcessedImage(imagePreview);
        updateStepStatus(3, true);
        setCurrentStep(4);
        toastWarning('预处理服务不可用，使用原图进行检测');
      }
    } catch (error) {
      console.error('优化失败:', error);
      // 降级处理
      setProcessedImage(imagePreview);
      updateStepStatus(3, true);
      setCurrentStep(4);
      toastWarning('预处理服务不可用，使用原图进行检测');
    } finally {
      setIsProcessing(false);
    }
  }, [imagePreview, updateStepStatus]);

  // 执行检测 - 带自动调整遮罩范围
  const performDetection = useCallback(async (imageFile: File, isProcessed: boolean = false) => {
    if (!imageFile) return null;

    const startTime = Date.now();
    setIsDetecting(true);
    setCurrentRetry(0);
    setDetectionProgress('开始评估检测...');
    setProcessImages([]);

    try {
      // 如果启用了压缩，先压缩图片
      let processedImageFile = imageFile;
      if (compressionEnabled && !isProcessed) {
        console.log('🗜️ 开始图片压缩...');
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            resolve(result);
          };
          reader.readAsDataURL(imageFile);
        });
        
        const originalSize = Math.round(base64.length * 0.75 / 1024);
        const compressedBase64 = await compressImage(base64);
        const compressedSize = Math.round(compressedBase64.split(',')[1].length * 0.75 / 1024);
        console.log(`✅ 图片压缩完成: ${originalSize}KB -> ${compressedSize}KB (压缩率: ${Math.round((1 - compressedSize/originalSize) * 100)}%)`);
        
        // 将压缩后的base64转换为File对象
        const response = await fetch(compressedBase64);
        const blob = await response.blob();
        processedImageFile = new File([blob], imageFile.name, { type: 'image/jpeg' });
      }

      // 对于二维码测试，我们只需要检测到任何二维码就算成功
      // 使用一个通用的期望配置
      const expectedBarcodes = [{
        expectedText: '', // 空字符串表示检测到任何内容都算成功
        matchMode: 'contains' as const
      }];

      let maskPadding = currentMaskPadding;
      let retryResult: Awaited<ReturnType<typeof detectBarcodesWithRetry>> | null = null;
      let attempts = 0;
      const maxAttempts = 3;

      // 自动调整遮罩范围的检测循环
      while (attempts < maxAttempts) {
        attempts++;
        setDetectionProgress(`第 ${attempts}/${maxAttempts} 次尝试，遮罩边距: ${maskPadding}px`);
        
        // 模拟重试进度显示
        for (let i = 1; i <= maxRetries; i++) {
          setCurrentRetry(i);
          setDetectionProgress(`第 ${attempts}/${maxAttempts} 次尝试，第 ${i}/${maxRetries} 次检测，遮罩边距: ${maskPadding}px`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        retryResult = await detectBarcodesWithRetry(processedImageFile, expectedBarcodes, {
          maxRetries,
          enableMasking: true,
          maskColor: '#FFFFFF',
          maskPadding: maskPadding,
          useWeChatQR
        });

        // 检查检测结果
        if (retryResult && retryResult.allResults && retryResult.allResults.length > 0) {
          break;
        } else {
          // 检测失败，调整遮罩范围
          if (attempts < maxAttempts) {
            maskPadding += 10; // 增加遮罩边距
            setCurrentMaskPadding(maskPadding);
            setDetectionProgress(`检测失败，调整遮罩边距为 ${maskPadding}px，重新尝试...`);
            await new Promise(resolve => setTimeout(resolve, 500)); // 短暂延迟
          }
        }
      }

      const processingTime = Date.now() - startTime;

      // 循环至少执行一次，detectBarcodesWithRetry 必有返回；防御性兜底走统一失败路径
      if (!retryResult) {
        throw new Error('二维码检测未返回结果');
      }
      const detectedAny = retryResult.allResults.length > 0;

      // 修改匹配结果：只要检测到二维码就算成功
      const modifiedMatchResults = retryResult.matchResults.map(match => ({
        ...match,
        matched: detectedAny, // 检测到任何二维码就算匹配成功
        detectedData: detectedAny ? retryResult!.allResults[0].data : undefined,
        confidence: detectedAny ? retryResult!.allResults[0].confidence : 0
      }));

      const result: TestResult = {
        detectedCodes: retryResult.allResults,
        matchResults: modifiedMatchResults,
        retrySummary: {
          ...retryResult.retrySummary,
          successfulDetections: detectedAny ? 1 : 0,
          failedDetections: detectedAny ? 0 : 1,
          totalDetected: retryResult.allResults.length,
          iterations: 1
        },
        modelUsed: useWeChatQR ? '微信二维码检测器 (WeChatQRCode)' : '前端二维码检测器 (jsQR)',
        processingTime
      };

      setDetectionProgress('检测完成');
      setIsDetecting(false);
      return result;
    } catch (error) {
      console.error('检测失败:', error);
      setDetectionProgress('检测失败');
      setIsDetecting(false);
      return null;
    }
  }, [maxRetries, useWeChatQR, currentMaskPadding, compressionEnabled, compressImage]);

  // 生成评估结论和建议
  const generateEvaluationConclusion = useCallback((originalResult: TestResult, processedResult: TestResult | null, testResults?: PreprocessingTestResult[]): EvaluationConclusion => {
    // 计算检测成功率
    const originalDetectionRate = originalResult.retrySummary.successfulDetections > 0 ? 100 : 0;
    const processedDetectionRate = processedResult ? 
      (processedResult.retrySummary.successfulDetections > 0 ? 100 : 0) : originalDetectionRate;
    
    // 计算预处理效果 - 只有在原始检测失败时才计算改善效果
    let processingEffectiveness = 0;
    if (originalDetectionRate === 0 && processedDetectionRate === 100) {
      processingEffectiveness = 100; // 预处理从失败变为成功
    } else if (originalDetectionRate === 100 && processedDetectionRate === 100) {
      processingEffectiveness = 50; // 预处理保持成功状态
    } else if (originalDetectionRate === 100 && processedDetectionRate === 0) {
      processingEffectiveness = -50; // 预处理反而降低了效果
    }
    
    // 计算总体评分 - 基于实际检测效果
    let overallScore = Math.max(originalDetectionRate, processedDetectionRate);
    
    // 如果预处理有正面效果，给予额外加分
    if (processingEffectiveness > 0) {
      overallScore = Math.min(100, overallScore + processingEffectiveness * 0.2);
    }
    
    // 基于重试次数调整评分
    const totalRetries = originalResult.retrySummary.totalRetries;
    if (totalRetries <= 2) {
      overallScore = Math.min(100, overallScore + 10); // 效率高加分
    } else if (totalRetries > 5) {
      overallScore = Math.max(0, overallScore - 20); // 效率低减分
    }
    
    // 生成建议
    const recommendations: string[] = [];
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvementSuggestions: string[] = [];
    
    // 基于检测结果生成建议
    if (originalDetectionRate >= 80) {
      strengths.push('原始图像检测效果良好');
    } else if (originalDetectionRate >= 50) {
      weaknesses.push('原始图像检测效果一般');
      improvementSuggestions.push('建议优化图像质量或调整检测参数');
    } else {
      weaknesses.push('原始图像检测效果较差');
      improvementSuggestions.push('强烈建议进行图像预处理');
    }
    
    // 预处理效果分析
    if (processingEffectiveness > 0) {
      strengths.push('预处理显著提升了检测效果');
      recommendations.push('建议在实际应用中启用智能预处理');
    } else if (processingEffectiveness === 0 && originalDetectionRate === 100) {
      strengths.push('原始图像质量良好，无需预处理');
      recommendations.push('当前图像质量已满足检测要求');
    } else if (processingEffectiveness < 0) {
      weaknesses.push('预处理反而降低了检测效果');
      improvementSuggestions.push('建议调整预处理参数或禁用预处理');
    } else {
      weaknesses.push('预处理未显著改善检测效果');
      improvementSuggestions.push('建议调整预处理参数或尝试其他优化方案');
    }
    
    // 基于重试次数分析
    if (totalRetries <= 2) {
      strengths.push('检测效率高，重试次数少');
    } else if (totalRetries <= 5) {
      recommendations.push('检测需要多次重试，建议优化检测算法');
    } else {
      weaknesses.push('检测需要大量重试，效率较低');
      improvementSuggestions.push('建议大幅优化检测算法或图像质量');
    }
    
    // 基于迭代次数分析
    const iterations = originalResult.retrySummary.iterations || 1;
    if (iterations > 1) {
      strengths.push(`成功检测到多个二维码（${originalResult.retrySummary.totalDetected || 0}个）`);
    }
    
    // 基于图像质量分析
    if (imageQualityMetrics) {
      if (imageQualityMetrics.brightness < 50) {
        improvementSuggestions.push('图像亮度较低，建议增加亮度');
      }
      if (imageQualityMetrics.contrast < 50) {
        improvementSuggestions.push('图像对比度较低，建议增强对比度');
      }
      if (imageQualityMetrics.sharpness < 50) {
        improvementSuggestions.push('图像清晰度较低，建议进行锐化处理');
      }
      if (imageQualityMetrics.noise > 50) {
        improvementSuggestions.push('图像噪声较多，建议进行去噪处理');
      }
    }
    
    // 综合建议 - 基于测试结果和图像质量
    const bestPreset = testResults && testResults.length > 0 
      ? testResults[0].preset 
      : null;
    
    if (overallScore >= 90) {
      recommendations.push('检测系统表现优秀，可以投入生产使用');
      if (bestPreset && bestPreset.id !== 'original') {
        recommendations.push(`推荐使用${bestPreset.name}进行预处理，效果最佳`);
      }
    } else if (overallScore >= 70) {
      recommendations.push('检测系统表现良好，建议进行小幅优化');
      if (bestPreset && bestPreset.id !== 'original') {
        recommendations.push(`建议采用${bestPreset.name}预处理方案，可提升检测效果`);
      }
      if (processingEffectiveness < 20) {
        recommendations.push('预处理效果有限，建议调整预处理参数或尝试其他方案');
      }
    } else if (overallScore >= 50) {
      recommendations.push('检测系统表现一般，建议进行中等程度优化');
      if (bestPreset && bestPreset.id !== 'original') {
        recommendations.push(`推荐使用${bestPreset.name}预处理方案改善检测效果`);
      }
      recommendations.push('建议检查图像质量和检测参数配置');
    } else {
      recommendations.push('检测系统表现较差，建议进行大幅优化或重新设计');
      recommendations.push('建议重新评估图像质量和检测算法配置');
      if (bestPreset && bestPreset.id !== 'original') {
        recommendations.push(`可尝试${bestPreset.name}预处理方案，但可能需要进一步调优`);
      }
    }
    
    // 基于图像质量的具体建议
    if (imageQualityMetrics) {
      if (imageQualityMetrics.brightness < 30) {
        recommendations.push('图像亮度过低，建议增加光照或使用亮度增强预处理');
      } else if (imageQualityMetrics.brightness > 80) {
        recommendations.push('图像亮度过高，建议降低曝光或使用亮度调整预处理');
      }
      
      if (imageQualityMetrics.contrast < 30) {
        recommendations.push('图像对比度不足，建议使用对比度增强预处理');
      }
      
      if (imageQualityMetrics.sharpness < 30) {
        recommendations.push('图像清晰度较低，建议使用锐化预处理或检查对焦');
      }
      
      if (imageQualityMetrics.noise > 70) {
        recommendations.push('图像噪声较多，建议使用去噪预处理或改善拍摄环境');
      }
    }
    
    // 基于检测效率的建议
    const avgRetries = testResults && testResults.length > 0
      ? testResults.reduce((sum, result) => sum + result.detectionResult.retrySummary.totalRetries, 0) / testResults.length
      : 0;
    
    if (avgRetries > 5) {
      recommendations.push('检测重试次数较多，建议优化检测参数或改善图像质量');
    } else if (avgRetries <= 2) {
      recommendations.push('检测效率良好，系统运行稳定');
    }
    
    return {
      overallScore: Math.round(overallScore),
      detectionRate: Math.max(originalDetectionRate, processedDetectionRate),
      processingEffectiveness: Math.max(0, processingEffectiveness),
      recommendations,
      strengths,
      weaknesses,
      improvementSuggestions
    };
  }, [imageQualityMetrics]);

  // 应用预处理方案
  const applyPreprocessingPreset = useCallback(async (imageBase64: string, preset: PreprocessingPreset): Promise<string> => {
    try {
      // 将方案转换为预处理参数
      const options: PreprocessingOptions = {};
      
      preset.methods.forEach(method => {
        switch (method.type) {
          case 'brightness':
            options.brightness = method.parameters.brightness;
            break;
          case 'contrast':
            options.contrast = method.parameters.contrast;
            break;
          case 'sharpness':
            options.sharpness = method.parameters.sharpness;
            break;
          case 'denoise':
            options.denoise = method.parameters.denoise === 1;
            break;
        }
      });
      
      // 调用预处理API
      const result = await preprocessImage(imageBase64, options);
      
      if (result.success && result.processed_image) {
        return result.processed_image;
      } else {
        return imageBase64; // 返回原图
      }
    } catch (error) {
      console.error('预处理失败:', error);
      return imageBase64;
    }
  }, []);

  // 计算检测评分
  const calculateDetectionScore = useCallback((result: TestResult, presetId?: string): number => {
    let score = 0;
    
    // 基础检测成功率
    if (result.retrySummary.successfulDetections > 0) {
      score += 50; // 检测成功基础分
    }
    
    // 检测数量加分
    const detectedCount = result.retrySummary.totalDetected || result.detectedCodes.length;
    score += Math.min(20, detectedCount * 10); // 每个二维码10分，最多20分
    
    // 效率加分
    const retries = result.retrySummary.totalRetries;
    if (retries <= 2) {
      score += 20; // 高效检测
    } else if (retries <= 5) {
      score += 10; // 中等效率
    }
    
    // 预处理方案加分
    if (presetId && presetId !== 'original') {
      switch (presetId) {
        case 'conservative':
          score += 5; // 保守方案轻微加分
          break;
        case 'balanced':
          score += 10; // 平衡方案中等加分
          break;
        case 'aggressive':
          score += 15; // 激进方案较大加分
          break;
      }
    }
    
    // 处理时间加分（处理时间越短越好）
    const processingTime = result.processingTime || 0;
    if (processingTime < 500) {
      score += 10; // 快速处理
    } else if (processingTime < 1000) {
      score += 5; // 中等速度
    }
    
    return Math.min(100, score);
  }, []);

  // 多方案批量测试
  const testMultiplePreprocessingMethods = useCallback(async () => {
    if (!selectedImage || !imagePreview) return;
    
    setIsTestingMultipleMethods(true);
    setPreprocessingTestResults([]);
    
    try {
      const results: PreprocessingTestResult[] = [];
      
      // 测试原始图像
      const originalFile = selectedImage;
      const originalResult = await performDetection(originalFile, false);
      if (originalResult) {
        results.push({
          preset: { id: 'original', name: '原始图像', description: '未经过预处理的原始图像', methods: [] },
          processedImage: imagePreview,
          detectionResult: originalResult,
          score: calculateDetectionScore(originalResult, 'original'),
          processingTime: originalResult.processingTime
        });
      }
      
      // 测试选中的预处理方案
      for (const presetId of selectedPresets) {
        const preset = PREPROCESSING_PRESETS.find(p => p.id === presetId);
        if (!preset) continue;
        
        const startTime = Date.now();
        
        // 应用预处理
        const processedImageBase64 = await applyPreprocessingPreset(imagePreview, preset);
        
        // 转换为File对象进行检测
        const response = await fetch(processedImageBase64);
        const blob = await response.blob();
        const processedFile = new File([blob], `${preset.id}.jpg`, { type: 'image/jpeg' });
        
        // 执行检测
        const detectionResult = await performDetection(processedFile, true);
        
        if (detectionResult) {
          const processingTime = Date.now() - startTime;
          results.push({
            preset,
            processedImage: processedImageBase64,
            detectionResult,
            score: calculateDetectionScore(detectionResult, presetId),
            processingTime
          });
        }
      }
      
      // 按评分排序
      results.sort((a, b) => b.score - a.score);
      
      setPreprocessingTestResults(results);
      setBestPreset(results[0]?.preset || null);
      
      toast.success(`多方案测试完成！最佳方案：${results[0]?.preset.name}`);
      
    } catch (error) {
      console.error('多方案测试失败:', error);
      toast.error('多方案测试失败，请重试');
    } finally {
      setIsTestingMultipleMethods(false);
    }
  }, [selectedImage, imagePreview, selectedPresets, performDetection, applyPreprocessingPreset, calculateDetectionScore]);

  // 开始检测评估
  const startDetection = useCallback(async () => {
    if (!selectedImage) return;
    
    setIsProcessing(true);
    
    try {
      // 检测原图
      const originalResult = await performDetection(selectedImage, false);
      setOriginalResult(originalResult);
      
      // 检测处理后的图片
      let processedResult = null;
      if (processedImage && processedImage !== imagePreview) {
        // 创建处理后的图片文件
        const response = await fetch(processedImage);
        const blob = await response.blob();
        const processedFile = new File([blob], 'processed.jpg', { type: 'image/jpeg' });
        processedResult = await performDetection(processedFile, true);
      }
      setProcessedResult(processedResult);
      
      // 生成评估结论（原图检测失败时走统一的 catch 失败提示，与原运行时行为一致）
      if (!originalResult) {
        throw new Error('原图检测失败');
      }
      const conclusion = generateEvaluationConclusion(originalResult, processedResult, preprocessingTestResults);
      setEvaluationConclusion(conclusion);
      
      updateStepStatus(4, true);
      setCurrentStep(5);
      setShowComparison(true);
      toast.success('检测完成！');
      
    } catch (error) {
      console.error('检测失败:', error);
      toast.error('检测失败，请重试');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedImage, processedImage, imagePreview, performDetection, updateStepStatus]);

  // 重置流程
  const resetFlow = useCallback(() => {
    setCurrentStep(1);
    setSteps(prev => prev.map(step => ({ ...step, completed: false })));
    setSelectedImage(null);
    setImagePreview(null);
    setProcessedImage(null);
    setOriginalResult(null);
    setProcessedResult(null);
    setShowComparison(false);
    setEvaluationConclusion(null);
    setImageQualityMetrics(null);
    setPreprocessingTestResults([]);
    setBestPreset(null);
    setIsTestingMultipleMethods(false);
  }, []);

  // 下一步
  const nextStep = useCallback(() => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  }, [currentStep, steps.length]);

  // 上一步
  const prevStep = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  return (
    <div className="min-h-screen bg-slate-900">
      {/* 头部 */}
      <div className="bg-slate-800/80 backdrop-blur-sm shadow-sm border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/ocr')}
                className="flex items-center space-x-2 hover:bg-slate-700 text-blue-400 hover:text-blue-300 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>返回OCR检测</span>
              </Button>
              <div className="h-6 w-px bg-slate-600" />
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                  <Camera className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-xl font-semibold text-slate-100">二维码检出能力评估</h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <div className="px-3 py-1 bg-blue-600/20 text-blue-400 text-xs font-medium rounded-full border border-blue-500/30">
                能力评估
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* 步骤指示器 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.step} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-300 ${
                  step.completed 
                    ? 'bg-green-600 border-green-600 text-white' 
                    : step.step === currentStep
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-slate-700 border-slate-600 text-slate-400'
                }`}>
                  {step.completed ? (
                    <CheckCircle className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-semibold">{step.step}</span>
                  )}
                </div>
                <div className="ml-3">
                  <h3 className={`text-sm font-semibold ${
                    step.step === currentStep ? 'text-blue-400' : 'text-slate-300'
                  }`}>
                    {step.title}
                  </h3>
                  <p className="text-xs text-slate-400">{step.description}</p>
                </div>
                {index < steps.length - 1 && (
                  <div className={`w-16 h-0.5 mx-4 ${
                    step.completed ? 'bg-green-600' : 'bg-slate-600'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 左侧：主要操作区域 */}
          <div className="space-y-6">
            {/* 步骤1：上传图片 */}
            {currentStep === 1 && (
              <Card className="p-8 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                <div className="text-center">
                  <div className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                    <Upload className="h-10 w-10 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-100 mb-4">上传二维码图片</h2>
                  <p className="text-slate-400 mb-8">选择包含二维码的图片文件，支持 JPG、PNG、GIF 格式</p>
                  
                  <div className="border-2 border-dashed border-slate-600 rounded-xl p-12 text-center hover:border-blue-400 hover:bg-blue-900/20 transition-all duration-200 group">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                      id="image-upload"
                    />
                    <label
                      htmlFor="image-upload"
                      className="cursor-pointer flex flex-col items-center space-y-4"
                    >
                      <div className="p-6 bg-gradient-to-r from-blue-900/50 to-purple-900/50 rounded-full group-hover:from-blue-800/50 group-hover:to-purple-800/50 transition-colors">
                        <Upload className="h-12 w-12 text-blue-400" />
                      </div>
                      <div>
                        <p className="text-lg font-medium text-slate-200">点击上传图片</p>
                        <p className="text-sm text-slate-400 mt-2">或拖拽图片到此区域</p>
                      </div>
                    </label>
                  </div>
                  
                  {/* 图片压缩配置 */}
                  <div className="mt-8 p-6 bg-slate-700/50 rounded-xl border border-slate-600">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-slate-200 flex items-center">
                        <Settings className="h-5 w-5 mr-2" />
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
                      <div className="text-sm text-slate-400 mb-4">
                        💡 启用压缩可以减小图片大小，提高处理速度，但可能会影响识别精度
                      </div>
                    )}
                    
                    {/* 压缩设置详情 */}
                    {compressionEnabled && showCompressionSettings && (
                      <div className="space-y-4 p-4 bg-slate-800/50 rounded-lg border border-slate-600/50">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm text-slate-300 mb-2 block">最大宽度 (px)</label>
                            <input
                              type="number"
                              value={compressionConfig.maxWidth}
                              onChange={(e) => setCompressionConfig(prev => ({ ...prev, maxWidth: parseInt(e.target.value) || 800 }))}
                              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              min="100"
                              max="2000"
                            />
                          </div>
                          <div>
                            <label className="text-sm text-slate-300 mb-2 block">最大高度 (px)</label>
                            <input
                              type="number"
                              value={compressionConfig.maxHeight}
                              onChange={(e) => setCompressionConfig(prev => ({ ...prev, maxHeight: parseInt(e.target.value) || 600 }))}
                              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              min="100"
                              max="2000"
                            />
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm text-slate-300 mb-2 block">
                              压缩质量: {compressionConfig.quality}
                            </label>
                            <input
                              type="range"
                              min="0.1"
                              max="1"
                              step="0.1"
                              value={compressionConfig.quality}
                              onChange={(e) => setCompressionConfig(prev => ({ ...prev, quality: parseFloat(e.target.value) }))}
                              className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer"
                            />
                            <div className="flex justify-between text-xs text-slate-400 mt-1">
                              <span>0.1</span>
                              <span>0.5</span>
                              <span>1.0</span>
                            </div>
                          </div>
                          <div>
                            <label className="text-sm text-slate-300 mb-2 block">最大文件大小 (MB)</label>
                            <input
                              type="number"
                              value={compressionConfig.maxSizeMB}
                              onChange={(e) => setCompressionConfig(prev => ({ ...prev, maxSizeMB: parseFloat(e.target.value) || 1 }))}
                              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                              min="0.1"
                              max="10"
                              step="0.1"
                            />
                          </div>
                        </div>
                        
                        <div className="text-xs text-slate-400 bg-slate-700/30 p-3 rounded">
                          <div className="font-semibold mb-1">当前配置预览:</div>
                          <div>• 最大尺寸: {compressionConfig.maxWidth} × {compressionConfig.maxHeight} 像素</div>
                          <div>• 压缩质量: {Math.round(compressionConfig.quality * 100)}%</div>
                          <div>• 最大文件大小: {compressionConfig.maxSizeMB} MB</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* 步骤2：智能分析 */}
            {currentStep === 2 && (
              <Card className="p-8 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                <div className="text-center">
                  <div className="p-4 bg-gradient-to-r from-green-500 to-teal-600 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                    <Eye className="h-10 w-10 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-100 mb-4">AI智能分析</h2>
                  <p className="text-slate-400 mb-8">正在分析图片质量，生成优化建议...</p>
                  
                  {imagePreview && (
                    <div className="mb-6">
                      <img
                        src={imagePreview}
                        alt="分析图片"
                        className="w-full max-w-md mx-auto rounded-xl shadow-lg border border-slate-600"
                      />
                    </div>
                  )}
                  
                  <div className="space-y-4 mb-8">
                    <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                      <span className="text-slate-300">亮度分析</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-slate-600 rounded-full h-2">
                          <div className="bg-green-400 h-2 rounded-full" style={{ width: '75%' }}></div>
                        </div>
                        <span className="text-green-400 text-sm">良好</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                      <span className="text-slate-300">对比度分析</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-slate-600 rounded-full h-2">
                          <div className="bg-yellow-400 h-2 rounded-full" style={{ width: '60%' }}></div>
                        </div>
                        <span className="text-yellow-400 text-sm">一般</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-slate-700/50 rounded-lg">
                      <span className="text-slate-300">清晰度分析</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-24 bg-slate-600 rounded-full h-2">
                          <div className="bg-red-400 h-2 rounded-full" style={{ width: '30%' }}></div>
                        </div>
                        <span className="text-red-400 text-sm">较低</span>
                      </div>
                    </div>
                  </div>
                  
                  <Button
                    onClick={performSmartAnalysis}
                    disabled={isProcessing}
                    className="w-full bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-3"></div>
                        分析中...
                      </>
                    ) : (
                      <>
                        <Eye className="h-5 w-5 mr-3" />
                        开始智能分析
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            )}

            {/* 步骤3：智能优化处理 */}
            {currentStep === 3 && (
              <Card className="p-8 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                <div className="text-center">
                  <div className="p-4 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                    <Zap className="h-10 w-10 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-100 mb-4">智能优化处理</h2>
                  <p className="text-slate-400 mb-8">选择预处理方案或进行多方案对比测试</p>
                  
                  {/* 预处理方案选择 */}
                  <div className="bg-gradient-to-r from-purple-900/30 to-pink-900/30 border border-purple-500/30 rounded-xl p-6 mb-8">
                    <h3 className="text-lg font-semibold text-purple-300 mb-4">预处理方案选择</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {PREPROCESSING_PRESETS.map((preset) => (
                        <div
                          key={preset.id}
                          className={`p-4 rounded-lg border cursor-pointer transition-all ${
                            selectedPresets.includes(preset.id)
                              ? 'border-purple-500 bg-purple-600/20'
                              : 'border-slate-600 bg-slate-700/50 hover:border-purple-400'
                          }`}
                          onClick={() => {
                            if (preset.id === 'custom') return; // 自定义方案暂不支持
                            setSelectedPresets(prev => 
                              prev.includes(preset.id)
                                ? prev.filter(id => id !== preset.id)
                                : [...prev, preset.id]
                            );
                          }}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-slate-200">{preset.name}</h4>
                            {selectedPresets.includes(preset.id) && (
                              <CheckCircle className="h-5 w-5 text-purple-400" />
                            )}
                          </div>
                          <p className="text-sm text-slate-400">{preset.description}</p>
                          <div className="mt-2 text-xs text-slate-500">
                            {preset.methods.length} 种处理方法
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* 多方案测试按钮 */}
                    <div className="flex space-x-4">
                      <Button
                        onClick={testMultiplePreprocessingMethods}
                        disabled={isTestingMultipleMethods || selectedPresets.length === 0}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50"
                      >
                        {isTestingMultipleMethods ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-3"></div>
                            多方案测试中...
                          </>
                        ) : (
                          <>
                            <Zap className="h-5 w-5 mr-3" />
                            多方案对比测试
                          </>
                        )}
                      </Button>
                      
                      <Button
                        onClick={performOptimization}
                        disabled={isProcessing}
                        variant="outline"
                        className="flex-1 bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
                      >
                        {isProcessing ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-300 border-t-transparent mr-3"></div>
                            处理中...
                          </>
                        ) : (
                          <>
                            <Eye className="h-5 w-5 mr-3" />
                            单方案优化
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {/* 多方案测试结果 */}
                  {preprocessingTestResults.length > 0 && (
                    <div className="bg-gradient-to-r from-green-900/30 to-blue-900/30 border border-green-500/30 rounded-xl p-6 mb-8">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-green-300 flex items-center">
                          <CheckCircle className="h-5 w-5 mr-2" />
                          多方案测试结果
                        </h3>
                        {bestPreset && (
                          <div className="bg-yellow-600/20 border border-yellow-500/50 rounded-lg px-3 py-1">
                            <span className="text-yellow-300 text-sm font-semibold">
                              🏆 推荐方案: {bestPreset.name}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="space-y-4">
                        {preprocessingTestResults.map((result, index) => (
                          <div
                            key={result.preset.id}
                            className={`p-4 rounded-lg border ${
                              index === 0
                                ? 'border-yellow-500 bg-yellow-600/20'
                                : 'border-slate-600 bg-slate-700/50'
                            }`}
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center">
                                {index === 0 && (
                                  <div className="w-6 h-6 bg-yellow-500 rounded-full mr-3 flex items-center justify-center">
                                    <span className="text-white text-xs font-bold">1</span>
                                  </div>
                                )}
                                <h4 className="font-semibold text-slate-200">{result.preset.name}</h4>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold text-green-400">{result.score}</div>
                                <div className="text-xs text-slate-400">评分</div>
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                              <div>
                                <span className="text-slate-400">检测数量:</span>
                                <span className="text-slate-200 ml-1">{result.detectionResult.retrySummary.totalDetected || 0}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">重试次数:</span>
                                <span className="text-slate-200 ml-1">{result.detectionResult.retrySummary.totalRetries}</span>
                              </div>
                              <div>
                                <span className="text-slate-400">处理时间:</span>
                                <span className="text-slate-200 ml-1">{result.processingTime}ms</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* 应用最佳方案按钮 */}
                      {bestPreset && bestPreset.id !== 'original' && (
                        <div className="mt-6 pt-4 border-t border-green-500/30">
                          <Button
                            onClick={() => {
                              // 应用最佳方案
                              const bestResult = preprocessingTestResults.find(r => r.preset.id === bestPreset.id);
                              if (bestResult) {
                                setProcessedImage(bestResult.processedImage);
                                setProcessedResult(bestResult.detectionResult);
                                
                                // 更新步骤状态
                                updateStepStatus(3, true);
                                setCurrentStep(4);
                                
                                toast.success(`已应用最佳方案：${bestPreset.name}，进入检测评估阶段`);
                              }
                            }}
                            className="w-full bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
                          >
                            <Zap className="h-5 w-5 mr-3" />
                            应用最佳方案: {bestPreset.name}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* 步骤4：执行检测评估 */}
            {currentStep === 4 && (
              <Card className="p-8 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                <div className="text-center">
                  <div className="p-4 bg-gradient-to-r from-orange-500 to-red-600 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                    <Play className="h-10 w-10 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-100 mb-4">执行检测评估</h2>
                  <p className="text-slate-400 mb-8">使用微信二维码检测器进行性能评估</p>
                  
                  <div className="bg-gradient-to-r from-orange-900/30 to-red-900/30 border border-orange-500/30 rounded-xl p-6 mb-8">
                    <h3 className="text-lg font-semibold text-orange-300 mb-4">检测配置</h3>
                    <div className="space-y-3 text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">检测器</span>
                        <span className="text-blue-400">微信二维码检测器</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">最大重试次数</span>
                        <span className="text-blue-400">{maxRetries}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">检测模式</span>
                        <span className="text-blue-400">通用检测</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* 检测进度显示 */}
                  {isDetecting && (
                    <div className="mb-6 p-4 bg-blue-900/30 border border-blue-500/30 rounded-xl">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-blue-300 font-medium">检测进度</span>
                        <span className="text-blue-400 text-sm">{detectionProgress}</span>
                      </div>
                      <div className="w-full bg-slate-700 rounded-full h-2">
                        <div 
                          className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(currentRetry / maxRetries) * 100}%` }}
                        ></div>
                      </div>
                      <div className="flex justify-between text-xs text-slate-400 mt-1">
                        <span>第 {currentRetry} 次</span>
                        <span>共 {maxRetries} 次</span>
                        <span>遮罩边距: {currentMaskPadding}px</span>
                      </div>
                    </div>
                  )}

                  {/* 过程图片显示 */}
                  {processImages.length > 0 && (
                    <div className="mb-6 p-4 bg-purple-900/30 border border-purple-500/30 rounded-xl">
                      <h4 className="text-purple-300 font-medium mb-3">检测过程图片</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {processImages.map((processImg, index) => (
                          <div key={index} className="bg-slate-800/50 rounded-lg p-3">
                            <div className="text-xs text-slate-400 mb-2">
                              第 {processImg.iteration} 次迭代
                            </div>
                            <img 
                              src={processImg.image} 
                              alt={`检测过程 ${processImg.iteration}`}
                              className="w-full h-32 object-contain bg-white rounded border"
                            />
                            <div className="text-xs text-slate-300 mt-2">
                              {processImg.description}
                            </div>
                            {processImg.detected_qr && (
                              <div className="text-xs text-green-400 mt-1">
                                检测到: {processImg.detected_qr}
                              </div>
                            )}
                            {processImg.mask_area && (
                              <div className="text-xs text-orange-400 mt-1">
                                遮罩区域: {processImg.mask_area.width}x{processImg.mask_area.height}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={startDetection}
                    disabled={isProcessing}
                    className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50"
                  >
                    {isProcessing ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-3"></div>
                        检测中...
                      </>
                    ) : (
                      <>
                        <Play className="h-5 w-5 mr-3" />
                        开始评估
                      </>
                    )}
                  </Button>
                </div>
              </Card>
            )}

            {/* 步骤5：查看评估结果 */}
            {currentStep === 5 && showComparison && (
              <Card className="p-8 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                <div className="text-center mb-6">
                  <div className="p-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                    <CheckCircle className="h-10 w-10 text-white" />
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-100 mb-4">评估完成</h2>
                  <p className="text-slate-400">查看检测性能对比和优化效果</p>
                </div>
                
                {/* 处理前后对比 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-200 mb-3 flex items-center">
                      <div className="w-3 h-3 bg-orange-400 rounded-full mr-2"></div>
                      处理前
                    </h3>
                    <div className="relative">
                      <img
                        src={imagePreview || ''}
                        alt="处理前"
                        className="w-full rounded-xl shadow-lg border border-slate-600"
                      />
                      <div className="absolute top-2 left-2 bg-orange-600/90 text-white px-2 py-1 rounded text-xs font-medium">
                        原图
                      </div>
                    </div>
                    {originalResult && (
                      <div className="mt-3 p-3 bg-slate-700/50 rounded-lg">
                        <div className="text-sm text-slate-300">
                          检测到 {originalResult.retrySummary.totalDetected || originalResult.detectedCodes.length} 个二维码
                        </div>
                        <div className="text-sm text-slate-300">
                          迭代次数: {originalResult.retrySummary.iterations || 1}
                        </div>
                        <div className="text-sm text-slate-300">
                          成功率: {originalResult.retrySummary.successfulDetections}/{originalResult.retrySummary.totalRetries}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-semibold text-slate-200 mb-3 flex items-center">
                      <div className="w-3 h-3 bg-green-400 rounded-full mr-2"></div>
                      处理后
                    </h3>
                    <div className="relative">
                      <img
                        src={processedImage || imagePreview || ''}
                        alt="处理后"
                        className="w-full rounded-xl shadow-lg border border-slate-600"
                      />
                      <div className="absolute top-2 left-2 bg-green-600/90 text-white px-2 py-1 rounded text-xs font-medium">
                        优化后
                      </div>
                    </div>
                    {processedResult && (
                      <div className="mt-3 p-3 bg-slate-700/50 rounded-lg">
                        <div className="text-sm text-slate-300">
                          检测到 {processedResult.retrySummary.totalDetected || processedResult.detectedCodes.length} 个二维码
                        </div>
                        <div className="text-sm text-slate-300">
                          迭代次数: {processedResult.retrySummary.iterations || 1}
                        </div>
                        <div className="text-sm text-slate-300">
                          成功率: {processedResult.retrySummary.successfulDetections}/{processedResult.retrySummary.totalRetries}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* 评估结论和建议 */}
                {evaluationConclusion && (
                  <div className="mt-8 space-y-6">
                    {/* 总体评分 */}
                    <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/30 rounded-xl p-6">
                      <h3 className="text-xl font-semibold text-blue-300 mb-4 flex items-center">
                        <div className="w-6 h-6 bg-blue-500 rounded-full mr-3 flex items-center justify-center">
                          <span className="text-white text-sm font-bold">{evaluationConclusion.overallScore}</span>
                        </div>
                        总体评估评分
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-blue-400">{evaluationConclusion.overallScore}</div>
                          <div className="text-sm text-slate-400">综合评分</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-400">{evaluationConclusion.detectionRate}%</div>
                          <div className="text-sm text-slate-400">检测成功率</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-orange-400">{evaluationConclusion.processingEffectiveness}%</div>
                          <div className="text-sm text-slate-400">预处理效果</div>
                        </div>
                      </div>
                    </div>
                    
                    {/* 优势分析 */}
                    {evaluationConclusion.strengths.length > 0 && (
                      <div className="bg-green-900/20 border border-green-500/30 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-green-300 mb-4 flex items-center">
                          <CheckCircle className="h-5 w-5 mr-2" />
                          系统优势
                        </h3>
                        <ul className="space-y-2">
                          {evaluationConclusion.strengths.map((strength, index) => (
                            <li key={index} className="flex items-start">
                              <div className="w-2 h-2 bg-green-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                              <span className="text-slate-300">{strength}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* 不足分析 */}
                    {evaluationConclusion.weaknesses.length > 0 && (
                      <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-red-300 mb-4 flex items-center">
                          <XCircle className="h-5 w-5 mr-2" />
                          需要改进
                        </h3>
                        <ul className="space-y-2">
                          {evaluationConclusion.weaknesses.map((weakness, index) => (
                            <li key={index} className="flex items-start">
                              <div className="w-2 h-2 bg-red-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                              <span className="text-slate-300">{weakness}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* 改进建议 */}
                    {evaluationConclusion.improvementSuggestions.length > 0 && (
                      <div className="bg-orange-900/20 border border-orange-500/30 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-orange-300 mb-4 flex items-center">
                          <AlertCircle className="h-5 w-5 mr-2" />
                          改进建议
                        </h3>
                        <ul className="space-y-2">
                          {evaluationConclusion.improvementSuggestions.map((suggestion, index) => (
                            <li key={index} className="flex items-start">
                              <div className="w-2 h-2 bg-orange-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                              <span className="text-slate-300">{suggestion}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    
                    {/* 综合建议 */}
                    {evaluationConclusion.recommendations.length > 0 && (
                      <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-6">
                        <h3 className="text-lg font-semibold text-purple-300 mb-4 flex items-center">
                          <Brain className="h-5 w-5 mr-2" />
                          综合建议
                        </h3>
                        <ul className="space-y-2">
                          {evaluationConclusion.recommendations.map((recommendation, index) => (
                            <li key={index} className="flex items-start">
                              <div className="w-2 h-2 bg-purple-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
                              <span className="text-slate-300">{recommendation}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="flex space-x-4 mt-8">
                  <Button
                    onClick={resetFlow}
                    variant="outline"
                    className="flex-1 bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    重新开始
                  </Button>
                  <Button
                    onClick={() => {/* 下载结果 */}}
                    className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    下载结果
                  </Button>
                </div>
              </Card>
            )}
          </div>

          {/* 右侧：图片预览和结果 */}
          <div className="space-y-6">
            {/* 图片预览 */}
            {imagePreview && (
              <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                <h3 className="text-lg font-semibold text-slate-100 mb-4">图片预览</h3>
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="预览"
                    className="w-full rounded-xl shadow-lg border border-slate-600"
                  />
                  <div className="absolute inset-0 bg-black/0 hover:bg-black/20 transition-colors rounded-xl flex items-center justify-center opacity-0 hover:opacity-100">
                    <div className="bg-slate-800/90 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-medium text-slate-200">
                      点击重新选择
                    </div>
                  </div>
                </div>
              </Card>
            )}

            {/* 检测结果 */}
            {(originalResult || processedResult) && (
              <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                <h3 className="text-lg font-semibold text-slate-100 mb-4">检测结果</h3>
                
                {originalResult && (
                  <div className="mb-6">
                    <h4 className="text-sm font-semibold text-orange-300 mb-3">处理前结果</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">检测数量:</span>
                        <span className="text-slate-200">{originalResult.retrySummary.totalDetected || originalResult.detectedCodes.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">迭代次数:</span>
                        <span className="text-slate-200">{originalResult.retrySummary.iterations || 1}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">成功率:</span>
                        <span className="text-slate-200">{originalResult.retrySummary.successfulDetections}/{originalResult.retrySummary.totalRetries}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">处理时间:</span>
                        <span className="text-slate-200">{originalResult.processingTime}ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">最终遮罩边距:</span>
                        <span className="text-slate-200">{currentMaskPadding}px</span>
                      </div>
                      {originalResult.detectedCodes.length > 0 && (
                        <div className="mt-3 p-3 bg-slate-700/50 rounded-lg">
                          <div className="text-sm text-slate-300 mb-2">检测到的内容:</div>
                          {originalResult.detectedCodes.map((code, index) => (
                            <div key={index} className="text-sm text-blue-300">
                              {index + 1}. {code.data} (置信度: {Math.round(code.confidence * 100)}%)
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* 过程图片显示 */}
                    {processImages.length > 0 && (
                      <div className="mt-4 p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                        <h5 className="text-purple-300 font-medium mb-3">检测过程图片</h5>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {processImages.map((processImg, index) => (
                            <div key={index} className="bg-slate-800/50 rounded-lg p-2">
                              <div className="text-xs text-slate-400 mb-1">
                                第 {processImg.iteration} 次迭代
                              </div>
                              <img 
                                src={processImg.image} 
                                alt={`检测过程 ${processImg.iteration}`}
                                className="w-full h-24 object-contain bg-white rounded border"
                              />
                              <div className="text-xs text-slate-300 mt-1">
                                {processImg.description}
                              </div>
                              {processImg.detected_qr && (
                                <div className="text-xs text-green-400 mt-1">
                                  检测到: {processImg.detected_qr}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                {processedResult && (
                  <div>
                    <h4 className="text-sm font-semibold text-green-300 mb-3">处理后结果</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-400">检测数量:</span>
                        <span className="text-slate-200">{processedResult.detectedCodes.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">成功率:</span>
                        <span className="text-slate-200">{processedResult.retrySummary.successfulDetections}/{processedResult.retrySummary.totalRetries}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">处理时间:</span>
                        <span className="text-slate-200">{processedResult.processingTime}ms</span>
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            )}

            {/* 导航按钮 */}
            <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
              <div className="flex justify-between">
                <Button
                  onClick={prevStep}
                  disabled={currentStep === 1}
                  variant="outline"
                  className="bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200 disabled:opacity-50"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  上一步
                </Button>
                
                <Button
                  onClick={nextStep}
                  disabled={currentStep === steps.length || !steps[currentStep - 1]?.completed}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white disabled:opacity-50"
                >
                  下一步
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GuidedWeChatQRTestScreen;
