import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Trash2, Eye, Download, FileText, Shield, X, Percent, Package, Maximize2, Calendar, RotateCcw } from 'lucide-react';
import { format, isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/state/appStore';
import { ImagePreviewModal } from '@/components/ocr/ImagePreviewModal';
import { navigateClientRoute } from '@/lib/navigation';
import type { InspectionResult } from '@/types';

// --- 新增的UI组件 ---

// 结果状态图标组件
const ResultStatusIcon: React.FC<{ quality?: '合格' | '存疑' | '需复检' | '存疑' }> = ({ quality }) => {
  if (quality === '合格') return <CheckCircle2 className="h-4 w-4 text-green-400" />;
  if (quality === '存疑') return <XCircle className="h-4 w-4 text-red-400" />;
  if (quality === '存疑') return <AlertCircle className="h-4 w-4 text-amber-400" />;
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
      quality === '存疑' ? 'border-amber-400/50 text-amber-400' :
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

const KitMatchingResultsScreen: React.FC = () => {
  const navigate = useNavigate();
  const { results, fetchResults, deleteResult, clearResultsByType } = useAppStore();
  const [filteredResults, setFilteredResults] = useState<InspectionResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<InspectionResult | null>(null);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  useEffect(() => {
    let kitResults = results
      .filter(result => result.detectionType === 'kit_matching')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // 按时间倒序排序

    // 应用日期过滤
    if (startDate) {
      const startDateTime = startOfDay(new Date(startDate));
      kitResults = kitResults.filter(result => {
        const resultDate = new Date(result.timestamp);
        return isAfter(resultDate, startDateTime) || resultDate.getTime() === startDateTime.getTime();
      });
    }

    if (endDate) {
      const endDateTime = endOfDay(new Date(endDate));
      kitResults = kitResults.filter(result => {
        const resultDate = new Date(result.timestamp);
        return isBefore(resultDate, endDateTime) || resultDate.getTime() === endDateTime.getTime();
      });
    }

    setFilteredResults(kitResults);
  }, [results, startDate, endDate]);

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

  // 全部清除齐套化检测结果
  const handleClearResults = async () => {
    if (filteredResults.length === 0) return;

    const confirmMessage = `确定要永久删除所有 ${filteredResults.length} 条齐套化检测结果吗？\n\n此操作不可恢复！`;

    if (window.confirm(confirmMessage)) {
      try {
        await clearResultsByType('kit_matching');

        setFilteredResults([]);
        setSelectedResult(null);

        alert(`已成功清除 ${filteredResults.length} 条齐套化检测结果！`);
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
    const csvHeaders = ['ID', '时间', '检测类型', '综合结果', '综合评分', '综合原因', '缺陷数量'];
    const csvContent = [
      csvHeaders.join(','),
      ...filteredResults.map(result => [
        result.id,
        format(new Date(result.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        '齐套化检测',
        result.overallQuality || '未知',
        result.score ?? '',
        escapeCsvField(result.reason || ''),
        result.defects?.length || 0
      ].join(','))
    ].join('\n');
    try {
      const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
      const blob = new Blob([bom, csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `齐套化检测结果_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      alert(`成功导出 ${filteredResults.length} 条齐套化检测结果！`);
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
            <Button variant="ghost" size="icon" onClick={() => navigate('/kit-matching')} className="text-slate-400 hover:text-white hover:bg-slate-700">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-white">齐套化检测结果</h1>
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
            <StatCard title="总检测数" value={filteredResults.length} icon={<Package className="text-slate-400" />} />
            <StatCard
              title="合格次数"
              value={filteredResults.filter(r => r.overallQuality === '合格').length}
              icon={<CheckCircle2 className="text-green-400" />}
              valueClassName="text-green-400"
            />
            <StatCard
              title="存疑次数"
              value={filteredResults.filter(r => r.overallQuality === '存疑').length}
              icon={<XCircle className="text-red-400" />}
              valueClassName="text-red-400"
            />
            <StatCard
              title="合格率"
              value={`${filteredResults.length > 0 ? Math.round((filteredResults.filter(r => r.overallQuality === '合格').length / filteredResults.length) * 100) : 0}%`}
              icon={<Percent className="text-blue-400" />}
              valueClassName="text-blue-400"
            />
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
}> = ({ result, onSelect, onDelete, isDeleting = false }) => {
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showPreviewModal, setShowPreviewModal] = useState<boolean>(false);

  return (
    <>
      <Card className="bg-slate-800/50 border-slate-700 overflow-hidden group transition-all duration-300 hover:border-slate-500 hover:shadow-lg hover:shadow-slate-900/50">
        <CardHeader className="p-3 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">{format(new Date(result.timestamp), 'MM-dd HH:mm:ss')}</span>
            <div className="flex items-center gap-2">
              <ResultStatusIcon quality={result.overallQuality as '合格' | '存疑' | '需复检' | '存疑'} />
              <ResultStatusBadge quality={result.overallQuality as '合格' | '存疑' | '需复检' | '存疑'} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div
            className="aspect-square bg-slate-900/50 flex items-center justify-center relative overflow-hidden cursor-pointer group/image"
            onClick={() => {
              if (result.image) {
                setPreviewImage(result.image.startsWith('data:') ? result.image : `data:image/jpeg;base64,${result.image}`);
                setShowPreviewModal(true);
              }
            }}
            title="点击查看大图"
          >
            {result.image ? (
              <img
                src={result.image.startsWith('data:') ? result.image : `data:image/jpeg;base64,${result.image}`}
                alt="检测图片"
                className="w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <FileText className="h-16 w-16 text-slate-600" />
            )}
            {/* 渐变遮罩 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
            {/* 悬停时显示的放大图标 */}
            {result.image && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/image:opacity-100 transition-opacity duration-300 bg-black/40">
                <div className="bg-blue-500/80 rounded-full p-3">
                  <Maximize2 className="h-8 w-8 text-white" />
                </div>
              </div>
            )}
            {/* 标签 */}
            <div className="absolute bottom-2 left-2 flex items-center gap-2">
              <Badge variant="secondary" className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs">
                <Shield className="h-3 w-3 mr-1"/>
                齐套化检测
              </Badge>
            </div>
          </div>
        </CardContent>
        <div className="p-3 bg-slate-800">
          <p className="text-xs text-slate-400 truncate mb-1">
            {result.reason || '无详细信息'}
          </p>
          <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
            <span>评分: {result.score}分</span>
          </div>
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
      <ImagePreviewModal
        imageUrl={previewImage || ''}
        isOpen={showPreviewModal && !!previewImage}
        onClose={() => {
          setShowPreviewModal(false);
          setPreviewImage(null);
        }}
        alt="检测图片预览"
      />
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
                  <Badge variant="secondary" className="bg-orange-500/20 text-orange-300 border-orange-500/30 text-xs">
                    <Shield className="h-3 w-3 mr-1"/>
                    齐套化检测
                  </Badge>
                </InfoRow>
                <InfoRow label="检测结果">
                  <div className="flex items-center gap-2">
                    <ResultStatusIcon quality={result.overallQuality as '合格' | '存疑' | '需复检' | '存疑'} />
                    <ResultStatusBadge quality={result.overallQuality as '合格' | '存疑' | '需复检' | '存疑'} />
                  </div>
                </InfoRow>
                <InfoRow label="综合评分">{result.score}分</InfoRow>
                <div className="text-sm text-slate-300 bg-slate-700/50 p-3 rounded-md mt-2">
                  <span className="text-slate-400 mr-2">原因:</span>
                  {result.reason}
                </div>
              </div>
            </section>

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
      <ImagePreviewModal
        imageUrl={previewImage || ''}
        isOpen={showPreviewModal && !!previewImage}
        onClose={() => {
          setShowPreviewModal(false);
          setPreviewImage(null);
        }}
        alt="检测图片预览"
      />
    </>
  );
};

const EmptyState: React.FC = () => (
  <div className="col-span-full flex flex-col items-center justify-center py-20 text-slate-500">
    <Package className="h-20 w-20 mb-4 opacity-30" />
    <h3 className="text-xl font-semibold mb-2">暂无齐套化检测结果</h3>
    <p className="text-sm text-center max-w-xs">
      请返回检测页面开始新的检测，结果将在这里自动汇总。
    </p>
    <Button variant="outline" className="mt-6 border-slate-600 hover:bg-slate-800" onClick={() => navigateClientRoute('/kit-matching')}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      返回齐套化检测
    </Button>
  </div>
);

export default KitMatchingResultsScreen;
