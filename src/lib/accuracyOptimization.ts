/**
 * AI检测准确性优化配置
 * 提供更精确的检测参数和评分机制
 */

export interface AccuracyConfig {
  // 检测阈值配置
  detectionThresholds: {
    confidence: number;      // 置信度阈值
    iou: number;            // IOU阈值
    minScore: number;       // 最低分数
    maxScore: number;       // 最高分数
  };
  
  // PPE检测权重
  ppeWeights: {
    mask: number;           // 口罩权重
    hat: number;            // 帽子权重
    suit: number;           // 洁净服权重
  };
  
  // 评分标准
  scoreThresholds: {
    excellent: number;      // 优秀分数阈值
    good: number;           // 良好分数阈值
    acceptable: number;     // 可接受分数阈值
    poor: number;           // 差分数阈值
  };
  
  // 稳定性配置
  stability: {
    enableSmoothing: boolean;    // 启用分数平滑
    smoothingFactor: number;     // 平滑因子
    maxVariance: number;         // 最大方差
  };
}

// 默认准确性优化配置
export const DEFAULT_ACCURACY_CONFIG: AccuracyConfig = {
  detectionThresholds: {
    confidence: 0.5,        // 提高置信度阈值
    iou: 0.4,              // 提高IOU阈值
    minScore: 25,           // 最低25分
    maxScore: 90            // 最高90分
  },
  
  ppeWeights: {
    mask: 30,               // 口罩30分
    hat: 30,                // 帽子30分
    suit: 40                // 洁净服40分
  },
  
  scoreThresholds: {
    excellent: 85,          // 85分以上为优秀
    good: 75,               // 75分以上为良好
    acceptable: 60,         // 60分以上为可接受
    poor: 40                // 40分以下为差
  },
  
  stability: {
    enableSmoothing: true,  // 启用分数平滑
    smoothingFactor: 0.3,   // 平滑因子30%
    maxVariance: 20         // 最大方差20分
  }
};

// 高精度配置（适合对准确性要求极高的场景）
export const HIGH_ACCURACY_CONFIG: AccuracyConfig = {
  detectionThresholds: {
    confidence: 0.6,        // 更高置信度
    iou: 0.5,              // 更高IOU
    minScore: 30,           // 最低30分
    maxScore: 85            // 最高85分
  },
  
  ppeWeights: {
    mask: 35,               // 口罩35分
    hat: 35,                // 帽子35分
    suit: 30                // 洁净服30分
  },
  
  scoreThresholds: {
    excellent: 80,          // 80分以上为优秀
    good: 70,               // 70分以上为良好
    acceptable: 55,         // 55分以上为可接受
    poor: 35                // 35分以下为差
  },
  
  stability: {
    enableSmoothing: true,  // 启用分数平滑
    smoothingFactor: 0.2,   // 平滑因子20%
    maxVariance: 15         // 最大方差15分
  }
};

// 快速检测配置（适合实时性要求高的场景）
export const FAST_DETECTION_CONFIG: AccuracyConfig = {
  detectionThresholds: {
    confidence: 0.4,        // 较低置信度
    iou: 0.3,              // 较低IOU
    minScore: 20,           // 最低20分
    maxScore: 95            // 最高95分
  },
  
  ppeWeights: {
    mask: 25,               // 口罩25分
    hat: 25,                // 帽子25分
    suit: 50                // 洁净服50分
  },
  
  scoreThresholds: {
    excellent: 90,          // 90分以上为优秀
    good: 80,               // 80分以上为良好
    acceptable: 65,         // 65分以上为可接受
    poor: 45                // 45分以下为差
  },
  
  stability: {
    enableSmoothing: false, // 不启用分数平滑
    smoothingFactor: 0,     // 无平滑
    maxVariance: 30         // 最大方差30分
  }
};

/**
 * 应用准确性优化配置
 */
export function applyAccuracyOptimization(
  score: number, 
  config: AccuracyConfig = DEFAULT_ACCURACY_CONFIG
): number {
  // 应用分数范围限制
  let optimizedScore = Math.max(score, config.detectionThresholds.minScore);
  optimizedScore = Math.min(optimizedScore, config.detectionThresholds.maxScore);
  
  // 应用分数平滑（如果启用）
  if (config.stability.enableSmoothing) {
    // 这里可以实现基于历史分数的平滑算法
    // 暂时返回优化后的分数
  }
  
  return Math.round(optimizedScore);
}

/**
 * 根据分数确定质量等级
 */
export function determineQualityLevel(
  score: number, 
  config: AccuracyConfig = DEFAULT_ACCURACY_CONFIG
): '合格' | '存疑' | '需复检' {
  if (score >= config.scoreThresholds.excellent) {
    return '合格';
  } else if (score >= config.scoreThresholds.acceptable) {
    return '需复检';
  } else {
    return '存疑';
  }
}

/**
 * 生成详细的分析报告
 */
export function generateAnalysisReport(
  score: number,
  detectedIssues: string[],
  config: AccuracyConfig = DEFAULT_ACCURACY_CONFIG
): string {
  const qualityLevel = determineQualityLevel(score, config);
  const baseReport = `AI分析结果: ${qualityLevel} (${score}分)`;
  
  if (detectedIssues.length > 0) {
    return `${baseReport} - 发现问题: ${detectedIssues.join(', ')}`;
  }
  
  return baseReport;
}
