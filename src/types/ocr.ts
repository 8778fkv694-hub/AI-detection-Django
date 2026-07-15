/**
 * OCR Detection Types
 *
 * 用途：定义 OCR 检测相关的所有类型
 * 使用位置：OCRDetectionScreen, OCRErrorPreventionScreen 等 OCR 相关页面
 */

import type { InspectionResult } from './index';
import type { DetectionHistoryItem } from '@/state/ocrDetectionStore';

// OCR 识别结果
export interface OCRResult {
  text: string;
  confidence: number;
  bbox: number[][];
}

// 条码/二维码检测结果
export interface BarcodeResult {
  detectedText: string;
  expectedText: string;
  matchMode: 'contains' | 'exact';
  matched: boolean;
  confidence: number;
  targetRoi?: string;
  matchedRois?: string[];
  type?: 'qr' | 'barcode';
  location?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  // 二维码识别的详细信息
  qrCodeData?: string; // 二维码中的实际数据
  qrCodeType?: string; // 二维码类型
  qrCodeSize?: { width: number; height: number }; // 二维码尺寸
  qrCodePosition?: { x: number; y: number }; // 二维码位置
  // 重试机制相关信息
  retryCount?: number; // 重试次数
  isRetryEnabled?: boolean; // 是否启用重试
}

// OCR 测试完整结果
export interface TestResult {
  success: boolean;
  full_text: string;
  detailed_results: OCRResult[];
  text_count: number;
  validationWarnings?: string[];
  timestamp?: string;
  model_used?: string;
  error?: string;
  detected_orientation?: number; // 检测到的文字方向（度）
  detected_orientation_degrees?: number; // 检测到的文字方向（精确度）
  orientation_match?: boolean;
  ai_analysis?: {
    filtered_text: string;
    keywords_found: string[];
    confidence_score: number;
    isQualified?: boolean;
    matchStatus?: 'qualified' | 'unqualified' | 'none';
    keyword_match_details?: Array<{
      keyword: string;
      textMatched: boolean;
      orientationMatched: boolean;
      confidenceMatched: boolean;
      overallMatched: boolean;
      detectedOrientation?: number;
      expectedOrientation?: number;
      actualCount?: number;  // 实际出现次数
      requiredCount?: number; // 需要出现的次数
      keywordType?: 'positive' | 'negative'; // 关键词类型
      targetRoi?: string;
    }>;
  };
  barcode_analysis?: {
    enabled: boolean;
    results: BarcodeResult[];
    overall_match: boolean;
    // 二维码检测的汇总信息
    total_qr_codes_detected?: number; // 检测到的二维码总数
    qr_codes_data?: string[]; // 所有检测到的二维码数据
    detection_summary?: string; // 检测结果摘要
    // 重试机制相关信息
    retry_summary?: {
      totalRetries: number;
      successfulDetections: number;
      failedDetections: number;
    };
    isRetryEnabled?: boolean; // 是否启用了重试机制
  };
}

// 扩展历史记录类型以包含 ocrResult 和 aiResult 用于显示
export type ExtendedHistoryItem = DetectionHistoryItem & {
  ocrResult?: any;
  aiResult?: InspectionResult | null;
  imageBase64?: string;
};

// 每个关键词的独立配置
export interface KeywordConfig {
  id: string;
  text: string;
  confidence: number;
  expectedOrientation?: 0 | 90 | 180 | 270;
  orientationTolerance?: number;
  type?: 'positive' | 'negative';  // 关键词类型：positive=必须出现，negative=排除清单（出现就存疑）
  requiredCount?: number;          // 需要出现的次数（默认1，negative类型无效）
  targetRoi?: string;               // 关联的 ROI 目标（Label
}

export interface BarcodeConfig {
  id: string;
  expectedText: string;
  matchMode: 'contains' | 'exact';
  enabled: boolean;
  targetRoi?: string;               // 关联的 ROI 目标（Label）
}

// OCR 模板
export interface OCRTemplate {
  id: string;
  name: string;
  keywords: string;
  keywordConfigs: KeywordConfig[];
  keywordMatchMode: 'contains' | 'exact';
  minConfidence: number;
  createdAt: string;
  updatedAt?: string;
  description?: string;
  isActive?: boolean;
}

export interface BarcodeTemplate {
  id: string;
  name: string;
  configs: BarcodeConfig[];
  createdAt: string;
  updatedAt?: string;
  description?: string;
  isActive?: boolean;
}

// 预处理方法
export interface PreprocessingMethod {
  type: string;
  intensity: 'light' | 'moderate' | 'aggressive';
  parameters: Record<string, number>;
}

// 预处理方案配置
export interface PreprocessingPreset {
  id: string;
  name: string;
  description: string;
  methods: PreprocessingMethod[];
}
