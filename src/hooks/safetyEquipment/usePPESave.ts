import { useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { InspectionResult } from '@/types';

export interface PPEInspectionDraft {
  image: string;
  overallQuality: '合格' | '存疑' | '需复检';
  score: number;
  reason: string;
  reasonKeywords?: string;
  defects?: InspectionResult['defects'];
}

export interface UsePPESaveOptions {
  addAppResult: (result: InspectionResult) => Promise<unknown>;
  setResults: (results: InspectionResult[]) => void;
  getCurrentResults?: () => InspectionResult[];
  onSaveComplete?: (
    savedData: unknown,
    draft: PPEInspectionDraft,
    result: InspectionResult
  ) => Promise<void> | void;
  traceContext?: {
    processStageCode?: string;
    processStageName?: string;
    pageInstanceId?: string;
    cameraId?: string;
  };
}

export interface SaveInspectionResultsResult {
  results: InspectionResult[];
  savedCount: number;
  failedCount: number;
}

export interface UsePPESaveResult {
  saveInspectionResults: (drafts: PPEInspectionDraft[]) => Promise<SaveInspectionResultsResult>;
}

export const usePPESave = ({
  addAppResult,
  setResults,
  getCurrentResults,
  onSaveComplete,
  traceContext,
}: UsePPESaveOptions): UsePPESaveResult => {
  const saveInspectionResults = useCallback(
    async (drafts: PPEInspectionDraft[]): Promise<SaveInspectionResultsResult> => {
      const results: InspectionResult[] = drafts.map((draft) => ({
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        image: draft.image,
        standardId: null,
        overallQuality: draft.overallQuality,
        score: draft.score,
        reason: draft.reason,
        reasonKeywords: draft.reasonKeywords,
        defects: draft.defects || [],
        detectionType: 'cleanroom_ppe',
        processStageCode: traceContext?.processStageCode || '',
        processStageName: traceContext?.processStageName || '',
        pageInstanceId: traceContext?.pageInstanceId || '',
        cameraId: traceContext?.cameraId || '',
        traceContext: traceContext ? { ...traceContext } : {},
      }));

      const currentResults = getCurrentResults ? getCurrentResults() : [];
      const allResults = [...results, ...currentResults];
      setResults(allResults.slice(0, 20));

      let savedCount = 0;
      let failedCount = 0;

      for (let index = 0; index < results.length; index += 1) {
        const result = results[index];
        const draft = drafts[index];
        try {
          const savedData = await addAppResult(result);
          if (draft) {
            await onSaveComplete?.(savedData, draft, result);
          }
          savedCount += 1;
        } catch (error) {
          console.error('保存检测结果失败:', error);
          failedCount += 1;
        }
      }

      return {
        results,
        savedCount,
        failedCount,
      };
    },
    [addAppResult, getCurrentResults, onSaveComplete, setResults, traceContext]
  );

  return {
    saveInspectionResults,
  };
};
