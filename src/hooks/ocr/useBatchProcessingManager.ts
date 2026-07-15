/**
 * 批处理管理器Hook
 * 
 * 封装批处理的完整逻辑：
 * 1. 管理ROI缓存ID
 * 2. 判断目标是否齐全
 * 3. 自动触发批处理
 * 4. 处理和显示结果
 */

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { cacheRoiToBackend } from '@/lib/api';
import { useOCRDetectionStore } from '@/state/ocrDetectionStore';
import { useBatchProcessing, type BatchProcessingResult } from './useBatchProcessing';
import type { KeywordConfig, BarcodeConfig } from '@/types/ocr';

interface UseBatchProcessingManagerProps {
    selectedTargets: string[];
    enableKeywordAnalysis: boolean;
    keywordConfigs: KeywordConfig[];
    keywordMatchMode: 'contains' | 'exact';
    enableBarcodeDetection: boolean;
    barcodeConfigs: BarcodeConfig[];
    nonGridTargets?: string[];
    ocrModel?: string;
    onBatchComplete?: (result: BatchProcessingResult) => void;
}

export function useBatchProcessingManager({
    selectedTargets,
    enableKeywordAnalysis,
    keywordConfigs,
    keywordMatchMode,
    enableBarcodeDetection,
    barcodeConfigs,
    nonGridTargets = [],
    ocrModel,
    onBatchComplete,
}: UseBatchProcessingManagerProps) {

    // 从store获取批处理相关状态
    const {
        batchProcessingMode,
        batchApplyRules,
        roiCacheIds,
        batchTriggered,
        updateRoiCacheId,
        setBatchTriggered,
        resetBatchState,
    } = useOCRDetectionStore();

    // 使用批处理Hook
    const { processBatch, processing, result, error } = useBatchProcessing();

    // 防止重复触发
    const isProcessingRef = useRef(false);

    // 本窗口的 ROI 缓存归属标识（每个页面实例一份，随模块实例常驻内存，不落盘）。
    // 供后端按 owner_id 精确清理，避免一个窗口清缓存时误删其他窗口尚未消费的 ROI。
    const roiOwnerIdRef = useRef(`roi:${Date.now()}:${Math.random().toString(36).slice(2)}`);

    /**
     * 缓存单个ROI到后端
     */
    const cacheROI = useCallback(async (
        label: string,
        roiImageDataUrl: string,
        bbox: any,
        detection?: any
    ): Promise<string | null> => {
        try {
            // 调用后端API缓存ROI
            const response = await cacheRoiToBackend({
                label,
                roi_image: roiImageDataUrl,
                bbox,
                detection: detection || {},
                owner_id: roiOwnerIdRef.current
            });

            if (!response.ok) {
                console.error(`缓存ROI失败 [${label}]: HTTP ${response.status}`);
                return null;
            }

            const data = await response.json();
            const roiId = data.roi_id;

            if (roiId) {
                // 保存到store
                updateRoiCacheId(label, roiId);
                console.log(`✅ ROI已缓存: ${label} -> ${roiId}`);
                return roiId;
            }

            return null;

        } catch (error) {
            console.error(`缓存ROI异常 [${label}]:`, error);
            return null;
        }
    }, [updateRoiCacheId]);

    /**
     * 检查是否所有目标都已检测并缓存
     */
    const checkAllTargetsReady = useCallback((): boolean => {
        // 如果不是批处理模式，返回false
        if (batchProcessingMode !== 'batch') {
            return false;
        }

        // 如果已经触发过，返回false
        if (batchTriggered) {
            return false;
        }

        // 如果正在处理，返回false
        if (isProcessingRef.current || processing) {
            return false;
        }

        // 检查selectedTargets是否都在roiCacheIds中
        if (!selectedTargets || selectedTargets.length === 0) {
            return false;
        }

        const cachedLabels = Object.keys(roiCacheIds);
        const allDetected = selectedTargets.every(target =>
            cachedLabels.includes(target)
        );

        const ready = allDetected && cachedLabels.length > 0;

        if (ready) {
            console.log(`🎯 所有目标就绪 (${cachedLabels.length}/${selectedTargets.length})`);
        }

        return ready;
    }, [
        batchProcessingMode,
        batchTriggered,
        processing,
        selectedTargets,
        roiCacheIds
    ]);

    /**
     * 构建目标配置（从keywordConfigs转换）
     */
    /**
     * 构建目标配置（从keywordConfigs转换）
     */
    const buildTargetConfigs = useCallback(() => {
        if (!batchApplyRules) {
            return {};
        }

        const configs: Record<string, any> = {};

        selectedTargets.forEach(target => {
            // 1. 关键词配置
            const relatedKeywords = enableKeywordAnalysis
                ? keywordConfigs.filter(config =>
                    !config.targetRoi || config.targetRoi === 'all' || config.targetRoi === target
                )
                : [];

            const requiredKws = relatedKeywords
                .filter(k => k.type !== 'negative')
                .map(k => k.text)
                .join(',');

            const excludedKws = relatedKeywords
                .filter(k => k.type === 'negative')
                .map(k => k.text)
                .join(',');

            // 2. 条码配置
            const relatedBarcodes = enableBarcodeDetection
                ? barcodeConfigs.filter(config =>
                    config.enabled &&
                    (!config.targetRoi || config.targetRoi === 'all' || config.targetRoi === target)
                )
                : [];

            const requireBarcode = relatedBarcodes.length > 0;

            configs[target] = {
                enable_keywords: relatedKeywords.length > 0,
                required_keywords: requiredKws,
                excluded_keywords: excludedKws,
                require_barcode: requireBarcode,
            };
        });

        return configs;
    }, [
        batchApplyRules,
        enableKeywordAnalysis,
        selectedTargets,
        keywordConfigs,
        enableBarcodeDetection,
        barcodeConfigs
    ]);

    /**
     * 触发批处理检测
     */
    /**
     * 触发批处理检测
     * @param force 是否强制触发（即使目标不全）
     */
    const triggerBatchProcessing = useCallback(async (force: boolean = false): Promise<boolean> => {
        // 关键修复：直接从Store获取最新状态，避免闭包陷阱（Stale Closure）
        // 在异步循环上传ROI后立即调用此函数时，react hook中的roiCacheIds可能尚未更新
        const currentBatchState = useOCRDetectionStore.getState();
        const currentRoiCacheIds = currentBatchState.roiCacheIds;

        if (currentBatchState.batchProcessingMode !== 'batch'
            || currentBatchState.batchTriggered
            || isProcessingRef.current
            || processing) {
            return false;
        }

        // 双重检查
        const missingTargets = selectedTargets.filter(target => !currentRoiCacheIds[target]);
        if (missingTargets.length > 0) {
            console.warn(`⚠️ 批处理拒绝执行，缺少目标: ${missingTargets.join(', ')}`);
            toast.error(`批处理目标不完整: ${missingTargets.join(', ')}`);
            return false;
        }

        const cachedCount = Object.keys(currentRoiCacheIds).length;
        if (cachedCount === 0) {
            console.error('❌ 无法触发批处理: ROI缓存为空');
            return false;
        }

        console.log(`🚀 触发批处理检测${force ? ' (强制)' : ''}, ROI数量: ${cachedCount}`);

        // 设置标志，防止重复触发
        setBatchTriggered(true);
        isProcessingRef.current = true;

        try {
            // 构建目标配置
            const targetConfigs = buildTargetConfigs();

            // 调用批处理API
            // 使用最新的 currentRoiCacheIds
            const batchResult = await processBatch(currentRoiCacheIds, {
                mode: 'batch',
                applyRules: batchApplyRules,
                enableBarcode: enableBarcodeDetection,
                targetConfigs,
                keywordConfigs: keywordConfigs,
                keywordMatchMode,
                barcodeConfigs: barcodeConfigs,
                nonGridTargets,
                selectedTargets,
                ocrModel,
                useAngleCls: keywordConfigs.some(config =>
                    config.expectedOrientation !== undefined && config.expectedOrientation !== null
                ),
            });

            if (batchResult) {
                console.log('✅ 批处理完成:', batchResult);

                // 调用回调
                if (onBatchComplete) {
                    await onBatchComplete(batchResult);
                }
                return true;
            }

            setBatchTriggered(false);
            return false;

        } catch (err) {
            console.error('❌ 批处理失败:', err);
            toast.error('批处理失败，请重试');
            setBatchTriggered(false);
            return false;

        } finally {
            isProcessingRef.current = false;
        }
    }, [
        checkAllTargetsReady,
        setBatchTriggered,
        buildTargetConfigs,
        processBatch,
        // roiCacheIds, // 不再依赖 hook 中的 roiCacheIds
        batchApplyRules,
        enableBarcodeDetection,
        onBatchComplete,
        selectedTargets,
        keywordConfigs,
        keywordMatchMode,
        barcodeConfigs,
        nonGridTargets,
        ocrModel,
    ]);

    /**
     * 自动触发检查
     * 当roiCacheIds变化时，检查是否应该触发批处理
     */
    useEffect(() => {
        if (checkAllTargetsReady()) {
            // 延迟100ms触发，确保状态已稳定
            const timer = setTimeout(() => {
                triggerBatchProcessing();
            }, 100);

            return () => clearTimeout(timer);
        }
    }, [roiCacheIds, checkAllTargetsReady, triggerBatchProcessing]);

    /**
     * 重置批处理状态
     */
    const reset = useCallback(() => {
        resetBatchState();
        isProcessingRef.current = false;
        console.log('🔄 批处理状态已重置');
    }, [resetBatchState]);

    /**
     * 获取当前状态摘要
     */
    const getStatus = useCallback(() => {
        const cachedCount = Object.keys(roiCacheIds).length;
        const targetCount = selectedTargets.length;
        const progress = targetCount > 0 ? (cachedCount / targetCount) * 100 : 0;

        return {
            mode: batchProcessingMode,
            cachedCount,
            targetCount,
            progress,
            ready: checkAllTargetsReady(),
            triggered: batchTriggered,
            processing,
            error,
            result,
        };
    }, [
        roiCacheIds,
        selectedTargets,
        batchProcessingMode,
        checkAllTargetsReady,
        batchTriggered,
        processing,
        error,
        result
    ]);

    return {
        // 状态
        processing,
        result,
        error,
        status: getStatus(),

        // 方法
        cacheROI,
        triggerBatchProcessing,
        reset,
        checkAllTargetsReady,
    };
}
