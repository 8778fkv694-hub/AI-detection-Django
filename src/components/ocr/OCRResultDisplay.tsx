/**
 * OCRResultDisplay Component
 *
 * 用途：OCR检测结果展示组件
 * 功能：显示识别结果、LLM分析、历史记录
 * 使用位置：OCRDetectionScreen
 */

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Label } from '@/components/ui/Label';
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  FileText,
  Download,
  TrendingUp,
  TrendingDown,
  Minus,
  Image as ImageIcon,
} from 'lucide-react';
import { QRCodeDetectionResult } from '@/components/ocr/QRCodeDetectionResult';
import { ImagePreviewModal } from '@/components/ocr/ImagePreviewModal';
import { ROIStatusCard } from '@/components/ocr/ROIStatusCard';
import type { ExtendedHistoryItem, KeywordConfig } from '@/types/ocr';

interface OCRResultDisplayProps {
  /** OCR检测结果 */
  ocrResult: any | null;
  /** AI分析结果 */
  aiAnalysisResult: any | null;
  /** 工作流状态 */
  workflowState: string;
  /** 融合模式是否启用 */
  fusionModeEnabled: boolean;
  /** 是否正在分析 */
  isAnalyzing: boolean;
  /** 设置AI分析结果 */
  setAiAnalysisResult: (result: any) => void;
  /** 设置是否正在分析 */
  setIsAnalyzing: (analyzing: boolean) => void;
  /** 检测历史记录 */
  detectionHistory: ExtendedHistoryItem[];
  /** 是否显示历史详情 */
  showHistoryDetails: boolean;
  /** 设置是否显示历史详情 */
  setShowHistoryDetails: (show: boolean) => void;
  /** 展开的历史记录ID */
  expandedHistoryId: string | null;
  /** 设置展开的历史记录ID */
  setExpandedHistoryId: (id: string | null) => void;
  /** 关键词配置 */
  keywordConfigs: KeywordConfig[];
  /** 刷新历史记录 */
  refreshHistory: () => void;
  /** 导出结果 */
  exportResults: () => void;
  /** 获取目标中文名称 */
  getTargetChineseName: (target: string) => string;
}

/**
 * 获取置信度对应的图标
 */
const getConfidenceIcon = (confidence: number) => {
  if (confidence >= 0.8) return <TrendingUp className="h-3 w-3 text-green-400" />;
  if (confidence >= 0.5) return <Minus className="h-3 w-3 text-yellow-400" />;
  return <TrendingDown className="h-3 w-3 text-red-400" />;
};

/**
 * 获取置信度对应的颜色类
 */
const getConfidenceColor = (confidence: number) => {
  if (confidence >= 0.8) return 'text-green-400';
  if (confidence >= 0.5) return 'text-yellow-400';
  return 'text-red-400';
};

const UNQUALIFIED_CN = '\u4e0d\u5408\u683c';
const getDisplayQuality = (quality?: string) => (quality === UNQUALIFIED_CN ? '存疑' : quality);
const isUnqualified = (quality?: string) => quality === UNQUALIFIED_CN || quality === '存疑';
const formatReasonKeywords = (reasonKeywords?: string | string[]) => {
  if (!reasonKeywords) return null;
  return Array.isArray(reasonKeywords) ? reasonKeywords.join(', ') : reasonKeywords;
};

export const OCRResultDisplay: React.FC<OCRResultDisplayProps> = ({
  ocrResult,
  aiAnalysisResult,
  workflowState,
  fusionModeEnabled,
  isAnalyzing: _isAnalyzing,
  setAiAnalysisResult: _setAiAnalysisResult,
  setIsAnalyzing: _setIsAnalyzing,
  detectionHistory,
  showHistoryDetails,
  setShowHistoryDetails,
  expandedHistoryId,
  setExpandedHistoryId,
  refreshHistory,
  exportResults,
  getTargetChineseName,
}) => {
  // 保留这些 props 以保持接口兼容性，未来可能会使用
  void _isAnalyzing;
  void _setAiAnalysisResult;
  void _setIsAnalyzing;
  const navigate = useNavigate();

  // 图片预览状态
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);

  const resolveImageSrc = (value: string) => {
    if (value.startsWith('data:')) return value;
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) return value;
    return `data:image/jpeg;base64,${value}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            识别结果
          </div>
          <div className="flex items-center gap-2">
            {detectionHistory.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowHistoryDetails(!showHistoryDetails)}
                className="text-xs"
              >
                {showHistoryDetails ? '隐藏历史' : `查看历史 (${detectionHistory.length})`}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate('/ocr-results')}
              className="text-xs"
            >
              查看所有结果
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={refreshHistory}
              className="text-xs"
            >
              刷新历史
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* 历史记录详情 */}
        {showHistoryDetails && detectionHistory.length > 0 && (
          <div className="mb-4 space-y-2 max-h-[800px] overflow-y-auto">
            <div className="text-sm font-medium text-slate-300 mb-2">历史检测记录</div>
            {(detectionHistory as ExtendedHistoryItem[]).map((record) => (
              <div key={record.id} className="bg-slate-800/50 rounded-lg border border-slate-600">
                <div
                  className="p-3 cursor-pointer hover:bg-slate-700/50 transition-colors"
                  onClick={() => setExpandedHistoryId(expandedHistoryId === record.id ? null : record.id)}
                >
                  <div className="flex gap-3 items-start">
                    {/* 缩略图 */}
                    {record.imageBase64 ? (
                      <img
                        src={resolveImageSrc(record.imageBase64)}
                        alt="检测图片"
                        className="w-16 h-16 object-cover rounded border border-slate-600 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all flex-shrink-0"
                        title="点击查看大图"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewImage(resolveImageSrc(record.imageBase64!));
                          setShowPreviewModal(true);
                        }}
                      />
                    ) : (
                      <div className="w-16 h-16 bg-slate-700 rounded border border-slate-600 flex items-center justify-center flex-shrink-0">
                        <ImageIcon className="h-6 w-6 text-slate-500" />
                      </div>
                    )}

                    {/* 记录信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${record.overallQuality === '合格' ? 'bg-green-400' :
                            isUnqualified(record.overallQuality) ? 'bg-red-400' : 'bg-yellow-400'
                            }`}></div>
                          <span className="text-xs text-slate-400">
                            {record.timestamp.toLocaleTimeString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className={`text-xs px-2 py-1 rounded-full ${record.overallQuality === '合格' ? 'bg-green-900/50 text-green-300' :
                            isUnqualified(record.overallQuality) ? 'bg-red-900/50 text-red-300' :
                              'bg-yellow-900/50 text-yellow-300'
                            }`}>
                            {getDisplayQuality(record.overallQuality) || '未知'}
                          </div>
                          <div className="text-xs text-slate-400">
                            {expandedHistoryId === record.id ? '收起' : '展开详情'}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-slate-300 space-y-1">
                        <div>结果: {getDisplayQuality(record.overallQuality) || '未知'} | 评分: {record.score || 0}分</div>
                        {record.aiResult && <div className="text-slate-400">LLM: {getDisplayQuality(record.aiResult.overallQuality)}</div>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 展开的详情 */}
                {expandedHistoryId === record.id && (
                  <div className="px-3 pb-3 border-t border-slate-600/50 pt-3 space-y-3">
                    {/* 基本信息 */}
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-slate-300 border-b border-slate-500/30 pb-1">检测基本信息</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="text-slate-400">检测时间:</div>
                        <div className="text-slate-300">{record.timestamp.toLocaleString()}</div>
                        <div className="text-slate-400">检测结果:</div>
                        <div className={`font-medium ${record.overallQuality === '合格' ? 'text-green-400' :
                          isUnqualified(record.overallQuality) ? 'text-red-400' : 'text-yellow-400'
                          }`}>
                          {getDisplayQuality(record.overallQuality) || '未知'}
                        </div>
                        <div className="text-slate-400">综合评分:</div>
                        <div className="text-slate-300 font-medium">{record.score || 0} 分</div>
                        <div className="text-slate-400">OCR匹配:</div>
                        <div className={`font-medium ${record.matchStatus === 'qualified' ? 'text-green-400' :
                          record.matchStatus === 'unqualified' ? 'text-yellow-400' : 'text-yellow-400'
                          }`}>
                          {record.matchStatus === 'qualified' ? '合格' :
                            record.matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                        </div>
                        <div className="text-slate-400">记录ID:</div>
                        <div className="text-slate-300 font-mono text-xs">{record.id.slice(0, 12)}...</div>
                      </div>
                    </div>

                    {/* OCR详细结果 */}
                    {record.ocrResult ? (
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-blue-300 border-b border-blue-500/30 pb-1">OCR检测详情</div>
                        {record.ocrResult.validationWarnings?.length > 0 && (
                          <div className="space-y-1">
                            {record.ocrResult.validationWarnings.map((warning: string, idx: number) => (
                              <div key={idx} className="text-xs text-amber-200 bg-amber-500/10 p-2 rounded border border-amber-500/30">
                                {warning}
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="text-slate-400">识别状态:</div>
                          <div className={`font-medium ${record.ocrResult.success ? 'text-green-400' : 'text-red-400'}`}>
                            {record.ocrResult.success ? '成功' : '失败'}
                          </div>
                          <div className="text-slate-400">最终结果:</div>
                          <div className={`font-medium ${record.matchStatus === 'qualified' ? 'text-green-400' :
                            record.matchStatus === 'unqualified' ? 'text-yellow-400' : 'text-yellow-400'
                            }`}>
                            {record.matchStatus === 'qualified' ? '合格' :
                              record.matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                          </div>
                          {record.ocrResult.text_count && (
                            <>
                              <div className="text-slate-400">文字数量:</div>
                              <div className="text-slate-300">{record.ocrResult.text_count} 个</div>
                            </>
                          )}
                          {record.ocrResult.model_used && (
                            <>
                              <div className="text-slate-400">使用模型:</div>
                              <div className="text-slate-300">{record.ocrResult.model_used}</div>
                            </>
                          )}
                        </div>
                        {record.ocrResult.full_text && (
                          <div className="space-y-1">
                            <div className="text-xs text-slate-400">识别文字:</div>
                            <div className="text-xs text-slate-200 bg-slate-700/50 p-2 rounded border border-slate-600/50 max-h-20 overflow-y-auto">
                              {record.ocrResult.full_text}
                            </div>
                          </div>
                        )}
                        {record.ocrResult.detailed_results && record.ocrResult.detailed_results.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs text-slate-400">详细识别列表 ({record.ocrResult.detailed_results.length}个):</div>
                            <div className="space-y-1 max-h-48 overflow-y-auto">
                              {record.ocrResult.detailed_results.map((item: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between p-2 bg-slate-800/70 rounded border border-slate-600/50">
                                  <span className="text-xs text-slate-200 flex-1 mr-2">{item.text}</span>
                                  {item.confidence === 0 ? (
                                    <span className="text-xs font-semibold text-green-400">无数据</span>
                                  ) : (
                                    <span className={`text-xs font-semibold ${item.confidence >= 0.8 ? 'text-green-400' :
                                      item.confidence >= 0.5 ? 'text-yellow-400' :
                                        'text-red-400'
                                      }`}>
                                      {(item.confidence * 100).toFixed(1)}%
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-blue-300 border-b border-blue-500/30 pb-1">OCR检测详情</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="text-slate-400">匹配状态:</div>
                          <div className={`font-medium ${record.matchStatus === 'qualified' ? 'text-green-400' :
                            record.matchStatus === 'unqualified' ? 'text-yellow-400' : 'text-yellow-400'
                            }`}>
                            {record.matchStatus === 'qualified' ? '合格' :
                              record.matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                          </div>
                        </div>
                        {(record.ocrResult?.ai_analysis?.keyword_match_details?.length ?? 0) > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs text-slate-400">关键词匹配状态:</div>
                            <div className="flex flex-wrap gap-1">
                              {record.ocrResult.ai_analysis.keyword_match_details.map((detail: any, index: number) => {
                                const isMatched = detail?.overallMatched ?? false;
                                const keywordLabel = detail?.targetRoi && detail.targetRoi !== 'all'
                                  ? `${detail.keyword} [${detail.targetRoi}]`
                                  : detail.keyword;
                                return (
                                  <span
                                    key={index}
                                    className={`px-2 py-1 text-xs rounded border ${isMatched
                                      ? 'bg-green-600/30 text-green-200 border-green-500/50'
                                      : 'bg-red-600/30 text-red-200 border-red-500/50'
                                      }`}
                                  >
                                    {keywordLabel}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* 二维码/一维条码检测结果 - 所有模式 */}
                    {record.barcodeAnalysis?.enabled && (
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-green-300 border-b border-green-500/30 pb-1">二维码/一维条码检测详情</div>
                        <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                          <div className="text-slate-400">检测状态:</div>
                          <div className={`font-medium ${record.barcodeAnalysis.overall_match ? 'text-green-400' : 'text-red-400'}`}>
                            {record.barcodeAnalysis.overall_match ? '合格' : '存疑'}
                          </div>
                          <div className="text-slate-400">真实解码:</div>
                          <div className="text-slate-300">
                            二维码 {record.barcodeAnalysis.qr_detected_count || 0}，
                            一维条码 {record.barcodeAnalysis.linear_barcode_detected_count || 0}
                          </div>
                          <div className="text-slate-400">OCR兜底:</div>
                          <div className="text-amber-300">{record.barcodeAnalysis.ocr_fallback_count || 0} 条</div>
                        </div>
                        {record.barcodeAnalysis.detection_summary && (
                          <div className="space-y-1">
                            <div className="text-xs text-slate-400">检测摘要:</div>
                            <div className="text-xs text-slate-200 bg-slate-700/50 p-2 rounded border border-slate-600/50">
                              {record.barcodeAnalysis.detection_summary}
                            </div>
                          </div>
                        )}
                        <QRCodeDetectionResult barcodeAnalysis={record.barcodeAnalysis} />
                      </div>
                    )}

                    {/* LLM详细结果 */}
                    {record.aiResult ? (
                      <div className="space-y-3">
                        <div className="text-sm font-medium text-purple-300 border-b border-purple-500/30 pb-1">LLM分析详情</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="text-slate-400">分析结果:</div>
                          <div className={`font-medium ${record.aiResult.overallQuality === '合格' ? 'text-green-400' :
                            isUnqualified(record.aiResult.overallQuality) ? 'text-red-400' : 'text-yellow-400'
                            }`}>
                            {getDisplayQuality(record.aiResult.overallQuality)}
                          </div>
                          <div className="text-slate-400">评分:</div>
                          <div className="text-slate-300 font-medium">{record.aiResult.score} 分</div>
                          {(record.aiResult as any)?.reasonKeywords && (
                            <>
                              <div className="text-slate-400">关键词:</div>
                              <div className="text-slate-300">
                                {Array.isArray((record.aiResult as any).reasonKeywords)
                                  ? (record.aiResult as any).reasonKeywords.join(', ')
                                  : (record.aiResult as any).reasonKeywords}
                              </div>
                            </>
                          )}
                        </div>
                        {record.aiResult.reason && (
                          <div className="space-y-1">
                            <div className="text-xs text-slate-400">分析原因:</div>
                            <div className="text-xs text-slate-200 bg-slate-700/50 p-2 rounded border border-slate-600/50">
                              {record.aiResult.reason}
                            </div>
                          </div>
                        )}
                        {record.aiResult.defects && record.aiResult.defects.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-xs text-slate-400">检测到的缺陷:</div>
                            <div className="space-y-1">
                              {record.aiResult.defects.map((defect: any, idx: number) => (
                                <div key={idx} className="text-xs text-slate-300 bg-red-900/20 p-2 rounded border border-red-500/30">
                                  <div className="font-medium text-red-300">{defect.type}</div>
                                  <div className="text-slate-400">严重程度: {defect.severity}</div>
                                  <div className="text-slate-300">{defect.description}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-purple-300 border-b border-purple-500/30 pb-1">LLM分析详情</div>
                        <div className="text-xs text-slate-400">暂无LLM分析详情</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {ocrResult ? (
          <div className="space-y-4">
            {/* 整体结果状态 */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/50">
              <div className="flex items-center gap-2">
                {ocrResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-400" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-400" />
                )}
                <span className={ocrResult.success ? 'text-green-400' : 'text-red-400'}>
                  {ocrResult.success ? '识别成功' : '识别失败'}
                </span>
              </div>
              {ocrResult.success && (
                <div className="text-sm text-slate-400 space-y-1">
                  <div>{ocrResult.text_count} 个文字</div>
                  {ocrResult.model_used && (
                    <div>使用模型: {ocrResult.model_used}</div>
                  )}
                </div>
              )}
            </div>

            {/* LLM分析结果 */}
            {fusionModeEnabled && aiAnalysisResult && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">LLM分析结果:</Label>
                <div className="p-3 bg-purple-900/20 border border-purple-500/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {aiAnalysisResult.overallQuality === '合格' ? (
                        <CheckCircle className="h-4 w-4 text-green-400" />
                      ) : isUnqualified(aiAnalysisResult.overallQuality) ? (
                        <XCircle className="h-4 w-4 text-red-400" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                      )}
                      <span className={`text-sm font-medium ${aiAnalysisResult.overallQuality === '合格' ? 'text-green-400' :
                        isUnqualified(aiAnalysisResult.overallQuality) ? 'text-red-400' : 'text-amber-400'
                        }`}>
                        {getDisplayQuality(aiAnalysisResult.overallQuality)}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      评分: {aiAnalysisResult.score}
                    </div>
                  </div>
                  <div className="text-xs text-slate-300">
                    原因: {aiAnalysisResult.reason}
                  </div>
                  {formatReasonKeywords(aiAnalysisResult.reasonKeywords) && (
                    <div className="text-xs text-slate-400 mt-1">
                      关键词: {formatReasonKeywords(aiAnalysisResult.reasonKeywords)}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 完整文本 */}
            {ocrResult.validationWarnings?.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">判定提示:</Label>
                <div className="space-y-2">
                  {ocrResult.validationWarnings.map((warning: string, index: number) => (
                    <div key={index} className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-lg text-sm text-amber-100">
                      {warning}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {ocrResult.success && ocrResult.full_text && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">完整文本:</Label>
                <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <p className="text-sm text-slate-300 whitespace-pre-wrap">
                    {ocrResult.full_text}
                  </p>
                </div>
              </div>
            )}

            {/* 文字方向检测结果（全局） - 已不使用全局期望方向，仅展示检测方向 */}
            {ocrResult.success && (ocrResult.detected_orientation !== undefined) && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">文字方向检测:</Label>
                <div className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                  <div className="space-y-2">
                    {/* 检测到的方向 */}
                    {ocrResult.detected_orientation !== undefined && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-300">检测方向:</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-blue-400">
                            {ocrResult.detected_orientation}°
                          </span>
                          {ocrResult.detected_orientation_degrees !== undefined && ocrResult.detected_orientation_degrees !== null && (
                            <span className="text-xs text-slate-500">
                              (实际: {ocrResult.detected_orientation_degrees.toFixed(1)}°)
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {/* 说明 */}
                    <div className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-600/50">
                      💡 关键词可单独配置方向要求，匹配状态见下方"关键词匹配状态"
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 详细结果 */}
            {ocrResult.success && ocrResult.detailed_results.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">详细结果:</Label>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {ocrResult.detailed_results.map((item: any, index: number) => (
                    <div key={index} className="p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-300">
                          {index + 1}. {item.text}
                        </span>
                        <div className="flex items-center gap-2">
                          {item.confidence === 0 ? (
                            <span className="text-sm font-medium text-green-400">无数据</span>
                          ) : (
                            <>
                              {getConfidenceIcon(item.confidence)}
                              <span className={`text-sm font-medium ${getConfidenceColor(item.confidence)}`}>
                                {(item.confidence * 100).toFixed(1)}%
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-slate-400">
                        位置: {JSON.stringify(item.bbox)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ROI 详细状态 */}
            {(ocrResult as any).batch_processing?.roi_details?.length > 0 && (
              <ROIStatusCard
                roiDetails={(ocrResult as any).batch_processing.roi_details}
                getTargetChineseName={getTargetChineseName}
              />
            )}

            {/* 错误信息 */}
            {!ocrResult.success && ocrResult.error && (
              <div className="p-3 bg-red-900/20 border border-red-500/50 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-4 w-4 text-red-400" />
                  <span className="text-sm font-medium text-red-400">错误信息:</span>
                </div>
                <p className="text-sm text-red-300">{ocrResult.error}</p>
              </div>
            )}

            {/* 导出按钮 */}
            {ocrResult.success && (
              <Button
                variant="outline"
                onClick={exportResults}
                className="w-full"
              >
                <Download className="mr-2 h-4 w-4" />
                导出结果
              </Button>
            )}
          </div>
        ) : workflowState === 'processing' && !fusionModeEnabled && (
          <div className="text-center py-12">
            <div className="flex flex-col items-center justify-center gap-4">
              <div className="relative">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500/30 border-t-blue-500"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-blue-400" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium text-blue-400">识别中...</p>
                <p className="text-sm text-slate-400">正在处理图像，请稍候</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* 图片预览模态框 */}
      <ImagePreviewModal
        imageUrl={previewImage || ''}
        isOpen={showPreviewModal && !!previewImage}
        onClose={() => {
          setShowPreviewModal(false);
          setPreviewImage(null);
        }}
        alt="检测图片预览"
      />
    </Card>
  );
};
