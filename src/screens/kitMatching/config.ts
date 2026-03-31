/**
 * 齐套化检测配置文件
 *
 * 用途：存储齐套化检测页面的配置、常量和工具函数
 * 位置：src/screens/kitMatching/config.ts
 */

/**
 * 计算图片清晰度（使用拉普拉斯算子，异步版本，避免阻塞主线程）
 *
 * @param imageData - Canvas ImageData 对象
 * @returns Promise<number> - 清晰度评分 (0-100)
 */
export const calculateSharpnessAsync = (imageData: ImageData): Promise<number> => {
  return new Promise((resolve) => {
    // 使用 requestIdleCallback 或 setTimeout 来异步计算，避免阻塞主线程
    const calculate = () => {
      const data = imageData.data;
      const width = imageData.width;
      const height = imageData.height;
      let sharpness = 0;

      // 转换为灰度
      const grayData = new Uint8Array(width * height);
      for (let i = 0; i < data.length; i += 4) {
        grayData[i / 4] = (data[i] + data[i + 1] + data[i + 2]) / 3;
      }

      // 计算拉普拉斯算子
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = y * width + x;
          const laplacian =
            grayData[idx - 1] + grayData[idx + 1] +
            grayData[idx - width] + grayData[idx + width] -
            4 * grayData[idx];
          sharpness += Math.abs(laplacian);
        }
      }

      resolve(Math.min(100, (sharpness / (width * height)) * 0.1));
    };

    // 优先使用 requestIdleCallback，如果不可用则使用 setTimeout
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(calculate, { timeout: 1000 });
    } else {
      setTimeout(calculate, 0);
    }
  });
};

/**
 * 齐套化检测配置常量
 */
export const KIT_MATCHING_CONFIG = {
  // 检测间隔（毫秒）
  DETECTION_INTERVAL: 1000,

  // 抓拍冷却时间（毫秒）
  CAPTURE_COOLDOWN: 500,

  // 检测完成后的延时时间（毫秒）- 用于继续寻找综合评分最佳的图片
  POST_DETECTION_DELAY: 3000,

  // ROI 裁剪边距（像素）
  ROI_MARGIN: 10,

  // ROI 拼接设置
  STITCH: {
    PADDING: 10,
    MAX_WIDTH: 800,
    MAX_HEIGHT: 600,
    JPEG_QUALITY: 0.8,
  },

  // 默认检测阈值
  DEFAULT_THRESHOLD: 0.6,

  // 抓拍阈值
  CAPTURE_THRESHOLD: 0.5,

  // 综合评分权重
  COMPOSITE_SCORE_WEIGHTS: {
    CONFIDENCE: 0.5,    // 置信度权重
    SHARPNESS: 0.3,     // 清晰度权重
    ROI_AREA: 0.2,      // ROI 面积权重
  },
} as const;

/**
 * 检测模式
 */
export type DetectionMode = 'manual' | 'auto';

/**
 * 阈值分组类型
 */
export type ThresholdGroup = 'names' | 'labels' | 'others';

/**
 * 默认展开的阈值分组
 */
export const DEFAULT_EXPANDED_GROUPS: Set<ThresholdGroup> = new Set(['names', 'labels', 'others']);
