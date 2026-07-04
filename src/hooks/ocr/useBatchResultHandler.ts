/**
 * Batch Result Handler Hook
 *
 * 用途：处理批处理完成后的结果回调
 * 功能：解析条码数据、构造结构化OCR结果、前端合格状态计算、自动保存到后端
 * 提取自：OCRDetectionScreen.tsx (原第 435-745 行的 onBatchComplete + 第 986-1029 行的自动保存 useEffect)
 */

import { useCallback, useEffect, useRef } from 'react';
import type { DetectionHistoryItem } from '@/state/ocrDetectionStore';
import type { BatchProcessingResult } from '@/hooks/ocr/useBatchProcessing';
import type { TestResult } from '@/types/ocr';
import { buildBarcodeAnalysis } from '@/lib/ocr/barcodeRuleEvaluator';
import { buildKeywordAnalysis, countKeywordMatches } from '@/lib/ocr/keywordRuleEvaluator';

export interface UseBatchResultHandlerOptions {
  // 配置
  enableKeywordAnalysis: boolean;
  enableBarcodeDetection: boolean;
  barcodeConfigs: any[];
  keywordConfigs: any[];
  keywordMatchMode: 'contains' | 'exact';
  requireQualifiedConfirmation: boolean;

  // 融合模式
  fusionModeEnabled: boolean;
  performFusionAIAnalysis: (imageBase64: string) => Promise<any>;

  // 批处理管理器
  batchManager: { reset: () => void } | null;

  // State setters
  setOcrResult: (value: TestResult | null) => void;
  setImagePreview: (value: string) => void;
  setWorkflowState: (value: 'idle' | 'capturing' | 'searching_best_frame' | 'processing' | 'waiting_for_approval' | 'completed') => void;
  setFinalResult: (value: 'qualified' | 'unqualified' | 'none') => void;
  setMatchStatus: (value: 'none' | 'qualified' | 'unqualified') => void;
  setIsWaitingForSpace: (value: boolean) => void;
  setWorkflowResult: (value: any) => void;
  setAiAnalysisResult: (value: any) => void;
  setDetectedElements: (value: string[]) => void;
  setElementDetectionStartTime: (value: number | null) => void;
  addDetectionHistory: (item: DetectionHistoryItem) => void;

  // 保存函数
  saveDetectionResult: (ocrResult: any, aiResult: any, matchStatus: string, imageBase64: string) => Promise<void>;

  // 捕获帧数据
  captureFrameData: () => { dataUrl: string; base64: string } | null;
}

// 检查ROI中的条码是否匹配配置规则
const isConfigMatchedByRoi = (roi: any, config: any) => {
  const expectedText = (config.expectedText || '').trim();
  const matchMode = config.matchMode || 'contains';
  const barcodes = roi.barcodes || [];
  const ocrText = roi.ocr_text || '';

  if (!expectedText) return true;

  const barcodeMatched = barcodes.some((b: any) => {
    const text = typeof b === 'string' ? b : (b.data || '');
    return matchMode === 'exact' ? text === expectedText : text.includes(expectedText);
  });

  if (barcodeMatched) return true;

  // OCR 兜底
  return matchMode === 'exact' ? ocrText === expectedText : ocrText.includes(expectedText);
};

const getMatchedBarcodeTextByRoi = (roi: any, config: any) => {
  const expectedText = (config.expectedText || '').trim();
  const matchMode = config.matchMode || 'contains';
  const barcodes = roi.barcodes || [];
  const ocrText = roi.ocr_text || '';

  if (!expectedText) {
    const firstBarcode = barcodes[0];
    if (typeof firstBarcode === 'string') return firstBarcode;
    if (firstBarcode?.data) return firstBarcode.data;
    return ocrText || '';
  }

  for (const barcode of barcodes) {
    const text = typeof barcode === 'string' ? barcode : (barcode.data || '');
    const matched = matchMode === 'exact' ? text === expectedText : text.includes(expectedText);
    if (matched) return text;
  }

  const ocrMatched = matchMode === 'exact' ? ocrText === expectedText : ocrText.includes(expectedText);
  return ocrMatched ? ocrText : '';
};

export const useBatchResultHandler = (options: UseBatchResultHandlerOptions) => {
  const {
    enableKeywordAnalysis, enableBarcodeDetection, barcodeConfigs, keywordConfigs, keywordMatchMode, requireQualifiedConfirmation,
    fusionModeEnabled, performFusionAIAnalysis,
    batchManager,
    setOcrResult, setImagePreview, setWorkflowState, setFinalResult,
    setMatchStatus, setIsWaitingForSpace, setWorkflowResult, setAiAnalysisResult,
    setDetectedElements, setElementDetectionStartTime, addDetectionHistory,
    saveDetectionResult, captureFrameData,
  } = options;

  const batchRunIdRef = useRef(0);
  const batchResultSavedRef = useRef<string | null>(null);
  const batchSaveRetryRef = useRef<{ count: number; lastAttempt: number }>({ count: 0, lastAttempt: 0 });

  // 批处理完成回调
  const onBatchComplete = useCallback(async (result: BatchProcessingResult) => {
    console.log('✅ 批处理完成，更新UI:', result);
    batchRunIdRef.current += 1;

    const allDetectedBarcodeTexts = (result.details || []).flatMap((detail: any) =>
      (detail.barcodes || []).map((item: any) => typeof item === 'string' ? item : (item.data || ''))
    ).filter(Boolean);

    const barcodeConfigEvaluations = enableBarcodeDetection && barcodeConfigs
      ? barcodeConfigs
          .filter(c => c.enabled)
          .map((config) => {
            const targetRoi = (config as any).targetRoi;
            const relevantRois = targetRoi && targetRoi !== 'all'
              ? (result.details || []).filter((d: any) => d.label === targetRoi)
              : (result.details || []);
            const matchedRois = relevantRois.filter((roi: any) => isConfigMatchedByRoi(roi, config));
            const firstMatchedRoi = matchedRois[0];

            return {
              config,
              targetRoi: targetRoi || 'all',
              relevantRois,
              matchedRois,
              matched: matchedRois.length > 0,
              detectedText: firstMatchedRoi ? getMatchedBarcodeTextByRoi(firstMatchedRoi, config) : '',
            };
          })
      : [];

    const structuredBarcodeResults = barcodeConfigEvaluations.map(({ config, targetRoi, matched, detectedText, matchedRois }) => ({
      detectedText,
      expectedText: config.expectedText || ((targetRoi && targetRoi !== 'all') ? `(任意条码) [${targetRoi}]` : '(任意条码)'),
      matchMode: config.matchMode || 'contains' as const,
      matched,
      confidence: matched ? 1 : 0,
      qrCodeData: detectedText,
      type: 'qr' as const,
      targetRoi,
      matchedRois: matchedRois.map((roi: any) => roi.label || ''),
    }));

    const barcodeTexts = allDetectedBarcodeTexts;

    // 关键词匹配回显
    const fullText = result.ocr_text || '';
    const keywordAnalysis = enableKeywordAnalysis
      ? buildKeywordAnalysis({
          details: (result.details || []).map((detail: any) => ({
            text: detail.ocr_text || '',
            confidence: detail.ocr_confidence ?? 0,
            label: detail.label || '',
          })),
          fullText,
          keywordConfigs,
          keywordMatchMode,
        })
      : null;
    const matchDetails = keywordAnalysis?.keyword_match_details || [];

    // 前端重新计算合格状态
    const isKeywordsQualified = !enableKeywordAnalysis || matchDetails.every(m => m.overallMatched);

    const isBarcodesQualified = !enableBarcodeDetection || barcodeConfigEvaluations.every(item => item.matched);

    const isQualified = result.success && isKeywordsQualified && isBarcodesQualified;
    const totalRuleChecks = (enableKeywordAnalysis ? matchDetails.length : 0) + (enableBarcodeDetection ? barcodeConfigEvaluations.length : 0);
    const matchedRuleChecks = (enableKeywordAnalysis ? matchDetails.filter(m => m.overallMatched).length : 0)
      + (enableBarcodeDetection ? barcodeConfigEvaluations.filter(item => item.matched).length : 0);
    const inspectionScore = totalRuleChecks > 0
      ? Math.round((matchedRuleChecks / totalRuleChecks) * 100)
      : (isQualified ? 100 : 0);

    // 构造包含ROI详细信息的OCR结果对象
    const ocrResultData = {
      success: result.success,
      full_text: fullText,
      detailed_results: result.details.map((d: any) => ({
        text: d.ocr_text,
        confidence: d.ocr_confidence || 0,
        bbox: d.bbox || [],
        label: d.label || '',
        roi_id: d.roi_id || ''
      })),
      text_count: result.roi_count,
      batch_processing: {
        mode: 'batch',
        roi_count: result.roi_count,
        roi_details: result.details.map((d: any) => {
          const roiText = d.ocr_text || '';
          const roiBarcodes = d.barcodes || [];
          const roiLabel = d.label || '';

          const keywordMatch = keywordConfigs
            .filter(config => {
              if (!enableKeywordAnalysis) return false;
              const targetRoi = (config as any).targetRoi;
              return !targetRoi || targetRoi === 'all' || targetRoi === roiLabel;
            })
            .map(config => {
              const rawCount = countKeywordMatches(roiText, config.text, keywordMatchMode);
              const isNegative = (config.type || 'positive') === 'negative';
              const requiredCount = isNegative ? 0 : (config.requiredCount ?? 1);
              const minConfidence = config.confidence ?? 0;
              const roiConfidence = d.ocr_confidence ?? 0;
              const actualCount = !isNegative && roiConfidence < minConfidence ? 0 : rawCount;

              return {
                keyword: config.text,
                found: isNegative ? actualCount > 0 : actualCount >= requiredCount,
                type: config.type || 'positive',
                targetRoi: (config as any).targetRoi || 'all',
                actualCount,
                requiredCount,
              };
            });

          const barcodeMatch = barcodeConfigEvaluations
            .filter(({ config, targetRoi, matchedRois }) => {
              if ((config as any).targetRoi && (config as any).targetRoi !== 'all') {
                return targetRoi === roiLabel;
              }
              if (matchedRois.length > 0) {
                return matchedRois.some((matchedLabel: any) => matchedLabel === roiLabel);
              }
              const firstLabel = result.details?.[0]?.label || '';
              return roiLabel === firstLabel;
            })
            .map(({ config, matched, detectedText, targetRoi, matchedRois }) => ({
              expectedText: config.expectedText || '',
              matchMode: config.matchMode || 'contains',
              detectedBarcodes: matched
                ? [detectedText].filter(Boolean)
                : roiBarcodes.map((b: any) => typeof b === 'string' ? b : b.data || ''),
              matched,
              required: config.enabled,
              targetRoi,
              matchedRois,
            }));

          return {
            label: roiLabel,
            roi_id: d.roi_id || '',
            ocr_text: roiText,
            bbox: d.bbox || [],
            barcodes: roiBarcodes,
            keyword_match: keywordMatch,
            barcode_match: barcodeMatch
          };
        })
      },
      ai_analysis: {
        ...(keywordAnalysis || {}),
        keyword_match_details: matchDetails as any
      },
      barcode_analysis: buildBarcodeAnalysis({
        enabled: enableBarcodeDetection,
        barcodeConfigs,
        matchResults: structuredBarcodeResults as any,
        allDetectedData: barcodeTexts.map(data => ({ data })),
      }),
      error: result.success ? undefined : (result.reason || '未知错误')
    };

    if (!enableKeywordAnalysis) {
      delete (ocrResultData as any).ai_analysis;
    }

    setOcrResult(ocrResultData as TestResult);

    if (result.stitched_image) {
      setImagePreview(result.stitched_image);
    }

    console.log('🔄 切换UI状态: processing -> waiting_for_approval');
    setWorkflowState('waiting_for_approval');

    // 融合模式：等 LLM 分析完再设最终结果
    let finalIsQualified = isQualified;
    let aiResult: any = undefined;
    if (fusionModeEnabled) {
      // 先显示"等待LLM"状态
      setFinalResult('none');
      setMatchStatus('none');
      console.log('🔄 融合模式：OCR完成，等待LLM分析...');

      // 用拼接图或捕获帧给 LLM 分析
      const imageForLLM = result.stitched_image || captureFrameData()?.base64 || '';
      if (imageForLLM) {
        try {
          aiResult = await performFusionAIAnalysis(imageForLLM);
          if (aiResult) {
            console.log('✅ 融合模式LLM分析完成:', aiResult.overallQuality);
            setAiAnalysisResult(aiResult);
            const llmQualified = aiResult.overallQuality === '合格';
            finalIsQualified = isQualified && llmQualified;
          } else {
            console.warn('⚠️ LLM分析返回null，仅使用OCR结果');
          }
        } catch (error) {
          console.error('❌ 融合模式LLM分析失败:', error);
        }
      }
    }

    setFinalResult(finalIsQualified ? 'qualified' : 'unqualified');
    setMatchStatus(finalIsQualified ? 'qualified' : 'unqualified');

    // 添加到历史记录
    try {
      const historyItem: DetectionHistoryItem = {
        id: Date.now().toString(),
        timestamp: new Date(),
        matchStatus: finalIsQualified ? 'qualified' : 'unqualified',
        overallQuality: finalIsQualified ? '合格' : '存疑',
        score: inspectionScore,
        ocrResult: ocrResultData,
        aiResult,
        barcodeAnalysis: ocrResultData.barcode_analysis
      };
      addDetectionHistory(historyItem);
      console.log('✅ 批处理结果已保存到历史记录');
    } catch (error) {
      console.error('❌ 保存历史记录失败:', error);
    }

    // 检查是否需要确认
    const shouldWaitForConfirmation = !isQualified || requireQualifiedConfirmation;
    if (shouldWaitForConfirmation) {
      console.log('⏳等待用户确认结果...');
      setIsWaitingForSpace(true);
    } else {
      setTimeout(() => {
        setIsWaitingForSpace(false);
        setDetectedElements([]);
        setElementDetectionStartTime(null);
        setWorkflowState('idle');
        setMatchStatus('none');
        setWorkflowResult(null);
        setAiAnalysisResult(null);
        setFinalResult('none');
        if (batchManager) batchManager.reset();
      }, 2000);
    }
  }, [
    setOcrResult, setImagePreview, setWorkflowState, setFinalResult, setMatchStatus,
    enableKeywordAnalysis, enableBarcodeDetection, keywordConfigs, keywordMatchMode, requireQualifiedConfirmation,
    setIsWaitingForSpace, setWorkflowResult, setAiAnalysisResult,
    setDetectedElements, setElementDetectionStartTime, barcodeConfigs,
    addDetectionHistory, captureFrameData, batchManager,
  ]);

  // 自动保存批处理结果到后端数据库
  const useAutoSaveBatchResult = (
    ocrResult: TestResult | null,
    imagePreview: string,
    matchStatus: string,
  ) => {
    useEffect(() => {
      if (ocrResult && (ocrResult as any).batch_processing && imagePreview) {
        const resultId = `${batchRunIdRef.current}_${ocrResult.full_text}_${ocrResult.text_count}`;
        if (batchResultSavedRef.current === resultId) return;

        const now = Date.now();
        if (batchSaveRetryRef.current.count >= 3 && now - batchSaveRetryRef.current.lastAttempt < 30000) return;

        const saveBatchResult = async () => {
          try {
            const imageBase64 = imagePreview
              ? (imagePreview.startsWith('data:')
                ? imagePreview.split(',')[1]
                : imagePreview)
              : '';

            console.log('💾 批处理结果检测到，开始自动保存到后端数据库...');
            await saveDetectionResult(ocrResult, null, matchStatus, imageBase64);
            batchResultSavedRef.current = resultId;
            batchSaveRetryRef.current = { count: 0, lastAttempt: 0 };
            console.log('✅ 批处理结果已自动保存到后端数据库');
          } catch (error) {
            console.error('❌ 批处理结果自动保存失败:', error);
            batchSaveRetryRef.current = { count: batchSaveRetryRef.current.count + 1, lastAttempt: Date.now() };
          }
        };

        saveBatchResult();
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ocrResult, imagePreview, matchStatus]);
  };

  // 重置批处理保存状态
  const resetBatchSaveState = useCallback(() => {
    batchResultSavedRef.current = null;
  }, []);

  return {
    onBatchComplete,
    useAutoSaveBatchResult,
    resetBatchSaveState,
    batchRunIdRef,
    batchResultSavedRef,
  };
};
