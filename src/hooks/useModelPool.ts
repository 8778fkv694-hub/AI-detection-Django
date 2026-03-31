/**
 * 模型待选库管理 Hook
 *
 * 核心概念：
 * - **待选库（Standby Pool）**：用户选择的可用模型集合，处于待选状态
 * - **激活模型（Active Model）**：当前正在使用的模型（从待选库中选择）
 *
 * 功能：
 * - 管理待选模型池（用户从模型管理页面添加的模型）
 * - 跟踪当前激活的模型
 * - 提供添加/移除/激活模型的方法
 *
 * 工作流程：
 * 1. 用户在模型管理页面将模型"加入待选库"
 * 2. 在检测页面从待选库中"激活"某个模型
 * 3. 激活操作调用后端API切换模型
 *
 * 数据存储：localStorage
 * API复用：switchPPEModel
 */

import { useState, useEffect, useCallback } from 'react';
import { switchPPEModel, getAvailableModels } from '@/lib/api';
import toast from 'react-hot-toast';

export interface ModelInPool {
  id: string;
  name: string;
  description?: string;
  detection_type?: string;
}

interface ModelPoolState {
  // 可选模型池（多选的模型列表）
  modelPool: ModelInPool[];
  // 当前激活的模型ID
  activeModelId: string;
  // 是否正在加载
  isLoading: boolean;
  // 是否正在切换模型
  isSwitching: boolean;
}

const STORAGE_KEY = 'model_pool_v1';

export const useModelPool = () => {
  const [state, setState] = useState<ModelPoolState>({
    modelPool: [],
    activeModelId: '',
    isLoading: true,
    isSwitching: false,
  });

  // 从 localStorage 加载模型池
  const loadFromStorage = useCallback((): ModelInPool[] => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('加载模型池失败:', error);
    }
    return [];
  }, []);

  // 保存模型池到 localStorage
  const saveToStorage = useCallback((pool: ModelInPool[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pool));
    } catch (error) {
      console.error('保存模型池失败:', error);
    }
  }, []);

  // 初始化：加载模型池和当前模型
  useEffect(() => {
    const init = async () => {
      // 先加载已保存的模型池（同步操作）
      const savedPool = loadFromStorage();

      try {
        setState(prev => ({ ...prev, isLoading: true }));

        // 获取当前激活的模型
        const { current_model } = await getAvailableModels();

        setState(prev => ({
          ...prev,
          modelPool: savedPool,
          activeModelId: current_model,
          isLoading: false,
          isSwitching: false,
        }));
      } catch (error) {
        console.error('初始化模型池失败:', error);
        // 即使API失败，也要加载本地的模型池
        setState(prev => ({
          ...prev,
          modelPool: savedPool,
          isLoading: false,
        }));
      }
    };

    init();
  }, [loadFromStorage]);

  // 添加模型到池
  const addToPool = useCallback((models: ModelInPool | ModelInPool[]) => {
    const modelsArray = Array.isArray(models) ? models : [models];

    setState(prev => {
      const newPool = [...prev.modelPool];

      modelsArray.forEach(model => {
        // 检查是否已存在
        if (!newPool.some(m => m.id === model.id)) {
          newPool.push(model);
        }
      });

      saveToStorage(newPool);

      return {
        ...prev,
        modelPool: newPool,
      };
    });

    toast.success(`已添加 ${modelsArray.length} 个模型到待选库`);
  }, [saveToStorage]);

  // 从池中移除模型
  const removeFromPool = useCallback((modelId: string) => {
    setState(prev => {
      const newPool = prev.modelPool.filter(m => m.id !== modelId);
      saveToStorage(newPool);

      return {
        ...prev,
        modelPool: newPool,
      };
    });

    toast.success('已从待选库移除模型');
  }, [saveToStorage]);

  // 清空模型池
  const clearPool = useCallback(() => {
    setState(prev => ({
      ...prev,
      modelPool: [],
    }));
    saveToStorage([]);
    toast.success('已清空待选库');
  }, [saveToStorage]);

  // 激活模型（从待选库中选择并激活）
  const switchModel = useCallback(async (modelId: string) => {
    try {
      // 先获取模型名称（在setState之前，避免闭包问题）
      const model = state.modelPool.find(m => m.id === modelId);

      setState(prev => ({ ...prev, isSwitching: true }));

      // 调用后端API激活模型
      const result = await switchPPEModel(modelId);

      setState(prev => ({
        ...prev,
        activeModelId: result.current_model,
        isSwitching: false,
      }));

      toast.success(`已激活模型: ${model?.name || modelId}`);

      return true;
    } catch (error) {
      console.error('切换模型失败:', error);
      setState(prev => ({ ...prev, isSwitching: false }));
      toast.error('切换模型失败，请重试');
      return false;
    }
  }, [state.modelPool]);

  // 检查模型是否在池中
  const isInPool = useCallback((modelId: string) => {
    return state.modelPool.some(m => m.id === modelId);
  }, [state.modelPool]);

  // 批量设置模型池（用于从后端同步）
  const setModelPool = useCallback((models: ModelInPool[]) => {
    setState(prev => ({
      ...prev,
      modelPool: models,
    }));
    saveToStorage(models);
  }, [saveToStorage]);

  return {
    // 状态
    modelPool: state.modelPool,
    activeModelId: state.activeModelId,
    isLoading: state.isLoading,
    isSwitching: state.isSwitching,

    // 派生状态
    poolSize: state.modelPool.length,
    hasModels: state.modelPool.length > 0,
    activeModel: state.modelPool.find(m => m.id === state.activeModelId),

    // 方法
    addToPool,
    removeFromPool,
    clearPool,
    switchModel,
    isInPool,
    setModelPool,
  };
};
