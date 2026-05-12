import { useState, useEffect, useRef } from 'react';
import { getAvailableModels } from '@/lib/api';

const MAX_RETRIES = 5;
const RETRY_INTERVAL_MS = 2000;

export const useCurrentModel = () => {
  const [currentModel, setCurrentModel] = useState<string>('');
  const [modelName, setModelName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchCurrentModel = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await getAvailableModels();
      const currentModelId = response.current_model;
      const model = response.models.find(m => m.id === currentModelId);
      
      // S1修复：如果模型池为空（冷启动未完成），且未超重试次数，则轮询等待
      if (!currentModelId && retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setIsRetrying(true);
        console.log(`⏳ 模型池尚未就绪，${retryCountRef.current}/${MAX_RETRIES} 次轮询…`);
        retryTimerRef.current = setTimeout(fetchCurrentModel, RETRY_INTERVAL_MS);
        return;
      }
      
      setIsRetrying(false);
      retryCountRef.current = 0;
      setCurrentModel(currentModelId || '');
      setModelName(model?.name || currentModelId || '');
      return {
        currentModelId: currentModelId || '',
        modelName: model?.name || currentModelId || '',
      };
    } catch (err) {
      console.error('获取当前模型信息失败:', err);
      // 网络错误也尝试重试
      if (retryCountRef.current < MAX_RETRIES) {
        retryCountRef.current++;
        setIsRetrying(true);
        retryTimerRef.current = setTimeout(fetchCurrentModel, RETRY_INTERVAL_MS);
        return;
      }
      setError(err instanceof Error ? err.message : '获取模型信息失败');
      setCurrentModel('unknown');
      setModelName('未知模型');
      return {
        currentModelId: 'unknown',
        modelName: '未知模型',
      };
    } finally {
      if (!isRetrying) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchCurrentModel();
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
      }
    };
  }, []);

  return {
    currentModel,
    modelName,
    isLoading,
    isRetrying,
    error,
    refresh: fetchCurrentModel
  };
};
