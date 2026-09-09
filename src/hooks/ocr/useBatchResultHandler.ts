/**
 * Batch Result Handler Hook
 *
 * 用途：处理批处理完成后的结果回调
 * 功能：解析条码数据、构造结构化OCR结果、前端合格状态计算、自动保存到后端
 * 提取自：OCRDetectionScreen.tsx (原第 435-745 行的 onBatchComplete + 第 986-1029 行的自动保存 useEffect)
 */

import { useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
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

  // 保存函数（返回 {saved, savedData} 供最终结论闭环使用）
  saveDetectionResult: (ocrResult: any, aiResult: any, matchStatus: string, imageBase64: string) => Promise<any>;

  // 捕获帧数据
  captureFrameData: () => { dataUrl: string; base64: string } | null;

  // 进入下一件前的清理（A06：清除视觉工装绑定与追踪预览）
  onNextPiece?: () => void;

  // 融合AI本地状态复位（A03：复位后丢弃迟到的AI结果）
  resetFusionState?: () => void;
}

const normalizeBarcodeFormat = (value: any) => {
  const normalized = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ({ I25: 'ITF', INTERLEAVED2OF5: 'ITF' } as Record<string, string>)[normalized] || normalized;
};

// 分开验证二维码/一维条码；只有一维条码允许 OCR 数字兜底。
const evaluateConfigByRoi = (roi: any, config: any) => {
  const expectedText = (config.expectedText || '').trim();
  const matchMode = config.matchMode || 'contains';
  const codeType = config.codeType || 'qr';
  const expectedFormat = normalizeBarcodeFormat(config.barcodeFormat || 'auto');
  const barcodes = roi.barcodes || [];
  const ocrText = roi.ocr_text || '';

  const matchingBarcode = barcodes.find((b: any) => {
    const actualType = typeof b === 'string' ? 'barcode' : (b.type || 'barcode');
    if (codeType === 'qr' && actualType !== 'qr') return false;
    if (codeType === 'linear' && actualType === 'qr') return false;
    if (codeType === 'linear' && expectedFormat !== 'AUTO') {
      if (normalizeBarcodeFormat(b.format) !== expectedFormat) return false;
    }
    const text = typeof b === 'string' ? b : (b.data || '');
    if (!expectedText) return Boolean(text);
    return matchMode === 'exact' ? text === expectedText : text.includes(expectedText);
  });

  if (matchingBarcode) {
    return {
      matched: true,
      detectedText: typeof matchingBarcode === 'string' ? matchingBarcode : matchingBarcode.data,
      source: 'decoder' as const,
      format: typeof matchingBarcode === 'string' ? '' : matchingBarcode.format,
    };
  }

  if (codeType === 'linear' && (config.allowOcrFallback ?? true)) {
    if (expectedText) {
      const expectedDigits = expectedText.replace(/\D/g, '');
      const ocrDigits = String(ocrText).replace(/\D/g, '');
      const ocrMatched = Boolean(expectedDigits) && (
        matchMode === 'exact'
          ? ocrDigits === expectedDigits
          : ocrDigits.includes(expectedDigits)
      );
      if (ocrMatched) {
        return {
          matched: true,
          detectedText: expectedDigits,
          source: 'ocr_fallback' as const,
          format: config.barcodeFormat || 'auto',
        };
      }
    } else {
      // 开放检测模式（未配置期望值）：条码解码器读不出时，若 OCR 识别到
      // 足够长的数字串（宽松门槛：连续4位以上），视为条码/追溯码内容存在，
      // 避免纯拍摄质量问题（角度/对焦）把本该合格的产品判成存疑。
      const digitRuns = String(ocrText).match(/\d{4,}/g) || [];
      if (digitRuns.length > 0) {
        const longestRun = digitRuns.reduce((a, b) => (b.length > a.length ? b : a));
        return {
          matched: true,
          detectedText: longestRun,
          source: 'ocr_fallback' as const,
          format: config.barcodeFormat || 'auto',
        };
      }
    }
  }

  return { matched: false, detectedText: '', source: 'none' as const, format: '' };
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
    onNextPiece, resetFusionState,
  } = options;

  // A03：每轮检测运行具有唯一身份；activeRunIdRef 只指向当前有效轮次，
  // 复位/换图/换模板时置空，使所有在途 await 结果被判定为过期而丢弃。
  const batchRunIdRef = useRef(0);
  const activeRunIdRef = useRef<number | null>(null);
  // A04：按“运行身份”记录已保存轮次（运行ID幂等），不再用识别文本内容去重
  const batchResultSavedRef = useRef<string | null>(null);
  const autoNextTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoNextTimer = useCallback(() => {
    if (autoNextTimerRef.current !== null) {
      clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
  }, []);

  // 批处理完成回调
  const onBatchComplete = useCallback(async (result: BatchProcessingResult, runId?: number) => {
    console.log('✅ 批处理完成，更新UI:', result);
    // A03：以本轮唯一 runId 作为有效运行检查；await 之后、UI 写入/保存前校验
    const currentRunId = Number.isFinite(runId as number) ? (runId as number) : ++batchRunIdRef.current;
    batchRunIdRef.current = currentRunId;
    activeRunIdRef.current = currentRunId;

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
            const evaluatedRois = relevantRois.map((roi: any) => ({
              roi,
              evaluation: evaluateConfigByRoi(roi, config),
            }));
            const matchedRois = evaluatedRois.filter(item => item.evaluation.matched);
            const firstMatchedRoi = matchedRois[0];

            return {
              config,
              targetRoi: targetRoi || 'all',
              relevantRois,
              matchedRois: matchedRois.map(item => item.roi),
              matched: matchedRois.length > 0,
              detectedText: firstMatchedRoi?.evaluation.detectedText || '',
              source: firstMatchedRoi?.evaluation.source || 'none',
              format: firstMatchedRoi?.evaluation.format || '',
            };
          })
      : [];

    const structuredBarcodeResults = barcodeConfigEvaluations.map(({ config, targetRoi, matched, detectedText, matchedRois, source, format }) => ({
      detectedText,
      expectedText: config.expectedText || ((targetRoi && targetRoi !== 'all') ? `(任意条码) [${targetRoi}]` : '(任意条码)'),
      matchMode: config.matchMode || 'contains' as const,
      matched,
      confidence: matched ? 1 : 0,
      qrCodeData: detectedText,
      type: (config.codeType === 'linear' ? 'barcode' : 'qr') as 'barcode' | 'qr',
      format,
      source,
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
      && (result.details || []).every(detail => {
        const hasScopedKeywordRule = enableKeywordAnalysis && keywordConfigs.some(config => {
          const target = config.targetRoi;
          return !target || target === 'all' || target === detail.label;
        });
        const hasScopedBarcodeRule = enableBarcodeDetection && barcodeConfigEvaluations.some(item =>
          item.targetRoi === 'all' || item.targetRoi === detail.label
        );
        const hasMatchedBarcodeEvidence = barcodeConfigEvaluations.some(item =>
          item.matched && item.matchedRois.some((roi: any) => roi.label === detail.label)
        );
        const hasOcrEvidence = Boolean((detail.ocr_text || '').trim());
        // 纯视觉目标（没有关键词规则也没有条码规则指向它）不应被要求提供OCR/条码
        // 证据——YOLO已确认其存在即可，避免拖累无关目标的合格判定。
        const requiresEvidence = hasScopedKeywordRule || hasScopedBarcodeRule;
        return detail.success
          && detail.qualified
          && (!requiresEvidence || hasOcrEvidence || hasMatchedBarcodeEvidence);
      });
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
            .map(({ config, matched, detectedText, targetRoi, matchedRois, source, format }) => ({
              expectedText: config.expectedText || '',
              matchMode: config.matchMode || 'contains',
              detectedBarcodes: matched
                ? [detectedText].filter(Boolean)
                : roiBarcodes.map((b: any) => typeof b === 'string' ? b : b.data || ''),
              matched,
              codeType: config.codeType || 'qr',
              barcodeFormat: config.barcodeFormat || 'auto',
              source,
              format,
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
      } catch (error) {
        console.error('❌ 融合模式LLM分析失败:', error);
        aiResult = null;
      }

      // A03：轮次已被复位/取代时，迟到的AI结果不得写回新轮UI，也不得保存
      if (activeRunIdRef.current !== currentRunId) {
        resetFusionState?.();
        setAiAnalysisResult(null);
        console.warn('⏹️ 检测轮次已复位，丢弃迟到的AI分析结果');
        return;
      }

      if (aiResult) {
        console.log('✅ 融合模式LLM分析完成:', aiResult.overallQuality);
        setAiAnalysisResult(aiResult);
        const llmQualified = aiResult.overallQuality === '合格';
        finalIsQualified = isQualified && llmQualified;
      } else {
        console.warn('⚠️ LLM分析未返回结果，按需复检处理');
        finalIsQualified = false;
      }
    }

    setFinalResult(finalIsQualified ? 'qualified' : 'unqualified');
    setMatchStatus(finalIsQualified ? 'qualified' : 'unqualified');

    // OCR 和 LLM 结论确定后只保存一次，避免先写入纯 OCR 再被融合结果覆盖。
    // A04：以本轮 runId 幂等保存；A05：保存失败不得自动放行；A11：以后端最终结论为准。
    let saveOutcome: any = null;
    let saveFailed = false;
    try {
      const dedupKey = `run:${currentRunId}`;
      if (batchResultSavedRef.current !== dedupKey) {
        const imageBase64 = imageForLLM.includes(',') ? imageForLLM.split(',', 2)[1] : imageForLLM;
        saveOutcome = await saveDetectionResult(
          ocrResultData,
          aiResult || null,
          finalIsQualified ? 'qualified' : 'unqualified',
          imageBase64,
        );
        batchResultSavedRef.current = dedupKey;
        console.log('✅ 批处理融合结果已保存');
      }
    } catch (error) {
      console.error('❌ 保存批处理融合结果失败:', error);
      saveFailed = true;
    }

    // A03：等待保存期间轮次被复位 → 已提交记录归属旧轮次，不得驱动UI/继续逻辑
    if (activeRunIdRef.current !== currentRunId) {
      console.warn('⏹️ 检测轮次已复位，丢弃保存回调');
      return;
    }

    const savedData = saveOutcome?.savedData ?? null;
    const savedOk = !saveFailed && (!saveOutcome || saveOutcome.saved !== false);

    // A11：后端追踪/终检结论为权威结论；保存失败或后端复核非合格时不得当作最终合格
    const backendTraceConclusion = String(savedData?.trace_conclusion || '');
    const backendOverallQuality = String(
      savedData?.fqc_overall_result || savedData?.overall_quality || ''
    );
    const backendRejected = (!!backendOverallQuality && backendOverallQuality !== '合格')
      || (!backendOverallQuality && !!backendTraceConclusion && backendTraceConclusion !== '合格');
    if (backendRejected) {
      setFinalResult('unqualified');
      setMatchStatus('unqualified');
      toast.error(`后端复核结论：${backendOverallQuality || backendTraceConclusion}，请人工确认`, { duration: 6000 });
    }

    // A05：保存失败时不自动进入下一轮，保留证据等待人工处理
    if (!savedOk) {
      toast.error('保存失败：检测结果未入库，请检查网络后重试', { duration: 6000 });
      setIsWaitingForSpace(true);
      return;
    }

    // 检查是否需要确认
    const canAutoContinue = finalIsQualified && !backendRejected;
    const shouldWaitForConfirmation = !canAutoContinue || requireQualifiedConfirmation;
    if (shouldWaitForConfirmation) {
      console.log('⏳等待用户确认结果...');
      setIsWaitingForSpace(true);
    } else {
      // 注册延时器并在回调中校验运行身份：复位后旧计时器不得把新流程设回 idle
      clearAutoNextTimer();
      autoNextTimerRef.current = setTimeout(() => {
        autoNextTimerRef.current = null;
        if (activeRunIdRef.current !== currentRunId) return;
        setIsWaitingForSpace(false);
        setDetectedElements([]);
        setElementDetectionStartTime(null);
        setWorkflowState('idle');
        setMatchStatus('none');
        setWorkflowResult(null);
        setAiAnalysisResult(null);
        setFinalResult('none');
        if (batchManager) batchManager.reset();
        // A06：进入下一件前清除视觉工装绑定与追踪预览
        onNextPiece?.();
      }, 2000);
    }
  }, [
    setOcrResult, setImagePreview, setWorkflowState, setFinalResult, setMatchStatus,
    enableKeywordAnalysis, enableBarcodeDetection, keywordConfigs, keywordMatchMode, requireQualifiedConfirmation,
    selectedTargets,
    setIsWaitingForSpace, setWorkflowResult, setAiAnalysisResult,
    setDetectedElements, setElementDetectionStartTime, barcodeConfigs,
    captureFrameData, batchManager, fusionModeEnabled, performFusionAIAnalysis, saveDetectionResult,
    onNextPiece, resetFusionState, clearAutoNextTimer,
  ]);

  // 重置批处理保存状态（A03：同时作废在途轮次与未登记的自动继续计时器）
  const resetBatchSaveState = useCallback(() => {
    activeRunIdRef.current = null;
    batchResultSavedRef.current = null;
    clearAutoNextTimer();
  }, [clearAutoNextTimer]);

  return {
    onBatchComplete,
    resetBatchSaveState,
    batchRunIdRef,
    batchResultSavedRef,
  };
};
