/**
 * useFusionAI Hook
 *
 * 用途：管理融合模式 AI 分析逻辑
 * 功能：
 * - 结合 OCR 和 LLM 进行融合分析
 * - 调用后端 AI 分析 API
 * - 管理分析状态和结果
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import { useState, useCallback } from 'react';
import type { InspectionResult } from '@/types';
import { apiFetch } from '@/lib/config';

export interface UseFusionAIOptions {
  fusionModeEnabled: boolean;
  selectedStandardId: string | null;
  config: any;
}

export interface UseFusionAIReturn {
  aiAnalysisResult: InspectionResult | null;
  isAnalyzing: boolean;
  setAiAnalysisResult: (result: InspectionResult | null) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  performFusionAIAnalysis: (originalImageBase64: string) => Promise<InspectionResult | null>;
  resetFusionAIState: () => void;
}

export const useFusionAI = (options: UseFusionAIOptions): UseFusionAIReturn => {
  const { fusionModeEnabled, selectedStandardId, config } = options;

  const [aiAnalysisResult, setAiAnalysisResult] = useState<InspectionResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // 融合模式AI分析函数
  const performFusionAIAnalysis = useCallback(async (originalImageBase64: string): Promise<InspectionResult | null> => {
    console.log('🔍 融合模式AI分析函数被调用');
    console.log('🔍 fusionModeEnabled:', fusionModeEnabled);
    console.log('🔍 originalImageBase64长度:', originalImageBase64.length);

    if (!fusionModeEnabled) {
      console.log('❌ 融合模式未启用，跳过AI分析');
      return null;
    }

    setIsAnalyzing(true);
    try {
      console.log('🚀 开始融合模式AI分析...');

      // 将base64字符串转换为File对象
      console.log('📸 开始转换base64为File对象...');

      // 清理base64字符串，移除可能的无效字符
      let cleanBase64 = originalImageBase64;
      if (cleanBase64.includes(',')) {
        cleanBase64 = cleanBase64.split(',')[1]; // 移除data:image/jpeg;base64,前缀
      }

      // 将base64转换为Blob
      const byteCharacters = atob(cleanBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      // 创建File对象
      const imageFile = new File([blob], 'analysis_image.jpg', { type: 'image/jpeg' });
      console.log('📸 File对象创建完成，大小:', imageFile.size, 'bytes');

      // 创建FormData
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('standard_id', selectedStandardId || '');

      console.log('📤 开始发送AI分析请求...');
      console.log('📤 standard_id:', selectedStandardId);

      // 发送请求到AI分析API
      const response = await apiFetch('/ai/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: originalImageBase64,
          config: config,
          standard: {
            id: selectedStandardId,
            name: '检测标准',
            type: 'rule_based',
            criteria: '请根据图片内容进行质量检测'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`AI分析请求失败: ${response.status} ${response.statusText}`);
      }

      const aiResult = await response.json();
      console.log('✅ AI分析完成:', aiResult);

      // 设置AI分析结果
      setAiAnalysisResult(aiResult);

      return aiResult;

    } catch (error) {
      console.error('❌ 融合模式AI分析失败:', error);

      if (error instanceof Error) {
        console.error('❌ 错误类型:', error.constructor.name);
        console.error('❌ 错误消息:', error.message);
        console.error('❌ 错误堆栈:', error.stack);
      } else {
        console.error('❌ 未知错误类型:', typeof error, error);
      }

      setAiAnalysisResult(null);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [fusionModeEnabled, selectedStandardId, config]);

  // 重置融合AI状态
  const resetFusionAIState = useCallback(() => {
    setAiAnalysisResult(null);
    setIsAnalyzing(false);
  }, []);

  return {
    aiAnalysisResult,
    isAnalyzing,
    setAiAnalysisResult,
    setIsAnalyzing,
    performFusionAIAnalysis,
    resetFusionAIState,
  };
};
