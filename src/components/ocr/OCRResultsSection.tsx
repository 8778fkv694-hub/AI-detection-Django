import React, { useState, useEffect, useCallback } from 'react';
import { FusionModeResultCard } from '@/components/ocr/FusionModeResultCard';
import { NonFusionModeStatusCard } from '@/components/ocr/NonFusionModeStatusCard';
import { WorkflowStatusCard } from '@/components/ocr/WorkflowStatusCard';
import { OCRResultDisplay } from '@/components/ocr/OCRResultDisplay';
import { FQCResultCard } from '@/components/ocr/FQCResultCard';
import { fetchFQCRecords, type FQCRecord } from '@/lib/fqcApi';
import { KeywordConfig } from '@/state/ocrDetectionStore';

// Align with WorkflowStatusCard types
type WorkflowState = 'idle' | 'capturing' | 'searching_best_frame' | 'processing' | 'waiting_for_approval' | 'completed';
type MatchStatus = 'none' | 'qualified' | 'unqualified';
type FinalResult = 'none' | 'qualified' | 'unqualified';

interface OCRResultsSectionProps {
  // Global State / Flags
  fusionModeEnabled: boolean;
  isRealtimeActive: boolean;
  enableBarcodeDetection: boolean;
  workflowState: WorkflowState;
  matchStatus: MatchStatus;
  finalResult: FinalResult;
  isAnalyzing: boolean;
  isWaitingForSpace: boolean;

  // Data
  ocrResult: any;
  aiAnalysisResult: any;
  selectedTargets: string[];
  detectionConfidence: number;
  keywordConfigs: KeywordConfig[];
  detectionHistory: any[];
  imagePreview: string | null;
  currentSharpness: number;
  imageSaveMode: 'full' | 'roi';
  traceContext?: {
    processStageCode?: string;
    processStageName?: string;
    pageInstanceId?: string;
    cameraId?: string;
    fixtureEnabled?: boolean;
    fixtureQr?: string;
    fixtureQrSource?: 'vision' | 'scanner' | 'nfc' | 'manual';
    fixtureQrInputStatus?: 'success' | 'failed' | 'pending';
    fixtureQrPrefixes?: string[];
    fixtureQrPattern?: string;
    businessCode?: string;
    businessCodeType?: string;
    // 后端保存后返回的增量字段
    fixtureQrCandidateCount?: number;
    fixtureQrCandidates?: Array<{
      text?: string;
      confidence?: number | null;
      type?: string;
      matchedByRule?: boolean;
    }>;
    fixtureQrFallbackRecommended?: boolean;
  };
  tracePreview?: {
    traceConclusion?: '合格' | '存疑' | '需复检';
    traceConclusionReason?: string;
    traceRuleSummary?: string;
    relatedStages?: Array<{
      stageCode?: string;
      stageName?: string;
      businessCode?: string;
      status?: 'completed' | 'pending' | 'failed';
      resultId?: string;
      timestamp?: string;
      pageInstanceId?: string;
      cameraId?: string;
    }>;
  };

  // Refs (for direct access in WorkflowStatusCard)
  detectedElementsRef: React.MutableRefObject<string[]>;
  elementDetectionStartTimeRef: React.MutableRefObject<number | null>;

  // UI State
  showHistoryDetails: boolean;
  expandedHistoryId: string | null;

  // Setters / Actions
  setAiAnalysisResult: (result: any) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  setIsWaitingForSpace: (waiting: boolean) => void;
  setDetectedElements: (elements: string[]) => void;
  setElementDetectionStartTime: (time: number | null) => void;
  setFinalResult: (result: FinalResult) => void;
  setWorkflowState: (state: WorkflowState) => void;
  setMatchStatus: (status: MatchStatus) => void;
  setWorkflowResult: (result: any) => void;
  setShowHistoryDetails: (show: boolean) => void;
  setExpandedHistoryId: (id: string | null) => void;
  refreshHistory: () => Promise<void>;
  
  // Helpers
  getTargetChineseName: (target: string | null | undefined) => string;
  getConfidenceIcon: (score: number) => React.ReactNode;
  getConfidenceColor: (score: number) => string;
  exportOCRResults: (ocrResult: any, imagePreview?: string) => void;

  // 工装码行内补录
  onScrollToFixtureSupplement?: () => void;
  fixtureQrInput?: string;
  onFixtureQrInputChange?: (value: string) => void;
  onFixtureQrSourceChange?: (source: 'vision' | 'scanner' | 'nfc' | 'manual') => void;
}

export const OCRResultsSection: React.FC<OCRResultsSectionProps> = (props) => {
  const [showInlineSupp, setShowInlineSupp] = useState(false);
  const [fqcRecords, setFqcRecords] = useState<FQCRecord[]>([]);

  // 当工装码绑定后，加载该工装板的FQC记录
  const fixtureQr = props.traceContext?.fixtureQr;
  const loadFQC = useCallback(async () => {
    if (!fixtureQr) {
      setFqcRecords([]);
      return;
    }
    try {
      const records = await fetchFQCRecords({ fixture_qr: fixtureQr });
      setFqcRecords(records);
    } catch {
      // silent
    }
  }, [fixtureQr]);

  useEffect(() => { loadFQC(); }, [loadFQC]);

  // 检验历史变化时也刷新FQC（新保存可能触发了FQC生成）
  useEffect(() => {
    if (fixtureQr && props.detectionHistory.length > 0) {
      loadFQC();
    }
  }, [props.detectionHistory.length, fixtureQr, loadFQC]);

  const showInProgressState = props.isRealtimeActive &&
    props.workflowState !== 'waiting_for_approval' &&
    props.workflowState !== 'completed';
  const relatedStages = props.tracePreview?.relatedStages || [];
  const traceConclusionColor = props.tracePreview?.traceConclusion === '合格'
    ? 'text-green-300'
    : props.tracePreview?.traceConclusion === '需复检'
      ? 'text-red-300'
      : 'text-amber-300';

  return (
    <div className="flex flex-col gap-4">
      {props.traceContext && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold text-amber-200">追踪</span>
            <span className="text-slate-400">工序: <span className="text-slate-200">{props.traceContext.processStageName || props.traceContext.processStageCode || '未设置'}</span></span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-400">工装: <span className={props.traceContext.fixtureQr ? 'text-green-300' : (props.traceContext.fixtureEnabled === false ? 'text-slate-500' : 'text-amber-300')}>{props.traceContext.fixtureQr || (props.traceContext.fixtureEnabled === false ? '未启用' : '未绑定')}</span></span>
            {props.traceContext.fixtureEnabled !== false && (<>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">方式: <span className="text-slate-200">{props.traceContext.fixtureQrSource || 'vision'}</span></span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-400">状态: <span className={props.traceContext.fixtureQrInputStatus === 'success' ? 'text-green-300' : 'text-amber-300'}>{props.traceContext.fixtureQrInputStatus || 'pending'}</span></span>
            </>)}
            {props.traceContext.fixtureQrCandidateCount !== undefined && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">候选: <span className={props.traceContext.fixtureQrCandidateCount > 1 ? 'text-amber-300' : 'text-slate-200'}>{props.traceContext.fixtureQrCandidateCount}个</span></span>
              </>
            )}
          </div>
          {props.traceContext.fixtureEnabled !== false && (props.traceContext.fixtureQrFallbackRecommended || (props.traceContext.fixtureQrSource === 'vision' && !props.traceContext.fixtureQr)) && (
            <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
              {!showInlineSupp ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span>⚠ 工装码未绑定{props.traceContext.fixtureQrCandidateCount !== undefined && `（${props.traceContext.fixtureQrCandidateCount}个候选）`}</span>
                  {props.onFixtureQrInputChange && (
                    <button type="button" onClick={() => setShowInlineSupp(true)} className="rounded border border-amber-400/50 bg-amber-500/20 px-2 py-0.5 text-amber-200 hover:bg-amber-500/30 transition-colors shrink-0">
                      补录工装码
                    </button>
                  )}
                  {props.onScrollToFixtureSupplement && (
                    <>
                      <button
                        type="button"
                        onClick={() => props.onScrollToFixtureSupplement?.('scanner')}
                        className="rounded border border-slate-600 bg-slate-900/60 px-2 py-0.5 text-slate-200 hover:border-amber-400/50 transition-colors shrink-0"
                      >
                        切换扫码
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onScrollToFixtureSupplement?.('nfc')}
                        className="rounded border border-slate-600 bg-slate-900/60 px-2 py-0.5 text-slate-200 hover:border-amber-400/50 transition-colors shrink-0"
                      >
                        切换NFC
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onScrollToFixtureSupplement?.('manual')}
                        className="rounded border border-slate-600 bg-slate-900/60 px-2 py-0.5 text-slate-200 hover:border-amber-400/50 transition-colors shrink-0"
                      >
                        人工补录
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {(['scanner', 'nfc', 'manual'] as const).map(src => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => props.onFixtureQrSourceChange?.(src)}
                        className={`rounded px-1.5 py-0.5 transition-colors ${
                          props.traceContext?.fixtureQrSource === src
                            ? 'bg-amber-400/30 text-amber-100 border border-amber-400'
                            : 'bg-slate-800 text-slate-400 border border-slate-700 hover:border-amber-500/40'
                        }`}
                      >
                        {src === 'scanner' ? '扫码' : src === 'nfc' ? 'NFC' : '人工'}
                      </button>
                    ))}
                  </div>
                  <input
                    autoFocus
                    value={props.fixtureQrInput ?? ''}
                    onChange={e => props.onFixtureQrInputChange?.(e.target.value.trim())}
                    placeholder="输入工装码"
                    className="flex-1 min-w-0 rounded border border-slate-600 bg-slate-900/70 px-2 py-1 text-xs text-slate-100 outline-none focus:border-amber-400"
                  />
                  <button type="button" onClick={() => { props.onFixtureQrSourceChange?.('vision'); props.onFixtureQrInputChange?.(''); setShowInlineSupp(false); }} className="text-slate-400 hover:text-slate-200 shrink-0">
                    取消
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {props.traceContext?.fixtureEnabled !== false && relatedStages.length > 0 && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-3 space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold text-cyan-200">前置工序状态</span>
            {props.tracePreview?.traceConclusion && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">追踪结论: <span className={traceConclusionColor}>{props.tracePreview.traceConclusion}</span></span>
              </>
            )}
            {props.tracePreview?.traceRuleSummary && (
              <>
                <span className="text-slate-600">|</span>
                <span className="text-slate-400">{props.tracePreview.traceRuleSummary}</span>
              </>
            )}
          </div>
          {props.tracePreview?.traceConclusionReason && (
            <div className="text-xs text-slate-300">{props.tracePreview.traceConclusionReason}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {relatedStages.map((stage, index) => {
              const isCurrentStage = stage.stageCode === props.traceContext?.processStageCode;
              const statusClass = stage.status === 'completed'
                ? 'border-green-500/30 bg-green-500/5'
                : stage.status === 'failed'
                  ? 'border-red-500/30 bg-red-500/5'
                  : 'border-slate-700 bg-slate-900/40';
              return (
                <div
                  key={`${stage.resultId || stage.stageCode || 'stage'}-${index}`}
                  className={`rounded border p-2 text-xs ${statusClass} ${isCurrentStage ? 'ring-1 ring-cyan-400/40' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-slate-100">
                      {stage.stageName || stage.stageCode || '未命名工序'}
                      {isCurrentStage && <span className="ml-1 text-cyan-300">当前</span>}
                    </div>
                    <div className="text-[10px] text-slate-400">{stage.status || 'pending'}</div>
                  </div>
                  <div className="mt-1 text-slate-400 break-all">
                    工序码: <span className="text-slate-200">{stage.stageCode || '-'}</span>
                  </div>
                  <div className="mt-1 text-slate-400 break-all">
                    业务码: <span className="text-slate-200">{stage.businessCode || '待补充'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 融合模式结果 - 显示在顶部 */}
      {props.fusionModeEnabled && (
        props.workflowState === 'capturing' || 
        props.workflowState === 'processing' || 
        props.workflowState === 'waiting_for_approval' || 
        props.workflowState === 'completed' || 
        (props.ocrResult && props.aiAnalysisResult)
      ) && (
        <FusionModeResultCard
          ocrResult={props.ocrResult}
          aiAnalysisResult={props.aiAnalysisResult}
          workflowState={props.workflowState}
          matchStatus={props.matchStatus}
          enableBarcodeDetection={props.enableBarcodeDetection}
          isAnalyzing={props.isAnalyzing}
          fusionModeEnabled={props.fusionModeEnabled}
          setAiAnalysisResult={props.setAiAnalysisResult}
          setIsAnalyzing={props.setIsAnalyzing}
          showInProgressState={showInProgressState}
        />
      )}

      {/* 非融合模式检测状态卡片 */}
      {!props.fusionModeEnabled && props.isRealtimeActive && (
        props.workflowState === 'capturing' || 
        props.workflowState === 'processing' || 
        props.workflowState === 'waiting_for_approval' || 
        props.workflowState === 'completed' || 
        props.ocrResult
      ) && (
        <NonFusionModeStatusCard
          ocrResult={props.ocrResult}
          workflowState={props.workflowState}
          matchStatus={props.matchStatus}
          enableBarcodeDetection={props.enableBarcodeDetection}
          showInProgressState={showInProgressState}
        />
      )}

      {/* 工作流状态显示 */}
      {props.isRealtimeActive && (
        <WorkflowStatusCard
          selectedTargets={props.selectedTargets}
          workflowState={props.workflowState}
          finalResult={props.finalResult}
          matchStatus={props.matchStatus}
          detectionConfidence={props.detectionConfidence}
          isWaitingForSpace={props.isWaitingForSpace}
          ocrResult={props.ocrResult}
          keywordConfigs={props.keywordConfigs}
          setIsWaitingForSpace={props.setIsWaitingForSpace}
          setDetectedElements={props.setDetectedElements}
          setElementDetectionStartTime={props.setElementDetectionStartTime}
          setFinalResult={props.setFinalResult}
          setWorkflowState={props.setWorkflowState}
          setMatchStatus={props.setMatchStatus}
          setWorkflowResult={props.setWorkflowResult}
          detectedElementsRef={props.detectedElementsRef}
          elementDetectionStartTimeRef={props.elementDetectionStartTimeRef}
          getTargetChineseName={(t: string) => props.getTargetChineseName(t)}
          getConfidenceIcon={props.getConfidenceIcon}
          getConfidenceColor={props.getConfidenceColor}
          imageSaveMode={props.imageSaveMode}
          currentSharpness={props.currentSharpness}
        />
      )}

      {/* FQC终检结果 */}
      {fqcRecords.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-indigo-300">FQC 终检记录</div>
          {fqcRecords.map(record => (
            <FQCResultCard key={record.id} record={record} />
          ))}
        </div>
      )}

      <OCRResultDisplay
        ocrResult={props.ocrResult}
        aiAnalysisResult={props.aiAnalysisResult}
        workflowState={props.workflowState}
        fusionModeEnabled={props.fusionModeEnabled}
        isAnalyzing={props.isAnalyzing}
        setAiAnalysisResult={props.setAiAnalysisResult}
        setIsAnalyzing={props.setIsAnalyzing}
        detectionHistory={props.detectionHistory}
        showHistoryDetails={props.showHistoryDetails}
        setShowHistoryDetails={props.setShowHistoryDetails}
        expandedHistoryId={props.expandedHistoryId}
        setExpandedHistoryId={props.setExpandedHistoryId}
        keywordConfigs={props.keywordConfigs}
        refreshHistory={props.refreshHistory}
        exportResults={() => props.exportOCRResults(props.ocrResult, props.imagePreview || undefined)}
        getTargetChineseName={(t: string) => props.getTargetChineseName(t)}
      />
    </div>
  );
};
