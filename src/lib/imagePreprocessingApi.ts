/**
 * 图片预处理API调用
 */
import { apiFetch } from '@/lib/config';

export interface PreprocessingOptions {
  brightness?: number;        // 亮度调整 (-100 到 100)
  contrast?: number;          // 对比度调整 (0.1 到 3.0)
  sharpness?: number;         // 锐化强度 (0 到 2.0)
  rotation?: number;          // 旋转角度 (-180 到 180)
  denoise?: boolean;          // 是否去噪
  grayscale?: boolean;        // 是否转为灰度
  binaryThreshold?: number;  // 二值化阈值 (0-255)
  scale?: number;            // 缩放比例 (0.1 到 3.0)
}

export interface PreprocessingResult {
  success: boolean;
  processed_image?: string;   // base64编码的处理后图片
  original_size?: [number, number];
  processed_size?: [number, number];
  applied_options?: PreprocessingOptions;
  error?: string;
}

export interface QualityMetrics {
  brightness: number;
  contrast: number;
  sharpness: number;
  noise: number;
  blur: number;
  resolution: [number, number];
  file_size: number;
}

export interface QualityAnalysisResult {
  success: boolean;
  metrics?: QualityMetrics;
  recommendations?: Array<{
    type: string;
    value: any;
    confidence: number;
    reason: string;
  }>;
  error?: string;
}

export interface PreprocessingStatus {
  success: boolean;
  status: string;
  supported_formats: string[];
  version: string;
}

/**
 * 预处理图片
 */
export async function preprocessImage(
  imageData: string,
  options: PreprocessingOptions
): Promise<PreprocessingResult> {
  try {
    // 兼容 data URL 与纯 base64：后端通常仅需要逗号后的部分
    const payloadImageData = imageData.startsWith('data:') ? imageData.split(',')[1] : imageData;
    const response = await apiFetch('/image-preprocessing/preprocess/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_data: payloadImageData,
        options: options
      })
    });

    // 检查响应状态
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('预处理服务不可用');
      }
      if (response.status === 429) {
        // 简单的退避重试一次（尊重 retry_after）
        let retryAfter = 3;
        try {
          const txt = await response.text();
          const parsed = JSON.parse(txt);
          if (parsed?.retry_after) retryAfter = Number(parsed.retry_after);
        } catch { }
        await new Promise(r => setTimeout(r, Math.max(1, retryAfter) * 1000));
        // 重试一次
        const retryResp = await apiFetch('/image-preprocessing/preprocess/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_data: payloadImageData, options })
        });
        if (retryResp.ok) {
          return await retryResp.json();
        }
        const retryText = await retryResp.text();
        throw new Error(`服务器繁忙: ${retryResp.status} - ${retryText}`);
      }
      const errorText = await response.text();
      throw new Error(`服务器错误: ${response.status} - ${errorText}`);
    }

    // 尝试解析JSON
    let result;
    try {
      result = await response.json();
    } catch (jsonError) {
      throw new Error('服务器返回了无效的JSON响应');
    }

    return result;
  } catch (error) {
    console.error('图片预处理API调用失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    };
  }
}

/**
 * 分析图片质量
 */
export async function analyzeImageQuality(imageData: string): Promise<QualityAnalysisResult> {
  try {
    const payloadImageData = imageData.startsWith('data:') ? imageData.split(',')[1] : imageData;
    const response = await apiFetch('/image-preprocessing/analyze-quality/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_data: payloadImageData
      })
    });

    // 检查响应状态
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('质量分析服务不可用');
      }
      if (response.status === 429) {
        let retryAfter = 3;
        try {
          const txt = await response.text();
          const parsed = JSON.parse(txt);
          if (parsed?.retry_after) retryAfter = Number(parsed.retry_after);
        } catch { }
        await new Promise(r => setTimeout(r, Math.max(1, retryAfter) * 1000));
        const retryResp = await apiFetch('/image-preprocessing/analyze-quality/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image_data: payloadImageData })
        });
        if (retryResp.ok) {
          return await retryResp.json();
        }
        const retryText = await retryResp.text();
        throw new Error(`服务器繁忙: ${retryResp.status} - ${retryText}`);
      }
      const errorText = await response.text();
      throw new Error(`服务器错误: ${response.status} - ${errorText}`);
    }

    // 尝试解析JSON
    let result;
    try {
      result = await response.json();
    } catch (jsonError) {
      throw new Error('服务器返回了无效的JSON响应');
    }

    return result;
  } catch (error) {
    console.error('图片质量分析API调用失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    };
  }
}

/**
 * 获取预处理服务状态
 */
export async function getPreprocessingStatus(): Promise<PreprocessingStatus> {
  try {
    const response = await apiFetch('/image-preprocessing/status/');
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || '获取状态失败');
    }

    return result;
  } catch (error) {
    console.error('获取预处理服务状态失败:', error);
    return {
      success: false,
      status: 'error',
      supported_formats: [],
      version: 'unknown'
    };
  }
}

/**
 * 批量预处理图片
 */
export async function batchPreprocessImages(
  images: Array<{ id: string; data: string; options: PreprocessingOptions }>
): Promise<Array<{ id: string; result: PreprocessingResult }>> {
  const results = await Promise.allSettled(
    images.map(async (image) => {
      const result = await preprocessImage(image.data, image.options);
      return { id: image.id, result };
    })
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        id: images[index].id,
        result: {
          success: false,
          error: result.reason?.message || '处理失败'
        }
      };
    }
  });
}

/**
 * 智能预处理 - 根据质量分析自动选择参数
 */
export async function smartPreprocess(imageData: string): Promise<PreprocessingResult> {
  try {
    // 先分析图片质量
    const qualityResult = await analyzeImageQuality(imageData);

    if (!qualityResult.success || !qualityResult.recommendations) {
      return {
        success: false,
        error: '无法分析图片质量'
      };
    }

    // 根据推荐生成预处理参数
    const options: PreprocessingOptions = {};

    qualityResult.recommendations.forEach(rec => {
      switch (rec.type) {
        case 'brightness':
          options.brightness = rec.value;
          break;
        case 'contrast':
          options.contrast = rec.value;
          break;
        case 'sharpness':
          options.sharpness = rec.value;
          break;
        case 'denoise':
          options.denoise = rec.value;
          break;
        case 'grayscale':
          options.grayscale = rec.value;
          break;
        case 'binary_threshold':
          options.binaryThreshold = rec.value;
          break;
      }
    });

    // 执行预处理
    return await preprocessImage(imageData, options);
  } catch (error) {
    console.error('智能预处理失败:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '智能预处理失败'
    };
  }
}

/**
 * 预处理参数预设
 */
export const PREPROCESSING_PRESETS = {
  brightness: {
    brightness: 30,
    contrast: 1.2
  },
  contrast: {
    contrast: 1.5,
    brightness: 10
  },
  sharpness: {
    sharpness: 0.8,
    contrast: 1.1
  },
  rotation: {
    rotation: 0 // 需要手动设置角度
  },
  denoise: {
    denoise: true,
    sharpness: 0.3
  },
  binary: {
    grayscale: true,
    binaryThreshold: 128,
    contrast: 2.0
  },
  auto: {} // 智能选择参数
} as const;

/**
 * 应用预设参数
 */
export function applyPreset(presetName: keyof typeof PREPROCESSING_PRESETS, customOptions: Partial<PreprocessingOptions> = {}): PreprocessingOptions {
  const preset = PREPROCESSING_PRESETS[presetName];
  return { ...preset, ...customOptions };
}
