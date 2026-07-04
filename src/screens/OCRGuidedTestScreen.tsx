import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Upload, Eye, Zap, CheckCircle, Brain, Settings, RotateCcw, Download, ArrowLeft, ArrowRight, RefreshCw, AlertCircle, FileText, Target, BarChart3, TrendingUp } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { preprocessImage, analyzeImageQuality, PreprocessingOptions } from '@/lib/imagePreprocessingApi';
import { ImageQualityAnalyzer } from '@/lib/imageQualityAnalyzer';
import { extractText } from '@/services/ocr';

// 添加滑块样式
const sliderStyles = `
  .slider::-webkit-slider-thumb {
    appearance: none;
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid #1e293b;
  }
  .slider::-moz-range-thumb {
    height: 16px;
    width: 16px;
    border-radius: 50%;
    background: #3b82f6;
    cursor: pointer;
    border: 2px solid #1e293b;
  }
`;

// OCR测试结果接口
interface OCRTestResult {
  success: boolean;
  text: string;
  confidence: number;
  processingTime: number;
  detectedTexts: Array<{
    text: string;
    confidence: number;
    bbox: number[][];
  }>;
  modelUsed: string;
  preprocessingApplied?: boolean;
  preprocessingMethod?: string;
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
  detectionResult: OCRTestResult;
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

const OCRGuidedTestScreen: React.FC = () => {
  const navigate = useNavigate();

  // 基础状态
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // 步骤管理
  const [currentStep, setCurrentStep] = useState(1);
  const [steps, setSteps] = useState<StepData[]>([
    { step: 1, title: '上传测试图片', description: '选择包含文字的测试图片', completed: false },
    { step: 2, title: '图像质量分析', description: 'AI分析图片质量并评估检测难度', completed: false },
    { step: 3, title: '智能优化处理', description: '应用推荐的预处理方案提升检测效果', completed: false },
    { step: 4, title: '执行检测评估', description: '运行OCR算法并记录性能指标', completed: false },
    { step: 5, title: '查看评估结果', description: '对比处理前后的检测效果和性能数据', completed: false }
  ]);

  // 检测结果
  const [originalResult, setOriginalResult] = useState<OCRTestResult | null>(null);
  const [processedResult, setProcessedResult] = useState<OCRTestResult | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  const [processImages, setProcessImages] = useState<any[]>([]);

  // 评估结论
  const [evaluationConclusion, setEvaluationConclusion] = useState<EvaluationConclusion | null>(null);

  // 图像质量指标
  const [imageQualityMetrics, setImageQualityMetrics] = useState<any>(null);

  // 多方案测试相关状态
  const [selectedPresets, setSelectedPresets] = useState<string[]>(['conservative', 'balanced', 'aggressive']);
  const [preprocessingTestResults, setPreprocessingTestResults] = useState<PreprocessingTestResult[]>([]);
  const [isTestingMultipleMethods, setIsTestingMultipleMethods] = useState(false);
  const [bestPreset, setBestPreset] = useState<PreprocessingPreset | null>(null);
  const [reconstructedImage, setReconstructedImage] = useState<string | null>(null);

  // 图片压缩配置状态
  const [compressionEnabled, setCompressionEnabled] = useState<boolean>(false);
  const [compressionConfig, setCompressionConfig] = useState({
    maxWidth: 800,
    maxHeight: 600,
    quality: 0.8,
    maxSizeMB: 1
  });
  const [showCompressionSettings, setShowCompressionSettings] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 更新步骤状态
  const updateStepStatus = useCallback((stepNumber: number, completed: boolean) => {
    setSteps(prev => prev.map(step =>
      step.step === stepNumber ? { ...step, completed } : step
    ));
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

  // 处理图片选择
  const handleImageSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedImage(file);

      // 创建预览
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreview(result);
        setCurrentStep(2);
        updateStepStatus(1, true);

        // 清除之前的结果
        setOriginalResult(null);
        setProcessedResult(null);
        setEvaluationConclusion(null);
        setImageQualityMetrics(null);
        setPreprocessingTestResults([]);
        setBestPreset(null);
        setIsTestingMultipleMethods(false);
      };
      reader.readAsDataURL(file);
    }
  }, [updateStepStatus]);

  // 执行OCR检测
  const performOCRDetection = useCallback(async (imageFile: File, isProcessed: boolean = false): Promise<OCRTestResult | null> => {
    try {
      // 转换为base64
      let base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          resolve(result.split(',')[1]); // 移除data:image/...;base64,前缀
        };
        reader.readAsDataURL(imageFile);
      });

      // 如果启用了压缩，进行图片压缩
      if (compressionEnabled) {
        console.log('🗜️ 开始图片压缩...');
        const originalSize = Math.round(base64.length * 0.75 / 1024); // 估算原始大小（KB）
        const compressedBase64 = await compressImage(`data:image/jpeg;base64,${base64}`);
        base64 = compressedBase64.split(',')[1]; // 移除data:image/...;base64,前缀
        const compressedSize = Math.round(base64.length * 0.75 / 1024); // 估算压缩后大小（KB）
        console.log(`✅ 图片压缩完成: ${originalSize}KB -> ${compressedSize}KB (压缩率: ${Math.round((1 - compressedSize / originalSize) * 100)}%)`);
      }

      // 调用OCR API（统一走 OCR 抽象层）
      const result = await extractText({
        image: base64,
        model: 'auto'  // 让后端自动选择最佳引擎
      });

      // 计算平均置信度
      const avgConfidence = result.detailed_results && result.detailed_results.length > 0
        ? result.detailed_results.reduce((sum: number, item: any) => sum + (item.confidence || 0), 0) / result.detailed_results.length
        : 0;

      return {
        success: result.success,
        text: result.full_text || '',
        confidence: avgConfidence,
        processingTime: result.processing_time || 0,
        detectedTexts: result.detailed_results || [],
        modelUsed: result.model_used || 'OCR',
        preprocessingApplied: isProcessed,
        preprocessingMethod: isProcessed ? '智能预处理' : undefined
      };
    } catch (error) {
      console.error('OCR检测失败:', error);
      return null;
    }
  }, [compressionEnabled, compressImage]);

  // 智能分析
  const performSmartAnalysis = useCallback(async () => {
    if (!imagePreview) return;

    setIsProcessing(true);
    updateStepStatus(2, true);

    try {
      console.log('🔍 开始智能图像质量分析...');

      // 如果启用了压缩，先压缩图片再发送给质量分析API
      let imageForAnalysis = imagePreview;
      if (compressionEnabled) {
        console.log('🗜️ 压缩图片用于质量分析...');
        imageForAnalysis = await compressImage(imagePreview);
      }

      // 调用真实的质量分析API
      const qualityResult = await analyzeImageQuality(imageForAnalysis);

      if (qualityResult.success && qualityResult.metrics) {
        // 转换后端指标格式为前端格式
        const metrics = {
          brightness: Math.min(100, Math.max(0, qualityResult.metrics.brightness * 100 / 255)), // 转换为0-100范围
          contrast: Math.min(100, Math.max(0, qualityResult.metrics.contrast * 100 / 128)), // 转换为0-100范围
          sharpness: Math.min(100, Math.max(0, qualityResult.metrics.sharpness * 100 / 1000)), // 转换为0-100范围
          noise: Math.min(100, Math.max(0, qualityResult.metrics.noise * 100 / 50)) // 转换为0-100范围
        };

        setImageQualityMetrics(metrics);
        console.log('✅ 图像质量分析完成:', metrics);
        toast.success('图片质量分析完成，请查看质量指标后点击下一步');
      } else {
        // 降级到模拟数据
        console.log('🔄 API分析失败，使用模拟数据...');
        const mockMetrics = {
          brightness: Math.random() * 100,
          contrast: Math.random() * 100,
          sharpness: Math.random() * 100,
          noise: Math.random() * 100
        };

        setImageQualityMetrics(mockMetrics);
        toast.success('图片质量分析完成（使用模拟数据），请查看质量指标后点击下一步');
      }
    } catch (error) {
      console.error('分析失败:', error);
      // 降级到模拟数据
      console.log('🔄 分析出错，使用模拟数据...');
      const mockMetrics = {
        brightness: Math.random() * 100,
        contrast: Math.random() * 100,
        sharpness: Math.random() * 100,
        noise: Math.random() * 100
      };

      setImageQualityMetrics(mockMetrics);
      toast.success('图片质量分析完成（使用模拟数据），请查看质量指标后点击下一步');
    } finally {
      setIsProcessing(false);
    }
  }, [imagePreview, updateStepStatus, compressionEnabled, compressImage]);

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
  const calculateDetectionScore = useCallback((result: OCRTestResult, presetId?: string): number => {
    let score = 0;

    // 基础检测成功率
    if (result.success && result.text.length > 0) {
      score += 40; // 检测成功基础分
    }

    // 置信度加分（0-40分）
    score += result.confidence * 40; // 置信度越高分数越高

    // 检测文本长度加分（0-20分）
    const textLength = result.text.length;
    score += Math.min(20, textLength * 0.1); // 文本长度加分，但限制最大值

    // 处理时间扣分（处理时间越长扣分越多）
    const processingTime = result.processingTime || 0;
    if (processingTime > 5000) {
      score -= 10; // 处理时间超过5秒扣10分
    } else if (processingTime > 2000) {
      score -= 5; // 处理时间超过2秒扣5分
    }

    // 预处理方案不加额外分，只基于实际效果评分
    // 如果预处理后效果变差，应该扣分而不是加分

    return Math.max(0, Math.min(100, score));
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
      const originalResult = await performOCRDetection(originalFile, false);
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
        const detectionResult = await performOCRDetection(processedFile, true);

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
  }, [selectedImage, imagePreview, selectedPresets, performOCRDetection, applyPreprocessingPreset, calculateDetectionScore]);

  // 生成评估结论 - 专注于多方案对比
  const generateEvaluationConclusion = useCallback((originalResult: OCRTestResult, processedResult: OCRTestResult | null, testResults?: PreprocessingTestResult[]): EvaluationConclusion => {
    // 获取所有测试结果（包括原始图像和多方案测试结果）
    const allResults = testResults && testResults.length > 0 ? testResults : [];

    // 找到最佳方案（基于检出字数和置信度）
    let bestResult = originalResult;
    let bestScore = 0;
    let bestPresetName = '原始图像';

    // 计算原始图像得分
    const originalTextLength = originalResult.text ? originalResult.text.length : 0;
    const originalConfidence = originalResult.confidence || 0;
    const originalScore = calculateDetectionScore(originalResult, 'original'); // 使用统一的评分函数

    if (originalScore > bestScore) {
      bestScore = originalScore;
      bestResult = originalResult;
      bestPresetName = '原始图像';
    }

    // 评估所有预处理方案
    allResults.forEach(result => {
      const score = result.score; // 使用已经计算好的评分

      if (score > bestScore) {
        bestScore = score;
        bestResult = result.detectionResult;
        bestPresetName = result.preset.name;
      }
    });

    // 计算最佳方案的检测成功率
    const bestTextLength = bestResult.text ? bestResult.text.length : 0;
    const bestConfidence = bestResult.confidence || 0;
    const bestDetectionRate = bestTextLength > 0 && bestConfidence > 0.3 ? 100 : 0;

    // 计算预处理效果 - 基于最佳方案与原始方案的对比
    let processingEffectiveness = 0;
    if (bestPresetName !== '原始图像') {
      if (originalTextLength === 0 && bestTextLength > 0) {
        processingEffectiveness = 100; // 从无文本到有文本
      } else if (originalTextLength > 0 && bestTextLength > originalTextLength) {
        processingEffectiveness = Math.min(100, ((bestTextLength - originalTextLength) / originalTextLength) * 100);
      } else if (originalTextLength === bestTextLength && bestTextLength > 0) {
        processingEffectiveness = bestConfidence > originalConfidence ? 50 : 0; // 置信度提升
      } else if (bestTextLength < originalTextLength) {
        processingEffectiveness = -30; // 预处理后效果变差
      }
    }

    // 计算总体评分 - 直接使用最佳方案的评分
    const overallScore = Math.round(bestScore);

    const recommendations: string[] = [];
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvementSuggestions: string[] = [];

    // 基于实际检测结果生成建议
    if (originalTextLength > 0) {
      strengths.push(`成功检测到文字内容（${originalTextLength}个字符）`);
      if (originalConfidence > 0.8) {
        strengths.push('检测置信度较高');
      } else if (originalConfidence > 0.5) {
        strengths.push('检测置信度中等');
      } else {
        weaknesses.push('检测置信度较低');
        improvementSuggestions.push('建议提高图像质量或调整检测参数');
      }
    } else {
      weaknesses.push('未检测到任何文字内容');
      improvementSuggestions.push('建议检查图像是否包含文字，或尝试不同的预处理方案');
    }

    if (processedResult) {
      const processedTextLength = processedResult.text ? processedResult.text.length : 0;
      const processedConfidence = processedResult.confidence || 0;

      if (processedTextLength > originalTextLength) {
        strengths.push('预处理显著提升了检测效果');
      } else if (processedTextLength === originalTextLength && processedConfidence > originalConfidence) {
        strengths.push('预处理提升了检测置信度');
      } else if (processedTextLength < originalTextLength) {
        weaknesses.push('预处理后检测效果变差');
        improvementSuggestions.push('建议调整预处理参数或尝试其他预处理方案');
      }
    }

    if (originalResult.processingTime > 2000) {
      weaknesses.push('检测处理时间较长');
      improvementSuggestions.push('建议优化检测算法或降低图像分辨率');
    } else if (originalResult.processingTime < 1000) {
      strengths.push('检测处理速度较快');
    }

    // 综合建议 - 基于实际检测结果
    const bestPreset = testResults && testResults.length > 0
      ? testResults[0].preset
      : null;

    if (overallScore >= 80) {
      recommendations.push('OCR检测系统表现优秀，可以投入生产使用');
      if (bestPreset && bestPreset.id !== 'original') {
        recommendations.push(`推荐使用${bestPreset.name}进行预处理，效果最佳`);
      }
    } else if (overallScore >= 60) {
      recommendations.push('OCR检测系统表现良好，建议进行小幅优化');
      if (bestPreset && bestPreset.id !== 'original') {
        recommendations.push(`建议采用${bestPreset.name}预处理方案，可提升检测效果`);
      }
      if (processingEffectiveness < 20) {
        recommendations.push('预处理效果有限，建议调整预处理参数或尝试其他方案');
      }
    } else if (overallScore >= 40) {
      recommendations.push('OCR检测系统表现一般，建议进行中等程度优化');
      if (bestPreset && bestPreset.id !== 'original') {
        recommendations.push(`推荐使用${bestPreset.name}预处理方案改善检测效果`);
      }
      recommendations.push('建议检查图像质量和检测参数配置');
    } else {
      recommendations.push('OCR检测系统表现较差，建议进行大幅优化或重新设计');
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

    return {
      overallScore: Math.round(overallScore),
      detectionRate: bestDetectionRate,
      processingEffectiveness: Math.max(0, processingEffectiveness),
      recommendations,
      strengths,
      weaknesses,
      improvementSuggestions
    };
  }, [imageQualityMetrics]);

  // 生成复原图片（坐标归一化：用原图作为背景，在上面叠加 bbox 标注）
  const generateReconstructedImage = useCallback((
    detectedTexts: Array<{ text: string, confidence: number, bbox: number[][] }>,
    bgImageSrc?: string | null,
  ) => {
    return new Promise<string>((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(''); return; }

      const draw = (srcW: number, srcH: number, bgImg?: HTMLImageElement) => {
        // 画布等比缩放到合理尺寸
        const MAX_W = 1600;
        const scale = Math.min(1, MAX_W / srcW);
        canvas.width = Math.round(srcW * scale);
        canvas.height = Math.round(srcH * scale);

        // 背景：原图或白底
        if (bgImg) {
          ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
          // 半透明白色蒙层让标注更清晰
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        detectedTexts.forEach((item) => {
          if (!item.bbox || item.bbox.length < 4) return;

          // 归一化：原图像素 → 画布像素
          const x = item.bbox[0][0] * scale;
          const y = item.bbox[0][1] * scale;
          const bboxW = Math.abs(item.bbox[1][0] - item.bbox[0][0]) * scale;
          const bboxH = Math.abs(item.bbox[2][1] - item.bbox[0][1]) * scale;

          // 根据 bbox 高度自适应字号
          const fontSize = bboxH > 0 ? Math.max(10, Math.min(40, Math.round(bboxH * 0.75))) : 14;

          // bbox 框
          const color = item.confidence >= 0.8 ? '#22c55e' : item.confidence >= 0.5 ? '#eab308' : '#ef4444';
          if (bboxW > 0 && bboxH > 0) {
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(1, Math.round(scale * 2));
            ctx.strokeRect(x, y, bboxW, bboxH);
            // 半透明填充
            ctx.fillStyle = color.replace(')', ',0.08)').replace('rgb', 'rgba');
            ctx.globalAlpha = 0.12;
            ctx.fillRect(x, y, bboxW, bboxH);
            ctx.globalAlpha = 1;
          }

          // 文字标签背景
          ctx.font = `bold ${fontSize}px Arial, sans-serif`;
          const textW = ctx.measureText(item.text).width;
          const labelH = fontSize + 4;
          const labelY = y > labelH + 2 ? y - labelH - 1 : y + bboxH + 1;
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(x, labelY, textW + 8, labelH);

          // 文字
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(item.text, x + 4, labelY + 2);

          // 置信度
          const confStr = `${(item.confidence * 100).toFixed(0)}%`;
          const confFontSize = Math.max(8, Math.round(fontSize * 0.6));
          ctx.font = `${confFontSize}px Arial, sans-serif`;
          const confW = ctx.measureText(confStr).width;
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(x + bboxW - confW - 6, y, confW + 6, confFontSize + 4);
          ctx.fillStyle = color;
          ctx.fillText(confStr, x + bboxW - confW - 3, y + 2);
        });

        resolve(canvas.toDataURL('image/png'));
      };

      // 尝试加载原图获取真实尺寸
      if (bgImageSrc) {
        const img = new Image();
        img.onload = () => draw(img.naturalWidth, img.naturalHeight, img);
        img.onerror = () => {
          let maxX = 800, maxY = 600;
          detectedTexts.forEach(item => {
            if (item.bbox) item.bbox.forEach(pt => { if (pt[0] > maxX) maxX = pt[0]; if (pt[1] > maxY) maxY = pt[1]; });
          });
          draw(maxX * 1.05, maxY * 1.05);
        };
        img.src = bgImageSrc;
      } else {
        let maxX = 800, maxY = 600;
        detectedTexts.forEach(item => {
          if (item.bbox) item.bbox.forEach(pt => { if (pt[0] > maxX) maxX = pt[0]; if (pt[1] > maxY) maxY = pt[1]; });
        });
        draw(maxX * 1.05, maxY * 1.05);
      }
    });
  }, []);

  // 开始检测评估
  const startDetection = useCallback(async () => {
    if (!selectedImage) return;

    setIsProcessing(true);
    updateStepStatus(3, true);

    try {
      // 检测原始图像
      const originalResult = await performOCRDetection(selectedImage, false);
      if (!originalResult) {
        toast.error('OCR检测失败');
        return;
      }

      setOriginalResult(originalResult);

      // 如果有预处理图像，也进行检测
      let processedResult: OCRTestResult | null = null;
      if (processedImage) {
        const response = await fetch(processedImage);
        const blob = await response.blob();
        const processedFile = new File([blob], 'processed.jpg', { type: 'image/jpeg' });
        processedResult = await performOCRDetection(processedFile, true);
      }
      setProcessedResult(processedResult);

      // 生成评估结论
      const conclusion = generateEvaluationConclusion(originalResult, processedResult, preprocessingTestResults);
      setEvaluationConclusion(conclusion);

      // 生成复原图片（传入原图作为背景，坐标自动归一化）
      if (originalResult.detectedTexts && originalResult.detectedTexts.length > 0) {
        const reconstructed = await generateReconstructedImage(originalResult.detectedTexts, imagePreview);
        setReconstructedImage(reconstructed);
      }

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
  }, [selectedImage, processedImage, imagePreview, performOCRDetection, updateStepStatus, generateEvaluationConclusion, generateReconstructedImage, preprocessingTestResults]);

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
    setSelectedPresets(['conservative', 'balanced', 'aggressive']); // 重置为默认选择
    setReconstructedImage(null);
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
    <>
      <style>{sliderStyles}</style>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        {/* 头部 */}
        <div className="bg-slate-800/50 backdrop-blur-sm border-b border-slate-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  onClick={() => navigate('/ocr')}
                  variant="outline"
                  className="bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  返回OCR检测
                </Button>
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                    <FileText className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-slate-100">OCR检出能力评估</h1>
                    <p className="text-slate-400">能力评估</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* 步骤指示器 */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {steps.map((step, index) => (
                <div key={step.step} className="flex items-center">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${step.completed
                    ? 'bg-green-600 border-green-600 text-white'
                    : currentStep === step.step
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
                    <h3 className="text-sm font-semibold text-slate-200">{step.title}</h3>
                    <p className="text-xs text-slate-400">{step.description}</p>
                  </div>
                  {index < steps.length - 1 && (
                    <div className="w-16 h-0.5 bg-slate-600 mx-4"></div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 主要内容区域 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* 左侧：步骤内容 */}
            <div className="lg:col-span-2">
              {/* 步骤1：上传测试图片 */}
              {currentStep === 1 && (
                <Card className="p-8 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                  <div className="text-center">
                    <div className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                      <Upload className="h-10 w-10 text-white" />
                    </div>
                    <h2 className="text-2xl font-semibold text-slate-100 mb-4">上传OCR测试图片</h2>
                    <p className="text-slate-400 mb-8">选择包含文字的图片文件，支持 JPG、PNG、GIF 格式</p>

                    <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 bg-slate-700/30 hover:bg-slate-700/50 transition-colors cursor-pointer"
                      onClick={() => fileInputRef.current?.click()}>
                      <div className="text-center">
                        <Upload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                        <p className="text-slate-300 mb-2">点击上传图片</p>
                        <p className="text-slate-400 text-sm">或拖拽图片到此区域</p>
                      </div>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                    />

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
                              <Label className="text-sm text-slate-300 mb-2 block">最大宽度 (px)</Label>
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
                              <Label className="text-sm text-slate-300 mb-2 block">最大高度 (px)</Label>
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
                              <Label className="text-sm text-slate-300 mb-2 block">
                                压缩质量: {compressionConfig.quality}
                              </Label>
                              <input
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.1"
                                value={compressionConfig.quality}
                                onChange={(e) => setCompressionConfig(prev => ({ ...prev, quality: parseFloat(e.target.value) }))}
                                className="w-full h-2 bg-slate-600 rounded-lg appearance-none cursor-pointer slider"
                              />
                              <div className="flex justify-between text-xs text-slate-400 mt-1">
                                <span>0.1</span>
                                <span>0.5</span>
                                <span>1.0</span>
                              </div>
                            </div>
                            <div>
                              <Label className="text-sm text-slate-300 mb-2 block">最大文件大小 (MB)</Label>
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
                            <div className="font-medium text-slate-300 mb-1">当前配置预览:</div>
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

              {/* 步骤2：图像质量分析 */}
              {currentStep === 2 && (
                <Card className="p-8 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                  <div className="text-center">
                    <div className="p-4 bg-gradient-to-r from-green-500 to-blue-600 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                      <Brain className="h-10 w-10 text-white" />
                    </div>
                    <h2 className="text-2xl font-semibold text-slate-100 mb-4">AI智能分析</h2>
                    <p className="text-slate-400 mb-8">正在分析图片质量，生成优化建议...</p>

                    {imagePreview && (
                      <div className="mb-6">
                        <img src={imagePreview} alt="分析图片" className="max-w-md mx-auto rounded-lg shadow-lg" />
                      </div>
                    )}

                    <div className="bg-gradient-to-r from-blue-900/30 to-green-900/30 border border-blue-500/30 rounded-xl p-6 mb-8">
                      <h3 className="text-lg font-semibold text-blue-300 mb-4">图像质量指标</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-400">亮度:</span>
                          <span className="text-slate-300">{imageQualityMetrics?.brightness?.toFixed(1) || '分析中...'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">对比度:</span>
                          <span className="text-slate-300">{imageQualityMetrics?.contrast?.toFixed(1) || '分析中...'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">清晰度:</span>
                          <span className="text-slate-300">{imageQualityMetrics?.sharpness?.toFixed(1) || '分析中...'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">噪声:</span>
                          <span className="text-slate-300">{imageQualityMetrics?.noise?.toFixed(1) || '分析中...'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-4">
                      <Button
                        onClick={performSmartAnalysis}
                        disabled={isProcessing}
                        className="flex-1 bg-gradient-to-r from-blue-600 to-green-600 hover:from-blue-700 hover:to-green-700 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50"
                      >
                        {isProcessing ? (
                          <>
                            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-3"></div>
                            分析中...
                          </>
                        ) : (
                          <>
                            <Brain className="h-5 w-5 mr-3" />
                            开始智能分析
                          </>
                        )}
                      </Button>

                      {imageQualityMetrics && (
                        <Button
                          onClick={nextStep}
                          className="flex-1 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-semibold py-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
                        >
                          <ArrowRight className="h-5 w-5 mr-3" />
                          下一步
                        </Button>
                      )}
                    </div>
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
                            className={`p-4 rounded-lg border cursor-pointer transition-all ${selectedPresets.includes(preset.id)
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
                          onClick={nextStep}
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
                              跳过预处理
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
                              className={`p-4 rounded-lg border ${index === 0
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
                                  <div className="text-lg font-bold text-green-400">{result.score.toFixed(1)}</div>
                                  <div className="text-xs text-slate-400">评分</div>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                                <div>
                                  <span className="text-slate-400">检测文本:</span>
                                  <span className="text-slate-200 ml-1">{result.detectionResult.text.length}字符</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">置信度:</span>
                                  <span className="text-slate-200 ml-1">{(result.detectionResult.confidence * 100).toFixed(1)}%</span>
                                </div>
                                <div>
                                  <span className="text-slate-400">处理时间:</span>
                                  <span className="text-slate-200 ml-1">{result.processingTime}ms</span>
                                </div>
                              </div>

                              {/* 选择此方案按钮 */}
                              <Button
                                onClick={() => {
                                  // 应用选择的方案
                                  if (result.preset.id === 'original') {
                                    // 原始图像不需要设置processedImage
                                    setProcessedImage(null);
                                    setProcessedResult(null);
                                  } else {
                                    setProcessedImage(result.processedImage);
                                    setProcessedResult(result.detectionResult);
                                  }

                                  // 更新步骤状态并跳转到步骤4
                                  updateStepStatus(3, true);
                                  setCurrentStep(4);

                                  toast.success(`已选择方案：${result.preset.name}，进入检测评估阶段`);
                                }}
                                className={`w-full py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${index === 0
                                  ? 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-700 hover:to-orange-700 text-white'
                                  : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
                                  }`}
                              >
                                {index === 0 ? (
                                  <>
                                    <Zap className="h-4 w-4 mr-2" />
                                    选择最佳方案
                                  </>
                                ) : (
                                  <>
                                    <Target className="h-4 w-4 mr-2" />
                                    选择此方案
                                  </>
                                )}
                              </Button>
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

                        {/* 下一步按钮 - 无论最佳方案是什么都显示 */}
                        <div className="mt-6 pt-4 border-t border-green-500/30">
                          <Button
                            onClick={() => {
                              // 如果最佳方案是原始图像，直接进入下一步
                              if (bestPreset && bestPreset.id === 'original') {
                                updateStepStatus(3, true);
                                setCurrentStep(4);
                                toast.success('使用原始图像，进入检测评估阶段');
                              } else {
                                // 如果最佳方案不是原始图像，但用户选择跳过预处理
                                updateStepStatus(3, true);
                                setCurrentStep(4);
                                toast.success('跳过预处理，进入检测评估阶段');
                              }
                            }}
                            className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-semibold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
                          >
                            <ArrowRight className="h-5 w-5 mr-3" />
                            下一步：执行检测评估
                          </Button>
                        </div>
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
                      <Target className="h-10 w-10 text-white" />
                    </div>
                    <h2 className="text-2xl font-semibold text-slate-100 mb-4">执行OCR检测评估</h2>
                    <p className="text-slate-400 mb-8">使用 OCR 引擎进行性能评估</p>

                    <div className="bg-gradient-to-r from-orange-900/30 to-red-900/30 border border-orange-500/30 rounded-xl p-6 mb-8">
                      <h3 className="text-lg font-semibold text-orange-300 mb-4">检测配置</h3>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-slate-400">检测器:</span>
                          <span className="text-slate-300">OCR 自动选择</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">检测模式:</span>
                          <span className="text-slate-300">文字识别</span>
                        </div>
                      </div>
                    </div>

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
                          <Target className="h-5 w-5 mr-3" />
                          开始评估
                        </>
                      )}
                    </Button>
                  </div>
                </Card>
              )}

              {/* 步骤5：查看评估结果 */}
              {currentStep === 5 && evaluationConclusion && (
                <div className="space-y-6">
                  {/* 复原图片 - 占据整个宽度 */}
                  {reconstructedImage && originalResult && (
                    <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                      <h3 className="text-lg font-semibold text-slate-200 mb-4">文字复原图</h3>
                      <div className="relative">
                        <img
                          src={reconstructedImage}
                          alt="文字复原图"
                          className="w-full rounded-lg shadow-lg border border-slate-600 bg-white"
                          style={{ minHeight: '500px' }}
                        />
                      </div>
                      <div className="mt-3 text-sm text-slate-400">
                        <p>• 根据OCR识别结果和定位信息生成</p>
                        <p>• 置信度颜色编码：</p>
                        <p className="ml-4">- <span className="text-green-400 font-semibold">高置信度(≥80%)</span>: 绿色</p>
                        <p className="ml-4">- <span className="text-yellow-400 font-semibold">中等置信度(50-80%)</span>: 黄色</p>
                        <p className="ml-4">- <span className="text-red-400 font-semibold">低置信度(&lt;50%)</span>: 红色</p>
                      </div>

                      {/* 下载复原图片按钮 */}
                      <div className="mt-4 pt-4 border-t border-slate-600">
                        <Button
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = reconstructedImage;
                            link.download = `ocr-reconstructed-${Date.now()}.png`;
                            link.click();
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          下载复原图片
                        </Button>
                      </div>
                    </Card>
                  )}

                  {/* 评估结论 */}
                  <Card className="p-8 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                    <div className="text-center">
                      <div className="p-4 bg-gradient-to-r from-green-500 to-blue-600 rounded-full w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                        <BarChart3 className="h-10 w-10 text-white" />
                      </div>
                      <h2 className="text-2xl font-semibold text-slate-100 mb-4">评估完成</h2>
                      <p className="text-slate-400 mb-8">查看OCR检测性能对比和优化效果</p>

                      {/* 对比结果 - 左右对比列表形式 */}
                      <div className="bg-slate-700/30 rounded-xl p-4 mb-8">
                        <h3 className="text-md font-semibold text-slate-200 mb-4 text-center">检测结果对比</h3>
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          {/* 表头 */}
                          <div className="font-semibold text-slate-300 text-center">处理前</div>
                          <div className="font-semibold text-slate-300 text-center">处理后</div>

                          {/* 检测文本对比 */}
                          <div className="bg-slate-600/50 rounded p-2">
                            <div className="text-slate-400 mb-1">检测文本</div>
                            <div className="text-slate-200 font-mono">
                              {originalResult ? `${originalResult.text.length}字符` : '0字符'}
                            </div>
                          </div>
                          <div className="bg-slate-600/50 rounded p-2">
                            <div className="text-slate-400 mb-1">检测文本</div>
                            <div className="text-slate-200 font-mono">
                              {processedResult ? `${processedResult.text.length}字符` : '未处理'}
                            </div>
                          </div>

                          {/* 置信度对比 */}
                          <div className="bg-slate-600/50 rounded p-2">
                            <div className="text-slate-400 mb-1">置信度</div>
                            <div className="text-slate-200 font-mono">
                              {originalResult ? `${(originalResult.confidence * 100).toFixed(1)}%` : '0%'}
                            </div>
                          </div>
                          <div className="bg-slate-600/50 rounded p-2">
                            <div className="text-slate-400 mb-1">置信度</div>
                            <div className="text-slate-200 font-mono">
                              {processedResult ? `${(processedResult.confidence * 100).toFixed(1)}%` : '未处理'}
                            </div>
                          </div>

                          {/* 处理时间对比 */}
                          <div className="bg-slate-600/50 rounded p-2">
                            <div className="text-slate-400 mb-1">处理时间</div>
                            <div className="text-slate-200 font-mono">
                              {originalResult ? `${originalResult.processingTime}ms` : '0ms'}
                            </div>
                          </div>
                          <div className="bg-slate-600/50 rounded p-2">
                            <div className="text-slate-400 mb-1">处理时间</div>
                            <div className="text-slate-200 font-mono">
                              {processedResult ? `${processedResult.processingTime}ms` : '未处理'}
                            </div>
                          </div>

                          {/* 检测文本内容对比 */}
                          <div className="bg-slate-600/50 rounded p-2">
                            <div className="text-slate-400 mb-1">识别内容</div>
                            <div className="text-slate-200 text-xs max-h-20 overflow-y-auto">
                              {originalResult ? originalResult.text : '无内容'}
                            </div>
                          </div>
                          <div className="bg-slate-600/50 rounded p-2">
                            <div className="text-slate-400 mb-1">识别内容</div>
                            <div className="text-slate-200 text-xs max-h-20 overflow-y-auto">
                              {processedResult ? processedResult.text : '未处理'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 评估结论 */}
                      <div className="space-y-6">
                        {/* 总体评分 */}
                        <div className="bg-gradient-to-r from-blue-900/30 to-green-900/30 border border-blue-500/30 rounded-xl p-6">
                          <h3 className="text-lg font-semibold text-blue-300 mb-4 flex items-center">
                            <TrendingUp className="h-5 w-5 mr-2" />
                            总体评估评分
                          </h3>
                          <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                              <div className="text-3xl font-bold text-blue-400">{evaluationConclusion.overallScore.toFixed(1)}</div>
                              <div className="text-sm text-slate-400">综合评分</div>
                            </div>
                            <div>
                              <div className="text-3xl font-bold text-green-400">{evaluationConclusion.detectionRate}%</div>
                              <div className="text-sm text-slate-400">检测成功率</div>
                            </div>
                            <div>
                              <div className="text-3xl font-bold text-purple-400">{evaluationConclusion.processingEffectiveness}%</div>
                              <div className="text-sm text-slate-400">预处理效果</div>
                            </div>
                          </div>
                        </div>

                        {/* 系统优势 */}
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

                        {/* 需要改进 */}
                        {evaluationConclusion.weaknesses.length > 0 && (
                          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-red-300 mb-4 flex items-center">
                              <AlertCircle className="h-5 w-5 mr-2" />
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
                          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-6">
                            <h3 className="text-lg font-semibold text-yellow-300 mb-4 flex items-center">
                              <Settings className="h-5 w-5 mr-2" />
                              改进建议
                            </h3>
                            <ul className="space-y-2">
                              {evaluationConclusion.improvementSuggestions.map((suggestion, index) => (
                                <li key={index} className="flex items-start">
                                  <div className="w-2 h-2 bg-yellow-400 rounded-full mt-2 mr-3 flex-shrink-0"></div>
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
                    </div>
                  </Card>
                </div>
              )}
            </div>

            {/* 右侧：图片预览和结果 */}
            <div className="lg:col-span-1">
              {/* 图片预览 */}
              {imagePreview && (
                <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg mb-6">
                  <h3 className="text-lg font-semibold text-slate-200 mb-4">图片预览</h3>
                  <div className="space-y-4">
                    <img src={imagePreview} alt="预览" className="w-full rounded-lg shadow-lg" />
                    <Button
                      onClick={() => fileInputRef.current?.click()}
                      variant="outline"
                      className="w-full bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
                    >
                      点击重新选择
                    </Button>
                  </div>
                </Card>
              )}

              {/* 检测结果 */}
              {(originalResult || processedResult) && (
                <Card className="p-6 bg-slate-800/70 backdrop-blur-sm border border-slate-700 shadow-lg">
                  <h3 className="text-lg font-semibold text-slate-200 mb-4">检测结果</h3>
                  <div className="space-y-4">
                    {originalResult && (
                      <div>
                        <h4 className="text-md font-semibold text-slate-300 mb-2">原始结果</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">检测文本:</span>
                            <span className="text-slate-300">{originalResult.text.length}字符</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">置信度:</span>
                            <span className="text-slate-300">{(originalResult.confidence * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">处理时间:</span>
                            <span className="text-slate-300">{originalResult.processingTime}ms</span>
                          </div>
                        </div>

                        {/* 详细检测结果 */}
                        {originalResult.detectedTexts && originalResult.detectedTexts.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-slate-600">
                            <h5 className="text-sm font-semibold text-slate-300 mb-3">详细检测结果 ({originalResult.detectedTexts.length}个文字块)</h5>
                            <div className="space-y-2">
                              {originalResult.detectedTexts.map((item, index) => (
                                <div key={index} className="p-2 bg-slate-700/50 rounded border border-slate-600/50">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm text-slate-200 font-medium">
                                      {index + 1}. {item.text}
                                    </span>
                                    <span className={`text-xs font-semibold ${item.confidence >= 0.8 ? 'text-green-400' :
                                      item.confidence >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                                      }`}>
                                      {(item.confidence * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    位置: {JSON.stringify(item.bbox)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {processedResult && (
                      <div>
                        <h4 className="text-md font-semibold text-slate-300 mb-2">处理后结果</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-400">检测文本:</span>
                            <span className="text-slate-300">{processedResult.text.length}字符</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">置信度:</span>
                            <span className="text-slate-300">{(processedResult.confidence * 100).toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-400">处理时间:</span>
                            <span className="text-slate-300">{processedResult.processingTime}ms</span>
                          </div>
                        </div>

                        {/* 详细检测结果 */}
                        {processedResult.detectedTexts && processedResult.detectedTexts.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-slate-600">
                            <h5 className="text-sm font-semibold text-slate-300 mb-3">详细检测结果 ({processedResult.detectedTexts.length}个文字块)</h5>
                            <div className="space-y-2">
                              {processedResult.detectedTexts.map((item, index) => (
                                <div key={index} className="p-2 bg-slate-700/50 rounded border border-slate-600/50">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-sm text-slate-200 font-medium">
                                      {index + 1}. {item.text}
                                    </span>
                                    <span className={`text-xs font-semibold ${item.confidence >= 0.8 ? 'text-green-400' :
                                      item.confidence >= 0.5 ? 'text-yellow-400' : 'text-red-400'
                                      }`}>
                                      {(item.confidence * 100).toFixed(1)}%
                                    </span>
                                  </div>
                                  <div className="text-xs text-slate-400">
                                    位置: {JSON.stringify(item.bbox)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              )}

            </div>
          </div>

          {/* 底部操作按钮 */}
          <div className="flex space-x-4 mt-8">
            <Button
              onClick={resetFlow}
              variant="outline"
              className="flex-1 bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200"
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              重新开始
            </Button>

            {currentStep === 5 && (
              <Button
                onClick={() => {
                  // 下载结果功能
                  const result = {
                    originalResult,
                    processedResult,
                    evaluationConclusion,
                    imageQualityMetrics,
                    preprocessingTestResults
                  };
                  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `ocr-evaluation-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success('评估结果已下载');
                }}
                className="flex-1 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white"
              >
                <Download className="h-4 w-4 mr-2" />
                下载结果
              </Button>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default OCRGuidedTestScreen;

