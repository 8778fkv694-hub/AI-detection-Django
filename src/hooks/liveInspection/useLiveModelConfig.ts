/**
 * Live Model Config Hook
 *
 * 用途：管理YOLO模型配置
 * 功能：加载模型配置、获取目标中文名称、获取可用目标列表
 * 使用位置：LiveInspectionScreen
 */

import { useState, useCallback, useEffect, useMemo } from 'react';
import { getModelConfig, getAvailableModels, type ModelConfig } from '@/lib/api';

export interface UseLiveModelConfigOptions {
  /** 当前YOLO模型ID */
  currentYoloModel: string;
}

export interface UseLiveModelConfigResult {
  /** 模型配置 */
  modelConfig: ModelConfig | null;
  /** 是否正在加载配置 */
  isLoadingConfig: boolean;
  /** 加载模型配置 */
  loadModelConfig: (modelId: string | null) => Promise<void>;
  /** 获取目标的中文名称 */
  getTargetChineseName: (target: string) => string;
  /** 获取可用的检测目标列表 */
  getAvailableTargets: () => string[];
  /** 检测目标选项（包含value和label） */
  detectionTargets: Array<{ value: string; label: string }>;
  /** 获取当前YOLO模型信息 */
  fetchCurrentYoloModel: () => Promise<string>;
}

export const useLiveModelConfig = ({
  currentYoloModel,
}: UseLiveModelConfigOptions): UseLiveModelConfigResult => {
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  // 加载模型配置
  const loadModelConfig = useCallback(async (modelId: string | null) => {
    if (!modelId || modelId === '未知模型' || modelId === '获取失败') {
      setModelConfig(null);
      return;
    }

    setIsLoadingConfig(true);
    try {
      const result = await getModelConfig(modelId);
      if (result.model) {
        setModelConfig(result.model);
        console.log('✅ 实时检测页面已加载模型配置:', result.model);
      } else {
        console.warn('⚠️ 实时检测页面未找到模型配置:', modelId);
        setModelConfig(null);
      }
    } catch (error) {
      console.error('❌ 实时检测页面加载模型配置失败:', error);
      setModelConfig(null);
    } finally {
      setIsLoadingConfig(false);
    }
  }, []);

  // 当模型切换时，重新加载配置
  useEffect(() => {
    if (currentYoloModel && currentYoloModel !== '未知模型' && currentYoloModel !== '获取失败') {
      loadModelConfig(currentYoloModel);
    } else {
      setModelConfig(null);
    }
  }, [currentYoloModel, loadModelConfig]);

  // 获取目标中文名称
  const getTargetChineseName = useCallback(
    (target: string) => {
      if (modelConfig?.class_names && modelConfig.class_names[target]) {
        return modelConfig.class_names[target];
      }
      return target;
    },
    [modelConfig]
  );

  // 获取可用的检测目标（仅从后端获取）
  const getAvailableTargets = useCallback(() => {
    if (modelConfig && modelConfig.classes && modelConfig.classes.length > 0) {
      return modelConfig.classes;
    }
    return [];
  }, [modelConfig]);

  // 检测目标选项列表
  const detectionTargets = useMemo(() => {
    if (modelConfig && modelConfig.classes && modelConfig.classes.length > 0 && modelConfig.class_names) {
      return modelConfig.classes.map((className) => ({
        value: className,
        label: modelConfig.class_names?.[className] || className,
      }));
    }
    return [];
  }, [modelConfig]);

  // 获取当前YOLO模型信息
  const fetchCurrentYoloModel = useCallback(async () => {
    try {
      const modelInfo = await getAvailableModels();
      const currentModel = modelInfo.current_model || '未知模型';
      console.log('当前YOLO模型:', currentModel);
      return currentModel;
    } catch (error) {
      console.error('获取YOLO模型信息失败:', error);
      return '获取失败';
    }
  }, []);

  return {
    modelConfig,
    isLoadingConfig,
    loadModelConfig,
    getTargetChineseName,
    getAvailableTargets,
    detectionTargets,
    fetchCurrentYoloModel,
  };
};
