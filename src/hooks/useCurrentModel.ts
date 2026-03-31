import { useState, useEffect } from 'react';
import { getAvailableModels } from '@/lib/api';

export const useCurrentModel = () => {
  const [currentModel, setCurrentModel] = useState<string>('');
  const [modelName, setModelName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentModel = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await getAvailableModels();
      const currentModelId = response.current_model;
      const model = response.models.find(m => m.id === currentModelId);
      
      setCurrentModel(currentModelId);
      setModelName(model?.name || currentModelId);
      return {
        currentModelId,
        modelName: model?.name || currentModelId,
      };
    } catch (err) {
      console.error('获取当前模型信息失败:', err);
      setError(err instanceof Error ? err.message : '获取模型信息失败');
      setCurrentModel('unknown');
      setModelName('未知模型');
      return {
        currentModelId: 'unknown',
        modelName: '未知模型',
      };
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCurrentModel();
  }, []);

  return {
    currentModel,
    modelName,
    isLoading,
    error,
    refresh: fetchCurrentModel
  };
};
