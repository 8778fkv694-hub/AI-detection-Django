/**
 * Model Config Hook
 *
 * 用途：管理OCR检测页面的模型配置
 * 功能：加载模型配置、获取目标中文名称、获取可用目标列表、自动同步selectedTargets
 * 使用位置：OCRDetectionScreen
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { getModelConfig, type ModelConfig } from '@/lib/api';
import { useCurrentModel } from '@/hooks/useCurrentModel';
import labelTranslations from '@/data/label_translations.json';

export interface UseModelConfigOptions {
  /** 当前选中的目标列表 */
  selectedTargets: string[];
  /** 设置选中的目标列表 */
  setSelectedTargets: (targets: string[]) => void;
  /** 持久化的模型ID（从Store读取） */
  persistedModelId: string | null;
  /** 设置持久化的模型ID（保存到Store） */
  setPersistedModelId: (modelId: string | null) => void;
  /** 配方应用期间抑制自动选择目标（配方自己会设） */
  suppressAutoSelectRef?: React.MutableRefObject<boolean>;
}

export interface UseModelConfigResult {
  /** 当前模型ID */
  currentModel: string | null;
  /** 模型名称 */
  modelName: string;
  /** 模型是否正在加载 */
  modelLoading: boolean;
  /** 刷新模型 */
  refreshModel: () => void;
  /** 模型配置 */
  modelConfig: ModelConfig | null;
  /** 是否正在加载配置 */
  isLoadingConfig: boolean;
  /** 加载模型配置，返回是否成功 */
  loadModelConfig: (modelId: string | null) => Promise<boolean | undefined>;
  /** 获取目标中文名称 */
  getTargetChineseName: (target: string | null | undefined) => string;
  /** 获取可用的检测目标列表 */
  getAvailableTargets: () => string[];
}

export const useModelConfig = ({
  selectedTargets,
  setSelectedTargets,
  persistedModelId,
  setPersistedModelId,
  suppressAutoSelectRef,
}: UseModelConfigOptions): UseModelConfigResult => {
  // 使用 useCurrentModel hook（获取后端的当前模型，作为备用）
  const {
    currentModel: backendCurrentModel,
    modelName: backendModelName,
    isLoading: modelLoading,
    refresh: refreshBackendModel,
  } = useCurrentModel();

  // 🔧 修复：优先使用前端持久化的模型ID，如果没有则使用后端返回的
  const currentModel = persistedModelId || backendCurrentModel;

  // 模型配置状态
  const [modelConfig, setModelConfig] = useState<ModelConfig | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);

  // 🔧 修复：modelName 优先从 modelConfig 获取，避免空字符串
  const modelName = modelConfig?.name || backendModelName || '';

  // 用于跟踪首次加载和模型变化的refs
  const isInitialLoadRef = useRef(true);
  const previousModelRef = useRef<string | null>(null);
  const previousModelConfigRef = useRef<ModelConfig | null>(null);
  const lastLoadedModelRef = useRef<string | null>(null); // 🔧 新增：记录上次加载的模型ID，避免重复加载

  // 加载模型配置
  const loadModelConfig = useCallback(async (modelId: string | null) => {
    if (!modelId) {
      setModelConfig(null);
      return;
    }

    setIsLoadingConfig(true);
    try {
      const result = await getModelConfig(modelId);
      if (result.model) {
        setModelConfig(result.model);
        console.log('✅ OCR页面已加载模型配置:', result.model);
        console.log('📋 模型ID:', modelId);
        console.log('📋 模型类别:', result.model.classes);
        console.log('📋 模型分类:', result.model.class_categories);
        return true; // 加载成功
      } else {
        console.warn('⚠️ OCR页面未找到模型配置:', modelId);
        setModelConfig(null);
        return false; // 加载失败
      }
    } catch (error) {
      console.error('❌ OCR页面加载模型配置失败:', error);
      setModelConfig(null);
      return false; // 加载失败
    } finally {
      setIsLoadingConfig(false);
    }
  }, []);

  // 当模型切换时，重新加载配置，并持久化模型ID
  useEffect(() => {
    const loadWithFallback = async () => {
      if (currentModel) {
        // 🔧 修复：只有当模型ID真正变化时才加载配置，避免重复API调用
        if (lastLoadedModelRef.current !== currentModel) {
          lastLoadedModelRef.current = currentModel;
          const success = await loadModelConfig(currentModel);

          if (success) {
            // 加载成功，持久化模型ID到Store（只有当与持久化值不同时才更新）
            if (persistedModelId !== currentModel) {
              console.log('📦 持久化模型ID:', currentModel);
              setPersistedModelId(currentModel);
            }
          } else {
            // 🔧 修复场景4&5：加载失败时的回退逻辑
            console.warn(
              `⚠️ 模型 ${currentModel} 加载失败，尝试回退到后端默认模型`
            );

            // 如果当前尝试的是持久化的模型（不是后端返回的），则清除无效的持久化值
            if (persistedModelId === currentModel && backendCurrentModel) {
              console.log('🔄 清除无效的持久化模型ID，回退到后端模型:', backendCurrentModel);
              setPersistedModelId(null); // 清除无效的持久化值
              // 下一个渲染周期会自动使用 backendCurrentModel
            } else if (!backendCurrentModel) {
              // 如果后端也没有返回模型，清空持久化值
              console.warn('⚠️ 后端也没有返回可用模型');
              setPersistedModelId(null);
            }
            // 重置 lastLoadedModelRef 以允许重试
            lastLoadedModelRef.current = null;
          }
        }
      } else {
        setModelConfig(null);
        lastLoadedModelRef.current = null;
      }
    };

    loadWithFallback();
  }, [currentModel, loadModelConfig, persistedModelId, setPersistedModelId, backendCurrentModel]);

  const refreshModel = useCallback(async () => {
    // 允许手动刷新时重新拉取后端状态并强制刷新当前页面模型配置
    lastLoadedModelRef.current = null;
    const refreshed = await refreshBackendModel();
    const targetModelId = refreshed?.currentModelId || persistedModelId || backendCurrentModel;
    if (targetModelId) {
      await loadModelConfig(targetModelId);
      setPersistedModelId(targetModelId);
    } else {
      setModelConfig(null);
    }
  }, [refreshBackendModel, persistedModelId, backendCurrentModel, loadModelConfig, setPersistedModelId]);




  // 备用中文名称映射（当后端配置未加载或缺失时使用）
  const FALLBACK_CLASS_NAMES: Record<string, string> = labelTranslations;

  // 目标名称中文翻译（优先后端，后备前端映射）
  const getTargetChineseName = useCallback(
    (target: string | null | undefined) => {
      // 处理 null 或 undefined 值
      if (!target || typeof target !== 'string') {
        return '';
      }

      // 1. 优先使用后端返回的中文名称映射
      if (modelConfig?.class_names && modelConfig.class_names[target]) {
        return modelConfig.class_names[target];
      }

      // 2. 如果后端没有提供，尝试使用前端备用映射
      if (FALLBACK_CLASS_NAMES[target]) {
        return FALLBACK_CLASS_NAMES[target];
      }

      // 3. 如果都没有，直接返回类别名称
      console.warn(
        `⚠️ OCR页面：类别 "${target}" 没有对应的中文名称映射`
      );
      return target;
    },
    [modelConfig]
  );

  // 根据当前模型获取可用的检测目标（仅从后端获取，无硬编码）
  const getAvailableTargets = useCallback(() => {
    // 仅从API获取的模型配置
    if (modelConfig && modelConfig.classes && modelConfig.classes.length > 0) {
      // 过滤掉 null、undefined 和非字符串值
      const targets = modelConfig.classes.filter(
        (target) => target != null && typeof target === 'string'
      );
      return targets;
    }

    // 如果API配置未加载，返回空数组（不进行硬编码）
    // console.log('ℹ️ modelConfig未加载或无classes，返回空数组');
    return [];
  }, [modelConfig, currentModel]);

  // 根据模型自动更新检测目标
  useEffect(() => {
    // 只有在modelConfig加载完成后才处理selectedTargets的过滤
    if (!currentModel || !modelConfig || isLoadingConfig) {
      return;
    }

    // 检查modelConfig是否真的是当前模型的（避免异步时序问题）
    if (modelConfig.id !== currentModel) {
      console.warn('⚠️ modelConfig还未更新，等待加载...');
      return;
    }

    const isModelChanged =
      previousModelRef.current !== null &&
      previousModelRef.current !== currentModel;
    const isModelConfigChanged = previousModelConfigRef.current !== modelConfig;
    const wasInitialLoad = isInitialLoadRef.current;

    // 如果是首次加载，且selectedTargets已经有值（从持久化恢复），则不重置
    if (wasInitialLoad) {
      isInitialLoadRef.current = false;
      previousModelRef.current = currentModel;
      previousModelConfigRef.current = modelConfig;

      // 首次加载时，验证持久化的目标是否在当前模型中有效
      const availableTargets = getAvailableTargets();
      const validTargets = selectedTargets.filter(
        (target) => target && target.trim() && availableTargets.includes(target)
      );

      if (validTargets.length > 0) {
        // 如果有有效目标，保留它们（可能已经持久化）
        console.log('首次加载，保留持久化的目标选择:', validTargets);
        if (validTargets.length !== selectedTargets.length) {
          // 如果有无效目标，只保留有效的
          setSelectedTargets(validTargets);
        }
      } else if (availableTargets.length > 0) {
        // 如果没有有效目标，但可用目标不为空，选择第一个
        console.log(
          '首次加载，持久化的目标无效，自动选择第一个可用目标:',
          availableTargets[0]
        );
        setSelectedTargets([availableTargets[0]]);
      }
      return;
    }

    // 只有在模型真正切换且modelConfig也更新时才验证和调整目标
    if (
      (isModelChanged || isModelConfigChanged) &&
      modelConfig.id === currentModel
    ) {
      previousModelRef.current = currentModel;
      previousModelConfigRef.current = modelConfig;

      // 配方应用期间跳过自动选择（配方自己设目标）
      if (suppressAutoSelectRef?.current) {
        suppressAutoSelectRef.current = false;
        console.log('🔧 配方应用：跳过模型切换时的自动目标选择');
        return;
      }

      console.log('✅ 模型切换完成，modelConfig已更新');
      console.log('当前模型ID:', currentModel);
      const availableTargets = getAvailableTargets();
      console.log('可用目标:', availableTargets);

      if (availableTargets.length > 0) {
        // 模型切换：全选新模型的所有可用目标
        setSelectedTargets(availableTargets);
        console.log(
          `模型切换到 ${currentModel}，自动全选 ${availableTargets.length} 个目标: ${availableTargets.join(', ')}`
        );
      } else {
        setSelectedTargets([]);
        console.log(`模型切换到 ${currentModel}，没有可用目标，清空选择`);
      }
    }
  }, [
    currentModel,
    modelConfig,
    isLoadingConfig,
    getAvailableTargets,
    setSelectedTargets,
    suppressAutoSelectRef,
  ]);

  return {
    currentModel,
    modelName,
    modelLoading,
    refreshModel,
    modelConfig,
    isLoadingConfig,
    loadModelConfig,
    getTargetChineseName,
    getAvailableTargets,
  };
};
