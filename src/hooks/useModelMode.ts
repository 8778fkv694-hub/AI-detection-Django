import { useState, useEffect } from 'react';
import { DEFAULT_LLM_TASK_PROMPT, DEFAULT_LLM_USER_MESSAGE } from '@/lib/llmPrompt';
import { directBackendFetch } from '@/lib/config';

export type ModelMode = 'online' | 'local';

interface ModelModeConfig {
  mode: ModelMode;
  localModelConfig: {
    modelName: string;
    ollamaHost?: string;
    systemPrompt: string;
    userMessage: string;
    temperature: number;
    maxTokens: number;
    topP: number;
    topK: number;
    repeatPenalty: number;
    // 新增的优化配置选项
    contextLength?: number;
    memoryOptimization?: boolean;
    timeout?: number;
    retryAttempts?: number;
    batchSize?: number;
  };
}

const DEFAULT_LOCAL_CONFIG = {
  modelName: 'gemma4:e2b-it-qat',
  ollamaHost: '', // 留空则默认使用后端 localhost
  systemPrompt: DEFAULT_LLM_TASK_PROMPT,
  userMessage: DEFAULT_LLM_USER_MESSAGE,
  temperature: 0.1,
  maxTokens: 512,
  topP: 0.9,
  topK: 40,
  repeatPenalty: 1.1,
  // 性能优化参数默认值
  contextLength: 8192,
  timeout: 120000,
  retryAttempts: 3,
  memoryOptimization: false,
  batchSize: 1
};

export const useModelMode = () => {
  const [config, setConfig] = useState<ModelModeConfig>({
    mode: 'online',
    localModelConfig: DEFAULT_LOCAL_CONFIG
  });

  const [isLoading, setIsLoading] = useState(true);

  // 从localStorage加载配置
  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem('modelModeConfig');
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        const loadedLocalConfig = { ...DEFAULT_LOCAL_CONFIG, ...parsed.localModelConfig };

        // 自动升级旧的默认模型名称
        if (loadedLocalConfig.modelName === 'gemma4:e4b') {
          loadedLocalConfig.modelName = 'gemma4:e2b-it-qat';
        }
        // 自动将默认的 0.2 温度纠正为更稳定的 0.1
        if (loadedLocalConfig.modelName === 'gemma4:e2b-it-qat' && loadedLocalConfig.temperature === 0.2) {
          loadedLocalConfig.temperature = 0.1;
        }

        setConfig({
          mode: parsed.mode || 'online',
          localModelConfig: loadedLocalConfig
        });
      }
    } catch (error) {
      console.error('加载模型模式配置失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);


  // 切换模型模式
  const setMode = (mode: ModelMode) => {
    // 立即更新状态，不等待localStorage保存
    const updatedConfig = { ...config, mode };
    setConfig(updatedConfig);
    
    // 异步保存到localStorage
    try {
      localStorage.setItem('modelModeConfig', JSON.stringify(updatedConfig));
    } catch (error) {
      console.error('保存模型模式配置失败:', error);
    }
  };

  // 更新本地模型配置
  const updateLocalModelConfig = (localConfig: Partial<typeof DEFAULT_LOCAL_CONFIG>) => {
    const updatedLocalConfig = { ...config.localModelConfig, ...localConfig };
    const updatedConfig = { ...config, localModelConfig: updatedLocalConfig };
    
    // 立即更新状态
    setConfig(updatedConfig);
    
    // 异步保存到localStorage
    try {
      localStorage.setItem('modelModeConfig', JSON.stringify(updatedConfig));
    } catch (error) {
      console.error('保存本地模型配置失败:', error);
    }
  };

  // 检查本地模型是否可用
  const checkLocalModelAvailable = async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒超时
      
      const host = config.localModelConfig.ollamaHost?.trim();
      const url = host
        ? `/ollama/status/?ollama_host=${encodeURIComponent(host)}`
        : '/ollama/status/';
      const response = await directBackendFetch(url, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        return data.success === true && Array.isArray(data.models) && data.models.length > 0;
      }
      return false;
    } catch (error) {
      console.error('检查本地模型失败:', error);
      return false;
    }
  };

  return {
    mode: config.mode,
    localModelConfig: config.localModelConfig,
    isLoading,
    setMode,
    updateLocalModelConfig,
    checkLocalModelAvailable,
    isOnlineMode: config.mode === 'online',
    isLocalMode: config.mode === 'local'
  };
};
