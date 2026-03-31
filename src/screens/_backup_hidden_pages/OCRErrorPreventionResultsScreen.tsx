import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Trash2, Eye, Download, FileText, Brain, X, Percent } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/state/appStore';
import type { InspectionResult } from '@/types';

// --- 新增的UI组件 ---

// 结果状态图标组件
const ResultStatusIcon: React.FC<{ quality?: '合格' | '存疑' | '需复检' | '存疑' }> = ({ quality }) => {
  if (quality === '合格') return <CheckCircle2 className="h-4 w-4 text-green-400" />;
  if (quality === '存疑') return <XCircle className="h-4 w-4 text-red-400" />;
  return <AlertCircle className="h-4 w-4 text-amber-400" />;
};

// 结果状态徽章组件
const ResultStatusBadge: React.FC<{ quality?: '合格' | '存疑' | '需复检' | '存疑' }> = ({ quality }) => (
  <Badge
    variant="outline"
    className={cn(
      "text-xs font-semibold",
      quality === '合格' ? 'border-green-400/50 text-green-400' :
      quality === '存疑' ? 'border-red-400/50 text-red-400' :
      'border-amber-400/50 text-amber-400'
    )}
  >
    {quality || '未知'}
  </Badge>
);

// 详情面板中的信息行组件
const InfoRow: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={cn("flex justify-between items-center text-sm", className)}>
    <span className="text-slate-400">{label}:</span>
    <span className="text-slate-200 font-medium text-right">{children}</span>
  </div>
);

// --- 主屏幕组件 ---

const OCRErrorPreventionResultsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { results, fetchResults, deleteResult } = useAppStore();
  const [filteredResults, setFilteredResults] = useState<InspectionResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<InspectionResult | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    // 过滤出OCR防呆检测的结果：通过reasonKeywords包含'防呆'或detectionType为特定类型
    const errorPreventionResults = results
      .filter(result => {
        const reasonKeywords = result.reasonKeywords || '';
        const reason = result.reason || '';
        // 检查是否包含防呆相关关键词，或者检测类型为ocr_error_prevention
        return (
          result.detectionType === 'ocr_error_prevention' ||
          reasonKeywords.includes('防呆') ||
          reason.includes('防呆检测') ||
          (result.detectionType === 'ocr_inspection' && reasonKeywords.includes('防呆'))
        );
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // 按时间倒序排序
    setFilteredResults(errorPreventionResults);
  }, [results]);

  // 单条记录删除
  const handleDeleteResult = async (resultId: string) => {
    if (window.confirm('确定要删除这条检测记录吗？\n\n此操作不可恢复！')) {
      try {
        setIsDeleting(resultId);
        await deleteResult(resultId);
        
        // 从本地状态中移除
        setFilteredResults(prev => prev.filter(result => result.id !== resultId));
        
        // 如果删除的是当前选中的结果，关闭详情面板
        if (selectedResult?.id === resultId) {
          setSelectedResult(null);
        }
        
        alert('记录删除成功！');
      } catch (error) {
        console.error('删除记录失败:', error);
        alert('删除记录失败，请重试');
      } finally {
        setIsDeleting(null);
      }
    }
  };

  // 全部清除OCR防呆检测结果
  const handleClearResults = async () => {
    if (filteredResults.length === 0) return;
    
    const confirmMessage = `确定要永久删除所有 ${filteredResults.length} 条OCR防呆检测结果吗？\n\n此操作不可恢复！`;
    
    if (window.confirm(confirmMessage)) {
      try {
        // 删除所有防呆检测结果
        for (const result of filteredResults) {
          await deleteResult(result.id);
        }
        
        setFilteredResults([]);
        setSelectedResult(null);
        
        alert(`已成功清除 ${filteredResults.length} 条OCR防呆检测结果！`);
      } catch (error) {
        console.error('清除结果失败:', error);
        alert('清除结果失败，请重试');
      }
    }
  };
  
  const handleViewDetail = (result: InspectionResult) => {
    setSelectedResult(result);
  };
  
  const handleCloseDetail = useCallback(() => {
    setSelectedResult(null);
  }, []);

  // 监听ESC键关闭详情面板
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseDetail();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleCloseDetail]);

  const handleExportResults = () => {
    if (filteredResults.length === 0) {
      alert('没有结果可以导出');
      return;
    }
    const escapeCsvField = (value: any): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csvHeaders = ['ID', '时间', '检测类型', '综合结果', '综合评分', '综合原因', '标准ID', '缺陷数量', 'OCR详细结果 (JSON)', 'LLM详细结果 (JSON)'];
    const csvContent = [
      csvHeaders.join(','),
      ...filteredResults.map(result => [
        result.id,
        format(new Date(result.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        result.detectionType || 'unknown',
        result.overallQuality || '未知',
        result.score ?? '',
        escapeCsvField(result.reason || ''),
        result.standardId || '',
        result.defects?.length || 0,
        escapeCsvField(result.ocrResult ? JSON.stringify(result.ocrResult) : ''),
        escapeCsvField(result.llmResult ? JSON.stringify(result.llmResult) : '')
      ].join(','))
    ].join('\n');
    try {
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `OCR防呆检测结果_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      alert(`成功导出 ${filteredResults.length} 条OCR防呆检测结果！`);
    } catch (error) {
      console.error('导出CSV失败:', error);
      alert('导出失败，请重试');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-6 lg:p-8">
      <div className="max-w-screen-2xl mx-auto">
        {/* 头部 */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/ocr-error-prevention')} className="text-slate-400 hover:text-white hover:bg-slate-700">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">OCR 防呆检测结果</h1>
              <p className="text-sm text-slate-400 mt-1">共 {filteredResults.length} 条记录</p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <Button variant="outline" size="sm" onClick={handleExportResults} disabled={filteredResults.length === 0} className="border-blue-500/50 text-blue-300 hover:bg-blue-500/10 hover:text-blue-200">
              <Download className="h-4 w-4 mr-2" />导出
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClearResults} disabled={filteredResults.length === 0}>
              <Trash2 className="h-4 w-4 mr-2" />清空
            </Button>
          </div>
        </header>

        {/* 统计信息 */}
        {filteredResults.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="总检测数" value={filteredResults.length} icon={<FileText className="text-slate-400" />} />
            <StatCard title="合格数" value={filteredResults.filter(r => r.overallQuality === '合格').length} icon={<CheckCircle2 className="text-green-400" />} valueClassName="text-green-400" />
            <StatCard title="存疑数" value={filteredResults.filter(r => r.overallQuality === '存疑').length} icon={<XCircle className="text-red-400" />} valueClassName="text-red-400" />
            <StatCard title="合格率" value={`${filteredResults.length > 0 ? Math.round((filteredResults.filter(r => r.overallQuality === '合格').length / filteredResults.length) * 100) : 0}%`} icon={<Percent className="text-green-400" />} valueClassName="text-green-400" />
          </div>
        )}

        {/* 结果列表 */}
        <main>
          {filteredResults.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
              {filteredResults.map((result) => (
                <ResultCard 
                  key={result.id} 
                  result={result} 
                  onSelect={handleViewDetail}
                  onDelete={handleDeleteResult}
                  isDeleting={isDeleting === result.id}
                />
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </main>
      </div>
      
      {/* 详情抽屉面板 */}
      <DetailPanel 
        result={selectedResult} 
        onClose={handleCloseDetail}
        onDelete={handleDeleteResult}
        isDeleting={isDeleting === selectedResult?.id}
      />
    </div>
  );
};

// --- 子组件 ---

const StatCard: React.FC<{ title: string; value: string | number; icon: React.ReactNode; valueClassName?: string }> = ({ title, value, icon, valueClassName }) => (
  <Card className="bg-slate-800/50 border-slate-700">
    <CardContent className="p-4 flex items-center justify-between">
      <div>
        <p className="text-sm text-slate-400">{title}</p>
        <p className={cn("text-2xl font-bold mt-1", valueClassName)}>{value}</p>
      </div>
      <div className="w-8 h-8">{icon}</div>
    </CardContent>
  </Card>
);

const ResultCard: React.FC<{ 
  result: InspectionResult; 
  onSelect: (result: InspectionResult) => void;
  onDelete: (resultId: string) => void;
  isDeleting?: boolean;
}> = ({ result, onSelect, onDelete, isDeleting = false }) => (
  <Card className="bg-slate-800/50 border-slate-700 overflow-hidden group transition-all duration-300 hover:border-slate-500 hover:shadow-lg hover:shadow-slate-900/50">
    <CardHeader className="p-3 border-b border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{format(new Date(result.timestamp), 'MM-dd HH:mm:ss')}</span>
        <div className="flex items-center gap-2">
          <ResultStatusIcon quality={result.overallQuality} />
          <ResultStatusBadge quality={result.overallQuality} />
        </div>
      </div>
    </CardHeader>
    <CardContent className="p-0">
      <div className="aspect-square bg-slate-900/50 flex items-center justify-center relative overflow-hidden">
        {result.image ? (
          <img src={result.image.startsWith('data:') ? result.image : `data:image/jpeg;base64,${result.image}`} alt="检测图片" className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105" />
        ) : (
          <FileText className="h-16 w-16 text-slate-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
        <div className="absolute bottom-2 left-2 flex items-center gap-2">
          <Badge variant="secondary" className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs">
            <AlertCircle className="h-3 w-3 mr-1"/>
            防呆检测
          </Badge>
        </div>
      </div>
    </CardContent>
    <div className="p-3 bg-slate-800">
      <p className="text-xs text-slate-400 truncate mb-1">识别摘要: {result.ocrResult?.full_text || '无文字'}</p>
      <div className="flex gap-2 mt-2">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onSelect(result)} 
          className="flex-1 text-slate-300 border-slate-600 hover:bg-slate-700 hover:text-white"
        >
          <Eye className="h-4 w-4 mr-2" />查看详情
        </Button>
        <Button 
          variant="destructive" 
          size="sm" 
          onClick={() => onDelete(result.id)}
          disabled={isDeleting}
          className="px-3 text-red-300 border-red-600 hover:bg-red-700 hover:text-white"
        >
          {isDeleting ? (
            <div className="h-4 w-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  </Card>
);

const DetailPanel: React.FC<{ 
  result: InspectionResult | null; 
  onClose: () => void;
  onDelete: (resultId: string) => void;
  isDeleting?: boolean;
}> = ({ result, onClose, onDelete, isDeleting = false }) => (
  <>
    {/* 遮罩 */}
    <div
      className={cn(
        "fixed inset-0 bg-black/60 z-40 transition-opacity duration-300",
        result ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
      onClick={onClose}
    />
    {/* 面板 */}
    <aside
      className={cn(
        "fixed top-0 right-0 h-full w-full max-w-lg bg-slate-800/95 backdrop-blur-sm border-l border-slate-700 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out",
        result ? "translate-x-0" : "translate-x-full"
      )}
    >
      {result && (
        <div className="h-full flex flex-col">
          <header className="flex items-center justify-between p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">检测详情</h2>
            <div className="flex items-center gap-2">
              <Button 
                variant="destructive" 
                size="sm" 
                onClick={() => result && onDelete(result.id)}
                disabled={isDeleting}
                className="text-red-300 border-red-600 hover:bg-red-700 hover:text-white"
              >
                {isDeleting ? (
                  <div className="h-4 w-4 border-2 border-red-300 border-t-transparent rounded-full animate-spin mr-2" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                删除
              </Button>
              <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-400 hover:text-white hover:bg-slate-700">
                <X className="h-5 w-5" />
              </Button>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 图片 */}
            <div className="aspect-video bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center">
              {result.image ? <img src={result.image.startsWith('data:') ? result.image : `data:image/jpeg;base64,${result.image}`} alt="检测图片" className="w-full h-full object-contain" /> : <FileText className="h-20 w-20 text-slate-700" />}
            </div>

            {/* 综合评估 */}
            <section>
              <h3 className="text-base font-semibold text-white mb-3">综合评估</h3>
              <div className="p-4 bg-slate-900/50 rounded-lg space-y-3">
                <InfoRow label="检测时间">{format(new Date(result.timestamp), 'yyyy-MM-dd HH:mm:ss')}</InfoRow>
                <InfoRow label="检测类型">
                  <Badge variant="secondary" className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs">
                    <AlertCircle className="h-3 w-3 mr-1"/>
                    OCR防呆检测
                  </Badge>
                </InfoRow>
                <InfoRow label="检测结果">
                  <div className="flex items-center gap-2">
                    <ResultStatusIcon quality={result.overallQuality} />
                    <ResultStatusBadge quality={result.overallQuality} />
                  </div>
                </InfoRow>
                <InfoRow label="综合评分">{result.score}分</InfoRow>
                <div className="text-sm text-slate-300 bg-slate-700/50 p-3 rounded-md mt-2">
                  <span className="text-slate-400 mr-2">原因:</span>
                  {result.reason}
                </div>
              </div>
            </section>

            {/* OCR分析 */}
            {result.ocrResult && (
              <section>
                <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2"><FileText className="h-5 w-5 text-blue-300" />OCR 分析</h3>
                <div className="p-4 bg-slate-900/50 rounded-lg space-y-4">
                  <InfoRow label="匹配状态">
                    <span className={cn('font-semibold', result.ocrResult.matchStatus === 'qualified' ? 'text-green-400' : result.ocrResult.matchStatus === 'unqualified' ? 'text-red-400' : 'text-amber-400' )}>
                      {result.ocrResult.matchStatus === 'qualified' ? '合格' : result.ocrResult.matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                    </span>
                  </InfoRow>
                  <InfoRow label="识别文字数">{result.ocrResult.text_count || 0} 个</InfoRow>
                  <div>
                    <p className="text-sm text-slate-400 mb-2">识别全文:</p>
                    <p className="text-sm text-slate-200 bg-slate-700/50 p-3 rounded-md max-h-24 overflow-y-auto">{result.ocrResult.full_text || '无'}</p>
                  </div>
                  {result.ocrResult.detailed_results && result.ocrResult.detailed_results.length > 0 && (
                    <div>
                      <p className="text-sm text-slate-400 mb-2">详细识别列表:</p>
                      <div className="bg-slate-700/50 rounded-md p-2 space-y-2 max-h-48 overflow-y-auto">
                        {result.ocrResult.detailed_results.map((item: { text: string; confidence: number }, index: number) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-slate-800/70 rounded">
                            <span className="text-sm text-slate-200">{item.text}</span>
                            <span className={cn('text-sm font-semibold', item.confidence >= 0.8 ? 'text-green-400' : item.confidence >= 0.5 ? 'text-yellow-400' : 'text-red-400')}>
                              {(item.confidence * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* 二维码检测结果 */}
            {result.ocrResult?.barcode_analysis?.enabled && (
              <section>
                <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                  <div className="h-5 w-5 bg-green-400 rounded flex items-center justify-center">
                    <span className="text-xs text-slate-900 font-bold">码</span>
                  </div>
                  二维码检测结果
                </h3>
                <div className="p-4 bg-slate-900/50 rounded-lg space-y-4">
                  <InfoRow label="检测状态">
                    <span className={cn('font-semibold', result.ocrResult.barcode_analysis.overall_match ? 'text-green-400' : 'text-red-400')}>
                      {result.ocrResult.barcode_analysis.overall_match ? '合格' : '存疑'}
                    </span>
                  </InfoRow>
                  <InfoRow label="检测到的二维码数量">{result.ocrResult.barcode_analysis.total_qr_codes_detected || 0} 个</InfoRow>
                  {result.ocrResult.barcode_analysis.detection_summary && (
                    <div>
                      <p className="text-sm text-slate-400 mb-2">检测摘要:</p>
                      <p className="text-sm text-slate-200 bg-slate-700/50 p-3 rounded-md">{result.ocrResult.barcode_analysis.detection_summary}</p>
                    </div>
                  )}
                  {result.ocrResult.barcode_analysis.results && result.ocrResult.barcode_analysis.results.length > 0 && (
                    <div>
                      <p className="text-sm text-slate-400 mb-2">检测详情:</p>
                      <div className="bg-slate-700/50 rounded-md p-2 space-y-2 max-h-48 overflow-y-auto">
                        {result.ocrResult.barcode_analysis.results.map((item: any, index: number) => (
                          <div key={index} className="flex items-center justify-between p-2 bg-slate-800/70 rounded">
                            <div className="flex-1">
                              <span className="text-sm text-slate-200">#{index + 1}: {item.qrCodeData || item.data}</span>
                              <div className="text-xs text-slate-400 mt-1">
                                类型: {item.type} | 置信度: {(item.confidence * 100).toFixed(1)}%
                              </div>
                            </div>
                            <span className={cn('text-sm font-semibold px-2 py-1 rounded', item.matched ? 'text-green-400 bg-green-900/20' : 'text-red-400 bg-red-900/20')}>
                              {item.matched ? '匹配' : '未匹配'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* LLM分析 */}
            {result.llmResult && (
              <section>
                <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2"><Brain className="h-5 w-5 text-purple-300" />LLM 分析</h3>
                <div className="p-4 bg-slate-900/50 rounded-lg space-y-4">
                  <InfoRow label="分析结果">
                    <span className={cn('font-semibold', result.llmResult.overallQuality === '合格' ? 'text-green-400' : 'text-red-400')}>
                      {result.llmResult.overallQuality}
                    </span>
                  </InfoRow>
                  <InfoRow label="分析评分">{result.llmResult.score}分</InfoRow>
                  <div>
                    <p className="text-sm text-slate-400 mb-2">分析原因:</p>
                    <p className="text-sm text-slate-200 bg-slate-700/50 p-3 rounded-md">{result.llmResult.reason || '无'}</p>
                  </div>
                </div>
              </section>
            )}

            {/* 缺陷信息 */}
            {result.defects && result.defects.length > 0 && (
              <section>
                <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2"><XCircle className="h-5 w-5 text-red-400" />缺陷信息</h3>
                <div className="space-y-3">
                  {result.defects.map((defect, index) => (
                    <div key={index} className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                      <p className="text-sm"><span className="text-red-300 font-medium">区域:</span> <span className="text-slate-200 ml-2">{defect.area}</span></p>
                      <p className="text-sm mt-1"><span className="text-red-300 font-medium">描述:</span> <span className="text-slate-200 ml-2">{defect.description}</span></p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}
    </aside>
  </>
);

const EmptyState: React.FC = () => (
  <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-500">
    <FileText className="h-20 w-20 mb-4 opacity-30" />
    <h3 className="text-xl font-semibold mb-2">暂无OCR防呆检测结果</h3>
    <p className="text-sm text-center max-w-xs">
      请返回防呆检测页面开始新的检测，结果将在这里自动汇总。
    </p>
    <Button variant="outline" className="mt-6 border-slate-600 hover:bg-slate-800" onClick={() => (window.location.href = '/ocr-error-prevention')}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      返回OCR防呆检测
    </Button>
  </div>
);

export default OCRErrorPreventionResultsScreen;