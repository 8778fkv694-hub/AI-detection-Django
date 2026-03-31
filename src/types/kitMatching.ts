/**
 * 齐套化检测类型定义
 *
 * 用途：定义齐套化检测相关的数据结构和类型
 * 位置：src/types/kitMatching.ts
 */

/**
 * ROI 截图数据结构
 */
export interface ROISnapshot {
  /** 检测类别 */
  class: string;
  /** 截图 base64 数据 */
  image: string;
  /** 时间戳 */
  timestamp: number;
  /** 置信度（可选） */
  confidence?: number;
  /** 清晰度评分（可选） */
  sharpness?: number;
  /** ROI 区域面积（可选） */
  roiArea?: number;
  /** 图像宽度（可选） */
  imageWidth?: number;
  /** 图像高度（可选） */
  imageHeight?: number;
  /** 综合评分（可选） */
  compositeScore?: number;
}

/**
 * 检测统计数据
 */
export interface DetectionStats {
  /** 总检测次数 */
  totalDetections: number;
  /** 合格数量 */
  qualifiedCount: number;
  /** 存疑数量 */
  unqualifiedCount: number;
  /** 上次检测时间 */
  lastDetectionTime: number;
}

/**
 * 模型不可用对话框状态
 */
export interface ModelUnavailableDialogState {
  /** 是否显示 */
  isOpen: boolean;
  /** 标题 */
  title: string;
  /** 消息内容 */
  message: string;
}

/**
 * 齐套化检测结果
 */
export interface KitMatchingResult {
  /** 是否齐套完整 */
  isComplete: boolean;
  /** 已检测类别 */
  detectedClasses: string[];
  /** 缺失类别 */
  missingClasses: string[];
  /** 完成度百分比 */
  completionPercentage: number;
  /** ROI 截图列表 */
  roiSnapshots: ROISnapshot[];
}

/**
 * 齐套化工作流状态
 */
export type KitWorkflowState =
  | 'idle'                    // 空闲
  | 'detecting'               // 检测中
  | 'post_detection_delay'    // 检测完成后延时
  | 'completed'               // 已完成
  | 'cooldown';               // 冷却中

/**
 * 综合评分参数
 */
export interface CompositeScoreParams {
  /** 置信度 */
  confidence: number;
  /** 清晰度 */
  sharpness: number;
  /** ROI 面积 */
  roiArea: number;
  /** 图像宽度 */
  imageWidth: number;
  /** 图像高度 */
  imageHeight: number;
}
