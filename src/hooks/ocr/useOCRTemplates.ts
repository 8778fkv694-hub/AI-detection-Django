/**
 * useOCRTemplates Hook
 *
 * 用途：管理OCR模板（关键词模板和二维码模板）
 * 功能：加载、保存、删除模板，更新关键词配置
 * 使用位置：OCRDetectionScreen
 */

import { useEffect, useCallback } from 'react';
import { useOCRDetectionStore } from '@/state/ocrDetectionStore';
import {
  fetchKeywordTemplates,
  createKeywordTemplate as createKeywordTemplateApi,
  deleteKeywordTemplate as deleteKeywordTemplateApi,
  fetchBarcodeTemplates,
  createBarcodeTemplate as createBarcodeTemplateApi,
  deleteBarcodeTemplate as deleteBarcodeTemplateApi,
} from '@/lib/ocrTemplatesApi';
import type { KeywordConfig, OCRTemplate, BarcodeConfig } from '@/types/ocr';

export interface UseOCRTemplatesReturn {
  /** 更新关键词配置 */
  updateKeywordConfigs: (keywordText: string) => void;
  /** 更新单个关键词的置信度 */
  updateKeywordConfidence: (keywordId: string, confidence: number) => void;
  /** 更新单个关键词的类型 */
  updateKeywordType: (keywordId: string, type: 'positive' | 'negative') => void;
  /** 更新单个关键词的需要次数 */
  updateKeywordRequiredCount: (keywordId: string, requiredCount: number) => void;
  /** 更新单个关键词的ROI目标 */
  updateKeywordTargetRoi: (keywordId: string, targetRoi: string | undefined) => void;
  /** 更新二维码配置 */
  updateBarcodeConfig: (id: string, updates: Partial<BarcodeConfig> | ((prev: BarcodeConfig) => Partial<BarcodeConfig>)) => void;
  /** 保存关键词模板 */
  saveTemplate: () => Promise<void>;
  /** 加载关键词模板 */
  loadTemplate: (template: OCRTemplate) => void;
  /** 删除关键词模板 */
  deleteTemplate: (templateId: string) => Promise<void>;
  /** 保存二维码模板 */
  saveBarcodeTemplate: () => Promise<void>;
  /** 加载二维码模板 */
  loadBarcodeTemplate: (templateId: string) => void;
  /** 删除二维码模板 */
  deleteBarcodeTemplate: (templateId: string) => Promise<void>;
}

export const useOCRTemplates = (): UseOCRTemplatesReturn => {
  const createKeywordConfigId = useCallback(
    () => `kw_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    [],
  );

  const normalizeKeywordConfig = useCallback((config: KeywordConfig): KeywordConfig => ({
    ...config,
    id: config.id || createKeywordConfigId(),
  }), [createKeywordConfigId]);

  // 从 store 获取状态
  const {
    keywords,
    keywordConfigs,
    keywordMatchMode,
    minConfidence,
    templates,
    templateName,
    barcodeConfigs,
    barcodeTemplates,
    barcodeTemplateName,
    setKeywords,
    setKeywordConfigs,
    setKeywordMatchMode,
    setMinConfidence,
    setTemplates,
    setTemplateName,
    setShowSaveTemplate,
    setEnableKeywordAnalysis,
    setBarcodeConfigs,
    setBarcodeTemplates,
    setBarcodeTemplateName,
    setShowBarcodeSaveTemplate,
    setEnableBarcodeDetection,
    setIsBarcodeSettingsExpanded,
  } = useOCRDetectionStore();

  // 二维码模板列表显示状态（本地状态，由 OCRDetectionScreen 管理）
  // Hook 通过返回的函数来设置，不需要内部管理

  // 处理关键词配置更新
  const updateKeywordConfigs = useCallback((keywordText: string) => {
    const keywordList = keywordText.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const remainingConfigs = keywordConfigs.map(normalizeKeywordConfig);
    const newConfigs: KeywordConfig[] = keywordList.map(keyword => {
      const existingIndex = remainingConfigs.findIndex(config => config.text === keyword);
      const existing = existingIndex >= 0 ? remainingConfigs.splice(existingIndex, 1)[0] : undefined;
      return {
        id: existing?.id ?? createKeywordConfigId(),
        text: keyword,
        confidence: existing ? existing.confidence : minConfidence,
        expectedOrientation: existing?.expectedOrientation ?? undefined,
        type: existing?.type ?? 'positive',
        requiredCount: existing?.requiredCount ?? 1,
        targetRoi: existing?.targetRoi ?? undefined,
      };
    });
    setKeywordConfigs(newConfigs);
  }, [createKeywordConfigId, keywordConfigs, minConfidence, normalizeKeywordConfig, setKeywordConfigs]);

  // 更新单个关键词的置信度
  const updateKeywordConfidence = useCallback((keywordId: string, confidence: number) => {
    const updatedConfigs = keywordConfigs.map(config =>
      config.id === keywordId
        ? { ...config, confidence }
        : config
    );
    setKeywordConfigs(updatedConfigs);
  }, [keywordConfigs, setKeywordConfigs]);

  // 更新单个关键词的类型
  const updateKeywordType = useCallback((keywordId: string, type: 'positive' | 'negative') => {
    const updatedConfigs = keywordConfigs.map(config =>
      config.id === keywordId
        ? { ...config, type }
        : config
    );
    setKeywordConfigs(updatedConfigs);
  }, [keywordConfigs, setKeywordConfigs]);

  // 更新单个关键词的需要次数
  const updateKeywordRequiredCount = useCallback((keywordId: string, requiredCount: number) => {
    const updatedConfigs = keywordConfigs.map(config =>
      config.id === keywordId
        ? { ...config, requiredCount: Math.max(1, Math.floor(requiredCount)) }
        : config
    );
    setKeywordConfigs(updatedConfigs);
  }, [keywordConfigs, setKeywordConfigs]);

  // 保存关键词模板
  const saveTemplate = useCallback(async () => {
    if (!templateName.trim()) {
      alert('请输入模板名称');
      return;
    }

    try {
      const createdTemplate = await createKeywordTemplateApi({
        name: templateName.trim(),
        keywords,
        keywordConfigs: keywordConfigs.map(({ id, ...config }) => ({ ...config })),
        keywordMatchMode,
        minConfidence,
      });

      setTemplates([...templates, createdTemplate]);
      setTemplateName('');
      setShowSaveTemplate(false);
      alert('模板保存成功！');
    } catch (error) {
      console.error('保存关键词模板失败:', error);
      alert(`模板保存失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [templateName, keywords, keywordConfigs, keywordMatchMode, minConfidence, templates, setTemplates, setTemplateName, setShowSaveTemplate]);

  // 加载关键词模板
  const loadTemplate = useCallback((template: OCRTemplate) => {
    setKeywords(template.keywords);
    setKeywordConfigs(template.keywordConfigs.map(normalizeKeywordConfig));
    setKeywordMatchMode(template.keywordMatchMode);
    setMinConfidence(template.minConfidence);
    setEnableKeywordAnalysis(true);
    alert(`已加载模板: ${template.name}`);
  }, [normalizeKeywordConfig, setKeywords, setKeywordConfigs, setKeywordMatchMode, setMinConfidence, setEnableKeywordAnalysis]);

  // 删除关键词模板
  const deleteTemplate = useCallback(async (templateId: string) => {
    if (confirm('确定要删除这个模板吗？')) {
      try {
        await deleteKeywordTemplateApi(templateId);
        const updatedTemplates = templates.filter(t => t.id !== templateId);
        setTemplates(updatedTemplates);
      } catch (error) {
        console.error('删除关键词模板失败:', error);
        alert(`删除模板失败：${error instanceof Error ? error.message : '未知错误'}`);
      }
    }
  }, [templates, setTemplates]);

  // 保存二维码模板
  const saveBarcodeTemplate = useCallback(async () => {
    if (!barcodeTemplateName.trim()) {
      alert('请输入模板名称');
      return;
    }

    if (barcodeConfigs.length === 0) {
      alert('请至少配置一个二维码');
      return;
    }

    try {
      const createdTemplate = await createBarcodeTemplateApi({
        name: barcodeTemplateName.trim(),
        configs: barcodeConfigs.map(config => ({ ...config })),
      });

      setBarcodeTemplates([...barcodeTemplates, createdTemplate]);
      setBarcodeTemplateName('');
      setShowBarcodeSaveTemplate(false);
      alert('二维码模板保存成功！');
    } catch (error) {
      console.error('保存二维码模板失败:', error);
      alert(`二维码模板保存失败：${error instanceof Error ? error.message : '未知错误'}`);
    }
  }, [barcodeTemplateName, barcodeConfigs, barcodeTemplates, setBarcodeTemplates, setBarcodeTemplateName, setShowBarcodeSaveTemplate]);

  // 加载二维码模板
  const loadBarcodeTemplate = useCallback((templateId: string) => {
    const template = barcodeTemplates.find(t => t.id === templateId);
    if (!template) {
      return;
    }

    const regeneratedConfigs = template.configs.map(config => ({
      ...config,
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    }));

    setBarcodeConfigs(regeneratedConfigs);
    setEnableBarcodeDetection(true);
    setIsBarcodeSettingsExpanded(true);
    alert(`已加载二维码模板: ${template.name}`);
  }, [barcodeTemplates, setBarcodeConfigs, setEnableBarcodeDetection, setIsBarcodeSettingsExpanded]);

  // 删除二维码模板
  const deleteBarcodeTemplate = useCallback(async (templateId: string) => {
    if (confirm('确定要删除这个二维码模板吗？')) {
      try {
        await deleteBarcodeTemplateApi(templateId);
        const updatedTemplates = barcodeTemplates.filter(t => t.id !== templateId);
        setBarcodeTemplates(updatedTemplates);
      } catch (error) {
        console.error('删除二维码模板失败:', error);
        alert(`删除二维码模板失败：${error instanceof Error ? error.message : '未知错误'}`);
      }
    }
  }, [barcodeTemplates, setBarcodeTemplates]);

  // 从后端加载关键词模板
  useEffect(() => {
    let cancelled = false;

    const loadTemplatesFromServer = async () => {
      try {
        const data = await fetchKeywordTemplates();
        if (!cancelled) {
          setTemplates(data);
        }
      } catch (error) {
        console.error('加载关键词模板失败:', error);
      }
    };

    loadTemplatesFromServer();
    return () => {
      cancelled = true;
    };
  }, [setTemplates]);

  // 从后端加载二维码模板
  useEffect(() => {
    let cancelled = false;

    const loadBarcodeTemplatesFromServer = async () => {
      try {
        const data = await fetchBarcodeTemplates();
        if (!cancelled) {
          setBarcodeTemplates(data);
        }
      } catch (error) {
        console.error('加载二维码模板失败:', error);
      }
    };

    loadBarcodeTemplatesFromServer();
    return () => {
      cancelled = true;
    };
  }, [setBarcodeTemplates]);

  useEffect(() => {
    if (keywordConfigs.some(config => !config.id)) {
      setKeywordConfigs(keywordConfigs.map(normalizeKeywordConfig));
    }
  }, [keywordConfigs, normalizeKeywordConfig, setKeywordConfigs]);

  // 更新单个关键词的 ROI 目标
  const updateKeywordTargetRoi = useCallback((keywordId: string, targetRoi: string | undefined) => {
    const updatedConfigs = keywordConfigs.map(config =>
      config.id === keywordId
        ? { ...config, targetRoi: targetRoi || undefined }
        : config
    );
    setKeywordConfigs(updatedConfigs);
  }, [keywordConfigs, setKeywordConfigs]);

  // 更新二维码配置
  const updateBarcodeConfig = useCallback((id: string, updates: Partial<BarcodeConfig> | ((prev: BarcodeConfig) => Partial<BarcodeConfig>)) => {
    const updatedConfigs = barcodeConfigs.map(config => {
      if (config.id === id) {
        const newUpdates = typeof updates === 'function' ? updates(config) : updates;
        return { ...config, ...newUpdates };
      }
      return config;
    });
    setBarcodeConfigs(updatedConfigs);
  }, [barcodeConfigs, setBarcodeConfigs]);


  return {
    updateKeywordConfigs,
    updateKeywordConfidence,
    updateKeywordType,
    updateKeywordRequiredCount,
    updateKeywordTargetRoi,
    updateBarcodeConfig,
    saveTemplate,
    loadTemplate,
    deleteTemplate,
    saveBarcodeTemplate,
    loadBarcodeTemplate,
    deleteBarcodeTemplate,
  };
};

export default useOCRTemplates;
