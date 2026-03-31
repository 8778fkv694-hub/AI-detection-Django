import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/state/appStore';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, MapPin, Eye, EyeOff, FileText, Brain, Settings } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import AnnotatedImage from '@/components/AnnotatedImage';
import type { InspectionResult, Standard } from '@/types';

const UNQUALIFIED_CN = '\u4e0d\u5408\u683c';
const getDisplayQuality = (quality?: string) => (quality === UNQUALIFIED_CN ? '存疑' : quality);
const isUnqualified = (quality?: string) => quality === UNQUALIFIED_CN || quality === '存疑';
const formatReasonKeywords = (reasonKeywords?: string | string[]) => {
  if (!reasonKeywords) return null;
  return Array.isArray(reasonKeywords) ? reasonKeywords.join(', ') : reasonKeywords;
};
const getBarcodeAnalysis = (result: InspectionResult) => result.ocrResult?.barcode_analysis || result.barcodeResult;
const getOcrMatchDisplay = (ocrResult?: InspectionResult['ocrResult']) => {
  if (!ocrResult) return { label: '无数据', className: 'text-amber-400' };
  if (ocrResult.success === false) return { label: '失败', className: 'text-red-400' };
  if (ocrResult.matchStatus === 'qualified') return { label: '合格', className: 'text-green-400' };
  if (ocrResult.matchStatus === 'unqualified') return { label: '存疑', className: 'text-red-400' };
  return { label: '无匹配', className: 'text-amber-400' };
};

const ResultDetailScreen: React.FC = () => {
  const { resultId } = useParams<{ resultId: string }>();
  const navigate = useNavigate();
  const { results, standards, fetchStandards } = useAppStore();
  const [result, setResult] = useState<InspectionResult | null>(null);
  const [standard, setStandard] = useState<Standard | null>(null);
  const [showAreas, setShowAreas] = useState(true);
  const [showDefects, setShowDefects] = useState(true);

  // 加载标准数据
  useEffect(() => {
    fetchStandards().catch(console.error);
  }, [fetchStandards]);

  useEffect(() => {
    if (resultId) {
      const foundResult = results.find(r => r.id === resultId);
      if (foundResult) {
        console.log('🔍 找到检测结果:', foundResult);
        console.log('🔍 结果中的standardId:', foundResult.standardId);
        console.log('🔍 可用的标准列表:', standards.map(s => ({ id: s.id, name: s.name })));
        console.log('🔍 检测类型:', foundResult.detectionType);

        setResult(foundResult);
        if (foundResult.standardId) {
          const foundStandard = standards.find(s => s.id === foundResult.standardId);
          console.log('🔍 找到的标准:', foundStandard);
          setStandard(foundStandard || null);
        } else {
          console.log('🔍 检测结果中没有standardId');
          setStandard(null);
        }
      } else {
        console.log('🔍 未找到检测结果，ID:', resultId);
      }
    }
  }, [resultId, results, standards]);

  if (!result) {
    return (
      <div className="text-center py-16">
        <p className="text-slate-500">结果未找到</p>
        <Button onClick={() => navigate('/results')} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          返回结果列表
        </Button>
      </div>
    );
  }

  const getStatusInfo = (quality: string) => {
    switch (quality) {
      case '合格': return { icon: CheckCircle2, color: 'text-green-400', bgColor: 'bg-green-400/10' };
      case '存疑':
      case UNQUALIFIED_CN:
        return { icon: XCircle, color: 'text-red-400', bgColor: 'bg-red-400/10' };
      default: return { icon: AlertCircle, color: 'text-amber-400', bgColor: 'bg-amber-400/10' };
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case '严重': return 'bg-red-500 text-white';
      case '中等': return 'bg-yellow-500 text-white';
      case '轻微': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const currentOcrResult = result.ocrResult;
  const ocrMatchDisplay = currentOcrResult ? getOcrMatchDisplay(currentOcrResult) : null;

  return (
    <div className="space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/results')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回
          </Button>
          <h1 className="text-2xl font-bold">检测结果详情</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAreas(!showAreas)}
          >
            {showAreas ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showAreas ? '隐藏' : '显示'}ROI区域
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDefects(!showDefects)}
          >
            {showDefects ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {showDefects ? '隐藏' : '显示'}缺陷
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：图片和标注 */}
        <Card>
          <CardHeader>
            <CardTitle>检测图片</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative w-full h-96">
              <AnnotatedImage
                imageUrl={result.image && result.image.startsWith('data:') ? result.image : result.image ? `data:image/jpeg;base64,${result.image}` : ''}
                defects={result.defects}
                inspectionAreas={standard?.inspectionAreas}
                showAreas={showAreas}
                showDefects={showDefects}
              />
            </div>
          </CardContent>
        </Card>

        {/* 右侧：检测结果 */}
        <div className="space-y-6">
          {/* 基本结果 */}
          <Card>
            <CardHeader>
              <CardTitle>检测结果</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">检测时间</span>
                <span className="font-medium">{format(new Date(result.timestamp), 'yyyy-MM-dd HH:mm:ss')}</span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">检测标准</span>
                <div className="flex items-center gap-2">
                  {standard ? (
                    <>
                      <MapPin className="w-4 h-4" />
                      <span className="font-medium">{standard.name}</span>
                    </>
                  ) : result.standardId ? (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-400">标准ID: {result.standardId}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-400">
                        {result.standardId ? `标准ID: ${result.standardId}` :
                          result.detectionType === 'ocr_fusion_inspection' ? 'OCR融合检测 (未指定标准)' :
                            result.detectionType === 'ocr_inspection' ? 'OCR检测 (未指定标准)' :
                              result.detectionType === 'cleanroom_ppe' ? '洁净用品检测' :
                                result.detectionType === 'standard_inspection' ? '标准检测 (未指定标准)' :
                                  result.detectionType === 'general_quality' ? '通用质量检测' :
                                    '未指定标准'}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">质量评级</span>
                <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full", getStatusInfo(result.overallQuality).bgColor)}>
                  {React.createElement(getStatusInfo(result.overallQuality).icon, { className: "h-4 w-4" })}
                  <span className={cn("font-medium", getStatusInfo(result.overallQuality).color)}>
                    {getDisplayQuality(result.overallQuality)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">评分</span>
                <span className="text-2xl font-bold">{result.score}分</span>
              </div>

              <div className="pt-4 border-t">
                <span className="text-sm text-slate-500">检测原因</span>
                <div className="mt-2 space-y-3">
                  {result.detectionType === 'ocr_fusion_inspection' && result.ocrResult && result.llmResult ? (
                    <div className="space-y-4">
                      {/* 总结行 */}
                      <div className="text-sm text-slate-300">
                        OCR: {ocrMatchDisplay?.label} |
                        LLM: {getDisplayQuality(result.llmResult.overallQuality)}
                      </div>

                      {/* OCR检测结果 */}
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-blue-300">OCR检测结果</div>
                        <div className="text-sm text-slate-300">
                          状态: {ocrMatchDisplay?.label}
                        </div>
                        {result.ocrResult.full_text && (
                          <div className="text-sm text-slate-300">
                            识别文字: {result.ocrResult.full_text}
                          </div>
                        )}
                        {result.ocrResult.text_count && (
                          <div className="text-sm text-slate-300">
                            文字数量: {result.ocrResult.text_count} 个
                          </div>
                        )}
                      </div>

                      {/* LLM分析结果 */}
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-purple-300">LLM分析结果</div>
                        <div className="text-sm text-slate-300">
                          状态: {getDisplayQuality(result.llmResult.overallQuality)}
                        </div>
                        <div className="text-sm text-slate-300">
                          评分: {result.llmResult.score} 分
                        </div>
                        {result.llmResult.reason && (
                          <div className="text-sm text-slate-300">
                            原因: {result.llmResult.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : result.detectionType === 'ocr_inspection' && result.ocrResult ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">OCR检测:</span>
                      <span className={`text-sm font-medium ${result.ocrResult.matchStatus === 'qualified' ? 'text-green-400' : 'text-red-400'
                        }`}>
                        {result.ocrResult.matchStatus === 'qualified' ? '合格' : '存疑'}
                      </span>
                      {result.ocrResult.full_text && (
                        <span className="text-xs text-slate-500">
                          ({result.ocrResult.full_text.length > 50 ?
                            result.ocrResult.full_text.substring(0, 50) + '...' :
                            result.ocrResult.full_text})
                        </span>
                      )}
                    </div>
                  ) : result.detectionType === 'ocr_fusion_inspection' && result.reason.includes('OCR检测:') && result.reason.includes('LLM分析:') ? (
                    // 兼容旧格式的融合检测结果
                    <div className="space-y-2">
                      {(() => {
                        // 支持两种格式：用 | 分隔的格式和换行分隔的格式
                        let reasonParts;
                        if (result.reason.includes(' | ')) {
                          reasonParts = result.reason.split(' | ');
                        } else {
                          reasonParts = result.reason.split('\n').filter(part => part.trim());
                        }
                        const ocrPart = reasonParts.find(part => part.includes('OCR检测:'));
                        const llmPart = reasonParts.find(part => part.includes('LLM分析:'));

                        return (
                          <>
                            {ocrPart && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">OCR检测:</span>
                                <span className={`text-sm font-medium ${ocrPart.includes('合格') && !ocrPart.includes('存疑') ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                  {ocrPart.includes('合格') && !ocrPart.includes('存疑') ? '合格' : '存疑'}
                                </span>
                                {ocrPart.includes('(') && ocrPart.includes(')') && (
                                  <span className="text-xs text-slate-500">
                                    {ocrPart.substring(ocrPart.indexOf('(') + 1, ocrPart.lastIndexOf(')'))}
                                  </span>
                                )}
                              </div>
                            )}
                            {llmPart && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-slate-400">LLM分析:</span>
                                <span className={`text-sm font-medium ${llmPart.includes('合格') && !llmPart.includes('存疑') ? 'text-green-400' : 'text-red-400'
                                  }`}>
                                  {llmPart.includes('合格') && !llmPart.includes('存疑') ? '合格' : '存疑'}
                                </span>
                                {llmPart.includes('(') && llmPart.includes(')') && (
                                  <span className="text-xs text-slate-500">
                                    {llmPart.substring(llmPart.indexOf('(') + 1, llmPart.lastIndexOf(')'))}
                                  </span>
                                )}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  ) : result.detectionType === 'ocr_inspection' && result.reason.includes('OCR检测:') ? (
                    // 兼容旧格式的单独OCR检测结果
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">OCR检测:</span>
                      <span className={`text-sm font-medium ${result.reason.includes('合格') && !result.reason.includes('存疑') ? 'text-green-400' : 'text-red-400'
                        }`}>
                        {result.reason.includes('合格') && !result.reason.includes('存疑') ? '合格' : '存疑'}
                      </span>
                      {result.reason.includes('(') && result.reason.includes(')') && (
                        <span className="text-xs text-slate-500">
                          {result.reason.substring(result.reason.indexOf('(') + 1, result.reason.lastIndexOf(')'))}
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm">{result.reason}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ROI区域信息 */}
          {standard?.inspectionAreas && standard.inspectionAreas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>ROI检测区域 ({standard.inspectionAreas.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {standard.inspectionAreas.map((area) => (
                    <div key={area.id} className="flex items-center gap-3 p-3 border rounded-lg">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: area.color }}
                      />
                      <div className="flex-1">
                        <div className="font-medium">{area.name}</div>
                        {area.description && (
                          <div className="text-sm text-slate-500">{area.description}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* OCR检测结果 */}
          {currentOcrResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-400" />
                  OCR检测结果
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">OCR状态</span>
                  <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full",
                    currentOcrResult.success === false ? 'bg-red-400/10' :
                      currentOcrResult.matchStatus === 'qualified' ? 'bg-green-400/10' :
                        currentOcrResult.matchStatus === 'unqualified' ? 'bg-red-400/10' : 'bg-amber-400/10'
                  )}>
                    {currentOcrResult.success === false ? (
                      <XCircle className="h-4 w-4 text-red-400" />
                    ) : currentOcrResult.matchStatus === 'qualified' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                    ) : currentOcrResult.matchStatus === 'unqualified' ? (
                      <XCircle className="h-4 w-4 text-red-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-400" />
                    )}
                    <span className={cn("font-medium",
                      currentOcrResult.success === false ? 'text-red-400' :
                        currentOcrResult.matchStatus === 'qualified' ? 'text-green-400' :
                          currentOcrResult.matchStatus === 'unqualified' ? 'text-red-400' : 'text-amber-400'
                    )}>
                      {ocrMatchDisplay?.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">OCR执行</span>
                  <span className={cn("font-medium", currentOcrResult.success ? 'text-green-400' : 'text-red-400')}>
                    {currentOcrResult.success ? '成功' : '失败'}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">识别文字</span>
                  <span className="font-medium">{currentOcrResult.text_count || 0} 个</span>
                </div>

                {currentOcrResult.full_text && (
                  <div className="pt-4 border-t">
                    <span className="text-sm text-slate-500">完整文本</span>
                    <div className="mt-2 p-3 bg-slate-800/50 rounded-lg">
                      <p className="text-sm text-slate-300 whitespace-pre-wrap">
                        {currentOcrResult.full_text}
                      </p>
                    </div>
                  </div>
                )}

                {currentOcrResult.detailed_results && currentOcrResult.detailed_results.length > 0 && (
                  <div className="pt-4 border-t">
                    <span className="text-sm text-slate-500">详细结果 ({currentOcrResult.detailed_results.length})</span>
                    <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                      {currentOcrResult.detailed_results.map((item: any, index: number) => (
                        <div key={index} className="p-2 bg-slate-800/30 rounded text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-300">{item.text}</span>
                            {item.confidence === 0 ? (
                              <span className="text-green-400">无数据</span>
                            ) : (
                              <span className="text-slate-400">{(item.confidence * 100).toFixed(1)}%</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!currentOcrResult.success && currentOcrResult.error && (
                  <div className="pt-4 border-t">
                    <span className="text-sm text-slate-500">错误信息</span>
                    <div className="mt-2 p-3 bg-red-900/20 rounded-lg">
                      <p className="text-sm text-red-300">{currentOcrResult.error}</p>
                    </div>
                  </div>
                )}

                {/* 二维码检测结果 */}
                {getBarcodeAnalysis(result)?.enabled && (
                  <div className="pt-4 border-t">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="h-4 w-4 bg-green-400 rounded flex items-center justify-center">
                        <span className="text-xs text-slate-900 font-bold">码</span>
                      </div>
                      <span className="text-sm text-slate-500">二维码检测结果</span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">检测状态</span>
                        <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full",
                          getBarcodeAnalysis(result)?.overall_match ? 'bg-green-400/10' : 'bg-red-400/10'
                        )}>
                          {getBarcodeAnalysis(result)?.overall_match ? (
                            <CheckCircle2 className="h-4 w-4 text-green-400" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-400" />
                          )}
                          <span className={cn("font-medium",
                            getBarcodeAnalysis(result)?.overall_match ? 'text-green-400' : 'text-red-400'
                          )}>
                            {getBarcodeAnalysis(result)?.overall_match ? '合格' : '存疑'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-500">检测到的二维码数量</span>
                        <span className="font-medium">{getBarcodeAnalysis(result)?.total_qr_codes_detected || 0} 个</span>
                      </div>

                      {getBarcodeAnalysis(result)?.detection_summary && (
                        <div>
                          <span className="text-sm text-slate-500">检测摘要</span>
                          <p className="mt-1 text-sm text-slate-300">{getBarcodeAnalysis(result)?.detection_summary}</p>
                        </div>
                      )}

                      {getBarcodeAnalysis(result)?.results && getBarcodeAnalysis(result)!.results.length > 0 && (
                        <div>
                          <span className="text-sm text-slate-500">检测详情 ({getBarcodeAnalysis(result)!.results.length})</span>
                          <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                            {getBarcodeAnalysis(result)!.results.map((item: any, index: number) => (
                              <div key={index} className="p-2 bg-slate-800/30 rounded text-xs">
                                <div className="flex justify-between items-center">
                                  <div className="flex-1">
                                    <span className="text-slate-300">#{index + 1}: {item.qrCodeData || item.data}</span>
                                    <div className="text-slate-400 mt-1">
                                      类型: {item.type} | 置信度: {(item.confidence * 100).toFixed(1)}%
                                    </div>
                                  </div>
                                  <span className={cn("text-xs font-semibold px-2 py-1 rounded",
                                    item.matched ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20'
                                  )}>
                                    {item.matched ? '匹配' : '未匹配'}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* LLM分析结果 */}
          {result.detectionType === 'ocr_fusion_inspection' && (result as any).llmResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-purple-400" />
                  LLM分析结果
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">LLM状态</span>
                  <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full",
                    (result as any).llmResult.overallQuality === '合格' ? 'bg-green-400/10' :
                      isUnqualified((result as any).llmResult.overallQuality) ? 'bg-red-400/10' : 'bg-amber-400/10'
                  )}>
                    {(result as any).llmResult.overallQuality === '合格' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                    ) : isUnqualified((result as any).llmResult.overallQuality) ? (
                      <XCircle className="h-4 w-4 text-red-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-400" />
                    )}
                    <span className={cn("font-medium",
                      (result as any).llmResult.overallQuality === '合格' ? 'text-green-400' :
                        isUnqualified((result as any).llmResult.overallQuality) ? 'text-red-400' : 'text-amber-400'
                    )}>
                      {getDisplayQuality((result as any).llmResult.overallQuality)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">LLM评分</span>
                  <span className="text-xl font-bold">{(result as any).llmResult.score}分</span>
                </div>

                <div className="pt-4 border-t">
                  <span className="text-sm text-slate-500">LLM分析原因</span>
                  <p className="mt-2 text-sm text-slate-300">{(result as any).llmResult.reason}</p>
                </div>

                {formatReasonKeywords((result as any).llmResult.reasonKeywords) && (
                  <div className="pt-4 border-t">
                    <span className="text-sm text-slate-500">关键词</span>
                    <p className="mt-2 text-sm text-slate-300">{formatReasonKeywords((result as any).llmResult.reasonKeywords)}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* 综合判断结果 */}
          {result.detectionType === 'ocr_fusion_inspection' && (result as any).ocrResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-orange-400" />
                  综合判断
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">最终结果</span>
                  <div className={cn("flex items-center gap-2 px-3 py-1 rounded-full",
                    result.overallQuality === '合格' ? 'bg-green-400/10' :
                      isUnqualified(result.overallQuality) ? 'bg-red-400/10' : 'bg-amber-400/10'
                  )}>
                    {result.overallQuality === '合格' ? (
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                    ) : isUnqualified(result.overallQuality) ? (
                      <XCircle className="h-4 w-4 text-red-400" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-amber-400" />
                    )}
                    <span className={cn("font-medium",
                      result.overallQuality === '合格' ? 'text-green-400' :
                        isUnqualified(result.overallQuality) ? 'text-red-400' : 'text-amber-400'
                    )}>
                      {getDisplayQuality(result.overallQuality)}
                    </span>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <span className="text-sm text-slate-500">判断依据</span>
                  <p className="mt-2 text-sm text-slate-300">
                    OCR检测: {ocrMatchDisplay?.label} |
                    LLM分析: {(result as any).llmResult ? getDisplayQuality((result as any).llmResult.overallQuality) : getDisplayQuality(result.overallQuality)}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    💡 只有OCR和LLM都合格才算最终合格
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 缺陷信息 */}
          {result.defects && result.defects.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>检测到的缺陷 ({result.defects.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {result.defects.map((defect, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                      <Badge className={getSeverityColor(defect.severity || '一般')}>
                        {defect.severity}
                      </Badge>
                      <div className="flex-1">
                        <div className="font-medium">{defect.type}</div>
                        <div className="text-sm text-slate-500">{defect.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResultDetailScreen;
