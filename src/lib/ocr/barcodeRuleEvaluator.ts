import type { BarcodeConfig, BarcodeResult } from '@/types/ocr';

interface BuildBarcodeAnalysisParams {
  enabled: boolean;
  barcodeConfigs: BarcodeConfig[];
  matchResults: BarcodeResult[];
  allDetectedData?: Array<{ data: string }>;
  retrySummary?: {
    totalRetries: number;
    successfulDetections: number;
    failedDetections: number;
  };
}

export const buildBarcodeAnalysis = ({
  enabled,
  barcodeConfigs,
  matchResults,
  allDetectedData = [],
  retrySummary,
}: BuildBarcodeAnalysisParams) => {
  const activeConfigs = barcodeConfigs.filter(config => config.enabled);
  const allQrCodesData = allDetectedData.map(item => item.data).filter(Boolean);
  const totalDetected = allQrCodesData.length;
  const matchedCount = matchResults.filter(result => result.matched).length;
  const overallMatch = activeConfigs.length > 0
    ? matchResults.length === activeConfigs.length && matchResults.every(result => result.matched)
    : true;

  const detectionSummary = activeConfigs.length > 0
    ? `规则命中：${matchedCount}/${activeConfigs.length}${totalDetected > 0 ? `，识别到${totalDetected}个二维码` : ''}`
    : (totalDetected > 0 ? `识别到${totalDetected}个二维码` : '未配置二维码规则');

  return {
    enabled,
    results: matchResults,
    overall_match: overallMatch,
    total_qr_codes_detected: totalDetected,
    qr_codes_data: allQrCodesData,
    detection_summary: detectionSummary,
    retry_summary: retrySummary,
    isRetryEnabled: !!retrySummary,
  };
};

