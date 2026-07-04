import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import {
  Download,
  Upload,
  Trash2,
  Play,
  CheckCircle,
  AlertCircle,
  HardDrive,
  Cpu,
  Zap,
  RefreshCw,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  Smartphone
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import ModelUploadDialog from '@/components/ModelUploadDialog';
// import ConfirmDialog from '@/components/ConfirmDialog';
import { useModelPool } from '@/hooks/useModelPool';
import {
  getModelVersions,
  //   deactivateModel,
  getAvailableModels,
  ModelVersion,
  switchPPEModel
} from '@/lib/api';

interface YoloModel {
  id: string;
  name: string;
  path: string;
  type: 'ppe' | 'general' | 'custom';
  size: 'nano' | 'small' | 'medium' | 'large' | 'xlarge';
  status: 'available' | 'loading' | 'error' | 'not_found';
  description: string;
  classes: string[];
  confidence: number;
  iou: number;
  isActive: boolean;
  lastUsed?: string;
  performance?: {
    fps: number;
    accuracy: number;
    memory: number;
  };
}

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

// localStorage 键名
const STORAGE_KEYS = {
  MODELS: 'wyl_models',
  ACTIVE_MODEL: 'wyl_active_model',
  MODEL_PARAMS: 'wyl_model_params'
};

const ModelManagementScreen: React.FC = () => {
  // const { config } = useAIConfigStore();
  const [, setModels] = useState<YoloModel[]>([]);
  const [, setBackendModels] = useState<ModelVersion[]>([]);
  const [ppeModels, setPpeModels] = useState<PPEModel[]>([]);
  const [currentPPEModel, setCurrentPPEModel] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 模型池管理
  const { addToPool, removeFromPool, isInPool, modelPool } = useModelPool();
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());

  // 移动端状态
  const [isMobile, setIsMobile] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // 对话框状态
  const [showUploadDialog, setShowUploadDialog] = useState(false);

  // 检测移动端
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // 从 localStorage 加载模型数据
  const loadModelsFromStorage = (): YoloModel[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.MODELS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('加载模型数据失败:', error);
    }
    return [];
  };

  // 保存模型数据到 localStorage
  const saveModelsToStorage = (modelsData: YoloModel[]) => {
    try {
      localStorage.setItem(STORAGE_KEYS.MODELS, JSON.stringify(modelsData));
    } catch (error) {
      console.error('保存模型数据失败:', error);
    }
  };

  // 从 localStorage 加载模型参数
  const loadModelParamsFromStorage = (): Record<string, { confidence: number; iou: number }> => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.MODEL_PARAMS);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('加载模型参数失败:', error);
    }
    return {};
  };

  // 获取当前活跃模型ID
  const getActiveModelId = (): string | null => {
    try {
      return localStorage.getItem(STORAGE_KEYS.ACTIVE_MODEL);
    } catch (error) {
      console.error('获取活跃模型ID失败:', error);
      return null;
    }
  };

  // 切换卡片展开状态
  const toggleCardExpansion = (modelId: string) => {
    const newExpanded = new Set(expandedCards);
    if (newExpanded.has(modelId)) {
      newExpanded.delete(modelId);
    } else {
      newExpanded.add(modelId);
    }
    setExpandedCards(newExpanded);
  };

  // 初始化数据
  useEffect(() => {
    // 清理localStorage中的旧数据，确保只显示一个PPE模型
    cleanupOldModelData();
    loadModels();
    loadBackendModels();
    loadPPEModels(); // 加载PPE模型
  }, []);

  // 清理localStorage中的旧模型数据
  const cleanupOldModelData = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.MODELS);
      if (stored) {
        const oldModels = JSON.parse(stored);
        // 检查是否有损坏的模型数据，但不强制清理用户选择的模型
        const validModels = oldModels.filter((model: YoloModel) =>
          model && model.id && model.name && model.path
        );

        // 只有在数据损坏时才清理
        if (validModels.length !== oldModels.length) {
          localStorage.setItem(STORAGE_KEYS.MODELS, JSON.stringify(validModels));
          console.log('已清理损坏的模型数据');
        }
      }
    } catch (error) {
      console.error('清理旧模型数据失败:', error);
    }
  };

  // 加载前端模型数据
  const loadModels = () => {
    // 首先尝试从 localStorage 加载
    let storedModels = loadModelsFromStorage();

    // 如果没有存储的数据，使用默认数据
    if (storedModels.length === 0) {
      const defaultModels: YoloModel[] = [
        {
          id: 'yolov8n',
          name: 'YOLOv8 Nano',
          path: 'yolov8n.pt',
          type: 'general',
          size: 'nano',
          status: 'available',
          description: '轻量级通用检测模型，速度快，适合实时检测',
          classes: ['person', 'car', 'dog', 'cat', 'chair', 'bottle', 'cup', 'bowl', 'banana', 'apple', 'orange', 'cake', 'sandwich', 'carrot', 'broccoli', 'hot dog', 'pizza', 'donut', 'bear', 'elephant', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket', 'wine glass', 'fork', 'knife', 'spoon'],
          confidence: 0.5,
          iou: 0.45,
          isActive: false,
          performance: {
            fps: 120,
            accuracy: 85,
            memory: 6.2
          }
        },
        {
          id: 'yolov8l',
          name: 'YOLOv8 Large',
          path: 'yolov8l.pt',
          type: 'general',
          size: 'large',
          status: 'available',
          description: '高精度通用检测模型，准确率高，适合精确检测',
          classes: ['person', 'cleanroom_cap', 'mask', 'no_cleanroom_cap', 'no_mask'],
          confidence: 0.5,
          iou: 0.45,
          isActive: false,
          performance: {
            fps: 45,
            accuracy: 95,
            memory: 84
          }
        },
        {
          id: 'ppe_detection',
          name: 'PPE检测模型',
          path: 'ppe_detection.pt',
          type: 'ppe',
          size: 'large',
          status: 'available',
          description: '高精度PPE检测模型，专门用于洁净室环境和个人防护装备检测',
          classes: ['person', 'cleanroom_cap', 'mask', 'no_cleanroom_cap', 'no_mask'],
          confidence: 0.8,
          iou: 0.5,
          isActive: true,
          lastUsed: new Date().toISOString(),
          performance: {
            fps: 35,
            accuracy: 96,
            memory: 84
          }
        },
        {
          id: 'best_model',
          name: '最佳训练模型',
          path: 'filter.pt',
          type: 'custom',
          size: 'medium',
          status: 'available',
          description: '经过专门训练的最佳模型',
          classes: ['person', 'cleanroom_cap', 'mask', 'no_cleanroom_cap', 'no_mask'],
          confidence: 0.7,
          iou: 0.45,
          isActive: false,
          performance: {
            fps: 55,
            accuracy: 94,
            memory: 14
          }
        }
      ];
      storedModels = defaultModels;
      saveModelsToStorage(defaultModels);
    }

    // 应用存储的模型参数
    const storedParams = loadModelParamsFromStorage();
    const activeModelId = getActiveModelId();

    const updatedModels = storedModels.map(model => {
      const storedParam = storedParams[model.id];
      return {
        ...model,
        confidence: storedParam?.confidence ?? model.confidence,
        iou: storedParam?.iou ?? model.iou,
        // 只有在用户明确选择过的情况下才设置活跃状态
        isActive: activeModelId ? model.id === activeModelId : false
      };
    });

    setModels(updatedModels);
  };

  // 加载后端模型数据
  const loadBackendModels = async () => {
    try {
      const backendModelsData = await getModelVersions();
      setBackendModels(backendModelsData);
    } catch (error) {
      console.error('加载后端模型失败:', error);
      toast.error('加载后端模型失败');
    }
  };

  // 加载PPE检测模型列表
  const loadPPEModels = async () => {
    try {
      const ppeModelsData = await getAvailableModels();
      setPpeModels(ppeModelsData.models);
      setCurrentPPEModel(ppeModelsData.current_model);
      console.log('PPE模型列表加载成功:', ppeModelsData);
    } catch (error) {
      console.error('加载PPE模型列表失败:', error);
      toast.error('加载PPE模型列表失败');
    }
  };

  // 切换PPE模型
  const handleSwitchPPEModel = async (modelId: string) => {
    if (modelId === currentPPEModel) {
      toast('当前已经是该模型');
      return;
    }

    setIsLoading(true);
    try {
      // 调用后端API切换模型
      const result = await switchPPEModel(modelId);
      setCurrentPPEModel(result.current_model);
      toast.success(`成功切换到模型: ${result.model_id}`);
      console.log('模型切换成功:', result);

      // 刷新PPE模型列表以更新状态
      await loadPPEModels();
    } catch (error) {
      console.error('模型切换失败:', error);
      toast.error(`模型切换失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 切换模型选中状态
  const toggleModelSelection = (modelId: string) => {
    setSelectedModels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(modelId)) {
        newSet.delete(modelId);
      } else {
        newSet.add(modelId);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedModels.size === ppeModels.length) {
      setSelectedModels(new Set());
    } else {
      setSelectedModels(new Set(ppeModels.map(m => m.id)));
    }
  };

  // 添加选中的模型到可选库
  const handleAddToPool = () => {
    if (selectedModels.size === 0) {
      toast.error('请先选择要添加的模型');
      return;
    }

    const modelsToAdd = ppeModels
      .filter(m => selectedModels.has(m.id))
      .map(m => ({
        id: m.id,
        name: m.name,
        description: m.description,
        detection_type: m.category,
      }));

    addToPool(modelsToAdd);
    setSelectedModels(new Set()); // 清空选择
  };

  // 刷新数据
  const refreshData = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadModels(), loadBackendModels(), loadPPEModels()]);
      toast.success('数据已刷新');
    } catch (error) {
      toast.error('刷新数据失败');
    } finally {
      setIsRefreshing(false);
    }
  };


  return (
    <div className={cn(
      "space-y-4",
      isMobile ? "p-3" : "container mx-auto p-6 space-y-6"
    )}>
      {/* 移动端菜单按钮 */}
      {isMobile && (
        <div className="flex items-center justify-between bg-slate-800/50 rounded-lg p-3 mb-4">
          <Button
            onClick={() => setShowMobileMenu(!showMobileMenu)}
            variant="ghost"
            size="sm"
            className="text-white"
          >
            {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-blue-400" />
            <span className="text-sm text-slate-300">移动端模式</span>
          </div>
        </div>
      )}

      {/* 页面标题 */}
      <div className={cn(
        "flex items-center justify-between",
        isMobile ? "flex-col gap-3 items-start" : ""
      )}>
        <div>
          <h1 className={cn(
            "font-bold text-white",
            isMobile ? "text-2xl" : "text-3xl"
          )}>模型管理</h1>
          <p className="text-slate-400 mt-2">管理检测模型和配置</p>
        </div>
        <div className={cn(
          "flex gap-2",
          isMobile ? "w-full justify-center" : ""
        )}>
          <Button
            onClick={() => setShowUploadDialog(true)}
            variant="default"
            className={cn(
              "flex items-center gap-2",
              isMobile ? "w-full" : ""
            )}
          >
            <Upload className="h-4 w-4" />
            上传模型
          </Button>
          <Button
            onClick={refreshData}
            disabled={isRefreshing}
            variant="outline"
            className={cn(
              "flex items-center gap-2",
              isMobile ? "w-full" : ""
            )}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? '刷新中...' : '刷新'}
          </Button>
        </div>
      </div>

      {/* PPE检测模型列表 */}
      {ppeModels.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-5 w-5" />
                检测模型 ({ppeModels.length})
                {modelPool.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    待选库: {modelPool.length}
                  </Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedModels.size === ppeModels.length && ppeModels.length > 0}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-600">全选</span>
                </div>
                <Button
                  onClick={handleAddToPool}
                  disabled={selectedModels.size === 0}
                  size="sm"
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  加入待选库 ({selectedModels.size})
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className={cn(
              "gap-4",
              isMobile ? "space-y-3" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
            )}>
              {ppeModels.map((model) => (
                <Card key={model.id} className={cn(
                  "bg-slate-800/50 border-slate-600",
                  selectedModels.has(model.id) && "ring-2 ring-blue-500",
                  isMobile ? "w-full" : ""
                )}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={selectedModels.has(model.id)}
                          onChange={() => toggleModelSelection(model.id)}
                          className="h-4 w-4 rounded border-gray-300"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 justify-between">
                            <CardTitle className={cn(
                              "text-white",
                              isMobile ? "text-base" : "text-lg"
                            )}>{model.name}</CardTitle>
                            {isInPool(model.id) && (
                              <Button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFromPool(model.id);
                                }}
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                title="从待选库移除"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>

                          {/* 模型介绍 */}
                          {model.description && (
                            <p className="text-slate-400 text-xs mt-1">
                              {model.description}
                            </p>
                          )}

                          {/* 标签区域 - 重新排列 */}
                          <div className={cn(
                            "flex flex-wrap items-center gap-1.5 mt-2",
                            isMobile ? "gap-1" : "gap-1.5"
                          )}>
                            {/* 第一行：状态标签 */}
                            <Badge className="bg-blue-500 text-xs">{model.category}</Badge>
                            {model.is_default && (
                              <Badge variant="secondary" className="text-xs">默认</Badge>
                            )}
                            {model.exists ? (
                              <Badge className="bg-green-500 text-xs">可用</Badge>
                            ) : (
                              <Badge className="bg-red-500 text-xs">不可用</Badge>
                            )}
                            {isInPool(model.id) && (
                              <Badge variant="outline" className="text-xs border-purple-500 text-purple-400">
                                已在待选库
                              </Badge>
                            )}
                            {/* 第二行：版本和时间信息 */}
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
                      </div>
                      <div className="text-right">
                        <div className="text-slate-400 text-sm">
                          {(model.file_size / 1024 / 1024).toFixed(1)} MB
                        </div>
                        {/* 移动端展开/收起按钮 */}
                        {isMobile && (
                          <Button
                            onClick={() => toggleCardExpansion(model.id)}
                            variant="ghost"
                            size="sm"
                            className="ml-2 text-slate-400"
                          >
                            {expandedCards.has(model.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  {/* 移动端可折叠内容 */}
                  <CardContent className={cn(
                    "space-y-3",
                    isMobile && !expandedCards.has(model.id) ? "hidden" : ""
                  )}>
                    {/* 模型参数 */}
                    <div className={cn(
                      "text-sm",
                      isMobile ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-3"
                    )}>
                      <div className={cn(
                        isMobile ? "flex justify-between" : ""
                      )}>
                        <span className="text-slate-400">置信度:</span>
                        <span className={cn(
                          "text-white",
                          isMobile ? "" : "ml-2"
                        )}>{model.confidence_threshold}</span>
                      </div>
                      <div className={cn(
                        isMobile ? "flex justify-between" : ""
                      )}>
                        <span className="text-slate-400">IoU:</span>
                        <span className={cn(
                          "text-white",
                          isMobile ? "" : "ml-2"
                        )}>{model.iou_threshold}</span>
                      </div>
                    </div>

                    {/* 当前状态 */}
                    <div className="text-center">
                      {model.id === currentPPEModel ? (
                        <Badge className="bg-green-500 text-white">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          当前模型
                        </Badge>
                      ) : (
                        <Button
                          onClick={() => handleSwitchPPEModel(model.id)}
                          disabled={isLoading || !model.exists}
                          className="w-full"
                          variant="default"
                          size="sm"
                        >
                          {isLoading ? (
                            <div className="flex items-center gap-2">
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              切换中...
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Play className="h-4 w-4" />
                              切换到此模型
                            </div>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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

      {/* 模型使用统计 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5" />
            模型使用统计
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={cn(
            "gap-4",
            isMobile ? "grid grid-cols-1 gap-3" : "grid grid-cols-1 md:grid-cols-3"
          )}>
            <div className={cn(
              "text-center p-4 bg-slate-800/50 rounded-lg",
              isMobile ? "p-3" : ""
            )}>
              <Cpu className={cn(
                "text-blue-500 mx-auto mb-2",
                isMobile ? "h-6 w-6" : "h-8 w-8"
              )} />
              <p className={cn(
                "font-bold text-white",
                isMobile ? "text-xl" : "text-2xl"
              )}>{ppeModels.length}</p>
              <p className={cn(
                "text-slate-400",
                isMobile ? "text-xs" : "text-sm"
              )}>可用PPE模型</p>
            </div>
            <div className={cn(
              "text-center p-4 bg-slate-800/50 rounded-lg",
              isMobile ? "p-3" : ""
            )}>
              <CheckCircle className={cn(
                "text-green-500 mx-auto mb-2",
                isMobile ? "h-6 w-6" : "h-8 w-8"
              )} />
              <p className={cn(
                "font-bold text-white",
                isMobile ? "text-xl" : "text-2xl"
              )}>{currentPPEModel || '无'}</p>
              <p className={cn(
                "text-slate-400",
                isMobile ? "text-xs" : "text-sm"
              )}>当前模型</p>
            </div>
            <div className={cn(
              "text-center p-4 bg-slate-800/50 rounded-lg",
              isMobile ? "p-3" : ""
            )}>
              <Zap className={cn(
                "text-yellow-500 mx-auto mb-2",
                isMobile ? "h-6 w-6" : "h-8 w-8"
              )} />
              <p className={cn(
                "font-bold text-white",
                isMobile ? "text-xl" : "text-2xl"
              )}>{ppeModels.filter(m => m.exists).length}</p>
              <p className={cn(
                "text-slate-400",
                isMobile ? "text-xs" : "text-sm"
              )}>可用模型</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 模型上传对话框 */}
      <ModelUploadDialog
        isOpen={showUploadDialog}
        onClose={() => setShowUploadDialog(false)}
        onSuccess={refreshData}
      />
    </div>
  );
};

export default ModelManagementScreen;
