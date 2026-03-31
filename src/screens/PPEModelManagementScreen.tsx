import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { RefreshCw, CheckCircle, Play, AlertCircle, HardDrive, Cpu, Trash2, Database } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAvailableModels, switchPPEModel, removeModelFromPool, getModelPoolStatus } from '@/lib/api';

interface PPEModel {
  id: string;
  name: string;
  file: string;
  description: string;
  version?: string;
  created_at?: string;
  classes: string[];
  confidence_threshold: number;
  iou_threshold: number;
  is_default: boolean;
  category: string;
  file_size: number;
  exists: boolean;
}

interface ModelPoolStatus {
  loaded_models: string[];
  pool_size: number;
  max_pool_size: number;
  current_model: string | null;
  model_last_used: Record<string, string>;
}

const PPEModelManagementScreen: React.FC = () => {
  const [ppeModels, setPpeModels] = useState<PPEModel[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [modelPoolStatus, setModelPoolStatus] = useState<ModelPoolStatus | null>(null);
  const [removingModelId, setRemovingModelId] = useState<string | null>(null);

  // 加载PPE检测模型列表
  const loadPPEModels = async () => {
    try {
      const ppeModelsData = await getAvailableModels();
      setPpeModels(ppeModelsData.models);
      setCurrentModel(ppeModelsData.current_model);
      console.log('PPE模型列表加载成功:', ppeModelsData);
    } catch (error) {
      console.error('加载PPE模型列表失败:', error);
      toast.error('加载PPE模型列表失败');
    }
  };

  // 加载模型池状态
  const loadModelPoolStatus = async () => {
    try {
      const poolStatus = await getModelPoolStatus();
      setModelPoolStatus(poolStatus);
      console.log('模型池状态:', poolStatus);
    } catch (error) {
      console.error('加载模型池状态失败:', error);
    }
  };

  // 切换PPE模型
  const handleSwitchModel = async (modelId: string) => {
    if (modelId === currentModel) {
      toast('当前已经是该模型');
      return;
    }

    setIsLoading(true);
    try {
      const result = await switchPPEModel(modelId);
      setCurrentModel(result.current_model);
      toast.success(`成功切换到模型: ${result.model_id}`);
      console.log('模型切换成功:', result);
      // 刷新模型池状态
      await loadModelPoolStatus();
    } catch (error) {
      console.error('模型切换失败:', error);
      toast.error(`模型切换失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 从模型池移除模型
  const handleRemoveFromPool = async (modelId: string) => {
    if (!confirm(`确定要从模型池中移除模型 ${modelId} 吗？\n\n这将释放该模型占用的内存，但不会删除模型文件。`)) {
      return;
    }

    setRemovingModelId(modelId);
    try {
      const result = await removeModelFromPool(modelId);
      if (result.success) {
        toast.success(result.message);
        console.log('模型移除成功:', result);
        // 刷新模型池状态
        await loadModelPoolStatus();
      } else {
        toast.error(result.message);
      }
    } catch (error) {
      console.error('移除模型失败:', error);
      toast.error(`移除模型失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setRemovingModelId(null);
    }
  };

  // 刷新数据
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadPPEModels(), loadModelPoolStatus()]);
      toast.success('数据已刷新');
    } catch (error) {
      toast.error('刷新数据失败');
    } finally {
      setIsRefreshing(false);
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 获取类别标签颜色
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'ppe_specialized':
        return 'bg-blue-500';
      case 'ppe_comprehensive':
        return 'bg-green-500';
      case 'general':
        return 'bg-yellow-500';
      case 'lightweight':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  useEffect(() => {
    loadPPEModels();
    loadModelPoolStatus();
  }, []);

  return (
    <div className="container mx-auto p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6 max-w-full overflow-x-hidden">
      {/* 页面标题 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white">模型管理</h1>
          <p className="text-slate-400 mt-1 sm:mt-2 text-sm sm:text-base">管理和切换不同的检测模型</p>
        </div>
        <Button
          onClick={refreshData}
          disabled={isRefreshing}
          variant="outline"
          className="flex items-center gap-2 w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? '刷新中...' : '刷新'}
        </Button>
      </div>

      {/* 当前模型状态和模型池状态 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              当前模型状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-400" />
                <span className="text-white font-medium">当前模型:</span>
                <Badge variant="secondary" className="text-sm">
                  {currentModel || '未知'}
                </Badge>
              </div>
              <div className="text-slate-400 text-sm">
                可用模型数量: {ppeModels.length}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Database className="h-5 w-5" />
              模型池状态
            </CardTitle>
          </CardHeader>
          <CardContent>
            {modelPoolStatus ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-5 w-5 text-blue-400" />
                  <span className="text-white font-medium">已加载:</span>
                  <Badge variant="secondary" className="text-sm">
                    {modelPoolStatus.pool_size} / {modelPoolStatus.max_pool_size}
                  </Badge>
                </div>
                {modelPoolStatus.loaded_models.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 sm:gap-2">
                    {modelPoolStatus.loaded_models.map((modelId) => (
                      <Badge key={modelId} className="bg-blue-500 text-xs break-all">
                        {modelId}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-400 text-xs sm:text-sm">暂无已加载的模型</p>
                )}
              </div>
            ) : (
              <div className="text-slate-400 text-sm">加载中...</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 模型列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
        {ppeModels.map((model) => (
          <Card
            key={model.id}
            className={`bg-slate-800 border-slate-700 ${model.id === currentModel ? 'ring-2 ring-blue-500' : ''
              }`}
          >
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-white text-base sm:text-lg break-words">{model.name}</CardTitle>

                  {/* 模型介绍 */}
                  {model.description && (
                    <p className="text-slate-400 text-xs mt-1">
                      {model.description}
                    </p>
                  )}

                  {/* 标签区域 - 重新排列 */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2">
                    <Badge className={`${getCategoryColor(model.category)} text-xs`}>
                      {model.category}
                    </Badge>
                    {model.is_default && (
                      <Badge variant="secondary" className="text-xs">默认</Badge>
                    )}
                    {model.exists ? (
                      <Badge className="bg-green-500 text-xs">可用</Badge>
                    ) : (
                      <Badge className="bg-red-500 text-xs">不可用</Badge>
                    )}
                    {/* 版本和时间信息 */}
                    {model.version && (
                      <Badge variant="outline" className="text-xs text-slate-400">
                        {model.version}
                      </Badge>
                    )}
                    {model.created_at && (
                      <Badge variant="outline" className="text-xs text-slate-400">
                        {model.created_at}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right self-start shrink-0">
                  <div className="text-slate-400 text-xs sm:text-sm whitespace-nowrap">
                    {formatFileSize(model.file_size)}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 pt-3">
              {/* 模型参数 */}
              <div className="grid grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                <div className="min-w-0">
                  <span className="text-slate-400 block sm:inline">置信度:</span>
                  <span className="text-white ml-0 sm:ml-2 block sm:inline">{model.confidence_threshold}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-slate-400 block sm:inline">IoU:</span>
                  <span className="text-white ml-0 sm:ml-2 block sm:inline">{model.iou_threshold}</span>
                </div>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                <Button
                  onClick={() => handleSwitchModel(model.id)}
                  disabled={isLoading || model.id === currentModel || !model.exists}
                  className="flex-1 min-w-0 text-xs sm:text-sm"
                  size="sm"
                  variant={model.id === currentModel ? "outline" : "default"}
                >
                  {isLoading ? (
                    <div className="flex items-center gap-1.5">
                      <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white"></div>
                      <span className="hidden sm:inline">切换中...</span>
                    </div>
                  ) : model.id === currentModel ? (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>当前模型</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Play className="h-3 w-3 sm:h-4 sm:w-4" />
                      <span>切换</span>
                    </div>
                  )}
                </Button>

                {/* 如果模型已加载到池中，显示移除按钮 */}
                {modelPoolStatus?.loaded_models.includes(model.id) && (
                  <Button
                    onClick={() => handleRemoveFromPool(model.id)}
                    disabled={removingModelId === model.id}
                    variant="destructive"
                    size="sm"
                    className="flex items-center gap-1.5 shrink-0 px-2 sm:px-3"
                    title="从模型池移除"
                  >
                    {removingModelId === model.id ? (
                      <div className="animate-spin rounded-full h-3 w-3 sm:h-4 sm:w-4 border-b-2 border-white"></div>
                    ) : (
                      <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 空状态 */}
      {ppeModels.length === 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="text-center py-12">
            <AlertCircle className="h-12 w-12 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-400">暂无可用的PPE检测模型</p>
            <p className="text-slate-500 text-sm mt-2">
              请检查后端服务是否正常运行，或联系管理员添加模型
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PPEModelManagementScreen;
