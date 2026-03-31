/**
 * 图片质量分析器
 * 用于分析图片质量并推荐预处理方案
 */

export interface ImageQualityMetrics {
  // 基础质量指标
  brightness: number;        // 亮度 (0-255)
  contrast: number;         // 对比度 (0-100)
  sharpness: number;       // 清晰度 (0-100)
  noise: number;           // 噪点程度 (0-100)
  
  // 几何特征
  rotation: number;        // 旋转角度 (-180到180)
  skew: number;           // 倾斜度 (0-100)
  perspective: number;     // 透视变形程度 (0-100)
  
  // 色彩特征
  colorVariance: number;   // 色彩变化度 (0-100)
  saturation: number;      // 饱和度 (0-100)
  
  // 二维码特定指标
  qrDetectability: number; // 二维码可检测性 (0-100)
  edgeClarity: number;     // 边缘清晰度 (0-100)
  backgroundComplexity: number; // 背景复杂度 (0-100)
}

export interface PreprocessingRecommendation {
  // 推荐方案
  recommendedPreset: 'brightness' | 'contrast' | 'sharpness' | 'rotation' | 'denoise' | 'binary' | 'auto';
  confidence: number;      // 推荐置信度 (0-100)
  
  // 具体参数
  parameters: {
    brightness?: number;
    contrast?: number;
    sharpness?: number;
    rotation?: number;
    binaryThreshold?: number;
    denoise?: boolean;
    grayscale?: boolean;
  };
  
  // 预期效果
  expectedImprovement: number; // 预期改善程度 (0-100)
  successProbability: number;  // 成功检测概率 (0-100)
}

export class ImageQualityAnalyzer {
  /**
   * 分析图片质量
   */
  static async analyzeImageQuality(imageData: ImageData): Promise<ImageQualityMetrics> {
    const metrics: ImageQualityMetrics = {
      brightness: 0,
      contrast: 0,
      sharpness: 0,
      noise: 0,
      rotation: 0,
      skew: 0,
      perspective: 0,
      colorVariance: 0,
      saturation: 0,
      qrDetectability: 0,
      edgeClarity: 0,
      backgroundComplexity: 0
    };

    // 1. 基础质量分析
    metrics.brightness = this.calculateBrightness(imageData);
    metrics.contrast = this.calculateContrast(imageData);
    metrics.sharpness = this.calculateSharpness(imageData);
    metrics.noise = this.calculateNoise(imageData);

    // 2. 几何特征分析
    metrics.rotation = this.detectRotation(imageData);
    metrics.skew = this.calculateSkew(imageData);
    metrics.perspective = this.calculatePerspective(imageData);

    // 3. 色彩特征分析
    metrics.colorVariance = this.calculateColorVariance(imageData);
    metrics.saturation = this.calculateSaturation(imageData);

    // 4. 二维码特定分析
    metrics.qrDetectability = this.calculateQRDetectability(imageData);
    metrics.edgeClarity = this.calculateEdgeClarity(imageData);
    metrics.backgroundComplexity = this.calculateBackgroundComplexity(imageData);

    return metrics;
  }

  /**
   * 生成预处理推荐
   */
  static generateRecommendation(metrics: ImageQualityMetrics): PreprocessingRecommendation {
    const recommendations: PreprocessingRecommendation[] = [];
    
    // 根据各项指标生成推荐
    if (metrics.brightness < 50 || metrics.brightness > 200) {
      recommendations.push({
        recommendedPreset: 'brightness',
        confidence: Math.min(90, Math.abs(metrics.brightness - 128) * 0.5),
        parameters: {
          brightness: metrics.brightness < 50 ? 30 : -30
        },
        expectedImprovement: 25,
        successProbability: 70
      });
    }

    if (metrics.contrast < 30) {
      recommendations.push({
        recommendedPreset: 'contrast',
        confidence: 85,
        parameters: {
          contrast: 40
        },
        expectedImprovement: 35,
        successProbability: 80
      });
    }

    if (metrics.sharpness < 40) {
      recommendations.push({
        recommendedPreset: 'sharpness',
        confidence: 80,
        parameters: {
          sharpness: 60
        },
        expectedImprovement: 30,
        successProbability: 75
      });
    }

    if (Math.abs(metrics.rotation) > 5) {
      recommendations.push({
        recommendedPreset: 'rotation',
        confidence: 90,
        parameters: {
          rotation: -metrics.rotation
        },
        expectedImprovement: 40,
        successProbability: 85
      });
    }

    if (metrics.noise > 60) {
      recommendations.push({
        recommendedPreset: 'denoise',
        confidence: 75,
        parameters: {
          denoise: true
        },
        expectedImprovement: 20,
        successProbability: 65
      });
    }

    if (metrics.qrDetectability < 50) {
      recommendations.push({
        recommendedPreset: 'binary',
        confidence: 70,
        parameters: {
          grayscale: true,
          binaryThreshold: 128
        },
        expectedImprovement: 30,
        successProbability: 70
      });
    }

    // 选择最佳推荐
    const bestRecommendation = recommendations.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );

    // 如果没有特定推荐，使用自动优化
    if (recommendations.length === 0) {
      return {
        recommendedPreset: 'auto',
        confidence: 60,
        parameters: {
          brightness: metrics.brightness < 100 ? 20 : -20,
          contrast: 30,
          sharpness: 40
        },
        expectedImprovement: 20,
        successProbability: 60
      };
    }

    return bestRecommendation;
  }

  /**
   * 计算亮度
   */
  private static calculateBrightness(imageData: ImageData): number {
    const data = imageData.data;
    let sum = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      sum += (r + g + b) / 3;
    }
    
    return sum / (data.length / 4);
  }

  /**
   * 计算对比度
   */
  private static calculateContrast(imageData: ImageData): number {
    const data = imageData.data;
    const brightness = this.calculateBrightness(imageData);
    let variance = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const pixelBrightness = (r + g + b) / 3;
      variance += Math.pow(pixelBrightness - brightness, 2);
    }
    
    const standardDeviation = Math.sqrt(variance / (data.length / 4));
    return Math.min(100, (standardDeviation / 128) * 100);
  }

  /**
   * 计算清晰度（使用拉普拉斯算子）
   */
  private static calculateSharpness(imageData: ImageData): number {
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
    
    return Math.min(100, (sharpness / (width * height)) * 0.1);
  }

  /**
   * 计算噪点程度
   */
  private static calculateNoise(imageData: ImageData): number {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    let noise = 0;
    
    // 转换为灰度
    const grayData = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      grayData[i / 4] = (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    
    // 计算局部方差
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const neighbors = [
          grayData[idx - 1], grayData[idx + 1],
          grayData[idx - width], grayData[idx + width]
        ];
        const mean = neighbors.reduce((a, b) => a + b) / 4;
        const variance = neighbors.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / 4;
        noise += variance;
      }
    }
    
    return Math.min(100, (noise / (width * height)) * 0.01);
  }

  /**
   * 检测旋转角度（简化版）
   */
  private static detectRotation(imageData: ImageData): number {
    // 这里使用简化的边缘检测来估算旋转角度
    // 实际应用中可以使用更复杂的算法如Hough变换
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    // 转换为灰度
    const grayData = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      grayData[i / 4] = (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    
    // 简化的边缘检测
    let horizontalEdges = 0;
    let verticalEdges = 0;
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const horizontalGradient = Math.abs(grayData[idx + 1] - grayData[idx - 1]);
        const verticalGradient = Math.abs(grayData[idx + width] - grayData[idx - width]);
        
        horizontalEdges += horizontalGradient;
        verticalEdges += verticalGradient;
      }
    }
    
    // 根据边缘方向估算旋转角度
    const ratio = horizontalEdges / verticalEdges;
    return Math.atan(ratio - 1) * (180 / Math.PI);
  }

  /**
   * 计算倾斜度
   */
  private static calculateSkew(imageData: ImageData): number {
    // 简化实现，实际可以使用更复杂的算法
    return Math.abs(this.detectRotation(imageData)) * 2;
  }

  /**
   * 计算透视变形程度
   */
  private static calculatePerspective(imageData: ImageData): number {
    // 简化实现，检测图像边缘的直线性
    return Math.random() * 30; // 占位实现
  }

  /**
   * 计算色彩变化度
   */
  private static calculateColorVariance(imageData: ImageData): number {
    const data = imageData.data;
    let variance = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      variance += Math.pow(r - g, 2) + Math.pow(g - b, 2) + Math.pow(b - r, 2);
    }
    
    return Math.min(100, (variance / (data.length / 4)) * 0.01);
  }

  /**
   * 计算饱和度
   */
  private static calculateSaturation(imageData: ImageData): number {
    const data = imageData.data;
    let totalSaturation = 0;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i] / 255;
      const g = data[i + 1] / 255;
      const b = data[i + 2] / 255;
      
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      
      totalSaturation += saturation;
    }
    
    return (totalSaturation / (data.length / 4)) * 100;
  }

  /**
   * 计算二维码可检测性
   */
  private static calculateQRDetectability(imageData: ImageData): number {
    const sharpness = this.calculateSharpness(imageData);
    const contrast = this.calculateContrast(imageData);
    const noise = this.calculateNoise(imageData);
    
    // 综合评分
    return Math.max(0, Math.min(100, 
      (sharpness * 0.4 + contrast * 0.4 + (100 - noise) * 0.2)
    ));
  }

  /**
   * 计算边缘清晰度
   */
  private static calculateEdgeClarity(imageData: ImageData): number {
    return this.calculateSharpness(imageData);
  }

  /**
   * 计算背景复杂度
   */
  private static calculateBackgroundComplexity(imageData: ImageData): number {
    const colorVariance = this.calculateColorVariance(imageData);
    const noise = this.calculateNoise(imageData);
    
    return Math.min(100, (colorVariance * 0.6 + noise * 0.4));
  }
}
