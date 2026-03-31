
import React, { useEffect, useState } from 'react';
import { useAppStore } from '@/state/appStore';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { Trash2, SearchCheck, CheckCircle2, XCircle, AlertCircle, BarChart2, Layers, MapPin, Filter, FileText, Brain, Settings, Eye } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast'; // Import toast for user feedback
import AnnotatedImage from '@/components/AnnotatedImage';

const ResultsScreen: React.FC = () => {
  // **MODIFIED**: Destructure the new clearAllResults function
  const { results, standards, clearAllResults, syncData } = useAppStore();
  const navigate = useNavigate();

  // 分类筛选状态
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedQuality, setSelectedQuality] = useState<string>('all');

  // 定义检测类型分类
  const detectionCategories = [
    { id: 'all', name: '全部检测', icon: Eye, color: 'text-slate-400' },
    { id: 'standard_inspection', name: '实时检测', icon: SearchCheck, color: 'text-blue-400' },
    { id: 'general_quality', name: '批量检测', icon: BarChart2, color: 'text-green-400' },
    { id: 'cleanroom_ppe', name: 'PPE检测', icon: Settings, color: 'text-cyan-400' },
    { id: 'ocr_inspection', name: 'OCR检测', icon: FileText, color: 'text-orange-400' },
    { id: 'ocr_fusion_inspection', name: '融合检测', icon: Brain, color: 'text-pink-400' },
    { id: 'unknown', name: '未知类型', icon: AlertCircle, color: 'text-gray-400' }
  ];

  // 定义质量分类
  const qualityCategories = [
    { id: 'all', name: '全部质量', color: 'text-slate-400' },
    { id: '合格', name: '合格', color: 'text-green-400' },
    { id: '存疑', name: '存疑', color: 'text-red-400' },
    { id: '需复检', name: '需复检', color: 'text-amber-400' }
  ];

  // 筛选结果
  const filteredResults = results.filter(result => {
    const categoryMatch = selectedCategory === 'all' || (result.detectionType || 'unknown') === selectedCategory;
    const qualityMatch = selectedQuality === 'all' || result.overallQuality === selectedQuality;
    return categoryMatch && qualityMatch;
  });

  // 调试信息
  console.log('🔍 检测结果页面调试信息:');
  console.log('  - 总结果数:', results.length);
  console.log('  - 过滤后结果数:', filteredResults.length);
  console.log('  - 检测结果样本:', results.slice(0, 3).map(r => ({
    id: r.id,
    detectionType: r.detectionType,
    overallQuality: r.overallQuality,
    reason: r.reason?.substring(0, 50) + '...'
  })));

  // 统计各类型的数量
  const typeStats = results.reduce((acc, result) => {
    const type = result.detectionType || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log('  - 类型统计:', typeStats);

  const getStatusInfo = (quality: string) => {
    switch (quality) {
      case '合格': return { icon: CheckCircle2, color: 'text-green-400' };
      case '存疑': return { icon: XCircle, color: 'text-red-400' };
      default: return { icon: AlertCircle, color: 'text-amber-400' };
    }
  };

  const getStandardById = (standardId: string | null) => {
    if (!standardId) return null;
    return standards.find(s => s.id === standardId);
  };

  // **NEW**: Handler for the clear button
  const handleClearResults = async () => {
    if (filteredResults.length === 0) {
      toast.error('检测结果列表已经为空');
      return;
    }

    // 确认删除数据库记录
    if (window.confirm(`确定要清空洁净用品检测结果吗？\n\n此操作将永久删除数据库中的洁净用品检测记录，无法恢复！\n\n注意：标准检测结果将保留。\n\n点击确定继续，点击取消放弃操作。`)) {
      try {
        // 清空本地状态
        await clearAllResults();

        // 尝试清空后端数据库
        // 分别清空洁净用品检测结果和标准检测结果
        const cleanroomResponse = await fetch('/api/results/clear-cleanroom/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            reason: '用户手动清空所有检测结果',
            count: filteredResults.length
          })
        });

        if (cleanroomResponse.ok) {
          const cleanroomResult = await cleanroomResponse.json();
          toast.success(`已清空洁净用品检测结果！\n删除了 ${cleanroomResult.deleted_count || filteredResults.length} 条洁净用品检测记录。\n标准检测结果已保留。`);
        } else {
          // 如果后端清空失败，至少本地已清空
          toast('本地显示已清空，但数据库清空可能不完整。请检查后端服务。', { icon: '⚠️' });
        }
      } catch (error) {
        console.error('清空失败:', error);
        toast.error('清空失败，请稍后重试。');
      }
    }
  };

  // 页面加载时自动同步数据
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('开始加载检测结果数据...');
        await syncData();
        console.log('检测结果数据加载成功');
        toast.success('数据同步成功');
      } catch (error) {
        console.error('数据同步失败:', error);
        toast.error('数据同步失败，请检查网络连接');
      }
    };

    // 立即加载数据
    loadData();

    // 设置定时刷新（每60秒）
    const interval = setInterval(loadData, 60000);

    return () => {
      clearInterval(interval);
    };
  }, [syncData]);

  // 启动自动同步（每30秒检查一次）
  useEffect(() => {
    // 从store中获取自动同步函数并启动
    const stopAutoSync = useAppStore.getState().startAutoSync();

    // 返回清理函数
    return stopAutoSync;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">检测结果</h1>
          <p className="text-sm text-slate-400 mt-1">显示所有检测结果，支持分类筛选</p>
        </div>
        {/* **MODIFIED**: Add onClick handler and disable logic */}
        <Button variant="destructive" onClick={handleClearResults} disabled={filteredResults.length === 0}>
          <Trash2 className="mr-2 h-4 w-4" />
          清空洁净用品结果 ({filteredResults.length})
        </Button>
      </div>

      {/* 分类筛选器 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            分类筛选
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 检测类型筛选 */}
          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-3">检测类型</h4>
            <div className="flex flex-wrap gap-2">
              {detectionCategories.map(category => {
                const Icon = category.icon;
                const isSelected = selectedCategory === category.id;
                const count = category.id === 'all' ? results.length : results.filter(r => (r.detectionType || 'unknown') === category.id).length;

                return (
                  <Button
                    key={category.id}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category.id)}
                    className={cn(
                      "flex items-center gap-2",
                      isSelected ? "bg-blue-600 hover:bg-blue-700" : "hover:bg-slate-700"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isSelected ? "text-white" : category.color)} />
                    <span>{category.name}</span>
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {count}
                    </Badge>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* 质量筛选 */}
          <div>
            <h4 className="text-sm font-medium text-slate-300 mb-3">质量状态</h4>
            <div className="flex flex-wrap gap-2">
              {qualityCategories.map(quality => {
                const isSelected = selectedQuality === quality.id;
                const count = quality.id === 'all' ? results.length : results.filter(r => r.overallQuality === quality.id).length;

                return (
                  <Button
                    key={quality.id}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedQuality(quality.id)}
                    className={cn(
                      "flex items-center gap-2",
                      isSelected ? "bg-blue-600 hover:bg-blue-700" : "hover:bg-slate-700"
                    )}
                  >
                    <span className={cn(isSelected ? "text-white" : quality.color)}>
                      {quality.name}
                    </span>
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {count}
                    </Badge>
                  </Button>
                );
              })}
            </div>
          </div>

          {/* 筛选结果统计 */}
          <div className="pt-4 border-t border-slate-600/30">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">
                显示 {filteredResults.length} / {results.length} 条结果
              </span>
              {(selectedCategory !== 'all' || selectedQuality !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedQuality('all');
                  }}
                  className="text-slate-400 hover:text-slate-300"
                >
                  清除筛选
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      {filteredResults.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <Layers className="mx-auto h-16 w-16" />
          <p className="mt-4">暂无检测结果</p>
          <p className="text-sm text-slate-400 mt-2">请先进行检测以查看结果</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredResults.map(result => {
            const standard = getStandardById(result.standardId);
            return (
              <Card key={result.id} className="bg-white/5 hover:bg-white/10 transition-colors cursor-pointer" onClick={() => navigate(`/results/${result.id}`)}>
                <CardHeader className="p-0">
                  <div className="relative w-full h-40">
                    <AnnotatedImage
                      imageUrl={result.image && result.image.startsWith('data:') ? result.image : result.image ? `data:image/jpeg;base64,${result.image}` : ''}
                      defects={result.defects}
                      inspectionAreas={standard?.inspectionAreas}
                      showAreas={true}
                      showDefects={true}
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className={cn("inline-flex items-center gap-2 font-semibold", getStatusInfo(result.overallQuality).color)}>
                      {React.createElement(getStatusInfo(result.overallQuality).icon, { className: "h-5 w-5" })}
                      <span>{result.overallQuality}</span>
                    </div>
                    <span className="font-mono text-lg font-bold">{result.score}分</span>
                  </div>

                  {/* 显示检测类型 */}
                  <div className="mt-2">
                    {(() => {
                      const detectionType = result.detectionType || 'unknown';
                      const category = detectionCategories.find(cat => cat.id === detectionType);
                      if (category) {
                        const Icon = category.icon;
                        return (
                          <div className="flex items-center gap-1 text-xs">
                            <Icon className={cn("w-3 h-3", category.color)} />
                            <span className={category.color}>{category.name}</span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </div>

                  {/* 显示标准信息 */}
                  {standard && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-slate-400">
                      <MapPin className="w-3 h-3" />
                      <span>{standard.name}</span>
                      {standard.inspectionAreas && standard.inspectionAreas.length > 0 && (
                        <span className="ml-1">({standard.inspectionAreas.length}个区域)</span>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-slate-400 mt-2">{format(new Date(result.timestamp), 'yyyy-MM-dd HH:mm:ss')}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ResultsScreen;
