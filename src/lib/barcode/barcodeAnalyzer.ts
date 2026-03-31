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
  options: BarcodeDetectionOptions = {}
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
    console.log('🔍 开始二维码检测（支持重试机制）...');

    // 准备期望的二维码配置
    const expectedBarcodes = barcodeConfigs
      .filter(config => config.enabled)
      .map(config => ({
        expectedText: config.expectedText,
        matchMode: config.matchMode
      }));

    if (expectedBarcodes.length === 0) {
      return { allDetectedData: [], matchResults: [] };
    }

    // 使用带重试机制的检测
    const retryResult = await detectBarcodesWithRetry(imageSource, expectedBarcodes, {
      maxRetries,
      enableMasking,
      maskColor,
      maskPadding,
      useWeChatQR
    });

    console.log('📊 重试检测结果:', retryResult);

    // 转换结果格式
    const matchResults: BarcodeResult[] = retryResult.matchResults.map((result) => {
      return {
        detectedText: result.detectedData || '',
        expectedText: result.expectedText,
        matchMode: result.matchMode,
        matched: result.matched,
        confidence: result.confidence || 0,
        type: 'qr' as const,
        location: result.location,
        qrCodeData: result.detectedData,
        qrCodeType: 'qr',
        qrCodeSize: result.location ? {
          width: result.location.width,
          height: result.location.height
        } : undefined,
        qrCodePosition: result.location ? {
          x: result.location.x,
          y: result.location.y
        } : undefined,
        retryCount: result.retryCount,
        isRetryEnabled: true
      };
    });

    console.log('✅ 二维码重试检测完成，匹配结果:', matchResults);

    return {
      allDetectedData: retryResult.allResults,
      matchResults: matchResults,
      retrySummary: retryResult.retrySummary
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
