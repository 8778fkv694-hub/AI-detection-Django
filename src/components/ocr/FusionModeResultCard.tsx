/**
 * FusionModeResultCard Component
 *
 * 用途：融合模式检测结果卡片
 * 功能：显示OCR结果、二维码检测、LLM分析、综合判断
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { Brain, FileText, CheckCircle, XCircle, AlertCircle, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { QRCodeDetectionResult } from '@/components/ocr/QRCodeDetectionResult';
import type { TestResult } from '@/types/ocr';

type WorkflowState = 'idle' | 'capturing' | 'searching_best_frame' | 'processing' | 'waiting_for_approval' | 'completed';
type MatchStatus = 'none' | 'qualified' | 'unqualified';

// 使用 InspectionResult 作为 AI 分析结果类型，保持与 useFusionAI 返回类型一致
import type { InspectionResult } from '@/types';
type AIAnalysisResult = InspectionResult;

export interface FusionModeResultCardProps {
  /** OCR检测结果 */
  ocrResult: TestResult | null;
  /** AI分析结果 */
  aiAnalysisResult: AIAnalysisResult | null;
  /** 当前工作流状态 */
  workflowState: WorkflowState;
  /** OCR匹配状态 */
  matchStatus: MatchStatus;
  /** 是否启用二维码检测 */
  enableBarcodeDetection: boolean;
  /** 是否正在分析 */
  isAnalyzing: boolean;
  /** 融合模式是否启用 */
  fusionModeEnabled: boolean;
  /** 设置AI分析结果 */
  setAiAnalysisResult: (result: AIAnalysisResult | null) => void;
  /** 设置分析状态 */
  setIsAnalyzing: (analyzing: boolean) => void;
  /** 是否应显示检测中状态 */
  showInProgressState?: boolean;
}

export const FusionModeResultCard: React.FC<FusionModeResultCardProps> = ({
  ocrResult,
  aiAnalysisResult,
  workflowState,
  matchStatus,
  enableBarcodeDetection,
  isAnalyzing,
  fusionModeEnabled,
  setAiAnalysisResult,
  setIsAnalyzing,
  showInProgressState = false,
}) => {
  const isInProgress = showInProgressState ||
    workflowState === 'processing' ||
    workflowState === 'capturing' ||
    workflowState === 'searching_best_frame';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-purple-400" />
          融合模式检测结果
          {isAnalyzing && (
            <div className="flex items-center gap-2 text-sm text-purple-400">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-400"></div>
              LLM分析中...
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* OCR结果和二维码检测结果 - 合并为两列布局 */}
          <div className="grid grid-cols-2 gap-2">
            {/* OCR结果 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-blue-400" />
                <span className="text-xs font-medium text-blue-300">OCR检测结果</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                <div className="flex items-center gap-1.5">
                  {isInProgress ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-400"></div>
                  ) : matchStatus === 'qualified' ? (
                    <CheckCircle className="h-3 w-3 text-green-400" />
                  ) : matchStatus === 'unqualified' ? (
                    <AlertCircle className="h-3 w-3 text-yellow-400" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-amber-400" />
                  )}
                  <span className="text-xs font-medium">OCR状态</span>
                </div>
                <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${isInProgress ? 'bg-blue-900/50 text-blue-300' :
                  matchStatus === 'qualified' ? 'bg-green-900/50 text-green-300' :
                    matchStatus === 'unqualified' ? 'bg-yellow-900/50 text-yellow-300' :
                      'bg-amber-900/50 text-amber-300'
                  }`}>
                  {isInProgress ? '检测中...' :
                    matchStatus === 'qualified' ? '合格' :
                      matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                </div>
              </div>
            </div>

            {/* 二维码检测结果 */}
            {enableBarcodeDetection && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="h-3 w-3 bg-green-400 rounded flex items-center justify-center">
                    <span className="text-xs text-slate-900 font-bold">码</span>
                  </div>
                  <span className="text-xs font-medium text-green-300">二维码检测结果</span>
                  <div className="ml-2 px-1.5 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                    微信
                  </div>
                </div>
                {ocrResult?.barcode_analysis && !isInProgress ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                      <div className="flex items-center gap-1.5">
                        {ocrResult.barcode_analysis.overall_match ? (
                          <CheckCircle className="h-3 w-3 text-green-400" />
                        ) : (
                          <XCircle className="h-3 w-3 text-red-400" />
                        )}
                        <span className="text-xs font-medium">二维码状态</span>
                      </div>
                      <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${ocrResult.barcode_analysis.overall_match ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'
                        }`}>
                        {ocrResult.barcode_analysis.overall_match ? '合格' : '存疑'}
                      </div>
                    </div>
                    {/* 添加详细识别结果组件，展示忽略的二维码等信息 */}
                    <div className="bg-slate-800/30 p-2 rounded-lg">
                      <QRCodeDetectionResult barcodeAnalysis={ocrResult.barcode_analysis} />
                    </div>
                  </div>
                ) : isInProgress ? (
                  <div className="flex items-center justify-center p-2 rounded-lg bg-slate-800/50">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-400 mr-1"></div>
                    <span className="text-xs text-green-300">检测中...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center p-2 rounded-lg bg-slate-800/50">
                    <span className="text-xs text-slate-400">等待检测...</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LLM分析结果和综合判断 - 合并为两列布局 */}
          <div className="grid grid-cols-2 gap-2">
            {/* LLM结果 */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Brain className="h-3 w-3 text-purple-400" />
                <span className="text-xs font-medium text-purple-300">LLM分析结果</span>
              </div>
              {aiAnalysisResult && !isAnalyzing && !isInProgress ? (
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                  <div className="flex items-center gap-1.5">
                    {aiAnalysisResult.overallQuality === '合格' ? (
                      <CheckCircle className="h-3 w-3 text-green-400" />
                    ) : aiAnalysisResult.overallQuality === '存疑' ? (
                      <XCircle className="h-3 w-3 text-red-400" />
                    ) : (
                      <AlertCircle className="h-3 w-3 text-amber-400" />
                    )}
                    <span className="text-xs font-medium">LLM状态</span>
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${aiAnalysisResult.overallQuality === '合格' ? 'bg-green-900/50 text-green-300' :
                    aiAnalysisResult.overallQuality === '存疑' ? 'bg-yellow-900/50 text-yellow-300' :
                      'bg-amber-900/50 text-amber-300'
                    }`}>
                    {aiAnalysisResult.overallQuality}
                  </div>
                </div>
              ) : isAnalyzing || (isInProgress && fusionModeEnabled) ? (
                <div className="flex items-center justify-center p-2 rounded-lg bg-slate-800/50">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-purple-400 mr-1"></div>
                  <span className="text-xs text-purple-300">LLM分析中...</span>
                </div>
              ) : workflowState === 'capturing' ? (
                <div className="flex items-center justify-center p-2 rounded-lg bg-slate-800/50">
                  <span className="text-xs text-slate-400">待检测</span>
                </div>
              ) : (
                <div className="flex items-center justify-center p-2 rounded-lg bg-slate-800/50">
                  <span className="text-xs text-slate-400">等待LLM分析...</span>
                  <button
                    className="ml-2 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded"
                    onClick={() => {
                      console.log('🔧 调试LLM状态:');
                      console.log('🔧 isAnalyzing:', isAnalyzing);
                      console.log('🔧 workflowState:', workflowState);
                      console.log('🔧 fusionModeEnabled:', fusionModeEnabled);
                      console.log('🔧 aiAnalysisResult:', aiAnalysisResult);
                      // 强制重置状态
                      setIsAnalyzing(false);
                      setAiAnalysisResult(null);
                    }}
                  >
                    重置
                  </button>
                </div>
              )}
            </div>

            {/* 综合结果 - 系统自动复核，只有在两个最新的检测结果都完成后才显示 */}
            {aiAnalysisResult && ocrResult && !isAnalyzing && workflowState !== 'idle' && !isInProgress && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Settings className="h-3 w-3 text-orange-400" />
                  <span className="text-xs font-medium text-orange-300">综合判断</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      // 计算最终结果：OCR、LLM和二维码检测（如果启用）都必须合格
                      const ocrQualified = matchStatus === 'qualified';
                      const llmQualified = aiAnalysisResult.overallQuality === '合格';
                      const barcodeQualified = !ocrResult.barcode_analysis?.enabled || ocrResult.barcode_analysis.overall_match;
                      const finalQualified = ocrQualified && llmQualified && barcodeQualified;

                      return finalQualified ? (
                        <CheckCircle className="h-3 w-3 text-green-400" />
                      ) : (
                        <AlertCircle className="h-3 w-3 text-yellow-400" />
                      );
                    })()}
                    <span className="text-xs font-medium">最终结果</span>
                  </div>
                  <div className={`px-2 py-0.5 rounded-full text-xs font-medium ${(() => {
                    const ocrQualified = matchStatus === 'qualified';
                    const llmQualified = aiAnalysisResult.overallQuality === '合格';
                    const barcodeQualified = !ocrResult.barcode_analysis?.enabled || ocrResult.barcode_analysis.overall_match;
                    const finalQualified = ocrQualified && llmQualified && barcodeQualified;

                    return finalQualified ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300';
                  })()
                    }`}>
                    {(() => {
                      const ocrQualified = matchStatus === 'qualified';
                      const llmQualified = aiAnalysisResult.overallQuality === '合格';
                      const barcodeQualified = !ocrResult.barcode_analysis?.enabled || ocrResult.barcode_analysis.overall_match;
                      const finalQualified = ocrQualified && llmQualified && barcodeQualified;

                      return finalQualified ? '合格' : '存疑';
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 检测中状态 - 显示综合判断的检测中状态 */}
          {(isInProgress || isAnalyzing) && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Settings className="h-3 w-3 text-orange-400" />
                <span className="text-xs font-medium text-orange-300">综合判断</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                <div className="flex items-center gap-1.5">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-orange-400"></div>
                  <span className="text-xs font-medium">最终结果</span>
                </div>
                <div className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-900/50 text-orange-300">
                  检测中...
                </div>
              </div>
            </div>
          )}

        </div>
      </CardContent>
    </Card>
  );
};

export default FusionModeResultCard;
