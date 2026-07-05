/**
 * WorkflowStatusCard Component
 *
 * 用途：智能工作流状态卡片
 * 功能：显示检测目标、工作流状态、关键词分析、二维码检测结果
 * 使用位置：OCRDetectionScreen
 */

import React from 'react';
import { CameraOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Button } from '@/components/ui/Button';
import { QRCodeDetectionResult } from '@/components/ocr/QRCodeDetectionResult';
import type { TestResult, KeywordConfig } from '@/types/ocr';

type WorkflowState = 'idle' | 'capturing' | 'searching_best_frame' | 'processing' | 'waiting_for_approval' | 'completed';
type MatchStatus = 'none' | 'qualified' | 'unqualified';
type FinalResult = 'none' | 'qualified' | 'unqualified';

export interface WorkflowStatusCardProps {
  /** 选中的检测目标 */
  selectedTargets: string[];
  /** 工作流状态 */
  workflowState: WorkflowState;
  /** 最终结果 */
  finalResult: FinalResult;
  /** 匹配状态 */
  matchStatus: MatchStatus;
  /** 检测置信度阈值 */
  detectionConfidence: number;
  /** 是否等待空格确认 */
  isWaitingForSpace: boolean;
  /** OCR检测结果 */
  ocrResult: TestResult | null;
  /** 关键词配置列表 */
  keywordConfigs: KeywordConfig[];
  /** 图片保存模式 */
  imageSaveMode?: 'full' | 'roi';
  /** 当前清晰度 */
  currentSharpness?: number;
  bestSharpness?: number;

  /** 设置等待空格状态 */
  setIsWaitingForSpace: (waiting: boolean) => void;
  /** 设置检测到的元素 */
  setDetectedElements: (elements: string[]) => void;
  /** 设置元素检测开始时间 */
  setElementDetectionStartTime: (time: number | null) => void;
  /** 设置最终结果 */
  setFinalResult: (result: FinalResult) => void;
  /** 设置工作流状态 */
  setWorkflowState: (state: WorkflowState) => void;
  /** 设置匹配状态 */
  setMatchStatus: (status: MatchStatus) => void;
  /** 设置工作流结果 */
  setWorkflowResult: (result: unknown) => void;

  /** 检测元素Ref */
  detectedElementsRef: React.MutableRefObject<string[]>;
  /** 元素检测开始时间Ref */
  elementDetectionStartTimeRef: React.MutableRefObject<number | null>;

  /** 获取目标中文名称 */
  getTargetChineseName: (target: string) => string;
  /** 获取置信度图标 */
  getConfidenceIcon: (score: number) => React.ReactNode;
  /** 获取置信度颜色 */
  getConfidenceColor: (score: number) => string;
}

export const WorkflowStatusCard: React.FC<WorkflowStatusCardProps> = ({
  selectedTargets,
  workflowState,
  finalResult,
  matchStatus,
  detectionConfidence,
  isWaitingForSpace,
  ocrResult,
  keywordConfigs,
  setIsWaitingForSpace,
  setDetectedElements,
  setElementDetectionStartTime,
  setFinalResult,
  setWorkflowState,
  setMatchStatus,
  setWorkflowResult,
  detectedElementsRef,
  elementDetectionStartTimeRef,
  getTargetChineseName,
  imageSaveMode = 'roi',
  currentSharpness = 0,
  bestSharpness = 0,
}) => {
  const getWorkflowStatusMeta = () => {
    if (workflowState === 'processing') {
      return { dotClassName: 'bg-blue-500', textClassName: 'text-blue-400 font-medium', label: '识别中...' };
    }
    if (workflowState === 'capturing') {
      return { dotClassName: 'bg-yellow-500', textClassName: 'text-slate-400', label: '抓拍中...' };
    }
    if (workflowState === 'searching_best_frame') {
      return {
        dotClassName: 'bg-cyan-500',
        textClassName: 'text-cyan-400 font-medium',
        label: imageSaveMode === 'full' ? '寻找最佳全画面...' : '寻找最佳ROI...'
      };
    }
    if (workflowState === 'waiting_for_approval') {
      if (finalResult === 'qualified') {
        return { dotClassName: 'bg-green-500', textClassName: 'text-green-400 font-medium', label: '等待确认(合格)' };
      }
      if (finalResult === 'unqualified' || matchStatus === 'unqualified') {
        return { dotClassName: 'bg-yellow-500', textClassName: 'text-yellow-400 font-medium', label: '等待确认(存疑)' };
      }
      return { dotClassName: 'bg-yellow-500', textClassName: 'text-yellow-400 font-medium', label: '等待确认' };
    }
    if (workflowState === 'completed') {
      if (finalResult === 'qualified') {
        return { dotClassName: 'bg-green-500', textClassName: 'text-green-400 font-medium', label: '已完成(合格)' };
      }
      if (finalResult === 'unqualified' || matchStatus === 'unqualified') {
        return { dotClassName: 'bg-yellow-500', textClassName: 'text-yellow-400 font-medium', label: '已完成(存疑)' };
      }
      return { dotClassName: 'bg-green-500', textClassName: 'text-green-400 font-medium', label: '已完成' };
    }
    return { dotClassName: 'bg-gray-500', textClassName: 'text-slate-400', label: '等待检测' };
  };

  const workflowStatusMeta = getWorkflowStatusMeta();

  const handleManualReset = () => {
    setIsWaitingForSpace(false);
    // 清空检测到的元素状态，重置为初始状态
    setDetectedElements([]);
    detectedElementsRef.current = [];
    setElementDetectionStartTime(null);
    elementDetectionStartTimeRef.current = null;
    setFinalResult('none');
    setWorkflowState('idle');
    setMatchStatus('none');
    setWorkflowResult(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CameraOff className="h-5 w-5" />
          实时检测流程
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {/* 检测目标和工作流状态 - 合并为一行 */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>
                  <span className="text-xs font-medium text-slate-200">检测目标</span>
                </div>
                <span className="text-xs text-slate-400">
                  {selectedTargets.length} 个
                </span>
              </div>
              <div className="mt-1 text-xs text-slate-400 truncate">
                {selectedTargets.filter(target => target != null).map(target => getTargetChineseName(target)).filter(name => name !== '').join(', ')}
              </div>
            </div>

            <div className="p-2 bg-slate-800/50 rounded-lg border border-slate-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  {workflowState === 'processing' ? (
                    <div
                      className="animate-spin rounded-full h-3 w-3 border-2 border-blue-500/30 border-t-blue-500"
                    ></div>
                  ) : (
                    <div className={`w-2.5 h-2.5 rounded-full ${workflowStatusMeta.dotClassName}`}></div>
                  )}
                  <span className="text-xs font-medium text-slate-200">工作流状态</span>
                </div>
                <span className={`text-xs ${workflowStatusMeta.textClassName}`}>{workflowStatusMeta.label}</span>
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {workflowState === 'searching_best_frame' && currentSharpness > 0 ? (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-blue-400 font-medium">
                      当前清晰度: {currentSharpness.toFixed(1)}
                    </span>
                    {bestSharpness > 0 && (
                      <span className="text-emerald-400 font-semibold animate-pulse">
                        最佳清晰度: {bestSharpness.toFixed(1)}
                      </span>
                    )}
                  </div>
                ) : (
                  <span>阈值: {(detectionConfidence * 100).toFixed(0)}%</span>
                )}
              </div>
            </div>
          </div>

          {/* 等待回车键提示 */}
          {isWaitingForSpace && (
            <div className="p-2 bg-yellow-500/20 rounded-lg border border-yellow-500/50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 bg-yellow-500 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium text-yellow-200">需要确认</span>
                </div>
                <span className="text-xs text-yellow-300">按回车键继续</span>
              </div>
              <div className="mt-1 text-xs text-yellow-400">
                检测结果需要确认，请按回车键确认后继续下一个循环
              </div>
              <div className="mt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs text-yellow-300 border-yellow-600 hover:bg-yellow-800 h-6 px-2"
                  onClick={handleManualReset}
                >
                  手动重置工作流
                </Button>
              </div>
            </div>
          )}

          {(ocrResult?.validationWarnings?.length ?? 0) > 0 && (
            <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/40">
              <div className="space-y-1">
                {(ocrResult?.validationWarnings ?? []).map((warning: string, index: number) => (
                  <div key={index} className="text-xs text-amber-100">
                    {warning}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 关键词分析结果和二维码检测结果 - 合并为一行 */}
          <div className="grid grid-cols-2 gap-2">
            {/* 关键词分析结果 */}
            {ocrResult && ocrResult.success && ocrResult.ai_analysis && (
              <div className="p-2 bg-blue-900/20 border border-blue-500/50 rounded-lg">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2.5 h-2.5 bg-blue-500 rounded-full"></div>
                  <span className="text-xs font-medium text-blue-200">关键词分析</span>
                </div>
                <div className="space-y-2">
                  {/* 过滤后的文本 */}
                  <div>
                    <Label className="text-xs text-blue-300">过滤后文本:</Label>
                    <div className="p-1.5 bg-slate-800/50 rounded border border-slate-700/50 mt-1">
                      <p className={`text-xs whitespace-pre-wrap ${!ocrResult.ai_analysis?.filtered_text || ocrResult.ai_analysis.filtered_text.trim() === ''
                        ? 'text-red-400'
                        : 'text-slate-200'
                        }`}>
                        {ocrResult.ai_analysis?.filtered_text || '无匹配内容'}
                      </p>
                    </div>
                  </div>

                  {/* 关键词匹配状态 */}
                  {keywordConfigs.length > 0 && (
                    <div>
                      <Label className="text-xs text-blue-300">关键词匹配状态:</Label>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {keywordConfigs.map((config, index) => {
                          const matchDetail = ocrResult.ai_analysis?.keyword_match_details?.find(
                            (detail: any) =>
                              detail.keyword === config.text &&
                              (detail.targetRoi || 'all') === ((config as any).targetRoi || 'all')
                          );
                          const keywordType = config.type ?? 'positive';
                          const isMatched = matchDetail?.overallMatched ?? false;

                          // 对于排除清单关键词，显示特殊样式
                          const isNegative = keywordType === 'negative';
                          const actualCount = matchDetail?.actualCount ?? 0;
                          const requiredCount = matchDetail?.requiredCount ?? (config.requiredCount ?? 1);

                          return (
                            <div
                              key={index}
                              className={`px-2 py-1 text-xs rounded border ${isNegative && actualCount > 0
                                ? 'bg-red-700/50 text-red-200 border-red-600'  // 排除清单关键词被检测到
                                : isNegative
                                  ? 'bg-orange-600/30 text-orange-200 border-orange-500/50'  // 排除清单关键词未检测到
                                  : isMatched
                                    ? 'bg-green-600/30 text-green-200 border-green-500/50'
                                    : 'bg-red-600/30 text-red-200 border-red-500/50'
                                }`}
                            >
                              <div className="flex items-center gap-1">
                                {/* 类型标识 */}
                                {isNegative && (
                                  <span className="text-red-400 font-bold">🚫</span>
                                )}
                                {/* 始终基于期望方向渲染箭头，避免受匹配详情影响 */}
                                <span className="inline-flex items-center gap-1">
                                  {config.expectedOrientation !== undefined && config.expectedOrientation !== null ? (
                                    (() => {
                                      const expected = config.expectedOrientation;
                                      if (expected === 0) return '→';
                                      if (expected === 90) return '↓';
                                      if (expected === 180) return '←';
                                      if (expected === 270) return '↑';
                                      return '';
                                    })()
                                  ) : ''} {config.text}
                                </span>
                                <div className="flex items-center gap-1">
                                  {/* 文本匹配 */}
                                  <span className={matchDetail?.textMatched ? 'text-green-300' : 'text-red-300'}>
                                    {matchDetail?.textMatched ? '✓' : '✗'}
                                  </span>
                                  {/* 方向匹配 - 用箭头表示 */}
                                  {config.expectedOrientation !== undefined && config.expectedOrientation !== null && !isNegative && (
                                    <span
                                      className={matchDetail?.orientationMatched ? 'text-green-300' : 'text-red-300'}
                                      title={`期望方向: ${config.expectedOrientation}°${matchDetail?.detectedOrientation !== undefined ? `, 检测方向: ${matchDetail.detectedOrientation}°` : ''}`}
                                    >
                                      {(() => {
                                        const expected = config.expectedOrientation;
                                        if (expected === 0) return '→'; // 右箭头
                                        if (expected === 90) return '↓'; // 下箭头
                                        if (expected === 180) return '←'; // 左箭头
                                        if (expected === 270) return '↑'; // 上箭头
                                        return '?';
                                      })()}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {/* 次数显示（仅正面关键词且有次数要求时显示） */}
                              {!isNegative && requiredCount > 1 && (
                                <div className="text-xs mt-0.5">
                                  {actualCount >= requiredCount ? (
                                    <span className="text-green-300">✓ {actualCount}/{requiredCount}次</span>
                                  ) : (
                                    <span className="text-red-300">✗ {actualCount}/{requiredCount}次</span>
                                  )}
                                </div>
                              )}
                              {/* 排除清单关键词次数显示 */}
                              {isNegative && actualCount > 0 && (
                                <div className="text-xs mt-0.5 text-red-300 font-bold">
                                  检测到{actualCount}次！
                                </div>
                              )}
                              {/* 方向信息 - 简化显示 */}
                              {config.expectedOrientation !== undefined && config.expectedOrientation !== null && matchDetail && matchDetail.detectedOrientation !== undefined && (
                                <div className="text-xs opacity-75 mt-1">
                                  检测: {matchDetail.detectedOrientation}°
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                </div>
              </div>
            )}

            {/* 二维码检测结果 - 支持融合模式和单独OCR模式 */}
            {ocrResult?.barcode_analysis?.enabled && (
              <div className="p-2 bg-green-900/20 border border-green-500/50 rounded-lg">
                <div className="flex items-center gap-1.5 mb-2">
                  <div className="w-2.5 h-2.5 bg-green-500 rounded-full"></div>
                  <span className="text-xs font-medium text-green-200">二维码检测</span>
                  <div className="ml-2 px-1.5 py-0.5 bg-slate-700/50 rounded text-xs text-slate-400">
                    微信检测器
                  </div>
                </div>
                <QRCodeDetectionResult barcodeAnalysis={ocrResult.barcode_analysis} />
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default WorkflowStatusCard;
