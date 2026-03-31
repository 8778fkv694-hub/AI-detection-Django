/**
 * 批处理状态面板
 * 显示批处理模式的状态和控制
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Label } from '@/components/ui/Label';
import { Switch } from '@/components/ui/Switch';
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useOCRDetectionStore } from '@/state/ocrDetectionStore';

interface BatchProcessingPanelProps {
    status: {
        mode: 'stitching' | 'batch' | 'traditional';
        cachedCount: number;
        targetCount: number;
        progress: number;
        ready: boolean;
        triggered: boolean;
        processing: boolean;
        error: any;
        result: any;
    };
}

export const BatchProcessingPanel: React.FC<BatchProcessingPanelProps> = ({ status }) => {
    const {
        batchApplyRules,
        setBatchApplyRules,
    } = useOCRDetectionStore();

    const modeDescription = {
        stitching: '先拼接所有ROI，再OCR检测',
        batch: 'ROI逐个OCR检测，自动汇总结果（性能优化2.7倍）',
        traditional: '全图OCR检测',
    }[status.mode];

    const modeLabel = {
        stitching: '拼接模式',
        batch: '批处理模式',
        traditional: '传统模式',
    }[status.mode];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">批处理状态</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-300">当前模式</span>
                        <span className="font-medium text-blue-300">{modeLabel}</span>
                    </div>
                    <div className="text-xs text-gray-500">
                        {modeDescription}
                    </div>
                </div>

                {status.mode === 'batch' && (
                    <>
                        <div className="flex items-center justify-between">
                            <Label htmlFor="batch-apply-rules" className="text-sm">
                                应用规则验证
                            </Label>
                            <Switch
                                id="batch-apply-rules"
                                checked={batchApplyRules}
                                onCheckedChange={setBatchApplyRules}
                            />
                        </div>

                        <div className="space-y-2 pt-2 border-t">
                            <div className="text-sm font-medium">批处理状态</div>

                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">ROI缓存:</span>
                                <span className="font-mono">
                                    {status.cachedCount} / {status.targetCount}
                                    {status.targetCount > 0 && (
                                        <span className="text-gray-500 ml-1">
                                            ({Math.round(status.progress)}%)
                                        </span>
                                    )}
                                </span>
                            </div>

                            <div className="flex justify-between text-sm">
                                <span className="text-gray-600">就绪状态:</span>
                                <span className="flex items-center gap-1">
                                    {status.ready ? (
                                        <>
                                            <CheckCircle className="w-4 h-4 text-green-500" />
                                            <span className="text-green-600">就绪</span>
                                        </>
                                    ) : (
                                        <>
                                            <AlertCircle className="w-4 h-4 text-yellow-500" />
                                            <span className="text-yellow-600">等待中</span>
                                        </>
                                    )}
                                </span>
                            </div>

                            {status.processing && (
                                <div className="flex items-center gap-2 text-sm text-blue-600">
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    <span>正在批处理...</span>
                                </div>
                            )}

                            {status.error && (
                                <div className="flex items-center gap-2 text-sm text-red-600">
                                    <XCircle className="w-4 h-4" />
                                    <span className="truncate">{status.error.message || '批处理失败'}</span>
                                </div>
                            )}

                            {status.result && (
                                <div className="space-y-1 text-xs bg-slate-950/50 border border-slate-800 p-2 rounded">
                                    <div className="flex justify-between">
                                        <span>处理时间:</span>
                                        <span className="font-mono">{status.result.processing_time}s</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>处理模式:</span>
                                        <span className="font-mono">{status.result.processing_mode}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>并发数:</span>
                                        <span className="font-mono">{status.result.worker_count}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span>状态:</span>
                                        <span className={
                                            status.result.overall_quality === '合格'
                                                ? 'text-green-600 font-medium'
                                                : 'text-red-600 font-medium'
                                        }>
                                            {status.result.overall_quality}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </CardContent>
        </Card>
    );
};
