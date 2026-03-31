import React from 'react';

interface ROIStatusDetail {
    label: string;
    ocr_text: string;
    barcodes: any[];
    keyword_match?: Array<{
        keyword: string;
        found: boolean;
        type: 'positive' | 'negative';
        targetRoi?: string;
        actualCount?: number;
        requiredCount?: number;
    }>;
    barcode_match?: Array<{
        expectedText: string;
        matchMode?: 'contains' | 'exact';
        detectedBarcodes: string[];
        matched: boolean;
        required: boolean;
        targetRoi?: string;
        matchedRois?: string[];
    }>;
}

interface ROIStatusCardProps {
    roiDetails: ROIStatusDetail[];
    getTargetChineseName: (target: string) => string;
}

export const ROIStatusCard: React.FC<ROIStatusCardProps> = ({ roiDetails, getTargetChineseName }) => {
    if (!roiDetails || roiDetails.length === 0) return null;

    return (
        <div className="mt-4 space-y-4">
            <h3 className="text-lg font-semibold text-slate-200">ROI 详细状态</h3>
            <div className="space-y-3">
                {roiDetails.map((roi, idx) => {
                    // 判断该ROI是否有问题
                    const hasKeywordIssue = roi.keyword_match?.some(km =>
                        (km.type === 'positive' && !km.found) || (km.type === 'negative' && km.found)
                    ) || false;
                    const hasBarcodeIssue = roi.barcode_match?.some(bm => bm.required && !bm.matched) || false;
                    const isProblem = hasKeywordIssue || hasBarcodeIssue;

                    return (
                        <div
                            key={idx}
                            className={`p-4 rounded-lg border-2 ${isProblem
                                ? 'border-red-500 bg-red-900/20'
                                : 'border-green-500 bg-green-900/20'
                                }`}
                        >
                            {/* 标签名称 */}
                            <div className="mb-3">
                                <span className={`text-lg font-bold ${isProblem ? 'text-red-400' : 'text-green-400'}`}>
                                    {isProblem ? '❌' : '✅'} [{getTargetChineseName(roi.label)}]
                                </span>
                            </div>

                            {/* 关键词匹配状态 */}
                            {roi.keyword_match && roi.keyword_match.length > 0 && (
                                <div className="mb-3 space-y-2">
                                    <div className="text-sm font-semibold text-blue-300">📝 关键词检测:</div>
                                    {roi.keyword_match.map((km, kmIdx) => {
                                        const matchStatus = km.type === 'positive'
                                            ? (km.found ? '✅ 匹配' : '❌ 未匹配')
                                            : (km.found ? '❌ 检测到排除词' : '✅ 未检测到');
                                        const statusColor = (km.type === 'positive' && km.found) || (km.type === 'negative' && !km.found)
                                            ? 'text-green-400'
                                            : 'text-red-400';

                                        return (
                                            <div key={kmIdx} className="pl-4 text-sm space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-slate-400">关键词:</span>
                                                    <span className="font-medium text-slate-200">{km.keyword}</span>
                                                    {km.targetRoi === 'all' && (
                                                        <span className="text-[10px] px-1 py-0.5 rounded bg-slate-700/70 text-slate-300">
                                                            全局规则
                                                        </span>
                                                    )}
                                                    <span className="text-slate-400">→</span>
                                                    <span className="text-slate-300">实际识别: {km.found ? `"${km.keyword}"` : '未检测到'}</span>
                                                    <span className="text-slate-400">→</span>
                                                    <span className={`font-semibold ${statusColor}`}>{matchStatus}</span>
                                                </div>
                                                {(km.type === 'positive' && (km.requiredCount ?? 1) > 1) && (
                                                    <div className="text-xs text-slate-400">
                                                        次数: {km.actualCount ?? 0}/{km.requiredCount}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* 二维码匹配状态 */}
                            {roi.barcode_match && roi.barcode_match.length > 0 && (
                                <div className="space-y-2">
                                    <div className="text-sm font-semibold text-purple-300">📱 二维码/条码检测:</div>
                                    {roi.barcode_match.map((bm, bmIdx) => {
                                        const matchStatus = bm.matched ? '✅ 匹配' : '❌ 未匹配';
                                        const statusColor = bm.matched ? 'text-green-400' : 'text-red-400';
                                        const detectedText = bm.detectedBarcodes.length > 0
                                            ? bm.detectedBarcodes.join(', ')
                                            : '未检测到';
                                        const expectedText = bm.expectedText || '';
                                        const matchMode = bm.matchMode || 'contains';
                                        const ocrText = roi.ocr_text || '';
                                        const ocrFallbackMatched = bm.matched
                                            && bm.detectedBarcodes.length === 0
                                            && expectedText
                                            && (matchMode === 'exact' ? ocrText === expectedText : ocrText.includes(expectedText));

                                        return (
                                            <div key={bmIdx} className="pl-4 text-sm space-y-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-slate-400">预期值:</span>
                                                    <span className="font-medium text-slate-200">{bm.expectedText || '任意'}</span>
                                                    {bm.targetRoi === 'all' && (
                                                        <span className="text-[10px] px-1 py-0.5 rounded bg-slate-700/70 text-slate-300">
                                                            全局规则
                                                        </span>
                                                    )}
                                                    {bm.targetRoi === 'all' && bm.matchedRois && bm.matchedRois.length > 0 && (
                                                        <span className="text-[10px] text-green-300">
                                                            命中: {bm.matchedRois.join(', ')}
                                                        </span>
                                                    )}
                                                    <span className="text-slate-400">→</span>
                                                    <span className="text-slate-300">实际检测: {detectedText}</span>
                                                    <span className="text-slate-400">→</span>
                                                    <span className={`font-semibold ${statusColor}`}>
                                                        {matchStatus}{ocrFallbackMatched ? '（OCR兜底通过）' : ''}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* 识别文本预览 */}
                            {roi.ocr_text && (
                                <div className="mt-3 pt-3 border-t border-slate-600">
                                    <div className="text-xs text-slate-400">识别文本:</div>
                                    <div className="text-sm text-slate-300 mt-1 max-h-20 overflow-y-auto bg-slate-800/50 p-2 rounded">
                                        {roi.ocr_text}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
