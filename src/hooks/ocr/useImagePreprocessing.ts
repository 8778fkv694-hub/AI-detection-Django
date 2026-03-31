/**
 * useImagePreprocessing Hook
 *
 * 用途：管理智能图像预处理逻辑
 * 功能：
 * - 图像质量分析
 * - 自动应用预处理（亮度、对比度、锐化、降噪）
 * - 预处理方案管理
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import { useState, useCallback } from 'react';
import { preprocessImage, analyzeImageQuality, PreprocessingOptions } from '@/lib/imagePreprocessingApi';
import { ImageQualityAnalyzer } from '@/lib/imageQualityAnalyzer';
import { PREPROCESSING_PRESETS } from '@/screens/ocrDetection/config';

export interface ImagePreprocessingState {
  enableSmartPreprocessing: boolean;
  imageQualityMetrics: any | null;
  preprocessingRecommendation: any | null;
  processedImagePreview: string | null;
  showImageComparison: boolean;
  isAnalyzingImage: boolean;
  isPreprocessing: boolean;
  selectedPreprocessingPreset: string;
}

export interface UseImagePreprocessingReturn extends ImagePreprocessingState {
  setEnableSmartPreprocessing: (enabled: boolean) => void;
  setShowImageComparison: (show: boolean) => void;
  setSelectedPreprocessingPreset: (preset: string) => void;
  performSmartImageAnalysis: (imageFile: File) => Promise<void>;
  applySmartPreprocessing: (imageBase64: string) => Promise<string>;
  resetPreprocessingState: () => void;
}

export const useImagePreprocessing = (): UseImagePreprocessingReturn => {
  const [enableSmartPreprocessing, setEnableSmartPreprocessing] = useState(true);
  const [imageQualityMetrics, setImageQualityMetrics] = useState<any>(null);
  const [preprocessingRecommendation, setPreprocessingRecommendation] = useState<any>(null);
  const [processedImagePreview, setProcessedImagePreview] = useState<string | null>(null);
  const [showImageComparison, setShowImageComparison] = useState(false);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isPreprocessing, setIsPreprocessing] = useState(false);
  const [selectedPreprocessingPreset, setSelectedPreprocessingPreset] = useState<string>('balanced');

  // 智能图像质量分析
  const performSmartImageAnalysis = useCallback(async (imageFile: File) => {
    if (!enableSmartPreprocessing || !imageFile) return;

    setIsAnalyzingImage(true);
    try {
      console.log('🔍 开始智能图像质量分析...');

      // 将File转换为base64
      const reader = new FileReader();
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      // 调用后端图像质量分析API
      const qualityResult = await analyzeImageQuality(imageBase64);

      if (qualityResult.success && qualityResult.metrics) {
        setImageQualityMetrics(qualityResult.metrics);
        setPreprocessingRecommendation(qualityResult.recommendations);
        console.log('✅ 图像质量分析完成:', qualityResult.metrics);
        console.log('💡 预处理推荐:', qualityResult.recommendations);
      } else {
        // 降级到前端分析
        console.log('🔄 后端分析失败，使用前端分析...');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const img = new Image();
          img.onload = async () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            // 使用前端分析器
            const metrics = await ImageQualityAnalyzer.analyzeImageQuality(imageData);
            const recommendation = ImageQualityAnalyzer.generateRecommendation(metrics);

            setImageQualityMetrics(metrics);
            setPreprocessingRecommendation(recommendation);
            console.log('✅ 前端图像质量分析完成:', metrics);
          };
          img.src = imageBase64;
        }
      }
    } catch (error) {
      console.error('❌ 图像质量分析失败:', error);
    } finally {
      setIsAnalyzingImage(false);
    }
  }, [enableSmartPreprocessing]);

  // 自动应用智能预处理
  const applySmartPreprocessing = useCallback(async (imageBase64: string): Promise<string> => {
    if (!enableSmartPreprocessing) {
      return imageBase64; // 返回原图
    }

    setIsPreprocessing(true);
    try {
      console.log('🔧 开始应用智能预处理...');

      // 获取选中的预处理方案
      const preset = PREPROCESSING_PRESETS.find(p => p.id === selectedPreprocessingPreset);
      if (!preset) {
        console.warn('⚠️ 未找到选中的预处理方案，使用原图');
        return imageBase64;
      }

      // 根据方案生成预处理参数
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
        setProcessedImagePreview(result.processed_image);
        console.log(`✅ 智能预处理完成 (${preset.name})`);
        return result.processed_image;
      } else {
        console.warn('⚠️ 预处理失败，使用原图');
        return imageBase64;
      }
    } catch (error) {
      console.error('❌ 智能预处理失败:', error);
      return imageBase64;
    } finally {
      setIsPreprocessing(false);
    }
  }, [enableSmartPreprocessing, selectedPreprocessingPreset]);

  // 重置预处理状态
  const resetPreprocessingState = useCallback(() => {
    setImageQualityMetrics(null);
    setPreprocessingRecommendation(null);
    setProcessedImagePreview(null);
    setShowImageComparison(false);
    setIsAnalyzingImage(false);
    setIsPreprocessing(false);
  }, []);

  return {
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
    applySmartPreprocessing,
    resetPreprocessingState,
  };
};
