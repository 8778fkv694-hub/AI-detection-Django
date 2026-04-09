/**
 * useFusionAI Hook
 *
 * 用途：管理融合模式 AI 分析逻辑
 * 功能：
 * - 结合 OCR 和 LLM 进行融合分析
 * - 在线模式调用后端 /api/ai/analyze
 * - 本地模式直接调用 Ollama（通过 Django 代理）
 * - 管理分析状态和结果
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等
 */

import { useState, useCallback } from 'react';
import type { InspectionResult } from '@/types';
import { apiFetch, directBackendFetch } from '@/lib/config';

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

/** 从 localStorage 读取当前模型模式配置 */
function getModelModeConfig() {
  try {
    const saved = localStorage.getItem('modelModeConfig');
    if (saved) {
      return JSON.parse(saved);
    }
  } catch { /* ignore */ }
  return null;
}

export const useFusionAI = (options: UseFusionAIOptions): UseFusionAIReturn => {
  const { fusionModeEnabled, selectedStandardId, config } = options;

  const [aiAnalysisResult, setAiAnalysisResult] = useState<InspectionResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // 本地模式：通过 Ollama 分析图片
  const analyzeViaOllama = useCallback(async (imageBase64: string): Promise<InspectionResult | null> => {
    const modeConfig = getModelModeConfig();
    const localConfig = modeConfig?.localModelConfig || {};
    const modelName = localConfig.modelName || 'gemma4:e4b';

    // 提取纯 base64
    const pureBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const isThinkingModel = modelName.includes('gemma4') || modelName.includes('qwq');

    const systemPrompt = localConfig.systemPrompt ||
      '你是一个专业的工业质检AI助手。请用中文回答，返回JSON格式结果。';
    const userMessage = localConfig.userMessage ||
      '请分析图片质量，返回JSON格式：{"overallQuality": "合格/存疑/需复检", "score": 85, "reason": "检测原因", "reasonKeywords": "关键词", "defects": []}';

    const requestBody: Record<string, any> = {
      model: modelName,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: userMessage,
          images: [pureBase64]
        }
      ],
      stream: false,
      ...(isThinkingModel ? { think: false } : {}),
      options: {
        temperature: localConfig.temperature ?? 0.2,
        num_predict: localConfig.maxTokens ?? 512,
        num_ctx: localConfig.contextLength ?? 8192,
      }
    };

    console.log('🤖 [FusionAI] 本地模式 Ollama 调用:', modelName);

    const response = await directBackendFetch('/ollama/chat/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Ollama API错误: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.message?.content || '';
    console.log('🤖 [FusionAI] Ollama 返回:', content.substring(0, 200));

    // 尝试从返回内容中提取 JSON
    let parsed: any = null;
    try {
      // 尝试直接解析
      parsed = JSON.parse(content);
    } catch {
      // 尝试从 markdown code block 中提取
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        try { parsed = JSON.parse(jsonMatch[1].trim()); } catch { /* ignore */ }
      }
      // 尝试匹配 { ... } 块
      if (!parsed) {
        const braceMatch = content.match(/\{[\s\S]*\}/);
        if (braceMatch) {
          try { parsed = JSON.parse(braceMatch[0]); } catch { /* ignore */ }
        }
      }
    }

    if (!parsed) {
      console.warn('🤖 [FusionAI] 无法解析JSON，使用原始内容');
      parsed = {
        overallQuality: '需复检',
        score: 50,
        reason: content.substring(0, 200),
        reasonKeywords: '',
        defects: []
      };
    }

    return {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      image: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
      standardId: selectedStandardId || null,
      overallQuality: parsed.overallQuality || '需复检',
      score: parsed.score ?? 50,
      reason: parsed.reason || '',
      reasonKeywords: parsed.reasonKeywords || '',
      defects: parsed.defects || [],
      details: parsed,
    } as InspectionResult;
  }, [selectedStandardId]);

  // 融合模式AI分析函数
  const performFusionAIAnalysis = useCallback(async (originalImageBase64: string): Promise<InspectionResult | null> => {
    console.log('🔍 融合模式AI分析函数被调用');

    if (!fusionModeEnabled) {
      console.log('❌ 融合模式未启用，跳过AI分析');
      return null;
    }

    setIsAnalyzing(true);
    try {
      // 判断本地/在线模式
      const modeConfig = getModelModeConfig();
      const isLocal = modeConfig?.mode === 'local';

      if (isLocal) {
        console.log('🚀 [FusionAI] 使用本地模型分析...');
        const result = await analyzeViaOllama(originalImageBase64);
        setAiAnalysisResult(result);
        return result;
      }

      // 在线模式：走原有 /api/ai/analyze
      console.log('🚀 [FusionAI] 使用在线模型分析...');
      const response = await apiFetch('/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      setAiAnalysisResult(aiResult);
      return aiResult;

    } catch (error) {
      console.error('❌ 融合模式AI分析失败:', error);
      setAiAnalysisResult(null);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, [fusionModeEnabled, selectedStandardId, config, analyzeViaOllama]);

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
