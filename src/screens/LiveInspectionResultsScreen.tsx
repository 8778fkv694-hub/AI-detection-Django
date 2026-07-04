import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Trash2, Eye, Download, FileText, Brain, X, Percent, Zap } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/state/appStore';
import { navigateClientRoute } from '@/lib/navigation';
import type { InspectionResult } from '@/types';

// --- 新增的UI组件 ---

// 结果状态图标组件
const ResultStatusIcon: React.FC<{ quality?: '合格' | '存疑' | '需复检' }> = ({ quality }) => {
  if (quality === '合格') return <CheckCircle2 className="h-4 w-4 text-green-400" />;
  if (quality === '存疑') return <XCircle className="h-4 w-4 text-red-400" />;
  if (quality === '需复检') return <AlertCircle className="h-4 w-4 text-yellow-400" />;
  return <AlertCircle className="h-4 w-4 text-amber-400" />;
};

// 结果状态徽章组件
const ResultStatusBadge: React.FC<{ quality?: '合格' | '存疑' | '需复检' }> = ({ quality }) => (
  <Badge
    variant="outline"
    className={cn(
      "text-xs font-semibold",
      quality === '合格' ? 'border-green-400/50 text-green-400' :
        quality === '存疑' ? 'border-red-400/50 text-red-400' :
          quality === '需复检' ? 'border-yellow-400/50 text-yellow-400' :
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

const LiveInspectionResultsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { results, fetchResults, deleteResult, clearResultsByType } = useAppStore();
  const [filteredResults, setFilteredResults] = useState<InspectionResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<InspectionResult | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    // 过滤出实时检测的结果
    const liveResults = results
      .filter(result =>
        result.detectionType === 'standard_inspection' ||
        result.detectionType === 'general_quality' ||
        result.detectionType === 'unknown' || // 兼容后端返回的unknown类型
        !result.detectionType // 兼容旧数据
      )
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // 按时间倒序排序
    setFilteredResults(liveResults);
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

  // 全部清除实时检测结果
  const handleClearResults = async () => {
    if (filteredResults.length === 0) return;

    const standardCount = filteredResults.filter(r => r.detectionType === 'standard_inspection').length;
    const qualityCount = filteredResults.filter(r => r.detectionType === 'general_quality').length;
    const unknownCount = filteredResults.filter(r => !r.detectionType).length;

    const confirmMessage = `确定要永久删除所有 ${filteredResults.length} 条实时检测结果吗？\n\n此操作不可恢复！\n\n包括：\n- 标准检测: ${standardCount} 条\n- 质量检测: ${qualityCount} 条\n- 其他类型: ${unknownCount} 条`;

    if (window.confirm(confirmMessage)) {
      try {
        // 删除实时检测相关的所有类型结果
        await clearResultsByType('standard_inspection');
        await clearResultsByType('general_quality');

        setFilteredResults([]);
        setSelectedResult(null);

        alert(`已成功清除 ${filteredResults.length} 条实时检测结果！`);
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
    const csvHeaders = ['ID', '时间', '检测类型', '综合结果', '综合评分', '综合原因', '标准ID', '缺陷数量', '检测详细结果 (JSON)'];
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
        escapeCsvField(result.llmResult ? JSON.stringify(result.llmResult) : '')
      ].join(','))
    ].join('\n');
    try {
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `实时检测结果_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      alert(`成功导出 ${filteredResults.length} 条实时检测结果！`);
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
            <Button variant="ghost" size="icon" onClick={() => navigate('/live')} className="text-slate-400 hover:text-white hover:bg-slate-700">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">实时检测结果</h1>
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
            <StatCard title="总检测数" value={filteredResults.length} icon={<Zap className="text-slate-400" />} />
            <StatCard title="标准检测" value={filteredResults.filter(r => r.detectionType === 'standard_inspection').length} icon={<CheckCircle2 className="text-blue-400" />} valueClassName="text-blue-400" />
            <StatCard title="质量检测" value={filteredResults.filter(r => r.detectionType === 'general_quality').length} icon={<AlertCircle className="text-purple-400" />} valueClassName="text-purple-400" />
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
          <Badge variant="secondary" className={cn("text-xs", result.detectionType === 'standard_inspection' ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-purple-500/20 text-purple-300 border-purple-500/30")}>
            {result.detectionType === 'standard_inspection' ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertCircle className="h-3 w-3 mr-1" />}
            {result.detectionType === 'standard_inspection' ? '标准检测' : '质量检测'}
          </Badge>
        </div>
      </div>
    </CardContent>
    <div className="p-3 bg-slate-800">
      <p className="text-xs text-slate-400 truncate mb-1">检测摘要: {result.reason || '无描述'}</p>
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
                  <Badge variant="secondary" className={cn("text-xs", result.detectionType === 'standard_inspection' ? "bg-blue-500/20 text-blue-300 border-blue-500/30" : "bg-purple-500/20 text-purple-300 border-purple-500/30")}>
                    {result.detectionType === 'standard_inspection' ? '标准检测' : '质量检测'}
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

            {/* OCR检测详情 */}
            {result.ocrResult ? (
              <section>
                <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2"><FileText className="h-5 w-5 text-blue-300" />OCR检测详情</h3>
                <div className="p-4 bg-slate-900/50 rounded-lg space-y-3">
                  <div className="text-sm font-medium text-blue-300 border-b border-blue-500/30 pb-1">OCR检测详情</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-slate-400">识别状态:</div>
                    <div className={`font-medium ${result.ocrResult.success ? 'text-green-400' : 'text-red-400'}`}>
                      {result.ocrResult.success ? '成功' : '失败'}
                    </div>
                    <div className="text-slate-400">最终结果:</div>
                    <div className={`font-medium ${result.ocrResult.matchStatus === 'qualified' ? 'text-green-400' :
                      result.ocrResult.matchStatus === 'unqualified' ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                      {result.ocrResult.matchStatus === 'qualified' ? '合格' :
                        result.ocrResult.matchStatus === 'unqualified' ? '存疑' : '无匹配'}
                    </div>
                    {result.ocrResult.text_count && (
                      <>
                        <div className="text-slate-400">文字数量:</div>
                        <div className="text-slate-300">{result.ocrResult.text_count} 个</div>
                      </>
                    )}
                    {result.ocrResult.model_used && (
                      <>
                        <div className="text-slate-400">使用模型:</div>
                        <div className="text-slate-300">{result.ocrResult.model_used}</div>
                      </>
                    )}
                  </div>
                  {result.ocrResult.full_text && (
                    <div className="space-y-1">
                      <div className="text-xs text-slate-400">识别文字:</div>
                      <div className="text-xs text-slate-200 bg-slate-700/50 p-2 rounded border border-slate-600/50 max-h-20 overflow-y-auto">
                        {result.ocrResult.full_text}
                      </div>
                    </div>
                  )}
                  {result.ocrResult.detailed_results && result.ocrResult.detailed_results.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-slate-400">详细识别结果:</div>
                      <div className="space-y-1 max-h-24 overflow-y-auto">
                        {result.ocrResult.detailed_results.slice(0, 5).map((item: any, idx: number) => (
                          <div key={idx} className="text-xs text-slate-300 bg-slate-700/30 p-1 rounded">
                            <span className="text-slate-400">文字:</span> {item.text}
                            <span className="text-slate-400 ml-2">置信度:</span>{' '}
                            {item.confidence === 0 ? (
                              <span className="text-green-400">无数据</span>
                            ) : (
                              <span>{(item.confidence * 100).toFixed(1)}%</span>
                            )}
                          </div>
                        ))}
                        {result.ocrResult.detailed_results.length > 5 && (
                          <div className="text-xs text-slate-500">...还有{result.ocrResult.detailed_results.length - 5}个结果</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              <section>
                <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2"><FileText className="h-5 w-5 text-blue-300" />OCR检测详情</h3>
                <div className="p-4 bg-slate-900/50 rounded-lg space-y-2">
                  <div className="text-sm font-medium text-blue-300 border-b border-blue-500/30 pb-1">OCR检测详情</div>
                  <div className="text-xs text-slate-400">暂无OCR检测详情</div>
                </div>
              </section>
            )}

            {/* LLM分析详情 */}
            {result.llmResult ? (
              <section>
                <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2"><Brain className="h-5 w-5 text-purple-300" />LLM分析详情</h3>
                <div className="p-4 bg-slate-900/50 rounded-lg space-y-3">
                  <div className="text-sm font-medium text-purple-300 border-b border-purple-500/30 pb-1">LLM分析详情</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="text-slate-400">分析结果:</div>
                    <div className={`font-medium ${result.llmResult.overallQuality === '合格' ? 'text-green-400' :
                      result.llmResult.overallQuality === '存疑' ? 'text-red-400' : 'text-yellow-400'
                      }`}>
                      {result.llmResult.overallQuality}
                    </div>
                    <div className="text-slate-400">评分:</div>
                    <div className="text-slate-300 font-medium">{result.llmResult.score} 分</div>
                    {result.llmResult.reasonKeywords && (
                      <>
                        <div className="text-slate-400">关键词:</div>
                        <div className="text-slate-300">
                          {Array.isArray(result.llmResult.reasonKeywords)
                            ? result.llmResult.reasonKeywords.join(', ')
                            : result.llmResult.reasonKeywords}
                        </div>
                      </>
                    )}
                  </div>
                  {result.llmResult.reason && (
                    <div className="space-y-1">
                      <div className="text-xs text-slate-400">分析原因:</div>
                      <div className="text-xs text-slate-200 bg-slate-700/50 p-2 rounded border border-slate-600/50">
                        {result.llmResult.reason}
                      </div>
                    </div>
                  )}
                  {result.llmResult.defects && result.llmResult.defects.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs text-slate-400">检测到的缺陷:</div>
                      <div className="space-y-1">
                        {result.llmResult.defects.map((defect: any, idx: number) => (
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
              </section>
            ) : (
              <section>
                <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2"><Brain className="h-5 w-5 text-purple-300" />LLM分析详情</h3>
                <div className="p-4 bg-slate-900/50 rounded-lg space-y-2">
                  <div className="text-sm font-medium text-purple-300 border-b border-purple-500/30 pb-1">LLM分析详情</div>
                  <div className="text-xs text-slate-400">暂无LLM分析详情</div>
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
    <Zap className="h-20 w-20 mb-4 opacity-30" />
    <h3 className="text-xl font-semibold mb-2">暂无实时检测结果</h3>
    <p className="text-sm text-center max-w-xs">
      请返回检测页面开始新的检测，结果将在这里自动汇总。
    </p>
    <Button variant="outline" className="mt-6 border-slate-600 hover:bg-slate-800" onClick={() => navigateClientRoute('/live-inspection')}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      返回实时检测
    </Button>
  </div>
);

export default LiveInspectionResultsScreen;
