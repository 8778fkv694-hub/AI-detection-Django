import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { AlertCircle, RefreshCw, Settings, X } from 'lucide-react';
import { getAvailableModels, switchPPEModel } from '@/lib/api';
import toast from 'react-hot-toast';

import { useNavigate } from 'react-router-dom';

interface ModelUnavailableDialogProps {
  isOpen: boolean;
  onClose: () => void;
  errorMessage: string;
  errorType: 'model_unavailable' | 'specific_model_unavailable';
  onModelSwitched?: () => void;
}

interface PPEModel {
  id: string;
  name: string;
  exists: boolean;
  is_default: boolean;
}

const ModelUnavailableDialog: React.FC<ModelUnavailableDialogProps> = ({
  isOpen,
  onClose,
  errorMessage,
  errorType,
  onModelSwitched
}) => {
  const navigate = useNavigate();
  const [availableModels, setAvailableModels] = React.useState<PPEModel[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [selectedModel, setSelectedModel] = React.useState<string>('');

  // 加载可用模型列表
  React.useEffect(() => {
    if (isOpen) {
      loadAvailableModels();
    }
  }, [isOpen]);

  const loadAvailableModels = async () => {
    try {
      const response = await getAvailableModels();
      const models = response.models.filter((model: PPEModel) => model.exists);
      setAvailableModels(models);
      
      // 自动选择第一个可用模型
      if (models.length > 0) {
        setSelectedModel(models[0].id);
      }
    } catch (error) {
      console.error('加载可用模型失败:', error);
      toast.error('加载可用模型失败');
    }
  };

  const handleSwitchModel = async () => {
    if (!selectedModel) {
      toast.error('请选择一个模型');
      return;
    }

    setIsLoading(true);
    try {
      await switchPPEModel(selectedModel);
      toast.success(`成功切换到模型: ${selectedModel}`);
      onModelSwitched?.();
      onClose();
    } catch (error) {
      console.error('模型切换失败:', error);
      toast.error(`模型切换失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    try {
      await loadAvailableModels();
      toast.success('模型列表已刷新');
    } catch (error) {
      toast.error('刷新失败');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModelManagement = () => {
    // 统一使用应用内路由。旧的 /model-management 路径没有对应 Route，
    // 在 Web 中会打开空白页，在 APK 中也会落到未匹配页面。
    navigate('/models');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              模型不可用
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* 错误信息 */}
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-700">{errorMessage}</p>
          </div>

          {/* 可用模型选择 */}
          {availableModels.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  选择可用模型:
                </label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={isLoading}
                >
                  <RefreshCw className="h-4 w-4" />
                  刷新
                </Button>
              </div>
              
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {availableModels.map((model) => (
                  <label
                    key={model.id}
                    className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded border"
                  >
                    <input
                      type="radio"
                      name="model"
                      value={model.id}
                      checked={selectedModel === model.id}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      className="text-blue-600"
                    />
                    <span className="text-sm">
                      {model.name}
                      {model.is_default && (
                        <Badge className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          默认
                        </Badge>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            {availableModels.length > 0 && (
              <Button
                onClick={handleSwitchModel}
                disabled={isLoading || !selectedModel}
                className="flex-1"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    切换中...
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <RefreshCw className="h-4 w-4" />
                    切换到选中模型
                  </div>
                )}
              </Button>
            )}
            
            <Button
              variant="outline"
              onClick={handleOpenModelManagement}
              className="flex-1"
            >
              <Settings className="h-4 w-4 mr-2" />
              模型管理
            </Button>
            
            <Button
              variant="ghost"
              onClick={onClose}
              className="flex-1"
            >
              取消
            </Button>
          </div>

          {/* 提示信息 */}
          <div className="text-xs text-gray-500 text-center">
            {errorType === 'specific_model_unavailable' 
              ? '当前选择的模型不可用，请选择其他可用模型或联系管理员。'
              : '系统检测到模型不可用，请选择可用模型或联系管理员。'
            }
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ModelUnavailableDialog;
