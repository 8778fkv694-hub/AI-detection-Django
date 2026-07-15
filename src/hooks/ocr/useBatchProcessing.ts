/**
 * 批处理检测Hook
 * 
 * 功能：
 * 1. 管理批处理检测状态
 * 2. 触发批处理检测
 * 3. 处理批处理结果
 * 4. ROI缓存管理
 */

import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { runBatchDetection, getRoiCacheStats as fetchRoiCacheStats, cleanupRoiCache } from '@/services/ocr';

// 批处理配置接口
export interface BatchProcessingConfig {
    mode: 'batch' | 'stitching' | 'traditional';
    applyRules: boolean;
    enableBarcode: boolean;
    targetConfigs?: Record<string, TargetConfig>;
    keywordConfigs?: Array<{ text: string; type?: string; targetRoi?: string }>; // 关键词配置
    keywordMatchMode?: 'contains' | 'exact';
    barcodeConfigs?: Array<{ expectedText?: string; targetRoi?: string; enabled?: boolean }>; // 条码配置
    nonGridTargets?: string[]; // mini模式目标
    selectedTargets: string[];
    ocrModel?: string;
    useAngleCls?: boolean;
}

//目标配置
export interface TargetConfig {
    enable_keywords?: boolean;
    required_keywords?: string;
    excluded_keywords?: string;
    require_barcode?: boolean;
}

// 批处理结果接口
export interface BatchProcessingResult {
    success: boolean;
    mode: string;
    overall_quality: '合格' | '存疑' | '需复检' | '不合格';
    reason: string;
    ocr_text: string;
    barcode_count: number;
    roi_count: number;
    processing_time: number;
    processing_mode: string;
    worker_count: number;
    stitched_image?: string;
    details: ROIDetail[];
}

// ROI详情接口
export interface ROIDetail {
    label: string;
    grid_index: number;
    success: boolean;
    ocr_text: string;
    barcode_count: number;
    qualified: boolean;
    reason: string;
    bbox?: any;
    error?: string;
    detected_orientation?: number;
    detected_orientation_degrees?: number;
    ocr_detailed_results?: any[];
}

// ROI缓存统计
export interface ROICacheStats {
    total_count: number;
    max_size: number;
    ttl: number;
    labels: Record<string, number>;
    oldest_age: number;
}

/**
 * 批处理检测Hook
 */
export function useBatchProcessing() {
    const [processing, setProcessing] = useState(false);
    const [result, setResult] = useState<BatchProcessingResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    /**
     * 执行批处理检测
     * 
     * @param roiIds ROI缓存ID记录 {label: roi_id}
     * @param config 批处理配置
     */
    const processBatch = useCallback(async (
        roiIds: Record<string, string>,
        config: BatchProcessingConfig
    ): Promise<BatchProcessingResult | null> => {
        setProcessing(true);
        setError(null);

        try {
            const roi_id_list = Object.values(roiIds);

            if (roi_id_list.length === 0) {
                throw new Error('没有可处理的ROI');
            }

            console.log(`🚀 开始批处理: ${roi_id_list.length}个ROI`);

            const data = await runBatchDetection<BatchProcessingResult>({
                roi_ids: roi_id_list,
                selected_targets: config.selectedTargets,
                ocr_model: config.ocrModel,
                use_angle_cls: config.useAngleCls,
                apply_rules: config.applyRules,
                enable_barcode: config.enableBarcode,
                target_configs: config.targetConfigs || {},
                keyword_configs: config.keywordConfigs || [],
                keyword_match_mode: config.keywordMatchMode || 'contains',
                barcode_configs: config.barcodeConfigs || [],
                non_grid_targets: config.nonGridTargets || []
            });

            if (!data.success) {
                throw new Error(data.reason || '批处理失败');
            }

            setResult(data);

            // 显示成功提示
            if (data.overall_quality === '合格') {
                toast.success(`批处理完成: ${data.roi_count}个ROI处理完成，状态：${data.overall_quality}`);
            } else {
                toast.error(`批处理完成: ${data.roi_count}个ROI处理完成，状态：${data.overall_quality}`);
            }

            console.log(`✅ 批处理完成:`, {
                roi_count: data.roi_count,
                quality: data.overall_quality,
                time: data.processing_time
            });

            return data;

        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : '批处理检测失败';
            setError(errorMessage);

            toast.error(`批处理失败: ${errorMessage}`);

            console.error('❌ 批处理失败:', err);
            return null;

        } finally {
            setProcessing(false);
        }
    }, []);

    /**
     * 获取ROI缓存统计
     */
    const getCacheStats = useCallback(async (): Promise<ROICacheStats | null> => {
        try {
            const stats = await fetchRoiCacheStats<ROICacheStats>();
            return stats;

        } catch (err) {
            console.error('获取缓存统计失败:', err);
            return null;
        }
    }, []);

    /**
     * 清理ROI缓存
     * 
     * @param mode 'expired' | 'all'
     */
    const cleanupCache = useCallback(async (
        mode: 'expired' | 'all' = 'expired'
    ): Promise<boolean> => {
        try {
            const data = await cleanupRoiCache<{ success: boolean; cleaned_count: number; remaining_count: number }>(mode);

            if (data.success) {
                toast.success(`缓存清理完成: 已清理${data.cleaned_count}个ROI，剩余${data.remaining_count}个`);
                return true;
            }

            return false;

        } catch (err) {
            console.error('清理缓存失败:', err);
            toast.error(`清理失败: ${err instanceof Error ? err.message : '未知错误'}`);
            return false;
        }
    }, []);

    /**
     * 重置状态
     */
    const reset = useCallback(() => {
        setResult(null);
        setError(null);
        setProcessing(false);
    }, []);

    return {
        // 状态
        processing,
        result,
        error,

        // 方法
        processBatch,
        getCacheStats,
        cleanupCache,
        reset
    };
}
