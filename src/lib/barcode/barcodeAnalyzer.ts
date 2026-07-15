/**
 * 二维码/条形码分析工具
 * 提供带重试机制的二维码检测和匹配功能
 */

import {
  detectBarcodes,
  validateBarcode,
  type BarcodeDetectionResult,
  detectBarcodesWithRetry
} from '@/lib/barcodeDetector';
import { apiFetch } from '@/lib/config';

// 重新导出类型供外部使用
export type { BarcodeDetectionResult };

/**
 * 二维码配置接口
 */
export interface BarcodeConfig {
  id: string;
  expectedText: string;
  matchMode: 'contains' | 'exact';
  enabled: boolean;
  targetRoi?: string;
  codeType?: 'qr' | 'linear';
  barcodeFormat?: 'auto' | 'code128' | 'ean13' | 'ean8' | 'upca' | 'upce' | 'itf' | 'codabar' | 'code39';
  allowOcrFallback?: boolean;
}

/**
 * 二维码检测结果接口
 */
export interface BarcodeResult {
  detectedText: string;
  expectedText: string;
  matchMode: 'contains' | 'exact';
  matched: boolean;
  confidence: number;
  type?: 'qr' | 'barcode';
  format?: string;
  source?: 'decoder' | 'ocr_fallback' | 'none';
  location?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  qrCodeData?: string;
  qrCodeType?: string;
  qrCodeSize?: { width: number; height: number };
  qrCodePosition?: { x: number; y: number };
  retryCount?: number;
  isRetryEnabled?: boolean;
}

/**
 * 二维码检测选项
 */
export interface BarcodeDetectionOptions {
  maxRetries?: number;
  enableMasking?: boolean;
  maskColor?: string;
  maskPadding?: number;
  useWeChatQR?: boolean;
}

/**
 * 二维码检测分析结果
 */
export interface BarcodeAnalysisResult {
  allDetectedData: BarcodeDetectionResult[];
  matchResults: BarcodeResult[];
  retrySummary?: {
    totalRetries: number;
    successfulDetections: number;
    failedDetections: number;
  };
}

const normalizeFormat = (value: string | undefined) => {
  const normalized = (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return ({ I25: 'ITF', INTERLEAVED2OF5: 'ITF' } as Record<string, string>)[normalized] || normalized;
};

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

async function detectLinearBarcodes(
  imageSource: string | File,
): Promise<BarcodeDetectionResult[]> {
  try {
    const image = typeof imageSource === 'string'
      ? imageSource
      : await fileToDataUrl(imageSource);
    const response = await apiFetch('/barcode/detect/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image, code_types: ['linear'] }),
    });
    if (!response.ok) {
      throw new Error(`一维条码检测请求失败: ${response.status}`);
    }
    const payload = await response.json();
    if (!payload.success) {
      throw new Error(payload.error || '一维条码检测失败');
    }
    return (payload.codes || [])
      .filter((code: any) => code.type === 'barcode' && code.data)
      .map((code: any) => ({
        type: 'barcode' as const,
        data: String(code.data),
        confidence: Number(code.confidence || 0),
        format: String(code.format || ''),
        source: String(code.source || ''),
        preprocess: String(code.preprocess || ''),
        location: code.bbox,
      }));
  } catch (error) {
    console.error('❌ 一维条码后端检测失败:', error);
    return [];
  }
}

function deduplicateCodes(codes: BarcodeDetectionResult[]): BarcodeDetectionResult[] {
  const unique = new Map<string, BarcodeDetectionResult>();
  for (const code of codes) {
    if (!code.data) continue;
    const key = `${code.type}:${normalizeFormat((code as any).format)}:${code.data}`;
    const previous = unique.get(key);
    if (!previous || code.confidence > previous.confidence) {
      unique.set(key, code);
    }
  }
  return Array.from(unique.values());
}

function matchesRuleFormat(code: BarcodeDetectionResult, config: BarcodeConfig): boolean {
  if ((config.codeType || 'qr') === 'qr') return code.type === 'qr';
  if (code.type !== 'barcode') return false;
  const expectedFormat = normalizeFormat(config.barcodeFormat || 'auto');
  return !expectedFormat || expectedFormat === 'AUTO'
    || normalizeFormat((code as any).format) === expectedFormat;
}

function matchRule(
  config: BarcodeConfig,
  detectedCodes: BarcodeDetectionResult[],
  ocrText: string,
  qrRetryCount: number,
): BarcodeResult {
  const matchedCode = detectedCodes.find(code =>
    matchesRuleFormat(code, config)
    && validateBarcode(code.data, config.expectedText, config.matchMode)
  );

  if (matchedCode) {
    return {
      detectedText: matchedCode.data,
      expectedText: config.expectedText,
      matchMode: config.matchMode,
      matched: true,
      confidence: matchedCode.confidence,
      type: matchedCode.type,
      format: (matchedCode as any).format,
      source: 'decoder',
      location: matchedCode.location,
      qrCodeData: matchedCode.data,
      qrCodeType: matchedCode.type,
      qrCodeSize: matchedCode.location ? {
        width: matchedCode.location.width,
        height: matchedCode.location.height,
      } : undefined,
      qrCodePosition: matchedCode.location ? {
        x: matchedCode.location.x,
        y: matchedCode.location.y,
      } : undefined,
      retryCount: matchedCode.type === 'qr' ? qrRetryCount : 1,
      isRetryEnabled: matchedCode.type === 'qr',
    };
  }

  const isLinear = config.codeType === 'linear';
  const expectedDigits = config.expectedText.replace(/\D/g, '');
  const ocrDigits = ocrText.replace(/\D/g, '');
  const fallbackMatched = isLinear
    && (config.allowOcrFallback ?? true)
    && Boolean(expectedDigits)
    && (config.matchMode === 'exact'
      ? ocrDigits === expectedDigits
      : ocrDigits.includes(expectedDigits));

  return {
    detectedText: fallbackMatched ? expectedDigits : '',
    expectedText: config.expectedText,
    matchMode: config.matchMode,
    matched: fallbackMatched,
    confidence: 0,
    type: isLinear ? 'barcode' : 'qr',
    format: isLinear ? config.barcodeFormat || 'auto' : 'QR',
    source: fallbackMatched ? 'ocr_fallback' : 'none',
    qrCodeData: fallbackMatched ? expectedDigits : '',
    qrCodeType: fallbackMatched ? 'ocr_fallback' : (isLinear ? 'barcode' : 'qr'),
    retryCount: isLinear ? 1 : qrRetryCount,
    isRetryEnabled: !isLinear,
  };
}

/**
 * 执行二维码检测 - 支持重试机制
 *
 * @param imageSource - 要检测的图片文件或Base64字符串
 * @param barcodeConfigs - 二维码配置数组
 * @param enabled - 是否启用二维码检测
 * @param options - 检测选项（重试次数、遮罩等）
 * @returns 二维码检测分析结果
 */
export async function performBarcodeDetection(
  imageSource: string | File | null,
  barcodeConfigs: BarcodeConfig[],
  enabled: boolean = true,
  options: BarcodeDetectionOptions = {},
  ocrText: string = '',
): Promise<BarcodeAnalysisResult> {
  // 默认选项
  const {
    maxRetries = 5,
    enableMasking = true,
    maskColor = '#FFFFFF',
    maskPadding = 30,
    useWeChatQR = true
  } = options;

  // 如果未启用或没有配置或没有图片，返回空结果
  if (!enabled || barcodeConfigs.length === 0 || !imageSource) {
    return { allDetectedData: [], matchResults: [] };
  }

  try {
    console.log('🔍 开始二维码/一维条码检测...');

    const activeConfigs = barcodeConfigs.filter(config => config.enabled);
    const qrConfigs = activeConfigs.filter(config => (config.codeType || 'qr') === 'qr');
    const linearConfigs = activeConfigs.filter(config => config.codeType === 'linear');
    const expectedQrCodes = qrConfigs
      .map(config => ({
        expectedText: config.expectedText,
        matchMode: config.matchMode
      }));

    if (activeConfigs.length === 0) {
      return { allDetectedData: [], matchResults: [] };
    }

    const emptyQrResult = {
      allResults: [] as BarcodeDetectionResult[],
      matchResults: [],
      retrySummary: { totalRetries: 0, successfulDetections: 0, failedDetections: 0 },
    };
    const [retryResult, linearResults] = await Promise.all([
      expectedQrCodes.length > 0
        ? detectBarcodesWithRetry(imageSource, expectedQrCodes, {
            maxRetries,
            enableMasking,
            maskColor,
            maskPadding,
            useWeChatQR,
          })
        : Promise.resolve(emptyQrResult),
      linearConfigs.length > 0
        ? detectLinearBarcodes(imageSource)
        : Promise.resolve([] as BarcodeDetectionResult[]),
    ]);

    const allDetectedData = deduplicateCodes([
      ...retryResult.allResults,
      ...linearResults,
    ]);

    const qrRetryCount = retryResult.retrySummary.totalRetries || 1;
    const matchResults = activeConfigs.map(config =>
      matchRule(config, allDetectedData, ocrText, qrRetryCount)
    );

    const successfulDetections = matchResults.filter(result => result.matched).length;
    const retrySummary = {
      totalRetries: retryResult.retrySummary.totalRetries + (linearConfigs.length > 0 ? 1 : 0),
      successfulDetections,
      failedDetections: matchResults.length - successfulDetections,
    };

    console.log('✅ 二维码/一维条码检测完成:', {
      qr: allDetectedData.filter(item => item.type === 'qr').length,
      linear: allDetectedData.filter(item => item.type === 'barcode').length,
      ocrFallback: matchResults.filter(item => item.source === 'ocr_fallback').length,
    });

    return {
      allDetectedData,
      matchResults,
      retrySummary,
    };

  } catch (error) {
    console.error('❌ 二维码重试检测失败:', error);

    // 回退到原始检测方法
    try {
      console.log('🔄 回退到原始检测方法...');

      // 注意：detectBarcodes 可能只支持 File 对象，如果传入的是 base64 字符串，可能需要处理
      // 这里简化的假设 detectBarcodes 能处理或者我们只在 imageSource 是 File 时回退
      if (typeof imageSource === 'string') {
        console.warn('⚠️ 原始检测方法不支持 base64 字符串，跳过回退');
        return { allDetectedData: [], matchResults: [] };
      }

      const detectedBarcodes = await detectBarcodes(imageSource, {
        enableQR: true,
        useQuagga: false
      });

      const matchResults: BarcodeResult[] = [];
      barcodeConfigs.forEach(config => {
        if (!config.enabled) return;

        let matched = false;
        let detectedText = '';
        let confidence = 0;
        let type: 'qr' | 'barcode' | undefined;
        let location: { x: number; y: number; width: number; height: number } | undefined;
        let matchedResult: BarcodeDetectionResult | null = null;

        for (const detected of detectedBarcodes) {
          if (validateBarcode(detected.data, config.expectedText, config.matchMode)) {
            matched = true;
            detectedText = detected.data;
            confidence = detected.confidence;
            type = detected.type;
            location = detected.location;
            matchedResult = detected;
            break;
          }
        }

        matchResults.push({
          detectedText,
          expectedText: config.expectedText,
          matchMode: config.matchMode,
          matched,
          confidence,
          type,
          location,
          qrCodeData: matchedResult?.data || detectedText,
          qrCodeType: matchedResult?.type || 'qr',
          qrCodeSize: matchedResult?.location ? {
            width: matchedResult.location.width,
            height: matchedResult.location.height
          } : undefined,
          qrCodePosition: matchedResult?.location ? {
            x: matchedResult.location.x,
            y: matchedResult.location.y
          } : undefined,
          retryCount: 1,
          isRetryEnabled: false
        });
      });

      return {
        allDetectedData: detectedBarcodes,
        matchResults: matchResults
      };
    } catch (fallbackError) {
      console.error('❌ 原始检测方法也失败:', fallbackError);
      return { allDetectedData: [], matchResults: [] };
    }
  }
}
