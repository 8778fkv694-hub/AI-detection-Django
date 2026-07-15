/**
 * useDetectionSave Hook
 *
 * 用途：管理检测结果的保存逻辑
 * 功能：
 * - 保存融合模式检测结果
 * - 保存单独OCR检测结果
 * - 更新本地历史记录
 * 使用位置：OCRDetectionScreen
 */

import { useCallback } from 'react';
import toast from 'react-hot-toast';
import type { InspectionResult } from '@/types';

export interface DetectionSaveOptions {
  fusionModeEnabled: boolean;
  selectedStandardId: string | null;
  addAppResult: (result: any) => Promise<any>;
  clearOldDetectionHistory: () => void;
  addDetectionHistory: (record: any) => void;
  refreshHistory?: () => Promise<void> | void;
  onSaveComplete?: (savedData: any) => void;
  traceContext?: {
    processStageCode?: string;
    processStageName?: string;
    pageInstanceId?: string;
    cameraId?: string;
    fixtureEnabled?: boolean;
    fixtureQr?: string;
    fixtureQrDetected?: boolean;
    fixtureQrSource?: 'vision' | 'scanner' | 'nfc' | 'manual';
    fixtureQrInputStatus?: 'success' | 'failed' | 'pending';
    fixtureQrConfidence?: number;
    businessCode?: string;
    businessCodeType?: string;
    fixtureQrPrefixes?: string[];
    fixtureQrPattern?: string;
  };
}

export interface UseDetectionSaveReturn {
  saveDetectionResult: (
    ocrResult: any,
    aiResult: InspectionResult | null,
    matchStatus: string,
    imageBase64?: string
  ) => Promise<void>;
}

export const useDetectionSave = (options: DetectionSaveOptions): UseDetectionSaveReturn => {
  const {
    fusionModeEnabled,
    selectedStandardId,
    addAppResult,
    clearOldDetectionHistory,
    addDetectionHistory,
    refreshHistory,
    onSaveComplete,
    traceContext,
  } = options;

  // 保存检测结果到本地历史记录
  const saveDetectionResult = useCallback(async (
    ocrResult: any,
    aiResult: InspectionResult | null,
    matchStatus: string,
    imageBase64?: string
  ) => {
    const newResult = {
      id: Date.now().toString(),
      timestamp: new Date(),
      ocrResult,
      aiResult,
      matchStatus,
      imageBase64
    };

    // 保存到检测结果页面
    try {
      if (fusionModeEnabled) {
        const fusionAiResult = aiResult || {
          id: `${newResult.id}-ai-recheck`,
          timestamp: new Date().toISOString(),
          image: '',
          standardId: selectedStandardId,
          overallQuality: '需复检' as const,
          score: 0,
          reason: 'AI融合分析未返回有效结果。',
          reasonKeywords: '融合分析失败,需复检',
          defects: [],
        };
        // 融合模式：计算综合结果
        const ocrQualified = matchStatus === 'qualified';
        const llmQualified = fusionAiResult.overallQuality === '合格';
        const finalQuality = (ocrQualified && llmQualified) ? '合格' : '需复检';
        const rawAiScore = Number.isFinite(Number(fusionAiResult.score)) ? Number(fusionAiResult.score) : 0;
        const finalScore = Math.max(0, Math.min(100, Math.round(
          (ocrQualified && llmQualified) ? rawAiScore : Math.min(rawAiScore, 50),
        )));

        console.log('🔧 保存检测结果时的selectedStandardId:', selectedStandardId);

        const inspectionResult = {
          id: newResult.id,
          timestamp: new Date().toISOString(),
          image: imageBase64
            ? (imageBase64.startsWith('data:') ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`)
            : 'data:image/jpeg;base64,',
          standardId: selectedStandardId || null,
          overallQuality: finalQuality as '合格' | '存疑' | '需复检',
          score: finalScore,
          reason: `OCR检测: ${matchStatus === 'qualified' ? '合格' : '需复检'}\nLLM分析: ${fusionAiResult.overallQuality}\n${fusionAiResult.reason}`,
          reasonKeywords: `OCR:${matchStatus === 'qualified' ? '合格' : '需复检'},LLM:${fusionAiResult.overallQuality}`,
          defects: fusionAiResult.defects || [],
          detectionType: 'ocr_fusion_inspection' as const,
          // 保存OCR详细结果
          ocrResult: {
            success: ocrResult?.success || false,
            full_text: ocrResult?.full_text || '',
            detailed_results: ocrResult?.detailed_results || [],
            text_count: ocrResult?.text_count || 0,
            matchStatus: matchStatus as 'qualified' | 'unqualified' | 'none',
            model_used: ocrResult?.model_used,
            error: ocrResult?.error,
            validationWarnings: ocrResult?.validationWarnings || [],
            barcode_analysis: ocrResult?.barcode_analysis
          },
          barcodeResult: ocrResult?.barcode_analysis || null,
          // 保存LLM详细结果
          llmResult: {
            overallQuality: fusionAiResult.overallQuality,
            score: fusionAiResult.score,
            reason: fusionAiResult.reason,
            reasonKeywords: fusionAiResult.reasonKeywords,
            defects: fusionAiResult.defects || []
          },
          llm_full_text: fusionAiResult.reason,
          llm_full_detail: {
            sections: [
              { title: '总体结论', text: fusionAiResult.overallQuality },
              { title: '评分', text: String(fusionAiResult.score) },
              { title: '原因', text: fusionAiResult.reason },
            ],
            reasonKeywords: fusionAiResult.reasonKeywords || '',
            defects: fusionAiResult.defects || []
          },
          processStageCode: traceContext?.processStageCode || '',
          processStageName: traceContext?.processStageName || '',
          pageInstanceId: traceContext?.pageInstanceId || '',
          cameraId: traceContext?.cameraId || '',
          fixtureQr: traceContext?.fixtureQr || '',
          fixtureQrDetected: !!traceContext?.fixtureQrDetected,
          fixtureQrSource: traceContext?.fixtureQrSource,
          fixtureQrInputStatus: traceContext?.fixtureQrInputStatus || (traceContext?.fixtureQrDetected ? 'success' : 'pending'),
          fixtureQrConfidence: traceContext?.fixtureQrConfidence,
          businessCode: traceContext?.businessCode || '',
          businessCodeType: traceContext?.businessCodeType || '',
          traceContext: traceContext || {},
        };

        // 保存到后端
        const savedData = await addAppResult(inspectionResult);
        console.log('✅ 融合模式检测结果已保存到后端');
        if (savedData) onSaveComplete?.(savedData);

        // 同时更新本地历史记录（不携带大图，最终以后台结果为准）
        const newHistoryRecord = {
          id: newResult.id,
          timestamp: new Date(),
          matchStatus: matchStatus,
          overallQuality: finalQuality,
          score: finalScore,
          ocrResult: ocrResult,
          aiResult: fusionAiResult,
          barcodeAnalysis: ocrResult?.barcode_analysis,
        };
        clearOldDetectionHistory();
        addDetectionHistory(newHistoryRecord);
        await refreshHistory?.();

      } else if (ocrResult && ocrResult.success) {
        // 单独OCR模式
        console.log('🔧 单独OCR模式保存检测结果，标准字段设置为空');

        const inspectionResult = {
          id: newResult.id,
          timestamp: new Date().toISOString(),
          image: imageBase64 ? `data:image/jpeg;base64,${imageBase64}` : 'data:image/jpeg;base64,',
          standardId: null,
          overallQuality: (matchStatus === 'qualified' ? '合格' : matchStatus === 'unqualified' ? '存疑' : '需复检') as '合格' | '存疑' | '需复检',
          score: matchStatus === 'qualified' ? 95 : matchStatus === 'unqualified' ? 30 : 60,
          reason: `OCR检测: ${matchStatus === 'qualified' ? '合格' : '存疑'}`,
          reasonKeywords: 'OCR检测',
          defects: [],
          detectionType: 'ocr_inspection' as const,
          ocrResult: {
            success: ocrResult.success,
            full_text: ocrResult.full_text || '',
            detailed_results: ocrResult.detailed_results || [],
            text_count: ocrResult.text_count || 0,
            matchStatus: matchStatus as 'qualified' | 'unqualified' | 'none',
            model_used: ocrResult.model_used,
            error: ocrResult.error,
            validationWarnings: ocrResult.validationWarnings || [],
            barcode_analysis: ocrResult?.barcode_analysis
          },
          barcodeResult: ocrResult?.barcode_analysis || null,
          llm_full_text: aiResult?.reason,
          llm_full_detail: aiResult ? {
            sections: [
              { title: '总体结论', text: aiResult.overallQuality },
              { title: '评分', text: String(aiResult.score) },
              { title: '原因', text: aiResult.reason },
            ],
            reasonKeywords: aiResult.reasonKeywords || '',
            defects: aiResult.defects || []
          } : undefined,
          processStageCode: traceContext?.processStageCode || '',
          processStageName: traceContext?.processStageName || '',
          pageInstanceId: traceContext?.pageInstanceId || '',
          cameraId: traceContext?.cameraId || '',
          fixtureQr: traceContext?.fixtureQr || '',
          fixtureQrDetected: !!traceContext?.fixtureQrDetected,
          fixtureQrSource: traceContext?.fixtureQrSource,
          fixtureQrInputStatus: traceContext?.fixtureQrInputStatus || (traceContext?.fixtureQrDetected ? 'success' : 'pending'),
          fixtureQrConfidence: traceContext?.fixtureQrConfidence,
          businessCode: traceContext?.businessCode || '',
          businessCodeType: traceContext?.businessCodeType || '',
          traceContext: traceContext || {},
        };

        // 保存到后端
        const savedData = await addAppResult(inspectionResult);
        console.log('✅ OCR检测结果已保存到后端');
        if (savedData) onSaveComplete?.(savedData);

        // 同时更新本地历史记录（不携带大图，最终以后台结果为准）
        const newHistoryRecord = {
          id: newResult.id,
          timestamp: new Date(),
          matchStatus: matchStatus,
          overallQuality: matchStatus === 'qualified' ? '合格' : matchStatus === 'unqualified' ? '存疑' : '需复检',
          score: matchStatus === 'qualified' ? 95 : matchStatus === 'unqualified' ? 30 : 60,
          ocrResult: ocrResult,
          barcodeAnalysis: ocrResult?.barcode_analysis,
        };
        clearOldDetectionHistory();
        addDetectionHistory(newHistoryRecord);
        await refreshHistory?.();
      }
    } catch (error) {
      console.error('❌ 保存检测结果失败:', error);
      toast.error('保存检测结果失败，请检查网络后重试');
      throw error;
    }
  }, [fusionModeEnabled, selectedStandardId, addAppResult, clearOldDetectionHistory, addDetectionHistory, refreshHistory, onSaveComplete, traceContext]);

  return { saveDetectionResult };
};
