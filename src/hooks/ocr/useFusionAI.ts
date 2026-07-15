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
  standards?: any[];
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

const VALID_QUALITIES = new Set(['合格', '存疑', '需复检']);

function createRecheckResult(
  imageBase64: string,
  standardId: string | null,
  reason: string,
): InspectionResult {
  return {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    image: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
    standardId,
    overallQuality: '需复检',
    score: 0,
    reason,
    reasonKeywords: '融合分析失败,需复检',
    defects: [],
  };
}

function normalizeInspectionResult(
  parsed: any,
  imageBase64: string,
  standardId: string | null,
): InspectionResult {
  const hasReason = typeof parsed?.reason === 'string' && Boolean(parsed.reason.trim());
  const quality = VALID_QUALITIES.has(parsed?.overallQuality) && hasReason
    ? parsed.overallQuality
    : '需复检';
  const rawScore = Number(parsed?.score);
  const score = Number.isFinite(rawScore) ? Math.max(0, Math.min(100, Math.round(rawScore))) : 0;
  const reason = hasReason
    ? parsed.reason.trim()
    : 'AI 未返回可复核的判定依据。';
  const reasonKeywords = Array.isArray(parsed?.reasonKeywords)
    ? parsed.reasonKeywords.join(',')
    : (parsed?.reasonKeywords || '');

  return {
    id: parsed?.id || Date.now().toString(),
    timestamp: parsed?.timestamp || new Date().toISOString(),
    image: imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`,
    standardId,
    overallQuality: quality,
    score,
    reason,
    reasonKeywords,
    defects: Array.isArray(parsed?.defects) ? parsed.defects : [],
  };
}

export const useFusionAI = (options: UseFusionAIOptions): UseFusionAIReturn => {
  const { fusionModeEnabled, selectedStandardId, config, standards } = options;

  const [aiAnalysisResult, setAiAnalysisResult] = useState<InspectionResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);

  // 本地模式：通过 Ollama 分析图片
  const analyzeViaOllama = useCallback(async (imageBase64: string): Promise<InspectionResult | null> => {
    const modeConfig = getModelModeConfig();
    const localConfig = modeConfig?.localModelConfig || {};
    const modelName = localConfig.modelName || 'gemma4-e2b:latest';

    // 提取纯 base64
    const pureBase64 = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

    const isThinkingModel = modelName.includes('gemma4') || modelName.includes('qwq');

    const matchedStandard = standards?.find(s => s.id === selectedStandardId);
    if (!matchedStandard) {
      throw new Error('未找到已选择的检测标准');
    }
    const standardCriteria = matchedStandard.criteria || '';

    const systemPrompt = localConfig.systemPrompt ||
      '你是一个专业的工业质检AI助手。请用中文回答，返回JSON格式结果。';
    const baseUserMessage = localConfig.userMessage ||
      '请分析图片质量，返回JSON格式：{"overallQuality": "合格/存疑/需复检", "score": 85, "reason": "检测原因", "reasonKeywords": "关键词", "defects": []}';

    const userMessage = standardCriteria
      ? `检测任务：请分析图片是否符合以下检测要求：\n"标准要求：${standardCriteria}。请仔细核对画面中的细节。"\n\n请严格返回 JSON 格式结果。格式要求示例：\n${baseUserMessage}`
      : baseUserMessage;

    const images = [pureBase64];
    if (matchedStandard.sendStandardImage && matchedStandard.standardImage) {
      const standardImage = matchedStandard.standardImage.includes(',')
        ? matchedStandard.standardImage.split(',', 2)[1]
        : matchedStandard.standardImage;
      images.push(standardImage);
    }

    const imageOrderHint = images.length > 1
      ? '\n\n图片顺序：第1张是待检图，第2张是标准对比图，不得将两者颠倒。'
      : '';

    const requestBody: Record<string, any> = {
      model: modelName,
      ollama_host: localConfig.ollamaHost || undefined,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `${userMessage}${imageOrderHint}`,
          images
        }
      ],
      stream: false,
      format: 'json',
      ...(isThinkingModel ? { think: false } : {}),
      options: {
        temperature: localConfig.temperature ?? 0.1,
        num_predict: localConfig.maxTokens ?? 512,
        num_ctx: localConfig.contextLength ?? 8192,
      }
    };

    console.log('🤖 [FusionAI] 本地模式 Ollama 调用:', modelName);

    const controller = new AbortController();
    const requestedTimeout = Number(localConfig.timeout ?? 120000);
    const timeoutMs = Math.max(10000, Math.min(600000, Number.isFinite(requestedTimeout) ? requestedTimeout : 120000));
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await directBackendFetch('/ollama/chat/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }

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

    return normalizeInspectionResult(parsed, imageBase64, selectedStandardId);
  }, [selectedStandardId, standards]);

  // 融合模式AI分析函数
  const performFusionAIAnalysis = useCallback(async (originalImageBase64: string): Promise<InspectionResult | null> => {
    console.log('🔍 融合模式AI分析函数被调用');

    if (!fusionModeEnabled) {
      console.log('❌ 融合模式未启用，跳过AI分析');
      return null;
    }

    if (!originalImageBase64) {
      const recheck = createRecheckResult('', selectedStandardId, '未获取到可供 AI 分析的待检图片。');
      setAiAnalysisResult(recheck);
      return recheck;
    }

    const matchedStandard = standards?.find(s => s.id === selectedStandardId);
    if (!selectedStandardId || !matchedStandard) {
      const recheck = createRecheckResult(originalImageBase64, selectedStandardId, '融合模式未找到有效的检测标准。');
      setAiAnalysisResult(recheck);
      return recheck;
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
      const pureBase64 = originalImageBase64.includes(',')
        ? originalImageBase64.split(',', 2)[1]
        : originalImageBase64;
      const controller = new AbortController();
      const requestedTimeout = Number(config?.timeout ?? 120000);
      const timeoutMs = Math.max(10000, Math.min(600000, Number.isFinite(requestedTimeout) ? requestedTimeout : 120000));
      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await apiFetch('/ai/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: pureBase64,
            config: config,
            standard: matchedStandard,
          }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!response.ok) {
        throw new Error(`AI分析请求失败: ${response.status} ${response.statusText}`);
      }

      const aiResult = normalizeInspectionResult(await response.json(), originalImageBase64, selectedStandardId);
      console.log('✅ AI分析完成:', aiResult);
      setAiAnalysisResult(aiResult);
      return aiResult;

    } catch (error) {
      console.error('❌ 融合模式AI分析失败:', error);
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      const recheck = createRecheckResult(
        originalImageBase64,
        selectedStandardId,
        `AI 融合分析失败：${errorMessage}。`,
      );
      setAiAnalysisResult(recheck);
      return recheck;
    } finally {
      setIsAnalyzing(false);
    }
  }, [fusionModeEnabled, selectedStandardId, config, standards, analyzeViaOllama]);

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
