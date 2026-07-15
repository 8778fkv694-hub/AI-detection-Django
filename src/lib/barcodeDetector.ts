import jsQR from 'jsqr';
import Quagga from 'quagga'; // 启用Quagga支持多二维码检测
import { apiFetch } from '@/lib/config';

export interface BarcodeDetectionResult {
  type: 'qr' | 'barcode';
  data: string;
  confidence: number;
  format?: string;
  source?: string;
  preprocess?: string;
  location?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface MaskedRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RetryDetectionOptions {
  maxRetries?: number;
  enableMasking?: boolean;
  maskColor?: string;
  maskPadding?: number;
}

export interface BarcodeDetectorOptions {
  enableQR?: boolean;
  enableBarcode?: boolean;
  barcodeTypes?: string[];
  useQuagga?: boolean; // 是否使用Quagga进行多二维码检测
  useWeChatQR?: boolean; // 是否使用微信二维码检测
}

/**
 * 专业的二维码检测器（暂时只支持二维码）
 */
export class BarcodeDetector {
  private options: BarcodeDetectorOptions;

  constructor(options: BarcodeDetectorOptions = { enableQR: true }) {
    this.options = {
      enableQR: true,
      useWeChatQR: false,
      ...options
    };
  }

  /**
   * 从图片URL检测二维码
   */
  async detectFromImageUrl(imageUrl: string): Promise<BarcodeDetectionResult[]> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('无法创建canvas上下文'));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        this.detectFromImageData(imageData).then(resolve).catch(reject);
      };

      img.onerror = () => {
        reject(new Error('图片加载失败'));
      };

      img.src = imageUrl;
    });
  }

  /**
   * 从ImageData检测二维码
   */
  async detectFromImageData(imageData: ImageData): Promise<BarcodeDetectionResult[]> {
    const results: BarcodeDetectionResult[] = [];

    try {
      // 优先使用微信二维码检测
      if (this.options.useWeChatQR) {
        const wechatResults = await this.detectWithWeChatQR(imageData);
        results.push(...wechatResults);
      } else if (this.options.useQuagga) {
        // 使用Quagga进行多二维码检测
        const quaggaResults = await this.detectWithQuagga(imageData);
        results.push(...quaggaResults);
      } else if (this.options.enableQR) {
        // 尝试多二维码检测（使用图像分割）
        const multipleResults = await this.detectMultipleWithSegmentation(imageData);
        if (multipleResults.length > 0) {
          results.push(...multipleResults);
        } else {
          // 回退到单二维码检测
          const qrResult = jsQR(imageData.data, imageData.width, imageData.height);
          if (qrResult) {
            results.push({
              type: 'qr',
              data: qrResult.data,
              confidence: 0.95, // jsQR不提供置信度，使用默认值
              location: {
                x: qrResult.location.topLeftCorner.x,
                y: qrResult.location.topLeftCorner.y,
                width: qrResult.location.topRightCorner.x - qrResult.location.topLeftCorner.x,
                height: qrResult.location.bottomLeftCorner.y - qrResult.location.topLeftCorner.y
              }
            });
          }
        }
      }
    } catch (error) {
      console.error('二维码检测错误:', error);
    }

    return results;
  }

  /**
   * 使用微信二维码检测器检测二维码
   */
  private async detectWithWeChatQR(imageData: ImageData): Promise<BarcodeDetectionResult[]> {
    try {
      // 将ImageData转换为base64
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('无法创建canvas上下文');
      }

      canvas.width = imageData.width;
      canvas.height = imageData.height;
      ctx.putImageData(imageData, 0, 0);

      const imageBase64 = canvas.toDataURL('image/png');

      // 调用后端微信二维码检测API
      const response = await apiFetch('/wechat-qr/detect/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image: imageBase64
        })
      });

      if (!response.ok) {
        throw new Error(`微信二维码检测API请求失败: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '微信二维码检测失败');
      }

      // 转换结果格式
      const results: BarcodeDetectionResult[] = result.detected_codes.map((code: any) => ({
        type: 'qr' as const,
        data: code.data,
        confidence: code.confidence,
        location: code.location
      }));

      console.log(`微信二维码检测完成，发现 ${results.length} 个二维码`);
      return results;

    } catch (error) {
      console.error('微信二维码检测错误:', error);
      return [];
    }
  }

  /**
   * 使用Quagga检测多个二维码
   */
  private async detectWithQuagga(imageData: ImageData): Promise<BarcodeDetectionResult[]> {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        resolve([]);
        return;
      }

      canvas.width = imageData.width;
      canvas.height = imageData.height;
      ctx.putImageData(imageData, 0, 0);

      const imageUrl = canvas.toDataURL();

      Quagga.decodeSingle({
        src: imageUrl,
        numOfWorkers: 0,
        decoder: {
          readers: this.options.enableQR ? ['qrcode_reader'] : ['code_128_reader', 'ean_reader'],
        },
        locate: true,
        locator: {
          patchSize: 'medium',
          halfSample: true
        }
      }, (result: any) => {
        const results: BarcodeDetectionResult[] = [];

        if (result && result.codeResult) {
          results.push({
            type: this.options.enableQR ? 'qr' : 'barcode',
            data: result.codeResult.code,
            confidence: result.codeResult.decodedCodes ?
              result.codeResult.decodedCodes.reduce((sum: number, code: any) => sum + (code.error || 0), 0) / result.codeResult.decodedCodes.length : 0.9,
            location: result.box ? {
              x: Math.min(...result.box.map((p: any) => p[0])),
              y: Math.min(...result.box.map((p: any) => p[1])),
              width: Math.max(...result.box.map((p: any) => p[0])) - Math.min(...result.box.map((p: any) => p[0])),
              height: Math.max(...result.box.map((p: any) => p[1])) - Math.min(...result.box.map((p: any) => p[1]))
            } : undefined
          });
        }

        resolve(results);
      });
    });
  }

  /**
   * 使用图像分割技术检测多个二维码
   */
  private async detectMultipleWithSegmentation(imageData: ImageData): Promise<BarcodeDetectionResult[]> {
    const results: BarcodeDetectionResult[] = [];

    try {
      // 方法1: 全图检测（提高敏感度）
      const fullResult = jsQR(imageData.data, imageData.width, imageData.height);
      if (fullResult) {
        results.push({
          type: 'qr',
          data: fullResult.data,
          confidence: 0.95,
          location: {
            x: fullResult.location.topLeftCorner.x,
            y: fullResult.location.topLeftCorner.y,
            width: fullResult.location.topRightCorner.x - fullResult.location.topLeftCorner.x,
            height: fullResult.location.bottomLeftCorner.y - fullResult.location.topLeftCorner.y
          }
        });
      }

      // 方法2: 多尺度滑动窗口检测（提高检测率）
      const scales = [0.5, 0.75, 1.0, 1.25, 1.5]; // 多尺度检测

      for (const scale of scales) {
        const scaledWidth = Math.floor(imageData.width * scale);
        const scaledHeight = Math.floor(imageData.height * scale);

        // 创建缩放后的图像
        const scaledImageData = this.scaleImageData(imageData, scaledWidth, scaledHeight);

        // 在缩放图像上检测
        const scaledResult = jsQR(scaledImageData.data, scaledImageData.width, scaledImageData.height);
        if (scaledResult) {
          // 将坐标转换回原始图像
          const originalX = Math.floor(scaledResult.location.topLeftCorner.x / scale);
          const originalY = Math.floor(scaledResult.location.topLeftCorner.y / scale);
          const originalWidth = Math.floor((scaledResult.location.topRightCorner.x - scaledResult.location.topLeftCorner.x) / scale);
          const originalHeight = Math.floor((scaledResult.location.bottomLeftCorner.y - scaledResult.location.topLeftCorner.y) / scale);

          // 检查是否已经检测过相同的二维码
          const isDuplicate = results.some(result =>
            result.data === scaledResult.data &&
            Math.abs(result.location!.x - originalX) < 30 &&
            Math.abs(result.location!.y - originalY) < 30
          );

          if (!isDuplicate) {
            results.push({
              type: 'qr',
              data: scaledResult.data,
              confidence: 0.90,
              location: {
                x: originalX,
                y: originalY,
                width: originalWidth,
                height: originalHeight
              }
            });
          }
        }
      }

      // 方法3: 滑动窗口检测（更小的步长，更高的覆盖率）
      const windowSize = Math.min(imageData.width, imageData.height) / 4;
      const stepSize = windowSize / 4; // 更小的步长

      for (let y = 0; y < imageData.height - windowSize; y += stepSize) {
        for (let x = 0; x < imageData.width - windowSize; x += stepSize) {
          // 提取窗口区域
          const windowData = this.extractImageRegion(imageData, x, y, windowSize, windowSize);

          // 在窗口内检测二维码
          const qrResult = jsQR(windowData.data, windowData.width, windowData.height);
          if (qrResult) {
            // 检查是否已经检测过相同的二维码（避免重复）
            const isDuplicate = results.some(result =>
              result.data === qrResult.data &&
              Math.abs(result.location!.x - (x + qrResult.location.topLeftCorner.x)) < 30 &&
              Math.abs(result.location!.y - (y + qrResult.location.topLeftCorner.y)) < 30
            );

            if (!isDuplicate) {
              results.push({
                type: 'qr',
                data: qrResult.data,
                confidence: 0.85,
                location: {
                  x: x + qrResult.location.topLeftCorner.x,
                  y: y + qrResult.location.topLeftCorner.y,
                  width: qrResult.location.topRightCorner.x - qrResult.location.topLeftCorner.x,
                  height: qrResult.location.bottomLeftCorner.y - qrResult.location.topLeftCorner.y
                }
              });
            }
          }
        }
      }

      // 方法4: 图像预处理后检测
      const preprocessedData = this.preprocessImage(imageData);
      const preprocessedResult = jsQR(preprocessedData.data, preprocessedData.width, preprocessedData.height);
      if (preprocessedResult) {
        const isDuplicate = results.some(result =>
          result.data === preprocessedResult.data &&
          Math.abs(result.location!.x - preprocessedResult.location.topLeftCorner.x) < 30 &&
          Math.abs(result.location!.y - preprocessedResult.location.topLeftCorner.y) < 30
        );

        if (!isDuplicate) {
          results.push({
            type: 'qr',
            data: preprocessedResult.data,
            confidence: 0.88,
            location: {
              x: preprocessedResult.location.topLeftCorner.x,
              y: preprocessedResult.location.topLeftCorner.y,
              width: preprocessedResult.location.topRightCorner.x - preprocessedResult.location.topLeftCorner.x,
              height: preprocessedResult.location.bottomLeftCorner.y - preprocessedResult.location.topLeftCorner.y
            }
          });
        }
      }

    } catch (error) {
      console.error('多二维码分割检测错误:', error);
    }

    return results;
  }

  /**
   * 缩放图像数据
   */
  private scaleImageData(imageData: ImageData, newWidth: number, newHeight: number): ImageData {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('无法创建canvas上下文');
    }

    canvas.width = newWidth;
    canvas.height = newHeight;

    // 创建临时canvas来绘制原始图像
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');

    if (!tempCtx) {
      throw new Error('无法创建临时canvas上下文');
    }

    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    tempCtx.putImageData(imageData, 0, 0);

    // 缩放绘制
    ctx.drawImage(tempCanvas, 0, 0, newWidth, newHeight);

    return ctx.getImageData(0, 0, newWidth, newHeight);
  }

  /**
   * 图像预处理（增强对比度和清晰度）
   */
  private preprocessImage(imageData: ImageData): ImageData {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('无法创建canvas上下文');
    }

    canvas.width = imageData.width;
    canvas.height = imageData.height;

    // 创建新的ImageData
    const newImageData = ctx.createImageData(imageData.width, imageData.height);
    const sourceData = imageData.data;
    const targetData = newImageData.data;

    // 应用图像增强
    for (let i = 0; i < sourceData.length; i += 4) {
      // 获取RGB值
      let r = sourceData[i];
      let g = sourceData[i + 1];
      let b = sourceData[i + 2];
      const a = sourceData[i + 3];

      // 转换为灰度
      const gray = Math.floor(0.299 * r + 0.587 * g + 0.114 * b);

      // 增强对比度
      const enhanced = Math.min(255, Math.max(0, (gray - 128) * 1.5 + 128));

      // 二值化处理
      const binary = enhanced > 128 ? 255 : 0;

      targetData[i] = binary;     // R
      targetData[i + 1] = binary; // G
      targetData[i + 2] = binary; // B
      targetData[i + 3] = a;      // A
    }

    return newImageData;
  }

  /**
   * 提取图像区域
   */
  private extractImageRegion(imageData: ImageData, x: number, y: number, width: number, height: number): ImageData {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('无法创建canvas上下文');
    }

    canvas.width = width;
    canvas.height = height;

    // 创建新的ImageData
    const newImageData = ctx.createImageData(width, height);
    const sourceData = imageData.data;
    const targetData = newImageData.data;

    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const sourceIndex = ((y + row) * imageData.width + (x + col)) * 4;
        const targetIndex = (row * width + col) * 4;

        if (sourceIndex >= 0 && sourceIndex < sourceData.length) {
          targetData[targetIndex] = sourceData[sourceIndex];     // R
          targetData[targetIndex + 1] = sourceData[sourceIndex + 1]; // G
          targetData[targetIndex + 2] = sourceData[sourceIndex + 2]; // B
          targetData[targetIndex + 3] = sourceData[sourceIndex + 3]; // A
        }
      }
    }

    return newImageData;
  }

  /**
   * 使用微信二维码检测器进行重试检测
   */
  private async detectWithWeChatQRRetry(
    imageSource: string | File | ImageData,
    expectedBarcodes: Array<{ expectedText: string; matchMode: 'contains' | 'exact' }>,
    options: RetryDetectionOptions = {}
  ): Promise<{
    allResults: BarcodeDetectionResult[];
    matchResults: Array<{
      expectedText: string;
      matchMode: 'contains' | 'exact';
      matched: boolean;
      detectedData?: string;
      confidence?: number;
      location?: { x: number; y: number; width: number; height: number };
      retryCount: number;
    }>;
    retrySummary: {
      totalRetries: number;
      successfulDetections: number;
      failedDetections: number;
      totalDetected?: number;
      iterations?: number;
    };
    processImages?: any[];  // 新增：过程图片
  }> {
    try {
      // 获取图片的base64数据
      let imageBase64: string;

      if (typeof imageSource === 'string') {
        imageBase64 = imageSource;
      } else if (imageSource instanceof File) {
        imageBase64 = await this.fileToBase64(imageSource);
      } else {
        // ImageData
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          throw new Error('无法创建canvas上下文');
        }

        canvas.width = imageSource.width;
        canvas.height = imageSource.height;
        ctx.putImageData(imageSource, 0, 0);

        imageBase64 = canvas.toDataURL('image/png');
      }

      // 调用后端微信二维码重试检测API
      // 兼容 data URL 与纯 base64，后端通常仅需逗号后的数据
      const payloadImage = imageBase64.startsWith('data:') ? imageBase64.split(',')[1] : imageBase64;

      console.log(`📤 发送微信二维码检测请求，Payload Image Length: ${payloadImage.length}`);

      const response = await apiFetch('/wechat-qr/detect-with-retry/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'X-CSRFToken': getCookie('csrftoken') || '' // apiFetch inside config might handle this, but explicit check doesn't hurt if needed. 
          // However, the error is "Model loading failed", so it's a backend issue.
        },
        body: JSON.stringify({
          image: payloadImage,
          expected_codes: expectedBarcodes,
          max_retries: options.maxRetries || 5
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          // 简单退避重试一次
          await new Promise(r => setTimeout(r, 2000));
          const retry = await apiFetch('/wechat-qr/detect-with-retry/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: payloadImage, expected_codes: expectedBarcodes, max_retries: options.maxRetries || 5 })
          });
          if (!retry.ok) {
            throw new Error(`微信二维码重试检测API请求失败: ${retry.status}`);
          }
          const retried = await retry.json();
          if (!retried.success) throw new Error(retried.error || '微信二维码重试检测失败');
          return retried;
        }
        throw new Error(`微信二维码重试检测API请求失败: ${response.status}`);
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || '微信二维码重试检测失败');
      }

      // 转换结果格式
      const allResults: BarcodeDetectionResult[] = [];

      // 处理所有检测到的二维码（包括迭代检测的结果）
      if (result.all_detected_codes) {
        result.all_detected_codes.forEach((code: any) => {
          allResults.push({
            type: 'qr',
            data: code.data,
            confidence: code.confidence,
            location: code.location
          });
        });
      } else {
        // 兼容旧版本：只处理匹配的二维码
        result.match_results.forEach((match: any) => {
          if (match.matched && match.detected_data) {
            allResults.push({
              type: 'qr',
              data: match.detected_data,
              confidence: match.confidence,
              location: match.location
            });
          }
        });
      }

      const matchResults = result.match_results.map((match: any) => {
        return {
          expectedText: match.expected_text,
          matchMode: match.match_mode,
          matched: match.matched,
          detectedData: match.detected_data,
          confidence: match.confidence,
          location: match.location,
          retryCount: match.retry_count
        };
      });

      const totalDetected = result.retry_summary.total_detected || allResults.length;
      const iterations = result.retry_summary.iterations || 1;

      console.log(`微信二维码迭代检测完成: 总共检测到 ${totalDetected} 个二维码，成功 ${result.retry_summary.successful_detections} 个，失败 ${result.retry_summary.failed_detections} 个，迭代 ${iterations} 次`);

      return {
        allResults,
        matchResults,
        retrySummary: {
          ...result.retry_summary,
          totalDetected,
          iterations
        },
        processImages: result.process_images || []  // 新增：返回过程图片
      };

    } catch (error) {
      console.error('微信二维码重试检测错误:', error);

      // 返回空结果
      return {
        allResults: [],
        matchResults: expectedBarcodes.map(config => ({
          expectedText: config.expectedText,
          matchMode: config.matchMode,
          matched: false,
          retryCount: 0
        })),
        retrySummary: {
          totalRetries: 0,
          successfulDetections: 0,
          failedDetections: expectedBarcodes.length
        },
        processImages: []  // 新增：空的过程图片数组
      };
    }
  }

  /**
   * 将文件转换为base64
   */
  private async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * 从文件检测二维码
   */
  async detectFromFile(file: File): Promise<BarcodeDetectionResult[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('无法创建canvas上下文'));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          this.detectFromImageData(imageData).then(resolve).catch(reject);
        };

        img.onerror = () => {
          reject(new Error('图片加载失败'));
        };

        img.src = e.target?.result as string;
      };

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * 创建带遮罩的图片数据
   */
  private createMaskedImageData(imageData: ImageData, maskedRegions: MaskedRegion[], maskColor: string = '#FFFFFF', maskPadding: number = 10): ImageData {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('无法创建canvas上下文');
    }

    canvas.width = imageData.width;
    canvas.height = imageData.height;

    // 绘制原始图片
    ctx.putImageData(imageData, 0, 0);

    // 绘制遮罩区域
    ctx.fillStyle = maskColor;
    maskedRegions.forEach(region => {
      const x = Math.max(0, region.x - maskPadding);
      const y = Math.max(0, region.y - maskPadding);
      const width = Math.min(imageData.width - x, region.width + 2 * maskPadding);
      const height = Math.min(imageData.height - y, region.height + 2 * maskPadding);

      ctx.fillRect(x, y, width, height);
    });

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  /**
   * 带重试机制的二维码检测
   */
  async detectWithRetry(
    imageSource: string | File | ImageData,
    expectedBarcodes: Array<{ expectedText: string; matchMode: 'contains' | 'exact' }>,
    options: RetryDetectionOptions = {}
  ): Promise<{
    allResults: BarcodeDetectionResult[];
    matchResults: Array<{
      expectedText: string;
      matchMode: 'contains' | 'exact';
      matched: boolean;
      detectedData?: string;
      confidence?: number;
      location?: { x: number; y: number; width: number; height: number };
      retryCount: number;
    }>;
    retrySummary: {
      totalRetries: number;
      successfulDetections: number;
      failedDetections: number;
      totalDetected?: number;
      iterations?: number;
    };
    processImages?: any[];  // 新增：过程图片
  }> {
    // 如果启用微信二维码检测，使用后端API
    if (this.options.useWeChatQR) {
      return this.detectWithWeChatQRRetry(imageSource, expectedBarcodes, options);
    }
    const {
      maxRetries = 5,
      enableMasking = true,
      maskColor = '#FFFFFF',
      maskPadding = 10
    } = options;

    let allResults: BarcodeDetectionResult[] = [];
    let matchResults: Array<{
      expectedText: string;
      matchMode: 'contains' | 'exact';
      matched: boolean;
      detectedData?: string;
      confidence?: number;
      location?: { x: number; y: number; width: number; height: number };
      retryCount: number;
    }> = [];

    let totalRetries = 0;
    let successfulDetections = 0;
    let failedDetections = 0;

    // 初始化匹配结果
    expectedBarcodes.forEach(config => {
      matchResults.push({
        expectedText: config.expectedText,
        matchMode: config.matchMode,
        matched: false,
        retryCount: 0
      });
    });

    // 获取原始图片数据
    let originalImageData: ImageData;
    if (typeof imageSource === 'string') {
      originalImageData = await this.getImageDataFromUrl(imageSource);
    } else if (imageSource instanceof File) {
      originalImageData = await this.getImageDataFromFile(imageSource);
    } else {
      originalImageData = imageSource;
    }

    // 执行重试检测
    for (let retry = 0; retry <= maxRetries; retry++) {
      console.log(`🔄 二维码检测重试 ${retry + 1}/${maxRetries + 1}`);

      let currentImageData = originalImageData;

      // 如果启用遮罩且不是第一次检测，创建遮罩图片
      if (enableMasking && retry > 0) {
        const maskedRegions: MaskedRegion[] = [];

        // 收集已成功检测的二维码位置
        matchResults.forEach((result) => {
          if (result.matched && result.location) {
            maskedRegions.push({
              x: result.location.x,
              y: result.location.y,
              width: result.location.width,
              height: result.location.height
            });
          }
        });

        if (maskedRegions.length > 0) {
          console.log(`🎭 创建遮罩图片，隐藏 ${maskedRegions.length} 个已检测区域`);
          currentImageData = this.createMaskedImageData(originalImageData, maskedRegions, maskColor, maskPadding);
        }
      }

      // 执行检测
      const detectedBarcodes = await this.detectFromImageData(currentImageData);
      allResults.push(...detectedBarcodes);
      totalRetries++;

      console.log(`📊 第 ${retry + 1} 次检测到 ${detectedBarcodes.length} 个二维码`);

      // 检查匹配结果
      let hasNewMatches = false;
      matchResults.forEach((result) => {
        if (result.matched) return; // 已匹配的跳过

        result.retryCount = retry + 1;

        // 检查是否有新的匹配
        for (const detected of detectedBarcodes) {
          if (validateBarcode(detected.data, result.expectedText, result.matchMode)) {
            result.matched = true;
            result.detectedData = detected.data;
            result.confidence = detected.confidence;
            result.location = detected.location;
            hasNewMatches = true;
            successfulDetections++;
            console.log(`✅ 匹配成功: ${result.expectedText} -> ${detected.data}`);
            break;
          }
        }
      });

      // 如果所有二维码都已匹配，提前结束
      const allMatched = matchResults.every(result => result.matched);
      if (allMatched) {
        console.log(`🎉 所有二维码检测完成，共重试 ${retry + 1} 次`);
        break;
      }

      // 如果没有新匹配且不是最后一次重试，继续
      if (!hasNewMatches && retry < maxRetries) {
        console.log(`⏳ 第 ${retry + 1} 次检测无新匹配，继续重试...`);
      }
    }

    // 统计失败的检测
    failedDetections = matchResults.filter(result => !result.matched).length;

    console.log(`📈 重试检测完成: 成功 ${successfulDetections} 个，失败 ${failedDetections} 个，总重试 ${totalRetries} 次`);

    return {
      allResults,
      matchResults,
      retrySummary: {
        totalRetries,
        successfulDetections,
        failedDetections
      }
    };
  }

  /**
   * 从URL获取图片数据
   */
  private async getImageDataFromUrl(imageUrl: string): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('无法创建canvas上下文'));
          return;
        }

        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        resolve(imageData);
      };

      img.onerror = () => {
        reject(new Error('图片加载失败'));
      };

      img.src = imageUrl;
    });
  }

  /**
   * 从文件获取图片数据
   */
  private async getImageDataFromFile(file: File): Promise<ImageData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            reject(new Error('无法创建canvas上下文'));
            return;
          }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          resolve(imageData);
        };

        img.onerror = () => {
          reject(new Error('图片加载失败'));
        };

        img.src = e.target?.result as string;
      };

      reader.onerror = () => {
        reject(new Error('文件读取失败'));
      };

      reader.readAsDataURL(file);
    });
  }
}

/**
 * 便捷函数：检测图片中的二维码
 */
export async function detectBarcodes(
  imageSource: string | File | ImageData,
  options?: BarcodeDetectorOptions
): Promise<BarcodeDetectionResult[]> {
  const detector = new BarcodeDetector(options);

  if (typeof imageSource === 'string') {
    return detector.detectFromImageUrl(imageSource);
  } else if (imageSource instanceof File) {
    return detector.detectFromFile(imageSource);
  } else {
    return detector.detectFromImageData(imageSource);
  }
}

/**
 * 验证检测到的二维码是否匹配期望值
 */
export function validateBarcode(
  detectedData: string,
  expectedData: string,
  matchMode: 'contains' | 'exact'
): boolean {
  if (!expectedData.trim()) {
    return Boolean(detectedData.trim());
  }
  if (matchMode === 'exact') {
    return detectedData === expectedData;
  } else {
    return detectedData.includes(expectedData) || expectedData.includes(detectedData);
  }
}

/**
 * 便捷函数：带重试机制的二维码检测
 */
export async function detectBarcodesWithRetry(
  imageSource: string | File | ImageData,
  expectedBarcodes: Array<{ expectedText: string; matchMode: 'contains' | 'exact' }>,
  options?: RetryDetectionOptions & { useWeChatQR?: boolean }
): Promise<{
  allResults: BarcodeDetectionResult[];
  matchResults: Array<{
    expectedText: string;
    matchMode: 'contains' | 'exact';
    matched: boolean;
    detectedData?: string;
    confidence?: number;
    location?: { x: number; y: number; width: number; height: number };
    retryCount: number;
  }>;
  retrySummary: {
    totalRetries: number;
    successfulDetections: number;
    failedDetections: number;
  };
}> {
  const detector = new BarcodeDetector({
    enableQR: true,
    useWeChatQR: options?.useWeChatQR || false
  });
  return detector.detectWithRetry(imageSource, expectedBarcodes, options);
}
