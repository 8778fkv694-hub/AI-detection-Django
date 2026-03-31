/**
 * NonFusionModeStatusCard Component
 *
 * 用途：非融合模式OCR检测状态卡片
 * 功能：显示OCR状态、二维码状态、综合判断
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { FileText, CheckCircle, XCircle, AlertCircle, Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import type { TestResult } from '@/types/ocr';

type WorkflowState = 'idle' | 'capturing' | 'searching_best_frame' | 'processing' | 'waiting_for_approval' | 'completed';
type MatchStatus = 'none' | 'qualified' | 'unqualified';

export interface NonFusionModeStatusCardProps {
  /** OCR检测结果 */
  ocrResult: TestResult | null;
  /** 当前工作流状态 */
  workflowState: WorkflowState;
  /** OCR匹配状态 */
  matchStatus: MatchStatus;
  /** 是否启用二维码检测 */
  enableBarcodeDetection: boolean;
  /** 是否应显示检测中状态 */
  showInProgressState?: boolean;
}

export const NonFusionModeStatusCard: React.FC<NonFusionModeStatusCardProps> = ({
  ocrResult,
  workflowState,
  matchStatus,
  enableBarcodeDetection,
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
          <FileText className="h-5 w-5 text-blue-400" />
          实时检测状态
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* OCR结果和二维码检测结果 - 两列布局 */}
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
                  <div className="p-2 rounded-lg bg-slate-800/50 space-y-1">
                    <div className="flex items-center justify-between">
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

          {/* 综合判断 - 非融合模式下只有OCR和二维码检测 */}
          {ocrResult && workflowState !== 'idle' && !isInProgress && (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Settings className="h-3 w-3 text-orange-400" />
                <span className="text-xs font-medium text-orange-300">综合判断</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/50">
                <div className="flex items-center gap-1.5">
                  {(() => {
                    const ocrQualified = matchStatus === 'qualified';
                    const barcodeQualified = !ocrResult.barcode_analysis?.enabled || ocrResult.barcode_analysis.overall_match;
                    const finalQualified = ocrQualified && barcodeQualified;
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
                  const barcodeQualified = !ocrResult.barcode_analysis?.enabled || ocrResult.barcode_analysis.overall_match;
                  const finalQualified = ocrQualified && barcodeQualified;
                  return finalQualified ? 'bg-green-900/50 text-green-300' : 'bg-yellow-900/50 text-yellow-300';
                })()
                  }`}>
                  {(() => {
                    const ocrQualified = matchStatus === 'qualified';
                    const barcodeQualified = !ocrResult.barcode_analysis?.enabled || ocrResult.barcode_analysis.overall_match;
                    const finalQualified = ocrQualified && barcodeQualified;
                    return finalQualified ? '合格' : '存疑';
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* 检测中状态 - 显示综合判断的检测中状态 */}
          {isInProgress && (
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

export default NonFusionModeStatusCard;
