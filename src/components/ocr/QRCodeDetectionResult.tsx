/**
 * QRCodeDetectionResult Component
 *
 * 用途：展示二维码检测结果（紧凑布局）
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等页面
 */

import React from 'react';
import { CheckCircle, XCircle } from 'lucide-react';
import type { TestResult } from '@/types/ocr';

interface QRCodeDetectionResultProps {
  barcodeAnalysis: NonNullable<TestResult['barcode_analysis']>;
}

export const QRCodeDetectionResult: React.FC<QRCodeDetectionResultProps> = ({ barcodeAnalysis }) => {
  // 计算已忽略的二维码
  const ignoredCodes = React.useMemo(() => {
    if (!barcodeAnalysis.qr_codes_data || barcodeAnalysis.qr_codes_data.length === 0) {
      return [];
    }

    // 获取所有已匹配（或已尝试匹配）的二维码文本
    // 注意：如果有配置但未匹配到，detectedText可能是空字符串，需要过滤掉
    const processedTexts = new Set(
      barcodeAnalysis.results
        .map(r => r.detectedText)
        .filter(t => t && t.length > 0)
    );

    // 过滤出未被任何规则处理的二维码
    return barcodeAnalysis.qr_codes_data.filter(code => !processedTexts.has(code));
  }, [barcodeAnalysis]);

  return (
    <div className="space-y-1">
      {/* 重试信息（如启用） */}
      {barcodeAnalysis.isRetryEnabled && barcodeAnalysis.retry_summary && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-blue-400">
            🔄 {barcodeAnalysis.retry_summary.totalRetries}次
          </span>
          <div className="flex items-center gap-1">
            <span className="text-green-400">
              ✅ {barcodeAnalysis.retry_summary.successfulDetections}
            </span>
            {barcodeAnalysis.retry_summary.failedDetections > 0 && (
              <span className="text-red-400">
                ❌ {barcodeAnalysis.retry_summary.failedDetections}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 优化的二维码结果列表 */}
      <div className="space-y-1">
        {barcodeAnalysis.results.map((result, index) => (
          <div key={index} className="flex items-center justify-between p-1.5 rounded bg-slate-800/50">
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              {result.matched ? (
                <CheckCircle className="h-3 w-3 text-green-400 flex-shrink-0" />
              ) : (
                <XCircle className="h-3 w-3 text-red-400 flex-shrink-0" />
              )}
              <div className="text-xs min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-slate-300 font-mono">{result.expectedText}</span>
                  <span className="text-slate-500">{(result.confidence * 100).toFixed(1)}%</span>
                  {result.retryCount && result.retryCount > 1 && (
                    <span className="text-blue-400">🔄 {result.retryCount}次</span>
                  )}
                </div>
                {result.detectedText && (
                  <div className="text-slate-400 text-xs truncate mt-0.5">
                    检测: <span className="font-mono">{result.detectedText}</span>
                  </div>
                )}
              </div>
            </div>
            <div className={`px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0 ${result.matched
              ? 'bg-green-600/30 text-green-200 border border-green-500/50'
              : 'bg-red-600/30 text-red-200 border border-red-500/50'
              }`}>
              {result.matched ? '匹配' : '未匹配'}
            </div>
          </div>
        ))}

        {/* 显示未匹配（已忽略）的二维码及其内容 */}
        {ignoredCodes.length > 0 && (
          <div className="space-y-1">
            <div className="flex items-center justify-between p-1.5 rounded bg-slate-800/30 border border-slate-700/50 border-dashed">
              <div className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full bg-slate-600 flex items-center justify-center text-[8px] text-slate-300">?</div>
                <span className="text-xs text-slate-400">
                  已忽略 {ignoredCodes.length} 个非目标二维码
                </span>
              </div>
            </div>
            {/* 展示被忽略的二维码详情 */}
            <div className="pl-2 space-y-1">
              {ignoredCodes.map((code, idx) => (
                <div key={`ignored-${idx}`} className="text-[10px] text-slate-500 font-mono bg-slate-900/30 p-1 rounded truncate border-l-2 border-slate-700">
                  {code}
                </div>
              ))}
            </div>
          </div>
        )}

        {barcodeAnalysis.results.length === 0 && (!barcodeAnalysis.total_qr_codes_detected || barcodeAnalysis.total_qr_codes_detected === 0) && (
          <div className="flex items-center justify-center p-2 rounded bg-slate-800/50">
            <span className="text-xs text-slate-400">未检测到二维码</span>
          </div>
        )}
      </div>
    </div>
  );
};
