/**
 * 图像清晰度计算工具
 * 使用拉普拉斯方差 + JPEG 块伪影惩罚算法
 * 与后端算法保持一致
 *
 * 修复：纯 Laplacian 方差会把 JPEG 8×8 块边界的阶梯跳变当作"高清晰度"，
 * 导致压缩越重分数反而越高。现在增加 blockArtifactPenalty：
 *   1. 采样水平 & 垂直方向上 8 像素间隔的灰度跳变（块边界）
 *   2. 采样非 8 像素间隔的灰度跳变（自然纹理）
 *   3. blockRatio = 块边界均值 / 自然纹理均值
 *      - 无压缩图像：blockRatio ≈ 1（块边界与非边界差异不大）
 *      - 重压缩图像：blockRatio >> 1（块边界上出现明显阶梯跳变）
 *   4. penalty = clamp(1 - (blockRatio - 1) * 0.5, 0.2, 1.0)
 *      blockRatio=1 → penalty=1（不惩罚）
 *      blockRatio=2 → penalty=0.5
 *      blockRatio≥2.6 → penalty=0.2（最多扣 80%）
 */

/**
 * 将 RGBA ImageData 转灰度
 */
function toGrayscale(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const j = i * 4;
    // ITU-R BT.601 加权灰度（比简单平均更准确）
    gray[i] = 0.299 * data[j] + 0.587 * data[j + 1] + 0.114 * data[j + 2];
  }
  return gray;
}

/**
 * 计算 Laplacian 方差
 */
function laplacianVariance(gray: Uint8Array, width: number, height: number): number {
  let sum = 0;
  let sumSq = 0;
  let count = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        gray[idx - 1] + gray[idx + 1] +
        gray[idx - width] + gray[idx + width] -
        4 * gray[idx];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }

  if (count === 0) return 0;
  const mean = sum / count;
  return sumSq / count - mean * mean;
}

/**
 * 检测 JPEG 8×8 块伪影强度
 * 返回惩罚因子 0.2 ~ 1.0（1.0 = 无伪影，0.2 = 严重伪影）
 */
function jpegBlockPenalty(gray: Uint8Array, width: number, height: number): number {
  if (width < 24 || height < 24) return 1.0; // 图太小无法判断

  let blockEdgeSum = 0;
  let blockEdgeCount = 0;
  let nonBlockEdgeSum = 0;
  let nonBlockEdgeCount = 0;

  // 采样水平方向灰度跳变
  for (let y = 2; y < height - 2; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const diff = Math.abs(gray[idx] - gray[idx - 1]);
      if (x % 8 === 0) {
        blockEdgeSum += diff;
        blockEdgeCount++;
      } else if (x % 8 !== 7 && x % 8 !== 1) {
        // 排除紧邻块边界的像素，只采样块内部
        nonBlockEdgeSum += diff;
        nonBlockEdgeCount++;
      }
    }
  }

  // 采样垂直方向灰度跳变
  for (let x = 2; x < width - 2; x++) {
    for (let y = 1; y < height - 1; y++) {
      const idx = y * width + x;
      const diff = Math.abs(gray[idx] - gray[idx - width]);
      if (y % 8 === 0) {
        blockEdgeSum += diff;
        blockEdgeCount++;
      } else if (y % 8 !== 7 && y % 8 !== 1) {
        nonBlockEdgeSum += diff;
        nonBlockEdgeCount++;
      }
    }
  }

  if (nonBlockEdgeCount === 0 || blockEdgeCount === 0) return 1.0;

  const blockEdgeMean = blockEdgeSum / blockEdgeCount;
  const nonBlockEdgeMean = nonBlockEdgeSum / nonBlockEdgeCount;

  if (nonBlockEdgeMean < 0.5) return 1.0; // 近乎纯色图，跳过

  const blockRatio = blockEdgeMean / nonBlockEdgeMean;

  // blockRatio ≈ 1 → 自然纹理（无惩罚）
  // blockRatio > 1 → 块边界比内部更突兀 → JPEG 伪影
  const penalty = Math.max(0.2, Math.min(1.0, 1 - (blockRatio - 1) * 0.5));
  return penalty;
}

/**
 * 核心清晰度计算（同步，供两个导出函数复用）
 */
function computeSharpness(data: Uint8ClampedArray, width: number, height: number): number {
  if (width <= 2 || height <= 2) return 0;

  const gray = toGrayscale(data, width, height);
  const variance = laplacianVariance(gray, width, height);
  const penalty = jpegBlockPenalty(gray, width, height);

  // 归一化到 0-100，再乘以惩罚因子
  const raw = Math.min(100, variance / 10);
  return raw * penalty;
}

/**
 * ROI 质量评估结果
 */
export interface ROIQualityResult {
  /** 清晰度分数 0-100 */
  sharpness: number;
  /** 平均亮度 0-255 */
  brightness: number;
  /** 对比度（灰度标准差）0-128 */
  contrast: number;
  /** 是否通过亮度下限（默认 > 30） */
  brightEnough: boolean;
  /** 是否通过对比度下限（默认 > 15） */
  contrastEnough: boolean;
  /** 综合质量是否合格 */
  qualityOk: boolean;
}

/**
 * 计算亮度和对比度
 */
function brightnessContrast(gray: Uint8Array): { brightness: number; contrast: number } {
  if (gray.length === 0) return { brightness: 0, contrast: 0 };

  let sum = 0;
  for (let i = 0; i < gray.length; i++) {
    sum += gray[i];
  }
  const mean = sum / gray.length;

  let varianceSum = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i] - mean;
    varianceSum += d * d;
  }
  const std = Math.sqrt(varianceSum / gray.length);

  return { brightness: mean, contrast: std };
}

/**
 * 计算ROI（感兴趣区域）的清晰度 - 同步版本
 *
 * @param roiImageData - Canvas ImageData对象
 * @returns 清晰度分数 (0-100)
 */
export function calculateROISharpness(roiImageData: ImageData): number {
  return computeSharpness(roiImageData.data, roiImageData.width, roiImageData.height);
}

/**
 * 完整 ROI 质量评估（清晰度 + 亮度 + 对比度）
 *
 * @param roiImageData - Canvas ImageData对象
 * @param minBrightness - 亮度下限，默认 30（0-255）
 * @param minContrast - 对比度下限，默认 15（灰度标准差）
 * @returns ROIQualityResult
 */
export function evaluateROIQuality(
  roiImageData: ImageData,
  minBrightness = 30,
  minContrast = 15,
): ROIQualityResult {
  const { data, width, height } = roiImageData;
  if (width <= 2 || height <= 2) {
    return { sharpness: 0, brightness: 0, contrast: 0, brightEnough: false, contrastEnough: false, qualityOk: false };
  }

  const gray = toGrayscale(data, width, height);
  const variance = laplacianVariance(gray, width, height);
  const penalty = jpegBlockPenalty(gray, width, height);
  const sharpness = Math.min(100, variance / 10) * penalty;
  const { brightness, contrast } = brightnessContrast(gray);

  const brightEnough = brightness >= minBrightness;
  const contrastEnough = contrast >= minContrast;
  const qualityOk = brightEnough && contrastEnough && sharpness > 5;

  return { sharpness, brightness, contrast, brightEnough, contrastEnough, qualityOk };
}

/**
 * 异步计算图像清晰度（避免阻塞主线程，用于实时检测）
 *
 * @param imageData - Canvas ImageData对象
 * @returns Promise<清晰度分数 (0-100)>
 */
export function calculateSharpnessAsync(imageData: ImageData): Promise<number> {
  return new Promise((resolve) => {
    const calculate = () => {
      resolve(computeSharpness(imageData.data, imageData.width, imageData.height));
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      (window as any).requestIdleCallback(calculate, { timeout: 1000 });
    } else {
      setTimeout(calculate, 0);
    }
  });
}
