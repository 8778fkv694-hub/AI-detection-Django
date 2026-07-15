/**
 * Batch Result Handler Hook
 *
 * 用途：处理批处理完成后的结果回调
 * 功能：解析条码数据、构造结构化OCR结果、前端合格状态计算、自动保存到后端
 * 提取自：OCRDetectionScreen.tsx (原第 435-745 行的 onBatchComplete + 第 986-1029 行的自动保存 useEffect)
 */

import { useCallback, useRef } from 'react';
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
  selectedTargets: string[];

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

  // 期望内容留空表示“任意条码”，仍必须真实检出至少一个条码。
  if (!expectedText) return barcodes.length > 0;

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
    return '';
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
    selectedTargets,
    fusionModeEnabled, performFusionAIAnalysis,
    batchManager,
    setOcrResult, setImagePreview, setWorkflowState, setFinalResult,
    setMatchStatus, setIsWaitingForSpace, setWorkflowResult, setAiAnalysisResult,
    setDetectedElements, setElementDetectionStartTime,
    saveDetectionResult, captureFrameData,
  } = options;

  const batchRunIdRef = useRef(0);
  const batchResultSavedRef = useRef<string | null>(null);

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
          details: (result.details || []).flatMap((detail: any) => {
            const items = Array.isArray(detail.ocr_detailed_results) ? detail.ocr_detailed_results : [];
            if (items.length > 0) {
              return items.map((item: any) => ({
                text: item.text || '',
                confidence: item.confidence ?? detail.ocr_confidence ?? 0,
                label: detail.label || '',
                orientation_bucket: item.orientation_bucket ?? detail.detected_orientation,
                orientation_degrees: item.orientation_degrees ?? detail.detected_orientation_degrees,
              }));
            }
            return [{
              text: detail.ocr_text || '',
              confidence: detail.ocr_confidence ?? 0,
              label: detail.label || '',
              orientation_bucket: detail.detected_orientation,
              orientation_degrees: detail.detected_orientation_degrees,
            }];
          }),
          fullText,
          keywordConfigs,
          keywordMatchMode,
        })
      : null;
    const matchDetails = keywordAnalysis?.keyword_match_details || [];

    // 前端重新计算合格状态
    const isKeywordsQualified = !enableKeywordAnalysis || matchDetails.every(m => m.overallMatched);

    const isBarcodesQualified = !enableBarcodeDetection || barcodeConfigEvaluations.every(item => item.matched);

    const returnedLabels = new Set((result.details || []).map(detail => detail.label));
    const allTargetsReturned = selectedTargets.length > 0
      && selectedTargets.every(target => returnedLabels.has(target));
    const allRoisSucceeded = (result.details || []).length > 0
      && (result.details || []).every(detail => detail.success && detail.qualified);
    const isQualified = result.success
      && result.overall_quality === '合格'
      && allTargetsReturned
      && allRoisSucceeded
      && isKeywordsQualified
      && isBarcodesQualified;
    // 构造包含ROI详细信息的OCR结果对象
    const ocrResultData = {
      success: result.success,
      full_text: fullText,
      detailed_results: result.details.map((d: any) => ({
        text: d.ocr_text,
        confidence: d.ocr_confidence || 0,
        bbox: d.bbox || [],
        label: d.label || '',
        roi_id: d.roi_id || '',
        orientation_bucket: d.detected_orientation,
        orientation_degrees: d.detected_orientation_degrees,
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
            detected_orientation: d.detected_orientation,
            detected_orientation_degrees: d.detected_orientation_degrees,
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
    const imageForLLM = result.stitched_image || captureFrameData()?.base64 || '';
    if (fusionModeEnabled) {
      // 先显示"等待LLM"状态
      setFinalResult('none');
      setMatchStatus('none');
      console.log('🔄 融合模式：OCR完成，等待LLM分析...');

      // 用拼接图或捕获帧给 LLM 分析
      try {
        aiResult = await performFusionAIAnalysis(imageForLLM);
        if (aiResult) {
          console.log('✅ 融合模式LLM分析完成:', aiResult.overallQuality);
          setAiAnalysisResult(aiResult);
          const llmQualified = aiResult.overallQuality === '合格';
          finalIsQualified = isQualified && llmQualified;
        } else {
          console.warn('⚠️ LLM分析未返回结果，按需复检处理');
          finalIsQualified = false;
        }
      } catch (error) {
        console.error('❌ 融合模式LLM分析失败:', error);
        finalIsQualified = false;
      }
    }

    setFinalResult(finalIsQualified ? 'qualified' : 'unqualified');
    setMatchStatus(finalIsQualified ? 'qualified' : 'unqualified');

    // OCR 和 LLM 结论确定后只保存一次，避免先写入纯 OCR 再被融合结果覆盖。
    try {
      const resultId = `${result.ocr_text || ''}_${(result.details || []).map(item => item.label).join('|')}`;
      if (batchResultSavedRef.current !== resultId) {
        const imageBase64 = imageForLLM.includes(',') ? imageForLLM.split(',', 2)[1] : imageForLLM;
        await saveDetectionResult(
          ocrResultData,
          aiResult || null,
          finalIsQualified ? 'qualified' : 'unqualified',
          imageBase64,
        );
        batchResultSavedRef.current = resultId;
        console.log('✅ 批处理融合结果已保存');
      }
    } catch (error) {
      console.error('❌ 保存批处理融合结果失败:', error);
    }

    // 检查是否需要确认
    const shouldWaitForConfirmation = !finalIsQualified || requireQualifiedConfirmation;
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
    selectedTargets,
    setIsWaitingForSpace, setWorkflowResult, setAiAnalysisResult,
    setDetectedElements, setElementDetectionStartTime, barcodeConfigs,
    captureFrameData, batchManager, fusionModeEnabled, performFusionAIAnalysis, saveDetectionResult,
  ]);

  // 重置批处理保存状态
  const resetBatchSaveState = useCallback(() => {
    batchResultSavedRef.current = null;
  }, []);

  return {
    onBatchComplete,
    resetBatchSaveState,
    batchRunIdRef,
    batchResultSavedRef,
  };
};
