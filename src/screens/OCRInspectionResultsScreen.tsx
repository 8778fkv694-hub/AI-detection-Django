import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Trash2, Eye, Download, FileText, Brain, X, Percent, Calendar, RotateCcw, ChevronDown, ChevronUp, Search } from 'lucide-react';
import { format, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/state/appStore';
import { ImagePreviewModal } from '@/components/ocr/ImagePreviewModal';
import type { InspectionResult } from '@/types';
import { fetchFQCRecords, type FQCRecord } from '@/lib/fqcApi';
import { FQCResultCard } from '@/components/ocr/FQCResultCard';
import { navigateClientRoute } from '@/lib/navigation';

// --- 新增的UI组件 ---

// 结果状态图标组件
const UNQUALIFIED_CN = '\u4e0d\u5408\u683c';
const getDisplayQuality = (quality?: string) => (quality === UNQUALIFIED_CN ? '存疑' : quality);
const isUnqualified = (quality?: string) => quality === UNQUALIFIED_CN || quality === '存疑';

const ResultStatusIcon: React.FC<{ quality?: string }> = ({ quality }) => {
  if (quality === '合格') return <CheckCircle2 className="h-4 w-4 text-green-400" />;
  if (isUnqualified(quality)) return <XCircle className="h-4 w-4 text-red-400" />;
  return <AlertCircle className="h-4 w-4 text-amber-400" />;
};

// 结果状态徽章组件
const ResultStatusBadge: React.FC<{ quality?: string }> = ({ quality }) => (
  <Badge
    variant="outline"
    className={cn(
      "text-xs font-semibold",
      quality === '合格' ? 'border-green-400/50 text-green-400' :
        isUnqualified(quality) ? 'border-red-400/50 text-red-400' :
          'border-amber-400/50 text-amber-400'
    )}
  >
    {getDisplayQuality(quality) || '未知'}
  </Badge>
);

const getBarcodeAnalysis = (result: InspectionResult) => result.ocrResult?.barcode_analysis || result.barcodeResult;
const getOcrMatchDisplay = (ocrResult?: InspectionResult['ocrResult']) => {
  if (!ocrResult) return { label: '无数据', className: 'text-amber-400' };
  if (ocrResult.success === false) return { label: '失败', className: 'text-red-400' };
  if (ocrResult.matchStatus === 'qualified') return { label: '合格', className: 'text-green-400' };
  if (ocrResult.matchStatus === 'unqualified') return { label: '存疑', className: 'text-red-400' };
  return { label: '无匹配', className: 'text-amber-400' };
};
const getResultSummary = (result: InspectionResult) => {
  if (result.ocrResult?.success === false) {
    return result.ocrResult.error || 'OCR识别失败';
  }
  if (result.ocrResult?.full_text) {
    return result.ocrResult.full_text;
  }
  return '无文字';
};

const getTraceBadgeClass = (traceConclusion?: string) => {
  if (traceConclusion === '合格') return 'border-green-400/50 text-green-400';
  if (traceConclusion === '需复检') return 'border-red-400/50 text-red-400';
  return 'border-amber-400/50 text-amber-400';
};

// 详情面板中的信息行组件
const InfoRow: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className }) => (
  <div className={cn("flex justify-between items-center text-sm", className)}>
    <span className="text-slate-400">{label}:</span>
    <span className="text-slate-200 font-medium text-right">{children}</span>
  </div>
);

// --- 主屏幕组件 ---

const OCRInspectionResultsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { results, fetchResults, deleteResult } = useAppStore();
  const [filteredResults, setFilteredResults] = useState<InspectionResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<InspectionResult | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    let ocrResults = results
      .filter(result => result.detectionType === 'ocr_inspection' || result.detectionType === 'ocr_fusion_inspection')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // 按时间倒序排序

    // 应用日期过滤
    if (startDate) {
      const startDateTime = startOfDay(new Date(startDate));
      ocrResults = ocrResults.filter(result => {
        const resultDate = new Date(result.timestamp);
        return isAfter(resultDate, startDateTime) || resultDate.getTime() === startDateTime.getTime();
      });
    }

    if (endDate) {
      const endDateTime = endOfDay(new Date(endDate));
      ocrResults = ocrResults.filter(result => {
        const resultDate = new Date(result.timestamp);
        return isBefore(resultDate, endDateTime) || resultDate.getTime() === endDateTime.getTime();
      });
    }

    setFilteredResults(ocrResults);
  }, [results, startDate, endDate]);

  useEffect(() => {
    if (selectedResult && !filteredResults.some(result => result.id === selectedResult.id)) {
      setSelectedResult(null);
    }
  }, [filteredResults, selectedResult]);

  // 重置日期过滤
  const handleResetDateFilter = () => {
    setStartDate('');
    setEndDate('');
  };

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

  // 全部清除OCR检测结果
  const handleClearResults = async () => {
    if (filteredResults.length === 0) return;

    const confirmMessage = `确定要永久删除所有 ${filteredResults.length} 条OCR检测结果吗？\n\n此操作不可恢复！\n\n包括：\n- 融合检测: ${filteredResults.filter(r => r.detectionType === 'ocr_fusion_inspection').length} 条\n- 单独OCR: ${filteredResults.filter(r => r.detectionType === 'ocr_inspection').length} 条`;

    if (window.confirm(confirmMessage)) {
      try {
        for (const result of filteredResults) {
          await deleteResult(result.id);
        }

        setFilteredResults([]);
        setSelectedResult(null);

        alert(`已成功清除 ${filteredResults.length} 条OCR检测结果！`);
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
    const csvHeaders = ['ID', '时间', '检测类型', '综合结果', '追踪结论', '工序标识', '工装二维码', '综合评分', '综合原因', '标准ID', '缺陷数量', 'OCR详细结果 (JSON)', '二维码结果 (JSON)', 'LLM详细结果 (JSON)'];
    const csvContent = [
      csvHeaders.join(','),
      ...filteredResults.map(result => [
        result.id,
        format(new Date(result.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        result.detectionType || 'unknown',
        getDisplayQuality(result.overallQuality) || '未知',
        result.traceConclusion || '',
        result.processStageCode || '',
        result.fixtureQr || '',
        result.score ?? '',
        escapeCsvField(result.reason || ''),
        result.standardId || '',
        result.defects?.length || 0,
        escapeCsvField(result.ocrResult ? JSON.stringify(result.ocrResult) : ''),
        escapeCsvField(getBarcodeAnalysis(result) ? JSON.stringify(getBarcodeAnalysis(result)) : ''),
        escapeCsvField(result.llmResult ? JSON.stringify(result.llmResult) : '')
      ].join(','))
    ].join('\n');
    try {
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `OCR检测结果_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      alert(`成功导出 ${filteredResults.length} 条OCR检测结果！`);
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
            <Button variant="ghost" size="icon" onClick={() => navigate('/ocr')} className="text-slate-400 hover:text-white hover:bg-slate-700">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">OCR 检测结果</h1>
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

        {/* 日期过滤器 */}
        <div className="mb-6 p-4 bg-slate-800/50 border border-slate-700 rounded-lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-slate-400" />
              <span className="text-sm font-medium text-slate-300">时间段筛选：</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 flex-1">
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-400">开始日期:</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-slate-400">结束日期:</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              {(startDate || endDate) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetDateFilter}
                  className="text-slate-400 hover:text-white hover:bg-slate-700"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  重置
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* 统计信息 */}
        {filteredResults.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard title="总检测数" value={filteredResults.length} icon={<FileText className="text-slate-400" />} />
            <StatCard title="融合检测" value={filteredResults.filter(r => r.detectionType === 'ocr_fusion_inspection').length} icon={<Brain className="text-purple-400" />} valueClassName="text-purple-400" />
            <StatCard title="单独OCR" value={filteredResults.filter(r => r.detectionType === 'ocr_inspection').length} icon={<FileText className="text-blue-400" />} valueClassName="text-blue-400" />
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

        {/* FQC 终检看板 */}
        <FQCDashboardSection />
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
}> = ({ result, onSelect, onDelete, isDeleting = false }) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const ocrMatchDisplay = getOcrMatchDisplay(result.ocrResult);

  return (
    <>
      <Card className="bg-slate-800/50 border-slate-700 overflow-hidden group transition-all duration-300 hover:border-slate-500 hover:shadow-lg hover:shadow-slate-900/50">
        <CardHeader className="p-3 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{format(new Date(result.timestamp), 'MM-dd HH:mm:ss')}</span>
            <div className="flex items-center gap-2">
              {result.ocrResult && (
                <span className={cn("text-[11px] font-medium", ocrMatchDisplay.className)}>
                  OCR {ocrMatchDisplay.label}
                </span>
              )}
              <ResultStatusIcon quality={result.overallQuality} />
              <ResultStatusBadge quality={result.overallQuality} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div
            className="aspect-square bg-slate-900/50 flex items-center justify-center relative overflow-hidden cursor-pointer"
            onClick={() => {
              if (result.image) {
                setPreviewImage(result.image.startsWith('data:') ? result.image : `data:image/jpeg;base64,${result.image}`);
                setShowPreviewModal(true);
              }
            }}
          >
            {result.image ? (
              <img
                src={result.image.startsWith('data:') ? result.image : `data:image/jpeg;base64,${result.image}`}
                alt="检测图片"
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105 hover:opacity-80"
              />
            ) : (
              <FileText className="h-16 w-16 text-slate-600" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
            <div className="absolute bottom-2 left-2 flex items-center gap-2">
              <Badge variant="secondary" className={cn("text-xs", result.detectionType === 'ocr_fusion_inspection' ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30")}>
                {result.detectionType === 'ocr_fusion_inspection' ? <Brain className="h-3 w-3 mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                {result.detectionType === 'ocr_fusion_inspection' ? '融合检测' : '单独OCR'}
              </Badge>
            </div>
          </div>
        </CardContent>
        <div className="p-3 bg-slate-800">
          <p className="text-xs text-slate-400 truncate mb-1">识别摘要: {getResultSummary(result)}</p>
          <div className="flex flex-wrap gap-2 text-[11px] mb-2">
            {result.processStageCode && (
              <Badge variant="secondary" className="bg-blue-500/15 text-blue-300">
                {result.processStageName || result.processStageCode}
              </Badge>
            )}
          </div>
          {(result.fixtureQr || result.pageInstanceId || result.cameraId) && (
            <div className="mb-2 flex flex-wrap gap-3 text-[11px] text-slate-400">
              {result.fixtureQr && <span>工装: {result.fixtureQr}</span>}
              {result.pageInstanceId && <span>页面: {result.pageInstanceId}</span>}
              {result.cameraId && <span>相机: {result.cameraId}</span>}
            </div>
          )}
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

      {/* 图片预览模态框 */}
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false);
            setPreviewImage(null);
          }}
          alt="检测图片预览"
        />
      )}
    </>
  );
};

const DetailPanel: React.FC<{
  result: InspectionResult | null;
  onClose: () => void;
  onDelete: (resultId: string) => void;
  isDeleting?: boolean;
}> = ({ result, onClose, onDelete, isDeleting = false }) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);
  const ocrMatchDisplay = result?.ocrResult ? getOcrMatchDisplay(result.ocrResult) : null;

  return (
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
              <div
                className="aspect-video bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center cursor-pointer hover:border-2 hover:border-blue-500 transition-all"
                onClick={() => {
                  if (result.image) {
                    setPreviewImage(result.image.startsWith('data:') ? result.image : `data:image/jpeg;base64,${result.image}`);
                    setShowPreviewModal(true);
                  }
                }}
              >
                {result.image ? (
                  <img
                    src={result.image.startsWith('data:') ? result.image : `data:image/jpeg;base64,${result.image}`}
                    alt="检测图片"
                    className="w-full h-full object-contain hover:opacity-80 transition-opacity"
                  />
                ) : (
                  <FileText className="h-20 w-20 text-slate-700" />
                )}
              </div>
              {result.image && (
                <div className="text-xs text-slate-400 text-center">💡 点击图片可查看放大版本</div>
              )}

              {/* 综合评估 */}
              <section>
                <h3 className="text-base font-semibold text-white mb-3">综合评估</h3>
                <div className="p-4 bg-slate-900/50 rounded-lg space-y-3">
                  <InfoRow label="检测时间">{format(new Date(result.timestamp), 'yyyy-MM-dd HH:mm:ss')}</InfoRow>
                  <InfoRow label="检测类型">
                    <Badge variant="secondary" className={cn("text-xs", result.detectionType === 'ocr_fusion_inspection' ? "bg-purple-500/20 text-purple-300 border-purple-500/30" : "bg-blue-500/20 text-blue-300 border-blue-500/30")}>
                      {result.detectionType === 'ocr_fusion_inspection' ? '融合检测' : '单独OCR'}
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

              {result.fixtureQr && (
                <section>
                  <h3 className="text-base font-semibold text-white mb-3">追踪信息</h3>
                  <div className="p-4 bg-slate-900/50 rounded-lg space-y-3">
                    <InfoRow label="追踪结论">
                      <Badge variant="outline" className={cn("text-xs font-semibold", getTraceBadgeClass(result.traceConclusion))}>
                        {result.traceConclusion || '未判定'}
                      </Badge>
                    </InfoRow>
                    <InfoRow label="追踪说明">{result.traceConclusionReason || result.traceRuleSummary || '暂无'}</InfoRow>
                    <InfoRow label="工序">{result.processStageName || result.processStageCode || '未设置'}</InfoRow>
                    <InfoRow label="页面实例">{result.pageInstanceId || '未设置'}</InfoRow>
                    <InfoRow label="相机">{result.cameraId || '未设置'}</InfoRow>
                    <InfoRow label="工装二维码">{result.fixtureQr || '未提供'}</InfoRow>
                    <InfoRow label="工装来源">{result.fixtureQrSource || '未提供'}</InfoRow>
                    <InfoRow label="二维码候选数">{result.traceContext?.fixtureQrCandidateCount ?? 0}</InfoRow>
                    <InfoRow label="业务编码">{result.businessCode || '未提供'}</InfoRow>
                    <InfoRow label="工装规则">{result.fixtureRulePassed === true ? '通过' : result.fixtureRulePassed === false ? '失败' : '待定'}</InfoRow>
                    {result.traceContext?.fixtureQrFallbackRecommended && (
                      <div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/20 p-3 rounded-md">
                        当前工装二维码未完成有效输入。建议改用扫码、NFC或人工补录后再完成跨工序追踪。
                      </div>
                    )}
                    {result.fixtureRuleReason && (
                      <div className="text-sm text-slate-300 bg-slate-700/50 p-3 rounded-md">
                        <span className="text-slate-400 mr-2">工装规则说明:</span>
                        {result.fixtureRuleReason}
                      </div>
                    )}
                    {result.relatedStages && result.relatedStages.length > 0 && (
                      <div className="space-y-2">
                        <div className="text-sm text-slate-400">关联工序</div>
                        <div className="space-y-2">
                          {result.relatedStages.map((stage: any, index: number) => (
                            <div key={`${stage.stageCode || 'stage'}-${index}`} className="rounded-md border border-slate-700 bg-slate-800/50 p-2 text-xs text-slate-300">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-slate-100">{stage.stageName || stage.stageCode || '未命名工序'}</span>
                                <span className="text-slate-400">{stage.status || 'completed'}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap gap-3 text-slate-400">
                                {stage.businessCode && <span>编码: {stage.businessCode}</span>}
                                {stage.pageInstanceId && <span>页面: {stage.pageInstanceId}</span>}
                                {stage.cameraId && <span>相机: {stage.cameraId}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* OCR分析 */}
              {result.ocrResult && (
                <section>
                  <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2"><FileText className="h-5 w-5 text-blue-300" />OCR 分析</h3>
                  <div className="p-4 bg-slate-900/50 rounded-lg space-y-4">
                    <InfoRow label="匹配状态">
                      <span className={cn('font-semibold', ocrMatchDisplay?.className)}>
                        {ocrMatchDisplay?.label}
                      </span>
                    </InfoRow>
                    <InfoRow label="OCR执行">
                      <span className={cn('font-semibold', result.ocrResult.success ? 'text-green-400' : 'text-red-400')}>
                        {result.ocrResult.success ? '成功' : '失败'}
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
                          {result.ocrResult.detailed_results.map((item, index) => (
                            <div key={index} className="flex items-center justify-between p-2 bg-slate-800/70 rounded">
                              <span className="text-sm text-slate-200">{item.text}</span>
                              {item.confidence === 0 ? (
                                <span className="text-sm font-semibold text-green-400">无数据</span>
                              ) : (
                                <span className={cn('text-sm font-semibold', item.confidence >= 0.8 ? 'text-green-400' : item.confidence >= 0.5 ? 'text-yellow-400' : 'text-red-400')}>
                                  {(item.confidence * 100).toFixed(1)}%
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!result.ocrResult.success && result.ocrResult.error && (
                      <div>
                        <p className="text-sm text-slate-400 mb-2">错误信息:</p>
                        <p className="text-sm text-red-300 bg-red-900/20 p-3 rounded-md">{result.ocrResult.error}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* 二维码检测结果 */}
              {getBarcodeAnalysis(result)?.enabled && (
                <section>
                  <h3 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                    <div className="h-5 w-5 bg-green-400 rounded flex items-center justify-center">
                      <span className="text-xs text-slate-900 font-bold">码</span>
                    </div>
                    二维码检测结果
                  </h3>
                  <div className="p-4 bg-slate-900/50 rounded-lg space-y-4">
                    <InfoRow label="检测状态">
                      <span className={cn('font-semibold', getBarcodeAnalysis(result)?.overall_match ? 'text-green-400' : 'text-red-400')}>
                        {getBarcodeAnalysis(result)?.overall_match ? '合格' : '存疑'}
                      </span>
                    </InfoRow>
                    <InfoRow label="检测到的二维码数量">{getBarcodeAnalysis(result)?.total_qr_codes_detected || 0} 个</InfoRow>
                    {getBarcodeAnalysis(result)?.detection_summary && (
                      <div>
                        <p className="text-sm text-slate-400 mb-2">检测摘要:</p>
                        <p className="text-sm text-slate-200 bg-slate-700/50 p-3 rounded-md">{getBarcodeAnalysis(result)?.detection_summary}</p>
                      </div>
                    )}
                    {getBarcodeAnalysis(result)?.results && getBarcodeAnalysis(result)!.results.length > 0 && (
                      <div>
                        <p className="text-sm text-slate-400 mb-2">检测详情:</p>
                        <div className="bg-slate-700/50 rounded-md p-2 space-y-2 max-h-48 overflow-y-auto">
                          {getBarcodeAnalysis(result)!.results.map((item: any, index: number) => (
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
                        {getDisplayQuality(result.llmResult.overallQuality)}
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

      {/* 图片预览模态框 */}
      {previewImage && (
        <ImagePreviewModal
          imageUrl={previewImage}
          isOpen={showPreviewModal}
          onClose={() => {
            setShowPreviewModal(false);
            setPreviewImage(null);
          }}
          alt="检测图片预览"
        />
      )}
    </>
  );
};

// ─── FQC 终检看板 ─────────────────────────────────────────────────────────────
const FQC_RESULT_COLORS: Record<string, string> = {
  '合格': 'border-green-500/40 bg-green-500/5',
  '不合格': 'border-red-500/40 bg-red-500/5',
  '存疑': 'border-amber-500/40 bg-amber-500/5',
};

const FQCDashboardSection: React.FC = () => {
  const [expanded, setExpanded] = useState(false);
  const [records, setRecords] = useState<FQCRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [searchQr, setSearchQr] = useState('');
  const [filterResult, setFilterResult] = useState<string>('');

  const loadRecords = useCallback(async (fixtureQr?: string) => {
    setLoading(true);
    try {
      const params = fixtureQr ? { fixture_qr: fixtureQr } : undefined;
      const data = await fetchFQCRecords(params);
      setRecords(data);
      setLoaded(true);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on first expand
  useEffect(() => {
    if (expanded && !loaded && !loading) {
      loadRecords();
    }
  }, [expanded, loaded, loading, loadRecords]);

  const handleSearch = () => {
    loadRecords(searchQr.trim() || undefined);
  };

  const filtered = filterResult
    ? records.filter(r => r.overall_result === filterResult)
    : records;

  const stats = {
    total: records.length,
    pass: records.filter(r => r.overall_result === '合格').length,
    fail: records.filter(r => r.overall_result === '不合格').length,
    pending: records.filter(r => r.overall_result === '存疑').length,
  };

  const handleExportFQC = () => {
    if (filtered.length === 0) {
      alert('没有 FQC 记录可以导出');
      return;
    }

    const escapeCsvField = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const headers = [
      'ID',
      '工装码',
      '产品配方',
      'FQC工序代码',
      'FQC工序名称',
      '终检结果',
      '追踪结论',
      '规则校验通过',
      '结论原因',
      '工序摘要(JSON)',
      '规则详情(JSON)',
      '流转记录(JSON)',
      '创建时间',
      '更新时间',
    ];

    const csvContent = [
      headers.join(','),
      ...filtered.map(record => [
        record.id,
        escapeCsvField(record.fixture_qr),
        escapeCsvField(record.product_recipe_name),
        escapeCsvField(record.fqc_stage_code),
        escapeCsvField(record.fqc_stage_name),
        escapeCsvField(record.overall_result),
        escapeCsvField(record.trace_conclusion || ''),
        record.validation_passed === null ? '' : record.validation_passed ? '是' : '否',
        escapeCsvField(record.result_reason || ''),
        escapeCsvField(JSON.stringify(record.stage_summary || [])),
        escapeCsvField(JSON.stringify(record.validation_details || [])),
        escapeCsvField(JSON.stringify(record.trace_flow || [])),
        escapeCsvField(record.created_at ? format(new Date(record.created_at), 'yyyy-MM-dd HH:mm:ss') : ''),
        escapeCsvField(record.updated_at ? format(new Date(record.updated_at), 'yyyy-MM-dd HH:mm:ss') : ''),
      ].join(',')),
    ].join('\n');

    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `FQC终检记录_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="mt-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:bg-slate-800/80 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="rounded bg-indigo-500/20 px-2 py-1 text-xs font-bold text-indigo-300 border border-indigo-500/40">FQC</span>
          <span className="text-sm font-medium text-slate-200">终检记录看板</span>
          {!expanded && records.length > 0 && (
            <span className="text-xs text-slate-400">({records.length} 条记录)</span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          {/* Search & Filter bar */}
          <div className="flex flex-col sm:flex-row gap-3 p-4 bg-slate-800/30 border border-slate-700/50 rounded-lg">
            <div className="flex flex-1 gap-2">
              <input
                value={searchQr}
                onChange={e => setSearchQr(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="按工装码搜索..."
                className="flex-1 rounded border border-slate-600 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 outline-none focus:border-indigo-500"
              />
              <Button variant="outline" size="sm" onClick={handleSearch} className="border-slate-600">
                <Search className="h-4 w-4 mr-1" />搜索
              </Button>
              {searchQr && (
                <Button variant="ghost" size="sm" onClick={() => { setSearchQr(''); loadRecords(); }} className="text-slate-400">
                  <RotateCcw className="h-3 w-3 mr-1" />全部
                </Button>
              )}
            </div>
            <div className="flex gap-1.5">
              {['', '合格', '不合格', '存疑'].map(v => (
                <button
                  key={v}
                  onClick={() => setFilterResult(v)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs border transition-colors',
                    filterResult === v
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/50'
                      : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500'
                  )}
                >
                  {v || '全部'}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportFQC}
              disabled={filtered.length === 0}
              className="border-slate-600"
            >
              <Download className="h-4 w-4 mr-1" />导出FQC
            </Button>
          </div>

          {/* Stats */}
          {records.length > 0 && (
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
                <div className="text-lg font-bold text-slate-200">{stats.total}</div>
                <div className="text-[10px] text-slate-400">总记录</div>
              </div>
              <div className="rounded-lg border border-green-500/30 bg-green-500/5 p-3 text-center">
                <div className="text-lg font-bold text-green-400">{stats.pass}</div>
                <div className="text-[10px] text-slate-400">合格</div>
              </div>
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-center">
                <div className="text-lg font-bold text-red-400">{stats.fail}</div>
                <div className="text-[10px] text-slate-400">不合格</div>
              </div>
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-center">
                <div className="text-lg font-bold text-amber-400">{stats.pending}</div>
                <div className="text-[10px] text-slate-400">存疑</div>
              </div>
            </div>
          )}

          {/* Records */}
          {loading ? (
            <div className="py-8 text-center text-slate-400 text-sm">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-500 text-sm">
              {records.length === 0 ? '暂无 FQC 终检记录' : '无匹配记录'}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(record => (
                <div key={record.id} className={cn('rounded-lg border p-0.5', FQC_RESULT_COLORS[record.overall_result] || 'border-slate-700')}>
                  <FQCResultCard record={record} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

const EmptyState: React.FC = () => (
  <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-500">
    <FileText className="h-20 w-20 mb-4 opacity-30" />
    <h3 className="text-xl font-semibold mb-2">暂无OCR检测结果</h3>
    <p className="text-sm text-center max-w-xs">
      请返回检测页面开始新的检测，结果将在这里自动汇总。
    </p>
    <Button variant="outline" className="mt-6 border-slate-600 hover:bg-slate-800" onClick={() => navigateClientRoute('/ocr')}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      返回OCR检测
    </Button>
  </div>
);

export default OCRInspectionResultsScreen;
