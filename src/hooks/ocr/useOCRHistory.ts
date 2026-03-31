/**
 * OCR History Management Hook
 *
 * 用途：管理 OCR 检测历史记录的加载和刷新
 * 功能：从后端加载历史记录、数据转换、字段映射
 * 使用位置：OCRDetectionScreen
 */

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/config';
import type { ExtendedHistoryItem } from '@/types/ocr';

interface UseOCRHistoryOptions {
  /** 设置历史记录的回调函数 */
  setDetectionHistory: (history: ExtendedHistoryItem[]) => void;
}

interface UseOCRHistoryResult {
  /** 刷新历史记录 */
  refreshHistory: () => Promise<void>;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息 */
  error: string | null;
}

/**
 * OCR 历史记录管理 Hook
 *
 * 职责：
 * - 从后端 `/api/results/` 加载 OCR 检测结果
 * - 转换后端字段名到前端接口（standardId, overallQuality 等）
 * - 过滤出 OCR 相关的检测记录
 * - 转换为前端 ExtendedHistoryItem 格式
 */
export const useOCRHistory = ({
  setDetectionHistory,
}: UseOCRHistoryOptions): UseOCRHistoryResult => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiFetch('/results/?limit=50', {
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(
            `加载OCR历史记录失败: 非JSON响应: ${text.slice(0, 200)}...`
          );
        }

        const data = await response.json();

        // 转换字段名以匹配前端接口（与appStore.ts保持一致）
        const transformedData = data.map((item: any) => ({
          ...item,
          standardId: item.standard_id,
          overallQuality: item.overall_quality,
          reasonKeywords: item.reason_keywords,
          detectionType: item.detection_type,
        }));

        // 过滤出OCR检测结果
        const ocrResults = transformedData.filter(
          (result: any) =>
            result.detectionType === 'ocr_inspection' ||
            result.detectionType === 'ocr_fusion_inspection'
        );

        // 转换为历史记录格式
        const historyRecords: ExtendedHistoryItem[] = ocrResults
          .slice(0, 10)
          .map((result: any) => ({
            id: result.id,
            timestamp: new Date(result.timestamp),
            overallQuality: result.overallQuality || '未知',
            score: result.score || 0,
            ocrResult: result.ocrResult || (result.ocr_result ? {
              success: result.ocr_result.success ?? true,
              full_text: result.ocr_result.full_text || result.reason || '',
              detailed_results: result.ocr_result.detailed_results || [],
              text_count: result.ocr_result.text_count || 0,
              matchStatus: result.ocr_result.matchStatus || (
                result.overallQuality === '合格'
                  ? 'qualified'
                  : result.overallQuality === '存疑'
                    ? 'unqualified'
                    : 'none'
              ),
              model_used: result.ocr_result.model_used || 'backend',
              error: result.ocr_result.error || null,
              validationWarnings: result.ocr_result.validationWarnings || [],
              barcode_analysis: result.ocr_result.barcode_analysis,
            } : {
              success: true,
              full_text: result.reason || '',
              detailed_results: [],
              text_count: 0,
              matchStatus:
                result.overallQuality === '合格'
                  ? 'qualified'
                  : result.overallQuality === '存疑'
                    ? 'unqualified'
                    : 'none',
              model_used: 'backend',
              error: null,
              validationWarnings: [],
            }),
            aiResult: result.llmResult
              ? {
                overallQuality: result.llmResult.overallQuality,
                score: result.llmResult.score,
                reason: result.llmResult.reason,
                reasonKeywords: result.llmResult.reasonKeywords,
                defects: result.llmResult.defects || [],
              }
              : null,
            matchStatus:
              result.ocrResult?.matchStatus ||
              result.ocr_result?.matchStatus ||
              (result.overallQuality === '合格'
                ? 'qualified'
                : result.overallQuality === '存疑'
                  ? 'unqualified'
                  : 'none'),
            imageBase64: result.image,
            barcodeAnalysis: result.ocrResult?.barcode_analysis || result.ocr_result?.barcode_analysis,
          }));

        setDetectionHistory(historyRecords);
        console.log('📚 已加载OCR历史记录:', historyRecords.length, '条');
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('❌ 加载OCR历史记录失败:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [setDetectionHistory]);

  // 组件挂载时自动加载
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return {
    refreshHistory: loadHistory,
    isLoading,
    error,
  };
};
